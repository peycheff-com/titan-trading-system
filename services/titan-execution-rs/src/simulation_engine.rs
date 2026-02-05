use crate::market_data::engine::MarketDataEngine;
use crate::model::{FillReport, Intent, Side};

use rust_decimal::Decimal;
use std::sync::Arc;
use tracing::{info, warn};

use crate::context::ExecutionContext;

pub struct SimulationEngine {
    market_data: Arc<MarketDataEngine>,
    ctx: Arc<ExecutionContext>,
}

impl SimulationEngine {
    pub fn new(market_data: Arc<MarketDataEngine>, ctx: Arc<ExecutionContext>) -> Self {
        Self { market_data, ctx }
    }

    pub fn simulate_execution(&self, intent: &Intent) -> Option<FillReport> {
        // 1. Get Live Price
        let ticker = self.market_data.get_ticker(&intent.symbol);

        if ticker.is_none() {
            warn!(
                "Values to simulate execution: No market data for {}",
                intent.symbol
            );
            return None;
        }

        let ticker = ticker.unwrap();

        // 2. Determine execution price based on side and aggressive/passive
        // For now, assume TAKING liquidity (crossing spread) for immediate fill simulation
        let (fill_price, _liquidity) = {
            let is_buy = match intent.direction {
                1 => true,
                _ => false, // Simplification, need robust mapping
            };

            // If Buy, we pay Best Ask. If Sell, we take Best Bid.
            if is_buy {
                (ticker.best_ask, ticker.best_ask_qty)
            } else {
                (ticker.best_bid, ticker.best_bid_qty)
            }
        };

        // Determine correct Side enum
        // TODO: Reuse logic from main.rs or move to model impl
        let side_enum = match intent.direction {
            1 => Side::Buy,
            _ => Side::Sell,
        };

        // 3. Create Shadow/Simulated Fill
        let fill = FillReport {
            fill_id: format!("sim-{}", self.ctx.id.new_id()),
            signal_id: intent.signal_id.clone(),
            symbol: intent.symbol.clone(),
            side: side_enum,
            price: fill_price,
            qty: intent.size,
            fee: fill_price * intent.size * Decimal::from_f64_retain(0.0005).unwrap(), // 0.05% Taker
            fee_currency: "USDT".to_string(),
            t_signal: intent.t_signal,
            t_ingress: self.ctx.time.now_millis(), // Approx
            t_decision: self.ctx.time.now_millis(),
            t_ack: self.ctx.time.now_millis(),
            t_exchange: ticker.transaction_time, // Use market data time as "exchange" time
            client_order_id: format!("sim-oid-{}", self.ctx.id.new_id()),
            execution_id: format!("sim-exec-{}", self.ctx.id.new_id()),
            dex_proof: None,
        };

        info!("👻 Shadow Fill: {} @ {}", fill.symbol, fill.price);

        Some(fill)
    }
}
