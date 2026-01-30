#[cfg(test)]
mod tests {
    use crate::circuit_breaker::GlobalHalt;
    use crate::context::ExecutionContext;
    use crate::exchange::adapter::OrderRequest;
    use crate::exchange::binance::build_order_params;
    use crate::exchange::bybit::build_order_payload;
    use crate::exchange::mexc::mexc_side_code;
    use crate::market_data::engine::MarketDataEngine;
    use crate::market_data::types::BookTicker;
    use crate::model::{Intent, IntentStatus, IntentType, OrderParams, OrderType, Side};
    use crate::order_manager::{OrderManager, OrderManagerConfig, TakerAction};
    use crate::persistence::redb_store::RedbStore;
    use crate::persistence::store::PersistenceStore;
    use crate::persistence::wal::WalManager;
    use crate::shadow_state::ShadowState;
    use chrono::Utc;
    use rust_decimal_macros::dec;
    use std::fs;
    use std::sync::Arc;

    fn create_test_persistence() -> (Arc<PersistenceStore>, String) {
        let _path = format!("/tmp/test_db_{}.redb", uuid::Uuid::new_v4());
        let redb = Arc::new(RedbStore::new(&_path).expect("Failed to create RedbStore"));
        let wal = Arc::new(WalManager::new(redb.clone()));
        let store = Arc::new(PersistenceStore::new(redb, wal));
        (store, _path)
    }

    #[test]
    fn test_fee_analysis_maker_profitable() {
        let config = OrderManagerConfig::default();
        let md = Arc::new(MarketDataEngine::new(None));
        let halt = Arc::new(GlobalHalt::new());
        let om = OrderManager::new(Some(config), md, halt);

        // Expected profit 1.0%
        // Maker fee 0.02% -> Profit 0.98%
        // Taker fee 0.05% -> Profit 0.95%
        // Min profit 0.1% -> Taker Profitable
        let analysis = om.analyze_fees(dec!(1.0), rust_decimal::Decimal::ZERO);

        assert_eq!(analysis.profit_after_maker, dec!(0.98));
        assert_eq!(analysis.profit_after_taker, dec!(0.95));
        assert!(analysis.taker_profitable);
    }

    #[test]
    fn test_taker_conversion_unprofitable() {
        let config = OrderManagerConfig::default();
        let md = Arc::new(MarketDataEngine::new(None));
        let halt = Arc::new(GlobalHalt::new());
        let om = OrderManager::new(Some(config), md, halt);

        // Expected profit 0.04%
        // Taker fee 0.05% -> Loss -0.01%
        let result = om.evaluate_taker_conversion("sig-1", dec!(0.04), 5000);

        // Should cancel because it's not profitable enough for taker
        assert_eq!(result.action, TakerAction::Cancel);
    }

    #[test]
    fn test_taker_conversion_wait() {
        let config = OrderManagerConfig::default(); // default chase 2000ms
        let md = Arc::new(MarketDataEngine::new(None));
        let halt = Arc::new(GlobalHalt::new());
        let om = OrderManager::new(Some(config), md, halt);

        // Profitable but not enough time passed
        let result = om.evaluate_taker_conversion("sig-1", dec!(1.0), 1000);

        assert_eq!(result.action, TakerAction::Wait);
    }

    #[test]
    fn test_order_rejection_when_halted() {
        let config = OrderManagerConfig::default();
        let md = Arc::new(MarketDataEngine::new(None));
        let halt = Arc::new(GlobalHalt::new());
        let om = OrderManager::new(Some(config), md, halt.clone());

        // Halt!
        halt.set_halt(true, "Test Halt");

        let params = crate::model::OrderParams {
            signal_id: "test".to_string(),
            symbol: "BTC/USD".to_string(),
            side: Side::Buy,
            size: dec!(1.0),
            limit_price: None,
            stop_loss: None,
            take_profits: None,
            signal_type: None,
            expected_profit_pct: None,
        };

        let decision = om.decide_order_type(&params);
        assert_eq!(decision.reason, "SYSTEM_HALTED");
    }

