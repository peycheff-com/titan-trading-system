use crate::exchange::adapter::{ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse};
use crate::model::{Position, Side};
use async_trait::async_trait;
use chrono::Utc;
use hex;
use hmac::{Hmac, Mac};
use reqwest::{Client, Method};
use rust_decimal::Decimal;
use sha2::Sha256;
use std::env;
use std::str::FromStr;

use crate::config::ExchangeConfig;
use crate::rate_limiter::TokenBucket;

pub struct CoinbaseAdapter {
    api_key: String,
    secret_key: String,
    base_url: String,
    client: Client,
    http_limiter: TokenBucket,
}

impl CoinbaseAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let api_key = config
            .and_then(|c| c.get_api_key())
            .or_else(|| env::var("COINBASE_API_KEY").ok())
            .ok_or_else(|| {
                ExchangeError::Configuration(
                    "COINBASE_API_KEY not set (check config.json or env)".to_string(),
                )
            })?;

        let secret_key = config
            .and_then(|c| c.get_secret_key())
            .or_else(|| env::var("COINBASE_SECRET_KEY").ok())
            .ok_or_else(|| {
                ExchangeError::Configuration(
                    "COINBASE_SECRET_KEY not set (check config.json or env)".to_string(),
                )
            })?;

        let base_url = env::var("COINBASE_BASE_URL")
            .unwrap_or_else(|_| "https://api.coinbase.com".to_string());

        // Coinbase Advanced Trade limits: ~10 requests per second (varies)
        let rate_limit = config.and_then(|c| c.rate_limit).unwrap_or(10) as f64;
        let http_limiter = TokenBucket::new(20, rate_limit);

        Ok(CoinbaseAdapter {
            api_key,
            secret_key,
            base_url,
            client: Client::new(),
            http_limiter,
        })
    }

    fn sign(&self, timestamp: &str, method: &str, path: &str, body: &str) -> String {
        let message = format!("{}{}{}{}", timestamp, method, path, body);
        let mut mac = Hmac::<Sha256>::new_from_slice(self.secret_key.as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(message.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    async fn send_signed_request(
        &self,
        method: Method,
        path: &str,
        body: Option<String>,
    ) -> Result<String, ExchangeError> {
        self.http_limiter.acquire(1).await;

        let url = format!("{}{}", self.base_url, path);
        let timestamp = Utc::now().timestamp().to_string(); // Unix timestamp (seconds)

        // Coinbase path includes the query string if present?
        // Docs say: "requestPath": The path of the URL (e.g., /api/v3/brokerage/orders).
        // It should include query params? Usually yes.
        // Assuming path passed here is full relative path with query.

        let body_str = body.unwrap_or_default();
        let signature = self.sign(&timestamp, method.as_str(), path, &body_str);

        let mut request = self
            .client
            .request(method.clone(), &url)
            .header("CB-ACCESS-KEY", &self.api_key)
            .header("CB-ACCESS-SIGN", signature)
            .header("CB-ACCESS-TIMESTAMP", timestamp)
            .header("Content-Type", "application/json");

        if !body_str.is_empty() {
            request = request.body(body_str);
        }

        let resp = request
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
                "Coinbase Request failed {}: {}",
                status, text
            )));
        }

        Ok(text)
    }
}

#[async_trait]
impl ExchangeAdapter for CoinbaseAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // GET /api/v3/brokerage/accounts (to check conn)
        let path = "/api/v3/brokerage/accounts?limit=1";
        let _ = self.send_signed_request(Method::GET, path, None).await?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        // POST /api/v3/brokerage/orders
        let path = "/api/v3/brokerage/orders";

        let product_id = order.symbol.replace("USDT", "-USDT").replace("USD", "-USD"); // Basic mapping for now
        let side = match order.side {
            Side::Buy | Side::Long => "BUY",
            Side::Sell | Side::Short => "SELL",
        };

        // Coinbase Order Configuration
        let order_config = if let Some(price) = order.price {
            serde_json::json!({
                "limit_limit_gtc": {
                    "base_size": order.quantity.to_string(),
                    "limit_price": price.to_string(),
                    "post_only": false
                }
            })
        } else {
            serde_json::json!({
                "market_market_ioc": {
                    "base_size": order.quantity.to_string()
                }
            })
        };

        let client_order_id = if order.client_order_id.is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            order.client_order_id.clone()
        };

        let payload = serde_json::json!({
            "client_order_id": client_order_id,
            "product_id": product_id,
            "side": side,
            "order_configuration": order_config
        });

        let resp_text = self
            .send_signed_request(Method::POST, path, Some(payload.to_string()))
            .await?;

        let json: serde_json::Value =
            serde_json::from_str(&resp_text).map_err(|e| ExchangeError::Api(e.to_string()))?;

        // Response: { "order_id": "...", ... } or { "success_response": ... }
        // Valid response usually has `order_id` or `success_response` with `order_id`.
        // Docs: { "success": true, "order_id": "...", "order_configuration": ... }

        let order_id = if let Some(id) = json.get("order_id").and_then(|v| v.as_str()) {
            id.to_string()
        } else if let Some(success) = json.get("success_response") {
            success["order_id"].as_str().unwrap_or("").to_string()
        } else {
            // Check for failure
            if let Some(failure) = json.get("failure_response") {
                return Err(ExchangeError::Api(format!("Order Failure: {}", failure)));
            }
            "".to_string()
        };

        if order_id.is_empty() {
            return Err(ExchangeError::Api(format!(
                "No order_id in response: {}",
                resp_text
            )));
        }

        Ok(OrderResponse {
            order_id,
            client_order_id,
            symbol: order.symbol,
            status: "UNKNOWN".to_string(), // Need to query status or assume PENDING
            avg_price: None,
            executed_qty: Decimal::ZERO,
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
        // POST /api/v3/brokerage/orders/cancel
        let path = "/api/v3/brokerage/orders/cancel";

        let payload = serde_json::json!({
            "order_ids": [order_id]
        });

        let _ = self
            .send_signed_request(Method::POST, path, Some(payload.to_string()))
            .await?;

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
        // GET /api/v3/brokerage/accounts
        let path = "/api/v3/brokerage/accounts?limit=250";
        let resp_text = self.send_signed_request(Method::GET, path, None).await?;

        let json: serde_json::Value =
            serde_json::from_str(&resp_text).map_err(|e| ExchangeError::Api(e.to_string()))?;
        let accounts = json["accounts"]
            .as_array()
            .ok_or(ExchangeError::Api("No accounts data".into()))?;

        for acc in accounts {
            if acc["currency"].as_str() == Some(asset) {
                let avail = acc["available_balance"]["value"].as_str().unwrap_or("0");
                return Decimal::from_str(avail)
                    .map_err(|e| ExchangeError::Api(format!("Decimal parse: {}", e)));
            }
        }

        Ok(Decimal::ZERO)
    }

    fn name(&self) -> &str {
        "Coinbase Advanced"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        // Coinbase Sport has no "positions", only balances.
        // We can simulate positions from balances if needed, but for now return empty.
        Ok(Vec::new())
    }
}
