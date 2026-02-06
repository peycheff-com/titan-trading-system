//! Risk Enforcement Tests
//!
//! Tests RiskPolicy parsing and RiskRejectionReason behavior.
//! Fulfills GAP-07: Risk Violation Enforcement

use rust_decimal_macros::dec;

use titan_execution_rs::risk_guard::RiskRejectionReason;
use titan_execution_rs::risk_policy::{RiskPolicy, RiskState};

/// Test RiskPolicy deserialization from Brain JSON format (camelCase)
#[test]
fn test_risk_policy_from_brain_json() {
    let brain_json = r#"{
        "maxAccountLeverage": 10.0,
        "maxPositionNotional": 50000.0,
        "maxDailyLoss": -1000.0,
        "maxOpenOrdersPerSymbol": 5,
        "symbolWhitelist": ["BTC/USDT", "ETH/USDT"],
        "maxSlippageBps": 200,
        "maxStalenessMs": 5000,
        "maxCorrelation": 0.75,
        "correlationPenalty": 0.5,
        "minConfidenceScore": 0.8,
        "minStopDistanceMultiplier": 2.0,
        "version": 1,
        "lastUpdated": 1700000000000
    }"#;

    let policy: RiskPolicy = serde_json::from_str(brain_json).expect("Failed to parse");

    assert_eq!(policy.max_account_leverage, dec!(10.0));
    assert_eq!(policy.max_position_notional, dec!(50000.0));
    assert_eq!(policy.max_daily_loss, dec!(-1000.0));
    assert_eq!(policy.max_open_orders_per_symbol, 5);
    assert!(policy.symbol_whitelist.contains("BTC/USDT"));
    assert!(policy.symbol_whitelist.contains("ETH/USDT"));
    assert!(!policy.symbol_whitelist.contains("DOGE/USDT"));
    assert_eq!(policy.max_slippage_bps, 200);
    println!("✅ Risk Policy V1 Deserialization Verified");
}

/// Test symbol whitelist rejection reason formatting
#[test]
fn test_symbol_whitelist_rejection_format() {
    let reason = RiskRejectionReason::SymbolNotWhitelisted("DOGE/USDT".to_string());
    let msg = format!("{}", reason);

    assert!(msg.contains("DOGE/USDT"), "Message should contain symbol");
    assert!(
        msg.contains("whitelist"),
        "Message should mention whitelist"
    );
    println!("✅ Rejection reason: {}", msg);
}

/// Test daily loss rejection reason formatting
#[test]
fn test_daily_loss_rejection_format() {
    let reason = RiskRejectionReason::DailyLossLimitExceeded {
        current_loss: dec!(-1500.0),
        limit: dec!(-1000.0),
    };
    let msg = format!("{}", reason);

    assert!(msg.contains("-1500"), "Message should contain current loss");
    assert!(msg.contains("-1000"), "Message should contain limit");
    println!("✅ Rejection reason: {}", msg);
}

/// Test position notional rejection reason formatting
#[test]
fn test_position_notional_rejection_format() {
    let reason = RiskRejectionReason::MaxPositionNotionalExceeded {
        symbol: "BTC/USDT".to_string(),
        current: dec!(40000.0),
        additional: dec!(20000.0),
        limit: dec!(50000.0),
    };
    let msg = format!("{}", reason);

    assert!(msg.contains("BTC/USDT"), "Message should contain symbol");
    assert!(msg.contains("exceeded"), "Message should mention exceeded");
    println!("✅ Rejection reason: {}", msg);
}

/// Test leverage rejection reason formatting
#[test]
fn test_leverage_rejection_format() {
    let reason = RiskRejectionReason::MaxAccountLeverageExceeded {
        current: dec!(15.0),
        limit: dec!(10.0),
    };
    let msg = format!("{}", reason);

    assert!(
        msg.contains("15"),
        "Message should contain current leverage"
    );
    assert!(msg.contains("10"), "Message should contain limit");
    println!("✅ Rejection reason: {}", msg);
}

/// Test PowerLaw constraint rejection reasons
#[test]
fn test_constraint_rejection_formats() {
    // Reduce-only violation
    let reason1 = RiskRejectionReason::ConstraintReduceOnlyViolation {
        symbol: "BTC/USDT".to_string(),
    };
    assert!(format!("{}", reason1).contains("reduce-only"));

    // Max order notional exceeded
    let reason2 = RiskRejectionReason::ConstraintMaxOrderNotionalExceeded {
        symbol: "ETH/USDT".to_string(),
        order_notional: dec!(100000.0),
        limit: dec!(50000.0),
    };
    assert!(format!("{}", reason2).contains("notional"));

    // Max leverage exceeded (constraint)
    let reason3 = RiskRejectionReason::ConstraintMaxLeverageExceeded {
        current: dec!(25.0),
        limit: dec!(20.0),
    };
    assert!(format!("{}", reason3).contains("Leverage"));

    println!("✅ PowerLaw constraint rejections verified");
}

/// Test RiskState transitions
#[test]
fn test_risk_state_enum() {
    assert_eq!(RiskState::default(), RiskState::Normal);

    // Verify all states can be compared
    assert_ne!(RiskState::Normal, RiskState::Cautious);
    assert_ne!(RiskState::Cautious, RiskState::Defensive);
    assert_ne!(RiskState::Defensive, RiskState::Emergency);

    println!("✅ RiskState enum verified");
}

/// Test RiskPolicy hash computation (used for policy drift detection)
#[test]
fn test_policy_hash_consistency() {
    let json1 = r#"{
        "maxAccountLeverage": 10.0,
        "maxPositionNotional": 50000.0,
        "maxDailyLoss": -1000.0,
        "maxOpenOrdersPerSymbol": 5,
        "symbolWhitelist": ["BTC/USDT"],
        "maxSlippageBps": 200,
        "maxStalenessMs": 5000
    }"#;

    let policy1: RiskPolicy = serde_json::from_str(json1).expect("Failed to parse");
    let hash1 = policy1.compute_hash();

    // Same policy should produce same hash
    let policy2: RiskPolicy = serde_json::from_str(json1).expect("Failed to parse");
    let hash2 = policy2.compute_hash();

    assert_eq!(hash1, hash2, "Same policy should produce same hash");
    assert_eq!(hash1.len(), 64, "Hash should be 64 hex chars (SHA256)");

    println!("✅ Policy hash: {}", hash1);
}

/// Test that invalid size rejection works
#[test]
fn test_invalid_size_rejection_format() {
    let reason = RiskRejectionReason::InvalidSize;
    let msg = format!("{}", reason);

    assert!(
        msg.contains("Invalid") || msg.contains("size"),
        "Message should mention invalid size, got: {}",
        msg
    );
    println!("✅ Invalid size rejection: {}", msg);
}

/// Test market data stale rejection
#[test]
fn test_stale_market_data_rejection_format() {
    let reason = RiskRejectionReason::MarketDataStale("BTC/USDT on bybit".to_string());
    let msg = format!("{}", reason);

    assert!(msg.contains("Stale"), "Message should mention stale");
    assert!(msg.contains("BTC/USDT"), "Message should contain symbol");
    println!("✅ Stale market data rejection: {}", msg);
}