    #[test]
    fn test_shadow_state_workflow() {
        let (persistence, path) = create_test_persistence();
        let ctx = Arc::new(ExecutionContext::new_system());
        let mut state = ShadowState::new(persistence, ctx, Some(10000.0));
        defer_delete(&path); // clean up if possible, or just let OS handle /tmp

        // 1. Process Intent
        let intent = Intent {
            signal_id: "sig-100".to_string(),
            symbol: "ETH/USD".to_string(),
            direction: 1, // Long
            intent_type: IntentType::BuySetup,
            entry_zone: vec![dec!(2000.0)],
            stop_loss: dec!(1900.0),
            take_profits: vec![dec!(2100.0)],
            size: dec!(1.5),
            status: IntentStatus::Pending,
            source: None,
            t_signal: Utc::now().timestamp_millis(),
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
        };

        state.process_intent(intent);

        let validated = state.validate_intent("sig-100");
        assert!(validated.is_some());
        assert!(matches!(validated.unwrap().status, IntentStatus::Validated));

        // 2. Execution (Open Position)
        let events = state.confirm_execution(
            "sig-100",
            "child-1",
            dec!(2000.0),
            dec!(1.5),
            true,
            dec!(0),
            "USDT".to_string(),
            "BYBIT",
        );
        assert!(!events.is_empty());

        let p = events
            .iter()
            .find_map(|event| match event {
                crate::shadow_state::ExecutionEvent::Opened(pos) => Some(pos),
                _ => None,
            })
            .expect("Expected Opened event");

        assert_eq!(p.size, dec!(1.5));
        assert_eq!(p.entry_price, dec!(2000.0));
        assert_eq!(p.side, Side::Long);

        // 3. Verify Position State
        assert!(state.has_position("ETH/USD"));

        // 4. Create Close Intent
        let close_intent = Intent {
            signal_id: "sig-101".to_string(),
            source: None,
            t_signal: Utc::now().timestamp_millis(),
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
            symbol: "ETH/USD".to_string(),
            direction: -1,
            intent_type: IntentType::CloseLong,
            entry_zone: vec![],
            stop_loss: dec!(0),
            take_profits: vec![],
            size: dec!(1.5),
            status: IntentStatus::Pending,

            rejection_reason: None,
            regime_state: None,
            phase: None,
            metadata: None,
            exchange: None,
            position_mode: None,
            child_fills: vec![],
            filled_size: dec!(0),
        };
        state.process_intent(close_intent);

        // 5. Execute Close
        // Exit at 2100. Profit = (2100 - 2000) * 1.5 = 150
        let close_events = state.confirm_execution(
            "sig-101",
            "child-2",
            dec!(2100.0),
            dec!(1.5),
            true,
            dec!(0),
            "USDT".to_string(),
            "BYBIT",
        );
        assert!(!close_events.is_empty());
        assert!(close_events
            .iter()
            .any(|event| matches!(event, crate::shadow_state::ExecutionEvent::Closed(_))));

        // 6. Verify Position Closed
        assert!(!state.has_position("ETH/USD"));

        // 7. Verify PnL in History
        let history = state.get_trade_history();
        assert_eq!(history.len(), 1);
        let trade = &history[0];
        assert_eq!(trade.pnl, dec!(150.0));
        assert_eq!(trade.pnl_pct, dec!(5.0)); // (2100-2000)/2000 = 5%
    }

    #[test]
    #[ignore = "Flaky due to shared MarketDataEngine state in parallel tests"]
    fn test_order_decision_sell_imbalance_uses_sell_threshold() {
        let config = OrderManagerConfig::default();
        let md = Arc::new(MarketDataEngine::new(None));
        let halt = Arc::new(GlobalHalt::new());
        let om = OrderManager::new(Some(config), md.clone(), halt);

        md.tickers.write().unwrap().insert(
            "BTCUSDT".to_string(),
            BookTicker {
                symbol: "BTCUSDT".to_string(),
                best_bid: dec!(100.00),
                best_bid_qty: dec!(1.0),
                best_ask: dec!(100.01),
                best_ask_qty: dec!(9.0),
                transaction_time: 0,
                event_time: 0,
            },
        );

        let params = OrderParams {
            signal_id: "sig-sell".to_string(),
            symbol: "BTCUSDT".to_string(),
            side: Side::Sell,
            size: dec!(1.0),
            limit_price: Some(dec!(100.00)),
            stop_loss: None,
            take_profits: None,
            signal_type: Some("SELL_SETUP".to_string()),
            expected_profit_pct: None,
        };

        let decision = om.decide_order_type(&params);
        assert_eq!(decision.order_type, OrderType::Market);
        assert!(decision.reason.starts_with("IMBALANCE_SNIPE_SELL"));
    }

