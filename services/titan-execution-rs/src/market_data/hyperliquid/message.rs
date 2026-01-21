use crate::market_data::model::{PublicTrade, Side};
use chrono::{TimeZone, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(tag = "channel")]
pub enum HyperliquidMessage {
    #[serde(rename = "trades")]
    Trades { data: Vec<HyperliquidTrade> },
    #[serde(rename = "l2Book")]
    L2Book { data: HyperliquidBook },
    #[serde(rename = "subscriptionResponse")]
    SubscriptionResponse { data: serde_json::Value },
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Deserialize)]
pub struct HyperliquidTrade {
    pub coin: String,
    pub side: String, // "B" or "A"? Or "Buy"/"Sell"? Typically "B"/"S" in HL
    pub px: String,   // Price (string)
    pub sz: String,   // Size (string)
    pub time: i64,    // Timestamp
    pub hash: String, // Trade hash/id
}

#[derive(Debug, Deserialize)]
pub struct HyperliquidBook {
    pub coin: String,
    pub time: i64,
    pub levels: Vec<Vec<HyperliquidLevel>>, // [[px, sz, n], ...] ?? actually levels is usually [[px, sz, num_orders], ...]
}

#[derive(Debug, Deserialize)]
pub struct HyperliquidLevel {
    pub px: String,
    pub sz: String,
    pub n: u64,
}

impl HyperliquidTrade {
    pub fn to_model(&self) -> Option<PublicTrade> {
        let price = Decimal::from_str_exact(&self.px).ok()?;
        let quantity = Decimal::from_str_exact(&self.sz).ok()?;

        // "B" = Buy, "A" = Sell (Ask)? Or "S"?
        // Hyperliquid docs usually say side is "B" or "A" (Bid/Ask taker side)
        let side = match self.side.as_str() {
            "B" => Side::Buy,
            "A" | "S" => Side::Sell,
            _ => Side::Buy, // Default?
        };

        Some(PublicTrade {
            id: self.hash.clone(),
            symbol: self.coin.clone(),
            price,
            quantity,
            side,
            timestamp: Utc.timestamp_millis_opt(self.time).unwrap(),
            exchange: "HYPERLIQUID".to_string(),
        })
    }
}
