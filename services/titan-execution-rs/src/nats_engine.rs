use futures::StreamExt;
use parking_lot::RwLock;
use serde_json::Value;
use std::sync::Arc;
use tracing::{error, info, warn};

use crate::armed_state::ArmedState;
use crate::circuit_breaker::GlobalHalt;
use crate::context::ExecutionContext;
use crate::drift_detector::DriftDetector;
use crate::exchange::adapter::OrderRequest;
use crate::exchange::router::ExecutionRouter;
use crate::execution_constraints::ConstraintsStore;
use crate::intent_validation::validate_intent_payload;
use crate::metrics;
use crate::model::IntentType;
use crate::order_manager::OrderManager;
use crate::pipeline::ExecutionPipeline;
use crate::risk_guard::RiskGuard;
use crate::shadow_state::{ExecutionEvent, ShadowState};
use crate::simulation_engine::SimulationEngine;
use crate::subjects; // Canonical Subjects

/// Start the NATS Engine (Consumer Loop and Halt Listener)
/// Returns a handle to the consumer task
#[allow(clippy::too_many_arguments)]
pub async fn start_nats_engine(
    client: async_nats::Client,
    shadow_state: Arc<RwLock<ShadowState>>,
    order_manager: OrderManager,
    router: Arc<ExecutionRouter>,
    simulation_engine: Arc<SimulationEngine>,
    global_halt: Arc<GlobalHalt>,
    armed_state: Arc<ArmedState>,
    risk_guard: Arc<RiskGuard>,
    ctx: Arc<ExecutionContext>,
    freshness_threshold: u64,
    drift_detector: Arc<DriftDetector>,
    _constraints_store: Arc<ConstraintsStore>,
) -> Result<tokio::task::JoinHandle<()>, Box<dyn std::error::Error + Send + Sync>> {
    // --- System Halt Listener (Core NATS) ---
    // ... (unchanged)

    // ... (skipping unchanged parts for brevity if possible, but replace_file_content needs contiguity)
    // Actually, I can use multi_replace to target specific areas.
    // Chunk 1: Signature
    // Chunk 2: Pipeline Init
    // Chunk 3: Loop optimization
    // Wait, the Instruction says "Update signature". I should use multi_replace.

    // --- PIPELINE CONSTRUCTION ---
    let pipeline = Arc::new(ExecutionPipeline::new(
        shadow_state.clone(),
        order_manager.clone(),
        router.clone(),
        simulation_engine.clone(),
        risk_guard.clone(),
        ctx.clone(),
        freshness_threshold,
        drift_detector.clone(),
    ));

    // --- Market Data Listener (Staleness) ---
    let mut ticker_sub = client
        .subscribe(subjects::DATA_MARKET_TICKER_PREFIX)
        .await
        .map_err(|e| {
            error!("❌ Failed to subscribe to tickers: {}", e);
            e
        })?;
    let risk_guard_for_md = risk_guard.clone();
    tokio::spawn(async move {
        while let Some(msg) = ticker_sub.next().await {
            // Topic: titan.market.ticker.<exchange>.<symbol>
            // For now, parse JSON payload for "exchange" and "symbol" or use subject?
            // Subject is easier.
            let subject = msg.subject.to_string();
            let parts: Vec<&str> = subject.split('.').collect();
            if parts.len() >= 4 {
                let exchange = parts[3];
                let symbol = if parts.len() > 4 { parts[4] } else { "UNKNOWN" };
                // Update Staleness Monitor
                risk_guard_for_md.record_market_data_update(exchange, symbol);
            }
        }
    });

    // --- System Halt Listener (Unified SystemState) ---
    // Payload: { "state": "OPEN" | "SOFT_HALT" | "HARD_HALT", "reason": "...", "timestamp": ... }
    let mut halt_sub = client
        .subscribe(subjects::CMD_SYS_HALT)
        .await
        .map_err(|e| {
            error!("❌ Failed to subscribe to system halt command: {}", e);
            e
        })?;
    let halt_state_clone = global_halt.clone();

    tokio::spawn(async move {
        info!("👂 Listening for system halt signals...");
        while let Some(msg) = halt_sub.next().await {
            if let Ok(v) = serde_json::from_slice::<Value>(&msg.payload) {
                // Check if new SystemState format
                if let Some(state_str) = v.get("state").and_then(|s| s.as_str()) {
                    let reason = v
                        .get("reason")
                        .and_then(|s| s.as_str())
                        .unwrap_or("System Command");

                    match state_str {
                        "OPEN" => {
                            info!("🟢 System State: OPEN. Resuming operations.");
                            halt_state_clone.set_halt(false, reason);
                        }
                        "SOFT_HALT" => {
                            // Rust currently treats Soft/Hard same (Halt)
                            warn!(
                                "🟡 System State: SOFT_HALT. Reducing risk (treated as HALT in Phase 2)."
                            );
                            halt_state_clone.set_halt(true, reason);
                        }
                        "HARD_HALT" => {
                            error!("🔴 System State: HARD_HALT. Emergency Stop.");
                            halt_state_clone.set_halt(true, reason);
                        }
                        _ => {
                            warn!("Received unknown system state: {}", state_str);
                        }
                    }
                    continue;
                }
            } else {
                warn!("Received malformed system.halt payload");
            }
        }
    });

    // --- Get Positions Request-Reply Handler ---
    let mut positions_sub = client
        .subscribe(subjects::RPC_GET_POSITIONS_PREFIX)
        .await
        .map_err(|e| {
            error!("❌ Failed to subscribe to get_positions: {}", e);
            e
        })?;
    let router_for_query = router.clone();
    // Removed state_for_query (shadow_state) as we now go live
    let client_for_query = client.clone();

    tokio::spawn(async move {
        info!("👂 Listening for get_positions requests...");
        while let Some(msg) = positions_sub.next().await {
            if let Some(reply_to) = msg.reply {
                // Parse subject to get exchange: titan.execution.get_positions.<exchange>
                let subject_str = msg.subject.to_string();
                let parts: Vec<&str> = subject_str.split('.').collect();
                let exchange = parts.last().unwrap_or(&"unknown");

                info!("🔍 Fetching LIVE positions for '{}'...", exchange);

                let positions_result = router_for_query.fetch_positions(exchange).await;

                let response = match positions_result {
                    Ok(positions) => {
                        serde_json::json!({
                            "positions": positions
                        })
                    }
                    Err(e) => {
                        error!("❌ Failed to fetch positions from {}: {}", exchange, e);
                        serde_json::json!({
                            "positions": [],
                            "error": e.to_string()
                        })
                    }
                };

                if let Ok(payload) = serde_json::to_vec(&response) {
                    client_for_query
                        .publish(reply_to, payload.into())
                        .await
                        .ok();
                }
            }
        }
    });

    // --- Get Balances Stub ---
    let mut balances_sub = client
        .subscribe(subjects::RPC_GET_BALANCES_PREFIX)
        .await
        .map_err(|e| {
            error!("❌ Failed to subscribe to get_balances: {}", e);
            e
        })?;
    let client_for_balances = client.clone();
    let state_for_balances = shadow_state.clone();

    tokio::spawn(async move {
        while let Some(msg) = balances_sub.next().await {
            if let Some(reply_to) = msg.reply {
                let (equity, cash) = {
                    let state = state_for_balances.read();
                    (state.get_equity(), state.get_cash_balance())
                };

                let response = serde_json::json!({
                   "balances": [
                       {
                           "currency": "USDT",
                           "available": cash,
                           "locked": equity - cash,
                           "total": equity,
                           "updateTime": chrono::Utc::now().timestamp_millis()
                       }
                   ]
                });
                if let Ok(payload) = serde_json::to_vec(&response) {
                    client_for_balances
                        .publish(reply_to, payload.into())
                        .await
                        .ok();
                }
            }
        }
    });

    // --- Policy Hash Request Handler (Brain Handshake) ---
    let mut policy_hash_sub = client
        .subscribe(subjects::REQ_POLICY_HASH)
        .await
        .map_err(|e| {
            error!("❌ Failed to subscribe to policy_hash request: {}", e);
            e
        })?;
    let risk_guard_for_policy = risk_guard.clone();
    let client_for_policy = client.clone();

    tokio::spawn(async move {
        info!("👂 Listening for policy hash requests...");
        while let Some(msg) = policy_hash_sub.next().await {
            if let Some(reply_to) = msg.reply {
                let policy_hash = risk_guard_for_policy.get_current_policy_hash();
                let response = serde_json::json!({
                    "policy_hash": policy_hash,
                    "timestamp": chrono::Utc::now().timestamp_millis()
                });
                if let Ok(payload) = serde_json::to_vec(&response) {
                    client_for_policy
                        .publish(reply_to, payload.into())
                        .await
                        .ok();
                }
                info!(
                    "✅ Responded to policy hash request with hash: {}",
                    policy_hash
                );
            }
        }
    });

    // --- Flatten Command Listener ---
    let mut flatten_sub = client
        .subscribe(subjects::CMD_RISK_FLATTEN)
        .await
        .map_err(|e| {
            error!("❌ Failed to subscribe to flatten: {}", e);
            e
        })?;
    let state_for_flatten = shadow_state.clone();
    let router_flatten = router.clone();
    let ctx_flatten = ctx.clone();

    tokio::spawn(async move {
        info!("👂 Listening for risk flatten commands...");
        while let Some(_msg) = flatten_sub.next().await {
            warn!("🚨 RECEIVED FLATTEN COMMAND - CLOSING ALL POSITIONS");
            let positions = state_for_flatten.read().get_all_positions();

            for (symbol, pos) in positions {
                let side_to_close = match pos.side {
                    crate::model::Side::Buy | crate::model::Side::Long => crate::model::Side::Sell,
                    crate::model::Side::Sell | crate::model::Side::Short => crate::model::Side::Buy,
                };

                info!("🚨 Flattening {} ({:?} {})", symbol, pos.side, pos.size);

                // Create strict Market Order
                let order_req = OrderRequest {
                    symbol: symbol.replace("/", ""),
                    side: side_to_close,
                    order_type: crate::model::OrderType::Market,
                    quantity: pos.size,
                    price: None,
                    stop_price: None,
                    client_order_id: format!("flatten-{}", ctx_flatten.id.new_id()),
                    reduce_only: true, // Important: Reduce Only to avoid flipping if async race
                };

                // We create a synthetic intent for the router
                // Wait, router.execute takes &Intent and OrderRequest.
                // We need a dummy intent.
                let dummy_intent = crate::model::Intent {
                    signal_id: "flatten-cmd".to_string(),
                    symbol: symbol.clone(),
                    direction: 0,
                    intent_type: IntentType::Close,
                    entry_zone: vec![],
                    stop_loss: rust_decimal::Decimal::ZERO,
                    take_profits: vec![],
                    size: pos.size,
                    status: crate::model::IntentStatus::Validated,
                    source: Some("RiskFlatten".to_string()),
                    policy_hash: None,
                    t_signal: ctx_flatten.time.now_millis(),
                    t_analysis: None,
                    t_decision: None,
                    t_ingress: None,
                    t_exchange: None,
                    max_slippage_bps: None,
                    rejection_reason: None,
                    regime_state: None,
                    phase: None,
                    metadata: None,
                    exchange: None,
                    // Envelope Standards
                    ttl_ms: Some(5000),
                    partition_key: None,
                    causation_id: None,
                    env: None,
                    subject: None,
                    position_mode: None,
                    child_fills: vec![],
                    filled_size: rust_decimal::Decimal::ZERO,
                };

                // Execute fire-and-forget (log errors)
                let results = router_flatten.execute(&dummy_intent, order_req).await;
                for (ex, _, res) in results {
                    match res {
                        Ok(_) => info!("✅ Flattened {} on {}", symbol, ex),
                        Err(e) => error!("❌ Failed to flatten {} on {}: {}", symbol, ex, e),
                    }
                }
            }
        }
    });

    let mut price_sub = client
        .subscribe(subjects::DATA_MARKET_TICKER_PREFIX)
        .await
        .map_err(|e| {
            error!("❌ Failed to subscribe to market.price: {}", e);
            e
        })?;
    let state_for_valuation = shadow_state.clone();
    let client_for_valuation = client.clone();

    tokio::spawn(async move {
        while let Some(msg) = price_sub.next().await {
            // Subject: market.price.<symbol>
            // Payload: BookTicker (json)
            if let Ok(ticker) =
                serde_json::from_slice::<crate::market_data::types::BookTicker>(&msg.payload)
            {
                let exposure = {
                    let mut state = state_for_valuation.write();
                    state.update_valuation(&ticker);
                    state.calculate_exposure()
                };

                if let Ok(payload) = serde_json::to_vec(&exposure) {
                    if let Err(e) = client_for_valuation
                        .publish("exposure.update", payload.into())
                        .await
                    {
                        error!("Failed to publish exposure update: {}", e);
                    }
                }
            }
        }
    });

    // --- Risk Policy Update Listener ---
    let mut policy_sub = client
        .subscribe(subjects::CMD_RISK_POLICY)
        .await
        .map_err(|e| {
            error!("❌ Failed to subscribe to risk policy updates: {}", e);
            e
        })?;
    let guard_for_policy = risk_guard.clone();

    tokio::spawn(async move {
        info!("👂 Listening for risk policy updates...");
        while let Some(msg) = policy_sub.next().await {
            match serde_json::from_slice::<crate::risk_policy::RiskPolicy>(&msg.payload) {
                Ok(new_policy) => {
                    info!("🛡️ RECV: New Risk Policy. Updating...");
                    guard_for_policy.update_policy(new_policy);
                }
                Err(e) => {
                    error!("❌ Failed to parse risk policy update: {}", e);
                }
            }
        }
    });

    // --- System Heartbeat Listener ---
    let mut limit_sub = client
        .subscribe(subjects::EVT_SYS_HEARTBEAT)
        .await
        .map_err(|e| {
            error!("❌ Failed to subscribe to system.heartbeat: {}", e);
            e
        })?;
    let guard_for_heartbeat = risk_guard.clone();

    tokio::spawn(async move {
        // We only log every 10th heartbeat to reduce noise
        let mut count = 0;
        while let Some(_msg) = limit_sub.next().await {
            guard_for_heartbeat.record_heartbeat();
            count += 1;
            if count % 60 == 0 {
                info!("💓 System Heartbeat Received (x60)");
            }
        }
    });

    // --- Risk State Listener ---
    let mut state_sub = client
        .subscribe(subjects::EVT_RISK_STATE)
        .await
        .map_err(|e| {
            error!("❌ Failed to subscribe to risk state: {}", e);
            e
        })?;
    let guard_for_state = risk_guard.clone();

    tokio::spawn(async move {
        info!("👂 Listening for risk state updates...");
        while let Some(msg) = state_sub.next().await {
            match serde_json::from_slice::<crate::risk_policy::RiskState>(&msg.payload) {
                Ok(new_state) => {
                    guard_for_state.update_risk_state(new_state);
                }
                Err(e) => {
                    error!("❌ Failed to parse risk state update: {}", e);
                }
            }
        }
    });

    // --- Legacy Execution Constraints Listener (REMOVED) ---
    // The legacy "PowerLaw" constraints listener has been removed as part of production hardening.
    // Constraints are now managed via the standard Risk Policy and Configuration.

    // --- JetStream Setup (Manifest 2.0) ---
    let jetstream = async_nats::jetstream::new(client.clone());

    // 1. Ensure TITAN_CMD Stream (WorkQueue for Commands)
    let cmd_stream_name = "TITAN_CMD";
    let cmd_subjects = vec![subjects::CMD_WILDCARD.to_string()];

    let _cmd_stream = match jetstream.get_stream(cmd_stream_name).await {
        Ok(s) => s,
        Err(_) => {
            info!("Creating JetStream Stream: {} (WorkQueue)", cmd_stream_name);
            match jetstream
                .create_stream(async_nats::jetstream::stream::Config {
                    name: cmd_stream_name.to_string(),
                    subjects: cmd_subjects,
                    storage: async_nats::jetstream::stream::StorageType::File,
                    retention: async_nats::jetstream::stream::RetentionPolicy::WorkQueue,
                    max_age: std::time::Duration::from_secs(7 * 24 * 60 * 60), // 7 Days
                    duplicate_window: std::time::Duration::from_secs(60),
                    ..Default::default()
                })
                .await
            {
                Ok(s) => s,
                Err(e) => {
                    error!("❌ Failed to create TITAN_CMD stream: {}", e);
                    return Err(Box::new(e));
                }
            }
        }
    };

    // 2. Ensure TITAN_EVT Stream (Interest for Events)
    let evt_stream_name = "TITAN_EVT";
    let evt_subjects = vec![subjects::EVT_WILDCARD.to_string()];

    let _evt_stream = match jetstream.get_stream(evt_stream_name).await {
        Ok(s) => s,
        Err(_) => {
            info!("Creating JetStream Stream: {} (Interest)", evt_stream_name);
            match jetstream
                .create_stream(async_nats::jetstream::stream::Config {
                    name: evt_stream_name.to_string(),
                    subjects: evt_subjects,
                    storage: async_nats::jetstream::stream::StorageType::File,
                    retention: async_nats::jetstream::stream::RetentionPolicy::Limits, // Interest-like behavior via Limits + Ack
                    max_age: std::time::Duration::from_secs(30 * 24 * 60 * 60),        // 30 Days
                    max_bytes: 10 * 1024 * 1024 * 1024,                                // 10 GB
                    ..Default::default()
                })
                .await
            {
                Ok(s) => s,
                Err(e) => {
                    error!("❌ Failed to create TITAN_EVT stream: {}", e);
                    return Err(Box::new(e));
                }
            }
        }
    };

    // --- NATS Consumer Task (JetStream) ---
    let client_clone = client.clone();
    let client_shadow = client.clone(); // Clone for shadow publisher
    let state_for_nats = shadow_state.clone();
    let ctx_nats = ctx.clone();

    // Create Durable Consumer on TITAN_CMD
    let consumer_name = "EXECUTION_CORE";
    let intent_subject = subjects::CMD_EXEC_WILDCARD;

    // We bind to the stream that captures the subject.
    // Since TITAN_CMD captures titan.cmd.>, we use that stream.
    let consumer = _cmd_stream
        .create_consumer(async_nats::jetstream::consumer::pull::Config {
            durable_name: Some(consumer_name.to_string()),
            filter_subject: intent_subject.to_string(),
            ack_policy: async_nats::jetstream::consumer::AckPolicy::Explicit,
            ack_wait: std::time::Duration::from_secs(30),
            max_deliver: 5,
            ..Default::default()
        })
        .await
        .map_err(|e| {
            error!(
                "❌ Failed to create JetStream consumer '{}': {}",
                consumer_name, e
            );
            e
        })?;

    info!(
        "🚀 JetStream Consumer '{}' listening on '{}'",
        consumer_name, intent_subject
    );

    // Initialize HmacValidator once (reusable and thread-safe logic)
    let hmac_validator = crate::security::HmacValidator::new();

    // Pull messages
    let mut messages = consumer.messages().await.map_err(|e| {
        error!("❌ Failed to get messages stream: {}", e);
        e
    })?;

    // Pre-clone for Risk Consumer (to avoid move into nats_handle)
    let global_halt_risk = global_halt.clone();
    let hmac_validator_risk = hmac_validator.clone();
    let risk_guard_check = risk_guard.clone();

    let nats_handle = tokio::spawn(async move {
        loop {
            tokio::select! {
                Some(msg_result) = messages.next() => {
                    match msg_result {
                        Ok(msg) => {
                            // --- GLOBAL HALT CHECK ---
                            if global_halt.is_halted() {
                                warn!("⛔ Rejecting Intent (System Halted)");
                                if let Err(e) = msg.ack().await {
                                     error!("Failed to ACK rejected intent: {}", e);
                                }
                                continue;
                            }

                            // --- ARMED CHECK (Physical Interlock) ---
                            if !armed_state.is_armed() {
                                warn!("⛔ Rejecting Intent (Execution DISARMED - physical interlock)");

                                // Try to extract ID for telemetry (Best Effort)
                                let intent_id: Option<String> = serde_json::from_slice::<serde_json::Value>(&msg.payload)
                                    .ok()
                                    .and_then(|v| {
                                        // v is owned here. We must extract String before v is dropped.
                                        let id_val = if let Some(p) = v.get("payload") {
                                            p.get("signal_id").or(v.get("signal_id"))
                                        } else {
                                            v.get("signal_id")
                                        };
                                        id_val.and_then(|val| val.as_str().map(|s| s.to_string()))
                                    });

                                publish_rejection_event(
                                    &client_clone,
                                    "system_disarmed",
                                    None,
                                    None,
                                    intent_id.as_deref(),
                                    None,
                                    &ctx_nats,
                                ).await;

                                if let Err(e) = msg.ack().await {
                                     error!("Failed to ACK rejected intent: {}", e);
                                }
                                continue;
                            }

                             // --- PROCESS MESSAGE ---

                            // DUAL READ STRATEGY: Try Generic Value first to detect Envelope
                            let msg_payload_value: Option<serde_json::Value> = serde_json::from_slice(&msg.payload).ok();

                            // Instantiate validator ONCE per consumer is inefficient if inside loop, but here strictly it IS inside loop.
                            // Better: Move validator instantiation outside the loop (done in step 1 of plan, doing it now in code).
                            // Wait, I cannot move it outside the loop easily in this tool call because the start of loop is far above.
                            // Actually, I can just create it here. The overhead of `HmacValidator::new()` is small (env var read).
                            // BUT env var read IS a syscall. I should ideally move it.
                            // However, the `replace_file_content` range is limited.
                            // Let's first Replace this block to enforce strictness, AND use a lazy_static or just accept the env var read for now?
                            // No, I can replace the whole loop structure if I match enough lines.
                            // Or I can accept that I'm fixing the SECURITY hole first.

                            // Let's stick to fixing the logic first.

                            // 1. Attempt Deserialize Envelope
                            let (intent_result, envelope_correlation_id) = if let Some(value) = msg_payload_value {
                                // Check if Envelope (has payload + sig/type)
                                let is_envelope = value.get("payload").is_some() && value.get("type").is_some();
                                if is_envelope {
                                    if let Ok(envelope) = serde_json::from_value::<crate::contracts::IntentEnvelope>(value.clone()) {
                                        if let Err(e) = hmac_validator.validate(&envelope, &value["payload"]) {
                                            error!("⛔ REJECTED Intent (Signature Verify Failed): {}", e);

                                            // Extract ID for telemetry
                                            let intent_id = value.get("payload")
                                                .and_then(|p| p.get("signal_id"))
                                                .and_then(|v| v.as_str());

                                            publish_rejection_event(
                                                &client_clone,
                                                "hmac_signature_mismatch",
                                                None,
                                                None,
                                                intent_id,
                                                None,
                                                &ctx_nats,
                                            ).await;

                                            // ACK to prevent retry loops of bad messages
                                            if let Err(e) = msg.ack().await { error!("Failed to ACK rejected intent: {}", e); }
                                            continue;
                                        }

                                        // 3. Valid Envelope -> Extract Payload
                                        let payload_result = serde_json::to_vec(&envelope.payload)
                                            .map_err(|e| e.to_string())
                                            .and_then(|b| validate_intent_payload(&b));

                                        (payload_result, envelope.correlation_id)
                                    } else {
                                        warn!("Received malformed/incompatible envelope");
                                        (Err("Malformed Envelope".to_string()), None)
                                    }
                                } else {
                                    // STRICT MODE ENFORCED: Reject raw/legacy intents
                                    warn!("⛔ REJECTED Unsigned/Raw Intent (Strict Mode Active)");
                                    (Err("Unsigned intents rejected in strict mode".to_string()), None)
                                }
                            } else {
                                (Err("Invalid JSON".to_string()), None)
                            };

                             match intent_result {
                                Ok(intent) => {
                                    let correlation_id = envelope_correlation_id
                                        .or_else(|| {
                                            intent.metadata
                                                .as_ref()
                                                .and_then(|m| m.get("correlation_id"))
                                                .and_then(|v| v.as_str())
                                                .map(|s| s.to_string())
                                        })
                                        .unwrap_or_else(|| intent.signal_id.clone());

                                    // --- P0: Risk Policy Hash Enforcement ---
                                    if let Some(ref hash) = intent.policy_hash {
                                        let current_hash = risk_guard_check.get_current_policy_hash();
                                        // Simple string comparison for equality
                                        if *hash != current_hash {
                                            error!(
                                                "⛔ REJECTED Intent (Policy Hash Mismatch): Expected {}, Got {}",
                                                current_hash, hash
                                            );
                                            metrics::inc_invalid_intents();
                                            // Publish rejection telemetry event (P0 item 7.4)
                                            publish_rejection_event(
                                                &client_clone,
                                                "policy_hash_mismatch",
                                                Some(&current_hash),
                                                Some(hash),
                                                Some(&intent.signal_id),
                                                Some(&correlation_id),
                                                &ctx_nats,
                                            ).await;
                                            publish_dlq(
                                                &client_clone,
                                                &msg.payload,
                                                &format!("Policy Hash mismatch: exp {} got {}", current_hash, hash),
                                                &ctx_nats
                                            ).await;
                                            if let Err(e) = msg.ack().await {
                                                error!("Failed to ACK rejected intent: {}", e);
                                            }
                                            continue;
                                        }
                                    }

                                    // --- Trace Context Extraction (Phase 4) ---
                                    use opentelemetry::global;
                                    use opentelemetry::propagation::Extractor;
                                    use tracing_opentelemetry::OpenTelemetrySpanExt;

                                    struct HeaderExtractor<'a>(&'a async_nats::HeaderMap);
                                    impl<'a> Extractor for HeaderExtractor<'a> {
                                        fn get(&self, key: &str) -> Option<&str> {
                                            self.0.get(key).map(|v| v.as_str())
                                        }
                                        fn keys(&self) -> Vec<&str> {
                                            self.0.iter().map(|(k, _)| k.as_ref()).collect()
                                        }
                                    }

                                    let parent_cx = if let Some(headers) = &msg.headers {
                                        global::get_text_map_propagator(|propagator| {
                                            propagator.extract(&HeaderExtractor(headers))
                                        })
                                    } else {
                                        opentelemetry::Context::new()
                                    };

                                    let span = tracing::info_span!("execute_intent",
                                        correlation_id = %correlation_id,
                                        signal_id = %intent.signal_id,
                                        symbol = %intent.symbol
                                    );
                                    span.set_parent(parent_cx);
                                    let _guard = span.enter();

                                    info!(
                                        correlation_id = %correlation_id,
                                        signal_id = %intent.signal_id,
                                        symbol = %intent.symbol,
                                        "Intent received"
                                    );

                                    // ACK at end...

                                    // --- EXECUTION PIPELINE ---
                                    metrics::inc_nats_consume(subjects::CMD_EXECUTION_PLACE_PREFIX);
                                    let result = pipeline.process_intent(intent.clone(), correlation_id.clone()).await;

                                    match result {
                                        Ok(pipeline_result) => {
                                            // 1. Shadow Fill
                                            if let Some(shadow_fill) = pipeline_result.shadow_fill {
                                                let subject = format!("{}.{}", subjects::EVT_EXECUTION_SHADOW_FILL, intent.symbol);
                                                if let Ok(payload) = serde_json::to_vec(&shadow_fill) {
                                                    client_shadow.publish(subject, payload.into()).await.ok();
                                                }
                                            }

                                            // 2. Exposure Update
                                            if let Some(exposure) = pipeline_result.exposure {
                                                if let Ok(payload) = serde_json::to_vec(&exposure) {
                                                    if let Err(e) = client_shadow.publish("exposure.update", payload.into()).await {
                                                        error!("Failed to publish exposure update: {}", e);
                                                    }
                                                }
                                            }

                                            // 3. Execution Events
                                            for event in pipeline_result.events {
                                                match event {
                                                    ExecutionEvent::Opened(pos) => info!("Pos Open: {} {}", pos.symbol, pos.size),
                                                    ExecutionEvent::Updated(pos) => info!("Pos Upd: {} {}", pos.symbol, pos.size),
                                                    ExecutionEvent::Closed(trade) => {
                                                        let subject = subjects::EVT_EXECUTION_TRADE_CLOSED;
                                                        // Envelope
                                                        let envelope = serde_json::json!({
                                                            "id": ctx_nats.id.new_id(),
                                                            "type": "titan.event.execution.trade.closed.v1",
                                                            "version": 1,
                                                            "ts": ctx_nats.time.now_millis(),
                                                            "producer": "titan-execution-rs",
                                                            "correlation_id": correlation_id,
                                                            "payload": trade
                                                        });
                                                        if let Ok(payload) = serde_json::to_vec(&envelope) {
                                                            client_clone.publish(subject.to_string(), payload.into()).await.ok();
                                                        }
                                                    },
                                                    ExecutionEvent::FundingPaid(symbol, amount, asset) => {
                                                        let subject = subjects::EVT_EXECUTION_FUNDING;
                                                          let envelope = serde_json::json!({
                                                            "id": ctx_nats.id.new_id(),
                                                            "type": "titan.event.execution.funding.v1",
                                                            "version": 1,
                                                            "ts": ctx_nats.time.now_millis(),
                                                            "producer": "titan-execution-rs",
                                                            "payload": {
                                                                "symbol": symbol,
                                                                "amount": amount,
                                                                "asset": asset
                                                            }
                                                        });
                                                        if let Ok(payload) = serde_json::to_vec(&envelope) {
                                                            client_clone.publish(subject.to_string(), payload.into()).await.ok();
                                                        }
                                                    },

                                                    ExecutionEvent::BalanceUpdated(equity, cash) => {
                                                        let subject = subjects::EVT_EXECUTION_BALANCE;
                                                        // Simple payload
                                                        let payload = serde_json::json!({
                                                            "asset": "USDT",
                                                            "free": cash,
                                                            "total": equity,
                                                            "locked": equity - cash,
                                                            "ts": ctx_nats.time.now_millis()
                                                        });
                                                        if let Ok(bytes) = serde_json::to_vec(&payload) {
                                                            client_clone.publish(subject.to_string(), bytes.into()).await.ok();
                                                        }
                                                    }

                                                }
                                            }

                                            // 4. Fill Reports
                                            for (exchange_name, fill_report) in pipeline_result.fill_reports {
                                                let subject = format!(
                                                    "{}.{}.main.{}",
                                                    subjects::EVT_EXECUTION_FILL,
                                                    exchange_name,
                                                    fill_report.symbol.replace("/", "_")
                                                );

                                                let envelope = serde_json::json!({
                                                    "id": ctx_nats.id.new_id(),
                                                    "type": "titan.event.execution.fill.v1",
                                                    "version": 1,
                                                    "ts": ctx_nats.time.now_millis(),
                                                    "producer": "titan-execution-rs",
                                                    "correlation_id": correlation_id,
                                                    "payload": fill_report
                                                });

                                                if let Ok(payload) = serde_json::to_vec(&envelope) {
                                                    client_clone.publish(subject, payload.into()).await.ok();
                                                }
                                            }

                                            // ACK
                                            if let Err(e) = msg.ack().await {
                                                error!("❌ Failed to ACK message: {}", e);
                                            } else {
                                                info!(correlation_id = %correlation_id, "ACKed intent {}", intent.signal_id);
                                            }

                                            // G4: Drift → Halt Protocol
                                            if pipeline_result.drift_detected {
                                                error!("🚨 DRIFT → HALT: Reconciliation drift detected, activating global halt");
                                                global_halt.set_halt(true, "Reconciliation drift detected");
                                            }
                                        }
                                        Err(reason) => {
                                            error!(
                                                correlation_id = %correlation_id,
                                                signal_id = %intent.signal_id,
                                                "Pipeline Failure: {}",
                                                reason
                                            );
                                            // We publish DLQ inside pipeline? No, inside here.
                                            // But risk rejection was inside pipeline which returned Err.
                                            // And Latency checks too.
                                            publish_dlq(&client_clone, &msg.payload, &reason, &ctx_nats).await;

                                            // Must ACK to prevent redelivery loop if it's a permanent failure
                                            // Logic assumption: If pipeline returned Err, it's rejected/dropped suitable for DLQ.
                                            if let Err(e) = msg.ack().await {
                                                error!("Failed to ACK rejected intent: {}", e);
                                            }
                                        }
                                    }

                                },
                                Err(e) => {
                                    error!("Failed to validate intent: {}", e);
                                    metrics::inc_invalid_intents();
                                    publish_dlq(&client_clone, &msg.payload, &format!("Invalid intent: {}", e), &ctx_nats).await;
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

    // --- Risk Command Consumer (JetStream) ---
    // Separate consumer for Risk Commands (Halt, Override)
    let risk_consumer_name = "RISK_ENFORCER";
    let risk_subject = subjects::CMD_RISK_WILDCARD;

    let risk_consumer = _cmd_stream
        .create_consumer(async_nats::jetstream::consumer::pull::Config {
            durable_name: Some(risk_consumer_name.to_string()),
            filter_subject: risk_subject.to_string(),
            ack_policy: async_nats::jetstream::consumer::AckPolicy::Explicit,
            ack_wait: std::time::Duration::from_secs(30),
            max_deliver: 5,
            ..Default::default()
        })
        .await
        .map_err(|e| {
            error!(
                "❌ Failed to create JetStream consumer '{}': {}",
                risk_consumer_name, e
            );
            e
        })?;

    let global_halt_for_risk = global_halt_risk; // Move into this task
    let hmac_validator_risk_consumer = hmac_validator_risk;
    let _state_for_risk = shadow_state.clone(); // Clone for potential future state injection

    // We must pin the stream before spawning
    // let mut risk_messages = risk_consumer.messages().await?;
    // AsyncNext extraction might accept a mutable reference if it wasn't moved.
    // However, `messages()` returns a Stream.
    let mut risk_messages = risk_consumer.messages().await.map_err(|e| {
        error!("❌ Failed to get risk messages stream: {}", e);
        e
    })?;

    tokio::spawn(async move {
        info!("👮 Risk Enforcer listening on '{}'", risk_subject);
        while let Some(msg_result) = risk_messages.next().await {
            match msg_result {
                Ok(msg) => {
                    // Parse Payload directly
                    if let Ok(value) = serde_json::from_slice::<serde_json::Value>(&msg.payload) {
                        // 1. Validate Signature
                        if let Err(e) = hmac_validator_risk_consumer.validate_risk_command(&value) {
                            error!("⛔ REJECTED Risk Command (Signature Verify Failed): {}", e);
                            // ACK to drain bad commands
                            if let Err(e) = msg.ack().await {
                                error!("Failed to ACK rejected risk cmd: {}", e);
                            }
                            continue;
                        }

                        // 2. Action Dispatch
                        let action = value
                            .get("action")
                            .and_then(|s| s.as_str())
                            .unwrap_or("UNKNOWN");
                        let actor_id = value
                            .get("actor_id")
                            .and_then(|s| s.as_str())
                            .unwrap_or("sys");
                        let reason = value
                            .get("reason")
                            .and_then(|s| s.as_str())
                            .unwrap_or("No reason");

                        match action {
                            "HALT" => {
                                warn!(
                                    "🚨 SOVEREIGN HALT RECEIVED from {} Reason: {}",
                                    actor_id, reason
                                );
                                global_halt_for_risk.set_halt(true, reason);
                            }
                            "OVERRIDE_ALLOCATION" => {
                                let allocation = value.get("allocation");
                                info!(
                                    "⚠️ Manual Override Acknowledged from {}. Reason: {}. Allocation: {:?}",
                                    actor_id, reason, allocation
                                );
                                // Note: We do not strictly inject this into RiskGuard because
                                // pure allocation (weights) is managed by Titan Brain.
                                // Rust Engine enforces 'Max Position Notional' which is a hard safety limit.
                                // If the operator wants to bypass this, they must use a ForceSync intent.
                            }
                            _ => {
                                warn!("Unknown Risk Action: {}", action);
                            }
                        }

                        // 3. ACK
                        if let Err(e) = msg.ack().await {
                            error!("Failed to ACK risk cmd: {}", e);
                        }
                    } else {
                        error!("Malformed Risk Command JSON");
                        if let Err(e) = msg.ack().await {
                            error!("Failed to ACK malformed risk cmd: {}", e);
                        }
                    }
                }
                Err(e) => {
                    error!("Error receiving risk message: {}", e);
                }
            }
        }
    });

    Ok(nats_handle)
}

async fn publish_dlq(
    client: &async_nats::Client,
    payload: &[u8],
    reason: &str,
    ctx: &ExecutionContext,
) {
    let parsed_payload = serde_json::from_slice::<Value>(payload)
        .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(payload).to_string()));

    let dlq_payload = serde_json::json!({
        "reason": reason,
        "payload": parsed_payload,
        "t_ingress": ctx.time.now_millis(),
    });

    if let Ok(bytes) = serde_json::to_vec(&dlq_payload) {
        let _ = client
            .publish(subjects::DLQ_EXECUTION_CORE, bytes.clone().into())
            .await;
        let _ = client
            .publish(subjects::LEGACY_DLQ_EXECUTION, bytes.into())
            .await;
        metrics::inc_dlq_published();
    }
}

/// Publish rejection telemetry event for observability and alerting
/// Subject: titan.evt.execution.reject.v1
async fn publish_rejection_event(
    client: &async_nats::Client,
    reason: &str,
    expected_hash: Option<&str>,
    got_hash: Option<&str>,
    intent_id: Option<&str>,
    brain_instance_id: Option<&str>,
    ctx: &ExecutionContext,
) {
    let event_payload = serde_json::json!({
        "reason": reason,
        "expected_policy_hash": expected_hash.unwrap_or("N/A"),
        "got_policy_hash": got_hash.unwrap_or("N/A"),
        "intent_id": intent_id.unwrap_or("N/A"),
        "brain_instance_id": brain_instance_id.unwrap_or("N/A"),
        "timestamp": ctx.time.now_millis(),
        "event_type": "execution.intent.rejected",
    });

    if let Ok(bytes) = serde_json::to_vec(&event_payload) {
        let _ = client
            .publish(subjects::EVT_EXECUTION_REJECT, bytes.into())
            .await;
        metrics::inc_rejection_events();
    }
}
