use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicTrade {
    pub id: String,
    pub symbol: String,
    pub price: Decimal,
    pub quantity: Decimal,
    pub side: Side,
    pub timestamp: DateTime<Utc>,
    pub exchange: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBookLevel {
    pub price: Decimal,
    pub quantity: Decimal,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBookL2 {
    pub symbol: String,
    pub bids: Vec<OrderBookLevel>,
    pub asks: Vec<OrderBookLevel>,
    pub timestamp: DateTime<Utc>,
    pub update_id: u64,
    pub is_snapshot: bool,
    pub exchange: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FundingRate {
    pub symbol: String,
    pub rate: Decimal,
    pub timestamp: DateTime<Utc>,
    pub next_funding_time: DateTime<Utc>,
    pub exchange: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Liquidation {
    pub symbol: String,
    pub side: Side,
    pub price: Decimal,
    pub quantity: Decimal,
    pub timestamp: DateTime<Utc>,
    pub exchange: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MarketDataEvent {
    Trade(PublicTrade),
    OrderBook(OrderBookL2),
    Funding(FundingRate),
    Liquidation(Liquidation),
}
