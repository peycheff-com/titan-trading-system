use parking_lot::RwLock;
use rust_decimal::prelude::ToPrimitive;
use rust_decimal::Decimal;
use std::sync::Arc;
use tracing::{error, info, warn};

use crate::context::ExecutionContext;
use crate::drift_detector::DriftDetector;
use crate::exchange::adapter::OrderRequest;
use crate::exchange::router::ExecutionRouter;
use crate::metrics;
use crate::model::TradeRecord;
use crate::model::{FillReport, Intent, IntentType, Side};
use crate::order_manager::OrderManager;
use crate::risk_guard::RiskGuard;
use crate::shadow_state::{ExecutionEvent, ShadowState};
use crate::simulation_engine::SimulationEngine;
use chrono::Utc;

/// usage:
/// let pipeline = ExecutionPipeline::new(...deps...);
/// pipeline.handle_intent(intent).await;
pub struct ExecutionPipeline {
    shadow_state: Arc<RwLock<ShadowState>>,
    order_manager: OrderManager,
    router: Arc<ExecutionRouter>,
    simulation_engine: Arc<SimulationEngine>,
    risk_guard: Arc<RiskGuard>,
    ctx: Arc<ExecutionContext>,
    freshness_threshold: u64,
    drift_detector: Arc<DriftDetector>,
}

use crate::exposure::ExposureMetrics;

pub struct PipelineResult {
    pub shadow_fill: Option<FillReport>,
    pub events: Vec<ExecutionEvent>,
    pub exposure: Option<ExposureMetrics>,
    pub fill_reports: Vec<(String, FillReport)>, // Exchange -> Report
}

