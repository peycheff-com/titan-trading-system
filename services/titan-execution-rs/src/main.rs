use tracing::{info, error, Level};
mod auth_middleware;
use auth_middleware::AuthMiddleware;
use tracing_subscriber::FmtSubscriber;
use std::env;
use std::fs;
use std::sync::Arc;
use parking_lot::RwLock;
use actix_web::{web, App, HttpServer};
use titan_execution_rs::shadow_state::ShadowState;
use titan_execution_rs::persistence::store::PersistenceStore;
use titan_execution_rs::persistence::redb_store::RedbStore;
use titan_execution_rs::persistence::wal::WalManager;
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
use titan_execution_rs::risk_policy::RiskPolicy;
use titan_execution_rs::risk_guard::RiskGuard;
use titan_execution_rs::context::ExecutionContext;
use actix_web_prom::PrometheusMetricsBuilder;

fn load_secrets_from_files() {
    const FILE_SUFFIX: &str = "_FILE";

    let vars: Vec<(String, String)> = env::vars().collect();
    for (key, value) in vars {
        if !key.ends_with(FILE_SUFFIX) {
            continue;
        }

        let target_key = key.trim_end_matches(FILE_SUFFIX);
        if env::var(target_key).is_ok() {
            continue;
        }

        if value.is_empty() {
            continue;
        }

        if let Ok(contents) = fs::read_to_string(&value) {
            let trimmed = contents.trim().to_string();
            if !trimmed.is_empty() {
                env::set_var(target_key, trimmed);
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    load_secrets_from_files();

    // Initialize logging
    // --- Observability Setup (Phase 4) ---
    // Initialize OpenTelemetry
    use opentelemetry::{global, KeyValue};
    use opentelemetry_sdk::{trace as sdktrace, Resource};
    use opentelemetry_otlp::WithExportConfig;
    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::Registry;

    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(
            opentelemetry_otlp::new_exporter()
                .tonic()
                .with_endpoint("http://tempo:4317"), // Assuming tempo is resolvable
        )
        .with_trace_config(
            sdktrace::config().with_resource(Resource::new(vec![
                KeyValue::new("service.name", "titan-execution-rs"),
                KeyValue::new("service.version", "0.1.0"),
            ])),
        )
        .install_batch(opentelemetry_sdk::runtime::Tokio)
        .expect("OTel pipeline install failed");

    // Create a tracing layer with the configured tracer
    let telemetry = tracing_opentelemetry::layer().with_tracer(tracer);

    // Stdout JSON Layer
    let fmt_layer = tracing_subscriber::fmt::layer()
        .json()
        .with_target(false);

    // Registry combines both layers
    let subscriber = Registry::default()
        .with(tracing_subscriber::EnvFilter::from_default_env().add_directive(Level::INFO.into()))
        .with(fmt_layer)
        .with(telemetry);

    tracing::subscriber::set_global_default(subscriber)
        .expect("setting default subscriber failed");

    info!("╔═══════════════════════════════════════════════════════════════╗");
    info!("║               TITAN EXECUTION RS - Phase 2                    ║");
    info!("║               High Performance Execution Engine               ║");
    info!("╚═══════════════════════════════════════════════════════════════╝");

    // Load environment variables
    dotenv::dotenv().ok();

    // Initialize Prometheus Metrics
    let registry = prometheus::default_registry().clone();
    let prometheus = PrometheusMetricsBuilder::new("titan_execution")
        .registry(registry)
        .endpoint("/metrics")
        .build()
        .unwrap();

    // Connect to NATS
    let nats_url = env::var("NATS_URL").unwrap_or_else(|_| "nats://localhost:4222".to_string());
    info!("Connecting to NATS at {}", nats_url);

    let nats_client = match async_nats::connect(&nats_url).await {
        Ok(c) => {
            info!("✅ Connected to NATS");
            c
        },
        Err(e) => {
            error!("❌ Failed to connect to NATS: {}", e);
            std::process::exit(1);
        }
    };



    // Initialize Execution Context (System/Live)
    let ctx = Arc::new(ExecutionContext::new_system());

    // Initialize JetStream
    let jetstream = async_nats::jetstream::new(nats_client.clone());
    
    // Ensure Stream Exists
    let stream_name = "TITAN_EXECUTION";
    let subjects = vec!["titan.execution.>".to_string()];
    
    let _stream = match jetstream.get_stream(stream_name).await {
        Ok(s) => s,
        Err(_) => {
            info!("Creating JetStream Stream: {}", stream_name);
            match jetstream.create_stream(async_nats::jetstream::stream::Config {
                name: stream_name.to_string(),
                subjects,
                storage: async_nats::jetstream::stream::StorageType::File,
                max_age: std::time::Duration::from_secs(86400), // 24 hours
                max_bytes: 1024 * 1024 * 1024, // 1GB
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

    // Load Configuration
    use titan_execution_rs::config::Settings;
    let settings = Settings::new().expect("❌ critical: Failed to load configuration");
    let exchanges = settings.exchanges.as_ref();

    // Initialize Core Components
    // Initialize Persistence (Redb)
    let persistence_path = env::var("PERSISTENCE_PATH").unwrap_or_else(|_| "titan_execution.redb".to_string());
    let redb = Arc::new(RedbStore::new(&persistence_path).expect("Failed to create RedbStore"));
    let wal = Arc::new(WalManager::new(redb.clone()));
    let persistence = Arc::new(PersistenceStore::new(redb, wal));

    // Wrap ShadowState in Arc<RwLock> for sharing between NATS (write) and API (read)
    // Pass persistence to ShadowState
    let execution_config = settings.execution.clone().unwrap_or_default();
    let initial_balance = execution_config.initial_balance;
    
    let shadow_state = Arc::new(RwLock::new(ShadowState::new(persistence, ctx.clone(), initial_balance)));

    // Initialize Market Data Engine (Truth Layer) - Moved up for dependency injection
    let market_data_engine = Arc::new(MarketDataEngine::new(Some(nats_client.clone())));
    let _md_handle = market_data_engine.start().await;
    info!("✅ Market Data Engine started");

    // Initialize Global Halt (Circuit Breaker)
    let global_halt = Arc::new(GlobalHalt::new());

    let order_manager = OrderManager::new(None, market_data_engine.clone(), global_halt.clone()); // Use default config

    // Initialize Risk Guard
    let risk_policy = RiskPolicy::default();
    let risk_guard = Arc::new(RiskGuard::new(risk_policy, shadow_state.clone()));
    info!("✅ Risk Guard initialized with default policy");

    info!("✅ Core components initialized");



    // Initialize Simulation Engine (Shadow Layer)
    let simulation_engine = Arc::new(SimulationEngine::new(market_data_engine.clone(), ctx.clone()));



    // Initialize Execution Router (with routing config if present)
    let routing = settings
        .execution
        .as_ref()
        .and_then(|e| e.routing.clone())
        .unwrap_or_default();
    let router = Arc::new(ExecutionRouter::with_routing(routing));
    
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
        nats_client.clone(),
        shadow_state.clone(),
        order_manager,
        router,
        simulation_engine,
        global_halt,
        risk_guard.clone(),
        ctx.clone(),
        execution_config.freshness_threshold_ms.unwrap_or(5000),
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
            .wrap(AuthMiddleware)
            .wrap(prometheus.clone())
            .app_data(web::Data::new(state_for_api.clone()))
            .app_data(web::Data::new(nats_client.clone()))
            .app_data(web::Data::new(risk_guard.clone()))
            .configure(api::config)
    })
    .bind(&bind_address)?
    .run()
    .await?;

    // Wait for NATS task if server stops (unlikely unless signal)
    // Stop the NATS listener
    info!("Stopping NATS Engine...");
    nats_handle.abort();
    info!("✅ NATS Engine stopped");

    Ok(())
}
