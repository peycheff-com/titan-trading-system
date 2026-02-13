use crate::circuit_breaker::GlobalHalt;
use crate::impact_calculator::{ImpactCalculator, OrderRouting};
use crate::market_data::engine::MarketDataEngine;
use crate::model::{FeeAnalysis, OrderDecision, OrderParams, OrderType, Side};
use rust_decimal::prelude::*;
use rust_decimal::Decimal;
use std::sync::Arc;
use tracing::{info, warn};

// Constants
pub const DEFAULT_MAKER_FEE_PCT: &str = "0.02";
pub const DEFAULT_TAKER_FEE_PCT: &str = "0.05";
pub const DEFAULT_CHASE_TIMEOUT_MS: u64 = 2000;
pub const MIN_PROFIT_MARGIN: &str = "0.001"; // 0.1%
                                             // Taker sniping thresholds
pub const IMBALANCE_THRESHOLD_BUY: &str = "0.6";
pub const IMBALANCE_THRESHOLD_SELL: &str = "-0.6";

#[derive(Debug, Clone)]
pub struct OrderManagerConfig {
    pub maker_fee_pct: Decimal,
    pub taker_fee_pct: Decimal,
    pub chase_timeout_ms: u64,
    pub min_profit_margin: Decimal,
}

impl Default for OrderManagerConfig {
    fn default() -> Self {
        Self {
            maker_fee_pct: Decimal::from_str(DEFAULT_MAKER_FEE_PCT)
                .expect("Invalid maker fee constant"),
            taker_fee_pct: Decimal::from_str(DEFAULT_TAKER_FEE_PCT)
                .expect("Invalid taker fee constant"),
            chase_timeout_ms: DEFAULT_CHASE_TIMEOUT_MS,
            min_profit_margin: Decimal::from_str(MIN_PROFIT_MARGIN)
                .expect("Invalid min profit constant"),
        }
    }
}

#[derive(Clone)]
pub struct OrderManager {
    config: OrderManagerConfig,
    market_data: Arc<MarketDataEngine>,
    impact_calculator: ImpactCalculator,
    global_halt: Arc<GlobalHalt>,
}

impl OrderManager {
    pub fn new(
        config: Option<OrderManagerConfig>,
        market_data: Arc<MarketDataEngine>,
        global_halt: Arc<GlobalHalt>,
    ) -> Self {
        let config = config.unwrap_or_default();

        info!(
            maker_fee_pct = %config.maker_fee_pct,
            taker_fee_pct = %config.taker_fee_pct,
            chase_timeout_ms = config.chase_timeout_ms,
            "OrderManager initialized"
        );

        Self {
            config,
            market_data,
            impact_calculator: ImpactCalculator::new(),
            global_halt,
        }
    }

    /// Assess liquidity quality for a symbol
    /// Returns: (spread_bps, imbalance_ratio)
    /// Imbalance: (BidQty - AskQty) / (BidQty + AskQty) -> Range [-1, 1]
    /// Positive = Buy Pressure, Negative = Sell Pressure
    pub fn assess_liquidity_quality(&self, symbol: &str) -> Option<(Decimal, Decimal)> {
        let ticker = self.market_data.get_ticker(symbol)?;

        let mid_price = (ticker.best_bid + ticker.best_ask) / Decimal::from(2);
        if mid_price.is_zero() {
            return None;
        }

        // Spread BPS
        let spread_diff = ticker.best_ask - ticker.best_bid;
        let spread_bps = (spread_diff / mid_price) * Decimal::from(10000);

        // Imbalance
        let total_qty = ticker.best_bid_qty + ticker.best_ask_qty;
        let diff_qty = ticker.best_bid_qty - ticker.best_ask_qty;

        let imbalance = if total_qty.is_zero() {
            Decimal::ZERO
        } else {
            diff_qty / total_qty
        };

        Some((spread_bps, imbalance))
    }

    pub fn analyze_fees(
        &self,
        expected_profit_pct: Decimal,
        estimated_impact_pct: Decimal,
    ) -> FeeAnalysis {
        let profit_after_maker =
            expected_profit_pct - self.config.maker_fee_pct - estimated_impact_pct;
        let profit_after_taker =
            expected_profit_pct - self.config.taker_fee_pct - estimated_impact_pct;

        FeeAnalysis {
            maker_fee_pct: self.config.maker_fee_pct,
            taker_fee_pct: self.config.taker_fee_pct,
            expected_profit_pct,
            profit_after_maker: expected_profit_pct - self.config.maker_fee_pct,
            profit_after_taker: expected_profit_pct - self.config.taker_fee_pct,
            taker_profitable: profit_after_taker > self.config.min_profit_margin,
            estimated_impact_pct,
            profit_after_impact_maker: profit_after_maker,
            profit_after_impact_taker: profit_after_taker,
        }
    }

