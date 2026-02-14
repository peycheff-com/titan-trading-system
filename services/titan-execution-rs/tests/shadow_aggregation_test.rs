use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use std::sync::Arc;
use titan_execution_rs::context::ExecutionContext;
use titan_execution_rs::model::{Intent, IntentStatus, IntentType};
use titan_execution_rs::persistence::redb_store::RedbStore;
use titan_execution_rs::persistence::store::PersistenceStore;
use titan_execution_rs::persistence::wal::WalManager;
use titan_execution_rs::shadow_state::ShadowState;

fn create_test_persistence() -> (Arc<PersistenceStore>, String) {
    let path = format!("/tmp/test_agg_{}.redb", uuid::Uuid::new_v4());
    let redb = Arc::new(RedbStore::new(&path).expect("Failed to create RedbStore"));
    let wal = Arc::new(WalManager::new(redb.clone()));
    let store = Arc::new(PersistenceStore::new(redb, wal));
    (store, path)
}

fn create_test_intent(id: &str, size: Decimal) -> Intent {
    Intent {
        signal_id: id.to_string(),
        source: Some("test".to_string()),
        symbol: "BTC/USDT".to_string(),
        direction: 1,
        intent_type: IntentType::BuySetup,
        entry_zone: vec![dec!(50000)],
        stop_loss: dec!(49000),
        take_profits: vec![dec!(55000)],
        size,
        status: IntentStatus::Pending,
        t_signal: 1000,
        t_analysis: None,
        t_decision: None,
        t_ingress: None,
        t_exchange: None,
        // Envelope
        ttl_ms: None,
        partition_key: None,
        causation_id: None,
        env: None,
        subject: None,
        max_slippage_bps: None,
        rejection_reason: None,
        regime_state: None,
        phase: None,
        metadata: None,
        exchange: None,
        position_mode: None,
        child_fills: vec![],
        filled_size: dec!(0),
        policy_hash: None,
    }
}

#[test]
fn test_aggregation_partial_fill() {
    let ctx = Arc::new(ExecutionContext::new_system());

    let (persistence, path) = create_test_persistence();

    let mut state = ShadowState::new(persistence, ctx.clone(), Some(10000.0));

    let intent = create_test_intent("sig-1", dec!(1.0));
    state.process_intent(intent);

    // Record child orders first (simulating Pipeline)
    state.record_child_order(
        "sig-1",
        "BINANCE".to_string(),
        "client-1".to_string(),
        "fill-1".to_string(),
        dec!(0.4),
    );
    state.record_child_order(
        "sig-1",
        "BYBIT".to_string(),
        "client-2".to_string(),
        "fill-2".to_string(),
        dec!(0.6),
    );

    // 1. Partial Fill (0.4) on BINANCE
    let events = state.confirm_execution(
        "sig-1",
        "fill-1",
        dec!(50000),
        dec!(0.4),
        true,
        dec!(1.0),
        "USDT".to_string(),
        "BINANCE",
    );

    assert!(!events.is_empty(), "Should emit Open event");

    // Verify Child Status
    let children = state
        .get_child_orders("sig-1")
        .expect("Children should exist");
    let child_1 = children
        .iter()
        .find(|c| c.execution_order_id == "fill-1")
        .unwrap();
    assert_eq!(child_1.status, "FILLED"); // Or FILLED logic depending on EXACT match of size
                                          // In my logic: if fill_size < child.size -> PARTIALLY_FILLED.
                                          // Here record_child_order size is 0.4, fill_size is 0.4. So FILLED.

    // 2. Duplicate Fill (Idempotency)
    let events_dup = state.confirm_execution(
        "sig-1",
        "fill-1", // Same ID
        dec!(50000),
        dec!(0.4),
        true,
        dec!(0),
        "USDT".to_string(),
        "BINANCE",
    );
    assert!(events_dup.is_empty(), "Duplicate fill should be ignored");

    // 3. Complete Fill (0.6) on BYBIT
    let events_final = state.confirm_execution(
        "sig-1",
        "fill-2",
        dec!(50000),
        dec!(0.6),
        true,
        dec!(1.0),
        "USDT".to_string(),
        "BYBIT",
    );
    assert!(!events_final.is_empty(), "Should emit Update event");

    // Verify Child 2 Status
    let children = state.get_child_orders("sig-1").unwrap();
    let child_2 = children
        .iter()
        .find(|c| c.execution_order_id == "fill-2")
        .unwrap();
    assert_eq!(child_2.status, "FILLED");

    // 4. Verify Intent Removed (Executed)
    // Try to fill again -> should warn "Intent not found" and return empty
    let events_gone = state.confirm_execution(
        "sig-1",
        "fill-3",
        dec!(50000),
        dec!(0.1),
        true,
        dec!(0),
        "USDT".to_string(),
        "BYBIT",
    );
    assert!(
        events_gone.is_empty(),
        "Intent should be gone after execution"
    );

    // Verify Position Size
    let pos = state
        .get_position("BTC/USDT")
        .expect("Position should exist");
    // Tolerance for floating point (Decimal matches exactly usually)
    assert_eq!(pos.size, dec!(1.0));

    // Cleanup
    let _ = std::fs::remove_file(path);
}

#[test]
fn test_aggregation_time_budget() {
    let ctx = Arc::new(ExecutionContext::new_system());
    let (persistence, path) = create_test_persistence();
    let mut state = ShadowState::new(persistence, ctx.clone(), Some(10000.0));

    let mut intent = create_test_intent("sig-timeout", dec!(1.0));
    // Manually setting t_ingress to trigger timeout.
    intent.t_ingress = Some(ctx.time.now_millis() - 10000);

    state.process_intent(intent);

    // 1. Fill arrives late
    let events = state.confirm_execution(
        "sig-timeout",
        "fill-late",
        dec!(50000),
        dec!(0.1),
        true,
        dec!(0),
        "USDT".to_string(),
        "BINANCE",
    );

    // Should process the fill (Open position 0.1)
    assert!(!events.is_empty());

    // BUT should mark Intent as PartiallyCompleted (Terminal) and remove it.

    // 2. Try another fill -> Should fail (Intent gone)
    let events_gone = state.confirm_execution(
        "sig-timeout",
        "fill-late-2",
        dec!(50000),
        dec!(0.1),
        true,
        dec!(0),
        "USDT".to_string(),
        "BINANCE",
    );
    assert!(
        events_gone.is_empty(),
        "Intent should be removed due to timeout"
    );

    let pos = state.get_position("BTC/USDT").unwrap();
    assert_eq!(
        pos.size,
        dec!(0.1),
        "Position should only have the allowed fill"
    );

    // Cleanup
    let _ = std::fs::remove_file(path);
}
