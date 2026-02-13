use crate::config::ExchangeConfig;
use crate::exchange::adapter::{
    ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse, Position, Side,
};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use reqwest::Client;
use rust_decimal::prelude::*;
use serde::Deserialize;
use serde_json::Value;
use sha2::Sha256;
use std::time::Duration;
use uuid::Uuid;

#[derive(Clone)]
pub struct KucoinAdapter {
    api_key: String,
    secret_key: String,
    passphrase: String, // KuCoin specific
    base_url: String,
    client: Client,
}

impl KucoinAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let config = config.ok_or(ExchangeError::Configuration("Missing KuCoin config".into()))?;

        // KuCoin requires Key, Secret, and Passphrase.
        // We handle Passphrase via `api_key_alt` field in standard config to avoid breaking changes.

        let api_key = config.get_api_key().ok_or(ExchangeError::Configuration(
            "Missing KuCoin API Key".into(),
        ))?;
        let secret_key = config.get_secret_key().ok_or(ExchangeError::Configuration(
            "Missing KuCoin Secret Key".into(),
        ))?;
        let passphrase = config
            .api_key_alt
            .clone()
            .ok_or(ExchangeError::Configuration(
                "Missing KuCoin Passphrase (use api_key_alt/passphrase field)".into(),
            ))?;

        // Standard KuCoin API URL
        let base_url = std::env::var("KUCOIN_BASE_URL")
            .unwrap_or_else(|_| "https://api.kucoin.com".to_string());

        Ok(Self {
            api_key,
            secret_key,
            passphrase,
            base_url,
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .map_err(|e| ExchangeError::Network(e.to_string()))?,
        })
    }

    fn generate_signature(
        &self,
        method: &str,
        endpoint: &str,
        body: &str,
        timestamp: &str,
    ) -> Result<String, ExchangeError> {
        // str_to_sign = timestamp + method + endpoint + body
        let str_to_sign = format!("{}{}{}{}", timestamp, method, endpoint, body);

        let mut mac = Hmac::<Sha256>::new_from_slice(self.secret_key.as_bytes())
            .map_err(|e| ExchangeError::Signing(e.to_string()))?;
        mac.update(str_to_sign.as_bytes());
        let result = mac.finalize();
        let signature = general_purpose::STANDARD.encode(result.into_bytes());

        Ok(signature)
    }

    fn generate_passphrase_signature(&self) -> Result<String, ExchangeError> {
        let mut mac = Hmac::<Sha256>::new_from_slice(self.secret_key.as_bytes())
            .map_err(|e| ExchangeError::Signing(e.to_string()))?;
        mac.update(self.passphrase.as_bytes());
        let result = mac.finalize();
        let signature = general_purpose::STANDARD.encode(result.into_bytes());
        Ok(signature)
    }

    async fn request<T: for<'de> Deserialize<'de> + Default>(
        &self,
        method: reqwest::Method,
        endpoint: &str,
        body: Option<Value>,
    ) -> Result<T, ExchangeError> {
        let url = format!("{}{}", self.base_url, endpoint);
        let timestamp = Utc::now().timestamp_millis().to_string();

        let body_str = if let Some(ref b) = body {
            b.to_string()
        } else {
            "".to_string()
        };

        let signature =
            self.generate_signature(method.as_str(), endpoint, &body_str, &timestamp)?;
        let passphrase_signature = self.generate_passphrase_signature()?;

        let mut headers = HeaderMap::new();
        headers.insert("KC-API-KEY", HeaderValue::from_str(&self.api_key).unwrap());
        headers.insert("KC-API-SIGN", HeaderValue::from_str(&signature).unwrap());
        headers.insert(
            "KC-API-TIMESTAMP",
            HeaderValue::from_str(&timestamp).unwrap(),
        );
        headers.insert(
            "KC-API-PASSPHRASE",
            HeaderValue::from_str(&passphrase_signature).unwrap(),
        );
        headers.insert("KC-API-KEY-VERSION", HeaderValue::from_static("2"));
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let mut request_builder = self.client.request(method, &url).headers(headers);
        if let Some(b) = body {
            request_builder = request_builder.json(&b);
        }

        let response = request_builder
            .send()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        let status = response.status();
        let text = response
            .text()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        if !status.is_success() {
            return Err(ExchangeError::Api(format!(
                "KuCoin Error {}: {}",
                status, text
            )));
        }

        let json: Value =
            serde_json::from_str(&text).map_err(|e| ExchangeError::Parse(e.to_string()))?;

        if let Some(code) = json.get("code") {
            if code.as_str() != Some("200000") {
                return Err(ExchangeError::Api(format!(
                    "KuCoin API Error: {} - {}",
                    code,
                    json.get("msg").unwrap_or(&Value::Null)
                )));
            }
        }

        // KuCoin response usually wrapped in "data"
        if let Some(data) = json.get("data") {
            serde_json::from_value(data.clone()).map_err(|e| ExchangeError::Parse(e.to_string()))
        } else {
            // Fallback if no data field (unlikely for success 200000)
            Ok(serde_json::from_value(json).unwrap_or_default())
        }
    }
}

