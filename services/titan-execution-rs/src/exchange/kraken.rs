use crate::exchange::adapter::{ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse};
use crate::model::{Position, Side};
use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose};
use chrono::Utc;
use hmac::{Hmac, Mac};
use reqwest::Client;
use rust_decimal::Decimal;
use sha2::{Digest, Sha256, Sha512};
use std::env;
use std::str::FromStr;

use crate::config::ExchangeConfig;
use crate::rate_limiter::TokenBucket;

pub struct KrakenAdapter {
    api_key: String,
    secret_key: String,
    base_url: String,
    client: Client,
    http_limiter: TokenBucket,
}

impl KrakenAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let api_key = config
            .and_then(|c| c.get_api_key())
            .or_else(|| env::var("KRAKEN_API_KEY").ok())
            .ok_or_else(|| {
                ExchangeError::Configuration(
                    "KRAKEN_API_KEY not set (check config.json or env)".to_string(),
                )
            })?;

        let secret_key = config
            .and_then(|c| c.get_secret_key())
            .or_else(|| env::var("KRAKEN_SECRET_KEY").ok())
            .ok_or_else(|| {
                ExchangeError::Configuration(
                    "KRAKEN_SECRET_KEY not set (check config.json or env)".to_string(),
                )
            })?;

        let base_url = env::var("KRAKEN_BASE_URL").unwrap_or_else(|_| {
            if config.map(|c| c.testnet).unwrap_or(false) {
                "https://api.demo-futures.kraken.com".to_string()
            } else {
                "https://api.kraken.com".to_string()
            }
        });

        // Kraken limits are tier based. Start conservative.
        // Approx 15 req/s (Counter increases, but basic limit).
        let rate_limit = config.and_then(|c| c.rate_limit).unwrap_or(5) as f64;
        let http_limiter = TokenBucket::new(15, rate_limit);

        Ok(KrakenAdapter {
            api_key,
            secret_key,
            base_url,
            client: Client::new(),
            http_limiter,
        })
    }

    fn sign(&self, path: &str, nonce: &str, post_data: &str) -> Result<String, ExchangeError> {
        // Decode secret key from Base64
        let secret = general_purpose::STANDARD
            .decode(&self.secret_key)
            .map_err(|e| {
                ExchangeError::Configuration(format!("Invalid Kraken Secret (Base64): {}", e))
            })?;

        // Message = URI path + SHA256(nonce + POST data)
        let mut sha256 = Sha256::new();
        sha256.update(nonce.as_bytes());
        sha256.update(post_data.as_bytes());
        let sha256_digest = sha256.finalize();

        let mut mac =
            Hmac::<Sha512>::new_from_slice(&secret).expect("HMAC can take key of any size");
        mac.update(path.as_bytes());
        mac.update(&sha256_digest);

        Ok(general_purpose::STANDARD.encode(mac.finalize().into_bytes()))
    }

    async fn send_private_request(
        &self,
        path: &str,
        params: Option<Vec<(&str, String)>>,
    ) -> Result<String, ExchangeError> {
        self.http_limiter.acquire(1).await;

        let nonce = Utc::now().timestamp_millis().to_string();
        let mut body_params = params.unwrap_or_default();
        body_params.push(("nonce", nonce.clone()));

        let post_data = serde_urlencoded::to_string(&body_params)
            .map_err(|e| ExchangeError::Api(format!("UrlEncode error: {}", e)))?;

        let signature = self.sign(path, &nonce, &post_data)?;
        let url = format!("{}{}", self.base_url, path);

        let resp = self
            .client
            .post(&url)
            .header("API-Key", &self.api_key)
            .header("API-Sign", signature)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .body(post_data)
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
                "Kraken Request failed {}: {}",
                status, text
            )));
        }

        // Kraken always returns 200, check error inside
        // { "error": [], "result": { ... } }
        let json: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| ExchangeError::Api(format!("Parse error: {}", e)))?;

        if let Some(err_arr) = json["error"].as_array() {
            if !err_arr.is_empty() {
            // Return generic API error (or combine errors)
            let msgs: Vec<String> = err_arr
                .iter()
                .map(|v| v.as_str().unwrap_or("").to_string())
                .collect();
            return Err(ExchangeError::Api(format!(
                "Kraken API Error: {}",
                msgs.join(", ")
            )));
        }
    }

        Ok(text)
    }
}

