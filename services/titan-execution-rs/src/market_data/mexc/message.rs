use serde::Deserialize;
use rust_decimal::Decimal;
use crate::market_data::model::{PublicTrade, Side};
use chrono::{Utc, TimeZone};

#[derive(Debug, Deserialize)]
pub struct MexcWsMessage {
    pub channel: Option<String>,
    pub data: Option<serde_json::Value>,
    pub symbol: Option<String>,
    pub ts: Option<i64>,
    // Ping/Pong/Sub response fields
    pub method: Option<String>,
    pub code: Option<i32>,
    pub msg: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MexcDeal {
    #[serde(alias = "p")]
    pub price: Decimal,
    #[serde(alias = "v")]
    pub vol: Decimal,
    #[serde(alias = "T")]
    pub side: i32, // 1: Buy, 2: Sell
    #[serde(alias = "t")]
    pub ts: i64,
}

impl MexcDeal {
    pub fn to_model(&self, symbol: &str) -> PublicTrade {
        PublicTrade {
            id: format!("{}-{}", symbol, self.ts), // MEXC doesn't give trade ID in push, generate derived ID
            symbol: symbol.to_string(),
            price: self.price,
            quantity: self.vol,
            side: match self.side {
                1 => Side::Buy,
                _ => Side::Sell,
            },
            timestamp: Utc.timestamp_millis_opt(self.ts).unwrap(),
            exchange: "MEXC_CONTRACT".to_string(),
        }
    }
}
