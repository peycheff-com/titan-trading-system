use tracing::{info, error, Level};
use tracing_subscriber::FmtSubscriber;
use std::env;
use std::sync::Arc;
use parking_lot::RwLock;
use actix_web::{web, App, HttpServer};
use titan_execution_rs::shadow_state::ShadowState;
use titan_execution_rs::api;
use titan_execution_rs::order_manager::OrderManager;
use titan_execution_rs::exchange::adapter::ExchangeAdapter;
use titan_execution_rs::exchange::binance::BinanceAdapter;
use titan_execution_rs::exchange::bybit::BybitAdapter;
use titan_execution_rs::exchange::mexc::MexcAdapter;
use titan_execution_rs::exchange::router::ExecutionRouter;
use titan_execution_rs::market_data::engine::MarketDataEngine;
use titan_execution_rs::simulation_engine::SimulationEngine;
use titan_execution_rs::circuit_breaker::GlobalHalt;
use titan_execution_rs::nats_engine;
use actix_web_prom::PrometheusMetricsBuilder;

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

    // Initialize Prometheus Metrics
    let prometheus = PrometheusMetricsBuilder::new("titan_execution")
        .endpoint("/metrics")
        .build()
        .unwrap();

    // Initialize Core Components
    // Wrap ShadowState in Arc<RwLock> for sharing between NATS (write) and API (read)
    let shadow_state = Arc::new(RwLock::new(ShadowState::new()));

    // Initialize Market Data Engine (Truth Layer) - Moved up for dependency injection
    let market_data_engine = Arc::new(MarketDataEngine::new());
    let _md_handle = market_data_engine.start().await;
    info!("✅ Market Data Engine started");

    // Initialize Global Halt (Circuit Breaker)
    let global_halt = Arc::new(GlobalHalt::new());

    let order_manager = OrderManager::new(None, market_data_engine.clone(), global_halt.clone()); // Use default config

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
    let settings = Settings::new().expect("❌ critical: Failed to load configuration");
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

    // --- Start NATS Engine ---
    let nats_handle = nats_engine::start_nats_engine(
        client,
        shadow_state.clone(),
        order_manager, // Moved: OrderManager doesn't impl Clone, but is consumed here? 
                       // Wait, OrderManager does not impl Clone usually. 
                       // `start_nats_engine` takes `OrderManager` by value? 
                       // Previous code: `order_manager` was used inside `tokio::spawn(async move { ... })`.
                       // So yes, it was moved.
        router,
        simulation_engine,
        global_halt,
    ).await?;

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
            .wrap(prometheus.clone())
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