#[async_trait]
impl ExchangeAdapter for KrakenAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Check balance to verify creds
        let _ = self.get_balance("ZUSD").await?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        // path: /0/private/AddOrder
        let path = "/0/private/AddOrder";

        let pair = order
            .symbol
            .replace("BTC", "XBT")
            .replace("USDT", "USD")
            .replace("/", ""); // Simple mapping
        let type_ = if order.side == Side::Buy || order.side == Side::Long {
            "buy"
        } else {
            "sell"
        };
        let ordertype = if order.price.is_some() {
            "limit"
        } else {
            "market"
        };
        let volume = order.quantity.to_string();

        let mut params = vec![
            ("pair", pair.clone()),
            ("type", type_.to_string()),
            ("ordertype", ordertype.to_string()),
            ("volume", volume),
        ];

        if let Some(price) = order.price {
            params.push(("price", price.to_string()));
        }

        if !order.client_order_id.is_empty() {
            // Kraken uses userref (i32). If client_order_id is not integer, we might ignore or hash it?
            // "userref is a 32-bit signed integer"
            // If client_order_id is string UUID, we can't use it directly.
            // Ignoring for now.
        }

        let resp_text = self.send_private_request(path, Some(params)).await?;
        let json: serde_json::Value =
            serde_json::from_str(&resp_text).map_err(|e| ExchangeError::Api(e.to_string()))?;

        // Response: { result: { txid: ["..."], descr: ... } }
        let result = &json["result"];
        let txid_arr = result["txid"]
            .as_array()
            .ok_or(ExchangeError::Api("No txid".into()))?;
        let order_id = txid_arr
            .first()
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        Ok(OrderResponse {
            order_id,
            client_order_id: order.client_order_id,
            symbol: order.symbol,
            status: "NEW".to_string(),
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
        let path = "/0/private/CancelOrder";
        let params = vec![("txid", order_id.to_string())];

        let _ = self.send_private_request(path, Some(params)).await?;

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
        // path: /0/private/Balance
        let path = "/0/private/Balance";
        let resp_text = self.send_private_request(path, None).await?;

        let json: serde_json::Value =
            serde_json::from_str(&resp_text).map_err(|e| ExchangeError::Api(e.to_string()))?;
        let result = &json["result"];

        // Kraken balances key example: "ZUSD", "XXBT"
        // Need to map asset name if standard
        let key = if asset == "USD" {
            "ZUSD"
        } else if asset == "BTC" {
            "XXBT"
        } else {
            asset
        };

        if let Some(val) = result[key].as_str() {
            return Decimal::from_str(val).map_err(|e| ExchangeError::Api(e.to_string()));
        }

        // Try exact match
        if let Some(val) = result[asset].as_str() {
            return Decimal::from_str(val).map_err(|e| ExchangeError::Api(e.to_string()));
        }

        Ok(Decimal::ZERO)
    }

    fn name(&self) -> &str {
        "Kraken Spot"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        // Kraken Spot margin positions via /0/private/OpenPositions
        let path = "/0/private/OpenPositions";
        let resp_text = self.send_private_request(path, None).await?;

        let json: serde_json::Value =
            serde_json::from_str(&resp_text).map_err(|e| ExchangeError::Api(e.to_string()))?;
        let result = &json["result"];

        let mut positions = Vec::new();

        if let Some(pos_map) = result.as_object() {
            for (_pos_id, pos_data) in pos_map {
                let symbol = pos_data["pair"].as_str().unwrap_or("").to_string();
                let vol_str = pos_data["vol"].as_str().unwrap_or("0");
                let vol = Decimal::from_str(vol_str).unwrap_or(Decimal::ZERO);

                if vol.is_zero() {
                    continue;
                }

                let cost_str = pos_data["cost"].as_str().unwrap_or("0");
                let cost = Decimal::from_str(cost_str).unwrap_or(Decimal::ZERO);
                let entry_price = if !vol.is_zero() {
                    cost / vol
                } else {
                    Decimal::ZERO
                };

                let type_str = pos_data["type"].as_str().unwrap_or("buy");
                let side = if type_str == "sell" {
                    Side::Short
                } else {
                    Side::Long
                };

                let net_str = pos_data["net"].as_str().unwrap_or("0");
                let unrealized_pnl = Decimal::from_str(net_str).unwrap_or(Decimal::ZERO);

                positions.push(Position {
                    symbol,
                    side,
                    size: vol.abs(),
                    entry_price,
                    stop_loss: Decimal::ZERO,
                    take_profits: vec![],
                    signal_id: "EXCHANGE_FETCHED".to_string(),
                    opened_at: Utc::now(),
                    regime_state: None,
                    phase: None,
                    metadata: None,
                    exchange: Some("KRAKEN".to_string()),
                    position_mode: None,
                    realized_pnl: Decimal::ZERO,
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
