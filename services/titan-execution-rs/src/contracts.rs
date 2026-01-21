// Example code that deserializes and serializes the model.
// extern crate serde;
// #[macro_use]
// extern crate serde_derive;
// extern crate serde_json;
//
// use generated_module::BaseCommand;
//
// fn main() {
//     let json = r#"{"answer": 42}"#;
//     let model: BaseCommand = serde_json::from_str(&json).unwrap();
// }

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaseCommand {
    pub idempotency_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Envelope {
    pub causation_id: Option<String>,

    pub correlation_id: Option<String>,

    pub id: Option<String>,

    pub idempotency_key: Option<String>,

    pub partition_key: Option<String>,

    pub payload: HashMap<String, Option<serde_json::Value>>,

    pub producer: String,

    pub ts: Option<i64>,

    #[serde(rename = "type")]
    pub envelope_type: String,

    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntentEnvelope {
    pub causation_id: Option<String>,

    pub correlation_id: Option<String>,

    pub id: Option<String>,

    pub idempotency_key: Option<String>,

    pub partition_key: Option<String>,

    pub payload: Payload,

    pub producer: String,

    pub ts: Option<i64>,

    #[serde(rename = "type")]
    pub intent_envelope_type: String,

    pub version: i64,

    // Security Fields (Jan 2026 Audit)
    pub sig: Option<String>,
    pub key_id: Option<String>,
    pub nonce: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Payload {
    pub confidence: Option<f64>,

    pub direction: i64,

    pub entry_zone: Option<Vec<f64>>,

    pub exchange: Option<String>,

    pub expected_impact_bps: Option<f64>,

    pub fill_feasibility: Option<f64>,

    pub leverage: Option<f64>,

    pub max_slippage_bps: Option<i64>,

    pub metadata: Option<HashMap<String, Option<serde_json::Value>>>,

    pub parent_strategy: Option<String>,

    pub phase: Option<i64>,

    pub position_mode: Option<String>,

    pub regime_state: Option<i64>,

    pub rejection_reason: Option<String>,

    pub schema_version: Option<String>,

    pub signal_id: String,

    pub size: f64,

    pub source: Option<String>,

    pub status: Status,

    pub stop_loss: Option<f64>,

    pub symbol: String,

    pub t_analysis: Option<i64>,

    pub t_decision: Option<i64>,

    pub t_exchange: Option<i64>,

    pub t_ingress: Option<i64>,

    pub t_signal: Option<i64>,

    pub take_profits: Option<Vec<f64>>,

    pub timestamp: Option<i64>,

    pub trap_type: Option<String>,

    #[serde(rename = "type")]
    pub payload_type: Type,

    pub velocity: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Type {
    #[serde(rename = "BUY_SETUP")]
    BuySetup,

    Close,

    #[serde(rename = "CLOSE_LONG")]
    CloseLong,

    #[serde(rename = "CLOSE_SHORT")]
    CloseShort,

    #[serde(rename = "SELL_SETUP")]
    SellSetup,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Status {
    Executed,

    #[serde(rename = "EXECUTED_PARTIAL")]
    ExecutedPartial,

    Expired,

    Failed,

    Pending,

    Rejected,

    Validated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntentPayload {
    pub confidence: Option<f64>,

    pub direction: i64,

    pub entry_zone: Option<Vec<f64>>,

    pub exchange: Option<String>,

    pub expected_impact_bps: Option<f64>,

    pub fill_feasibility: Option<f64>,

    pub leverage: Option<f64>,

    pub max_slippage_bps: Option<i64>,

    pub metadata: Option<HashMap<String, Option<serde_json::Value>>>,

    pub parent_strategy: Option<String>,

    pub phase: Option<i64>,

    pub position_mode: Option<String>,

    pub regime_state: Option<i64>,

    pub rejection_reason: Option<String>,

    pub schema_version: Option<String>,

    pub signal_id: String,

    pub size: f64,

    pub source: Option<String>,

    pub status: Status,

    pub stop_loss: Option<f64>,

    pub symbol: String,

    pub t_analysis: Option<i64>,

    pub t_decision: Option<i64>,

    pub t_exchange: Option<i64>,

    pub t_ingress: Option<i64>,

    pub t_signal: Option<i64>,

    pub take_profits: Option<Vec<f64>>,

    pub timestamp: Option<i64>,

    pub trap_type: Option<String>,

    #[serde(rename = "type")]
    pub intent_payload_type: Type,

    pub velocity: Option<f64>,
}
