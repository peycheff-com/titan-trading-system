use crate::exchange::adapter::{ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse};
use crate::model::{OrderType, Position, Side};
use async_trait::async_trait;
use hex;
use hmac::{Hmac, Mac};
use reqwest::{Client, Method};
use rust_decimal::Decimal;
use serde::Deserialize;
use sha2::Sha256;
use std::env;

use crate::config::ExchangeConfig;
use crate::rate_limiter::TokenBucket;

type HmacSha256 = Hmac<Sha256>;

const RECV_WINDOW: &str = "5000";

pub struct BybitAdapter {
    client: Client,
    api_key: String,
    api_secret: String,
    base_url: String,
    order_limiter: TokenBucket,
    query_limiter: TokenBucket,
}

impl BybitAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let api_key = config
            .and_then(|c| c.get_api_key())
            .or_else(|| env::var("BYBIT_API_KEY").ok())
            .ok_or_else(|| ExchangeError::Configuration("BYBIT_API_KEY not set".to_string()))?;

        let api_secret = config
            .and_then(|c| c.get_secret_key())
            .or_else(|| env::var("BYBIT_SECRET_KEY").ok())
            .ok_or_else(|| ExchangeError::Configuration("BYBIT_SECRET_KEY not set".to_string()))?;

        let order_rps = env::var("BYBIT_ORDER_RPS")
            .unwrap_or("10".to_string())
            .parse::<f64>()
            .unwrap_or(10.0);

        // Use config rate limit if set, otherwise env/default
        let order_rps = config
            .and_then(|c| c.rate_limit)
            .map(|r| r as f64)
            .unwrap_or(order_rps);

        let query_rps = env::var("BYBIT_QUERY_RPS")
            .unwrap_or("50".to_string())
            .parse::<f64>()
            .unwrap_or(50.0);

        let base_url = env::var("BYBIT_BASE_URL").unwrap_or_else(|_| {
            if config.map(|c| c.testnet).unwrap_or(false) {
                "https://api-testnet.bybit.com".to_string()
            } else {
                "https://api.bybit.com".to_string()
            }
        });

        Ok(Self {
            client: Client::new(),
            api_key,
            api_secret,
            base_url,
            order_limiter: TokenBucket::new(20, order_rps), // Burst 20, Custom RPS
            query_limiter: TokenBucket::new(50, query_rps), // Burst 50, Higher RPS
        })
    }

    fn sign(&self, timestamp: &str, params: &str) -> Result<String, ExchangeError> {
        let payload = format!("{}{}{}{}", timestamp, self.api_key, RECV_WINDOW, params);

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
        payload: Option<serde_json::Value>,
    ) -> Result<T, ExchangeError> {
        let timestamp = chrono::Utc::now().timestamp_millis().to_string();
        let body_str = if let Some(p) = &payload {
            serde_json::to_string(p).map_err(|e| ExchangeError::Api(e.to_string()))?
        } else {
            String::new()
        };

        if method != Method::GET {
            // Write/Order operations
            self.order_limiter.acquire(1).await;
        } else {
            // Read/Query operations
            self.query_limiter.acquire(1).await;
        }

        let (endpoint_path, query_string) = if method == Method::GET {
            if let Some((path, query)) = endpoint.split_once('?') {
                (path, query)
            } else {
                (endpoint, "")
            }
        } else {
            (endpoint, "")
        };

        let params_for_sign = if method == Method::GET {
            if !query_string.is_empty() {
                query_string.to_string()
            } else {
                body_str.clone()
            }
        } else {
            body_str.clone()
        };

        let signature = self.sign(&timestamp, &params_for_sign)?;

        let url = if method == Method::GET && !query_string.is_empty() {
            format!("{}{}?{}", self.base_url, endpoint_path, query_string)
        } else {
            format!("{}{}", self.base_url, endpoint_path)
        };
        let mut request = self
            .client
            .request(method, &url)
            .header("X-BAPI-API-KEY", &self.api_key)
            .header("X-BAPI-TIMESTAMP", timestamp)
            .header("X-BAPI-SIGN", signature)
            .header("X-BAPI-RECV-WINDOW", RECV_WINDOW)
            .header("Content-Type", "application/json");

        if !body_str.is_empty() {
            request = request.body(body_str);
        }

        let response = request
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
                "Bybit HTTP Error {}: {}",
                status, text
            )));
        }

        // Bybit wraps responses in { retCode: 0, result: { ... } }
        let base_resp: BybitBaseResponse<T> = serde_json::from_str(&text).map_err(|e| {
            ExchangeError::Api(format!("Failed to parse response: {} | body: {}", e, text))
        })?;

        if base_resp.ret_code != 0 {
            return Err(ExchangeError::Api(format!(
                "Bybit API Error {}: {}",
                base_resp.ret_code, base_resp.ret_msg
            )));
        }

        Ok(base_resp.result)
    }
}

