use tracing::{info, error, warn, Level};
use tracing_subscriber::FmtSubscriber;
use async_nats::jetstream;
use std::env;
use futures::StreamExt;
use titan_execution_rs::shadow_state::{ShadowState, ExecutionEvent};
use titan_execution_rs::order_manager::OrderManager;
use titan_execution_rs::model::Intent;

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

    // Initialize Core Components
    let mut shadow_state = ShadowState::new();
    let order_manager = OrderManager::new(None); // Use default config

    info!("✅ Core components initialized");

    // Subscribe to Intents
    // TODO: Use JetStream Consumer for durable persistence
    // For now, simple subscription to verify flow
    let subject = "titan.execution.intent.>";
    let mut subscription = client.subscribe(subject.to_string()).await?;
    
    info!("🚀 Listening for intents on '{}'", subject);

    loop {
        tokio::select! {
            Some(msg) = subscription.next() => {
                let payload_str = String::from_utf8_lossy(&msg.payload);
                info!("Received message: {}", payload_str);

                match serde_json::from_slice::<Intent>(&msg.payload) {
                    Ok(intent) => {
                        info!("Intent received: {} {}", intent.symbol, intent.signal_id);
                        
                        // 1. Update Shadow State (Pending)
                        let processed_intent = shadow_state.process_intent(intent.clone());
                        
                        // 2. Order Manager Decision
                        let order_params = titan_execution_rs::model::OrderParams {
                            signal_id: processed_intent.signal_id.clone(),
                            symbol: processed_intent.symbol.clone(),
                            side: titan_execution_rs::model::Side::Buy, // Simplification for test
                            size: processed_intent.size,
                            limit_price: Some(processed_intent.entry_zone[0]), // Simplification
                            stop_loss: Some(processed_intent.stop_loss),
                            take_profits: Some(processed_intent.take_profits.clone()),
                            signal_type: Some(format!("{:?}", processed_intent.intent_type)),
                            expected_profit_pct: None,
                        };

                        let decision = order_manager.decide_order_type(&order_params);
                        
                        info!(
                            signal_id = %processed_intent.signal_id,
                            decision = ?decision.order_type,
                            "Order decision made"
                        );

                        // Mock Execution Flow
                        use titan_execution_rs::model::IntentType;
                        
                        let (fill_price, is_close) = match intent.intent_type {
                            IntentType::BuySetup | IntentType::SellSetup => {
                                (intent.entry_zone.first().cloned().unwrap_or_default(), false)
                            },
                            IntentType::CloseLong | IntentType::CloseShort | IntentType::Close => {
                                // For mock close, use entry_zone[0] as exit price if present, else 0
                                (intent.entry_zone.first().cloned().unwrap_or_default(), true)
                            },
                            _ => (rust_decimal::Decimal::ZERO, false)
                        };

                        if !fill_price.is_zero() {
                            if let Some(event) = shadow_state.confirm_execution(
                                &intent.signal_id, 
                                fill_price, 
                                intent.size, 
                                true
                            ) {
                                match event {
                                    ExecutionEvent::Opened(pos) => {
                                        info!("Mock: Position Opened: {} {}", pos.symbol, pos.size);
                                    },
                                    ExecutionEvent::Updated(pos) => {
                                        info!("Mock: Position Updated: {} {}", pos.symbol, pos.size);
                                    },
                                    ExecutionEvent::Closed(trade) => {
                                        info!("Mock: Position Closed: PnL {}", trade.pnl);
                                        // Publish Trade Closed Event
                                        let subject = "execution.trade.closed";
                                        let payload = serde_json::to_vec(&trade).unwrap();
                                        if let Err(e) = client.publish(subject.to_string(), payload.into()).await {
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
                info!("Heartbeat... Active positions: {}", 0); // Placeholder
            }
        }
    }
}
