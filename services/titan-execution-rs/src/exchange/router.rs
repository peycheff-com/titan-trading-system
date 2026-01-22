use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::RwLock;
use rust_decimal::Decimal;
use tracing::{error, info, warn};

use crate::config::{RoutingConfig, RoutingRule};
use crate::exchange::adapter::{ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse};
use crate::metrics;
use crate::model::{Intent, Position};

#[derive(Clone)]
struct RouteTarget {
    name: String,
    adapter: Arc<dyn ExchangeAdapter + Send + Sync>,
    weight: f64,
}

pub struct ExecutionRouter {
    adapters: RwLock<HashMap<String, Arc<dyn ExchangeAdapter + Send + Sync>>>,
    routing: RoutingConfig,
}

impl ExecutionRouter {
    pub fn new() -> Self {
        Self::with_routing(RoutingConfig::default())
    }

    pub fn with_routing(routing: RoutingConfig) -> Self {
        Self {
            adapters: RwLock::new(HashMap::new()),
            routing,
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

    fn resolve_rule(&self, source: Option<&String>) -> RoutingRule {
        let mut rule = RoutingRule {
            fanout: self.routing.fanout,
            weights: self.routing.weights.clone(),
        };

        if let Some(source) = source {
            if let Some(source_rule) = self.routing.per_source.get(source) {
                rule.fanout = source_rule.fanout.or(rule.fanout);
                if source_rule.weights.is_some() {
                    rule.weights = source_rule.weights.clone();
                }
            }
        }

        if rule.weights.is_some() {
            rule.fanout = Some(true);
        }

        rule
    }

    // Determine target exchanges based on intent
    fn resolve_routes(&self, intent: &Intent) -> Vec<RouteTarget> {
        let mut targets: Vec<RouteTarget> = Vec::new();
        let map = self.adapters.read();

        // 1. Explicit routing wins (always 1-to-1)
        if let Some(exchange) = &intent.exchange {
            let ex_lower = exchange.to_lowercase();
            if let Some(adapter) = map.get(&ex_lower) {
                targets.push(RouteTarget {
                    name: ex_lower,
                    adapter: adapter.clone(),
                    weight: 1.0,
                });
            } else {
                warn!("⚠️ Explicit exchange '{}' not registered", exchange);
            }
            return targets;
        }

        let rule = self.resolve_rule(intent.source.as_ref());
        // fanout is ignored by Policy A, but filtering kept for reference or future re-enablement
        let _fanout = rule.fanout.unwrap_or(false);

        // 2. Weight-based routing (explicit)
        if let Some(weights) = rule.weights {
            for (exchange, weight) in weights {
                let ex_lower = exchange.to_lowercase();
                if let Some(adapter) = map.get(&ex_lower) {
                    targets.push(RouteTarget {
                        name: ex_lower,
                        adapter: adapter.clone(),
                        weight,
                    });
                } else {
                    warn!("⚠️ Weighted exchange '{}' not registered", exchange);
                }
            }
        }

        // 3. Fallback to source-based routing (only if no targets yet)
        if targets.is_empty() {
            if let Some(source) = &intent.source {
                match source.as_str() {
                    "scavenger" => {
                        if let Some(adapter) = map.get("bybit") {
                            targets.push(RouteTarget {
                                name: "bybit".to_string(),
                                adapter: adapter.clone(),
                                weight: 1.0,
                            });
                        }
                        if let Some(adapter) = map.get("mexc") {
                            targets.push(RouteTarget {
                                name: "mexc".to_string(),
                                adapter: adapter.clone(),
                                weight: 1.0,
                            });
                        }
                    }
                    "hunter" | "sentinel" => {
                        if let Some(adapter) = map.get("binance") {
                            targets.push(RouteTarget {
                                name: "binance".to_string(),
                                adapter: adapter.clone(),
                                weight: 1.0,
                            });
                        }
                    }
                    _ => {
                        if let Some(adapter) = map.get("binance") {
                            targets.push(RouteTarget {
                                name: "binance".to_string(),
                                adapter: adapter.clone(),
                                weight: 1.0,
                            });
                        }
                    }
                }
            } else if let Some(adapter) = map.get("binance") {
                targets.push(RouteTarget {
                    name: "binance".to_string(),
                    adapter: adapter.clone(),
                    weight: 1.0,
                });
            }
        }

        if targets.is_empty() {
            warn!("⚠️ No valid adapters found for routing intent {:?}", intent.source);
            return targets;
        }

        // Respect Fanout Configuration
        let fanout_allowed = rule.fanout.unwrap_or(false);
        if !fanout_allowed && targets.len() > 1 {
             warn!(
                "⚠️ Fanout disabled. Clamping to single target (from {} candidates).",
                targets.len()
            );
            // Sort by weight descending to pick the "best" one
            targets.sort_by(|a, b| b.weight.partial_cmp(&a.weight).unwrap_or(std::cmp::Ordering::Equal));
            targets.truncate(1);
        }

        targets
    }

    pub async fn execute(
        &self,
        intent: &Intent,
        order_req: OrderRequest,
    ) -> Vec<(String, OrderRequest, Result<OrderResponse, ExchangeError>)> {
        let routes = self.resolve_routes(intent);

        let mut results = Vec::new();
        let mut handles = Vec::new();

        if routes.is_empty() {
            return results;
        }

        if routes.len() > 1 {
            metrics::inc_fanout_orders(routes.len() as u64);
        }

        let total_weight: f64 = routes.iter().map(|route| route.weight).sum();
        let normalized_weights: Vec<f64> = if total_weight > 0.0 {
            routes.iter().map(|route| route.weight / total_weight).collect()
        } else {
            vec![1.0 / routes.len() as f64; routes.len()]
        };

        let mut remaining_qty = order_req.quantity;

        for (idx, route) in routes.into_iter().enumerate() {
            let weight = normalized_weights.get(idx).cloned().unwrap_or(0.0);
            let mut req = order_req.clone();

            let qty = if idx + 1 == normalized_weights.len() {
                remaining_qty
            } else {
                let weight_dec = Decimal::from_f64_retain(weight).unwrap_or(Decimal::ZERO);
                // Round weight to avoid fp precision issues (e.g. 0.7 -> 0.6999999)
                let weight_dec = weight_dec.round_dp(4); 
                let portion = order_req.quantity * weight_dec;
                remaining_qty -= portion;
                portion
            };

            if qty <= Decimal::ZERO {
                warn!("⚠️ Skipping route {} due to non-positive size", route.name);
                continue;
            }

            req.quantity = qty;
            req.client_order_id = format!("{}-{}-{}", req.client_order_id, route.name, idx);

            let name_clone = route.name.clone();
            let adapter = route.adapter.clone();

            let req_clone = req.clone();
            let handle = tokio::spawn(async move {
                info!("🚀 Routing to {}: {:?} {}", name_clone, req.side, req.symbol);
                let res = adapter.place_order(req).await;
                (name_clone, req_clone, res)
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

    pub async fn fetch_positions(&self, exchange: &str) -> Result<Vec<Position>, ExchangeError> {
        if let Some(adapter) = self.get_adapter(exchange) {
            adapter.get_positions().await
        } else {
            Err(ExchangeError::Config(format!("Exchange '{}' not found", exchange)))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exchange::adapter::{ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse};
    use crate::model::{OrderType, Side, Position};
    use async_trait::async_trait;
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use std::collections::HashMap;

    struct MockAdapter;

    #[async_trait]
    impl ExchangeAdapter for MockAdapter {
        async fn init(&self) -> Result<(), ExchangeError> {
            Ok(())
        }

        async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
            Ok(OrderResponse {
                order_id: format!("order-{}", order.client_order_id),
                client_order_id: order.client_order_id,
                symbol: order.symbol,
                status: "NEW".to_string(),
                avg_price: None,
                executed_qty: order.quantity,
                t_exchange: None,
                t_ack: 0,
                fee: None,
                fee_asset: None,
            })
        }

        async fn cancel_order(&self, _symbol: &str, _order_id: &str) -> Result<OrderResponse, ExchangeError> {
            Err(ExchangeError::Api("not implemented".to_string()))
        }

        async fn get_balance(&self, _asset: &str) -> Result<Decimal, ExchangeError> {
            Ok(Decimal::ZERO)
        }

        fn name(&self) -> &str {
            "mock"
        }

        async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
            Ok(vec![])
        }
    }

    fn base_intent() -> Intent {
        Intent {
            signal_id: "sig-1".to_string(),
            source: Some("scavenger".to_string()),
            symbol: "BTCUSDT".to_string(),
            direction: 1,
            intent_type: crate::model::IntentType::BuySetup,
            entry_zone: vec![],
            stop_loss: Decimal::ZERO,
            take_profits: vec![],
            size: Decimal::ZERO,
            status: crate::model::IntentStatus::Pending,
            t_signal: 0,
            t_analysis: None,
            t_decision: None,
            t_ingress: None,
            t_exchange: None,
            max_slippage_bps: None,
            rejection_reason: None,
            regime_state: None,
            phase: None,
            metadata: None,
            exchange: None,
            position_mode: None,
            child_fills: vec![],
            filled_size: Decimal::ZERO,
        }
    }

    #[tokio::test]
    async fn test_weighted_split() {
        let mut routing = RoutingConfig::default();
        routing.fanout = Some(true);
        routing.weights = Some(HashMap::from([
            ("binance".to_string(), 0.7),
            ("bybit".to_string(), 0.3),
        ]));

        let router = ExecutionRouter::with_routing(routing);
        router.register("binance", Arc::new(MockAdapter));
        router.register("bybit", Arc::new(MockAdapter));

        let intent = base_intent();
        let order_req = OrderRequest {
            symbol: "BTCUSDT".to_string(),
            side: Side::Buy,
            order_type: OrderType::Market,
            quantity: dec!(10.0),
            price: None,
            stop_price: None,
            client_order_id: "root".to_string(),
            reduce_only: false,
        };

        let results = router.execute(&intent, order_req).await;
        
        // Multi-Venue: Should return 2 results
        assert_eq!(results.len(), 2);
        
        // Verify Quantities (Order depends on hash map iteration, so checking sum is safer, 
        // but implementation iterates `routes` which came from `resolve_routes` which iterates config map.
        // `resolve_routes` creates vector. 
        // Let's check that we have one 7.0 and one 3.0
        
        let quantities: Vec<Decimal> = results.iter().map(|(_, req, _)| req.quantity).collect();
        assert!(quantities.contains(&dec!(7.0)));
        assert!(quantities.contains(&dec!(3.0)));
    }

    #[tokio::test]
    async fn test_fanout_disabled_defaults_to_single_route() {
        let mut routing = RoutingConfig::default();
        routing.fanout = Some(false);

        let router = ExecutionRouter::with_routing(routing);
        router.register("bybit", Arc::new(MockAdapter));
        router.register("mexc", Arc::new(MockAdapter));

        let intent = base_intent();
        let order_req = OrderRequest {
            symbol: "BTCUSDT".to_string(),
            side: Side::Buy,
            order_type: OrderType::Market,
            quantity: dec!(1.0),
            price: None,
            stop_price: None,
            client_order_id: "root".to_string(),
            reduce_only: false,
        };

        let results = router.execute(&intent, order_req).await;
        assert_eq!(results.len(), 1);
    }

    #[tokio::test]
    async fn test_weighted_split_preserves_dust() {
        let mut routing = RoutingConfig::default();
        routing.fanout = Some(true);
        routing.weights = Some(HashMap::from([
            ("A".to_string(), 0.33),
            ("B".to_string(), 0.33),
            ("C".to_string(), 0.33),
            // Sum = 0.99. The remaining 0.01 should conceptually be handled by normalization or the last-bucket logic.
            // Wait, normalized weights will handle the sum != 1.0 case by dividing by sum.
            // But let's verify weird decimal quantities.
        ]));

        let router = ExecutionRouter::with_routing(routing);
        router.register("A", Arc::new(MockAdapter));
        router.register("B", Arc::new(MockAdapter));
        router.register("C", Arc::new(MockAdapter));

        let intent = base_intent();
        // Use a quantity that doesn't divide cleanly: 1.0 / 3 = 0.333333...
        // 0.33 * 3 = 0.99. We expect 1.0 total.
        let order_req = OrderRequest {
            symbol: "BTCUSDT".to_string(),
            side: Side::Buy,
            order_type: OrderType::Market,
            quantity: dec!(1.0),
            price: None,
            stop_price: None,
            client_order_id: "root".to_string(),
            reduce_only: false,
        };

        let results = router.execute(&intent, order_req).await;
        
        assert_eq!(results.len(), 3);
        
        let total_qty: Decimal = results.iter().map(|(_, req, _)| req.quantity).sum();
        assert_eq!(total_qty, dec!(1.0));
        
        // Ensure no route got 0 size or negative (implicit in sum check, but good to know)
        for (_, req, _) in &results {
            assert!(req.quantity > Decimal::ZERO);
        }
    }
}
