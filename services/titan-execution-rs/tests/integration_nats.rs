use async_trait::async_trait;
use chrono::Utc;
use futures::StreamExt;
use hmac::{Hmac, Mac};
use parking_lot::RwLock;
use serde_json::Value;
use sha2::Sha256;
use std::sync::Arc;
use std::time::Duration;
use titan_execution_rs::armed_state::ArmedState;
use titan_execution_rs::circuit_breaker::GlobalHalt;
use titan_execution_rs::context::ExecutionContext;
use titan_execution_rs::drift_detector::DriftDetector;
use titan_execution_rs::exchange::adapter::{
    ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse,
};
use titan_execution_rs::exchange::router::ExecutionRouter;
use titan_execution_rs::execution_constraints::ConstraintsStore;
use titan_execution_rs::market_data::engine::MarketDataEngine;
use titan_execution_rs::model::Position;
use titan_execution_rs::nats_engine;
use titan_execution_rs::order_manager::OrderManager;
use titan_execution_rs::persistence::redb_store::RedbStore;
use titan_execution_rs::persistence::store::PersistenceStore;
use titan_execution_rs::persistence::wal::WalManager;
use titan_execution_rs::risk_guard::RiskGuard;
use titan_execution_rs::risk_policy::RiskPolicy;
use titan_execution_rs::shadow_state::ShadowState;
use titan_execution_rs::simulation_engine::SimulationEngine;

fn create_test_persistence() -> (Arc<PersistenceStore>, String) {
    let path = format!("/tmp/test_nats_db_{}.redb", uuid::Uuid::new_v4());
    let redb = Arc::new(RedbStore::new(&path).expect("Failed to create RedbStore"));
    let wal = Arc::new(WalManager::new(redb.clone()));
    let store = Arc::new(PersistenceStore::new(redb, wal));
    (store, path)
}

