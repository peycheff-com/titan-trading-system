use crate::market_data::connector::{
    MarketDataConnector, MarketDataError, StreamType, Subscription,
};
use crate::market_data::mexc::message::{MexcDeal, MexcWsMessage};
use crate::market_data::model::MarketDataEvent;
use async_trait::async_trait;
use futures::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::HashSet;
use tokio::sync::mpsc;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{error, info, warn};
use url::Url;

const MEXC_WS_URL: &str = "wss://contract.mexc.com/edge";

pub struct MexcConnector {
    event_tx: mpsc::Sender<MarketDataEvent>,
    event_rx: Option<mpsc::Receiver<MarketDataEvent>>,
    write_tx: Option<mpsc::Sender<Message>>,
    subscriptions: HashSet<String>,
}

impl MexcConnector {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(1000);
        Self {
            event_tx: tx,
            event_rx: Some(rx),
            write_tx: None,
            subscriptions: HashSet::new(),
        }
    }
}

impl Default for MexcConnector {
    fn default() -> Self {
        Self::new()
    }
}

impl MexcConnector {
    async fn handle_msg(
        text: &str,
        tx: &mpsc::Sender<MarketDataEvent>,
    ) -> Result<(), MarketDataError> {
        let msg: MexcWsMessage =
            serde_json::from_str(text).map_err(|e| MarketDataError::Parse(e.to_string()))?;

        // Handle Ping/Pong if implicit?
        // MEXC usually requires {"method":"ping"} sent by us, responses might be specific.

        if let Some(channel) = &msg.channel {
            if channel.starts_with("push.deal") {
                if let Some(data) = &msg.data {
                    if let Some(deals) = data.as_array() {
                        // Direct array format: {"data": [...], ...}
                        for deal_val in deals {
                            let deal: MexcDeal = serde_json::from_value(deal_val.clone())
                                .map_err(|e| MarketDataError::Parse(e.to_string()))?;

                            let symbol = msg.symbol.clone().unwrap_or("UNKNOWN".to_string());
                            let _ = tx
                                .send(MarketDataEvent::Trade(deal.to_model(&symbol)))
                                .await;
                        }
                    } else if let Some(deal_json) = data.as_object() {
                        // Try single check or "data" field inside data
                        if let Some(inner_data) = deal_json.get("data").and_then(|d| d.as_array()) {
                            for deal_val in inner_data {
                                let deal: MexcDeal = serde_json::from_value(deal_val.clone())
                                    .map_err(|e| MarketDataError::Parse(e.to_string()))?;
                                let symbol = msg.symbol.clone().unwrap_or("UNKNOWN".to_string());
                                let _ = tx
                                    .send(MarketDataEvent::Trade(deal.to_model(&symbol)))
                                    .await;
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

#[async_trait]
impl MarketDataConnector for MexcConnector {
    async fn connect(&mut self) -> Result<(), MarketDataError> {
        let url =
            Url::parse(MEXC_WS_URL).map_err(|e| MarketDataError::Connection(e.to_string()))?;
        let (ws_stream, _) = connect_async(url)
            .await
            .map_err(|e| MarketDataError::Connection(e.to_string()))?;
        info!("Connected to MEXC WebSocket");

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

        // Spawn heartbeat loop (MEXC requires ping every 30s)
        let ping_tx = write_tx.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                let ping = json!({"method": "ping"});
                if (ping_tx.send(Message::Text(ping.to_string())).await).is_err() {
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
                        // info!("MEXC Msg: {}", text); // Debug
                        if let Err(e) = Self::handle_msg(&text, &event_tx).await {
                            warn!("Error handling message: {}", e);
                        }
                    }
                    Ok(Message::Close(_)) => {
                        error!("MEXC stream closed");
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
        // MEXC format: method: "sub.deal", param: {"symbol": "BTC_USDT"}
        // Note: MEXC symbols usually have underscore for futures? e.g. BTC_USDT.
        // Our input subscription.symbol is "BTCUSDT". We might need to insert underscore.
        // But for simplicity, let's assume input needs to be adapted or is "BTC_USDT".
        // Let's adapt it locally: BTCUSDT -> BTC_USDT

        let raw_symbol = subscription.symbol.clone();
        let formatted_symbol = if !raw_symbol.contains('_') && raw_symbol.ends_with("USDT") {
            let (base, _) = raw_symbol.split_at(raw_symbol.len() - 4);
            format!("{}_USDT", base)
        } else {
            raw_symbol
        };

        let method = match subscription.stream_type {
            StreamType::PublicTrade => "sub.deal",
            _ => {
                return Err(MarketDataError::Subscription(
                    "Unsupported stream type".to_string(),
                ))
            }
        };

        let payload = json!({
            "method": method,
            "param": {
                "symbol": formatted_symbol
            }
        });

        if let Some(tx) = &self.write_tx {
            tx.send(Message::Text(payload.to_string()))
                .await
                .map_err(|e| MarketDataError::Subscription(e.to_string()))?;
            self.subscriptions.insert(formatted_symbol);
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
        "MEXC Futures"
    }
}
