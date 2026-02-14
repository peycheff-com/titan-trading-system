use crate::market_data::binance::message::{BinanceStreamWrapper, BinanceWsMessage};
use crate::market_data::connector::{
    MarketDataConnector, MarketDataError, StreamType, Subscription,
};
use crate::market_data::model::MarketDataEvent;
use async_trait::async_trait;
use futures::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::HashSet;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{error, info};
use url::Url;

const BINANCE_WS_URL: &str = "wss://fstream.binance.com/stream";

pub struct BinanceConnector {
    event_tx: mpsc::Sender<MarketDataEvent>,
    event_rx: Option<mpsc::Receiver<MarketDataEvent>>,
    write_tx: Option<mpsc::Sender<Message>>,
    subscriptions: HashSet<String>,
}

impl Default for BinanceConnector {
    fn default() -> Self {
        Self::new()
    }
}

impl BinanceConnector {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(1000);
        Self {
            event_tx: tx,
            event_rx: Some(rx),
            write_tx: None,
            subscriptions: HashSet::new(),
        }
    }

    async fn handle_msg(
        text: &str,
        tx: &mpsc::Sender<MarketDataEvent>,
    ) -> Result<(), MarketDataError> {
        // Binance usually sends {"stream":"...", "data":{...}}
        if let Ok(wrapper) = serde_json::from_str::<BinanceStreamWrapper>(text) {
            if let Some(trade) = wrapper.data.to_model() {
                let _ = tx.send(MarketDataEvent::Trade(trade)).await;
            }
        } else {
            // Check if direct message (unlikely for /stream endpoint but possible)
            if let Ok(msg) = serde_json::from_str::<BinanceWsMessage>(text) {
                if let Some(trade) = msg.to_model() {
                    let _ = tx.send(MarketDataEvent::Trade(trade)).await;
                }
            }
        }
        Ok(())
    }
}

#[async_trait]
impl MarketDataConnector for BinanceConnector {
    async fn connect(&mut self) -> Result<(), MarketDataError> {
        // For initial connection, we don't need streams params if we subscribe later.
        // But /stream requires at least one stream usually?
        // Actually /stream?streams=... is for connect-time.
        // We can connect to basic /ws (Raw) or /stream (Combined).
        // Combined is better for multiple symbols.
        // Let's us /stream with no params initially? Or just /stream.

        // Binance docs say: wss://fstream.binance.com/stream?streams=<streamName1>/<streamName2>
        // But we want dynamic subscription.
        // So we can connect to `wss://fstream.binance.com/ws` (Raw stream mode? No, that's usually single stream).
        // Or `wss://fstream.binance.com/stream` and then send SUBSCRIBE command.

        let url =
            Url::parse(BINANCE_WS_URL).map_err(|e| MarketDataError::Connection(e.to_string()))?;
        let (ws_stream, _) = connect_async(url)
            .await
            .map_err(|e| MarketDataError::Connection(e.to_string()))?;
        info!("Connected to Binance WebSocket");

        let (mut write, mut read) = ws_stream.split();
        let (write_tx, mut write_rx) = mpsc::channel::<Message>(32);
        self.write_tx = Some(write_tx.clone());

        // Spawn writer
        tokio::spawn(async move {
            while let Some(msg) = write_rx.recv().await {
                if let Err(e) = write.send(msg).await {
                    error!("Failed to send WS message: {}", e);
                    break;
                }
            }
        });

        // Spawn reader
        let event_tx = self.event_tx.clone();
        tokio::spawn(async move {
            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        // info!("Binance Raw: {}", text);
                        if let Err(e) = Self::handle_msg(&text, &event_tx).await {
                            // Log debug to avoid spam but acknowledge error
                            tracing::debug!("Error handling Msg: {:?}", e);
                        }
                    }
                    Ok(Message::Ping(_)) => {
                        // Tungstenite handles pong?
                    }
                    Ok(Message::Close(_)) => {
                        error!("Binance stream closed");
                        break;
                    }
                    Err(e) => {
                        error!("Binance WS Error: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    async fn subscribe(&mut self, subscription: Subscription) -> Result<(), MarketDataError> {
        // Stream name format: <symbol>@aggTrade
        // Symbol must be lowercase for streams
        let symbol_lower = subscription.symbol.to_lowercase().replace("/", "");
        let stream_name = match subscription.stream_type {
            StreamType::PublicTrade => format!("{}@aggTrade", symbol_lower),
            _ => {
                return Err(MarketDataError::Subscription(
                    "Unsupported stream type".to_string(),
                ));
            }
        };

        // Binance Subscribe ID
        let id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_micros() as u64;

        let payload = json!({
            "method": "SUBSCRIBE",
            "params": [
                stream_name
            ],
            "id": id
        });

        if let Some(tx) = &self.write_tx {
            tx.send(Message::Text(payload.to_string()))
                .await
                .map_err(|e| MarketDataError::Subscription(e.to_string()))?;
            self.subscriptions.insert(subscription.symbol);
            Ok(())
        } else {
            Err(MarketDataError::Connection("Not connected".to_string()))
        }
    }

    fn event_stream(&mut self) -> mpsc::Receiver<MarketDataEvent> {
        self.event_rx.take().expect("Event stream already consumed")
    }

    async fn health_check(&self) -> bool {
        self.write_tx.is_some()
    }

    fn name(&self) -> &str {
        "Binance Futures"
    }
}
