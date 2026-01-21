use serde_json::{Map, Value};

use crate::model::Intent;

const ALLOWED_TYPES: [&str; 5] = [
    "BUY_SETUP",
    "SELL_SETUP",
    "CLOSE_LONG",
    "CLOSE_SHORT",
    "CLOSE",
];

const ALLOWED_STATUSES: [&str; 5] = [
    "PENDING",
    "VALIDATED",
    "REJECTED",
    "EXECUTED",
    "EXPIRED",
];

fn require_string(obj: &Map<String, Value>, key: &str) -> Result<String, String> {
    match obj.get(key) {
        Some(Value::String(s)) if !s.trim().is_empty() => Ok(s.clone()),
        Some(_) => Err(format!("{} must be a non-empty string", key)),
        None => Err(format!("{} is required", key)),
    }
}

fn require_number(obj: &Map<String, Value>, key: &str) -> Result<i64, String> {
    match obj.get(key) {
        Some(Value::Number(n)) => n
            .as_i64()
            .or_else(|| n.as_f64().map(|v| v as i64))
            .ok_or_else(|| format!("{} must be a number", key)),
        Some(_) => Err(format!("{} must be a number", key)),
        None => Err(format!("{} is required", key)),
    }
}

fn require_float(obj: &Map<String, Value>, key: &str) -> Result<f64, String> {
    match obj.get(key) {
        Some(Value::Number(n)) => n
            .as_f64()
            .ok_or_else(|| format!("{} must be a number", key)),
        Some(_) => Err(format!("{} must be a number", key)),
        None => Err(format!("{} is required", key)),
    }
}

pub fn validate_intent_payload(payload: &[u8]) -> Result<Intent, String> {
    let mut value: Value = serde_json::from_slice(payload)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    let obj = value
        .as_object_mut()
        .ok_or_else(|| "Payload must be a JSON object".to_string())?;

    if !obj.contains_key("t_signal") {
        if let Some(timestamp) = obj.get("timestamp") {
            obj.insert("t_signal".to_string(), timestamp.clone());
            obj.remove("timestamp");
        }
    }

    if !obj.contains_key("entry_zone") || obj.get("entry_zone").map(|v| v.is_null()).unwrap_or(false) {
        obj.insert("entry_zone".to_string(), Value::Array(vec![]));
    }

    if !obj.contains_key("take_profits") || obj.get("take_profits").map(|v| v.is_null()).unwrap_or(false) {
        obj.insert("take_profits".to_string(), Value::Array(vec![]));
    }

    let _signal_id = require_string(obj, "signal_id")?;
    let _symbol = require_string(obj, "symbol")?;
    let direction = require_number(obj, "direction")?;
    if ![-1, 0, 1].contains(&direction) {
        return Err("direction must be -1, 0, or 1".to_string());
    }

    let intent_type = require_string(obj, "type")?;
    if !ALLOWED_TYPES.contains(&intent_type.as_str()) {
        return Err(format!("type must be one of: {:?}", ALLOWED_TYPES));
    }

    let status = require_string(obj, "status")?;
    if !ALLOWED_STATUSES.contains(&status.as_str()) {
        return Err(format!("status must be one of: {:?}", ALLOWED_STATUSES));
    }

    let _size = require_float(obj, "size")?;
    let _t_signal = require_number(obj, "t_signal")?;

    // Try a round-trip into the Rust Intent struct for strict typing
    let intent: Intent = serde_json::from_value(Value::Object(obj.clone()))
        .map_err(|e| format!("Schema mismatch: {}", e))?;

    Ok(intent)
}

#[cfg(test)]
mod tests {
    use super::validate_intent_payload;
    use serde_json::json;

    #[test]
    fn accepts_timestamp_alias() {
        let payload = json!({
            "signal_id": "sig-1",
            "symbol": "BTC/USD",
            "direction": 1,
            "type": "BUY_SETUP",
            "size": 1,
            "status": "PENDING",
            "timestamp": 123456
        });

        let bytes = serde_json::to_vec(&payload).unwrap();
        let result = validate_intent_payload(&bytes);
        assert!(result.is_ok(), "{}", result.err().unwrap_or_else(|| "unknown error".to_string()));
    }

    #[test]
    fn rejects_missing_t_signal() {
        let payload = json!({
            "signal_id": "sig-2",
            "symbol": "BTC/USD",
            "direction": 1,
            "type": "BUY_SETUP",
            "size": 1,
            "status": "PENDING"
        });

        let bytes = serde_json::to_vec(&payload).unwrap();
        let result = validate_intent_payload(&bytes);
        assert!(result.is_err());
    }
}
