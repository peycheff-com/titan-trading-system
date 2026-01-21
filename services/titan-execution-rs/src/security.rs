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
    require_timestamp: bool,
    timestamp_tolerance: i64, // seconds
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

        if secret.is_empty() {
            warn!(
                "⚠️ HMAC_SECRET not set. Security validation will be disabled or fail if enforced."
            );
        } else {
            info!(
                "🔐 HMAC Validator initialized (tol: {}s)",
                timestamp_tolerance
            );
        }

        Self {
            secret,
            require_timestamp,
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
        let expected_sig = hex::encode(expected_bytes);

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
            .map_err(|_| format!("Signature mismatch."))?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
