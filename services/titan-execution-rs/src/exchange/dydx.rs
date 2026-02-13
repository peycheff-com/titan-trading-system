use crate::config::ExchangeConfig;
use crate::exchange::adapter::{
    ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse, Position,
};
use crate::model::Side;
use async_trait::async_trait;
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::{Client, Method};
use rust_decimal::prelude::*;
use serde_json::Value;
use sha2::Sha256;
use std::time::Duration;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

/// dYdX v4 Adapter
///
/// Uses the dYdX v4 Indexer REST API for account queries (balances, positions)
/// and the validator REST API for order placement/cancellation.
///
/// Testnet: `https://indexer.v4testnet.dydx.exchange/v4`
/// Mainnet: `https://indexer.dydx.trade/v4`
#[derive(Clone)]
pub struct DydxAdapter {
    api_key: String,
    secret_key: String,
    passphrase: String,
    base_url: String,
    address: String, // dYdX v4 subaccount address (cosmos address)
    client: Client,
}


impl DydxAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let config = config.ok_or(ExchangeError::Configuration("Missing dYdX config".into()))?;

        let api_key = config.get_api_key().ok_or(ExchangeError::Configuration(
            "Missing dYdX API Key".into(),
        ))?;
        let secret_key = config.get_secret_key().ok_or(ExchangeError::Configuration(
            "Missing dYdX Secret Key".into(),
        ))?;

        // Passphrase stored in api_key_alt field (reusing config field)
        let passphrase = config
            .api_key_alt
            .clone()
            .unwrap_or_default();

        // dYdX v4 address (cosmos-based) — stored via env var
        let address = std::env::var("DYDX_ADDRESS")
            .unwrap_or_default();

        let base_url = std::env::var("DYDX_BASE_URL").unwrap_or_else(|_| {
            if config.testnet {
                "https://indexer.v4testnet.dydx.exchange/v4".to_string()
            } else {
                "https://indexer.dydx.trade/v4".to_string()
            }
        });

        Ok(Self {
            api_key,
            secret_key,
            passphrase,
            base_url,
            address,
            client: Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .map_err(|e| ExchangeError::Network(e.to_string()))?,
        })
    }

    fn sign(&self, request_path: &str, method: &str, timestamp: &str, body: &str) -> Result<String, ExchangeError> {
        // dYdX v4 signature: HMAC-SHA256(secret, timestamp + method + requestPath + body)
        let message = format!("{}{}{}{}", timestamp, method, request_path, body);

        let secret_bytes = base64::engine::general_purpose::STANDARD
            .decode(&self.secret_key)
            .unwrap_or_else(|_| self.secret_key.as_bytes().to_vec());

        let mut mac = HmacSha256::new_from_slice(&secret_bytes)
            .map_err(|e| ExchangeError::Signing(e.to_string()))?;
        mac.update(message.as_bytes());
        let result = mac.finalize();

        Ok(base64::engine::general_purpose::STANDARD.encode(result.into_bytes()))
    }

    async fn send_signed_request(
        &self,
        method: Method,
        path: &str,
        body: Option<String>,
    ) -> Result<String, ExchangeError> {
        let url = format!("{}{}", self.base_url, path);
        let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
        let body_str = body.unwrap_or_default();

        let signature = self.sign(path, method.as_str(), &timestamp, &body_str)?;

        let mut request = self
            .client
            .request(method.clone(), &url)
            .header("DYDX-SIGNATURE", &signature)
            .header("DYDX-API-KEY", &self.api_key)
            .header("DYDX-TIMESTAMP", &timestamp)
            .header("DYDX-PASSPHRASE", &self.passphrase)
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
                "dYdX Request failed {}: {}",
                status, text
            )));
        }

        Ok(text)
    }

    /// Public indexer request (no auth needed for reads)
    async fn indexer_get(&self, path: &str) -> Result<String, ExchangeError> {
        let url = format!("{}{}", self.base_url, path);

        let resp = self
            .client
            .get(&url)
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
                "dYdX Indexer failed {}: {}",
                status, text
            )));
        }

        Ok(text)
    }
}

use base64::Engine;

