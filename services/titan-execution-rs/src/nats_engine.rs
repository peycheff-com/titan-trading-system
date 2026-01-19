use tracing::{info, error, warn};
use futures::StreamExt;
use std::sync::Arc;
use parking_lot::RwLock;
use serde_json::Value;
use rust_decimal::Decimal;
use chrono::Utc;

use crate::shadow_state::{ShadowState, ExecutionEvent};
use crate::order_manager::OrderManager;
use crate::model::{Intent, IntentStatus, IntentType, FillReport, Side};
use crate::exchange::adapter::OrderRequest;
use crate::exchange::router::ExecutionRouter;
use crate::simulation_engine::SimulationEngine;
use crate::circuit_breaker::GlobalHalt;

/// Start the NATS Engine (Consumer Loop and Halt Listener)
/// Returns a handle to the consumer task
pub async fn start_nats_engine(
    client: async_nats::Client,
    shadow_state: Arc<RwLock<ShadowState>>,
    order_manager: OrderManager,
    router: Arc<ExecutionRouter>,
    simulation_engine: Arc<SimulationEngine>,
    global_halt: Arc<GlobalHalt>,
) -> Result<tokio::task::JoinHandle<()>, Box<dyn std::error::Error + Send + Sync>> {
    
    // --- System Halt Listener (Core NATS) ---
    // Listen for urgent kill signals. Payload: { "active": true, "reason": "Manually triggered" }
    let mut halt_sub = client.subscribe("system.halt").await.map_err(|e| {
         error!("❌ Failed to subscribe to system.halt: {}", e);
         e
    })?;
    let halt_state_clone = global_halt.clone();
    
    tokio::spawn(async move {
        info!("👂 Listening for system.halt signals...");
        while let Some(msg) = halt_sub.next().await {
            if let Ok(v) = serde_json::from_slice::<Value>(&msg.payload) {
                let active = v.get("active").and_then(|b| b.as_bool()).unwrap_or(false);
                let reason = v.get("reason").and_then(|s| s.as_str()).unwrap_or("Unknown");
                halt_state_clone.set_halt(active, reason);
            } else {
                warn!("Received malformed system.halt payload");
            }
        }
    });

    // --- JetStream Setup ---
    let jetstream = async_nats::jetstream::new(client.clone());
    
    // Ensure Stream Exists
    let stream_name = "TITAN_EXECUTION";
    let subjects = vec!["titan.execution.>".to_string()];
    
    let stream = match jetstream.get_stream(stream_name).await {
        Ok(s) => s,
        Err(_) => {
            info!("Creating JetStream Stream: {}", stream_name);
            match jetstream.create_stream(async_nats::jetstream::stream::Config {
                name: stream_name.to_string(),
                subjects,
                storage: async_nats::jetstream::stream::StorageType::File,
                ..Default::default()
            }).await {
                Ok(s) => s,
                Err(e) => {
                    error!("❌ Failed to create JetStream stream: {}", e);
                    // In test environment this might fail if stream exists with diff config
                    return Err(Box::new(e)); 
                }
            }
        }
    };

    // --- NATS Consumer Task (JetStream) ---
    let client_clone = client.clone();
    let client_shadow = client.clone(); // Clone for shadow publisher
    let state_for_nats = shadow_state.clone();
    let router_nats = router.clone();
    let sim_engine_nats = simulation_engine.clone();

    // Create Durable Consumer
    // Use a unique name if in dev/test to avoid conflict? For now use static.
    let consumer_name = "TITAN_EXECUTION_WORKER";
    let intent_subject = "titan.execution.intent.>";
    
    let consumer = stream.create_consumer(async_nats::jetstream::consumer::pull::Config {
        durable_name: Some(consumer_name.to_string()),
        filter_subject: intent_subject.to_string(),
        ack_policy: async_nats::jetstream::consumer::AckPolicy::Explicit,
        ..Default::default()
    }).await.map_err(|e| {
        error!("❌ Failed to create JetStream consumer: {}", e);
        e
    })?;
    
    info!("🚀 JetStream Consumer '{}' listening on '{}'", consumer_name, intent_subject);

    // Pull messages
    let mut messages = consumer.messages().await.map_err(|e| {
         error!("❌ Failed to get messages stream: {}", e);
         e
    })?;

    let nats_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(msg_result) = messages.next() => {
                    match msg_result {
                        Ok(msg) => {
                             // --- PROCESS MESSAGE ---
                             match serde_json::from_slice::<Intent>(&msg.payload) {
                                Ok(intent) => {
                                    info!("Intent received: {} {}", intent.symbol, intent.signal_id);
                                    
                                    // ACK at end...

                                    // --- SHADOW EXECUTION (Concurrent) ---
                                    if let Some(shadow_fill) = sim_engine_nats.simulate_execution(&intent) {
                                        let subject = format!("titan.execution.shadow_fill.{}", intent.symbol);
                                        if let Ok(payload) = serde_json::to_vec(&shadow_fill) {
                                            client_shadow.publish(subject, payload.into()).await.ok();
                                        }
                                    }
                                    
                                    // Enforce Timestamp Freshness (5000ms window)
                                    let now = Utc::now().timestamp_millis();
                                    if now - intent.t_signal > 5000 {
                                        error!("❌ Intent EXPIRED: {} ms latency. Dropping.", now - intent.t_signal);
                                        if let Err(e) = msg.ack().await {
                                             error!("Failed to ACK expired msg: {}", e);
                                        }
                                        continue;
                                    }
                                    
                                    // Lock state for writing
                                    let processed_intent = {
                                        let mut state = state_for_nats.write();
                                        state.process_intent(intent.clone())
                                    };
                                    
                                    // Order Manager Decision
                                    let decision = {
                                        let order_params = crate::model::OrderParams {
                                            signal_id: processed_intent.signal_id.clone(),
                                            symbol: processed_intent.symbol.clone(),
                                            side: Side::Buy, // Simplification: In real impl, infer from IntentType/Direction
                                            size: processed_intent.size,
                                            limit_price: Some(processed_intent.entry_zone.first().cloned().unwrap_or_default()),
                                            stop_loss: Some(processed_intent.stop_loss),
                                            take_profits: Some(processed_intent.take_profits.clone()),
                                            signal_type: Some(format!("{:?}", processed_intent.intent_type)),
                                            expected_profit_pct: None,
                                        };
                                        order_manager.decide_order_type(&order_params)
                                    };
                                    let t_decision = Utc::now().timestamp_millis();
                                    
                                    // Real Execution Flow
                                    // Fix: correctly map side from intent
                                    let side = match intent.intent_type {
                                        IntentType::BuySetup => Side::Buy,
                                        IntentType::SellSetup => Side::Sell,
                                        IntentType::CloseLong => Side::Sell,
                                        IntentType::CloseShort => Side::Buy,
                                        _ => {
                                            if intent.direction == 1 {
                                                Side::Buy
                                            } else {
                                                Side::Sell
                                            }
                                        }
                                    };

                                    let order_req = OrderRequest {
                                        symbol: intent.symbol.replace("/", ""), 
                                        side: side.clone(),
                                        order_type: decision.order_type.clone(),
                                        quantity: intent.size,
                                        price: decision.limit_price,
                                        stop_price: None,
                                        client_order_id: format!("{}-{}", intent.signal_id, uuid::Uuid::new_v4()),
                                        reduce_only: decision.reduce_only,
                                    };
                                    
                                    info!("🚀 Executing Real Order: {:?} {} @ {:?}", order_req.side, order_req.symbol, order_req.price);

                                    let results = router_nats.execute(&intent, order_req.clone()).await;
                                    
                                    for (exchange_name, result) in results {
                                        match result {
                                            Ok(response) => {
                                                info!("✅ [{}] Order Placed: ID {}", exchange_name, response.order_id);
                                                
                                                let fill_price = response.avg_price.unwrap_or(decision.limit_price.unwrap_or_default());
                                                
                                                let event_to_publish = {
                                                    let mut state = state_for_nats.write();
                                                    state.confirm_execution(
                                                        &intent.signal_id, 
                                                        fill_price, 
                                                        response.executed_qty, 
                                                        true 
                                                    )
                                                };

                                                if let Some(event) = event_to_publish {
                                                    match event {
                                                        ExecutionEvent::Opened(pos) => info!("Pos Open: {} {}", pos.symbol, pos.size),
                                                        ExecutionEvent::Updated(pos) => info!("Pos Upd: {} {}", pos.symbol, pos.size),
                                                        ExecutionEvent::Closed(trade) => {
                                                            let subject = "execution.trade.closed";
                                                            if let Ok(payload) = serde_json::to_vec(&trade) {
                                                                client_clone.publish(subject.to_string(), payload.into()).await.ok();
                                                            }
                                                        },
                                                    }
                                                }

                                                let fill_report = FillReport {
                                                    fill_id: response.order_id.clone(),
                                                    signal_id: intent.signal_id.clone(),
                                                    symbol: intent.symbol.clone(),
                                                    side: order_req.side.clone(),
                                                    price: fill_price,
                                                    qty: response.executed_qty,
                                                    fee: Decimal::ZERO,
                                                    fee_currency: "USDT".to_string(),
                                                    t_signal: intent.t_signal,
                                                    t_ingress: processed_intent.t_ingress.unwrap_or(Utc::now().timestamp_millis()),
                                                    t_decision,
                                                    t_ack: response.t_ack,
                                                    t_exchange: response.t_exchange.unwrap_or(Utc::now().timestamp_millis()),
                                                    client_order_id: order_req.client_order_id.clone(),
                                                    execution_id: response.order_id.clone(),
                                                };

                                                let subject = format!("titan.execution.fill.{}", intent.symbol);
                                                if let Ok(payload) = serde_json::to_vec(&fill_report) {
                                                    client_clone.publish(subject, payload.into()).await.ok();
                                                }
                                            },
                                            Err(e) => {
                                                error!("❌ [{}] Execution Failed: {}", exchange_name, e);
                                            }
                                        }
                                    }

                                    // ACK Message after processing
                                    if let Err(e) = msg.ack().await {
                                        error!("❌ Failed to ACK message: {}", e);
                                    } else {
                                        info!("ACKed intent {}", intent.signal_id);
                                    }

                                },
                                Err(e) => {
                                    error!("Failed to deserialize intent: {}", e);
                                    msg.ack().await.ok(); 
                                }
                            }
                        },
                        Err(e) => {
                            error!("Error receiving message from JetStream: {}", e);
                        }
                    }
                }
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(60)) => {
                    let count = state_for_nats.read().get_trade_history().len();
                    info!("Heartbeat... Trades in history: {}", count);
                }
            }
        }
    });

    Ok(nats_handle)
}
