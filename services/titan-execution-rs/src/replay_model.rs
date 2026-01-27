use crate::market_data::types::BookTicker;
use crate::model::Intent;
use crate::risk_policy::RiskPolicy;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "event_type", rename_all = "snake_case")]
pub enum ReplayEvent {
    /// Market Data update (Order book ticker) -> Updates Valuation
    MarketData(BookTicker),

    /// Signal Intent (from Strategy) -> Triggers Execution Pipeline
    Signal(Box<Intent>),

    /// Risk Policy Update -> Updates RiskGuard
    RiskPolicy { policy: RiskPolicy, ts: i64 },

    /// Time advancement (optional, explicit tick)
    Tick { timestamp: i64 },
}

impl ReplayEvent {
    pub fn timestamp(&self) -> i64 {
        match self {
            ReplayEvent::MarketData(t) => t.transaction_time,
            ReplayEvent::Signal(i) => i.t_signal,
            ReplayEvent::RiskPolicy { ts, .. } => *ts,
            ReplayEvent::Tick { timestamp } => *timestamp,
        }
    }
}
