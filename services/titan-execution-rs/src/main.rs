use tracing::{info, error, Level};
use tracing_subscriber::FmtSubscriber;
use std::env;
use futures::StreamExt;
use rust_decimal::Decimal;
use chrono::Utc;
use titan_execution_rs::shadow_state::{ShadowState, ExecutionEvent};
use titan_execution_rs::order_manager::OrderManager;
use titan_execution_rs::model::Intent;
use titan_execution_rs::api;
use std::sync::Arc;
use parking_lot::RwLock;
use actix_web::{web, App, HttpServer};
use titan_execution_rs::exchange::adapter::{ExchangeAdapter, OrderRequest};
use titan_execution_rs::exchange::binance::BinanceAdapter;
use titan_execution_rs::exchange::bybit::BybitAdapter;
use titan_execution_rs::exchange::mexc::MexcAdapter;
use titan_execution_rs::exchange::router::ExecutionRouter;
use titan_execution_rs::market_data::engine::MarketDataEngine;
use titan_execution_rs::simulation_engine::SimulationEngine;

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

    // Initialize Market Data Engine (Truth Layer) - Moved up for dependency injection
    let market_data_engine = Arc::new(MarketDataEngine::new());
    let _md_handle = market_data_engine.start().await;
    info!("✅ Market Data Engine started");

    let order_manager = OrderManager::new(None, market_data_engine.clone()); // Use default config

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

    // Initialize JetStream
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
                    std::process::exit(1);
                }
            }
        }
    };

    // Initialize Execution Router
    let router = Arc::new(ExecutionRouter::new());

    // Initialize Simulation Engine (Shadow Layer)
    let simulation_engine = Arc::new(SimulationEngine::new(market_data_engine.clone()));

    // Load Configuration
    use titan_execution_rs::config::Settings;
    let settings = Settings::new().unwrap_or_else(|e| {
        error!("⚠️ Failed to load config: {}. Proceeding with defaults/env.", e);
        Settings::default()
    });
    let exchanges = settings.exchanges.as_ref();
    
    // 1. Binance
    let binance_config = exchanges.and_then(|e| e.binance.as_ref());
    if binance_config.map(|c| c.enabled).unwrap_or(false) {
        match BinanceAdapter::new(binance_config) {
            Ok(adapter) => {
                let binance_adapter = Arc::new(adapter);
                if let Ok(_) = binance_adapter.init().await {
                    router.register("binance", binance_adapter);
                } else {
                    error!("❌ Failed to initialize Binance adapter");
                }
            }
            Err(e) => error!("❌ Failed to create Binance adapter: {}", e),
        }
    } else {
        info!("🚫 Binance disabled or missing in config");
    }

    // 2. Bybit
    let bybit_config = exchanges.and_then(|e| e.bybit.as_ref());
    if bybit_config.map(|c| c.enabled).unwrap_or(false) {
        match BybitAdapter::new(bybit_config) {
            Ok(adapter) => {
                let bybit_adapter = Arc::new(adapter);
                if let Ok(_) = bybit_adapter.init().await {
                    router.register("bybit", bybit_adapter);
                } else {
                    error!("❌ Failed to initialize Bybit adapter");
                }
            }
            Err(e) => error!("❌ Failed to create Bybit adapter: {}", e),
        }
    } else {
        info!("🚫 Bybit disabled or missing in config");
    }

    // 3. MEXC
    let mexc_config = exchanges.and_then(|e| e.mexc.as_ref());
    if mexc_config.map(|c| c.enabled).unwrap_or(false) {
        match MexcAdapter::new(mexc_config) {
            Ok(adapter) => {
                let mexc_adapter = Arc::new(adapter);
                if let Ok(_) = mexc_adapter.init().await {
                    router.register("mexc", mexc_adapter);
                } else {
                    error!("❌ Failed to initialize MEXC adapter/ping");
                }
            }
            Err(e) => error!("❌ Failed to create MEXC adapter: {}", e),
        }
    } else {
        info!("🚫 MEXC disabled or missing in config");
    }

    // --- NATS Consumer Task (JetStream) ---
    let client_clone = client.clone();
    let client_shadow = client.clone(); // Clone for shadow publisher
    let state_for_nats = shadow_state.clone();
    let router_nats = router.clone();
    let sim_engine_nats = simulation_engine.clone();

    // Create Durable Consumer
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
                             let payload_str = String::from_utf8_lossy(&msg.payload);
                             info!("Received message: {}", payload_str);
        
                             match serde_json::from_slice::<Intent>(&msg.payload) {
                                Ok(intent) => {
                                    info!("Intent received: {} {}", intent.symbol, intent.signal_id);
                                    
                                    // ACK Trigger: We ACK *after* we have successfully decided what to do.
                                    // Or ACK immediately if we want "At Most Once" semantics but inside JetStream.
                                    // For "At Least Once", we ACK after critical persistence or execution.
                                    // Here we ACK at the end of the block.

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
                                        // We acknowledge expired messages so they don't redeliver forever
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
                                    let t_decision = Utc::now().timestamp_millis();
                                    
                                    // ... Real Execution Logic (Same as before) ...
                                     // Real Execution Flow
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

                                                let fill_report = titan_execution_rs::model::FillReport {
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
                                    // ACK poison messages to remove their from queue
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
