use crate::model::{FeeAnalysis, OrderDecision, OrderParams};
use rust_decimal::prelude::*;
use rust_decimal::Decimal;
use tracing::{info, warn};

// Constants
pub const DEFAULT_MAKER_FEE_PCT: &str = "0.02";
pub const DEFAULT_TAKER_FEE_PCT: &str = "0.05";
pub const DEFAULT_CHASE_TIMEOUT_MS: u64 = 2000;
pub const MIN_PROFIT_MARGIN: &str = "0.001"; // 0.1%

#[derive(Debug, Clone)]
pub struct OrderManagerConfig {
    pub maker_fee_pct: Decimal,
    pub taker_fee_pct: Decimal,
    pub chase_timeout_ms: u64,
    pub min_profit_margin: Decimal,
}

impl Default for OrderManagerConfig {
    fn default() -> Self {
        Self {
            maker_fee_pct: Decimal::from_str(DEFAULT_MAKER_FEE_PCT).unwrap(),
            taker_fee_pct: Decimal::from_str(DEFAULT_TAKER_FEE_PCT).unwrap(),
            chase_timeout_ms: DEFAULT_CHASE_TIMEOUT_MS,
            min_profit_margin: Decimal::from_str(MIN_PROFIT_MARGIN).unwrap(),
        }
    }
}

pub struct OrderManager {
    config: OrderManagerConfig,
}

impl OrderManager {
    pub fn new(config: Option<OrderManagerConfig>) -> Self {
        let config = config.unwrap_or_default();
        
        info!(
            maker_fee_pct = %config.maker_fee_pct,
            taker_fee_pct = %config.taker_fee_pct,
            chase_timeout_ms = config.chase_timeout_ms,
            "OrderManager initialized"
        );

        Self { config }
    }

    pub fn analyze_fees(&self, expected_profit_pct: Decimal) -> FeeAnalysis {
        let profit_after_maker = expected_profit_pct - self.config.maker_fee_pct;
        let profit_after_taker = expected_profit_pct - self.config.taker_fee_pct;
        
        FeeAnalysis {
            maker_fee_pct: self.config.maker_fee_pct,
            taker_fee_pct: self.config.taker_fee_pct,
            expected_profit_pct,
            profit_after_maker,
            profit_after_taker,
            taker_profitable: profit_after_taker > self.config.min_profit_margin,
        }
    }

    fn is_exit_signal(signal_type: Option<&String>) -> bool {
        match signal_type {
            Some(t) => {
                let upper = t.to_uppercase();
                upper.contains("CLOSE") || upper.contains("EXIT") || 
                upper == "STOP_LOSS" || upper == "TAKE_PROFIT"
            },
            None => false,
        }
    }

    pub fn decide_order_type(&self, params: &OrderParams) -> OrderDecision {
        let reduce_only = Self::is_exit_signal(params.signal_type.as_ref());

        // Default decision: Maker order
        let mut decision = OrderDecision {
            order_type: crate::model::OrderType::Limit,
            post_only: true,
            reduce_only,
            limit_price: params.limit_price,
            reason: "DEFAULT_MAKER".to_string(),
            fee_analysis: None,
        };

        // If no expected profit provided, use maker order
        if params.expected_profit_pct.is_none() {
            info!(
                signal_id = %params.signal_id,
                symbol = %params.symbol,
                "Using default maker order (no profit estimate)"
            );
            return decision;
        }

        let expected_profit = params.expected_profit_pct.unwrap();
        let fee_analysis = self.analyze_fees(expected_profit);
        
        info!(
            signal_id = %params.signal_id,
            symbol = %params.symbol,
            expected_profit_pct = %expected_profit,
            profit_after_maker = %fee_analysis.profit_after_maker,
            profit_after_taker = %fee_analysis.profit_after_taker,
            taker_profitable = fee_analysis.taker_profitable,
            "Fee analysis completed"
        );
        
        decision.fee_analysis = Some(fee_analysis);
        decision
    }

    pub fn evaluate_taker_conversion(
        &self, 
        signal_id: &str, 
        expected_profit_pct: Decimal, 
        elapsed_ms: u64
    ) -> TakerConversionResult {
        // If not past chase timeout, wait
        if elapsed_ms < self.config.chase_timeout_ms {
            return TakerConversionResult {
                action: TakerAction::Wait,
                reason: format!("Chase timeout not reached ({}ms < {}ms)", elapsed_ms, self.config.chase_timeout_ms),
                fee_analysis: None,
            };
        }

        let fee_analysis = self.analyze_fees(expected_profit_pct);

        if fee_analysis.taker_profitable {
            info!(
                signal_id = %signal_id,
                expected_profit_pct = %expected_profit_pct,
                profit_after_taker = %fee_analysis.profit_after_taker,
                elapsed_ms = elapsed_ms,
                "Converting to taker order - profitable"
            );

            return TakerConversionResult {
                action: TakerAction::ConvertToTaker,
                reason: format!("Taker profitable: {}% after fees", fee_analysis.profit_after_taker),
                fee_analysis: Some(fee_analysis),
            };
        }

        warn!(
            signal_id = %signal_id,
            expected_profit_pct = %expected_profit_pct,
            profit_after_taker = %fee_analysis.profit_after_taker,
            elapsed_ms = elapsed_ms,
            "INSUFFICIENT_PROFIT_FOR_TAKER - Cancelling order"
        );

        TakerConversionResult {
            action: TakerAction::Cancel,
            reason: format!(
                "INSUFFICIENT_PROFIT_FOR_TAKER: {}% < {}%", 
                fee_analysis.profit_after_taker, self.config.min_profit_margin
            ),
            fee_analysis: Some(fee_analysis),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum TakerAction {
    ConvertToTaker,
    Cancel,
    Wait,
}

#[derive(Debug, Clone)]
pub struct TakerConversionResult {
    pub action: TakerAction,
    pub reason: String,
    pub fee_analysis: Option<FeeAnalysis>,
}
