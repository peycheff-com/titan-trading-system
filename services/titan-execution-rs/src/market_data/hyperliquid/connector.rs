use async_trait::async_trait;
use crate::market_data::connector::{MarketDataConnector, MarketDataError, Subscription, StreamType};
use crate::market_data::model::MarketDataEvent;
use crate::market_data::hyperliquid::message::HyperliquidMessage;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use futures::{StreamExt, SinkExt};
use url::Url;
use tracing::{info, warn, error};
use std::collections::HashSet;
use serde_json::json;

const HL_WS_URL: &str = "wss://api.hyperliquid.xyz/ws";

pub struct HyperliquidConnector {
    event_tx: mpsc::Sender<MarketDataEvent>,
    event_rx: Option<mpsc::Receiver<MarketDataEvent>>,
    write_tx: Option<mpsc::Sender<Message>>,
    subscriptions: HashSet<String>,
}

impl HyperliquidConnector {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(1000);
        Self {
            event_tx: tx,
            event_rx: Some(rx),
            write_tx: None,
            subscriptions: HashSet::new(),
        }
    }

    async fn handle_msg(text: &str, tx: &mpsc::Sender<MarketDataEvent>) -> Result<(), MarketDataError> {
        // Hyperliquid sends {"channel": "trades", "data": ...}
        match serde_json::from_str::<HyperliquidMessage>(text) {
            Ok(HyperliquidMessage::Trades { data }) => {
                for hl_trade in data {
                    if let Some(trade) = hl_trade.to_model() {
                        let _ = tx.send(MarketDataEvent::Trade(trade)).await;
                    }
                }
            }
            Ok(HyperliquidMessage::L2Book { .. }) => {
                // TODO: Implement L2 Book normalization
            }
            Ok(HyperliquidMessage::SubscriptionResponse { .. }) => {
                // info!("HL Sub Response: {:?}", data);
            }
            Ok(HyperliquidMessage::Unknown) => {
                // Ignore unknown channels
            }
            Err(e) => {
                if !text.contains("pong") {
                     warn!("Failed to parse HL msg: {}", e);
                }
            }
        }
        Ok(())
    }
}

#[async_trait]
impl MarketDataConnector for HyperliquidConnector {
    async fn connect(&mut self) -> Result<(), MarketDataError> {
        let url = Url::parse(HL_WS_URL).map_err(|e| MarketDataError::Connection(e.to_string()))?;
        let (ws_stream, _) = connect_async(url).await.map_err(|e| MarketDataError::Connection(e.to_string()))?;
        info!("Connected to Hyperliquid WebSocket");

        let (mut write, mut read) = ws_stream.split();
        let (write_tx, mut write_rx) = mpsc::channel::<Message>(32);
        self.write_tx = Some(write_tx.clone());

        // Spawn writer
        tokio::spawn(async move {
            while let Some(msg) = write_rx.recv().await {
                 if let Err(e) = write.send(msg).await {
                     error!("Failed to send HL message: {}", e);
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
                        // info!("HL Raw: {}", text);
                        if let Err(e) = Self::handle_msg(&text, &event_tx).await {
                             warn!("Error handling HL message: {}", e);
                        }
                    }
                    Ok(Message::Ping(_)) => {
                        // Tungstenite handles pong? Hyperliquid might need app-level ping?
                        // Docs say: "The server will send pings... client must respond with pong" (usually standard)
                        // Or client sends ping? 
                        // Usually standard WS Heartbeat.
                    }
                    Ok(Message::Close(_)) => {
                         error!("HL stream closed");
                         break;
                    }
                    Err(e) => {
                        error!("HL WS Error: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    async fn subscribe(&mut self, subscription: Subscription) -> Result<(), MarketDataError> {
        // Hyperliquid Sub Format:
        // { "method": "subscribe", "subscription": { "type": "trades", "coin": "BTC" } }
        
        // Symbol should be just "BTC" or "ETH" (no USDT suffix usually for HL, or maybe "kBONK")
        // We'll trust the input symbol is correct for now (e.g. "BTC")
        
        let coin = subscription.symbol.replace("USDT", "").replace("/", ""); // Simple heuristic for now
        
        let sub_type = match subscription.stream_type {
            StreamType::PublicTrade => "trades",
            StreamType::OrderBookL2 => "l2Book",
            _ => return Err(MarketDataError::Subscription("Unsupported stream type".to_string())),
        };

        let payload = json!({
            "method": "subscribe",
            "subscription": {
                "type": sub_type,
                "coin": coin
            }
        });

        if let Some(tx) = &self.write_tx {
            tx.send(Message::Text(payload.to_string())).await
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
        "Hyperliquid DEX"
    }
}
