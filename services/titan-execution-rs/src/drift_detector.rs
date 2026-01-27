use crate::model::{DriftClass, DriftReport, Intent, TradeRecord};
use rust_decimal::prelude::ToPrimitive;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct DriftDetector {
    // Configuration thresholds
    spread_threshold_bps: f64,
    latency_budget_ms: i64,
    _correlation_threshold_bps: f64,
}

impl DriftDetector {
    pub fn new(
        spread_threshold_bps: f64,
        latency_budget_ms: i64,
        correlation_threshold_bps: f64,
    ) -> Self {
        Self {
            spread_threshold_bps,
            latency_budget_ms,
            _correlation_threshold_bps: correlation_threshold_bps,
        }
    }

    /// Analyze a completed trade for drift
    pub fn analyze(&self, intent: &Intent, trade: &TradeRecord) -> Vec<DriftReport> {
        let mut reports = Vec::new();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;

        // 1. Check Class B: Latency Drift
        let t0 = intent.t_signal;
        // Use closed_at timestamp from trade record, converting DateTime<Utc> to ms
        let t1 = trade.opened_at.timestamp_millis();
        let latency = t1 - t0;

        if latency > self.latency_budget_ms {
            reports.push(DriftReport {
                signal_id: intent.signal_id.clone(),
                symbol: intent.symbol.clone(),
                drift_class: DriftClass::ClassBLatency,
                expected: self.latency_budget_ms as f64,
                actual: latency as f64,
                deviation_bps: 0.0,
                timestamp: now,
            });
        }

        // 2. Check Class A: Spread Drift
        // Only if we have entry_zone
        if !intent.entry_zone.is_empty() {
            let entry_price = trade.entry_price.to_f64().unwrap_or(0.0);
            let zone_min = intent
                .entry_zone
                .iter()
                .min()
                .and_then(|d| d.to_f64())
                .unwrap_or(0.0);
            let zone_max = intent
                .entry_zone
                .iter()
                .max()
                .and_then(|d| d.to_f64())
                .unwrap_or(0.0);

            // Logic depends on direction.
            // If Long (direction = 1), we want to buy LOW. So entry_price > zone_max is bad.
            // If Short (direction = -1), we want to sell HIGH. So entry_price < zone_min is bad.

            let deviation = if intent.direction == 1 {
                if entry_price > zone_max {
                    Some((entry_price - zone_max) / zone_max * 10000.0)
                } else {
                    None
                }
            } else if entry_price < zone_min {
                Some((zone_min - entry_price) / zone_min * 10000.0)
            } else {
                None
            };

            if let Some(bps) = deviation {
                if bps > self.spread_threshold_bps {
                    reports.push(DriftReport {
                        signal_id: intent.signal_id.clone(),
                        symbol: intent.symbol.clone(),
                        drift_class: DriftClass::ClassASpread,
                        expected: if intent.direction == 1 {
                            zone_max
                        } else {
                            zone_min
                        },
                        actual: entry_price,
                        deviation_bps: bps,
                        timestamp: now,
                    });
                }
            }
        }

        // 3. Class C: Correlation (Placeholder)
        // Requires external reference price (e.g. Binance Spot vs executed price)
        // Not implemented yet without MarketData access here.

        reports
    }
}
