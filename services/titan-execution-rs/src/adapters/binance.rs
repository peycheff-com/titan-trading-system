use async_trait::async_trait;
use crate::adapter::ExchangeAdapter;
use crate::model::{Order, OrderId, Position, Side, Symbol};
use rust_decimal::Decimal;
use std::time::{SystemTime, UNIX_EPOCH};
use reqwest::{Client, Method};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use hex;
use serde_json::Value;

pub struct BinanceAdapter {
    api_key: String,
    secret_key: String,
    client: Client,
    base_url: String,
}

impl BinanceAdapter {
    pub fn new(api_key: String, secret_key: String, base_url: Option<String>) -> Self {
        Self {
            api_key,
            secret_key,
            client: Client::new(),
            base_url: base_url.unwrap_or_else(|| "https://fapi.binance.com".to_string()),
        }
    }

    fn sign(&self, params: &str) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(self.secret_key.as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(params.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    async fn request(&self, method: Method, endpoint: &str, params: Vec<(&str, String)>) -> Result<Value, String> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis()
            .to_string();

        let mut query_params = params.clone();
        query_params.push(("timestamp", timestamp));
        query_params.push(("recvWindow", "5000".to_string()));

        let query_str = query_params
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<String>>()
            .join("&");

        let signature = self.sign(&query_str);
        let full_query = format!("{}&signature={}", query_str, signature);
        let url = format!("{}{}", self.base_url, endpoint);

        let req = match method {
            Method::GET => self.client.get(&url).query(&serde_urlencoded::from_str::<Vec<(String, String)>>(&full_query).unwrap()),
            Method::POST => self.client.post(&url).query(&serde_urlencoded::from_str::<Vec<(String, String)>>(&full_query).unwrap()),
            Method::DELETE => self.client.delete(&url).query(&serde_urlencoded::from_str::<Vec<(String, String)>>(&full_query).unwrap()),
            _ => return Err("Unsupported method".to_string()),
        };

        let resp = req
            .header("X-MBX-APIKEY", &self.api_key)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;

        if !status.is_success() {
            return Err(format!("Binance Error {}: {}", status, text));
        }

        serde_json::from_str(&text).map_err(|e| e.to_string())
    }

    // Extracted pure function for testing
    fn parse_positions(res: &Value) -> Result<Vec<Position>, String> {
        let mut positions = Vec::new();
        if let Some(arr) = res.as_array() {
            for item in arr {
                let amt_str = item["positionAmt"].as_str().ok_or("Missing positionAmt")?;
                let amt = amt_str.parse::<Decimal>().map_err(|e| e.to_string())?;
                
                if !amt.is_zero() {
                     positions.push(Position {
                        symbol: item["symbol"].as_str().unwrap_or("").to_string(),
                        side: if amt.is_sign_positive() { Side::Long } else { Side::Short },
                        size: amt.abs(),
                        entry_price: item["entryPrice"].as_str().unwrap_or("0").parse().unwrap_or_default(),
                        stop_loss: Decimal::ZERO,
                        take_profits: vec![],
                        signal_id: "MANUAL".to_string(),
                        opened_at: chrono::Utc::now(),
                        regime_state: None,
                        phase: None,
                        metadata: Some(item.clone()),
                     });
                }
            }
        }
        Ok(positions)
    }
}

#[async_trait]
impl ExchangeAdapter for BinanceAdapter {
    async fn get_positions(&self) -> Result<Vec<Position>, String> {
        // GET /fapi/v2/positionRisk
        let res = self.request(Method::GET, "/fapi/v2/positionRisk", vec![]).await?;
        Self::parse_positions(&res)
    }

    async fn place_order(&self, order: Order) -> Result<OrderId, String> {
        // POST /fapi/v1/order
        let side_str = match order.side {
            Side::Buy | Side::Long => "BUY",
            Side::Sell | Side::Short => "SELL",
        };
        
        // Ensure quantity is positive
        let qty = order.quantity.abs().to_string();

        let mut params = vec![
            ("symbol", order.symbol),
            ("side", side_str.to_string()),
            ("type", order.order_type),
            ("quantity", qty),
        ];

        
        if let Some(price) = order.price {
            params.push(("price", price.to_string()));
            params.push(("timeInForce", "GTC".to_string()));
        }

        if order.reduce_only {
            params.push(("reduceOnly", "true".to_string()));
        }

        if let Some(cid) = order.client_order_id {
            params.push(("newClientOrderId", cid));
        }

        let res = self.request(Method::POST, "/fapi/v1/order", params).await?;
        
        Ok(res["orderId"].as_u64().unwrap().to_string())
    }

    async fn cancel_order(&self, order_id: OrderId, symbol: Symbol) -> Result<(), String> {
        let params = vec![
            ("symbol", symbol),
            ("orderId", order_id),
        ];
        self.request(Method::DELETE, "/fapi/v1/order", params).await?;
        Ok(())
    }

    async fn get_balance(&self) -> Result<Decimal, String> {
        // GET /fapi/v2/balance
        let res = self.request(Method::GET, "/fapi/v2/balance", vec![]).await?;
        // Find USDT
        if let Some(arr) = res.as_array() {
             for item in arr {
                 if item["asset"].as_str() == Some("USDT") {
                     return Ok(item["balance"].as_str().unwrap().parse().unwrap());
                 }
             }
        }
        Ok(Decimal::ZERO)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_positions() {
        let data = json!([
            {
                "symbol": "BTCUSDT",
                "positionAmt": "0.5",
                "entryPrice": "50000",
                "markPrice": "51000",
                "unRealizedProfit": "500",
                "liquidationPrice": "0",
                "leverage": "10",
                "maxNotionalValue": "1000000",
                "marginType": "cross",
                "isolatedMargin": "0.00000000",
                "isAutoAddMargin": "false",
                "positionSide": "BOTH"
            },
            {
                "symbol": "ETHUSDT",
                "positionAmt": "0.0",
                "entryPrice": "0",
                "markPrice": "3000", 
                 // ...
            }
        ]);

        let positions = BinanceAdapter::parse_positions(&data).expect("Failed to parse");
        assert_eq!(positions.len(), 1);
        assert_eq!(positions[0].symbol, "BTCUSDT");
        assert_eq!(positions[0].size.to_string(), "0.5");
        assert_eq!(positions[0].side, Side::Long);
    }
}
