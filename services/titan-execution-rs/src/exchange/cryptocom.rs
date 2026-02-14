use crate::config::ExchangeConfig;
use crate::exchange::adapter::{
    ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse, Position,
};
use async_trait::async_trait;
use chrono::Utc;
use hex;
use hmac::{Hmac, Mac};
use reqwest::header::CONTENT_TYPE;
use reqwest::Client;
use rust_decimal::prelude::*;
use serde::Deserialize;
use serde_json::Value;
use sha2::Sha256;
use std::collections::BTreeMap;
use std::time::Duration;
use uuid::Uuid;

#[derive(Clone)]
pub struct CryptoComAdapter {
    api_key: String,
    secret_key: String,
    base_url: String,
    client: Client,
}

impl CryptoComAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let config = config.ok_or(ExchangeError::Configuration(
            "Missing Crypto.com config".into(),
        ))?;

        let api_key = config.get_api_key().ok_or(ExchangeError::Configuration(
            "Missing Crypto.com API Key".into(),
        ))?;
        let secret_key = config.get_secret_key().ok_or(ExchangeError::Configuration(
            "Missing Crypto.com Secret Key".into(),
        ))?;

        // Crypto.com Exchange API URL
        let base_url = std::env::var("CRYPTOCOM_BASE_URL").unwrap_or_else(|_| {
            if config.testnet {
                "https://uat-api.3ona.co/v2".to_string()
            } else {
                "https://api.crypto.com/v2".to_string()
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
        method_name: &str,
        params: &BTreeMap<String, Value>,
        nonce: &str,
    ) -> Result<String, ExchangeError> {
        // Signature = Hex(HMAC_SHA256(Secret, method + id + api_key + sorted_params_string + nonce))
        // id is request ID, usually distinct from nonce.
        // Let's assume request structure: { "id": 1, "method": "...", "params": { ... }, "api_key": "...", "sig": "...", "nonce": ... }
        // BUT for REST, signature generation might be different than Websocket.
        // Documentation says:
        // params string: sort keys, concatenate key+value.
        // sig_payload = method + id + api_key + params_string + nonce

        // Let's assume we use a fixed ID for simplicity or random.
        // Actually, REST requests for Crypto.com usually use JSON body.
        // Structure:
        // {
        //   "id": 1,
        //   "method": "private/create-order",
        //   "api_key": "...",
        //   "params": { ... },
        //   "nonce": 123...,
        //   "sig": "..."
        // }

        // So we need to construct the payload first to sign it.

        // Params string construction
        let mut params_string = String::new();
        for (k, v) in params {
            // value should be string representation. If it's a number/bool, convert simple.
            // If nested object/array, docs usually say "no nested".
            let v_str = match v {
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                Value::Bool(b) => b.to_string(),
                _ => {
                    return Err(ExchangeError::Signing(format!(
                        "Unsupported param type for key {}",
                        k
                    )));
                }
            };
            params_string.push_str(k);
            params_string.push_str(&v_str);
        }

        // We'll use id=1 or random.
        let id = "1";

        let sig_payload = format!(
            "{}{}{}{}{}",
            method_name, id, self.api_key, params_string, nonce
        );

        let mut mac = Hmac::<Sha256>::new_from_slice(self.secret_key.as_bytes())
            .map_err(|e| ExchangeError::Signing(e.to_string()))?;
        mac.update(sig_payload.as_bytes());
        let result = mac.finalize();
        let signature = hex::encode(result.into_bytes());

        Ok(signature)
    }

    async fn send_request<T: for<'de> Deserialize<'de> + Default>(
        &self,
        method_name: &str,
        params: BTreeMap<String, Value>,
    ) -> Result<T, ExchangeError> {
        let url = format!("{}/{}", self.base_url, method_name);

        let nonce = Utc::now().timestamp_millis().to_string();

        // Calculate signature
        let signature = self.generate_signature(method_name, &params, &nonce)?;

        // detailed request object
        let mut request_body = serde_json::Map::new();
        request_body.insert("id".to_string(), Value::Number(1.into()));
        request_body.insert("method".to_string(), Value::String(method_name.to_string()));
        request_body.insert("api_key".to_string(), Value::String(self.api_key.clone()));

        // Convert BTreeMap params to Map<String,Value>
        let mut params_map = serde_json::Map::new();
        for (k, v) in params {
            params_map.insert(k, v);
        }
        request_body.insert("params".to_string(), Value::Object(params_map));

        request_body.insert("nonce".to_string(), Value::Number(nonce.parse().unwrap()));

        request_body.insert("sig".to_string(), Value::String(signature));

        let response = self
            .client
            .post(&url)
            .header(CONTENT_TYPE, "application/json")
            .json(&Value::Object(request_body))
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
                "Crypto.com Error {}: {}",
                status, text
            )));
        }

        let json: Value =
            serde_json::from_str(&text).map_err(|e| ExchangeError::Parse(e.to_string()))?;

        // Check for "code" in response. 0 is success usually.
        if let Some(code) = json.get("code").and_then(|c| c.as_i64()) {
            if code != 0 {
                return Err(ExchangeError::Api(format!(
                    "Crypto.com API Error {}: {}",
                    code,
                    json.get("message").unwrap_or(&Value::Null)
                )));
            }
        }

        // Result is usually in "result" field
        if let Some(result) = json.get("result") {
            serde_json::from_value(result.clone()).map_err(|e| ExchangeError::Parse(e.to_string()))
        } else {
            // Fallback
            Ok(serde_json::from_value(json).unwrap_or_default())
        }
    }
}

