use crate::exchange::adapter::{ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse};
use crate::model::{Position, Side};
use async_trait::async_trait;
use chrono::Utc;
use hex;
use hmac::{Hmac, Mac};
use reqwest::Client;
use rust_decimal::Decimal;
use sha2::Sha256;
use std::env;

use crate::rate_limiter::TokenBucket;

pub struct BinanceAdapter {
    api_key: String,
    secret_key: String,
    base_url: String,
    client: Client,
    http_limiter: TokenBucket,
    _ws_limiter: TokenBucket,
}

use crate::config::ExchangeConfig;

impl BinanceAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let api_key = config
            .and_then(|c| c.get_api_key())
            .or_else(|| env::var("BINANCE_API_KEY").ok())
            .ok_or_else(|| {
                ExchangeError::Configuration(
                    "BINANCE_API_KEY not set (check config.json or env)".to_string(),
                )
            })?;

        let secret_key = config
            .and_then(|c| c.get_secret_key())
            .or_else(|| env::var("BINANCE_SECRET_KEY").ok())
            .ok_or_else(|| {
                ExchangeError::Configuration(
                    "BINANCE_SECRET_KEY not set (check config.json or env)".to_string(),
                )
            })?;

        let base_url = env::var("BINANCE_BASE_URL").unwrap_or_else(|_| {
            if config.map(|c| c.testnet).unwrap_or(true) {
                "https://testnet.binancefuture.com".to_string()
            } else {
                "https://fapi.binance.com".to_string()
            }
        });

        // HTTP Limit: ~2400 req/min => 40 req/sec. Burst 50.
        // Or overload from config
        let rate_limit = config.and_then(|c| c.rate_limit).unwrap_or(40) as f64;
        let http_limiter = TokenBucket::new(50, rate_limit);

        // WS Limit: ~5 messages/sec (orders). Burst 10.
        let ws_limiter = TokenBucket::new(10, 5.0);

        Ok(BinanceAdapter {
            api_key,
            secret_key,
            base_url,
            client: Client::new(),
            http_limiter,
            _ws_limiter: ws_limiter,
        })
    }

    fn sign(&self, query: &str) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(self.secret_key.as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(query.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    fn normalize_order_id(value: &serde_json::Value) -> String {
        if let Some(s) = value.as_str() {
            return s.to_string();
        }
        if let Some(n) = value.as_i64() {
            return n.to_string();
        }
        if let Some(n) = value.as_u64() {
            return n.to_string();
        }
        if let Some(n) = value.as_f64() {
            return n.to_string();
        }
        value.to_string().trim_matches('"').to_string()
    }
}

pub(crate) fn build_order_params(order: &OrderRequest, timestamp: i64) -> String {
    let side_str = match order.side {
        Side::Buy | Side::Long => "BUY",
        Side::Sell | Side::Short => "SELL",
    };
    let reduce_only = if order.reduce_only {
        "&reduceOnly=true"
    } else {
        ""
    };

    if let Some(price) = order.price {
        format!(
            "symbol={}&side={}&type=LIMIT&quantity={}{}&price={}&timeInForce=GTC&timestamp={}",
            order.symbol.replace("/", ""),
            side_str,
            order.quantity,
            reduce_only,
            price,
            timestamp
        )
    } else {
        format!(
            "symbol={}&side={}&type=MARKET&quantity={}{}&timestamp={}",
            order.symbol.replace("/", ""),
            side_str,
            order.quantity,
            reduce_only,
            timestamp
        )
    }
}

#[async_trait]
impl ExchangeAdapter for BinanceAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Minimal health check or ping
        let url = format!("{}/fapi/v1/ping", self.base_url);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ExchangeError::Api(format!(
                "Ping failed: {}",
                resp.status()
            )));
        }
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        // Enforce Rate Limit (HTTP)
        self.http_limiter.acquire(1).await;

        let endpoint = "/fapi/v1/order";
        let timestamp = Utc::now().timestamp_millis();
        let params = build_order_params(&order, timestamp);

        let signature = self.sign(&params);
        let full_query = format!("{}&signature={}", params, signature);
        let url = format!("{}{}", self.base_url, endpoint);

        let resp = self
            .client
            .post(&url)
            .header("X-MBX-APIKEY", &self.api_key)
            .body(full_query) // Usually GET query params for Binance signed requests? No, POST body or query.
            // For Binance Futures, signed endpoints send params in query string or body.
            // Query string is easier for debugging.
            .send()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        if !status.is_success() {
            return Err(ExchangeError::Api(format!(
                "Order failed {}: {}",
                status, text
            )));
        }

        // Parse response (simplified)
        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| ExchangeError::Api(format!("Parse error: {}", e)))?;

        let order_id = Self::normalize_order_id(&json["orderId"]);

        Ok(OrderResponse {
            order_id,
            client_order_id: order.client_order_id,
            symbol: order.symbol,
            status: json["status"].as_str().unwrap_or("UNKNOWN").to_string(),
            avg_price: json["avgPrice"]
                .as_str()
                .and_then(|s| rust_decimal::Decimal::from_str_exact(s).ok()),
            executed_qty: json["executedQty"]
                .as_str()
                .and_then(|s| rust_decimal::Decimal::from_str_exact(s).ok())
                .unwrap_or_default(),
            t_ack: Utc::now().timestamp_millis(),
            t_exchange: None,
            fee: None,
            fee_asset: None,
        })
    }

    async fn cancel_order(
        &self,
        symbol: &str,
        order_id: &str,
    ) -> Result<OrderResponse, ExchangeError> {
        // Enforce Rate Limit (HTTP)
        self.http_limiter.acquire(1).await;

        let endpoint = "/fapi/v1/order";
        let timestamp = Utc::now().timestamp_millis();

        let params = format!(
            "symbol={}&orderId={}&timestamp={}",
            symbol.replace("/", ""),
            order_id,
            timestamp
        );

        let signature = self.sign(&params);
        let full_query = format!("{}&signature={}", params, signature);
        let url = format!("{}{}?{}", self.base_url, endpoint, full_query);

        let resp = self
            .client
            .delete(&url)
            .header("X-MBX-APIKEY", &self.api_key)
            .send()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(ExchangeError::Api(format!("Cancel failed: {}", text)));
        }

        // Return mock response for now, or parse actual
        Ok(OrderResponse {
            order_id: order_id.to_string(),
            client_order_id: "".to_string(),
            symbol: symbol.to_string(),
            status: "CANCELED".to_string(),
            avg_price: None,
            executed_qty: Decimal::ZERO,
            t_ack: Utc::now().timestamp_millis(),
            t_exchange: None,
            fee: None,
            fee_asset: None,
        })
    }

    async fn get_balance(&self, asset: &str) -> Result<Decimal, ExchangeError> {
        self.http_limiter.acquire(1).await;

        let endpoint = "/fapi/v2/balance";
        let timestamp = Utc::now().timestamp_millis();
        let params = format!("timestamp={}&recvWindow=5000", timestamp);
        let signature = self.sign(&params);
        let url = format!(
            "{}{}?{}&signature={}",
            self.base_url, endpoint, params, signature
        );

        let resp = self
            .client
            .get(&url)
            .header("X-MBX-APIKEY", &self.api_key)
            .send()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        if !status.is_success() {
            return Err(ExchangeError::Api(format!(
                "Balance failed {}: {}",
                status, text
            )));
        }

        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| ExchangeError::Api(format!("Parse error: {}", e)))?;

        let balances = json
            .as_array()
            .ok_or_else(|| ExchangeError::Api("Unexpected balance response".into()))?;

        for entry in balances {
            if entry.get("asset").and_then(|v| v.as_str()) == Some(asset) {
                if let Some(available) = entry.get("availableBalance").and_then(|v| v.as_str()) {
                    if let Ok(value) = Decimal::from_str_exact(available) {
                        return Ok(value);
                    }
                }
                if let Some(balance) = entry.get("balance").and_then(|v| v.as_str()) {
                    if let Ok(value) = Decimal::from_str_exact(balance) {
                        return Ok(value);
                    }
                }
            }
        }

        Ok(Decimal::ZERO)
    }

    fn name(&self) -> &str {
        "Binance Futures"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        // /fapi/v2/positionRisk
        self.http_limiter.acquire(1).await;

        let endpoint = "/fapi/v2/positionRisk";
        let timestamp = Utc::now().timestamp_millis();
        let params = format!("timestamp={}&recvWindow=5000", timestamp);
        let signature = self.sign(&params);
        // Binance V2 uses query params for GET
        let url = format!(
            "{}{}?{}&signature={}",
            self.base_url, endpoint, params, signature
        );

        let resp = self
            .client
            .get(&url)
            .header("X-MBX-APIKEY", &self.api_key)
            .send()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            let text = resp.text().await.unwrap_or_default();
            return Err(ExchangeError::Api(format!(
                "Binance positionRisk failed: {}",
                text
            )));
        }

        let text = resp
            .text()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;
        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| ExchangeError::Api(format!("Parse error: {}", e)))?;

        let mut positions = Vec::new();

        if let Some(list) = json.as_array() {
            for item in list {
                let symbol = item["symbol"].as_str().unwrap_or("").to_string();
                let amt_str = item["positionAmt"].as_str().unwrap_or("0");
                let amt = rust_decimal::Decimal::from_str_exact(amt_str).unwrap_or(Decimal::ZERO);

                if amt.is_zero() {
                    continue; // Skip closed positions
                }

                let entry_str = item["entryPrice"].as_str().unwrap_or("0");
                let entry_price =
                    rust_decimal::Decimal::from_str_exact(entry_str).unwrap_or(Decimal::ZERO);

                // Determine Side
                // Logic: if amt > 0 -> Long, if amt < 0 -> Short
                // Binance "positionSide" indicates "LONG", "SHORT" (Hedge Mode) or "BOTH" (One-Way)
                let pos_side_str = item["positionSide"].as_str().unwrap_or("BOTH");

                let side = if pos_side_str == "SHORT" {
                    Side::Short
                } else if pos_side_str == "LONG" {
                    Side::Long
                } else {
                    // One-Way Mode
                    if amt.is_sign_negative() {
                        Side::Short
                    } else {
                        Side::Long
                    }
                };

                // Abs size
                let size = amt.abs();

                positions.push(Position {
                    symbol,
                    side,
                    size,
                    entry_price,
                    stop_loss: Decimal::ZERO, // Exchange doesn't give SL/TP easily in this endpoint usually
                    take_profits: vec![],
                    signal_id: "EXCHANGE_FETCHED".to_string(),
                    opened_at: Utc::now(), // Unknown
                    regime_state: None,
                    phase: None,
                    metadata: None,
                    exchange: Some("BINANCE".to_string()),
                    position_mode: Some(pos_side_str.to_string()),
                    realized_pnl: Decimal::ZERO,
                    unrealized_pnl: item["unRealizedProfit"]
                        .as_str()
                        .and_then(|s| Decimal::from_str_exact(s).ok())
                        .unwrap_or(Decimal::ZERO),
                    fees_paid: Decimal::ZERO,
                    funding_paid: Decimal::ZERO,
                    last_mark_price: None,
                    last_update_ts: Utc::now().timestamp_millis(),
                });
            }
        }

        Ok(positions)
    }
}