    fn is_exit_signal(signal_type: Option<&String>) -> bool {
        match signal_type {
            Some(t) => {
                let upper = t.to_uppercase();
                upper.contains("CLOSE")
                    || upper.contains("EXIT")
                    || upper == "STOP_LOSS"
                    || upper == "TAKE_PROFIT"
            }
            None => false,
        }
    }

    pub fn decide_order_type(&self, params: &OrderParams) -> OrderDecision {
        // --- 0. SAFETY CHECK: GLOBAL HALT ---
        if self.global_halt.is_halted() {
            warn!("⛔ ORDER REJECTED: SYSTEM HALTED");
            return OrderDecision {
                order_type: OrderType::Limit, // Dummy
                post_only: true,
                reduce_only: true,
                limit_price: None,
                reason: "SYSTEM_HALTED".to_string(),
                fee_analysis: None,
            };
        }

        let reduce_only = Self::is_exit_signal(params.signal_type.as_ref());

        // Default decision: Maker order
        let mut decision = OrderDecision {
            order_type: OrderType::Limit,
            post_only: true,
            reduce_only,
            limit_price: params.limit_price,
            reason: "DEFAULT_MAKER".to_string(),
            fee_analysis: None,
        };

        // --- IMPACT ANALYSIS ---
        // --- IMPACT ANALYSIS ---
        // Simplified notional calculation (size * price). using Limit price if available or best ask
        let mut exec_price = params.limit_price.unwrap_or(Decimal::ZERO);

        // If market order (price 0), try to get mid price
        if exec_price.is_zero()
            && let Some(ticker) = self.market_data.get_ticker(&params.symbol) {
                exec_price = (ticker.best_bid + ticker.best_ask) / Decimal::from(2);
            }

        let notional = if !exec_price.is_zero() {
            (params.size * exec_price).to_f64().unwrap_or(0.0)
        } else {
            // Fallback if no price known, assume 0 impact
            0.0
        };

        let mut estimated_impact_bps = 0.0;

        if notional > 0.0 {
            let impact_est = self.impact_calculator.estimate_impact(
                &params.symbol,
                notional,
                None, // VolState not yet available in Rust
            );
            estimated_impact_bps = impact_est.impact_bps;

            if !impact_est.feasible {
                decision.reason = format!("REJECTED_IMPACT: {:.1}bps", impact_est.impact_bps);
                decision.order_type = OrderType::Limit; // Default to Limit but caller should check reason
                warn!("Impact Rejection: {}", decision.reason);
                // In a real system we might return a Result or Option, but here we flag via reason.
                // Or force PostOnly to be safe
                decision.post_only = true;
                return decision;
            }

            // Enforce routing based on impact
            match impact_est.recommended_routing {
                OrderRouting::PostOnly => {
                    decision.post_only = true;
                    // decision.reason += " (Impact: PostOnly)";
                }
                OrderRouting::Limit => {
                    // Standard
                }
                OrderRouting::IOC => {
                    if decision.order_type == OrderType::Market {
                        // Allowed to be IOC/Market
                    }
                }
                OrderRouting::Rejected => {
                    decision.post_only = true; // Fallback
                }
            }
        }

        // --- EXECUTION ALPHA: LIQUIDITY SNIPING ---
        if let Some((spread_bps, imbalance)) = self.assess_liquidity_quality(&params.symbol) {
            info!(
                symbol = %params.symbol,
                spread_bps = %spread_bps,
                imbalance = %imbalance,
                "Liquidity Analysis"
            );

            // 1. Wide Spread Protocol (> 10 bps) -> FORCE MAKER
            // Don't cross wide spreads.
            if spread_bps > Decimal::from(10) {
                decision.reason = format!("WIDE_SPREAD_MAKER: {}bps", spread_bps);
                decision.post_only = true;
                return decision;
            }

            // 2. Imbalance Sniping (FOMO / Panic)
            // If we are Buying and Imbalance > 0.6 (Strong Buy Pressure), liquidity is fleeting.
            // Switch to TAKER (Market or Aggressive Limit) to swipe before it's gone.
            let imb_buy_thresh =
                Decimal::from_str(IMBALANCE_THRESHOLD_BUY).unwrap_or(Decimal::new(6, 1));
            if params.side == Side::Buy && imbalance > imb_buy_thresh {
                decision.order_type = OrderType::Market;
                decision.post_only = false;
                decision.reason = format!("IMBALANCE_SNIPE_BUY: Imb {}", imbalance);
                return decision;
            }

            // If we are Selling and Imbalance < -0.6 (Strong Sell Pressure)
            let imb_sell_thresh =
                Decimal::from_str(IMBALANCE_THRESHOLD_SELL).unwrap_or(Decimal::new(-6, 1));
            if params.side == Side::Sell && imbalance < imb_sell_thresh {
                decision.order_type = OrderType::Market;
                decision.post_only = false;
                decision.reason = format!("IMBALANCE_SNIPE_SELL: Imb {}", imbalance);
                return decision;
            }
        }

        // If no expected profit provided, use maker order
        let expected_profit = if let Some(p) = params.expected_profit_pct {
            p
        } else {
            info!(
                signal_id = %params.signal_id,
                symbol = %params.symbol,
                "Using default maker order (no profit estimate)"
            );
            return decision;
        };

        let impact_pct = Decimal::from_f64(estimated_impact_bps / 10000.0).unwrap_or(Decimal::ZERO);
        let fee_analysis = self.analyze_fees(expected_profit, impact_pct);

        // Strict profitability check after impact
        // If Maker strategy is selected (or forced), check if Maker is profitable
        if decision.order_type != OrderType::Market {
            if fee_analysis.profit_after_impact_maker < self.config.min_profit_margin {
                decision.reason = format!(
                    "UNPROFITABLE_MAKER: {}% < {}% (Impact: {}bps)",
                    fee_analysis.profit_after_impact_maker.round_dp(4),
                    self.config.min_profit_margin,
                    estimated_impact_bps
                );
                // We flag it. The caller (Executor) should handle rejection logic based on reason or specific flag.
                // For safety, we keep it as Maker PostOnly so we don't pay taker fees on a bad trade.
                decision.post_only = true;
                warn!("Profitability Rejection: {}", decision.reason);
            }
        } else {
            // If Taker is selected, check if Taker is profitable
            if fee_analysis.profit_after_impact_taker < self.config.min_profit_margin {
                decision.reason = format!(
                    "UNPROFITABLE_TAKER: {}% < {}% (Impact: {}bps)",
                    fee_analysis.profit_after_impact_taker.round_dp(4),
                    self.config.min_profit_margin,
                    estimated_impact_bps
                );
                // Revert to Maker if Taker is too expensive
                decision.order_type = OrderType::Limit;
                decision.post_only = true;
                warn!(
                    "Profitability Rejection (Taker): Reverting to Maker. {}",
                    decision.reason
                );
            }
        }

        info!(
            signal_id = %params.signal_id,
            symbol = %params.symbol,
            expected_profit_pct = %expected_profit,
            profit_after_maker = %fee_analysis.profit_after_maker,
            profit_after_taker = %fee_analysis.profit_after_taker,
            taker_profitable = fee_analysis.taker_profitable,
            estimated_impact_bps = estimated_impact_bps,
            profit_after_impact_maker = %fee_analysis.profit_after_impact_maker,
            "Fee analysis completed"
        );

        decision.fee_analysis = Some(fee_analysis);
        decision
    }