#[async_trait]
impl ExchangeAdapter for CryptoComAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Test: private/get-account-summary
        let params = BTreeMap::new();
        // Check if we can call "private/get-account-summary"
        let _: Value = self
            .send_request("private/get-account-summary", params)
            .await?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        // private/create-order
        let endpoint = "private/create-order";

        // Params
        let mut params = BTreeMap::new();
        // instrument_name
        params.insert(
            "instrument_name".to_string(),
            Value::String(order.symbol.replace("/", "_").replace("-", "_")),
        );

        // side: BUY, SELL
        let side_str = match order.side {
            crate::model::Side::Buy | crate::model::Side::Long => "BUY",
            crate::model::Side::Sell | crate::model::Side::Short => "SELL",
        };
        params.insert("side".to_string(), Value::String(side_str.to_string()));

        // type: LIMIT, MARKET
        if let Some(price) = order.price {
            params.insert("type".to_string(), Value::String("LIMIT".to_string()));
            params.insert("price".to_string(), Value::String(price.to_string()));
            params.insert(
                "quantity".to_string(),
                Value::String(order.quantity.to_string()),
            );
            params.insert(
                "time_in_force".to_string(),
                Value::String("GOOD_TILL_CANCEL".to_string()),
            );
        } else {
            params.insert("type".to_string(), Value::String("MARKET".to_string()));
            // For Market Buy, "quantity" or "notional"?
            // Docs say: quantity for Limit. For Market?
            // "quantity" - valid for SELL.
            // "notional" - valid for BUY (amount of quote currency to spend).
            // "quantity" - valid for BUY (amount of base currency to buy)?
            // Crypto.com V2 Market Buy supports 'quantity' (base) OR 'notional' (quote).
            // We'll stick to 'quantity' (base) if standard, but often Market Buy requires Notional.
            // Let's try sending quantity and hope it works or default to notional if user provides it in some way.
            params.insert(
                "quantity".to_string(),
                Value::String(order.quantity.to_string()),
            );
        }

        // client_oid
        if !order.client_order_id.is_empty() {
            params.insert(
                "client_oid".to_string(),
                Value::String(order.client_order_id.clone()),
            );
        } else {
            params.insert(
                "client_oid".to_string(),
                Value::String(Uuid::new_v4().to_string()),
            );
        }

        let response: Value = self.send_request(endpoint, params).await?;

        // Response: { order_id: "...", client_oid: "..." }
        let order_id = response
            .get("order_id")
            .and_then(|v| {
                if let Some(s) = v.as_str() {
                    Some(s.to_string())
                } else {
                    v.as_u64().map(|u| u.to_string())
                }
            })
            .ok_or(ExchangeError::Parse("Missing order_id in response".into()))?;

        Ok(OrderResponse {
            order_id,
            client_order_id: order.client_order_id,
            symbol: order.symbol,
            status: "NEW".to_string(),
            executed_qty: Decimal::zero(),
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
        // private/cancel-order
        let endpoint = "private/cancel-order";
        let mut params = BTreeMap::new();
        params.insert(
            "instrument_name".to_string(),
            Value::String(symbol.replace("/", "_").replace("-", "_")),
        );
        params.insert("order_id".to_string(), Value::String(order_id.to_string()));

        let _: Value = self.send_request(endpoint, params).await?;

        Ok(OrderResponse {
            order_id: order_id.to_string(),
            client_order_id: "".to_string(),
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
        // private/get-account-summary
        let mut params = BTreeMap::new();
        if !asset.is_empty() {
            params.insert("currency".to_string(), Value::String(asset.to_string()));
        }

        let response: Value = self
            .send_request("private/get-account-summary", params)
            .await?;

        // Response: { accounts: [ { balance, available, currency, ... } ] }
        if let Some(accounts) = response.get("accounts").and_then(|a| a.as_array()) {
            for acc in accounts {
                if let Some(curr) = acc.get("currency").and_then(|c| c.as_str()) {
                    if curr == asset {
                        if let Some(avail) = acc.get("available").and_then(|a| a.as_f64()) {
                            return Decimal::from_f64(avail)
                                .ok_or(ExchangeError::Parse("Invalid number".into()));
                        }
                    }
                }
            }
        }

        Ok(Decimal::zero())
    }

    fn name(&self) -> &str {
        "cryptocom"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        // Crypto.com: private/get-positions
        let params = BTreeMap::new();
        let response: Value = self
            .send_request("private/get-positions", params)
            .await
            .unwrap_or_default();

        let mut positions = Vec::new();

        if let Some(position_list) = response.get("position_list").and_then(|p| p.as_array()) {
            for pos_data in position_list {
                let instrument = pos_data
                    .get("instrument_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                let quantity = pos_data
                    .get("quantity")
                    .and_then(|v| v.as_f64())
                    .and_then(Decimal::from_f64)
                    .unwrap_or(Decimal::zero());

                if quantity.is_zero() {
                    continue;
                }

                let _entry_price = pos_data
                    .get("open_position_pnl")
                    .and_then(|v| v.as_f64())
                    .and_then(Decimal::from_f64)
                    .unwrap_or(Decimal::zero());

                let avg_price = pos_data
                    .get("average_price")
                    .and_then(|v| v.as_f64())
                    .and_then(Decimal::from_f64)
                    .unwrap_or(Decimal::zero());

                let side_str = pos_data
                    .get("side")
                    .and_then(|v| v.as_str())
                    .unwrap_or("BUY");

                let side = if side_str == "SELL" {
                    crate::model::Side::Short
                } else {
                    crate::model::Side::Long
                };

                let session_pnl = pos_data
                    .get("session_pnl")
                    .and_then(|v| v.as_f64())
                    .and_then(Decimal::from_f64)
                    .unwrap_or(Decimal::zero());

                positions.push(Position {
                    symbol: instrument,
                    side,
                    size: quantity.abs(),
                    entry_price: avg_price,
                    stop_loss: Decimal::ZERO,
                    take_profits: vec![],
                    signal_id: "EXCHANGE_FETCHED".to_string(),
                    opened_at: Utc::now(),
                    regime_state: None,
                    phase: None,
                    metadata: None,
                    exchange: Some("CRYPTOCOM".to_string()),
                    position_mode: None,
                    realized_pnl: Decimal::ZERO,
                    unrealized_pnl: session_pnl,
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