#[async_trait]
impl ExchangeAdapter for DydxAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Health check via indexer
        let path = "/height";
        let text = self.indexer_get(path).await?;
        let json: Value = serde_json::from_str(&text)
            .map_err(|e| ExchangeError::Api(format!("Parse error: {}", e)))?;

        if json.get("height").is_none() {
            return Err(ExchangeError::Api("dYdX indexer health check failed: no height".into()));
        }

        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        // dYdX v4 order placement via signed REST API
        let path = "/orders";

        let side_str = match order.side {
            Side::Buy | Side::Long => "BUY",
            Side::Sell | Side::Short => "SELL",
        };

        let client_id = if order.client_order_id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            order.client_order_id.clone()
        };

        // dYdX v4 uses market ticker format like "BTC-USD"
        let market = order.symbol.replace("/", "-").replace("USDT", "USD");

        let order_type = if order.price.is_some() { "LIMIT" } else { "MARKET" };
        let time_in_force = if order.price.is_some() { "GTT" } else { "FOK" };

        let mut payload = serde_json::json!({
            "market": market,
            "side": side_str,
            "type": order_type,
            "size": order.quantity.to_string(),
            "timeInForce": time_in_force,
            "postOnly": false,
            "clientId": client_id,
            "reduceOnly": order.reduce_only,
        });

        if let Some(price) = order.price {
            payload["price"] = serde_json::json!(price.to_string());
            // GTT orders need goodTilTime
            let good_til = Utc::now() + chrono::Duration::hours(24);
            payload["goodTilTime"] = serde_json::json!(good_til.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string());
        }

        let body = payload.to_string();
        let resp_text = self
            .send_signed_request(Method::POST, path, Some(body))
            .await?;

        let json: Value = serde_json::from_str(&resp_text)
            .map_err(|e| ExchangeError::Api(format!("Parse error: {}", e)))?;

        let order_id = json
            .get("order")
            .and_then(|o| o.get("id"))
            .and_then(|v| v.as_str())
            .unwrap_or(&client_id)
            .to_string();

        let status = json
            .get("order")
            .and_then(|o| o.get("status"))
            .and_then(|v| v.as_str())
            .unwrap_or("PENDING")
            .to_string();

        Ok(OrderResponse {
            order_id,
            client_order_id: client_id,
            symbol: order.symbol,
            status,
            avg_price: None,
            executed_qty: Decimal::zero(),
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
        let path = format!("/orders/{}", order_id);

        let _ = self
            .send_signed_request(Method::DELETE, &path, None)
            .await?;

        Ok(OrderResponse {
            order_id: order_id.to_string(),
            client_order_id: "".to_string(),
            symbol: symbol.to_string(),
            status: "CANCELED".to_string(),
            avg_price: None,
            executed_qty: Decimal::zero(),
            t_ack: Utc::now().timestamp_millis(),
            t_exchange: None,
            fee: None,
            fee_asset: None,
        })
    }

    async fn get_balance(&self, asset: &str) -> Result<Decimal, ExchangeError> {
        if self.address.is_empty() {
            return Err(ExchangeError::Configuration(
                "DYDX_ADDRESS not set — required for balance queries".into(),
            ));
        }

        // GET /addresses/{address}/subaccountNumber/0
        let path = format!("/addresses/{}/subaccountNumber/0", self.address);
        let text = self.indexer_get(&path).await?;

        let json: Value = serde_json::from_str(&text)
            .map_err(|e| ExchangeError::Api(format!("Parse error: {}", e)))?;

        // dYdX v4 subaccount has "equity" and "freeCollateral" fields
        let equity_str = json
            .get("subaccount")
            .and_then(|s| s.get("equity"))
            .and_then(|v| v.as_str())
            .unwrap_or("0");

        let free_collateral_str = json
            .get("subaccount")
            .and_then(|s| s.get("freeCollateral"))
            .and_then(|v| v.as_str())
            .unwrap_or("0");

        // Return free collateral as available balance for the primary asset (USDC)
        if asset == "USDC" || asset == "USD" {
            return Decimal::from_str(free_collateral_str)
                .map_err(|e| ExchangeError::Api(format!("Decimal parse: {}", e)));
        }

        // For other assets, return equity (total account value)
        Decimal::from_str(equity_str)
            .map_err(|e| ExchangeError::Api(format!("Decimal parse: {}", e)))
    }

    fn name(&self) -> &str {
        "dydx"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        if self.address.is_empty() {
            return Ok(Vec::new());
        }

        let path = format!("/addresses/{}/subaccountNumber/0", self.address);
        let text = self.indexer_get(&path).await?;

        let json: Value = serde_json::from_str(&text)
            .map_err(|e| ExchangeError::Api(format!("Parse error: {}", e)))?;

        let mut positions = Vec::new();

        if let Some(open_positions) = json
            .get("subaccount")
            .and_then(|s| s.get("openPerpetualPositions"))
            .and_then(|p| p.as_object())
        {
            for (market, pos_data) in open_positions {
                let size_str = pos_data
                    .get("size")
                    .and_then(|v| v.as_str())
                    .unwrap_or("0");
                let size = Decimal::from_str(size_str).unwrap_or(Decimal::zero());

                if size.is_zero() {
                    continue;
                }

                let entry_str = pos_data
                    .get("entryPrice")
                    .and_then(|v| v.as_str())
                    .unwrap_or("0");
                let entry_price = Decimal::from_str(entry_str).unwrap_or(Decimal::zero());

                let side_str = pos_data
                    .get("side")
                    .and_then(|v| v.as_str())
                    .unwrap_or("LONG");

                let side = if side_str == "SHORT" {
                    Side::Short
                } else {
                    Side::Long
                };

                let unrealized_pnl_str = pos_data
                    .get("unrealizedPnl")
                    .and_then(|v| v.as_str())
                    .unwrap_or("0");
                let unrealized_pnl = Decimal::from_str(unrealized_pnl_str).unwrap_or(Decimal::zero());

                let realized_pnl_str = pos_data
                    .get("realizedPnl")
                    .and_then(|v| v.as_str())
                    .unwrap_or("0");
                let realized_pnl = Decimal::from_str(realized_pnl_str).unwrap_or(Decimal::zero());

                positions.push(Position {
                    symbol: market.clone(),
                    side,
                    size: size.abs(),
                    entry_price,
                    stop_loss: Decimal::ZERO,
                    take_profits: vec![],
                    signal_id: "EXCHANGE_FETCHED".to_string(),
                    opened_at: Utc::now(),
                    regime_state: None,
                    phase: None,
                    metadata: None,
                    exchange: Some("DYDX".to_string()),
                    position_mode: Some(side_str.to_string()),
                    realized_pnl,
                    unrealized_pnl,
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
