use crate::model::{DriftClass, DriftReport, Intent, TradeRecord};
use rust_decimal::prelude::ToPrimitive;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct DriftDetector {
    // Configuration thresholds
    spread_threshold_bps: f64,
    latency_budget_ms: i64,
    // _correlation_threshold_bps: f64,
}

impl DriftDetector {
    pub fn new(
        spread_threshold_bps: f64,
        latency_budget_ms: i64,
        _correlation_threshold_bps: f64,
    ) -> Self {
        Self {
            spread_threshold_bps,
            latency_budget_ms,
            // _correlation_threshold_bps: correlation_threshold_bps,
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

            if let Some(bps) = deviation
                && bps > self.spread_threshold_bps
            {
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

        // 3. Class C: Correlation (Placeholder)
        // Requires external reference price (e.g. Binance Spot vs executed price)
        // Not implemented yet without MarketData access here.

        reports
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use rust_decimal_macros::dec;

    fn simple_intent(symbol: &str, direction: i32, entry_zone: Vec<f64>) -> Intent {
        Intent {
            signal_id: "test-signal".to_string(),
            symbol: symbol.to_string(),
            direction,
            intent_type: crate::model::IntentType::BuySetup,
            entry_zone: entry_zone
                .into_iter()
                .map(|f| rust_decimal::Decimal::from_f64_retain(f).unwrap())
                .collect(),
            stop_loss: dec!(0),
            take_profits: vec![],
            size: dec!(1.0),
            status: crate::model::IntentStatus::Pending,
            source: None,
            t_signal: Utc::now().timestamp_millis(),
            t_analysis: None,
            t_decision: None,
            ttl_ms: None,
            partition_key: None,
            causation_id: None,
            env: None,
            subject: None,
            t_ingress: None,
            t_exchange: None,
            max_slippage_bps: None,
            rejection_reason: None,
            regime_state: None,
            phase: None,
            metadata: None,
            exchange: None,
            position_mode: None,
            child_fills: vec![],
            filled_size: dec!(0),
            policy_hash: None,
        }
    }

    #[test]
    fn test_spread_drift_buy() {
        let detector = DriftDetector::new(10.0, 1000, 0.0); // 10 bps threshold

        let intent = simple_intent("BTC", 1, vec![99.0, 100.0]);
        let trade = TradeRecord {
            signal_id: "test".to_string(),
            symbol: "BTC".to_string(),
            side: crate::model::Side::Buy,
            entry_price: dec!(100.0),
            exit_price: dec!(0),
            size: dec!(1),
            pnl: dec!(0),
            pnl_pct: dec!(0),
            fee: dec!(0),
            fee_asset: "USD".to_string(),
            opened_at: Utc::now(),
            closed_at: Utc::now(),
            close_reason: "".to_string(),
            metadata: None,
        };

        let reports = detector.analyze(&intent, &trade);
        assert!(reports.is_empty());

        // Buy at 101. Zone Max 100. Drift = (101-100)/100 = 1%. = 100 bps. > 10 bps.
        let trade_bad = TradeRecord {
            entry_price: dec!(101.0),
            ..trade.clone()
        };
        let reports_bad = detector.analyze(&intent, &trade_bad);
        assert_eq!(reports_bad.len(), 1);
        assert_eq!(reports_bad[0].drift_class, DriftClass::ClassASpread);
        assert!(reports_bad[0].deviation_bps > 10.0);
    }

    #[test]
    fn test_latency_drift() {
        let detector = DriftDetector::new(10.0, 100, 0.0); // 100ms budget

        let mut intent = simple_intent("BTC", 1, vec![100.0]);
        intent.t_signal = Utc::now().timestamp_millis() - 200; // 200ms ago

        let trade = TradeRecord {
            signal_id: "test".to_string(),
            symbol: "BTC".to_string(),
            side: crate::model::Side::Buy,
            entry_price: dec!(100.0),
            exit_price: dec!(0),
            size: dec!(1),
            pnl: dec!(0),
            pnl_pct: dec!(0),
            fee: dec!(0),
            fee_asset: "USD".to_string(),
            opened_at: Utc::now(),
            closed_at: Utc::now(),
            close_reason: "".to_string(),
            metadata: None,
        };

        let reports = detector.analyze(&intent, &trade);
        assert_eq!(reports.len(), 1);
        assert_eq!(reports[0].drift_class, DriftClass::ClassBLatency);
    }
}