impl ExecutionPipeline {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        shadow_state: Arc<RwLock<ShadowState>>,
        order_manager: OrderManager,
        router: Arc<ExecutionRouter>,
        simulation_engine: Arc<SimulationEngine>,
        risk_guard: Arc<RiskGuard>,
        ctx: Arc<ExecutionContext>,
        freshness_threshold: u64,
        drift_detector: Arc<DriftDetector>,
    ) -> Self {
        Self {
            shadow_state,
            order_manager,
            router,
            simulation_engine,
            risk_guard,
            ctx,
            freshness_threshold,
            drift_detector,
        }
    }

    /// Process a single Intent through the full execution lifecycle.
    pub async fn process_intent(
        &self,
        intent: Intent,
        correlation_id: String,
    ) -> Result<PipelineResult, String> {
        let mut pipeline_result = PipelineResult {
            shadow_fill: None,
            events: Vec::new(),
            exposure: None,
            fill_reports: Vec::new(),
        };

        // --- RISK GUARD CHECK ---
        if let Err(reason) = self.risk_guard.check_pre_trade(&intent) {
            let msg = format!("❌ RISK REJECTION: {}", reason);
            error!(correlation_id = %correlation_id, signal_id = %intent.signal_id, "{}", msg);
            metrics::inc_risk_rejections();
            return Err(msg);
        }

        // Lock state for writing
        let processed_intent = {
            let mut state = self.shadow_state.write();
            state.process_intent(intent.clone())
        };

        // Enforce Timestamp Freshness
        let now = self.ctx.time.now_millis();
        if now - processed_intent.t_signal > self.freshness_threshold as i64 {
            let msg = format!(
                "Intent EXPIRED: {} ms latency",
                now - processed_intent.t_signal
            );
            error!("❌ {}. Dropping.", msg);
            metrics::inc_expired_intents();
            {
                let mut state = self.shadow_state.write();
                state.expire_intent(
                    &processed_intent.signal_id,
                    format!("Latency {} ms", now - processed_intent.t_signal),
                );
            }
            return Err(msg);
        }

        // --- SHADOW EXECUTION (Concurrent side-effect) ---
        pipeline_result.shadow_fill = self.simulation_engine.simulate_execution(&processed_intent);

        let side = self.infer_side(&processed_intent);

        // Order Manager Decision
        let decision = {
            let order_params = crate::model::OrderParams {
                signal_id: processed_intent.signal_id.clone(),
                symbol: processed_intent.symbol.clone(),
                side: side.clone(),
                size: processed_intent.size,
                limit_price: Some(
                    processed_intent
                        .entry_zone
                        .first()
                        .cloned()
                        .unwrap_or_default(),
                ),
                stop_loss: Some(processed_intent.stop_loss),
                take_profits: Some(processed_intent.take_profits.clone()),
                signal_type: Some(format!("{:?}", processed_intent.intent_type)),
                expected_profit_pct: None,
            };
            self.order_manager.decide_order_type(&order_params)
        };
        let t_decision = self.ctx.time.now_millis();

        let order_req = OrderRequest {
            symbol: processed_intent.symbol.replace("/", ""),
            side: side.clone(),
            order_type: decision.order_type.clone(),
            quantity: processed_intent.size,
            price: decision.limit_price,
            stop_price: None,
            client_order_id: format!("{}-{}", processed_intent.signal_id, self.ctx.id.new_id()),
            reduce_only: decision.reduce_only,
        };

        info!(
            correlation_id = %correlation_id,
            "🚀 Executing Real Order: {:?} {} @ {:?}",
            order_req.side,
            order_req.symbol,
            order_req.price
        );

        let results = self
            .router
            .execute(&processed_intent, order_req.clone())
            .await;

        for (exchange_name, request, result) in results {
            match result {
                Ok(response) => {
                    info!(
                        correlation_id = %correlation_id,
                        "✅ [{}] Order Placed: ID {}",
                        exchange_name,
                        response.order_id
                    );

                    // 0. Record Child Order (ShadowState) - Always track, even if Pending
                    {
                        let mut state = self.shadow_state.write();
                        state.record_child_order(
                            &processed_intent.signal_id,
                            exchange_name.clone(),
                            request.client_order_id.clone(),
                            response.order_id.clone(),
                            request.quantity, // We record Attempted Quantity (Child Size)
                        );
                    }

                    let fill_price = response
                        .avg_price
                        .unwrap_or(decision.limit_price.unwrap_or_default());

                    // --- SLIPPAGE CHECK ---
                    let expected_price = decision
                        .limit_price
                        .or(processed_intent.entry_zone.first().cloned())
                        .unwrap_or(Decimal::ZERO);
                    if expected_price > Decimal::ZERO && fill_price > Decimal::ZERO {
                        let diff = (fill_price - expected_price).abs();
                        let slippage_ratio = diff / expected_price;
                        let slippage_bps = (slippage_ratio * rust_decimal::Decimal::from(10000))
                            .to_u32()
                            .unwrap_or(0);

                        if slippage_bps > 0 {
                            self.risk_guard.record_slippage(slippage_bps);
                        }
                    }

                    if response.executed_qty <= Decimal::ZERO || fill_price <= Decimal::ZERO {
                        warn!(
                            correlation_id = %correlation_id,
                            executed_qty = %response.executed_qty,
                            fill_price = %fill_price,
                            "Order Placed but PENDING/Zero Fill - Tracking in ShadowState"
                        );
                        // We continue here, but we MUST add a FillReport for the ACK???
                        // No, FillReport implies a FILL.
                        // But we might want to emit an "ExecutionReport" saying "New/Pending".
                        // For Phase 4, we stick to Fills-only for events, but State has it.
                        continue;
                    }

                    let (events_to_publish, exposure) = {
                        let mut state = self.shadow_state.write();
                        let events = state.confirm_execution(
                            &processed_intent.signal_id,
                            &response.order_id, // Idempotency Key
                            fill_price,
                            response.executed_qty,
                            true,
                            response.fee.unwrap_or(Decimal::ZERO),
                            response.fee_asset.clone().unwrap_or("USDT".to_string()),
                            &exchange_name, // Pass exchange name
                        );
                        let exposure = state.calculate_exposure();
                        (events, exposure)
                    };

                    pipeline_result.events.extend(events_to_publish);
                    pipeline_result.exposure = Some(exposure);

                    let fill_report = FillReport {
                        fill_id: response.order_id.clone(),
                        signal_id: processed_intent.signal_id.clone(),
                        symbol: processed_intent.symbol.clone(),
                        side: order_req.side.clone(),
                        price: fill_price,
                        qty: response.executed_qty,
                        fee: Decimal::ZERO,
                        fee_currency: "USDT".to_string(),
                        t_signal: processed_intent.t_signal,
                        t_ingress: processed_intent
                            .t_ingress
                            .unwrap_or(self.ctx.time.now_millis()),
                        t_decision,
                        t_ack: response.t_ack,
                        t_exchange: response.t_exchange.unwrap_or(self.ctx.time.now_millis()),
                        client_order_id: request.client_order_id.clone(),
                        execution_id: response.order_id.clone(),
                    };

                    pipeline_result
                        .fill_reports
                        .push((exchange_name, fill_report));

                    // --- METRICS RECORDING (Phase 3) ---
                    // 1. End-to-End Latency
                    let now = self.ctx.time.now_millis();
                    let latency_ms = now - processed_intent.t_signal;
                    let latency_sec = latency_ms as f64 / 1000.0;
                    metrics::observe_order_latency(latency_sec);

                    // 2. Slippage
                    if let Some(target) = decision
                        .limit_price
                        .or(processed_intent.entry_zone.first().cloned())
                    {
                        if target > Decimal::ZERO && fill_price > Decimal::ZERO {
                            let diff = (fill_price - target).abs();
                            let slip_ratio = diff / target;
                            // Convert to BPS (f64)
                            let slip_bps =
                                (slip_ratio * Decimal::from(10000)).to_f64().unwrap_or(0.0);
                            metrics::observe_slippage(slip_bps);
                        }
                    }

                    // 3. Filled Orders
                    metrics::inc_filled_orders();

                    // 4. Drift Analysis
                    // Construct a proxy TradeRecord for analysis (since we just opened/traded)
                    let trade_record = TradeRecord {
                        signal_id: processed_intent.signal_id.clone(),
                        symbol: processed_intent.symbol.clone(),
                        side: crate::model::Side::Buy, // Dummy, ignored by detector
                        entry_price: fill_price,
                        exit_price: Decimal::ZERO,
                        size: response.executed_qty,
                        pnl: Decimal::ZERO,
                        pnl_pct: Decimal::ZERO,
                        fee: response.fee.unwrap_or(Decimal::ZERO),
                        fee_asset: response.fee_asset.clone().unwrap_or_default(),
                        opened_at: Utc::now(), // Approx execution time
                        closed_at: Utc::now(),
                        close_reason: "Open".to_string(),
                        metadata: None,
                    };

                    let drifts = self
                        .drift_detector
                        .analyze(&processed_intent, &trade_record);
                    for drift in drifts {
                        warn!("🚨 DRIFT DETECTED: {:?}", drift);
                        // Potential: Publish to Drift Topic
                    }
                }
                Err(e) => {
                    error!("❌ [{}] Execution Failed: {}", exchange_name, e);
                }
            }
        }

        Ok(pipeline_result)
    }

    fn infer_side(&self, intent: &Intent) -> Side {
        match intent.intent_type {
            IntentType::BuySetup => Side::Buy,
            IntentType::SellSetup => Side::Sell,
            IntentType::CloseLong => Side::Sell,
            IntentType::CloseShort => Side::Buy,
            IntentType::Close => {
                if intent.direction > 0 {
                    Side::Buy
                } else {
                    Side::Sell
                }
            }
            IntentType::ForceSync => {
                if intent.direction > 0 {
                    Side::Buy
                } else {
                    Side::Sell
                }
            }
        }
    }
}
