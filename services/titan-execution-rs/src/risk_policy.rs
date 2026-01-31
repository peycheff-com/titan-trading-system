use rust_decimal::dec;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum RiskState {
    #[default]
    Normal,
    Cautious,
    Defensive,
    Emergency,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskPolicy {
    /// Current Global Risk State
    #[serde(default)]
    pub current_state: RiskState,

    /// Maximum notional value (Price * Size) allowed for a single position
    #[serde(alias = "maxPositionNotional")]
    pub max_position_notional: Decimal,

    /// Maximum leverage allowed for the account
    #[serde(alias = "maxAccountLeverage")]
    pub max_account_leverage: Decimal,

    /// Maximum daily loss limit (negative value)
    #[serde(alias = "maxDailyLoss")]
    pub max_daily_loss: Decimal,

    /// Maximum open orders per symbol
    #[serde(alias = "maxOpenOrdersPerSymbol")]
    pub max_open_orders_per_symbol: usize,

    /// Whitelisted symbols
    #[serde(alias = "symbolWhitelist")]
    pub symbol_whitelist: HashSet<String>,

    /// Maximum allowed slippage in basis points (Circuit Breaker)
    #[serde(default = "default_max_slippage", alias = "maxSlippageBps")]
    pub max_slippage_bps: u32,

    /// Maximum allowed staleness for market data in ms (Circuit Breaker)
    #[serde(default = "default_max_staleness", alias = "maxStalenessMs")]
    pub max_staleness_ms: i64,

    // --- Strategy Constraints (Brain Veto) ---
    // These are informational for Rust (for now) but strictly enforced by Brain.
    // We ingest them to ensure full Policy portability.
    #[serde(alias = "maxCorrelation", default = "default_max_correlation")]
    pub max_correlation: Decimal,

    #[serde(alias = "correlationPenalty", default = "default_correlation_penalty")]
    pub correlation_penalty: Decimal,

    #[serde(alias = "minConfidenceScore", default = "default_min_confidence")]
    pub min_confidence_score: Decimal,

    #[serde(
        alias = "minStopDistanceMultiplier",
        default = "default_min_stop_distance"
    )]
    pub min_stop_distance_multiplier: Decimal,

    // --- Metadata ---
    #[serde(default)]
    pub version: u32,

    #[serde(alias = "lastUpdated", default)]
    pub last_updated: i64,
}

fn default_max_slippage() -> u32 {
    100 // 1%
}

fn default_max_staleness() -> i64 {
    5000 // 5 seconds
}

fn default_max_correlation() -> Decimal {
    dec!(0.7)
}

fn default_correlation_penalty() -> Decimal {
    dec!(0.5)
}

fn default_min_confidence() -> Decimal {
    dec!(0.7)
}

fn default_min_stop_distance() -> Decimal {
    dec!(1.5)
}

// Embed the canonical risk policy JSON at compile time
const RISK_POLICY_JSON: &str = include_str!("../../../packages/shared/risk_policy.json");

impl Default for RiskPolicy {
    fn default() -> Self {
        serde_json::from_str(RISK_POLICY_JSON).expect("Failed to parse embedded risk_policy.json")
    }
}

impl RiskPolicy {
    pub fn strict() -> Self {
        Self {
            current_state: RiskState::Emergency,
            max_position_notional: dec!(0.0),
            max_account_leverage: dec!(0.0),
            max_daily_loss: dec!(0.0),
            max_open_orders_per_symbol: 0,
            symbol_whitelist: HashSet::new(),
            max_slippage_bps: 0,
            max_staleness_ms: 0,

            max_correlation: dec!(0.0),
            correlation_penalty: dec!(1.0),
            min_confidence_score: dec!(1.0),
            min_stop_distance_multiplier: dec!(10.0),
            version: 1,
            last_updated: 0,
        }
    }

    /// Returns the SHA256 hash of the canonical policy JSON.
    pub fn get_hash() -> String {
        let mut hasher = Sha256::new();
        hasher.update(RISK_POLICY_JSON);
        hex::encode(hasher.finalize())
    }

    /// Computes the SHA256 hash of the current instance
    pub fn compute_hash(&self) -> String {
        let json = serde_json::to_string(self).unwrap_or_default();
        let mut hasher = Sha256::new();
        hasher.update(json);
        hex::encode(hasher.finalize())
    }
}
