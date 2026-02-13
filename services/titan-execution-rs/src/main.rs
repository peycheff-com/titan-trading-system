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
use titan_execution_rs::exchange::coinbase::CoinbaseAdapter;
use titan_execution_rs::exchange::cryptocom::CryptoComAdapter;
use titan_execution_rs::exchange::dydx::DydxAdapter;
use titan_execution_rs::exchange::gateio::GateIoAdapter;
use titan_execution_rs::exchange::kraken::KrakenAdapter;
use titan_execution_rs::exchange::kucoin::KucoinAdapter;
use titan_execution_rs::exchange::mexc::MexcAdapter;
use titan_execution_rs::exchange::okx::OkxAdapter;
use titan_execution_rs::exchange::router::ExecutionRouter;
use titan_execution_rs::exchange::uniswap::UniswapAdapter;
use titan_execution_rs::exchange::pancakeswap::PancakeSwapAdapter;
use titan_execution_rs::exchange::sushiswap::SushiSwapAdapter;
use titan_execution_rs::exchange::curve::CurveAdapter;
use titan_execution_rs::exchange::jupiter::JupiterAdapter;
use titan_execution_rs::exchange::gmx::GmxAdapter;
use titan_execution_rs::exchange::hyperliquid::HyperliquidAdapter;
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
use titan_execution_rs::subjects; // Canonical Subjects
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
                // SAFETY: Called once before #[tokio::main] spawns any threads
                unsafe { env::set_var(target_key, trimmed); }
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

    // Load environment variables from .env BEFORE checking secrets
    dotenv::dotenv().ok();

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
        let mut arm_sub = match client_for_arm.subscribe(subjects::CMD_OPERATOR_ARM).await {
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
            .subscribe(subjects::CMD_OPERATOR_DISARM)
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

    // 4. OKX
    let okx_config = exchanges.and_then(|e| e.okx.as_ref());
    if okx_config.map(|c| c.enabled).unwrap_or(false) {
        match OkxAdapter::new(okx_config) {
            Ok(adapter) => {
                let okx_adapter = Arc::new(adapter);
                if (okx_adapter.init().await).is_ok() {
                    router.register("okx", okx_adapter);
                } else {
                    error!("❌ Failed to initialize OKX adapter/ping");
                }
            }
            Err(e) => error!("❌ Failed to create OKX adapter: {}", e),
        }
    } else {
        info!("🚫 OKX disabled or missing in config");
    }

    // 5. Coinbase
    let coinbase_config = exchanges.and_then(|e| e.coinbase.as_ref());
    if coinbase_config.map(|c| c.enabled).unwrap_or(false) {
        match CoinbaseAdapter::new(coinbase_config) {
            Ok(adapter) => {
                let coinbase_adapter = Arc::new(adapter);
                if (coinbase_adapter.init().await).is_ok() {
                    router.register("coinbase", coinbase_adapter);
                } else {
                    error!("❌ Failed to initialize Coinbase adapter/ping");
                }
            }
            Err(e) => error!("❌ Failed to create Coinbase adapter: {}", e),
        }
    } else {
        info!("🚫 Coinbase disabled or missing in config");
    }

    // 6. Kraken
    let kraken_config = exchanges.and_then(|e| e.kraken.as_ref());
    if kraken_config.map(|c| c.enabled).unwrap_or(false) {
        match KrakenAdapter::new(kraken_config) {
            Ok(adapter) => {
                let kraken_adapter = Arc::new(adapter);
                if (kraken_adapter.init().await).is_ok() {
                    router.register("kraken", kraken_adapter);
                } else {
                    error!("❌ Failed to initialize Kraken adapter/ping");
                }
            }
            Err(e) => error!("❌ Failed to create Kraken adapter: {}", e),
        }
    } else {
        info!("🚫 Kraken disabled or missing in config");
    }

    // 7. KuCoin
    let kucoin_config = exchanges.and_then(|e| e.kucoin.as_ref());
    if kucoin_config.map(|c| c.enabled).unwrap_or(false) {
        match KucoinAdapter::new(kucoin_config) {
            Ok(adapter) => {
                let kucoin_adapter = Arc::new(adapter);
                if (kucoin_adapter.init().await).is_ok() {
                    router.register("kucoin", kucoin_adapter);
                } else {
                    error!("❌ Failed to initialize KuCoin adapter/ping");
                }
            }
            Err(e) => error!("❌ Failed to create KuCoin adapter: {}", e),
        }
    } else {
        info!("🚫 KuCoin disabled or missing in config");
    }

    // 8. Gate.io
    let gateio_config = exchanges.and_then(|e| e.gateio.as_ref());
    if gateio_config.map(|c| c.enabled).unwrap_or(false) {
        match GateIoAdapter::new(gateio_config) {
            Ok(adapter) => {
                let gateio_adapter = Arc::new(adapter);
                if (gateio_adapter.init().await).is_ok() {
                    router.register("gateio", gateio_adapter);
                } else {
                    error!("❌ Failed to initialize Gate.io adapter/ping");
                }
            }
            Err(e) => error!("❌ Failed to create Gate.io adapter: {}", e),
        }
    } else {
        info!("🚫 Gate.io disabled or missing in config");
    }

    // 9. Crypto.com
    let cryptocom_config = exchanges.and_then(|e| e.cryptocom.as_ref());
    if cryptocom_config.map(|c| c.enabled).unwrap_or(false) {
        match CryptoComAdapter::new(cryptocom_config) {
            Ok(adapter) => {
                let cryptocom_adapter = Arc::new(adapter);
                if (cryptocom_adapter.init().await).is_ok() {
                    router.register("cryptocom", cryptocom_adapter);
                } else {
                    error!("❌ Failed to initialize Crypto.com adapter/ping");
                }
            }
            Err(e) => error!("❌ Failed to create Crypto.com adapter: {}", e),
        }
    } else {
        info!("🚫 Crypto.com disabled or missing in config");
    }

    // 10. dYdX
    let dydx_config = exchanges.and_then(|e| e.dydx.as_ref());
    if dydx_config.map(|c| c.enabled).unwrap_or(false) {
        match DydxAdapter::new(dydx_config) {
            Ok(adapter) => {
                let dydx_adapter = Arc::new(adapter);
                if (dydx_adapter.init().await).is_ok() {
                    router.register("dydx", dydx_adapter);
                } else {
                    error!("❌ Failed to initialize dYdX adapter/ping");
                }
            }
            Err(e) => error!("❌ Failed to create dYdX adapter: {}", e),
        }
    } else {
        info!("🚫 dYdX disabled or missing in config");
    }

    // 11. Uniswap
    let uniswap_config = exchanges.and_then(|e| e.uniswap.as_ref());
    if uniswap_config.map(|c| c.enabled).unwrap_or(false) {
        match UniswapAdapter::new(uniswap_config) {
            Ok(adapter) => {
                let uniswap_adapter = Arc::new(adapter);
                if (uniswap_adapter.init().await).is_ok() {
                    router.register("uniswap", uniswap_adapter);
                } else {
                    error!("❌ Failed to initialize Uniswap adapter/ping");
                }
            }
            Err(e) => error!("❌ Failed to create Uniswap adapter: {}", e),
        }
    } else {
        info!("🚫 Uniswap disabled or missing in config");
    }

    // 12. PancakeSwap
    let pancakeswap_config = exchanges.and_then(|e| e.pancakeswap.as_ref());
    if pancakeswap_config.map(|c| c.enabled).unwrap_or(false) {
        match PancakeSwapAdapter::new(pancakeswap_config) {
            Ok(adapter) => {
                let pancakeswap_adapter = Arc::new(adapter);
                if (pancakeswap_adapter.init().await).is_ok() {
                    router.register("pancakeswap", pancakeswap_adapter);
                } else {
                    error!("❌ Failed to initialize PancakeSwap adapter");
                }
            }
            Err(e) => error!("❌ Failed to create PancakeSwap adapter: {}", e),
        }
    } else {
        info!("🚫 PancakeSwap disabled or missing in config");
    }

    // 13. SushiSwap
    let sushiswap_config = exchanges.and_then(|e| e.sushiswap.as_ref());
    if sushiswap_config.map(|c| c.enabled).unwrap_or(false) {
        match SushiSwapAdapter::new(sushiswap_config) {
            Ok(adapter) => {
                let sushiswap_adapter = Arc::new(adapter);
                if (sushiswap_adapter.init().await).is_ok() {
                    router.register("sushiswap", sushiswap_adapter);
                } else {
                    error!("❌ Failed to initialize SushiSwap adapter");
                }
            }
            Err(e) => error!("❌ Failed to create SushiSwap adapter: {}", e),
        }
    } else {
        info!("🚫 SushiSwap disabled or missing in config");
    }

    // 14. Curve Finance
    let curve_config = exchanges.and_then(|e| e.curve.as_ref());
    if curve_config.map(|c| c.enabled).unwrap_or(false) {
        match CurveAdapter::new(curve_config) {
            Ok(adapter) => {
                let curve_adapter = Arc::new(adapter);
                if (curve_adapter.init().await).is_ok() {
                    router.register("curve", curve_adapter);
                } else {
                    error!("❌ Failed to initialize Curve adapter");
                }
            }
            Err(e) => error!("❌ Failed to create Curve adapter: {}", e),
        }
    } else {
        info!("🚫 Curve disabled or missing in config");
    }

    // 15. Jupiter (Solana)
    let jupiter_config = exchanges.and_then(|e| e.jupiter.as_ref());
    if jupiter_config.map(|c| c.enabled).unwrap_or(false) {
        match JupiterAdapter::new(jupiter_config) {
            Ok(adapter) => {
                let jupiter_adapter = Arc::new(adapter);
                if (jupiter_adapter.init().await).is_ok() {
                    router.register("jupiter", jupiter_adapter);
                } else {
                    error!("❌ Failed to initialize Jupiter adapter");
                }
            }
            Err(e) => error!("❌ Failed to create Jupiter adapter: {}", e),
        }
    } else {
        info!("🚫 Jupiter disabled or missing in config");
    }

    // 16. GMX V2 (Arbitrum Perps)
    let gmx_config = exchanges.and_then(|e| e.gmx.as_ref());
    if gmx_config.map(|c| c.enabled).unwrap_or(false) {
        match GmxAdapter::new(gmx_config) {
            Ok(adapter) => {
                let gmx_adapter = Arc::new(adapter);
                if (gmx_adapter.init().await).is_ok() {
                    router.register("gmx", gmx_adapter);
                } else {
                    error!("❌ Failed to initialize GMX adapter");
                }
            }
            Err(e) => error!("❌ Failed to create GMX adapter: {}", e),
        }
    } else {
        info!("🚫 GMX disabled or missing in config");
    }

    // 17. Hyperliquid (L1 Perps)
    let hyperliquid_config = exchanges.and_then(|e| e.hyperliquid.as_ref());
    if hyperliquid_config.map(|c| c.enabled).unwrap_or(false) {
        match HyperliquidAdapter::new(hyperliquid_config) {
            Ok(adapter) => {
                let hl_adapter = Arc::new(adapter);
                if (hl_adapter.init().await).is_ok() {
                    router.register("hyperliquid", hl_adapter);
                } else {
                    error!("❌ Failed to initialize Hyperliquid adapter");
                }
            }
            Err(e) => error!("❌ Failed to create Hyperliquid adapter: {}", e),
        }
    } else {
        info!("🚫 Hyperliquid disabled or missing in config");
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
    let state_for_truth = shadow_state.clone();
    let risk_guard_for_truth = risk_guard.clone();
    let nats_for_truth = nats_client.clone();

    // --- Truth Snapshot Task ---
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            interval.tick().await;

            let timestamp = chrono::Utc::now().timestamp_millis();
            let positions = state_for_truth.read().get_all_positions();
            let policy_hash = risk_guard_for_truth.get_current_policy_hash();

            // Construct Snapshot
            let snapshot = serde_json::json!({
                "timestamp": timestamp,
                "service": "titan-execution-rs",
                "positions": positions,
                "policy_hash": policy_hash,
                "meta": {
                    "version": env!("CARGO_PKG_VERSION"),
                }
            });

            if let Ok(payload) = serde_json::to_vec(&snapshot)
                && let Err(e) = nats_for_truth
                    .publish(subjects::EVT_EXECUTION_TRUTH, payload.into())
                    .await
                {
                    tracing::error!("Failed to publish truth snapshot: {}", e);
                }
        }
    });

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
