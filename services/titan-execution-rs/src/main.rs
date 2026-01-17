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
use titan_execution_rs::exchange::adapter::{ExchangeAdapter, OrderRequest};
use titan_execution_rs::exchange::binance::BinanceAdapter;
use titan_execution_rs::exchange::bybit::BybitAdapter;
use titan_execution_rs::exchange::mexc::MexcAdapter;
use titan_execution_rs::exchange::router::ExecutionRouter;

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

    // Initialize Execution Router
    let router = Arc::new(ExecutionRouter::new());

    // 1. Binance
    let binance_adapter = Arc::new(BinanceAdapter::new());
    if let Ok(_) = binance_adapter.init().await {
        router.register("binance", binance_adapter);
    } else {
        error!("❌ Failed to initialize Binance adapter");
    }

    // 2. Bybit
    let bybit_adapter = Arc::new(BybitAdapter::new());
    if let Ok(_) = bybit_adapter.init().await {
        router.register("bybit", bybit_adapter);
    } else {
        error!("❌ Failed to initialize Bybit adapter");
    }

    // 3. MEXC
    let mexc_adapter = Arc::new(MexcAdapter::new());
    if let Ok(_) = mexc_adapter.init().await {
        router.register("mexc", mexc_adapter);
    } else {
        error!("❌ Failed to initialize MEXC adapter/ping");
    }

    // --- NATS Consumer Task ---
    let client_clone = client.clone();
    let state_for_nats = shadow_state.clone();
    let router_nats = router.clone();
    
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

                            // Real Execution Flow
                            // 1. Determine Side
                            let side = match intent.intent_type {
                                titan_execution_rs::model::IntentType::BuySetup => titan_execution_rs::model::Side::Buy,
                                titan_execution_rs::model::IntentType::SellSetup => titan_execution_rs::model::Side::Sell,
                                titan_execution_rs::model::IntentType::CloseLong => titan_execution_rs::model::Side::Sell,
                                titan_execution_rs::model::IntentType::CloseShort => titan_execution_rs::model::Side::Buy,
                                _ => {
                                    if intent.direction == 1 {
                                        titan_execution_rs::model::Side::Buy
                                    } else {
                                        titan_execution_rs::model::Side::Sell
                                    }
                                }
                            };

                            // 2. Build Order Request
                            let order_req = OrderRequest {
                                symbol: intent.symbol.replace("/", ""), // Ensure formatting (e.g. BTCUSDT)
                                side,
                                order_type: decision.order_type.clone(),
                                quantity: intent.size,
                                price: decision.limit_price,
                                stop_price: None, // TODO: Map from decision
                                client_order_id: format!("{}-{}", intent.signal_id, uuid::Uuid::new_v4()),
                                reduce_only: decision.reduce_only,
                            };
                            
                            info!("🚀 Executing Real Order: {:?} {} @ {:?}", order_req.side, order_req.symbol, order_req.price);

                            // 3. Execute via Router (Single or Multi-Exchange)
                            let results = router_nats.execute(&intent, order_req).await;
                            
                            for (exchange_name, result) in results {
                                match result {
                                    Ok(response) => {
                                        info!("✅ [{}] Order Placed: ID {}", exchange_name, response.order_id);
                                        
                                        // 4. Update Shadow State (First success triggers update for now)
                                        // TODO: Better handling of split state
                                        let fill_price = response.avg_price.unwrap_or(decision.limit_price.unwrap_or_default());
                                        
                                        let event_to_publish = {
                                            let mut state = state_for_nats.write().unwrap();
                                            state.confirm_execution(
                                                &intent.signal_id, 
                                                fill_price, 
                                                response.executed_qty, 
                                                true 
                                            )
                                        };

                                        // 5. Publish Internal Event
                                        if let Some(event) = event_to_publish {
                                            match event {
                                                ExecutionEvent::Opened(pos) => info!("Position Opened: {} {}", pos.symbol, pos.size),
                                                ExecutionEvent::Updated(pos) => info!("Position Updated: {} {}", pos.symbol, pos.size),
                                                ExecutionEvent::Closed(trade) => {
                                                    let subject = "execution.trade.closed";
                                                    let payload = serde_json::to_vec(&trade).unwrap();
                                                    client_clone.publish(subject.to_string(), payload.into()).await.ok();
                                                },
                                            }
                                        }
                                    },
                                    Err(e) => {
                                        error!("❌ [{}] Execution Failed: {}", exchange_name, e);
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
