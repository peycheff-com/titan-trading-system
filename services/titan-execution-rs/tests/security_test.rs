//! Security Tests for HMAC Validation
//!
//! These tests verify that unsigned or improperly signed commands are rejected,
//! fulfilling GAP-06: Secrets & Privilege requirements.

use serde_json::json;

// Import the module under test
mod security_tests {
    use super::*;

    /// Helper to get current timestamp in milliseconds
    fn now_ms() -> i64 {
        chrono::Utc::now().timestamp_millis()
    }

    /// Test: Commands without a signature field are rejected
    #[test]
    fn test_unsigned_risk_command_rejected() {
        // Clear any existing secret to ensure validation fails properly
        std::env::remove_var("HMAC_SECRET");

        // Create validator with no secret configured
        let validator = titan_execution_rs::security::HmacValidator::new();

        let unsigned_payload = json!({
            "action": "HALT",
            "actor_id": "attacker",
            "command_id": "evil-123",
            "timestamp": now_ms()
            // Missing: signature field
        });

        let result = validator.validate_risk_command(&unsigned_payload);

        assert!(result.is_err(), "Unsigned command should be rejected");
        let err = result.unwrap_err();
        assert!(
            err.contains("Missing signature") || err.contains("no secret configured"),
            "Error should indicate missing signature or no secret, got: {}",
            err
        );
    }

    /// Test: Commands with invalid hex signature are rejected
    #[test]
    fn test_invalid_hex_signature_rejected() {
        std::env::set_var("HMAC_SECRET", "test-secret-key-12345");
        let validator = titan_execution_rs::security::HmacValidator::new();

        let bad_hex_payload = json!({
            "action": "HALT",
            "signature": "not-valid-hex!@#$",
            "actor_id": "attacker",
            "command_id": "evil-123",
            "timestamp": now_ms()
        });

        let result = validator.validate_risk_command(&bad_hex_payload);

        assert!(result.is_err(), "Invalid hex signature should be rejected");
        let err = result.unwrap_err();
        assert!(
            err.contains("hex") || err.contains("signature"),
            "Error should mention hex or signature issue, got: {}",
            err
        );

        // Cleanup
        std::env::remove_var("HMAC_SECRET");
    }

    /// Test: Commands with wrong signature (valid hex but wrong HMAC) are rejected
    #[test]
    fn test_wrong_signature_rejected() {
        std::env::set_var("HMAC_SECRET", "real-secret-key");
        let validator = titan_execution_rs::security::HmacValidator::new();

        // Valid hex, but completely wrong signature
        let wrong_sig_payload = json!({
            "action": "HALT",
            "signature": "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
            "actor_id": "attacker",
            "command_id": "evil-456",
            "timestamp": now_ms()
        });

        let result = validator.validate_risk_command(&wrong_sig_payload);

        assert!(result.is_err(), "Wrong signature should be rejected");
        let err = result.unwrap_err();
        assert!(
            err.contains("mismatch")
                || err.contains("Signature")
                || err.contains("no secret configured"),
            "Error should indicate signature mismatch or missing config, got: {}",
            err
        );

        // Cleanup
        std::env::remove_var("HMAC_SECRET");
    }

    /// Test: Commands with expired timestamp are rejected
    #[test]
    fn test_expired_timestamp_rejected() {
        std::env::set_var("HMAC_SECRET", "test-secret");
        std::env::set_var("HMAC_TIMESTAMP_TOLERANCE", "60"); // 60 seconds tolerance
        let validator = titan_execution_rs::security::HmacValidator::new();

        // Timestamp from 10 minutes ago (exceeds 60s tolerance)
        let old_timestamp = now_ms() - (10 * 60 * 1000);

        let expired_payload = json!({
            "action": "HALT",
            "signature": "deadbeef",
            "actor_id": "attacker",
            "command_id": "old-123",
            "timestamp": old_timestamp
        });

        let result = validator.validate_risk_command(&expired_payload);

        assert!(result.is_err(), "Expired timestamp should be rejected");
        let err = result.unwrap_err();
        assert!(
            err.contains("tolerance") || err.contains("Timestamp"),
            "Error should indicate timestamp issue, got: {}",
            err
        );

        // Cleanup
        std::env::remove_var("HMAC_SECRET");
        std::env::remove_var("HMAC_TIMESTAMP_TOLERANCE");
    }

    /// Test: Commands missing required fields are rejected
    #[test]
    fn test_missing_fields_rejected() {
        std::env::set_var("HMAC_SECRET", "test-secret");
        let validator = titan_execution_rs::security::HmacValidator::new();

        // Missing action
        let missing_action = json!({
            "signature": "deadbeef",
            "actor_id": "user",
            "command_id": "cmd-1",
            "timestamp": now_ms()
        });
        assert!(
            validator.validate_risk_command(&missing_action).is_err(),
            "Missing action should be rejected"
        );

        // Missing actor_id
        let missing_actor = json!({
            "action": "HALT",
            "signature": "deadbeef",
            "command_id": "cmd-1",
            "timestamp": now_ms()
        });
        assert!(
            validator.validate_risk_command(&missing_actor).is_err(),
            "Missing actor_id should be rejected"
        );

        // Missing command_id
        let missing_cmd = json!({
            "action": "HALT",
            "signature": "deadbeef",
            "actor_id": "user",
            "timestamp": now_ms()
        });
        assert!(
            validator.validate_risk_command(&missing_cmd).is_err(),
            "Missing command_id should be rejected"
        );

        // Missing timestamp
        let missing_ts = json!({
            "action": "HALT",
            "signature": "deadbeef",
            "actor_id": "user",
            "command_id": "cmd-1"
        });
        assert!(
            validator.validate_risk_command(&missing_ts).is_err(),
            "Missing timestamp should be rejected"
        );

        // Cleanup
        std::env::remove_var("HMAC_SECRET");
    }
}
