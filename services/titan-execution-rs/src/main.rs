use tracing::{info, error, Level};
use tracing_subscriber::FmtSubscriber;
use std::env;
use futures::StreamExt;
use titan_execution_rs::shadow_state::{ShadowState, ExecutionEvent};
use titan_execution_rs::order_manager::OrderManager;
use titan_execution_rs::model::Intent;
use titan_execution_rs::api;
use std::sync::{Arc, RwLock};
use actix_web::{web, App, HttpServer};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber)
        .expect("setting default subscriber failed");

    info!("╔═══════════════════════════════════════════════════════════════╗");
    info!("║               TITAN EXECUTION RS - Phase 2                    ║");
    info!("║               High Performance Execution Engine               ║");
    info!("╚═══════════════════════════════════════════════════════════════╝");

    // Load environment variables
    dotenv::dotenv().ok();

    // Initialize Core Components
    // Wrap ShadowState in Arc<RwLock> for sharing between NATS (write) and API (read)
    let shadow_state = Arc::new(RwLock::new(ShadowState::new()));
    let order_manager = OrderManager::new(None); // Use default config

    info!("✅ Core components initialized");

    // Connect to NATS
    let nats_url = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    info!("Connecting to NATS at {}", nats_url);

    let client = match async_nats::connect(&nats_url).await {
        Ok(c) => {
            info!("✅ Connected to NATS");
            c
        },
        Err(e) => {
            error!("❌ Failed to connect to NATS: {}", e);
            std::process::exit(1);
        }
    };

    // --- NATS Consumer Task ---
    let client_clone = client.clone();
    let state_for_nats = shadow_state.clone();
    
    // Subscribe to Intents
    let subject = "titan.execution.intent.>";
    let mut subscription = client.subscribe(subject.to_string()).await?;
    info!("🚀 Listening for intents on '{}'", subject);

    let nats_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(msg) = subscription.next() => {
                    let payload_str = String::from_utf8_lossy(&msg.payload);
                    info!("Received message: {}", payload_str);

                    match serde_json::from_slice::<Intent>(&msg.payload) {
                        Ok(intent) => {
                            info!("Intent received: {} {}", intent.symbol, intent.signal_id);
                            
                            // Lock state for writing
                            // Scope the lock to minimize contention
                            let processed_intent = {
                                let mut state = state_for_nats.write().unwrap();
                                state.process_intent(intent.clone())
                            };
                            
                            // Order Manager Decision (Stateless/Internal state not shared here yet)
                            let decision = {
                                let order_params = titan_execution_rs::model::OrderParams {
                                    signal_id: processed_intent.signal_id.clone(),
                                    symbol: processed_intent.symbol.clone(),
                                    side: titan_execution_rs::model::Side::Buy, // Simplification
                                    size: processed_intent.size,
                                    limit_price: Some(processed_intent.entry_zone.first().cloned().unwrap_or_default()),
                                    stop_loss: Some(processed_intent.stop_loss),
                                    take_profits: Some(processed_intent.take_profits.clone()),
                                    signal_type: Some(format!("{:?}", processed_intent.intent_type)),
                                    expected_profit_pct: None,
                                };
                                order_manager.decide_order_type(&order_params)
                            };
                            
                            info!(
                                signal_id = %processed_intent.signal_id,
                                decision = ?decision.order_type,
                                "Order decision made"
                            );

                            // Mock Execution Flow
                            use titan_execution_rs::model::IntentType;
                            
                            let (fill_price, _is_close) = match intent.intent_type {
                                IntentType::BuySetup | IntentType::SellSetup => {
                                    (intent.entry_zone.first().cloned().unwrap_or_default(), false)
                                },
                                IntentType::CloseLong | IntentType::CloseShort | IntentType::Close => {
                                    (intent.entry_zone.first().cloned().unwrap_or_default(), true)
                                },
                                _ => (rust_decimal::Decimal::ZERO, false)
                            };

                            if !fill_price.is_zero() {
                                let event_to_publish = {
                                    let mut state = state_for_nats.write().unwrap();
                                    state.confirm_execution(
                                        &intent.signal_id, 
                                        fill_price, 
                                        intent.size, 
                                        true
                                    )
                                };

                                if let Some(event) = event_to_publish {
                                    match event {
                                        ExecutionEvent::Opened(pos) => info!("Mock: Position Opened: {} {}", pos.symbol, pos.size),
                                        ExecutionEvent::Updated(pos) => info!("Mock: Position Updated: {} {}", pos.symbol, pos.size),
                                        ExecutionEvent::Closed(trade) => {
                                            info!("Mock: Position Closed: PnL {}", trade.pnl);
                                            // Publish Trade Closed Event
                                            let subject = "execution.trade.closed";
                                            let payload = serde_json::to_vec(&trade).unwrap();
                                            if let Err(e) = client_clone.publish(subject.to_string(), payload.into()).await {
                                                 error!("Failed to publish trade closed event: {}", e);
                                            } else {
                                                 info!("Published trade closed event for {}", trade.signal_id);
                                            }
                                        },
                                    }
                                }
                            }
                        },
                        Err(e) => {
                            error!("Failed to deserialize intent: {}", e);
                        }
                    }
                }
                _ = tokio::time::sleep(tokio::time::Duration::from_secs(60)) => {
                    let count = state_for_nats.read().unwrap().get_trade_history().len();
                    info!("Heartbeat... Trades in history: {}", count);
                }
            }
        }
    });

    // --- API Server Task ---
    let api_port = env::var("PORT").unwrap_or_else(|_| "3002".to_string());
    let bind_address = format!("0.0.0.0:{}", api_port);
    info!("🚀 Starting API Server on {}", bind_address);

    let state_for_api = shadow_state.clone();
    
    HttpServer::new(move || {
        let cors = actix_cors::Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header();

        App::new()
            .wrap(cors)
            .app_data(web::Data::new(state_for_api.clone()))
            .configure(api::config)
    })
    .bind(&bind_address)?
    .run()
    .await?;

    // Wait for NATS task if server stops (unlikely unless signal)
    let _ = nats_handle.await;

    Ok(())
}