    #[test]
    fn test_shadow_state_reduce_and_flip() {
        let (persistence, _path) = create_test_persistence();
        let ctx = Arc::new(ExecutionContext::new_system());
        let mut state = ShadowState::new(persistence, ctx, Some(10000.0));

        // Open long position
        let long_intent = Intent {
            signal_id: "sig-long".to_string(),
            symbol: "ETH/USD".to_string(),
            direction: 1, // Long
            intent_type: IntentType::BuySetup,
            entry_zone: vec![dec!(2000.0)],
            stop_loss: dec!(1900.0),
            take_profits: vec![dec!(2100.0)],
            size: dec!(2.0),
            status: IntentStatus::Pending,
            source: None,
            t_signal: Utc::now().timestamp_millis(),
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
        };

        state.process_intent(long_intent);
        let _ = state.confirm_execution(
            "sig-long",
            "child-long-1",
            dec!(2000.0),
            dec!(2.0),
            true,
            dec!(0),
            "USDT".to_string(),
            "BYBIT",
        );

        // Reduce with opposite (short) fill
        let short_reduce = Intent {
            signal_id: "sig-short-1".to_string(),
            symbol: "ETH/USD".to_string(),
            direction: -1,
            intent_type: IntentType::SellSetup,
            entry_zone: vec![dec!(1990.0)],
            stop_loss: dec!(2050.0),
            take_profits: vec![],
            size: dec!(1.0),
            status: IntentStatus::Pending,
            source: None,
            t_signal: Utc::now().timestamp_millis(),
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
        };

        state.process_intent(short_reduce);
        let reduce_events = state.confirm_execution(
            "sig-short-1",
            "child-short-1",
            dec!(1990.0),
            dec!(1.0),
            true,
            dec!(0),
            "USDT".to_string(),
            "BYBIT",
        );
        assert!(reduce_events
            .iter()
            .any(|event| matches!(event, crate::shadow_state::ExecutionEvent::Updated(_))));

        let pos = state.get_position("ETH/USD").expect("position exists");
        assert_eq!(pos.size, dec!(1.0));
        assert_eq!(pos.side, Side::Long);
        assert!(state.validate_intent("sig-short-1").is_none());

        // Flip with larger opposite fill
        let short_flip = Intent {
            signal_id: "sig-short-2".to_string(),
            symbol: "ETH/USD".to_string(),
            direction: -1,
            intent_type: IntentType::SellSetup,
            entry_zone: vec![dec!(1980.0)],
            stop_loss: dec!(2050.0),
            take_profits: vec![],
            size: dec!(3.0),
            status: IntentStatus::Pending,
            source: None,
            t_signal: Utc::now().timestamp_millis(),
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
        };

        state.process_intent(short_flip);
        let flip_events = state.confirm_execution(
            "sig-short-2",
            "child-short-2",
            dec!(1980.0),
            dec!(3.0),
            true,
            dec!(0),
            "USDT".to_string(),
            "BYBIT",
        );
        assert!(flip_events
            .iter()
            .any(|event| matches!(event, crate::shadow_state::ExecutionEvent::Closed(_))));

        let pos = state.get_position("ETH/USD").expect("position exists");
        assert_eq!(pos.size, dec!(2.0));
        assert_eq!(pos.side, Side::Short);
        assert!(state.validate_intent("sig-short-2").is_none());
    }

    #[test]
    fn test_exchange_reduce_only_mappings() {
        assert_eq!(mexc_side_code(Side::Buy, true), 2);
        assert_eq!(mexc_side_code(Side::Sell, true), 4);

        let order = OrderRequest {
            symbol: "BTC/USDT".to_string(),
            side: Side::Sell,
            order_type: OrderType::Market,
            quantity: dec!(1.0),
            price: None,
            stop_price: None,
            client_order_id: "test".to_string(),
            reduce_only: true,
        };

        let params = build_order_params(&order, 123);
        assert!(params.contains("reduceOnly=true"));

        let payload = build_order_payload(&order);
        assert_eq!(
            payload.get("reduceOnly").and_then(|v| v.as_bool()),
            Some(true)
        );
    }

    fn defer_delete(path: &str) {
        // Simple best effort cleanup. ideally use Drop guard.
        let _ = fs::remove_file(path);
    }
}
