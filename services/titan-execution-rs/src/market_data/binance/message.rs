use crate::market_data::model::{PublicTrade, Side};
use chrono::{TimeZone, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct BinanceWsMessage {
    pub e: String, // Event type
    #[allow(dead_code)]
    #[serde(rename = "E")]
    pub event_time: i64, // Event time
    pub s: String, // Symbol
    // Agg trade fields
    pub a: Option<i64>,     // Agg trade ID
    pub p: Option<Decimal>, // Price
    pub q: Option<Decimal>, // Quantity
    pub m: Option<bool>,    // Is buyer maker?
}

// Support for stream wrapper: {"stream":"...", "data": ...}
#[derive(Debug, Deserialize)]
pub struct BinanceStreamWrapper {
    pub stream: String,
    pub data: BinanceWsMessage,
}

impl BinanceWsMessage {
    pub fn to_model(&self) -> Option<PublicTrade> {
        if self.e != "aggTrade" {
            return None;
        }

        let price = self.p?;
        let qty = self.q?;
        // If buyer is maker (m=true), then Aggressor is Seller -> Side::Sell
        // If buyer is NOT maker (m=false), then Aggressor is Buyer -> Side::Buy
        let side = if self.m.unwrap_or(false) {
            Side::Sell
        } else {
            Side::Buy
        };

        Some(PublicTrade {
            id: self
                .a
                .map(|id| id.to_string())
                .unwrap_or_else(|| format!("{}-{}", self.s, self.event_time)),
            symbol: self.s.clone(),
            price,
            quantity: qty,
            side,
            timestamp: Utc.timestamp_millis_opt(self.event_time).unwrap(), // Event time
            exchange: "BINANCE_FUTURES".to_string(),
        })
    }
}
