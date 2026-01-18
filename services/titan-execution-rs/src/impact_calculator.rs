use std::sync::Arc;
use dashmap::DashMap;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct VolatilityState {
    pub sigma: f64, // Daily volatility (e.g. 0.04 for 4%)
    pub is_expanding: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImpactEstimate {
    pub impact_bps: f64,
    pub volume_ratio: f64,
    pub feasible: bool,
    pub recommended_routing: OrderRouting,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum OrderRouting {
    PostOnly,   // Maker only (passive)
    Limit,      // Standard limit (patient)
    IOC,        // Taker (aggressive)
    Rejected,   // Too hazardous
}

#[derive(Clone)]
pub struct ImpactCalculator {
    // Cache of 24h rolling volume in USD for each symbol
    daily_volumes: Arc<DashMap<String, f64>>,
}

impl ImpactCalculator {
    pub fn new() -> Self {
        Self {
            daily_volumes: Arc::new(DashMap::new()),
        }
    }

    pub fn update_daily_volume(&self, symbol: &str, volume_24h: f64) {
        self.daily_volumes.insert(symbol.to_string(), volume_24h);
    }

    pub fn estimate_impact(
        &self,
        symbol: &str,
        notional_usd: f64,
        vol_state: Option<VolatilityState>,
    ) -> ImpactEstimate {
        // Default to $100M daily volume if unknown (safe fallback for majors, risky for alts)
        // Ideally we should warn or reject if unknown.
        let daily_vol = self.daily_volumes.get(symbol).map(|v| *v).unwrap_or(100_000_000.0);
        
        // Default vol to 3% if unknown
        let sigma = vol_state.map(|v| v.sigma).unwrap_or(0.03);

        let volume_ratio = notional_usd / daily_vol;
        
        // Square-root law: I = c * sigma * sqrt(Q / V)
        // c is empirically around 0.5 to 1.0 for full order impact, 
        // but for "bps cost" we use a tuned constant. 
        // Let's use 0.7 as a conservative constant for impact cost.
        let impact_fraction = 0.7 * sigma * volume_ratio.sqrt();
        let impact_bps = impact_fraction * 10_000.0;

        let (feasible, recommended_routing) = match impact_bps {
            x if x < 5.0 => (true, OrderRouting::PostOnly),
            x if x < 20.0 => (true, OrderRouting::Limit),
            x if x < 50.0 => (true, OrderRouting::IOC),
            _ => (false, OrderRouting::Rejected),
        };

        ImpactEstimate {
            impact_bps,
            volume_ratio,
            feasible,
            recommended_routing,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_impact_estimation() {
        let calc = ImpactCalculator::new();
        calc.update_daily_volume("BTCUSDT", 1_000_000_000.0); // $1B daily

        // Case 1: Tiny order ($10k) on $1B vol
        // Ratio = 1e4 / 1e9 = 1e-5. Sqrt = 0.00316
        // Impact = 0.7 * 0.03 * 0.00316 * 10000 = 0.66 bps
        // Should be PostOnly (< 5 bps)
        let est1 = calc.estimate_impact("BTCUSDT", 10_000.0, None);
        assert!(est1.feasible);
        assert!(est1.impact_bps < 1.0);
        assert_eq!(est1.recommended_routing, OrderRouting::PostOnly);

        // Case 2: Huge order ($50M) on $1B vol
        // Ratio = 0.05. Sqrt = 0.223
        // Impact = 0.7 * 0.03 * 0.223 * 10000 = 46.8 bps
        // Should be IOC (< 50 bps) but close to limit
        let est2 = calc.estimate_impact("BTCUSDT", 50_000_000.0, None);
        assert!(est2.feasible);
        assert!(est2.impact_bps > 40.0);
        assert_eq!(est2.recommended_routing, OrderRouting::IOC);

        // Case 3: Massive order ($200M) on $1B vol
        // Ratio = 0.2. Sqrt = 0.447
        // Impact = 0.7 * 0.03 * 0.447 * 10000 = 93.8 bps
        // Should be Rejected (> 50 bps)
        let est3 = calc.estimate_impact("BTCUSDT", 200_000_000.0, None);
        assert!(!est3.feasible);
        assert!(est3.impact_bps > 50.0);
        assert_eq!(est3.recommended_routing, OrderRouting::Rejected);
    }
}
