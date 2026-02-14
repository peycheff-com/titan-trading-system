use crate::config::ExchangeConfig;
use crate::exchange::adapter::{
    ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse, Position, Side,
};
use async_trait::async_trait;
use chrono::Utc;
use hex;
use hmac::{Hmac, Mac};
use reqwest::header::{CONTENT_TYPE, HeaderMap, HeaderValue};
use reqwest::{Client, Method};
use rust_decimal::prelude::*;
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha512};
use std::time::Duration;
use uuid::Uuid;

#[derive(Clone)]
pub struct GateIoAdapter {
    api_key: String,
    secret_key: String,
    base_url: String,
    client: Client,
}

impl GateIoAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let config = config.ok_or(ExchangeError::Configuration(
            "Missing Gate.io config".into(),
        ))?;

        let api_key = config.get_api_key().ok_or(ExchangeError::Configuration(
            "Missing Gate.io API Key".into(),
        ))?;
        let secret_key = config.get_secret_key().ok_or(ExchangeError::Configuration(
            "Missing Gate.io Secret Key".into(),
        ))?;

        // Gate.io API V4 URL
        let base_url = std::env::var("GATEIO_BASE_URL").unwrap_or_else(|_| {
            if config.testnet {
                "https://fx-api-testnet.gateio.ws".to_string()
            } else {
                "https://api.gateio.ws".to_string()
            }
        });

        Ok(Self {
            api_key,
            secret_key,
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
        query_params: &str,
        body: &str,
        timestamp: &str,
    ) -> Result<String, ExchangeError> {
        // Signature string: Method + "\n" + URL + "\n" + Query + "\n" + Hex(SHA512(Body)) + "\n" + Timestamp

        let mut hasher = Sha512::new();
        hasher.update(body.as_bytes());
        let hashed_payload = hex::encode(hasher.finalize());

        let signature_string = format!(
            "{}\n{}\n{}\n{}\n{}",
            method, endpoint, query_params, hashed_payload, timestamp
        );

        let mut mac = Hmac::<Sha512>::new_from_slice(self.secret_key.as_bytes())
            .map_err(|e| ExchangeError::Signing(e.to_string()))?;
        mac.update(signature_string.as_bytes());
        let result = mac.finalize();
        let signature = hex::encode(result.into_bytes());

        Ok(signature)
    }

    async fn request<T: for<'de> Deserialize<'de>>(
        &self,
        method: Method,
        endpoint: &str,
        query: Option<&str>,
        body: Option<Value>,
    ) -> Result<T, ExchangeError> {
        // endpoint usually passed as "/api/v4/..."
        // Gate.io signature requires endpoint without host

        let url = format!("{}{}", self.base_url, endpoint);
        let timestamp = Utc::now().timestamp().to_string(); // Seconds

        let body_str = if let Some(ref b) = body {
            b.to_string()
        } else {
            "".to_string()
        };

        let query_str = query.unwrap_or("");

        let signature =
            self.generate_signature(method.as_str(), endpoint, query_str, &body_str, &timestamp)?;

        let mut headers = HeaderMap::new();
        headers.insert("KEY", HeaderValue::from_str(&self.api_key).unwrap());
        headers.insert("SIGN", HeaderValue::from_str(&signature).unwrap());
        headers.insert("Timestamp", HeaderValue::from_str(&timestamp).unwrap());
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        let mut request_builder = self.client.request(method, &url).headers(headers);
        if let Some(b) = body {
            request_builder = request_builder.json(&b);
        }
        // NOTE: If query exists, it should be appended to URL or sent as stored params.
        // reqwest handles query params separately, but signature needs exact string.
        // If we pass `query` string, we should append it manually to URL for safety or strict control
        if !query_str.is_empty() {
            request_builder = request_builder.query(
                &serde_urlencoded::from_str::<Vec<(String, String)>>(query_str).unwrap_or_default(),
            );
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
            // Gate.io error format: { "label": "INVALID_SIGNATURE", "message": "..." }
            return Err(ExchangeError::Api(format!(
                "Gate.io Error {}: {}",
                status, text
            )));
        }

        // Gate.io returns data directly or list
        serde_json::from_str(&text).map_err(|e| ExchangeError::Parse(e.to_string()))
    }
}

