use async_trait::async_trait;
use rust_decimal::Decimal;
use crate::exchange::adapter::{ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse};
use crate::model::{Side, OrderType};
use serde::{Deserialize, Serialize};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use hex;
use std::env;
use reqwest::{Client, Method};
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

const BASE_URL: &str = "https://contract.mexc.com";

pub struct MexcAdapter {
    client: Client,
    api_key: String,
    api_secret: String,
}

impl MexcAdapter {
    pub fn new() -> Self {
        let api_key = env::var("MEXC_API_KEY").unwrap_or_default();
        let api_secret = env::var("MEXC_SECRET_KEY").unwrap_or_default();
        
        Self {
            client: Client::new(),
            api_key,
            api_secret,
        }
    }

    fn sign(&self, timestamp: &str, body: &str) -> Result<String, ExchangeError> {
        // MEXC Contract V1 Signature: HMAC-SHA256(api_key + timestamp + body, secret)
        // Check docs: usually it's just signature of the string...
        // Actually MEXC V1 Contract: Signature = HMAC-SHA256(to_sign, secret_key)
        // to_sign = apiKey + timestamp + body
        
        let payload = format!("{}{}{}", self.api_key, timestamp, body);
        
        let mut mac = HmacSha256::new_from_slice(self.api_secret.as_bytes())
            .map_err(|e| ExchangeError::Signing(e.to_string()))?;
        mac.update(payload.as_bytes());
        let result = mac.finalize();
        Ok(hex::encode(result.into_bytes()))
    }

    async fn request<T: serde::de::DeserializeOwned>(
        &self, 
        method: Method, 
        endpoint: &str, 
        payload: Option<serde_json::Value>
    ) -> Result<T, ExchangeError> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis()
            .to_string();

        let body_str = if let Some(p) = &payload {
            serde_json::to_string(p).map_err(|e| ExchangeError::Api(e.to_string()))?
        } else {
            String::new()
        };

        let signature = self.sign(&timestamp, &body_str)?;

        let url = format!("{}{}", BASE_URL, endpoint);
        let mut request = self.client.request(method, &url)
            .header("Request-Time", &timestamp)
            .header("ApiKey", &self.api_key)
            .header("Signature", signature)
            .header("Content-Type", "application/json");

        if !body_str.is_empty() {
            request = request.body(body_str);
        }

        let response = request.send().await.map_err(|e| ExchangeError::Network(e.to_string()))?;
        let status = response.status();
        let text = response.text().await.map_err(|e| ExchangeError::Network(e.to_string()))?;

        if !status.is_success() {
            return Err(ExchangeError::Api(format!("MEXC HTTP Error {}: {}", status, text)));
        }

        let base_resp: MexcBaseResponse<T> = serde_json::from_str(&text)
            .map_err(|e| ExchangeError::Api(format!("Failed to parse response: {} | body: {}", e, text)))?;

        if !base_resp.success {
            return Err(ExchangeError::Api(format!("MEXC API Error {}: {}", base_resp.code, base_resp.message)));
        }

        Ok(base_resp.data)
    }
}

#[async_trait]
impl ExchangeAdapter for MexcAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Test connection
        // /api/v1/contract/ping
        let url = format!("{}/api/v1/contract/ping", BASE_URL);
        let resp = self.client.get(&url).send().await.map_err(|e| ExchangeError::Network(e.to_string()))?;
        if resp.status().is_success() {
            Ok(())
        } else {
            Err(ExchangeError::Network("MEXC Ping Failed".into()))
        }
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        let side = match order.side {
            Side::Buy | Side::Long => 1, // Open Long
            Side::Sell | Side::Short => 3, // Open Short
            // MEXC V1: 1: Open Long, 2: Close Short, 3: Open Short, 4: Close Long
        };
        
        let type_code = match order.order_type {
            OrderType::Limit => 1, // Limit
            OrderType::Market => 5, // Market
            _ => return Err(ExchangeError::Config("Unsupported order type for MEXC".into())),
        };

        // MEXC Contract Order Payload
        let payload = serde_json::json!({
            "symbol": order.symbol,
            "price": order.price.unwrap_or(Decimal::ZERO),
            "vol": order.quantity,
            "side": side,
            "type": type_code,
            "openType": 1, // 1: Isolated, 2: Cross
            "externalOid": order.client_order_id
        });

        let resp: MexcOrderResult = self.request(Method::POST, "/api/v1/private/order/submit", Some(payload)).await?;

        Ok(OrderResponse {
            order_id: resp.order_id,
            client_order_id: order.client_order_id,
            symbol: order.symbol,
            status: "NEW".to_string(), // MEXC Async submit
            avg_price: None,
            executed_qty: Decimal::ZERO,
            t_ack: chrono::Utc::now().timestamp_millis(),
            t_exchange: None,
        })
    }

    async fn cancel_order(&self, symbol: &str, order_id: &str) -> Result<OrderResponse, ExchangeError> {
        let payload = serde_json::json!({
            "symbol": symbol,
            "orderId": order_id
        });

        // /api/v1/private/order/cancel
        let _resp: serde_json::Value = self.request(Method::POST, "/api/v1/private/order/cancel", Some(payload)).await?;

        Ok(OrderResponse {
            order_id: order_id.to_string(),
            client_order_id: "".to_string(),
            symbol: symbol.to_string(),
            status: "CANCELLED".to_string(),
            avg_price: None,
            executed_qty: Decimal::ZERO,
            t_ack: chrono::Utc::now().timestamp_millis(),
            t_exchange: None,
        })
    }

    async fn get_balance(&self, _asset: &str) -> Result<Decimal, ExchangeError> {
         Ok(Decimal::new(1000, 0)) // Mock for now
    }

    fn name(&self) -> &str {
        "MEXC Futures"
    }
}

#[derive(Deserialize)]
struct MexcBaseResponse<T> {
    success: bool,
    code: i32,
    message: String,
    data: T,
}

#[derive(Deserialize)]
struct MexcOrderResult {
    #[serde(rename = "orderId")]
    order_id: String,
}
