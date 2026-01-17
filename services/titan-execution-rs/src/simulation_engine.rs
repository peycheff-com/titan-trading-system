use crate::model::{Intent, FillReport, Side};
use crate::market_data::engine::MarketDataEngine;
use rust_decimal::Decimal;
use std::sync::Arc;
use chrono::Utc;
use tracing::{info, warn};
use uuid::Uuid;

pub struct SimulationEngine {
    market_data: Arc<MarketDataEngine>,
}

impl SimulationEngine {
    pub fn new(market_data: Arc<MarketDataEngine>) -> Self {
        Self { market_data }
    }

    pub fn simulate_execution(&self, intent: &Intent) -> Option<FillReport> {
        // 1. Get Live Price
        let ticker = self.market_data.get_ticker(&intent.symbol);
        
        if ticker.is_none() {
            warn!("Values to simulate execution: No market data for {}", intent.symbol);
            return None;
        }
        
        let ticker = ticker.unwrap();
        
        // 2. Determine execution price based on side and aggressive/passive
        // For now, assume TAKING liquidity (crossing spread) for immediate fill simulation
        let (fill_price, _liquidity) = match intent.intent_type {
            // Setup = Entry. Direction 1 = Long (Buy) => Ask Price
            // Close = Exit. Direction 1 = Long (Close Long?) -> Wait, Close Long means SELL.
            _ => {
                let is_buy = match intent.direction {
                    1 => true,
                    _ => false // Simplification, need robust mapping
                };
                
                // If Buy, we pay Best Ask. If Sell, we take Best Bid.
                if is_buy {
                    (ticker.best_ask, ticker.best_ask_qty)
                } else {
                    (ticker.best_bid, ticker.best_bid_qty)
                }
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
            fill_id: format!("sim-{}", Uuid::new_v4()),
            signal_id: intent.signal_id.clone(),
            symbol: intent.symbol.clone(),
            side: side_enum,
            price: fill_price,
            qty: intent.size,
            fee: fill_price * intent.size * Decimal::from_f64_retain(0.0005).unwrap(), // 0.05% Taker
            fee_currency: "USDT".to_string(),
            t_signal: intent.t_signal,
            t_ingress: Utc::now().timestamp_millis(), // Approx
            t_decision: Utc::now().timestamp_millis(),
            t_ack: Utc::now().timestamp_millis(),
            t_exchange: ticker.transaction_time, // Use market data time as "exchange" time
        };
        
        info!("👻 Shadow Fill: {} @ {}", fill.symbol, fill.price);
        
        Some(fill)
    }
}