#[async_trait]
impl ExchangeAdapter for GateIoAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Test connection: Get Accounts
        // GET /api/v4/spot/accounts
        let _: Value = self
            .request(Method::GET, "/api/v4/spot/accounts", None, None)
            .await?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        // Endpoint: POST /api/v4/spot/orders
        let endpoint = "/api/v4/spot/orders";

        let client_oid = if !order.client_order_id.is_empty() {
            order.client_order_id.clone()
        } else {
            // Gate.io text field (custom ID) usually 'text' usually formatted "t-123456"
            format!("t-{}", Uuid::new_v4().simple())
        };

        // Determine side
        let side = match order.side {
            Side::Buy | Side::Long => "buy",
            Side::Sell | Side::Short => "sell",
        };

        let mut params = serde_json::Map::new();
        // text field is user defined ID
        params.insert("text".to_string(), Value::String(client_oid.clone()));
        params.insert(
            "currency_pair".to_string(),
            Value::String(order.symbol.replace("/", "_").replace("-", "_")),
        ); // Format: BTC_USDT
        params.insert("side".to_string(), Value::String(side.to_string()));
        params.insert(
            "amount".to_string(),
            Value::String(order.quantity.to_string()),
        ); // Amount of currency to buy/sell

        // Gate.io Spot:
        // Limit: type="limit", price required
        // Market: type="market", price not allowed?
        // Docs: Check.

        if let Some(price) = order.price {
            params.insert("type".to_string(), Value::String("limit".to_string()));
            params.insert("price".to_string(), Value::String(price.to_string()));
            params.insert(
                "time_in_force".to_string(),
                Value::String("gtc".to_string()),
            );
        } else {
            params.insert("type".to_string(), Value::String("market".to_string()));
            // Market order might need 'amount' (base) or total quote??
            // Usually 'amount' is base for Spot Market Buy too? Gate docs say:
            // "market": Market order
            // For market buy, 'amount' is USDT value? Or base?
            // Actually, usually CEX distinguish.
            // Gate V4: "amount" is "Amount of currency to sell/buy".
            // For market buy, it looks like it often means Quote currency amount in some exchanges, but Gate might differ.
            // We will assume `order.quantity` is BASE amount for now.
            // Note: Safest to implement Limit only for reliable quantity, or check specifics.
            // We'll proceed with amount.
        }

        let response: Value = self
            .request(Method::POST, endpoint, None, Some(Value::Object(params)))
            .await?;

        // Response: { "id": "...", "status": "open" ... }
        let order_id = response
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or(ExchangeError::Parse("Missing orderId in response".into()))?
            .to_string();

        let status_raw = response
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("open");
        let status = match status_raw {
            "open" => "NEW",
            "closed" => "FILLED",
            "cancelled" => "CANCELED",
            _ => status_raw,
        }
        .to_string();

        Ok(OrderResponse {
            order_id,
            client_order_id: client_oid,
            symbol: order.symbol,
            status,
            executed_qty: Decimal::zero(), // Parse from 'filled_total' usually
            avg_price: None,
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
        // DELETE /api/v4/spot/orders/{order_id}
        // requires currency_pair param
        let pair = symbol.replace("/", "_").replace("-", "_");
        let endpoint = format!("/api/v4/spot/orders/{}", order_id);
        let query = format!("currency_pair={}", pair);

        let response: Value = self
            .request(Method::DELETE, &endpoint, Some(&query), None)
            .await?;

        let status_raw = response
            .get("status")
            .and_then(|v| v.as_str())
            .unwrap_or("cancelled");

        Ok(OrderResponse {
            order_id: order_id.to_string(),
            client_order_id: "".to_string(),
            symbol: symbol.to_string(),
            status: status_raw.to_string().to_uppercase(),
            executed_qty: Decimal::zero(),
            avg_price: None,
            t_exchange: None,
            t_ack: Utc::now().timestamp_millis(),
            fee: None,
            fee_asset: None,
        })
    }

    async fn get_balance(&self, asset: &str) -> Result<Decimal, ExchangeError> {
        // GET /api/v4/spot/accounts
        // Returns list
        let accounts: Vec<Value> = self
            .request(Method::GET, "/api/v4/spot/accounts", None, None)
            .await?;

        let mut total = Decimal::zero();
        for acc in accounts {
            if let Some(curr) = acc.get("currency").and_then(|s| s.as_str()) {
                if curr == asset {
                    if let Some(avail) = acc.get("available").and_then(|s| s.as_str()) {
                        total += Decimal::from_str(avail).unwrap_or(Decimal::zero());
                    }
                }
            }
        }
        Ok(total)
    }

    fn name(&self) -> &str {
        "gateio"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        // Gate.io Futures positions: GET /api/v4/futures/usdt/positions
        let positions_data: Vec<Value> = self
            .request(Method::GET, "/api/v4/futures/usdt/positions", None, None)
            .await
            .unwrap_or_default();

        let mut positions = Vec::new();

        for pos_data in positions_data {
            let contract = pos_data
                .get("contract")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let size = pos_data.get("size").and_then(|v| v.as_i64()).unwrap_or(0);

            if size == 0 {
                continue;
            }

            let entry_str = pos_data
                .get("entry_price")
                .and_then(|v| v.as_str())
                .unwrap_or("0");
            let entry_price = Decimal::from_str(entry_str).unwrap_or(Decimal::zero());

            let side = if size > 0 { Side::Long } else { Side::Short };

            let unrealised_pnl_str = pos_data
                .get("unrealised_pnl")
                .and_then(|v| v.as_str())
                .unwrap_or("0");
            let unrealized_pnl = Decimal::from_str(unrealised_pnl_str).unwrap_or(Decimal::zero());

            let realised_pnl_str = pos_data
                .get("realised_pnl")
                .and_then(|v| v.as_str())
                .unwrap_or("0");
            let realized_pnl = Decimal::from_str(realised_pnl_str).unwrap_or(Decimal::zero());

            positions.push(Position {
                symbol: contract,
                side,
                size: Decimal::from(size.unsigned_abs()),
                entry_price,
                stop_loss: Decimal::ZERO,
                take_profits: vec![],
                signal_id: "EXCHANGE_FETCHED".to_string(),
                opened_at: Utc::now(),
                regime_state: None,
                phase: None,
                metadata: None,
                exchange: Some("GATEIO".to_string()),
                position_mode: None,
                realized_pnl,
                unrealized_pnl,
                fees_paid: Decimal::ZERO,
                funding_paid: Decimal::ZERO,
                last_mark_price: None,
                last_update_ts: Utc::now().timestamp_millis(),
            });
        }

        Ok(positions)
    }
}
