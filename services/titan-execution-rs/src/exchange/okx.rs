use crate::exchange::adapter::{ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse};
use crate::model::{Position, Side};
use async_trait::async_trait;
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::{Client, Method};
use rust_decimal::Decimal;
use sha2::Sha256;
use std::env;
use std::str::FromStr;

use crate::config::ExchangeConfig;
use crate::rate_limiter::TokenBucket;

pub struct OkxAdapter {
    api_key: String,
    secret_key: String,
    passphrase: String,
    base_url: String,
    client: Client,
    http_limiter: TokenBucket,
}

impl OkxAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let api_key = config
            .and_then(|c| c.get_api_key())
            .or_else(|| env::var("OKX_API_KEY").ok())
            .ok_or_else(|| {
                ExchangeError::Configuration(
                    "OKX_API_KEY not set (check config.json or env)".to_string(),
                )
            })?;

        let secret_key = config
            .and_then(|c| c.get_secret_key())
            .or_else(|| env::var("OKX_SECRET_KEY").ok())
            .ok_or_else(|| {
                ExchangeError::Configuration(
                    "OKX_SECRET_KEY not set (check config.json or env)".to_string(),
                )
            })?;

        // Passphrase is specific to OKX
        let passphrase = env::var("OKX_PASSPHRASE").map_err(|_| {
            ExchangeError::Configuration("OKX_PASSPHRASE not set (check env)".to_string())
        })?;

        let base_url = env::var("OKX_BASE_URL").unwrap_or_else(|_| {
            if config.map(|c| c.testnet).unwrap_or(false) {
                // OKX Demo Trading URL (simulated) or just use mainnet with test flag?
                // OKX uses the same URL for testnet usually but with header?
                // Actually OKX has a separate URL for demo trading sometimes, or just a flag.
                // For now, default to mainnet URL:
                "https://www.okx.com".to_string()
            } else {
                "https://www.okx.com".to_string()
            }
        });

        // Rate Limits: OKX V5 roughly 10-20 req/2s depending on tier.
        // Conservative: 5 req/s.
        let rate_limit = config.and_then(|c| c.rate_limit).unwrap_or(5) as f64;
        let http_limiter = TokenBucket::new(20, rate_limit);

        Ok(OkxAdapter {
            api_key,
            secret_key,
            passphrase,
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
        general_purpose::STANDARD.encode(mac.finalize().into_bytes())
    }

    async fn send_signed_request(
        &self,
        method: Method,
        path: &str,
        body: Option<String>,
    ) -> Result<String, ExchangeError> {
        self.http_limiter.acquire(1).await;

        let url = format!("{}{}", self.base_url, path);
        let timestamp = Utc::now().format("%Y-%m-%dT%H:%M:%S.000Z").to_string();

        let body_str = body.unwrap_or_default();
        let signature = self.sign(&timestamp, method.as_str(), path, &body_str);

        let mut request = self
            .client
            .request(method.clone(), &url)
            .header("OK-ACCESS-KEY", &self.api_key)
            .header("OK-ACCESS-SIGN", signature)
            .header("OK-ACCESS-TIMESTAMP", timestamp)
            .header("OK-ACCESS-PASSPHRASE", &self.passphrase)
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
                "OKX Request failed {}: {}",
                status, text
            )));
        }

        // OKX returns 200 even for some business errors, need to check "code" in JSON
        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| ExchangeError::Api(format!("Parse error: {}", e)))?;

        if let Some(code) = json["code"].as_str() {
            if code != "0" {
                return Err(ExchangeError::Api(format!(
                    "OKX API Error {}: {}",
                    code, json["msg"]
                )));
            }
        }

        Ok(text)
    }
}

