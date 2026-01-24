use parking_lot::RwLock;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct StalenessMonitor {
    // Map (Exchange, Symbol) -> Last Update Timestamp (ms)
    last_updates: Arc<RwLock<HashMap<(String, String), i64>>>,
}

impl Default for StalenessMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl StalenessMonitor {
    pub fn new() -> Self {
        Self {
            last_updates: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn update(&self, exchange: &str, symbol: &str) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let key = (exchange.to_string(), symbol.to_string());
        self.last_updates.write().insert(key, now);
    }

    pub fn is_stale(&self, exchange: &str, symbol: &str, threshold_ms: i64) -> bool {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let key = (exchange.to_string(), symbol.to_string());

        if let Some(last_ts) = self.last_updates.read().get(&key) {
            (now - last_ts) > threshold_ms
        } else {
            // No data yet = Stale (fail safe)
            true
        }
    }

    pub fn get_age(&self, exchange: &str, symbol: &str) -> Option<i64> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let key = (exchange.to_string(), symbol.to_string());

        self.last_updates.read().get(&key).map(|ts| now - ts)
    }
}