#[async_trait]
impl ExchangeAdapter for KucoinAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Test connection
        let _: Value = self
            .request(reqwest::Method::GET, "/api/v1/accounts", None)
            .await?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        // Endpoint: POST /api/v1/orders
        let endpoint = "/api/v1/orders";

        let client_oid = if !order.client_order_id.is_empty() {
            order.client_order_id.clone()
        } else {
            Uuid::new_v4().to_string()
        };

        // Determine side
        let side = match order.side {
            Side::Buy | Side::Long => "buy",
            Side::Sell | Side::Short => "sell",
        };

        let mut params = serde_json::Map::new();
        params.insert("clientOid".to_string(), Value::String(client_oid.clone()));
        params.insert("side".to_string(), Value::String(side.to_string()));

        // Symbol format: KuCoin uses dash, e.g. BTC-USDT. Input might be BTC/USDT or BTCUSDT
        // Simple normalization
        let symbol = order.symbol.replace("/", "-").replace("_", "-");
        params.insert("symbol".to_string(), Value::String(symbol));

        // Order Type
        if let Some(price) = order.price {
            // LIMIT ORDER
            params.insert("type".to_string(), Value::String("limit".to_string()));
            params.insert("price".to_string(), Value::String(price.to_string()));
            params.insert(
                "size".to_string(),
                Value::String(order.quantity.to_string()),
            );
            // Optional: TimeInForce (GTC default)
        } else {
            // MARKET ORDER
            params.insert("type".to_string(), Value::String("market".to_string()));

            // KuCoin Spec:
            // - buy: use 'funds' (quote currency amount)
            // - sell: use 'size' (base currency amount)
            // Titan internal convention: quantity is ALWAYS base currency.

            if side == "buy" {
                // We typically wish to buy X amount of Base.
                // However, KuCoin Market Buy requires 'funds' (USDT amount).
                // If we only know 'size' (BTC amount), we are stuck without current price.
                // STRICT MODE: We reject Market Buy by Size if not supported, OR we try to estimate?
                // Estimation is dangerous.
                // Re-reading definition: "The size is the amount of base currency to buy or sell." -> NO.
                // KuCoin Docs: "market order ... buy: funds, sell: size"

                // WORKAROUND: If we must use size, we cannot use Market Buy on KuCoin easily without price.
                // OR we can check if they updated the API.
                // Newer API might support 'size' for buy? Docs say "funds" required for market buy.

                return Err(ExchangeError::OrderRejected("KuCoin Market Buy requires 'funds' (quote qty), but 'size' (base qty) was provided. Use Limit order.".into()));
            } else {
                // Sell: 'size' is base currency. Accepted.
                params.insert(
                    "size".to_string(),
                    Value::String(order.quantity.to_string()),
                );
            }
        }

        let response: Value = self
            .request(reqwest::Method::POST, endpoint, Some(Value::Object(params)))
            .await?;

        // Response: { "orderId": "..." }
        let order_id = response
            .get("orderId")
            .and_then(|v| v.as_str())
            .ok_or(ExchangeError::Parse("Missing orderId in response".into()))?
            .to_string();

        Ok(OrderResponse {
            order_id,
            client_order_id: client_oid,
            symbol: order.symbol,
            status: "NEW".to_string(), // KuCoin returns ID immediately, status needs query or websocket
            executed_qty: Decimal::zero(),
            avg_price: None, // Not provided in sync response
            t_exchange: None,
            t_ack: Utc::now().timestamp_millis(),
            fee: None,
            fee_asset: None,
        })
    }

    async fn cancel_order(
        &self,
        symbol: &str,
        order_id: &str,
    ) -> Result<OrderResponse, ExchangeError> {
        // DELETE /api/v1/orders/{orderId}
        let endpoint = format!("/api/v1/orders/{}", order_id);

        let _: Value = self
            .request(reqwest::Method::DELETE, &endpoint, None)
            .await?;

        Ok(OrderResponse {
            order_id: order_id.to_string(),
            client_order_id: "".to_string(), // Unknown on cancel request without lookup
            symbol: symbol.to_string(),
            status: "CANCELED".to_string(),
            executed_qty: Decimal::zero(),
            avg_price: None,
            t_exchange: None,
            t_ack: Utc::now().timestamp_millis(),
            fee: None,
            fee_asset: None,
        })
    }

    async fn get_balance(&self, asset: &str) -> Result<Decimal, ExchangeError> {
        // GET /api/v1/accounts
        // Returns list of accounts. Need filtering.
        // asset e.g. "USDT"

        let accounts: Vec<Value> = self
            .request(reqwest::Method::GET, "/api/v1/accounts", None)
            .await?;

        let mut total_balance = Decimal::zero();

        for acc in accounts {
            if let Some(currency) = acc.get("currency").and_then(|c| c.as_str()) {
                if currency == asset {
                    // Check type: trade (spot) or main? Usually we want trade/margin available
                    if let Some(available) = acc.get("available").and_then(|a| a.as_str()) {
                        let amount = Decimal::from_str(available).unwrap_or(Decimal::zero());
                        total_balance += amount;
                    }
                }
            }
        }

        Ok(total_balance)
    }

    fn name(&self) -> &str {
        "kucoin"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        // Spot has no positions.
        // If this adapter supports Futures, we need different endpoints (/api/v1/positions).
        // Let's assume standard KuCoin Spot for now as base.
        // Return empty.
        Ok(Vec::new())
    }
}
