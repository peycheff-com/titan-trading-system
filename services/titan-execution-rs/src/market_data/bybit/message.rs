use crate::market_data::model::{PublicTrade, Side};
use chrono::{TimeZone, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct BybitWsMessage {
    pub topic: Option<String>,
    #[serde(alias = "type")]
    pub msg_type: Option<String>,
    pub ts: Option<i64>,
    pub data: Option<serde_json::Value>,
    // Heartbeat check
    pub op: Option<String>,
    pub success: Option<bool>,
    pub ret_msg: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BybitTrade {
    #[serde(alias = "T")]
    pub timestamp: i64,
    #[serde(alias = "s")]
    pub symbol: String,
    #[serde(alias = "S")]
    pub side: String,
    #[serde(alias = "v")]
    pub size: Decimal,
    #[serde(alias = "p")]
    pub price: Decimal,
    #[serde(alias = "i")]
    pub trade_id: String,
    #[serde(alias = "L")]
    pub tick_direction: Option<String>,
    #[serde(alias = "B")]
    pub block_trade_id: Option<String>,
    #[serde(alias = "BT")]
    pub is_block_trade: Option<bool>,
}

impl BybitTrade {
    pub fn to_model(&self) -> PublicTrade {
        PublicTrade {
            id: self.trade_id.clone(),
            symbol: self.symbol.clone(),
            price: self.price,
            quantity: self.size,
            side: match self.side.as_str() {
                "Buy" => Side::Buy,
                _ => Side::Sell,
            },
            timestamp: Utc.timestamp_millis_opt(self.timestamp).unwrap(),
            exchange: "BYBIT_LINEAR".to_string(),
        }
    }
} // Close BybitTrade impl

#[derive(Debug, Deserialize)]
pub struct BybitOrderBook {
    #[serde(alias = "s")]
    pub symbol: String,
    #[serde(alias = "u")]
    pub update_id: u64,
    #[serde(alias = "b")]
    pub bids: Vec<(String, String)>,
    #[serde(alias = "a")]
    pub asks: Vec<(String, String)>,
}

use crate::market_data::model::{OrderBookL2, OrderBookLevel};

impl BybitOrderBook {
    pub fn to_model(&self, ts: i64, is_snapshot: bool) -> Option<OrderBookL2> {
        let parse_levels = |levels: &Vec<(String, String)>| -> Vec<OrderBookLevel> {
            levels
                .iter()
                .filter_map(|(p, s)| {
                    Some(OrderBookLevel {
                        price: Decimal::from_str_exact(p).ok()?,
                        quantity: Decimal::from_str_exact(s).ok()?,
                    })
                })
                .collect()
        };

        Some(OrderBookL2 {
            symbol: self.symbol.clone(),
            bids: parse_levels(&self.bids),
            asks: parse_levels(&self.asks),
            timestamp: Utc.timestamp_millis_opt(ts).unwrap(),
            update_id: self.update_id,
            is_snapshot,
            exchange: "BYBIT_LINEAR".to_string(),
        })
    }
}
