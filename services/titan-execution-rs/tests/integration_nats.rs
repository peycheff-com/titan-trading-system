use titan_execution_rs::nats_engine;
use titan_execution_rs::model::{Intent, IntentType, IntentStatus};
use titan_execution_rs::shadow_state::ShadowState;
use titan_execution_rs::order_manager::OrderManager;
use titan_execution_rs::market_data::engine::MarketDataEngine;
use titan_execution_rs::circuit_breaker::GlobalHalt;
use titan_execution_rs::exchange::router::ExecutionRouter;
use titan_execution_rs::simulation_engine::SimulationEngine;
use rust_decimal_macros::dec;
use std::sync::Arc;
use parking_lot::RwLock;
use chrono::Utc;
use std::time::Duration;
use futures::StreamExt;
use serde_json::Value;

#[tokio::test]
async fn test_full_execution_flow() {
    // 1. Core Setup
    let market_data = Arc::new(MarketDataEngine::new());
    let halt = Arc::new(GlobalHalt::new());
    let shadow_state = Arc::new(RwLock::new(ShadowState::new()));
    let router = Arc::new(ExecutionRouter::new());
    let sim_engine = Arc::new(SimulationEngine::new(market_data.clone()));
    
    // Config: Chase orders for 5s
    let order_manager = OrderManager::new(None, market_data.clone(), halt.clone());

    // 2. NATS Connection (Assumes running NATS on localhost)
    let nats_url = std::env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    let client = async_nats::connect(&nats_url).await.expect("Failed to connect to NATS");
    
    // 3. Start Engine
    let _handle = nats_engine::start_nats_engine(
        client.clone(),
        shadow_state.clone(),
        order_manager,
        router.clone(),
        sim_engine.clone(),
        halt.clone()
    ).await.expect("Failed to start engine");

    // 4. Test Subscription (Listen for Fills)
    let mut fills_sub = client.subscribe("titan.execution.fill.>").await.unwrap();

    // 5. Publish Intent
    let signal_id = format!("test-sig-{}", uuid::Uuid::new_v4());
    let intent = Intent {
        signal_id: signal_id.clone(),
        symbol: "BTC/USD".to_string(),
        direction: 1,
        intent_type: IntentType::BuySetup,
        entry_zone: vec![dec!(50000.0)],
        stop_loss: dec!(49000.0),
        take_profits: vec![dec!(52000.0)],
        size: dec!(0.1),
        status: IntentStatus::Pending,
        source: Some("IntegrTest".to_string()),
        t_signal: Utc::now().timestamp_millis(),
        // ... optionals
        t_analysis: None, t_decision: None, t_ingress: None, t_exchange: None,
        max_slippage_bps: None, rejection_reason: None, regime_state: None, phase: None, metadata: None
    };
    
    let payload = serde_json::to_vec(&intent).unwrap();
    client.publish("titan.execution.intent.BTC.USD", payload.into()).await.unwrap();
    
    // 6. Assert Fill Received (Timeout 5s)
    let timeout = tokio::time::sleep(Duration::from_secs(5));
    tokio::pin!(timeout);

    let mut fill_received = false;
    
    loop {
        tokio::select! {
            Some(msg) = fills_sub.next() => {
                let payload = msg.payload;
                let data: Value = serde_json::from_slice(&payload).unwrap();
                if data["signal_id"] == signal_id {
                    println!("✅ Verified Fill: {:?}", data);
                    fill_received = true;
                    break;
                }
            }
            _ = &mut timeout => {
                break;
            }
        }
    }

    assert!(fill_received, "Timed out waiting for fill");
}
