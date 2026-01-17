use serde::{Deserialize, Serialize};
use serde_json;
use rust_decimal::Decimal;
use chrono::{DateTime, Utc};


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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IntentStatus {
    #[serde(rename = "PENDING")]
    Pending,
    #[serde(rename = "VALIDATED")]
    Validated,
    #[serde(rename = "REJECTED")]
    Rejected,
    #[serde(rename = "EXECUTED")]
    Executed,
    #[serde(rename = "EXPIRED")]
    Expired,
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
    pub received_at: DateTime<Utc>,
    pub rejection_reason: Option<String>,
    pub regime_state: Option<i32>,
    pub phase: Option<i32>,
    pub metadata: Option<serde_json::Value>,
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
    pub opened_at: DateTime<Utc>,
    pub closed_at: DateTime<Utc>,
    pub close_reason: String,
    pub metadata: Option<serde_json::Value>,
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
