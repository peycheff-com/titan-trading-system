use crate::market_data::bybit::message::{BybitOrderBook, BybitTrade, BybitWsMessage};
use crate::market_data::connector::{
    MarketDataConnector, MarketDataError, StreamType, Subscription,
};
use crate::market_data::model::MarketDataEvent;
use async_trait::async_trait;
use chrono::Utc;
use futures::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::HashSet;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{error, info, warn};
use url::Url;

const BYBIT_WS_URL: &str = "wss://stream.bybit.com/v5/public/linear";

pub struct BybitConnector {
    event_tx: mpsc::Sender<MarketDataEvent>,
    event_rx: Option<mpsc::Receiver<MarketDataEvent>>, // Taken on start
    write_tx: Option<mpsc::Sender<Message>>,           // For sending commands
    subscriptions: HashSet<String>,
}

impl BybitConnector {
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
        let msg: BybitWsMessage =
            serde_json::from_str(text).map_err(|e| MarketDataError::Parse(e.to_string()))?;

        if let Some(op) = msg.op {
            if op == "pong" {
                // debug!("Received pong");
                return Ok(());
            }
        }

        if let Some(topic) = msg.topic {
            // info!("Bybit Topic: {}", topic);
            if topic.starts_with("publicTrade.") {
                // "publicTrade.BTCUSDT"
                if let Some(data) = msg.data {
                    let trades: Vec<BybitTrade> = serde_json::from_value(data)
                        .map_err(|e| MarketDataError::Parse(e.to_string()))?;

                    for trade in trades {
                        let model = trade.to_model();
                        let _ = tx.send(MarketDataEvent::Trade(model)).await;
                    }
                }
            } else if topic.starts_with("orderbook.") {
                info!("Processing Orderbook: {}", topic);
                if let Some(data) = msg.data {
                    // info!("OB Data: {:?}", data);
                    match serde_json::from_value::<BybitOrderBook>(data) {
                        Ok(ob) => {
                            let ts = msg.ts.unwrap_or(Utc::now().timestamp_millis());
                            let is_snapshot = msg.msg_type.as_deref() == Some("snapshot");
                            if let Some(model) = ob.to_model(ts, is_snapshot) {
                                let _ = tx.send(MarketDataEvent::OrderBook(model)).await;
                            } else {
                                warn!("Failed to convert OB to model");
                            }
                        }
                        Err(e) => warn!("Failed to parse BybitOrderBook: {}", e),
                    }
                }
            }
        }

        Ok(())
    }
}

#[async_trait]
impl MarketDataConnector for BybitConnector {
    async fn connect(&mut self) -> Result<(), MarketDataError> {
        let url =
            Url::parse(BYBIT_WS_URL).map_err(|e| MarketDataError::Connection(e.to_string()))?;
        let (ws_stream, _) = connect_async(url)
            .await
            .map_err(|e| MarketDataError::Connection(e.to_string()))?;
        info!("Connected to Bybit WebSocket");

        let (mut write, mut read) = ws_stream.split();
        let (write_tx, mut write_rx) = mpsc::channel::<Message>(32);
        self.write_tx = Some(write_tx.clone());

        // Spawn writer loop
        tokio::spawn(async move {
            while let Some(msg) = write_rx.recv().await {
                if let Err(e) = write.send(msg).await {
                    error!("Failed to send WS message: {}", e);
                    break;
                }
            }
        });

        // Spawn heartbeat loop
        let ping_tx = write_tx.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(20)).await;
                let ping = json!({"op": "ping"});
                if let Err(_) = ping_tx.send(Message::Text(ping.to_string())).await {
                    break;
                }
            }
        });

        // Spawn reader loop
        let event_tx = self.event_tx.clone();
        tokio::spawn(async move {
            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Err(e) = Self::handle_msg(&text, &event_tx).await {
                            warn!("Error handling message: {}", e);
                        }
                    }
                    Ok(Message::Ping(_)) => {}
                    Ok(Message::Pong(_)) => {}
                    Ok(Message::Close(_)) => {
                        error!("Bybit stream closed");
                        break;
                    }
                    Err(e) => {
                        error!("WS Error: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    async fn subscribe(&mut self, subscription: Subscription) -> Result<(), MarketDataError> {
        let topic = match subscription.stream_type {
            StreamType::PublicTrade => format!("publicTrade.{}", subscription.symbol),
            StreamType::OrderBookL2 => format!("orderbook.50.{}", subscription.symbol),
            _ => {
                return Err(MarketDataError::Subscription(
                    "Unsupported stream type".to_string(),
                ))
            }
        };

        if self.subscriptions.contains(&topic) {
            return Ok(());
        }

        let payload = json!({
            "op": "subscribe",
            "args": [topic]
        });

        if let Some(tx) = &self.write_tx {
            tx.send(Message::Text(payload.to_string()))
                .await
                .map_err(|e| MarketDataError::Subscription(e.to_string()))?;
            self.subscriptions.insert(topic);
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
        "Bybit V5"
    }
}
