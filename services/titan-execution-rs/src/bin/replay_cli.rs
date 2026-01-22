use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use parking_lot::RwLock;
use tracing::{info, warn, error, level_filters::LevelFilter};
use tracing_subscriber::EnvFilter;
use async_trait::async_trait;
use rust_decimal::Decimal;

use titan_execution_rs::context::{ExecutionContext, SimulatedTimeProvider, DeterministicIdProvider};
use titan_execution_rs::order_manager::OrderManager;
use titan_execution_rs::persistence::store::PersistenceStore;
use titan_execution_rs::persistence::wal::WalManager;
use titan_execution_rs::persistence::redb_store::RedbStore;
use titan_execution_rs::pipeline::ExecutionPipeline;
use titan_execution_rs::replay_engine::ReplayEngine;
use titan_execution_rs::risk_guard::RiskGuard;
use titan_execution_rs::shadow_state::ShadowState;
use titan_execution_rs::simulation_engine::SimulationEngine;
use titan_execution_rs::replay_model::ReplayEvent;
use titan_execution_rs::exchange::adapter::{ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse};
use titan_execution_rs::exchange::router::ExecutionRouter;
use titan_execution_rs::market_data::engine::MarketDataEngine;
use titan_execution_rs::model::Position;
use titan_execution_rs::circuit_breaker::GlobalHalt;

// --- Mock Adapter ---
struct MockAdapter;

#[async_trait]
impl ExchangeAdapter for MockAdapter {
    async fn init(&self) -> Result<(), ExchangeError> { Ok(()) }
    
    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        Ok(OrderResponse {
            order_id: format!("mock-{}", order.client_order_id),
            client_order_id: order.client_order_id,
            symbol: order.symbol,
            status: "NEW".to_string(),
            avg_price: None, // Will fill at limit or mock logic elsewhere
            executed_qty: order.quantity,
            t_exchange: None,
            t_ack: 0,
            fee: None,
            fee_asset: None,
        })
    }
    
    async fn cancel_order(&self, _symbol: &str, _order_id: &str) -> Result<OrderResponse, ExchangeError> {
        Err(ExchangeError::Api("Mock cancel not impl".to_string()))
    }
    
    async fn get_balance(&self, _asset: &str) -> Result<Decimal, ExchangeError> {
        Ok(Decimal::from(100000))
    }
    
    fn name(&self) -> &str { "mock" }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> { Ok(vec![]) }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Setup logging
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive(LevelFilter::INFO.into()))
        .init();

    let args: Vec<String> = env::args().collect();
    let input_path = if args.len() > 1 { Some(PathBuf::from(&args[1])) } else { None };
    let output_path = if args.len() > 2 { Some(PathBuf::from(&args[2])) } else { None };

    info!("🔧 Initializing Replay Engine...");

    // 1. Context (Simulated)
    let time_provider = Arc::new(SimulatedTimeProvider::new(0));
    let id_provider = Arc::new(DeterministicIdProvider::new());
    
    // We construct ExecutionContext (struct) but store it in Arc for components that need Arc<ExecutionContext>
    let ctx_struct = ExecutionContext {
        time: time_provider.clone(),
        id: id_provider,
    };
    let ctx = Arc::new(ctx_struct.clone());

    // 2. Persistence (Redb Temp)
    let temp_dir = env::temp_dir();
    let db_path = temp_dir.join(format!("titan_replay_{}.redb", uuid::Uuid::new_v4()));
    info!("📂 Using temporary DB: {:?}", db_path);
    
    let redb_store = Arc::new(RedbStore::new(&db_path)?);
    let wal = Arc::new(WalManager::new(redb_store.clone()));
    wal.initialize()?; // Init tables
    
    let persistence = Arc::new(PersistenceStore::new(redb_store, wal));

    // 3. Components
    let market_data = Arc::new(MarketDataEngine::new(None));
    let global_halt = Arc::new(GlobalHalt::new());
    
    let shadow_state = Arc::new(RwLock::new(ShadowState::new(persistence.clone(), ctx.clone(), None)));
    
    let order_manager = OrderManager::new(None, market_data.clone(), global_halt.clone());
    
    let risk_guard = Arc::new(RiskGuard::new(Default::default(), shadow_state.clone()));
    
    let simulation_engine = Arc::new(SimulationEngine::new(market_data.clone(), ctx.clone()));
    
    let router = Arc::new(ExecutionRouter::new());
    router.register("binance", Arc::new(MockAdapter)); // Default fallback
    router.register("bybit", Arc::new(MockAdapter));
    router.register("mexc", Arc::new(MockAdapter));
    router.register("okx", Arc::new(MockAdapter));

    // 5. Pipeline
    let pipeline = Arc::new(ExecutionPipeline::new(
        shadow_state.clone(),
        order_manager,
        router.clone(),
        simulation_engine.clone(),
        risk_guard.clone(),
        ctx.clone(),
        5000,
    ));

    // 6. Replay Engine
    let mut engine = ReplayEngine::new(
        pipeline,
        shadow_state.clone(),
        risk_guard.clone(),
        time_provider.clone(), // Specific type for manual control
        ctx.clone(),
    );

    // 7. Load Events
    let reader: Box<dyn BufRead> = match input_path {
        Some(path) => {
            info!("📖 Reading events from {:?}", path);
            Box::new(BufReader::new(File::open(path)?))
        },
        None => {
            info!("📖 Reading events from STDIN");
            Box::new(BufReader::new(std::io::stdin()))
        },
    };

    let event_stream = reader.lines()
        .filter_map(|line| line.ok())
        .filter_map(|line| {
            if line.trim().is_empty() { return None; }
            match serde_json::from_str::<ReplayEvent>(&line) {
                Ok(ev) => Some(ev),
                Err(e) => {
                    warn!("Failed to parse line: {}", e);
                    None
                }
            }
        });

    // 8. Run
    engine.run_event_loop(event_stream).await;

    // 9. Report
    info!("📊 Generating Report...");
    
    let report_json = serde_json::to_string_pretty(&engine.fills)?;
    
    if let Some(out_path) = output_path {
        let mut file = File::create(out_path)?;
        file.write_all(report_json.as_bytes())?;
    } else {
        println!("--- Fills Report ---");
        println!("{}", report_json);
        println!("--------------------");
    }

    // Cleanup DB
    let _ = std::fs::remove_file(db_path);

    Ok(())
}
