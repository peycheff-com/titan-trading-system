use crate::contracts::IntentEnvelope;
use hex;
use hmac::{Hmac, Mac};
use serde_json::Value;
use sha2::Sha256;
use std::env;
use tracing::{info, warn};

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone)]
pub struct HmacValidator {
    secret: String,
    _require_timestamp: bool,
    timestamp_tolerance: i64, // seconds
}

impl Default for HmacValidator {
    fn default() -> Self {
        Self::new()
    }
}

impl HmacValidator {
    pub fn new() -> Self {
        // Load from env
        let secret = env::var("HMAC_SECRET").unwrap_or_default();
        let require_timestamp =
            env::var("HMAC_REQUIRE_TIMESTAMP").unwrap_or("true".to_string()) != "false";
        let timestamp_tolerance = env::var("HMAC_TIMESTAMP_TOLERANCE")
            .unwrap_or("300".to_string())
            .parse::<i64>()
            .unwrap_or(300);

        // FAIL-CLOSED INVARIANT: Empty secret is FATAL unless explicitly allowed for testing
        // This prevents production startup with missing credentials
        if secret.is_empty() {
            let allow_empty = env::var("HMAC_ALLOW_EMPTY_SECRET")
                .map(|v| v == "true")
                .unwrap_or(false);

            if allow_empty {
                warn!("⚠️ HMAC_SECRET not set but HMAC_ALLOW_EMPTY_SECRET=true. TEST MODE ONLY.");
            } else {
                panic!(
                    "FATAL: HMAC_SECRET environment variable is required. \
                     Set HMAC_ALLOW_EMPTY_SECRET=true only for testing."
                );
            }
        } else {
            info!(
                "🔐 HMAC Validator initialized (tol: {}s)",
                timestamp_tolerance
            );
        }

        Self {
            secret,
            _require_timestamp: require_timestamp,
            timestamp_tolerance,
        }
    }

    pub fn validate(
        &self,
        envelope: &IntentEnvelope,
        raw_payload_value: &Value,
    ) -> Result<(), String> {
        if self.secret.is_empty() {
            // Fail open if not configured? No, we want security.
            // But if user hasn't set env var yet, system breaks.
            // Assuming this is deployed with secrets.
            return Err("HMAC validation enabled but no secret configured".to_string());
        }

        // 1. Check existence
        let sig = envelope.sig.as_deref().ok_or("Missing signature")?;
        let nonce = envelope.nonce.as_deref().ok_or("Missing nonce")?;
        let ts = envelope.ts.ok_or("Missing timestamp")?;

        // 2. Timestamp (drift)
        // envelope.ts is i64 (millis).
        let now_ms = chrono::Utc::now().timestamp_millis();
        let diff = (now_ms - ts).abs();
        let tolerance_ms = self.timestamp_tolerance * 1000;

        if diff > tolerance_ms {
            return Err(format!(
                "Timestamp out of tolerance range (diff: {}ms, tolerance: {}ms)",
                diff, tolerance_ms
            ));
        }

        // 3. Reconstruct Payload
        // We use the raw_payload_value (serde_json::Value of the 'payload' field)
        // serde_json::to_string uses BTreeMap for objects, which sorts keys ALPHABETICALLY.
        // This MUST match Node's canonicalize() which sorts keys.
        let payload_str = serde_json::to_string(raw_payload_value)
            .map_err(|e| format!("Failed to serialize payload: {}", e))?;

        // 4. Canonical String: ts.nonce.payload_json
        let canonical = format!("{}.{}.{}", ts, nonce, payload_str);

        // 5. Verify
        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes())
            .map_err(|_| "Invalid secret key length".to_string())?;

        mac.update(canonical.as_bytes());
        let result = mac.finalize();
        let expected_bytes = result.into_bytes();
        let _expected_sig = hex::encode(expected_bytes);

        // Constant time comparison
        // But we are in Rust, hex string comparison is not constant time usually.
        // We should verify bytes.
        let sig_bytes = hex::decode(sig).map_err(|_| "Invalid hex signature")?;

        // Hmac crate provides verify method which is constant time
        let mut mac_verify = HmacSha256::new_from_slice(self.secret.as_bytes())
            .map_err(|_| "Invalid secret key length".to_string())?;
        mac_verify.update(canonical.as_bytes());

        mac_verify
            .verify_slice(&sig_bytes)
            .map_err(|_| "Signature mismatch.".to_string())?;

        Ok(())
    }

    /// Validate a Risk Command (Halt/Override) using deterministic signature
    /// Sig String: timestamp:action:actor_id:command_id
    pub fn validate_risk_command(&self, payload: &Value) -> Result<(), String> {
        if self.secret.is_empty() {
            return Err("HMAC validation enabled but no secret configured".to_string());
        }

        let signature = payload
            .get("signature")
            .and_then(|s| s.as_str())
            .ok_or("Missing signature")?;
        let timestamp = payload
            .get("timestamp")
            .and_then(|t| t.as_i64())
            .ok_or("Missing timestamp")?;
        let action = payload
            .get("action")
            .and_then(|s| s.as_str())
            .ok_or("Missing action")?;
        let actor_id = payload
            .get("actor_id")
            .and_then(|s| s.as_str())
            .ok_or("Missing actor_id")?;
        let command_id = payload
            .get("command_id")
            .and_then(|s| s.as_str())
            .ok_or("Missing command_id")?;

        // 1. Check Timestamp Tolerance
        let now_ms = chrono::Utc::now().timestamp_millis();
        let diff = (now_ms - timestamp).abs();
        let tolerance_ms = self.timestamp_tolerance * 1000;

        if diff > tolerance_ms {
            return Err(format!(
                "Timestamp out of tolerance range (diff: {}ms, tolerance: {}ms)",
                diff, tolerance_ms
            ));
        }

        // 2. Reconstruct Sig String
        let sig_string = format!("{}:{}:{}:{}", timestamp, action, actor_id, command_id);

        // 3. Verify
        let mut mac = HmacSha256::new_from_slice(self.secret.as_bytes())
            .map_err(|_| "Invalid secret key length".to_string())?;

        mac.update(sig_string.as_bytes());

        let sig_bytes = hex::decode(signature).map_err(|_| "Invalid hex signature")?;
        mac.verify_slice(&sig_bytes)
            .map_err(|_| "Signature mismatch".to_string())?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {

    use serde_json::json;

    #[test]
    fn test_hmac_canonicalization() {
        // Simulate Node.js behavior: Keys sorted alphabetically
        // Node: JSON.stringify({b: 2, a: 1}) -> '{"a":1,"b":2}'
        let payload = json!({
            "b": 2,
            "a": 1,
            "c": [3, 2, 1] // Arrays preserve order
        });

        let serialized = serde_json::to_string(&payload).unwrap();
        assert_eq!(serialized, r#"{"a":1,"b":2,"c":[3,2,1]}"#);
    }
}
