use crate::market_data::model::MarketDataEvent;
use async_trait::async_trait;
use thiserror::Error;
use tokio::sync::mpsc;

#[derive(Error, Debug)]
pub enum MarketDataError {
    #[error("Connection failed: {0}")]
    Connection(String),
    #[error("Subscription failed: {0}")]
    Subscription(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Stream closed")]
    StreamClosed,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum StreamType {
    PublicTrade,
    OrderBookL2,
    FundingRate,
    Liquidation,
}

#[derive(Debug, Clone)]
pub struct Subscription {
    pub symbol: String,
    pub stream_type: StreamType,
}

#[async_trait]
pub trait MarketDataConnector: Send + Sync {
    /// Initialize the connection
    async fn connect(&mut self) -> Result<(), MarketDataError>;

    /// Subscribe to a specific data stream
    async fn subscribe(&mut self, subscription: Subscription) -> Result<(), MarketDataError>;

    /// Get the event stream channel
    fn event_stream(&mut self) -> mpsc::Receiver<MarketDataEvent>;

    /// Check health of the connection
    async fn health_check(&self) -> bool;

    /// Get exchange name
    fn name(&self) -> &str;
}
