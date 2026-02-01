use tracing::{error, info, Level};
mod auth_middleware;
use actix_web::{web, App, HttpServer};
use actix_web_prom::PrometheusMetricsBuilder;
use auth_middleware::AuthMiddleware;
use parking_lot::RwLock;
use std::env;
use std::fs;
use std::sync::Arc;
use titan_execution_rs::api;
use titan_execution_rs::armed_state::ArmedState;
use titan_execution_rs::circuit_breaker::GlobalHalt;
use titan_execution_rs::context::ExecutionContext;
use titan_execution_rs::drift_detector::DriftDetector;
use titan_execution_rs::exchange::adapter::ExchangeAdapter;
use titan_execution_rs::exchange::binance::BinanceAdapter;
use titan_execution_rs::exchange::bybit::BybitAdapter;
use titan_execution_rs::exchange::mexc::MexcAdapter;
use titan_execution_rs::exchange::router::ExecutionRouter;
use titan_execution_rs::execution_constraints::ConstraintsStore;
use titan_execution_rs::market_data::engine::MarketDataEngine;
use titan_execution_rs::nats_engine;
use titan_execution_rs::order_manager::OrderManager;
use titan_execution_rs::persistence::redb_store::RedbStore;
use titan_execution_rs::persistence::store::PersistenceStore;
use titan_execution_rs::persistence::wal::WalManager;
use titan_execution_rs::risk_guard::RiskGuard;
use titan_execution_rs::risk_policy::RiskPolicy;
use titan_execution_rs::shadow_state::ShadowState;
use titan_execution_rs::simulation_engine::SimulationEngine;
use titan_execution_rs::sre::SreMonitor;
// use tracing_subscriber::FmtSubscriber;

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
    use opentelemetry::KeyValue;
    use opentelemetry_otlp::WithExportConfig;
    use opentelemetry_sdk::{trace as sdktrace, Resource};
    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::Registry;

    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(
            opentelemetry_otlp::new_exporter()
                .tonic()
                .with_endpoint("http://tempo:4317"), // Assuming tempo is resolvable
        )
        .with_trace_config(sdktrace::config().with_resource(Resource::new(vec![
            KeyValue::new("service.name", "titan-execution-rs"),
            KeyValue::new("service.version", "0.1.0"),
        ])))
        .install_batch(opentelemetry_sdk::runtime::Tokio)
        .expect("OTel pipeline install failed");

    // Create a tracing layer with the configured tracer
    let telemetry = tracing_opentelemetry::layer().with_tracer(tracer);

    // Stdout JSON Layer
    let fmt_layer = tracing_subscriber::fmt::layer().json().with_target(false);

    // Registry combines both layers
    let subscriber = Registry::default()
        .with(tracing_subscriber::EnvFilter::from_default_env().add_directive(Level::INFO.into()))
        .with(fmt_layer)
        .with(telemetry);

    tracing::subscriber::set_global_default(subscriber).expect("setting default subscriber failed");

    info!("╔═══════════════════════════════════════════════════════════════╗");
    info!("║               TITAN EXECUTION RS - Phase 2                    ║");
    info!("║               High Performance Execution Engine               ║");
    info!("╚═══════════════════════════════════════════════════════════════╝");

    // =========================================================================
    // FAIL-CLOSED SECURITY CHECK: Validate HMAC_SECRET before ANY network ops
    // =========================================================================
    {
        let hmac_secret = env::var("HMAC_SECRET").unwrap_or_default();
        let allow_empty = env::var("HMAC_ALLOW_EMPTY_SECRET")
            .map(|v| v == "true")
            .unwrap_or(false);

        if hmac_secret.is_empty() && !allow_empty {
            error!(
                "❌ FATAL: HMAC_SECRET environment variable is required for production. \
                 Set HMAC_ALLOW_EMPTY_SECRET=true only for testing."
            );
            std::process::exit(1);
        } else if hmac_secret.is_empty() {
            info!("⚠️  HMAC_SECRET not set but HMAC_ALLOW_EMPTY_SECRET=true. TEST MODE ONLY.");
        } else {
            info!("🔐 HMAC_SECRET configured ({}  bytes)", hmac_secret.len());
        }
    }

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
    let nats_user = env::var("NATS_USER").ok();
    let nats_pass = env::var("NATS_PASS").ok();

    info!("Connecting to NATS at {}", nats_url);

    let mut connect_opts = async_nats::ConnectOptions::new();
    if let (Some(user), Some(pass)) = (nats_user, nats_pass) {
        connect_opts = connect_opts.user_and_password(user, pass);
    }

    let nats_client = match async_nats::connect_with_options(&nats_url, connect_opts).await {
        Ok(c) => {
            info!("✅ Connected to NATS");
            c
        }
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
            match jetstream
                .create_stream(async_nats::jetstream::stream::Config {
                    name: stream_name.to_string(),
                    subjects,
                    storage: async_nats::jetstream::stream::StorageType::File,
                    max_age: std::time::Duration::from_secs(86400), // 24 hours
                    max_bytes: 1024 * 1024 * 1024,                  // 1GB
                    ..Default::default()
                })
                .await
            {
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
    let persistence_path =
        env::var("PERSISTENCE_PATH").unwrap_or_else(|_| "titan_execution.redb".to_string());
    let redb = Arc::new(RedbStore::new(&persistence_path).expect("Failed to create RedbStore"));
    let wal = Arc::new(WalManager::new(redb.clone()));
    let persistence = Arc::new(PersistenceStore::new(redb, wal));

    // Wrap ShadowState in Arc<RwLock> for sharing between NATS (write) and API (read)
    // Pass persistence to ShadowState
    let execution_config = settings.execution.clone().unwrap_or_default();
    let initial_balance = execution_config.initial_balance;

    let shadow_state = Arc::new(RwLock::new(ShadowState::new(
        persistence,
        ctx.clone(),
        initial_balance,
    )));

    // Initialize Market Data Engine (Truth Layer) - Moved up for dependency injection
    let market_data_engine = Arc::new(MarketDataEngine::new(Some(nats_client.clone())));
    let _md_handle = market_data_engine.start().await;
    info!("✅ Market Data Engine started");

    // Initialize Global Halt (Circuit Breaker)
    let global_halt = Arc::new(GlobalHalt::new());

    // Initialize Armed State (Physical Interlock - defaults DISARMED)
    let armed_state = Arc::new(ArmedState::new());

    let order_manager = OrderManager::new(None, market_data_engine.clone(), global_halt.clone()); // Use default config

    // Initialize Risk Guard
    let risk_policy = RiskPolicy::default();
    let policy_hash = RiskPolicy::get_hash();
    info!("✅ Risk Policy Loaded. Hash: {}", policy_hash);
    let risk_guard = Arc::new(RiskGuard::new(risk_policy, shadow_state.clone()));
    info!("✅ Risk Guard initialized with default policy");

    // Initialize Constraints Store (PowerLaw Execution Constraints)
    let constraints_store = Arc::new(ConstraintsStore::new());
    info!("✅ Constraints Store initialized");

    // Initialize Drift Detector
    let drift_detector = Arc::new(DriftDetector::new(
        20.0, // spread 20bps
        2000, // latency 2s
        80.0, // correlation 80bps
    ));

    // Initialize SRE Monitor and spawn loop
    let sre_monitor = Arc::new(SreMonitor::new());
    let rg_for_sre = risk_guard.clone();
    let sre_for_loop = sre_monitor.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            sre_for_loop.check_slos(&rg_for_sre);
        }
    });
    info!("✅ SRE Monitor active");

    // --- Operator ARM/DISARM Command Listener ---
    let armed_for_listener = armed_state.clone();
    let client_for_arm = nats_client.clone();
    tokio::spawn(async move {
        use futures::StreamExt;
        // Listen for ARM command
        let mut arm_sub = match client_for_arm.subscribe("titan.cmd.operator.arm.v1").await {
            Ok(s) => s,
            Err(e) => {
                error!("Failed to subscribe to ARM commands: {}", e);
                return;
            }
        };
        while let Some(msg) = arm_sub.next().await {
            let reason = String::from_utf8_lossy(&msg.payload).to_string();
            info!("🔫 Received ARM command: {}", reason);
            armed_for_listener.set_armed(true, &reason);
        }
    });

    let armed_for_disarm = armed_state.clone();
    let client_for_disarm = nats_client.clone();
    tokio::spawn(async move {
        use futures::StreamExt;
        // Listen for DISARM command
        let mut disarm_sub = match client_for_disarm
            .subscribe("titan.cmd.operator.disarm.v1")
            .await
        {
            Ok(s) => s,
            Err(e) => {
                error!("Failed to subscribe to DISARM commands: {}", e);
                return;
            }
        };
        while let Some(msg) = disarm_sub.next().await {
            let reason = String::from_utf8_lossy(&msg.payload).to_string();
            info!("🔒 Received DISARM command: {}", reason);
            armed_for_disarm.set_armed(false, &reason);
        }
    });
    info!("✅ Execution ARM/DISARM listeners active");

    info!("✅ Core components initialized");

    // Initialize Simulation Engine (Shadow Layer)
    let simulation_engine = Arc::new(SimulationEngine::new(
        market_data_engine.clone(),
        ctx.clone(),
    ));

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
                if (binance_adapter.init().await).is_ok() {
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
                if (bybit_adapter.init().await).is_ok() {
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
                if (mexc_adapter.init().await).is_ok() {
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
        armed_state.clone(),
        risk_guard.clone(),
        ctx.clone(),
        execution_config.freshness_threshold_ms.unwrap_or(5000),
        drift_detector.clone(),
        constraints_store.clone(),
    )
    .await?;

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
