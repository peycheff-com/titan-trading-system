use std::collections::HashMap;
use std::sync::Arc;
use parking_lot::RwLock;
use crate::exchange::adapter::{ExchangeAdapter, OrderRequest, OrderResponse, ExchangeError};
use crate::model::Intent;
use tracing::{info, warn, error};

pub struct ExecutionRouter {
    adapters: RwLock<HashMap<String, Arc<dyn ExchangeAdapter + Send + Sync>>>,
}

impl ExecutionRouter {
    pub fn new() -> Self {
        Self {
            adapters: RwLock::new(HashMap::new()),
        }
    }

    pub fn register(&self, name: &str, adapter: Arc<dyn ExchangeAdapter + Send + Sync>) {
        let mut map = self.adapters.write();
        map.insert(name.to_lowercase(), adapter);
        info!("🔌 Registered Adapter: {}", name);
    }

    pub fn get_adapter(&self, name: &str) -> Option<Arc<dyn ExchangeAdapter + Send + Sync>> {
        let map = self.adapters.read();
        map.get(&name.to_lowercase()).cloned()
    }

    // Determine target exchanges based on intent
    // Returns a list of (ExchangeName, Adapter)
    pub fn resolve_routes(&self, intent: &Intent) -> Vec<(String, Arc<dyn ExchangeAdapter + Send + Sync>)> {
        let mut targets = Vec::new();
        let map = self.adapters.read();

        // 1. Explicit Routing (Future proofing: if intent has target_exchanges field)
        // For now, check source
        
        if let Some(source) = &intent.source {
            match source.as_str() {
                "scavenger" => {
                    // Scavenger trades on BOTH Bybit and MEXC (Bite strategy)
                    if let Some(a) = map.get("bybit") { targets.push(("bybit".to_string(), a.clone())); }
                    if let Some(a) = map.get("mexc") { targets.push(("mexc".to_string(), a.clone())); }
                },
                "hunter" | "sentinel" => {
                    // Standard strategy -> Binance
                    if let Some(a) = map.get("binance") { targets.push(("binance".to_string(), a.clone())); }
                },
                _ => {
                    // Unknown source -> Default to Binance
                     if let Some(a) = map.get("binance") { targets.push(("binance".to_string(), a.clone())); }
                }
            }
        } else {
            // Default -> Binance
            if let Some(a) = map.get("binance") { targets.push(("binance".to_string(), a.clone())); }
        }

        // If no targets found (e.g. bybit/mexc not registered), fall back or warn
        if targets.is_empty() {
             warn!("⚠️ No valid adapters found for routing intent {:?}", intent.source);
        }

        targets
    }

    pub async fn execute(&self, intent: &Intent, order_req: OrderRequest) -> Vec<(String, Result<OrderResponse, ExchangeError>)> {
        let routes = self.resolve_routes(intent);
        
        let mut results = Vec::new();
        let mut handles = Vec::new();

        for (name, adapter) in routes {
            let req = order_req.clone();
            let name_clone = name.clone();
            
            // Spawn parallel execution
            let handle = tokio::spawn(async move {
                info!("🚀 Routing to {}: {:?} {}", name_clone, req.side, req.symbol);
                let res = adapter.place_order(req).await;
                (name_clone, res)
            });
            handles.push(handle);
        }

        for handle in handles {
            match handle.await {
                Ok(res) => results.push(res),
                Err(e) => error!("❌ Join Error in Execution Router: {}", e),
            }
        }

        results
    }
}
