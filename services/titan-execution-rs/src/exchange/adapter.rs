use async_trait::async_trait;
use rust_decimal::Decimal;
use thiserror::Error;
use crate::model::{Side, OrderType};

#[derive(Error, Debug)]
pub enum ExchangeError {
    #[error("Network error: {0}")]
    Network(String),
    #[error("API error: {0}")]
    Api(String),
    #[error("Signing error: {0}")]
    Signing(String),
    #[error("Configuration error: {0}")]
    Config(String),
}

#[derive(Debug, Clone)]
pub struct OrderRequest {
    pub symbol: String,
    pub side: Side,
    pub order_type: OrderType,
    pub quantity: Decimal,
    pub price: Option<Decimal>,
    pub stop_price: Option<Decimal>,
    pub client_order_id: String,
    pub reduce_only: bool,
}

#[derive(Debug, Clone)]
pub struct OrderResponse {
    pub order_id: String,
    pub client_order_id: String,
    pub symbol: String,
    pub status: String,
    pub avg_price: Option<Decimal>,
    pub executed_qty: Decimal,
    pub t_exchange: Option<i64>,
    pub t_ack: i64,
}

#[async_trait]
pub trait ExchangeAdapter: Send + Sync {
    /// Initialize the connection (e.g., perform handshake or get listen key)
    async fn init(&self) -> Result<(), ExchangeError>;

    /// Place a new order
    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError>;

    /// Cancel a specific order
    async fn cancel_order(&self, symbol: &str, order_id: &str) -> Result<OrderResponse, ExchangeError>;

    /// Get current wallet balance for a specific asset
    async fn get_balance(&self, asset: &str) -> Result<Decimal, ExchangeError>;

    /// Get exchange name (e.g., "Binance Futures")
    fn name(&self) -> &str;
}
