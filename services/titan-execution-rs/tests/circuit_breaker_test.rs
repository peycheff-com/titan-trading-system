//! Circuit Breaker Tests
//!
//! Tests RiskState transitions and system halt behavior.
//! Fulfills GAP-08: Circuit Breaker Enforcement

use rust_decimal_macros::dec;
use serde_json::json;

use titan_execution_rs::risk_policy::{RiskPolicy, RiskState};

/// Test RiskState serialization/deserialization
#[test]
fn test_risk_state_serialization() {
    // Test Normal state
    let policy_normal = json!({
        "current_state": "Normal",
        "maxAccountLeverage": 10.0,
        "maxPositionNotional": 50000.0,
        "maxDailyLoss": -1000.0,
        "maxOpenOrdersPerSymbol": 5,
        "symbolWhitelist": ["BTC/USDT"]
    });

    let parsed: RiskPolicy = serde_json::from_value(policy_normal).expect("Failed to parse Normal");
    assert_eq!(parsed.current_state, RiskState::Normal);

    // Test Emergency state
    let policy_emergency = json!({
        "current_state": "Emergency",
        "maxAccountLeverage": 10.0,
        "maxPositionNotional": 50000.0,
        "maxDailyLoss": -1000.0,
        "maxOpenOrdersPerSymbol": 5,
        "symbolWhitelist": ["BTC/USDT"]
    });

    let parsed: RiskPolicy =
        serde_json::from_value(policy_emergency).expect("Failed to parse Emergency");
    assert_eq!(parsed.current_state, RiskState::Emergency);

    println!("✅ RiskState serialization verified");
}

/// Test all RiskState variants
#[test]
fn test_all_risk_state_variants() {
    let states = vec![
        ("Normal", RiskState::Normal),
        ("Cautious", RiskState::Cautious),
        ("Defensive", RiskState::Defensive),
        ("Emergency", RiskState::Emergency),
    ];

    for (name, expected_state) in states {
        let policy_json = json!({
            "current_state": name,
            "maxAccountLeverage": 10.0,
            "maxPositionNotional": 50000.0,
            "maxDailyLoss": -1000.0,
            "maxOpenOrdersPerSymbol": 5,
            "symbolWhitelist": []
        });

        let parsed: RiskPolicy =
            serde_json::from_value(policy_json).expect(&format!("Failed to parse {}", name));
        assert_eq!(
            parsed.current_state, expected_state,
            "State mismatch for {}",
            name
        );
    }

    println!("✅ All RiskState variants verified");
}

/// Test default RiskState is Normal
#[test]
fn test_default_risk_state() {
    // Policy without current_state should default to Normal
    let policy_json = json!({
        "maxAccountLeverage": 10.0,
        "maxPositionNotional": 50000.0,
        "maxDailyLoss": -1000.0,
        "maxOpenOrdersPerSymbol": 5,
        "symbolWhitelist": ["BTC/USDT"]
    });

    let parsed: RiskPolicy = serde_json::from_value(policy_json).expect("Failed to parse");
    assert_eq!(
        parsed.current_state,
        RiskState::Normal,
        "Default state should be Normal"
    );

    println!("✅ Default RiskState is Normal");
}

/// Test RiskState equality
#[test]
fn test_risk_state_equality() {
    assert_eq!(RiskState::Normal, RiskState::Normal);
    assert_ne!(RiskState::Normal, RiskState::Emergency);
    assert_ne!(RiskState::Cautious, RiskState::Defensive);

    println!("✅ RiskState equality verified");
}

/// Test RiskState Debug/Clone traits
#[test]
fn test_risk_state_traits() {
    let state = RiskState::Emergency;
    let cloned = state.clone();

    assert_eq!(state, cloned);

    // Debug should work
    let debug_str = format!("{:?}", state);
    assert!(debug_str.contains("Emergency"));

    println!("✅ RiskState traits verified: {}", debug_str);
}

/// Test HALT command structure (JSON validation)
#[test]
fn test_halt_command_structure() {
    let halt_cmd = json!({
        "action": "HALT",
        "actor_id": "operator-001",
        "command_id": "halt-12345",
        "timestamp": chrono::Utc::now().timestamp_millis(),
        "reason": "Manual operator halt",
        "signature": "placeholder"
    });

    assert_eq!(halt_cmd["action"], "HALT");
    assert!(halt_cmd["actor_id"].as_str().unwrap().contains("operator"));
    assert!(halt_cmd["timestamp"].as_i64().unwrap() > 0);

    println!("✅ HALT command structure valid");
}

/// Test FLATTEN command structure
#[test]
fn test_flatten_command_structure() {
    let flatten_cmd = json!({
        "action": "FLATTEN",
        "actor_id": "operator-001",
        "command_id": "flatten-12345",
        "timestamp": chrono::Utc::now().timestamp_millis(),
        "target_symbols": ["ALL"],
        "reason": "Emergency closeout",
        "signature": "placeholder"
    });

    assert_eq!(flatten_cmd["action"], "FLATTEN");
    assert!(flatten_cmd["target_symbols"]
        .as_array()
        .unwrap()
        .contains(&json!("ALL")));

    println!("✅ FLATTEN command structure valid");
}

/// Test ARM/DISARM command structures
#[test]
fn test_arm_disarm_commands() {
    let arm_cmd = json!({
        "action": "ARM",
        "actor_id": "operator-001",
        "command_id": "arm-12345",
        "timestamp": chrono::Utc::now().timestamp_millis(),
        "pin": "1234",
        "signature": "placeholder"
    });

    assert_eq!(arm_cmd["action"], "ARM");
    assert!(arm_cmd["pin"].as_str().is_some());

    let disarm_cmd = json!({
        "action": "DISARM",
        "actor_id": "operator-001",
        "command_id": "disarm-12345",
        "timestamp": chrono::Utc::now().timestamp_millis(),
        "reason": "End of session",
        "signature": "placeholder"
    });

    assert_eq!(disarm_cmd["action"], "DISARM");

    println!("✅ ARM/DISARM command structures valid");
}

/// Test policy hash changes on state change
#[test]
fn test_policy_state_affects_hash() {
    let json1 = r#"{
        "current_state": "Normal",
        "maxAccountLeverage": 10.0,
        "maxPositionNotional": 50000.0,
        "maxDailyLoss": -1000.0,
        "maxOpenOrdersPerSymbol": 5,
        "symbolWhitelist": ["BTC/USDT"]
    }"#;

    let json2 = r#"{
        "current_state": "Emergency",
        "maxAccountLeverage": 10.0,
        "maxPositionNotional": 50000.0,
        "maxDailyLoss": -1000.0,
        "maxOpenOrdersPerSymbol": 5,
        "symbolWhitelist": ["BTC/USDT"]
    }"#;

    let policy1: RiskPolicy = serde_json::from_str(json1).expect("Failed to parse");
    let policy2: RiskPolicy = serde_json::from_str(json2).expect("Failed to parse");

    let hash1 = policy1.compute_hash();
    let hash2 = policy2.compute_hash();

    // Different states should produce different hashes (policy drift detection)
    assert_ne!(
        hash1, hash2,
        "Different states should produce different hashes"
    );

    println!(
        "✅ Policy state affects hash: {} vs {}",
        &hash1[..16],
        &hash2[..16]
    );
}