#[async_trait]
impl ExchangeAdapter for OkxAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Simple health check: Get Tickers or Status
        // GET /api/v5/public/status
        let path = "/api/v5/public/status";
        // Public endpoint doesn't need signing usually, but using signed request for connectivity check is fine
        // Or strictly public:
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ExchangeError::Api(format!(
                "Init failed: {}",
                resp.status()
            )));
        }
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        let path = "/api/v5/trade/order";

        // Normalize symbol: remove '/', append '-SWAP' for perps if needed?
        // OKX Symbols: BTC-USDT (Spot), BTC-USDT-SWAP (Perp)
        // OrderRequest symbol usually comes as "BTC/USDT" or "BTCUSDT".
        // We need a robust mapping. For now, assuming config passes correct OKX instId or we do simple mapping.
        // Simple mapping: "BTC/USDT" -> "BTC-USDT-SWAP" (assuming linear perp for now as Titan usually trades perps)
        // Or we should introspect the symbol.
        // Let's assume input symbol is "BTCUSDT"
        let inst_id = if order.symbol.contains("-") {
            order.symbol.clone()
        } else {
            // Heuristic: Insert hyphen before last 4 chars (USDT) -> BTC-USDT
            // Then append -SWAP
            let s = order.symbol.replace("/", "");
            if s.ends_with("USDT") {
                let (base, _) = s.split_at(s.len() - 4);
                format!("{}-USDT-SWAP", base)
            } else {
                s // Fallback
            }
        };

        let side = match order.side {
            Side::Buy | Side::Long => "buy",
            Side::Sell | Side::Short => "sell",
        };

        let ord_type = if order.price.is_some() {
            "limit"
        } else {
            "market"
        };

        // OKX Quantity: "sz"
        // For Swap/Futures, sz is in contracts (ctVal). But simpler to use "sz" if we know contract size or if we use "cash" (not supported for all).
        // Standard in Titan seems to be base asset quantity.
        // OKX Swaps usually trade in contracts (e.g. 1 contract = 0.01 BTC or 100 USD).
        // This is a complexity. For now, we assume `order.quantity` is passed in contracts or we need a converter.
        // Passing it as string.

        let mut payload = serde_json::json!({
            "instId": inst_id,
            "tdMode": "cross", // Default to cross, or "isolated"
            "side": side,
            "ordType": ord_type,
            "sz": order.quantity.to_string(),
        });

        if let Some(price) = order.price {
            payload["px"] = serde_json::Value::String(price.to_string());
        }

        if !order.client_order_id.is_empty() {
            payload["clOrdId"] = serde_json::Value::String(order.client_order_id.clone());
        }

        let resp_text = self
            .send_signed_request(Method::POST, path, Some(payload.to_string()))
            .await?;
        let json: serde_json::Value =
            serde_json::from_str(&resp_text).map_err(|e| ExchangeError::Api(e.to_string()))?;

        // Response: { "code": "0", "data": [ { "ordId": "...", "clOrdId": "...", ... } ] }
        let data = json["data"]
            .as_array()
            .and_then(|arr| arr.first())
            .ok_or(ExchangeError::Api("No data in response".into()))?;

        let order_id = data["ordId"].as_str().unwrap_or("").to_string();

        Ok(OrderResponse {
            order_id,
            client_order_id: order.client_order_id,
            symbol: order.symbol,
            status: "NEW".to_string(), // Initial status
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
        let path = "/api/v5/trade/cancel-order";

        // Map symbol again
        let inst_id = if symbol.contains("-") {
            symbol.to_string()
        } else {
            let s = symbol.replace("/", "");
            if s.ends_with("USDT") {
                let (base, _) = s.split_at(s.len() - 4);
                format!("{}-USDT-SWAP", base)
            } else {
                s
            }
        };

        let payload = serde_json::json!({
            "instId": inst_id,
            "ordId": order_id,
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
        // GET /api/v5/account/balance?ccy=USDT
        let path = format!("/api/v5/account/balance?ccy={}", asset);
        let resp_text = self.send_signed_request(Method::GET, &path, None).await?;

        let json: serde_json::Value =
            serde_json::from_str(&resp_text).map_err(|e| ExchangeError::Api(e.to_string()))?;
        let data = json["data"]
            .as_array()
            .and_then(|arr| arr.first())
            .ok_or(ExchangeError::Api("No balance data".into()))?;
        let details = data["details"]
            .as_array()
            .ok_or(ExchangeError::Api("No balance details".into()))?;

        for d in details {
            if d["ccy"].as_str() == Some(asset) {
                let avail = d["availEq"].as_str().unwrap_or("0");
                return Decimal::from_str(avail)
                    .map_err(|e| ExchangeError::Api(format!("Decimal parse: {}", e)));
            }
        }

        Ok(Decimal::ZERO)
    }

    fn name(&self) -> &str {
        "OKX"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        // GET /api/v5/account/positions
        let path = "/api/v5/account/positions";
        let resp_text = self.send_signed_request(Method::GET, path, None).await?;

        let json: serde_json::Value =
            serde_json::from_str(&resp_text).map_err(|e| ExchangeError::Api(e.to_string()))?;
        let data = json["data"]
            .as_array()
            .ok_or(ExchangeError::Api("No position data".into()))?;

        let mut positions = Vec::new();

        for item in data {
            let inst_id = item["instId"].as_str().unwrap_or("").to_string();
            let pos_str = item["pos"].as_str().unwrap_or("0");
            let pos_decimal = Decimal::from_str(pos_str).unwrap_or(Decimal::ZERO);

            if pos_decimal.is_zero() {
                continue;
            }

            let avg_px_str = item["avgPx"].as_str().unwrap_or("0");
            let entry_price = Decimal::from_str(avg_px_str).unwrap_or(Decimal::ZERO);

            let pos_side = item["posSide"].as_str().unwrap_or("net"); // long, short, net

            let side = if pos_side == "long" {
                Side::Long
            } else if pos_side == "short" {
                Side::Short
            } else if pos_decimal.is_sign_positive() {
                Side::Long
            } else {
                Side::Short
            };

            let upl_str = item["upl"].as_str().unwrap_or("0");
            let unrealized_pnl = Decimal::from_str(upl_str).unwrap_or(Decimal::ZERO);

            positions.push(Position {
                symbol: inst_id,
                side,
                size: pos_decimal.abs(),
                entry_price,
                stop_loss: Decimal::ZERO,
                take_profits: vec![],
                signal_id: "OKX_FETCHED".to_string(),
                opened_at: Utc::now(),
                regime_state: None,
                phase: None,
                metadata: None,
                exchange: Some("OKX".to_string()),
                position_mode: Some(pos_side.to_string()),
                realized_pnl: Decimal::ZERO,
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
