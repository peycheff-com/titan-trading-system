#[cfg(test)]
mod tests {
    use crate::circuit_breaker::GlobalHalt;
    use crate::market_data::engine::MarketDataEngine;
    use crate::model::{Intent, IntentStatus, IntentType, Side};
    use crate::order_manager::{OrderManager, OrderManagerConfig, TakerAction};
    use crate::shadow_state::ShadowState;
    use chrono::Utc;
    use rust_decimal_macros::dec;
    use std::sync::Arc;

    #[test]
    fn test_fee_analysis_maker_profitable() {
        let config = OrderManagerConfig::default();
        let md = Arc::new(MarketDataEngine::new());
        let halt = Arc::new(GlobalHalt::new());
        let om = OrderManager::new(Some(config), md, halt);

        // Expected profit 1.0%
        // Maker fee 0.02% -> Profit 0.98%
        // Taker fee 0.05% -> Profit 0.95%
        // Min profit 0.1% -> Taker Profitable
        let analysis = om.analyze_fees(dec!(1.0));

        assert_eq!(analysis.profit_after_maker, dec!(0.98));
        assert_eq!(analysis.profit_after_taker, dec!(0.95));
        assert!(analysis.taker_profitable);
    }

    #[test]
    fn test_taker_conversion_unprofitable() {
        let config = OrderManagerConfig::default();
        let md = Arc::new(MarketDataEngine::new());
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
        let md = Arc::new(MarketDataEngine::new());
        let halt = Arc::new(GlobalHalt::new());
        let om = OrderManager::new(Some(config), md, halt);

        // Profitable but not enough time passed
        let result = om.evaluate_taker_conversion("sig-1", dec!(1.0), 1000);

        assert_eq!(result.action, TakerAction::Wait);
    }

    #[test]
    fn test_order_rejection_when_halted() {
        let config = OrderManagerConfig::default();
        let md = Arc::new(MarketDataEngine::new());
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
        let mut state = ShadowState::new();

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
            max_slippage_bps: None,
            rejection_reason: None,
            regime_state: None,
            phase: None,
            metadata: None,
        };

        state.process_intent(intent);

        let validated = state.validate_intent("sig-100");
        assert!(validated.is_some());
        assert!(matches!(validated.unwrap().status, IntentStatus::Validated));

        // 2. Execution (Open Position)
        let event = state.confirm_execution("sig-100", dec!(2000.0), dec!(1.5), true);
        assert!(event.is_some());

        let p = match event.unwrap() {
            crate::shadow_state::ExecutionEvent::Opened(pos) => pos,
            _ => panic!("Expected Opened event"),
        };

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
        };
        state.process_intent(close_intent);

        // 5. Execute Close
        // Exit at 2100. Profit = (2100 - 2000) * 1.5 = 150
        let close_event = state.confirm_execution("sig-101", dec!(2100.0), dec!(1.5), true);
        assert!(close_event.is_some());
        match close_event.unwrap() {
            crate::shadow_state::ExecutionEvent::Closed(_) => {}
            _ => panic!("Expected Closed event"),
        }

        // 6. Verify Position Closed
        assert!(!state.has_position("ETH/USD"));

        // 7. Verify PnL in History
        let history = state.get_trade_history();
        assert_eq!(history.len(), 1);
        let trade = &history[0];
        assert_eq!(trade.pnl, dec!(150.0));
        assert_eq!(trade.pnl_pct, dec!(5.0)); // (2100-2000)/2000 = 5%
    }
}