#[tokio::test]
#[ignore] // Requires running NATS server with proper authentication
async fn test_full_execution_flow() {
    // 0. Init Logging
    let _ = tracing_subscriber::fmt()
        .with_env_filter("info,titan_execution_rs=debug")
        .try_init();

    // 1. Core Setup
    // SAFETY: Set before any async runtime spawns threads
    unsafe { std::env::set_var("HMAC_SECRET", "test-secret-123"); }
    let market_data = Arc::new(MarketDataEngine::new(None));
    let halt = Arc::new(GlobalHalt::new());
    let (persistence, _db_path) = create_test_persistence();
    let ctx = Arc::new(ExecutionContext::new_system());
    let shadow_state = Arc::new(RwLock::new(ShadowState::new(
        persistence,
        ctx.clone(),
        Some(10000.0),
    )));
    // Risk Guard
    let risk_policy = RiskPolicy::default(); // Assumes Default impl or I need to construct one
    let risk_guard = Arc::new(RiskGuard::new(risk_policy, shadow_state.clone()));
    let router = Arc::new(ExecutionRouter::new());

    struct MockAdapter;

    #[async_trait]
    impl ExchangeAdapter for MockAdapter {
        async fn init(&self) -> Result<(), ExchangeError> {
            Ok(())
        }

        async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
            Ok(OrderResponse {
                order_id: format!("mock-{}", order.client_order_id),
                client_order_id: order.client_order_id,
                symbol: order.symbol,
                status: "FILLED".to_string(),
                avg_price: None,
                executed_qty: order.quantity,
                t_exchange: None,
                t_ack: chrono::Utc::now().timestamp_millis(),
                fee: None,
                fee_asset: None,
            })
        }

        async fn cancel_order(
            &self,
            _symbol: &str,
            _order_id: &str,
        ) -> Result<OrderResponse, ExchangeError> {
            Err(ExchangeError::Api("not implemented".to_string()))
        }

        async fn get_balance(&self, _asset: &str) -> Result<rust_decimal::Decimal, ExchangeError> {
            Ok(rust_decimal::Decimal::ZERO)
        }

        fn name(&self) -> &str {
            "binance"
        }

        async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
            Ok(vec![])
        }
    }

    router.register("binance", Arc::new(MockAdapter));
    let sim_engine = Arc::new(SimulationEngine::new(market_data.clone(), ctx.clone()));

    // Config: Chase orders for 5s
    let order_manager = OrderManager::new(None, market_data.clone(), halt.clone());

    // 2. NATS Connection (Assumes running NATS on localhost)
    let nats_url =
        std::env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let client = async_nats::connect(&nats_url)
        .await
        .expect("Failed to connect to NATS");

    // 3. Start Engine
    let drift_detector = Arc::new(DriftDetector::new(50.0, 1000, 100.0));
    let constraints_store = Arc::new(ConstraintsStore::new());
    let armed_state = Arc::new(ArmedState::new()); // Test state, no persistence

    let _handle = nats_engine::start_nats_engine(
        client.clone(),
        shadow_state.clone(),
        order_manager,
        router.clone(),
        sim_engine.clone(),
        halt.clone(),
        armed_state.clone(),
        risk_guard.clone(),
        ctx.clone(),
        5000, // freshness threshold
        drift_detector,
        constraints_store,
    )
    .await
    .expect("Failed to start engine");

    // 4. Test Subscription (Listen for Fills + DLQ)
    let mut fills_sub = client
        .subscribe("titan.evt.execution.fill.v1.binance.main.>")
        .await
        .unwrap();
    let mut dlq_sub = client.subscribe("titan.dlq.execution.core").await.unwrap();

    // 5. Publish Intent
    let signal_id = format!("test-sig-{}", uuid::Uuid::new_v4());
    let symbol = "BTC/USDT";
    let symbol_token = symbol.replace('/', "_");
    let intent_payload = serde_json::json!({
        "schema_version": "1.0.0",
        "signal_id": signal_id.clone(),
        "symbol": symbol,
        "direction": 1,
        "type": "BUY_SETUP",
        "size": 0.1,
        "status": "PENDING",
        "source": "IntegrTest",
        "t_signal": Utc::now().timestamp_millis(),
        "entry_zone": [50000.0],
        "stop_loss": 49000.0,
        "take_profits": [52000.0],
        "exchange": "binance",
        "position_mode": "one_way"
    });

    let ts = Utc::now().timestamp_millis();
    let nonce = uuid::Uuid::new_v4().to_string();
    let payload_str = serde_json::to_string(&intent_payload).unwrap();
    let canonical = format!("{}.{}.{}", ts, nonce, payload_str);

    type HmacSha256 = Hmac<Sha256>;
    let mut mac = HmacSha256::new_from_slice(b"test-secret-123").unwrap();
    mac.update(canonical.as_bytes());
    let sig = hex::encode(mac.finalize().into_bytes());

    let envelope = serde_json::json!({
        "type": "titan.cmd.execution.place.v1",
        "version": 1,
        "producer": "test-suite",
        "ts": ts,
        "nonce": nonce,
        "sig": sig,
        "payload": intent_payload,
        "correlation_id": format!("corr-{}", uuid::Uuid::new_v4())
    });

    let payload = serde_json::to_vec(&envelope).unwrap();
    let intent_subject = format!("titan.cmd.execution.place.v1.binance.main.{}", symbol_token);
    client
        .publish(intent_subject, payload.into())
        .await
        .unwrap();

    // 6. Assert Fill Received (Timeout 5s)
    let timeout = tokio::time::sleep(Duration::from_secs(5));
    tokio::pin!(timeout);

    let mut fill_received = false;

    loop {
        tokio::select! {
            Some(msg) = fills_sub.next() => {
                let payload = msg.payload;
                let data: Value = serde_json::from_slice(&payload).unwrap();
                // Check in payload (Envelope wrapper) or root (if raw)
                let signal_check = data.get("payload")
                    .and_then(|p| p.get("signal_id"))
                    .or_else(|| data.get("signal_id"));

                if let Some(id_val) = signal_check
                    && id_val == &signal_id {
                        println!("✅ Verified Fill: {:?}", data);
                        fill_received = true;
                        break;
                    }
            }
            Some(msg) = dlq_sub.next() => {
                let payload = msg.payload;
                println!("❌ Received DLQ Message: {:?}", String::from_utf8_lossy(&payload));
                // Fail immediately if we see our signal in DLQ
                let data: Value = serde_json::from_slice(&payload).unwrap();
                // Check if it's our signal (DLQ payload wrapper might vary)
                // Titan DLQ structure: { payload: { ... }, error: ... }
                if let Some(inner) = data.get("payload")
                     && inner["signal_id"] == signal_id {
                         panic!("Intent rejected to DLQ: {:?}", data);
                     }
            }
            _ = &mut timeout => {
                break;
            }
        }
    }

    assert!(fill_received, "Timed out waiting for fill");

    // 7. Publish Invalid Intent (missing t_signal and timestamp)
    let invalid_payload = serde_json::json!({
        "signal_id": "bad-sig",
        "symbol": "BTC/USD",
        "direction": 1,
        "type": "BUY_SETUP",
        "size": 1,
        "status": "PENDING"
    });

    client
        .publish(
            format!("titan.cmd.execution.place.v1.binance.main.{}", symbol_token),
            serde_json::to_vec(&invalid_payload).unwrap().into(),
        )
        .await
        .unwrap();

    let dlq_timeout = tokio::time::sleep(Duration::from_secs(5));
    tokio::pin!(dlq_timeout);
    let mut dlq_received = false;

    loop {
        tokio::select! {
            Some(msg) = dlq_sub.next() => {
                let payload = msg.payload;
                let data: Value = serde_json::from_slice(&payload).unwrap();
                if data["payload"]["signal_id"] == "bad-sig" {
                    dlq_received = true;
                    break;
                }
            }
            _ = &mut dlq_timeout => {
                break;
            }
        }
    }

    assert!(dlq_received, "Timed out waiting for DLQ");
}
