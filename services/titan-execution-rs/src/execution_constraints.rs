//! Execution Constraints Module
//!
//! Mirrors TypeScript ExecutionConstraintsV1 schema from @titan/shared.
//! Consumed from Brain's PowerLawPolicyModule via NATS subscription.
//! The Execution Engine enforces these constraints mechanically without
//! understanding the underlying power-law logic.

use parking_lot::RwLock;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicI64, Ordering};
use tracing::{info, warn};

// --- Enums ---

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "UPPERCASE")]
pub enum RiskMode {
    #[default]
    Normal,
    Caution,
    Defensive,
    Emergency,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "UPPERCASE")]
pub enum PolicyMode {
    #[default]
    Shadow,
    Advisory,
    Enforcement,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "UPPERCASE")]
pub enum TifType {
    #[default]
    #[serde(rename = "GTC")]
    Gtc,
    #[serde(rename = "IOC")]
    Ioc,
    #[serde(rename = "FOK")]
    Fok,
}

// --- Sub-structures ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlicingProfile {
    pub max_slice_notional: Decimal,
    pub min_slice_notional: Decimal,
    pub cadence_ms: u64,
}

impl Default for SlicingProfile {
    fn default() -> Self {
        Self {
            max_slice_notional: Decimal::ZERO,
            min_slice_notional: Decimal::ZERO,
            cadence_ms: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TifProfile {
    #[serde(rename = "type")]
    pub tif_type: TifType,
    pub ttl_ms: u64,
}

impl Default for TifProfile {
    fn default() -> Self {
        Self {
            tif_type: TifType::Gtc,
            ttl_ms: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CancelOnBurst {
    pub enabled: bool,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintLimits {
    pub max_pos_notional: Decimal,
    pub max_order_notional: Decimal,
    pub max_leverage: Decimal,
    pub reduce_only: bool,
}

impl Default for ConstraintLimits {
    fn default() -> Self {
        // Defensive defaults
        Self {
            max_pos_notional: Decimal::ZERO,
            max_order_notional: Decimal::ZERO,
            max_leverage: Decimal::ZERO,
            reduce_only: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionProfile {
    pub slicing: SlicingProfile,
    pub maker_bias: Decimal,
    pub cancel_on_burst: CancelOnBurst,
    pub price_band_bps: u32,
    pub tif: TifProfile,
}

impl Default for ExecutionProfile {
    fn default() -> Self {
        Self {
            slicing: SlicingProfile::default(),
            maker_bias: Decimal::ZERO,
            cancel_on_burst: CancelOnBurst::default(),
            price_band_bps: 100, // 1%
            tif: TifProfile::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DerivedFromMetrics {
    pub provenance_hash: String,
    pub window_end_ts: i64,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConstraintOrigin {
    pub derived_from_metrics: DerivedFromMetrics,
    pub brain_decision_id: String,
    pub reason_codes: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ConstraintProvenance {
    pub code_hash: String,
    pub config_hash: String,
    pub calc_ts: i64,
    pub trace_id: String,
}

// --- Main Constraint Struct ---

/// Execution Constraints V1 - mirrors TypeScript ExecutionConstraintsSchemaV1
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionConstraints {
    pub schema_version: String,

    // Identity
    pub venue: String,
    pub account: String,
    pub symbol: String,

    // Lifecycle
    pub ttl_ms: u64,
    pub issued_ts: i64,

    // Modes
    pub risk_mode: RiskMode,
    pub mode: PolicyMode,

    // Limits
    pub limits: ConstraintLimits,

    // Execution Profile
    pub execution_profile: ExecutionProfile,

    // Traceability
    pub origin: ConstraintOrigin,

    // Provenance
    pub provenance: ConstraintProvenance,
}

impl Default for ExecutionConstraints {
    /// Returns defensive (fail-closed) constraints
    fn default() -> Self {
        Self {
            schema_version: "1".to_string(),
            venue: "unknown".to_string(),
            account: "unknown".to_string(),
            symbol: "unknown".to_string(),
            ttl_ms: 60000,
            issued_ts: 0,
            risk_mode: RiskMode::Defensive,
            mode: PolicyMode::Enforcement,
            limits: ConstraintLimits::default(),
            execution_profile: ExecutionProfile::default(),
            origin: ConstraintOrigin::default(),
            provenance: ConstraintProvenance::default(),
        }
    }
}

impl ExecutionConstraints {
    /// Check if this constraint is still valid (not expired)
    pub fn is_valid(&self) -> bool {
        let now = chrono::Utc::now().timestamp_millis();
        let expires_at = self.issued_ts + (self.ttl_ms as i64);
        now < expires_at
    }

    /// Check if this is in ENFORCEMENT mode
    pub fn is_enforcing(&self) -> bool {
        matches!(self.mode, PolicyMode::Enforcement)
    }

    /// Returns defensive constraints for a symbol when no constraints are available
    pub fn defensive(venue: &str, account: &str, symbol: &str) -> Self {
        Self {
            schema_version: "1".to_string(),
            venue: venue.to_string(),
            account: account.to_string(),
            symbol: symbol.to_string(),
            ttl_ms: 60000,
            issued_ts: chrono::Utc::now().timestamp_millis(),
            risk_mode: RiskMode::Defensive,
            mode: PolicyMode::Enforcement,
            limits: ConstraintLimits::default(),
            execution_profile: ExecutionProfile::default(),
            origin: ConstraintOrigin {
                derived_from_metrics: DerivedFromMetrics::default(),
                brain_decision_id: "fallback".to_string(),
                reason_codes: vec!["CONSTRAINTS_MISSING".to_string()],
            },
            provenance: ConstraintProvenance::default(),
        }
    }
}

// --- Constraints Store ---

/// In-memory store for execution constraints, keyed by symbol
pub struct ConstraintsStore {
    constraints: RwLock<HashMap<String, ExecutionConstraints>>,
    last_update_ts: AtomicI64,
}

impl ConstraintsStore {
    pub fn new() -> Self {
        Self {
            constraints: RwLock::new(HashMap::new()),
            last_update_ts: AtomicI64::new(0),
        }
    }

    /// Update constraints for a symbol
    pub fn update(&self, constraints: ExecutionConstraints) {
        let symbol = constraints.symbol.clone();
        let issued_ts = constraints.issued_ts;

        info!(
            symbol = %symbol,
            risk_mode = ?constraints.risk_mode,
            mode = ?constraints.mode,
            max_order_notional = %constraints.limits.max_order_notional,
            "Constraints updated"
        );

        self.constraints.write().insert(symbol, constraints);
        self.last_update_ts.store(issued_ts, Ordering::SeqCst);
    }

    /// Get constraints for a symbol, returns defensive fallback if missing/expired
    pub fn get(&self, venue: &str, account: &str, symbol: &str) -> ExecutionConstraints {
        let guard = self.constraints.read();

        if let Some(constraints) = guard.get(symbol) {
            if constraints.is_valid() {
                return constraints.clone();
            }
            warn!(
                symbol = %symbol,
                "Constraints expired, using defensive fallback"
            );
        }

        // Fail-closed: return defensive constraints
        ExecutionConstraints::defensive(venue, account, symbol)
    }

    /// Check if any constraints exist and are valid for a symbol
    pub fn has_valid_constraints(&self, symbol: &str) -> bool {
        let guard = self.constraints.read();
        guard.get(symbol).map(|c| c.is_valid()).unwrap_or(false)
    }

    /// Get the last update timestamp
    pub fn last_update(&self) -> i64 {
        self.last_update_ts.load(Ordering::SeqCst)
    }

    /// Get all current constraints (for diagnostics)
    pub fn get_all(&self) -> Vec<ExecutionConstraints> {
        self.constraints.read().values().cloned().collect()
    }
}

impl Default for ConstraintsStore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn test_defensive_constraints() {
        let c = ExecutionConstraints::defensive("bybit", "main", "BTCUSDT");

        assert_eq!(c.symbol, "BTCUSDT");
        assert_eq!(c.risk_mode, RiskMode::Defensive);
        assert_eq!(c.mode, PolicyMode::Enforcement);
        assert!(c.limits.reduce_only);
        assert_eq!(c.limits.max_order_notional, Decimal::ZERO);
    }

    #[test]
    fn test_constraints_store_fallback() {
        let store = ConstraintsStore::new();

        // No constraints stored - should return defensive
        let c = store.get("bybit", "main", "ETHUSDT");
        assert_eq!(c.risk_mode, RiskMode::Defensive);
        assert!(c.limits.reduce_only);
    }

    #[test]
    fn test_constraints_store_update() {
        let store = ConstraintsStore::new();

        let c = ExecutionConstraints {
            symbol: "BTCUSDT".to_string(),
            risk_mode: RiskMode::Normal,
            mode: PolicyMode::Enforcement,
            limits: ConstraintLimits {
                max_pos_notional: dec!(100000),
                max_order_notional: dec!(10000),
                max_leverage: dec!(3.0),
                reduce_only: false,
            },
            issued_ts: chrono::Utc::now().timestamp_millis(),
            ttl_ms: 60000,
            ..Default::default()
        };

        store.update(c);

        let retrieved = store.get("bybit", "main", "BTCUSDT");
        assert_eq!(retrieved.risk_mode, RiskMode::Normal);
        assert!(!retrieved.limits.reduce_only);
    }

    #[test]
    fn test_expired_constraints_fallback() {
        let store = ConstraintsStore::new();

        // Create expired constraints
        let c = ExecutionConstraints {
            symbol: "BTCUSDT".to_string(),
            risk_mode: RiskMode::Normal,
            mode: PolicyMode::Enforcement,
            issued_ts: chrono::Utc::now().timestamp_millis() - 120000, // 2 minutes ago
            ttl_ms: 60000,                                             // 1 minute TTL - expired
            ..Default::default()
        };

        store.update(c);

        // Should get defensive fallback
        let retrieved = store.get("bybit", "main", "BTCUSDT");
        assert_eq!(retrieved.risk_mode, RiskMode::Defensive);
    }
}
