use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tokio::task::JoinHandle;
use tracing::{info, error, warn};
use rust_decimal::Decimal;
use crate::market_data::connector::{MarketDataConnector, Subscription, StreamType};
use crate::market_data::model::MarketDataEvent;
use crate::market_data::types::BookTicker;
use chrono::Utc;

#[derive(Clone)]
pub struct MarketDataEngine {
    prices: Arc<RwLock<HashMap<String, Decimal>>>,
    pub tickers: Arc<RwLock<HashMap<String, crate::market_data::types::BookTicker>>>,
    connectors: Arc<RwLock<Vec<Box<dyn MarketDataConnector + Send + Sync>>>>,
    nats_client: Option<async_nats::Client>,
}

impl MarketDataEngine {
    pub fn new(nats_client: Option<async_nats::Client>) -> Self {
        Self {
            prices: Arc::new(RwLock::new(HashMap::new())),
            tickers: Arc::new(RwLock::new(HashMap::new())),
            connectors: Arc::new(RwLock::new(Vec::new())),
            nats_client,
        }
    }

    pub fn get_ticker(&self, symbol: &str) -> Option<BookTicker> {
        let clean = symbol.replace("/", "").replace("_", "");
        if let Ok(map) = self.tickers.read() {
            map.get(&clean).cloned()
        } else {
            None
        }
    }

    pub fn add_connector(&self, connector: Box<dyn MarketDataConnector + Send + Sync>) {
        if let Ok(mut connectors) = self.connectors.write() {
            connectors.push(connector);
        }
    }

    pub async fn start(&self) -> Vec<JoinHandle<()>> {
        let mut handles = Vec::new();
        
        // We need to take ownership of connectors to run them, or lock and iterate?
        // Connectors likely need to be mutable to call connect/subscribe.
        // But we stored them in Arc<RwLock>. 
        // Strategy: We can't easily move them out if we want to keep them in the list.
        // Actually, once started, the engine might not need to hold them IF the connector runs its own loop.
        // But `event_stream()` consumes the Rx.
        
        // Better: `add_connector` consumes and immediately spawns? 
        // Or `start` consumes the connectors.
        
        // Let's change `add_connector` to just take it.
        // Actually, for simplicity in this phase:
        // `start` will pop all connectors and run them.
        
        let mut connectors_to_run = Vec::new();
        if let Ok(mut guard) = self.connectors.write() {
            while let Some(c) = guard.pop() {
                connectors_to_run.push(c);
            }
        }

        let prices = self.prices.clone();
        let tickers = self.tickers.clone();
        let nats = self.nats_client.clone();

        for mut connector in connectors_to_run {
            let prices_clone = prices.clone();
            let tickers_clone = tickers.clone();
            let nats_clone = nats.clone();
            
            let handle = tokio::spawn(async move {
                info!("Starting connector: {}", connector.name());
                
                if let Err(e) = connector.connect().await {
                   error!("Failed to connect {}: {}", connector.name(), e);
                   return;
                }

                // TODO: Subscriptions should be dynamic. For now, hardcode generic sub or allow config.
                // We will rely on `main.rs` to configure subscriptions via `subscribe()` method on engine?
                // But we just popped the connector. 
                
                // REVISION: Engine should probably Manage the connectors.
                // But `MarketDataConnector` trait `event_stream()` takes `&mut self`.
                
                // Let's just subscribe to BTC/USDT for proof of life in this Phase.
                // OR: We define that `start` is called AFTER setup.
                // But we still need to subscribe.
                
                let sub = Subscription {
                    symbol: "BTCUSDT".to_string(),
                    stream_type: StreamType::PublicTrade,
                };
                if let Err(e) = connector.subscribe(sub).await {
                     warn!("Failed to auto-subscribe {} to BTCUSDT: {}", connector.name(), e);
                }

                let mut stream = connector.event_stream();
                info!("Connector {} running event loop", connector.name());

                while let Some(event) = stream.recv().await {
                    match event {
                         MarketDataEvent::Trade(trade) => {
                             // Update Price Cache
                             let key = trade.symbol.replace("_", "").replace("/", "");
                             if let Ok(mut map) = prices_clone.write() {
                                 map.insert(key.clone(), trade.price);
                             }

                             // Construct Fake Ticker
                             let ticker = crate::market_data::types::BookTicker {
                                 symbol: key.clone(),
                                 best_bid: trade.price,
                                 best_bid_qty: trade.quantity,
                                 best_ask: trade.price,
                                 best_ask_qty: trade.quantity,
                                 transaction_time: Utc::now().timestamp_millis(),
                                 event_time: Utc::now().timestamp_millis(),
                             };

                             if let Ok(mut map) = tickers_clone.write() {
                                 map.insert(key.clone(), ticker.clone());
                             }

                             // NATS Publish
                             if let Some(nc) = &nats_clone {
                                 // Publish Trade
                                 let subject_trade = format!("market.trade.{}", key);
                                 if let Ok(payload) = serde_json::to_vec(&trade) {
                                     let _ = nc.publish(subject_trade, payload.into()).await;
                                 }

                                 // Publish Ticker (Price)
                                 let subject_price = format!("market.price.{}", key);
                                 if let Ok(payload) = serde_json::to_vec(&ticker) {
                                     let _ = nc.publish(subject_price, payload.into()).await;
                                 }
                             }
                        }
                        _ => {}
                    }
                }
                warn!("Connector {} stream ended", connector.name());
            });
            handles.push(handle);
        }
        
        handles
    }

    pub fn get_price(&self, symbol: &str) -> Option<Decimal> {
        let clean = symbol.replace("/", "").replace("_", "");
        if let Ok(map) = self.prices.read() {
            map.get(&clean).cloned()
        } else {
            None
        }
    }
}
