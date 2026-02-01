use rust_decimal_macros::dec;
use std::sync::Arc;
use titan_execution_rs::context::ExecutionContext;
use titan_execution_rs::model::{Intent, IntentType, Side};
use titan_execution_rs::persistence::redb_store::RedbStore;
use titan_execution_rs::persistence::store::PersistenceStore;
use titan_execution_rs::persistence::wal::WalManager;
use titan_execution_rs::shadow_state::ShadowState;

fn create_test_intent(signal_id: &str) -> Intent {
    Intent {
        signal_id: signal_id.to_string(),
        symbol: "BTC/USDT".to_string(),
        direction: 1,
        intent_type: IntentType::BuySetup,
        entry_zone: vec![dec!(50000.0)],
        stop_loss: dec!(49000.0),
        take_profits: vec![dec!(52000.0)],
        size: dec!(0.1),
        status: titan_execution_rs::model::IntentStatus::Pending,
        source: Some("recovery_test".to_string()),
        t_signal: chrono::Utc::now().timestamp_millis(),
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
fn test_state_recovery() {
    let db_path = format!("/tmp/recovery_test_{}.redb", uuid::Uuid::new_v4());

    // 1. Start Engine A, Open Position & Close Half (Create History)
    {
        println!("🚀 [Engine A] Starting...");
        let redb = Arc::new(RedbStore::new(&db_path).unwrap());
        let wal = Arc::new(WalManager::new(redb.clone()));

        let persistence = Arc::new(PersistenceStore::new(redb, wal));
        let ctx = Arc::new(ExecutionContext::new_system());
        let mut state = ShadowState::new(persistence, ctx, Some(10000.0));

        // A. Open Position
        let intent = create_test_intent("sig-1");
        state.process_intent(intent.clone());

        // Confirm execution (creates position)
        let _events = state.confirm_execution(
            "sig-1",
            "child-1",
            dec!(50000.0),
            dec!(0.1),
            true,
            dec!(0),
            "USDT".to_string(),
            "MOCK",
        );

        // B. Partial Close (Create Trade History)
        let close_intent = Intent {
            signal_id: "sig-close-1".to_string(),
            symbol: "BTC/USDT".to_string(),
            direction: -1,
            intent_type: IntentType::Close,
            entry_zone: vec![],
            stop_loss: dec!(0),
            take_profits: vec![],
            size: dec!(0.05),
            status: titan_execution_rs::model::IntentStatus::Pending,
            source: Some("recovery_test".to_string()),
            t_signal: chrono::Utc::now().timestamp_millis(),
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
        };
        state.process_intent(close_intent);
        state.confirm_execution(
            "sig-close-1",
            "child-close-1",
            dec!(51000.0), // Profit taking
            dec!(0.05),
            true,
            dec!(0),
            "USDT".to_string(),
            "MOCK",
        );

        // Verify state A
        let pos = state.get_position("BTC/USDT").unwrap();
        assert_eq!(pos.size, dec!(0.05));
        let history = state.get_trade_history();
        assert_eq!(history.len(), 1);
        println!("✅ [Engine A] State initialized: Pos Size 0.05, Trades 1");
    }

    // Drop Persistence and ShadowState (simulate shutdown)
    println!("🛑 [System Crash/Restart] Simulating...");

    // 2. Start Engine B (Recovery)
    {
        println!("🚀 [Engine B] Restarting from DB: {}", db_path);
        let redb = Arc::new(RedbStore::new(&db_path).unwrap());
        let wal = Arc::new(WalManager::new(redb.clone()));
        let persistence = Arc::new(PersistenceStore::new(redb, wal));

        let ctx = Arc::new(ExecutionContext::new_system());
        let state = ShadowState::new(persistence, ctx, Some(10000.0));

        // Verify Position Persisted
        let pos = state.get_position("BTC/USDT");
        assert!(pos.is_some(), "Position should recover from DB");
        let pos = pos.unwrap();
        assert_eq!(pos.size, dec!(0.05), "Position size should be preserved");
        assert_eq!(pos.entry_price, dec!(50000.0), "Entry price preserved");

        // Verify Trade History Persisted
        // Verify Trade History Persisted
        let history = state.get_trade_history();
        assert_eq!(history.len(), 1, "Trade history should recover");
        // Attribution tracks the OPENING signal_id
        assert_eq!(history[0].signal_id, "sig-1");
        assert_eq!(
            history[0].pnl,
            dec!(50.0),
            "PnL should be correct (1000 * 0.05)"
        );

        // Explicitly check Side to use the import
        assert_eq!(pos.side, Side::Long);

        println!("✅ Recovery Successful: Position & History Intact");
    }

    // Cleanup
    let _ = std::fs::remove_file(db_path);
}
