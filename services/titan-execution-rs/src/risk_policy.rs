use rust_decimal::dec;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

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
    pub max_position_notional: Decimal,

    /// Maximum leverage allowed for the account
    pub max_account_leverage: Decimal,

    /// Maximum daily loss limit (negative value)
    pub max_daily_loss: Decimal,

    /// Maximum open orders per symbol
    pub max_open_orders_per_symbol: usize,

    /// Whitelisted symbols
    pub symbol_whitelist: HashSet<String>,

    /// Maximum allowed slippage in basis points (Circuit Breaker)
    #[serde(default = "default_max_slippage")]
    pub max_slippage_bps: u32,

    /// Maximum allowed staleness for market data in ms (Circuit Breaker)
    #[serde(default = "default_max_staleness")]
    pub max_staleness_ms: i64,
}

fn default_max_slippage() -> u32 {
    100 // 1%
}

fn default_max_staleness() -> i64 {
    5000 // 5 seconds
}

impl Default for RiskPolicy {
    fn default() -> Self {
        let mut whitelist = HashSet::new();
        // Default safe list
        whitelist.insert("BTC/USDT".to_string());
        whitelist.insert("ETH/USDT".to_string());
        whitelist.insert("SOL/USDT".to_string());

        Self {
            current_state: RiskState::Normal,
            max_position_notional: dec!(50000.0),
            max_account_leverage: dec!(10.0),
            max_daily_loss: dec!(-1000.0),
            max_open_orders_per_symbol: 5,
            symbol_whitelist: whitelist,
            max_slippage_bps: default_max_slippage(),
            max_staleness_ms: default_max_staleness(),
        }
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
        }
    }
}
