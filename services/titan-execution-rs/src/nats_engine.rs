use tracing::{info, error, warn};
use futures::StreamExt;
use std::sync::Arc;
use parking_lot::RwLock;
use serde_json::Value;
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use chrono::Utc;

use crate::shadow_state::{ShadowState, ExecutionEvent};
use crate::order_manager::OrderManager;
use crate::model::{Intent, IntentType, FillReport, Side};
use crate::exchange::adapter::OrderRequest;
use crate::exchange::router::ExecutionRouter;
use crate::simulation_engine::SimulationEngine;
use crate::circuit_breaker::GlobalHalt;
use crate::intent_validation::validate_intent_payload;
use crate::metrics;
use crate::risk_guard::RiskGuard;

/// Start the NATS Engine (Consumer Loop and Halt Listener)
/// Returns a handle to the consumer task
pub async fn start_nats_engine(
    client: async_nats::Client,
    shadow_state: Arc<RwLock<ShadowState>>,
    order_manager: OrderManager,
    router: Arc<ExecutionRouter>,
    simulation_engine: Arc<SimulationEngine>,
    global_halt: Arc<GlobalHalt>,
    risk_guard: Arc<RiskGuard>,
) -> Result<tokio::task::JoinHandle<()>, Box<dyn std::error::Error + Send + Sync>> {
    
    // --- System Halt Listener (Core NATS) ---
    // Listen for urgent kill signals. Payload: { "active": true, "reason": "Manually triggered" }
    let mut halt_sub = client.subscribe("system.halt").await.map_err(|e| {
         error!("❌ Failed to subscribe to system.halt: {}", e);
         e
    })?;
    let halt_state_clone = global_halt.clone();
    
    tokio::spawn(async move {
        info!("👂 Listening for system.halt signals...");
        while let Some(msg) = halt_sub.next().await {
            if let Ok(v) = serde_json::from_slice::<Value>(&msg.payload) {
                let active = v.get("active").and_then(|b| b.as_bool()).unwrap_or(false);
                let reason = v.get("reason").and_then(|s| s.as_str()).unwrap_or("Unknown");
                halt_state_clone.set_halt(active, reason);
            } else {
                warn!("Received malformed system.halt payload");
            }
        }
    });

    // --- Get Positions Request-Reply Handler ---
    let mut positions_sub = client.subscribe("titan.execution.get_positions.>").await.map_err(|e| {
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
                    },
                    Err(e) => {
                        error!("❌ Failed to fetch positions from {}: {}", exchange, e);
                         serde_json::json!({
                            "positions": [],
                            "error": e.to_string()
                        })
                    }
                };

                if let Ok(payload) = serde_json::to_vec(&response) {
                    client_for_query.publish(reply_to, payload.into()).await.ok();
                }
            }
        }
    });

    // --- Get Balances Stub ---
    let mut balances_sub = client.subscribe("titan.execution.get_balances.>").await.map_err(|e| {
         error!("❌ Failed to subscribe to get_balances: {}", e);
         e
    })?;
    let client_for_balances = client.clone();
    
    tokio::spawn(async move {
        while let Some(msg) = balances_sub.next().await {
            if let Some(reply_to) = msg.reply {
                 // Mock response
                 let response = serde_json::json!({
                    "balances": []
                 });
                 if let Ok(payload) = serde_json::to_vec(&response) {
                    client_for_balances.publish(reply_to, payload.into()).await.ok();
                }
            }
        }
    });

    // --- Flatten Command Listener ---
    let mut flatten_sub = client.subscribe("titan.cmd.risk.flatten").await.map_err(|e| {
         error!("❌ Failed to subscribe to flatten: {}", e);
         e
    })?;
    let state_for_flatten = shadow_state.clone();
    let router_flatten = router.clone();
    
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
                    client_order_id: format!("flatten-{}", uuid::Uuid::new_v4()),
                    reduce_only: true, // Important: Reduce Only to avoid flipping if async race
                };
                
                // We mock an intent for the router (Router requires intent for logging/metadata usually? 
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
                    t_signal: Utc::now().timestamp_millis(),
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
                    position_mode: None,
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

    // --- Market Price Subscription (Valuation) ---
    let mut price_sub = client.subscribe("market.price.>").await.map_err(|e| {
        error!("❌ Failed to subscribe to market.price: {}", e);
        e
    })?;
    let state_for_valuation = shadow_state.clone();
    let client_for_valuation = client.clone();
    
    tokio::spawn(async move {
        while let Some(msg) = price_sub.next().await {
            // Subject: market.price.<symbol>
            // Payload: BookTicker (json)
            if let Ok(ticker) = serde_json::from_slice::<crate::market_data::types::BookTicker>(&msg.payload) {
                let exposure = {
                    let mut state = state_for_valuation.write();
                    state.update_valuation(&ticker);
                    state.calculate_exposure()
                };

                if let Ok(payload) = serde_json::to_vec(&exposure) {
                    if let Err(e) = client_for_valuation.publish("exposure.update", payload.into()).await {
                        error!("Failed to publish exposure update: {}", e);
                    }
                }
            }
        }
    });

    // --- Risk Policy Update Listener ---
    let mut policy_sub = client.subscribe("titan.cmd.risk.policy").await.map_err(|e| {
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
                },
                Err(e) => {
                    error!("❌ Failed to parse risk policy update: {}", e);
                }
            }
        }
    });

    // --- System Heartbeat Listener ---
    let mut limit_sub = client.subscribe("titan.evt.system.heartbeat").await.map_err(|e| {
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
    let mut state_sub = client.subscribe("titan.evt.risk.state").await.map_err(|e| {
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
                },
                Err(e) => {
                    error!("❌ Failed to parse risk state update: {}", e);
                }
            }
        }
    });



    // --- JetStream Setup (Manifest 2.0) ---
    let jetstream = async_nats::jetstream::new(client.clone());
    
    // 1. Ensure TITAN_CMD Stream (WorkQueue for Commands)
    let cmd_stream_name = "TITAN_CMD";
    let cmd_subjects = vec!["titan.cmd.>".to_string()];
    
    let _cmd_stream = match jetstream.get_stream(cmd_stream_name).await {
        Ok(s) => s,
        Err(_) => {
            info!("Creating JetStream Stream: {} (WorkQueue)", cmd_stream_name);
            match jetstream.create_stream(async_nats::jetstream::stream::Config {
                name: cmd_stream_name.to_string(),
                subjects: cmd_subjects,
                storage: async_nats::jetstream::stream::StorageType::File,
                retention: async_nats::jetstream::stream::RetentionPolicy::WorkQueue,
                max_age: std::time::Duration::from_secs(7 * 24 * 60 * 60), // 7 Days
                duplicate_window: std::time::Duration::from_secs(60),
                ..Default::default()
            }).await {
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
    let evt_subjects = vec!["titan.evt.>".to_string()];
    
    let _evt_stream = match jetstream.get_stream(evt_stream_name).await {
        Ok(s) => s,
        Err(_) => {
            info!("Creating JetStream Stream: {} (Interest)", evt_stream_name);
            match jetstream.create_stream(async_nats::jetstream::stream::Config {
                name: evt_stream_name.to_string(),
                subjects: evt_subjects,
                storage: async_nats::jetstream::stream::StorageType::File,
                retention: async_nats::jetstream::stream::RetentionPolicy::Limits, // Interest-like behavior via Limits + Ack
                max_age: std::time::Duration::from_secs(30 * 24 * 60 * 60), // 30 Days
                max_bytes: 10 * 1024 * 1024 * 1024, // 10 GB
                ..Default::default()
            }).await {
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
    let router_nats = router.clone();

    let sim_engine_nats = simulation_engine.clone();
    let guard_for_execution = risk_guard.clone();

    // Create Durable Consumer on TITAN_CMD
    let consumer_name = "EXECUTION_CORE";
    let intent_subject = "titan.cmd.exec.>";
    
    // We bind to the stream that captures the subject. 
    // Since TITAN_CMD captures titan.cmd.>, we use that stream.
    let consumer = _cmd_stream.create_consumer(async_nats::jetstream::consumer::pull::Config {
        durable_name: Some(consumer_name.to_string()),
        filter_subject: intent_subject.to_string(),
        ack_policy: async_nats::jetstream::consumer::AckPolicy::Explicit,
        ack_wait: std::time::Duration::from_secs(30),
        max_deliver: 5,
        ..Default::default()
    }).await.map_err(|e| {
        error!("❌ Failed to create JetStream consumer '{}': {}", consumer_name, e);
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
                            // --- GLOBAL HALT CHECK ---
                            if global_halt.is_halted() {
                                warn!("⛔ Rejecting Intent (System Halted)");
                                if let Err(e) = msg.ack().await {
                                     error!("Failed to ACK rejected intent: {}", e);
                                }
                                continue;
                            }

                             // --- PROCESS MESSAGE ---
                             
                             // DUAL READ STRATEGY: Try Envelope first, then fallback to raw
                             let (intent_result, envelope_correlation_id) = 
                                 if let Ok(envelope) = serde_json::from_slice::<crate::contracts::IntentEnvelope>(&msg.payload) {
                                     // 1. Valid Envelope
                                     // We need to validate the payload inside.
                                     // For simplicity and reusing existing validation logic, we re-serialize the payload.
                                     // In a more optimized version, we would map contracts::Payload -> model::Intent directly.
                                     let payload_result = serde_json::to_vec(&envelope.payload)
                                         .map_err(|e| e.to_string())
                                         .and_then(|b| validate_intent_payload(&b));
                                     
                                     (payload_result, envelope.correlation_id)
                                 } else {
                                     // 2. Fallback: Raw Payload
                                     (validate_intent_payload(&msg.payload), None)
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

                                    info!(
                                        correlation_id = %correlation_id,
                                        signal_id = %intent.signal_id,
                                        symbol = %intent.symbol,
                                        "Intent received"
                                    );
                                    
                                    // ACK at end...

                                    // --- RISK GUARD CHECK ---
                                    if let Err(reason) = risk_guard.check_pre_trade(&intent) {
                                         error!(
                                             correlation_id = %correlation_id, 
                                             signal_id = %intent.signal_id, 
                                             "❌ RISK REJECTION: {}", 
                                             reason
                                         );
                                         metrics::inc_risk_rejections();
                                         publish_dlq(&client_clone, &msg.payload, &format!("Risk Reject: {}", reason)).await;
                                         
                                         // We drop the intent here.
                                         // We MUST ACK so it doesn't redeliver forever.
                                         if let Err(e) = msg.ack().await {
                                             error!("Failed to ACK rejected intent: {}", e);
                                         }
                                         continue;
                                    }

                                    // Lock state for writing
                                    let processed_intent = {
                                        let mut state = state_for_nats.write();
                                        state.process_intent(intent.clone())
                                    };

                                    // Enforce Timestamp Freshness (5000ms window)
                                    let now = Utc::now().timestamp_millis();
                                    if now - processed_intent.t_signal > 5000 {
                                        error!("❌ Intent EXPIRED: {} ms latency. Dropping.", now - processed_intent.t_signal);
                                        metrics::inc_expired_intents();
                                        {
                                            let mut state = state_for_nats.write();
                                            state.expire_intent(
                                                &processed_intent.signal_id,
                                                format!("Latency {} ms", now - processed_intent.t_signal),
                                            );
                                        }
                                        publish_dlq(&client_clone, &msg.payload, "Intent expired").await;
                                        if let Err(e) = msg.ack().await {
                                             error!("Failed to ACK expired msg: {}", e);
                                        }
                                        continue;
                                    }

                                    // --- SHADOW EXECUTION (Concurrent) ---
                                    if let Some(shadow_fill) = sim_engine_nats.simulate_execution(&processed_intent) {
                                        let subject = format!("titan.execution.shadow_fill.{}", processed_intent.symbol);
                                        if let Ok(payload) = serde_json::to_vec(&shadow_fill) {
                                            client_shadow.publish(subject, payload.into()).await.ok();
                                        }
                                    }
                                    
                                    let side = infer_side(&processed_intent);

                                    // Order Manager Decision
                                    let decision = {
                                        let order_params = crate::model::OrderParams {
                                            signal_id: processed_intent.signal_id.clone(),
                                            symbol: processed_intent.symbol.clone(),
                                            side: side.clone(),
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

                                    let order_req = OrderRequest {
                                        symbol: processed_intent.symbol.replace("/", ""), 
                                        side: side.clone(),
                                        order_type: decision.order_type.clone(),
                                        quantity: processed_intent.size,
                                        price: decision.limit_price,
                                        stop_price: None,
                                        client_order_id: format!("{}-{}", processed_intent.signal_id, uuid::Uuid::new_v4()),
                                        reduce_only: decision.reduce_only,
                                    };
                                    
                                    info!(
                                        correlation_id = %correlation_id,
                                        "🚀 Executing Real Order: {:?} {} @ {:?}",
                                        order_req.side,
                                        order_req.symbol,
                                        order_req.price
                                    );

                                    let results = router_nats.execute(&processed_intent, order_req.clone()).await;
                                    
                                    for (exchange_name, request, result) in results {
                                        match result {
                                            Ok(response) => {
                                                info!(
                                                    correlation_id = %correlation_id,
                                                    "✅ [{}] Order Placed: ID {}",
                                                    exchange_name,
                                                    response.order_id
                                                );
                                                
                                                let fill_price = response.avg_price.unwrap_or(decision.limit_price.unwrap_or_default());

                                                // --- SLIPPAGE CHECK (Circuit Breaker) ---
                                                let expected_price = decision.limit_price.or(processed_intent.entry_zone.first().cloned()).unwrap_or(Decimal::ZERO);
                                                if expected_price > Decimal::ZERO && fill_price > Decimal::ZERO {
                                                    let diff = (fill_price - expected_price).abs();
                                                    let slippage_ratio = diff / expected_price;
                                                    let slippage_bps = (slippage_ratio * rust_decimal::Decimal::from(10000)).to_u32().unwrap_or(0);
                                                    
                                                    if slippage_bps > 0 {
                                                        guard_for_execution.record_slippage(slippage_bps);
                                                    }
                                                }

                                                if response.executed_qty <= Decimal::ZERO || fill_price <= Decimal::ZERO {
                                                    warn!(
                                                        correlation_id = %correlation_id,
                                                        executed_qty = %response.executed_qty,
                                                        fill_price = %fill_price,
                                                        "Skipping zero/invalid fill report"
                                                    );
                                                    continue;
                                                }
                                                
                                                let (events_to_publish, exposure) = {
                                                    let mut state = state_for_nats.write();
                                                    let events = state.confirm_execution(
                                                        &processed_intent.signal_id, 
                                                        fill_price, 
                                                        response.executed_qty, 
                                                        true,
                                                        response.fee.unwrap_or(Decimal::ZERO),
                                                        response.fee_asset.unwrap_or("USDT".to_string())
                                                    );
                                                    let exposure = state.calculate_exposure();
                                                    (events, exposure)
                                                };

                                                // Publish Exposure Update
                                                if let Ok(payload) = serde_json::to_vec(&exposure) {
                                                    if let Err(e) = client.publish("exposure.update", payload.into()).await {
                                                        error!("Failed to publish exposure update: {}", e);
                                                    }
                                                }

                                                for event in events_to_publish {
                                                    match event {
                                                        ExecutionEvent::Opened(pos) => info!("Pos Open: {} {}", pos.symbol, pos.size),
                                                        ExecutionEvent::Updated(pos) => info!("Pos Upd: {} {}", pos.symbol, pos.size),
                                                        ExecutionEvent::Closed(trade) => {
                                                            let subject = "titan.evt.exec.trade.closed";
                                                            let envelope = serde_json::json!({
                                                                "id": uuid::Uuid::new_v4().to_string(),
                                                                "type": "titan.event.execution.trade.closed.v1",
                                                                "version": 1,
                                                                "ts": Utc::now().timestamp_millis(),
                                                                "producer": "titan-execution-rs",
                                                                "correlation_id": correlation_id, // Link to original intent
                                                                "payload": trade
                                                            });

                                                            if let Ok(payload) = serde_json::to_vec(&envelope) {
                                                                client_clone.publish(subject.to_string(), payload.into()).await.ok();
                                                            }
                                                        },

                                                        ExecutionEvent::FundingPaid(symbol, amount, asset) => {
                                                            let subject = "titan.evt.exec.funding";
                                                            let envelope = serde_json::json!({
                                                                "id": uuid::Uuid::new_v4().to_string(),
                                                                "type": "titan.event.execution.funding.v1",
                                                                "version": 1,
                                                                "ts": Utc::now().timestamp_millis(),
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
                                                        }
                                                    }
                                                }

                                                {
                                                    let mut state = state_for_nats.write();
                                                    state.record_child_order(
                                                        &processed_intent.signal_id,
                                                        exchange_name.clone(),
                                                        request.client_order_id.clone(),
                                                        response.order_id.clone(),
                                                        request.quantity,
                                                    );
                                                }

                                                let fill_report = FillReport {
                                                    fill_id: response.order_id.clone(),
                                                    signal_id: processed_intent.signal_id.clone(),
                                                    symbol: processed_intent.symbol.clone(),
                                                    side: order_req.side.clone(),
                                                    price: fill_price,
                                                    qty: response.executed_qty,
                                                    fee: Decimal::ZERO,
                                                    fee_currency: "USDT".to_string(),
                                                    t_signal: processed_intent.t_signal,
                                                    t_ingress: processed_intent.t_ingress.unwrap_or(Utc::now().timestamp_millis()),
                                                    t_decision,
                                                    t_ack: response.t_ack,
                                                    t_exchange: response.t_exchange.unwrap_or(Utc::now().timestamp_millis()),
                                                    client_order_id: request.client_order_id.clone(),
                                                    execution_id: response.order_id.clone(),
                                                };

                                                let subject = format!(
                                                    "titan.evt.exec.fill.v1.{}.main.{}",
                                                    exchange_name,
                                                    processed_intent.symbol.replace("/", "_")
                                                );
                                                
                                                let envelope = serde_json::json!({
                                                    "id": uuid::Uuid::new_v4().to_string(),
                                                    "type": "titan.event.execution.fill.v1",
                                                    "version": 1,
                                                    "ts": Utc::now().timestamp_millis(),
                                                    "producer": "titan-execution-rs",
                                                    "correlation_id": correlation_id,
                                                    "payload": fill_report
                                                });

                                                if let Ok(payload) = serde_json::to_vec(&envelope) {
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
                                        info!(correlation_id = %correlation_id, "ACKed intent {}", processed_intent.signal_id);
                                    }

                                },
                                Err(e) => {
                                    error!("Failed to validate intent: {}", e);
                                    metrics::inc_invalid_intents();
                                    publish_dlq(&client_clone, &msg.payload, &format!("Invalid intent: {}", e)).await;
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

    Ok(nats_handle)
}

fn infer_side(intent: &Intent) -> Side {
    match intent.intent_type {
        IntentType::BuySetup => Side::Buy,
        IntentType::SellSetup => Side::Sell,
        IntentType::CloseLong => Side::Sell,
        IntentType::CloseShort => Side::Buy,
        IntentType::Close => {
            if intent.direction < 0 {
                Side::Buy
            } else {
                Side::Sell
            }
        }
    }
}

async fn publish_dlq(client: &async_nats::Client, payload: &[u8], reason: &str) {
    let parsed_payload = serde_json::from_slice::<Value>(payload).unwrap_or_else(|_| {
        Value::String(String::from_utf8_lossy(payload).to_string())
    });

    let dlq_payload = serde_json::json!({
        "reason": reason,
        "payload": parsed_payload,
        "t_ingress": Utc::now().timestamp_millis(),
    });

    if let Ok(bytes) = serde_json::to_vec(&dlq_payload) {
        let _ = client.publish("titan.dlq.execution.core", bytes.clone().into()).await;
        let _ = client.publish("titan.execution.dlq", bytes.into()).await;
        metrics::inc_dlq_published();
    }
}

#[cfg(test)]
mod tests {
    use super::infer_side;
    use crate::model::{Intent, IntentStatus, IntentType, Side};
    use chrono::Utc;
    use rust_decimal_macros::dec;

    fn base_intent(intent_type: IntentType, direction: i32) -> Intent {
        Intent {
            signal_id: "sig-test".to_string(),
            source: Some("test".to_string()),
            symbol: "BTC/USD".to_string(),
            direction,
            intent_type,
            entry_zone: vec![dec!(1.0)],
            stop_loss: dec!(0),
            take_profits: vec![],
            size: dec!(1.0),
            status: IntentStatus::Pending,
            t_signal: Utc::now().timestamp_millis(),
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
            position_mode: None,
        }
    }

    #[test]
    fn test_infer_side_from_intent_type() {
        assert_eq!(infer_side(&base_intent(IntentType::BuySetup, 1)), Side::Buy);
        assert_eq!(infer_side(&base_intent(IntentType::SellSetup, -1)), Side::Sell);
        assert_eq!(infer_side(&base_intent(IntentType::CloseLong, -1)), Side::Sell);
        assert_eq!(infer_side(&base_intent(IntentType::CloseShort, 1)), Side::Buy);
    }
}
