use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Side {
    #[serde(rename = "BUY")]
    Buy,
    #[serde(rename = "SELL")]
    Sell,
    #[serde(rename = "LONG")]
    Long,
    #[serde(rename = "SHORT")]
    Short,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OrderType {
    #[serde(rename = "LIMIT")]
    Limit,
    #[serde(rename = "MARKET")]
    Market,
    #[serde(rename = "STOP_LOSS")]
    StopLoss,
    #[serde(rename = "STOP_LOSS_LIMIT")]
    StopLossLimit,
    #[serde(rename = "TAKE_PROFIT")]
    TakeProfit,
    #[serde(rename = "TAKE_PROFIT_LIMIT")]
    TakeProfitLimit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IntentType {
    #[serde(rename = "BUY_SETUP")]
    BuySetup,
    #[serde(rename = "SELL_SETUP")]
    SellSetup,
    #[serde(rename = "CLOSE_LONG")]
    CloseLong,
    #[serde(rename = "CLOSE_SHORT")]
    CloseShort,
    #[serde(rename = "CLOSE")]
    Close,
    #[serde(rename = "FORCE_SYNC")]
    ForceSync,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum IntentStatus {
    #[serde(rename = "PENDING")]
    Pending,
    #[serde(rename = "VALIDATED")]
    Validated,
    #[serde(rename = "PARTIALLY_FILLED")]
    PartiallyFilled,
    #[serde(rename = "EXECUTED")]
    Executed,
    #[serde(rename = "PARTIALLY_COMPLETED")]
    PartiallyCompleted, // Terminal state: e.g. time expired with some fills
    #[serde(rename = "CANCELLED")]
    Cancelled,
    #[serde(rename = "FAILED_WITH_EXPOSURE")]
    FailedWithExposure, // Terminal state: bad state, requires operator
    #[serde(rename = "REJECTED")]
    Rejected,
    #[serde(rename = "EXPIRED")]
    Expired,
}

impl IntentStatus {
    pub fn is_active(&self) -> bool {
        matches!(
            self,
            IntentStatus::Pending | IntentStatus::Validated | IntentStatus::PartiallyFilled
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Intent {
    pub signal_id: String,
    #[serde(default)]
    pub source: Option<String>,
    pub symbol: String,
    pub direction: i32, // 1 for long, -1 for short
    #[serde(rename = "type")]
    pub intent_type: IntentType,
    #[serde(default)]
    pub entry_zone: Vec<Decimal>,
    #[serde(default)]
    pub stop_loss: Decimal,
    #[serde(default)]
    pub take_profits: Vec<Decimal>,
    #[serde(default)]
    pub size: Decimal,
    pub status: IntentStatus,

    // Execution Progress (Multi-Venue Aggregation)
    #[serde(default)]
    pub filled_size: Decimal,
    #[serde(default)]
    pub child_fills: Vec<String>, // List of idempotent execution_ids processed

    // Envelope Standards
    #[serde(default)]
    pub ttl_ms: Option<i64>,
    #[serde(default)]
    pub partition_key: Option<String>,
    #[serde(default)]
    pub causation_id: Option<String>,
    #[serde(default)]
    pub env: Option<String>, // e.g., "prod", "staging"
    #[serde(default)]
    pub subject: Option<String>, // e.g., "market.btc.signal"

    // Time enforcement
    #[serde(alias = "timestamp")]
    pub t_signal: i64,
    pub t_analysis: Option<i64>,
    pub t_decision: Option<i64>,
    pub t_ingress: Option<i64>,
    pub t_exchange: Option<i64>,

    #[serde(default)]
    pub max_slippage_bps: Option<i32>,

    #[serde(default)]
    pub rejection_reason: Option<String>,
    pub regime_state: Option<i32>,
    pub phase: Option<i32>,
    pub metadata: Option<serde_json::Value>,
    #[serde(default)]
    pub exchange: Option<String>,
    #[serde(default)]
    pub policy_hash: Option<String>,
    #[serde(default)]
    pub position_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Position {
    pub symbol: String,
    pub side: Side,
    pub size: Decimal,
    pub entry_price: Decimal,
    pub stop_loss: Decimal,
    pub take_profits: Vec<Decimal>,
    pub signal_id: String,
    pub opened_at: DateTime<Utc>,
    pub regime_state: Option<i32>,
    pub phase: Option<i32>,
    pub metadata: Option<serde_json::Value>,
    #[serde(default)]
    pub exchange: Option<String>,
    #[serde(default)]
    pub position_mode: Option<String>,

    // PnL & Fees
    #[serde(default)]
    pub realized_pnl: Decimal,
    #[serde(default)]
    pub unrealized_pnl: Decimal,
    #[serde(default)]
    pub fees_paid: Decimal,
    #[serde(default)]
    pub funding_paid: Decimal,
    #[serde(default)]
    pub last_mark_price: Option<Decimal>,
    #[serde(default)]
    pub last_update_ts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeRecord {
    pub signal_id: String,
    pub symbol: String,
    pub side: Side,
    pub entry_price: Decimal,
    pub exit_price: Decimal,
    pub size: Decimal,
    pub pnl: Decimal,
    pub pnl_pct: Decimal,
    pub fee: Decimal,
    pub fee_asset: String,
    pub opened_at: DateTime<Utc>,
    pub closed_at: DateTime<Utc>,
    pub close_reason: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DexFillProof {
    pub sig: String,
    pub block_height: u64,
    pub tx_hash: String,
    pub gas_used: Decimal,
    pub program_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillReport {
    pub fill_id: String,
    pub signal_id: String,
    pub symbol: String,
    pub side: Side,
    pub price: Decimal,
    pub qty: Decimal,
    pub fee: Decimal,
    pub fee_currency: String,
    pub t_signal: i64,
    pub t_ingress: i64,
    pub t_decision: i64,
    pub t_ack: i64,
    pub t_exchange: i64,
    pub client_order_id: String,
    pub execution_id: String,
    #[serde(default)]
    pub dex_proof: Option<DexFillProof>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderParams {
    pub signal_id: String,
    pub symbol: String,
    pub side: Side,
    pub size: Decimal,
    pub limit_price: Option<Decimal>,
    pub stop_loss: Option<Decimal>,
    pub take_profits: Option<Vec<Decimal>>,
    pub signal_type: Option<String>,
    pub expected_profit_pct: Option<Decimal>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeeAnalysis {
    pub maker_fee_pct: Decimal,
    pub taker_fee_pct: Decimal,
    pub expected_profit_pct: Decimal,
    pub profit_after_maker: Decimal,
    pub profit_after_taker: Decimal,
    pub taker_profitable: bool,
    #[serde(default)]
    pub estimated_impact_pct: Decimal,
    #[serde(default)]
    pub profit_after_impact_maker: Decimal,
    #[serde(default)]
    pub profit_after_impact_taker: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderDecision {
    pub order_type: OrderType, // LIMIT, MARKET
    pub post_only: bool,
    pub reduce_only: bool,
    pub limit_price: Option<Decimal>,
    pub reason: String,
    pub fee_analysis: Option<FeeAnalysis>,
}

// --- Phase 2: Drift & Regimes ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DriftClass {
    /// Class A: Spread Capture Failure (Execution Price vs Arrival Mid > Threshold)
    ClassASpread,
    /// Class B: Latency Decay (t_exchange - t_decision > Budget)
    ClassBLatency,
    /// Class C: Correlation Breakdown (Leader vs Laggard Divergence > Threshold)
    ClassCCorrelation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftReport {
    pub signal_id: String,
    pub symbol: String,
    pub drift_class: DriftClass,
    pub expected: f64,
    pub actual: f64,
    pub deviation_bps: f64,
    pub timestamp: i64,
}
