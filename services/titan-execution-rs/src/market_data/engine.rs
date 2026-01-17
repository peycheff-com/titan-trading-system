use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tokio::task::JoinHandle;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use url::Url;
use futures::StreamExt;
use tracing::{info, error, warn};
use serde::Deserialize;
use crate::market_data::types::BookTicker;

#[derive(Debug, Deserialize)]
struct StreamMessage {
    stream: String,
    data: BookTicker,
}

#[derive(Clone)]
pub struct MarketDataEngine {
    tickers: Arc<RwLock<HashMap<String, BookTicker>>>,
    wss_url: String,
}

impl MarketDataEngine {
    pub fn new() -> Self {
        // Use stream endpoint for multi-stream (or just !bookTicker for all)
        // !bookTicker gives all symbols.
        let wss_url = "wss://fstream.binance.com/stream?streams=!bookTicker".to_string();
        
        Self {
            tickers: Arc::new(RwLock::new(HashMap::new())),
            wss_url,
        }
    }

    pub async fn start(&self) -> JoinHandle<()> {
        let tickers = self.tickers.clone();
        let url_str = self.wss_url.clone();

        tokio::spawn(async move {
            loop {
                info!("Connecting to Market Data Stream: {}", url_str);
                let url = Url::parse(&url_str).expect("Invalid WebSocket URL");

                match connect_async(url).await {
                    Ok((ws_stream, _)) => {
                        info!("✅ Connected to Market Data Stream");
                        let (_, mut read) = ws_stream.split();

                        while let Some(msg) = read.next().await {
                            match msg {
                                Ok(Message::Text(text)) => {
                                    // Parse: {"stream":"...","data":{...}}
                                    match serde_json::from_str::<StreamMessage>(&text) {
                                        Ok(stream_msg) => {
                                            let ticker = stream_msg.data;
                                            // Update cache
                                            if let Ok(mut map) = tickers.write() {
                                                map.insert(ticker.symbol.clone(), ticker);
                                            }
                                        },
                                        Err(e) => {
                                            // Don't log every ping/pong or error to avoid spam, but warn on parse fail if it looks like data
                                            if text.contains("bookTicker") {
                                                 warn!("Failed to parse ticker: {}", e);
                                            }
                                        }
                                    }
                                },
                                Ok(Message::Ping(_)) => {
                                    // Auto-handled by tungstenite usually, but good to know
                                },
                                Ok(Message::Close(_)) => {
                                    warn!("Market Data Stream closed");
                                    break;
                                },
                                Err(e) => {
                                    error!("WebSocket error: {}", e);
                                    break;
                                },
                                _ => {}
                            }
                        }
                    },
                    Err(e) => {
                        error!("Failed to connect to Market Data Stream: {}", e);
                    }
                }

                warn!("Market Data Stream disconnected. Reconnecting in 5s...");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        })
    }

    pub fn get_ticker(&self, symbol: &str) -> Option<BookTicker> {
        // Normalize symbol: remove '/' common in Titan format vs Binance 'BTCUSDT'
        let clean_symbol = symbol.replace("/", "");
        
        let map = self.tickers.read().ok()?;
        map.get(&clean_symbol).cloned()
    }

    pub fn get_price(&self, symbol: &str) -> Option<rust_decimal::Decimal> {
        self.get_ticker(symbol).map(|t| (t.best_bid + t.best_ask) / rust_decimal::Decimal::from(2))
    }
}