pub(crate) fn build_order_payload(order: &OrderRequest) -> serde_json::Value {
    let side = match order.side {
        Side::Buy | Side::Long => "Buy",
        Side::Sell | Side::Short => "Sell",
    };

    let order_type = match order.order_type {
        OrderType::Limit => "Limit",
        OrderType::Market => "Market",
        _ => return serde_json::json!({"error": "Unsupported order type for Bybit"}),
    };

    let mut payload = serde_json::json!({
        "category": "linear",
        "symbol": order.symbol,
        "side": side,
        "orderType": order_type,
        "qty": order.quantity.to_string(),
        "timeInForce": "GTC",
        "orderLinkId": order.client_order_id,
        "reduceOnly": order.reduce_only
    });

    if let Some(price) = order.price
        && let Some(obj) = payload.as_object_mut()
    {
        obj.insert("price".to_string(), serde_json::json!(price.to_string()));
    }

    payload
}

#[async_trait]
impl ExchangeAdapter for BybitAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Test connection by fetching time or server status
        // /v5/market/time
        // Actually let's just assume if we can build it, it's ok.
        // Or check balance to verify keys.
        self.get_balance("USDT").await.map(|_| ()).map_err(|e| {
            if e.to_string().contains("API error") {
                // If API key is wrong, this will fail
                e
            } else {
                // Ignore network error for init check? No, fail.
                e
            }
        })
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        let payload = build_order_payload(&order);
        if payload.get("error").is_some() {
            return Err(ExchangeError::Configuration(
                "Unsupported order type for Bybit".into(),
            ));
        }

        let resp: BybitOrderResult = self
            .request(Method::POST, "/v5/order/create", Some(payload))
            .await?;

        Ok(OrderResponse {
            order_id: resp.order_id,
            client_order_id: resp.order_link_id,
            symbol: resp.symbol,
            status: resp.order_status,
            avg_price: None, // Bybit Async response doesn't give fill price immediately usually
            executed_qty: Decimal::ZERO, // Need to fetch or wait for ws
            t_ack: chrono::Utc::now().timestamp_millis(),
            t_exchange: None, // Not readily available in Async response
            fee: None,
            fee_asset: None,
        })
    }

    async fn cancel_order(
        &self,
        symbol: &str,
        order_id: &str,
    ) -> Result<OrderResponse, ExchangeError> {
        let payload = serde_json::json!({
            "category": "linear",
            "symbol": symbol,
            "orderId": order_id
        });

        let resp: BybitOrderResult = self
            .request(Method::POST, "/v5/order/cancel", Some(payload))
            .await?;

        Ok(OrderResponse {
            order_id: resp.order_id,
            client_order_id: resp.order_link_id,
            symbol: resp.symbol,
            status: "CANCELLED".to_string(),
            avg_price: None,
            executed_qty: Decimal::ZERO,
            t_ack: chrono::Utc::now().timestamp_millis(),
            t_exchange: None,
            fee: None,
            fee_asset: None,
        })
    }

    async fn get_balance(&self, asset: &str) -> Result<Decimal, ExchangeError> {
        // /v5/account/wallet-balance?accountType=UNIFIED
        // This is a GET request which requires query string signing logic which is annoying.
        // For now, let's implement a simplified version or skip if too complex for single pass.
        // But init() relies on it.
        // Let's implement GET signing properly.
        // HACK: for now return 0.0 to pass init check if we can't easily sign GET.
        // Actually, we can use POST to /v5/account/wallet-balance? No, it's GET.

        if asset.is_empty() {
            return Err(ExchangeError::Configuration(
                "Bybit get_balance requires an asset symbol".to_string(),
            ));
        }

        self.query_limiter.acquire(1).await;

        let timestamp = chrono::Utc::now().timestamp_millis().to_string();
        let query = format!("accountType=UNIFIED&coin={}", asset);
        let signature = self.sign(&timestamp, &query)?;

        let url = format!(
            "{}{}?{}",
            self.base_url, "/v5/account/wallet-balance", query
        );
        let resp = self
            .client
            .get(&url)
            .header("X-BAPI-API-KEY", &self.api_key)
            .header("X-BAPI-TIMESTAMP", &timestamp)
            .header("X-BAPI-SIGN", signature)
            .header("X-BAPI-RECV-WINDOW", RECV_WINDOW)
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
                "Bybit HTTP Error {}: {}",
                status, text
            )));
        }

        let base_resp: BybitBaseResponse<BybitWalletBalanceResult> = serde_json::from_str(&text)
            .map_err(|e| {
                ExchangeError::Api(format!("Failed to parse response: {} | body: {}", e, text))
            })?;

        if base_resp.ret_code != 0 {
            return Err(ExchangeError::Api(format!(
                "Bybit API Error {}: {}",
                base_resp.ret_code, base_resp.ret_msg
            )));
        }

        let asset_upper = asset.to_uppercase();
        for account in base_resp.result.list {
            for coin in account.coin {
                if coin.coin.to_uppercase() == asset_upper {
                    return Decimal::from_str_exact(&coin.wallet_balance)
                        .map_err(|e| ExchangeError::Api(format!("Invalid balance format: {}", e)));
                }
            }
        }

        Err(ExchangeError::Api(format!(
            "Balance for {} not found",
            asset
        )))
    }

    fn name(&self) -> &str {
        "Bybit V5"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        // /v5/position/list?category=linear&settleCoin=USDT
        self.query_limiter.acquire(1).await;

        let _timestamp = chrono::Utc::now().timestamp_millis().to_string(); // Need to use same timestamp?
        // request() handles timestamp and sign.
        // We just need endpoint + query.

        // request() splits endpoint by ?
        let endpoint = "/v5/position/list?category=linear&settleCoin=USDT";

        let resp: serde_json::Value = self.request(Method::GET, endpoint, None).await?;

        // resp is already result (BybitBaseResponse.result)
        // Check "list"
        let mut positions = Vec::new();

        if let Some(list) = resp.get("list").and_then(|v| v.as_array()) {
            for item in list {
                let symbol = item["symbol"].as_str().unwrap_or("").to_string();
                let size_str = item["size"].as_str().unwrap_or("0");
                let size = rust_decimal::Decimal::from_str_exact(size_str).unwrap_or(Decimal::ZERO);

                if size.is_zero() {
                    continue;
                }

                let side_str = item["side"].as_str().unwrap_or("Buy");
                // Bybit side: "Buy" means Long, "Sell" means Short usually. If idx is defined in Hedge mode...
                // Assuming "Buy"/"Sell"
                let side = if side_str == "Sell" {
                    Side::Short
                } else {
                    Side::Long
                };

                let avg_price_str = item["avgPrice"].as_str().unwrap_or("0");
                let entry_price =
                    rust_decimal::Decimal::from_str_exact(avg_price_str).unwrap_or(Decimal::ZERO);

                positions.push(Position {
                    symbol,
                    side,
                    size,
                    entry_price,
                    stop_loss: Decimal::ZERO,
                    take_profits: vec![],
                    signal_id: "EXCHANGE_FETCHED".to_string(),
                    opened_at: chrono::Utc::now(),
                    regime_state: None,
                    phase: None,
                    metadata: None,
                    exchange: Some("BYBIT".to_string()),
                    position_mode: None,
                    realized_pnl: Decimal::ZERO,
                    unrealized_pnl: item["unrealisedPnl"]
                        .as_str()
                        .and_then(|s| Decimal::from_str_exact(s).ok())
                        .unwrap_or(Decimal::ZERO),
                    fees_paid: Decimal::ZERO,
                    funding_paid: item["cumRealisedPnl"]
                        .as_str()
                        .and_then(|s| Decimal::from_str_exact(s).ok())
                        .unwrap_or(Decimal::ZERO), // Approximate mapping
                    last_mark_price: None,
                    last_update_ts: chrono::Utc::now().timestamp_millis(),
                });
            }
        }

        Ok(positions)
    }
}

#[derive(Deserialize)]
struct BybitBaseResponse<T> {
    #[serde(rename = "retCode")]
    ret_code: i32,
    #[serde(rename = "retMsg")]
    ret_msg: String,
    result: T,
}

#[derive(Deserialize)]
struct BybitOrderResult {
    #[serde(rename = "orderId")]
    order_id: String,
    #[serde(rename = "orderLinkId")]
    order_link_id: String,
    symbol: String,
    #[serde(rename = "orderStatus")]
    order_status: String,
}

#[derive(Deserialize)]
struct BybitWalletBalanceResult {
    list: Vec<BybitWalletBalanceAccount>,
}

#[derive(Deserialize)]
struct BybitWalletBalanceAccount {
    #[serde(rename = "accountType")]
    _account_type: String,
    coin: Vec<BybitWalletBalanceCoin>,
}

#[derive(Deserialize)]
struct BybitWalletBalanceCoin {
    coin: String,
    #[serde(rename = "walletBalance")]
    wallet_balance: String,
}
