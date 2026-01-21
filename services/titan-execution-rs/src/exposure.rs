use rust_decimal::Decimal;
use crate::model::{Position, Side};
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ExposureMetrics {
    pub net_exposure: Decimal,   // Net Notional (Long - Short)
    pub gross_notional: Decimal, // |Long| + |Short|
    pub long_notional: Decimal,
    pub short_notional: Decimal,
    pub position_count: usize,
}

pub struct ExposureCalculator;

impl ExposureCalculator {
    pub fn calculate(positions: &HashMap<String, Position>) -> ExposureMetrics {
        let mut metrics = ExposureMetrics::default();
        metrics.position_count = positions.len();

        for position in positions.values() {
            // Use mark price for valuation if available, otherwise entry price (fallback)
            // Ideally we should always have mark price if ValuationEngine is running.
            let price = position.last_mark_price.unwrap_or(position.entry_price);
            
            let notional = position.size * price;
            
            match position.side {
                Side::Buy | Side::Long => {
                    metrics.long_notional += notional;
                }
                Side::Sell | Side::Short => {
                    metrics.short_notional += notional;
                }
            }
        }
        
        metrics.gross_notional = metrics.long_notional + metrics.short_notional;
        metrics.net_exposure = metrics.long_notional - metrics.short_notional;
        
        metrics
    }
}