    pub fn evaluate_taker_conversion(
        &self,
        signal_id: &str,
        expected_profit_pct: Decimal,
        elapsed_ms: u64,
    ) -> TakerConversionResult {
        // If not past chase timeout, wait
        if elapsed_ms < self.config.chase_timeout_ms {
            return TakerConversionResult {
                action: TakerAction::Wait,
                reason: format!(
                    "Chase timeout not reached ({}ms < {}ms)",
                    elapsed_ms, self.config.chase_timeout_ms
                ),
                fee_analysis: None,
            };
        }

        let fee_analysis = self.analyze_fees(expected_profit_pct, Decimal::ZERO);

        if fee_analysis.taker_profitable {
            info!(
                signal_id = %signal_id,
                expected_profit_pct = %expected_profit_pct,
                profit_after_taker = %fee_analysis.profit_after_taker,
                elapsed_ms = elapsed_ms,
                "Converting to taker order - profitable"
            );

            return TakerConversionResult {
                action: TakerAction::ConvertToTaker,
                reason: format!(
                    "Taker profitable: {}% after fees",
                    fee_analysis.profit_after_taker
                ),
                fee_analysis: Some(fee_analysis),
            };
        }

        warn!(
            signal_id = %signal_id,
            expected_profit_pct = %expected_profit_pct,
            profit_after_taker = %fee_analysis.profit_after_taker,
            elapsed_ms = elapsed_ms,
            "INSUFFICIENT_PROFIT_FOR_TAKER - Cancelling order"
        );

        TakerConversionResult {
            action: TakerAction::Cancel,
            reason: format!(
                "INSUFFICIENT_PROFIT_FOR_TAKER: {}% < {}%",
                fee_analysis.profit_after_taker, self.config.min_profit_margin
            ),
            fee_analysis: Some(fee_analysis),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum TakerAction {
    ConvertToTaker,
    Cancel,
    Wait,
}

#[derive(Debug, Clone)]
pub struct TakerConversionResult {
    pub action: TakerAction,
    pub reason: String,
    pub fee_analysis: Option<FeeAnalysis>,
}
