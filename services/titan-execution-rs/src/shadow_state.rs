use crate::model::{Intent, IntentStatus, IntentType, Position, Side, TradeRecord};
use chrono::Utc;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExecutionEvent {
    Opened(Position),
    Updated(Position),
    Closed(TradeRecord),
}

// Constants
const MAX_TRADE_HISTORY: usize = 1000;

pub struct ShadowState {
    positions: HashMap<String, Position>,
    pending_intents: HashMap<String, Intent>,
    trade_history: Vec<TradeRecord>,
    max_trade_history: usize,
}

impl Default for ShadowState {
    fn default() -> Self {
        Self {
            positions: HashMap::new(),
            pending_intents: HashMap::new(),
            trade_history: Vec::new(),
            max_trade_history: MAX_TRADE_HISTORY,
        }
    }
}

impl ShadowState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn process_intent(&mut self, mut intent: Intent) -> Intent {
        intent.t_ingress = Some(Utc::now().timestamp_millis());
        intent.status = IntentStatus::Pending;

        // Clone for storage and return
        let stored_intent = intent.clone();
        self.pending_intents
            .insert(intent.signal_id.clone(), stored_intent);

        info!(
            signal_id = %intent.signal_id,
            intent_type = ?intent.intent_type,
            symbol = %intent.symbol,
            "Intent processed"
        );

        intent
    }

    pub fn validate_intent(&mut self, signal_id: &str) -> Option<Intent> {
        if let Some(intent) = self.pending_intents.get_mut(signal_id) {
            intent.status = IntentStatus::Validated;
            info!(signal_id = %signal_id, "Intent validated");
            return Some(intent.clone());
        }
        warn!(signal_id = %signal_id, "Intent not found for validation");
        None
    }

    pub fn reject_intent(&mut self, signal_id: &str, reason: String) -> Option<Intent> {
        if let Some(intent) = self.pending_intents.get_mut(signal_id) {
            intent.status = IntentStatus::Rejected;
            intent.rejection_reason = Some(reason.clone());

            warn!(
                signal_id = %signal_id,
                reason = %reason,
                symbol = %intent.symbol,
                "REJECTED - Intent rejected, position state NOT updated"
            );

            return Some(intent.clone());
        }
        warn!(signal_id = %signal_id, "Intent not found for rejection");
        None
    }

    pub fn confirm_execution(
        &mut self,
        signal_id: &str,
        fill_price: Decimal,
        fill_size: Decimal,
        filled: bool,
    ) -> Option<ExecutionEvent> {
        // We need to clone the intent ID first to avoid borrow check issues if we removed it,
        // but here we just get a mutable reference.
        // Logic: Get intent -> Check status -> Update -> Logic

        // Temporarily get intent details needed for logic, to avoid holding mutable borrow on `pending_intents` too long if possible.
        // Actually, we can just use the mutable reference since we are mostly operating on `positions` map which is separate.

        let intent = match self.pending_intents.get_mut(signal_id) {
            Some(i) => i,
            None => {
                warn!(signal_id = %signal_id, "Intent not found for execution confirmation");
                return None;
            }
        };

        if !filled {
            intent.status = IntentStatus::Rejected;
            intent.rejection_reason = Some("Broker did not fill order".to_string());
            warn!(signal_id = %signal_id, "REJECTED - Broker did not fill order");
            return None;
        }

        intent.status = IntentStatus::Executed;

        let symbol = intent.symbol.clone();
        let intent_type = intent.intent_type.clone();
        let direction = intent.direction; // i32: 1 or -1
        let stop_loss = intent.stop_loss;
        let take_profits = intent.take_profits.clone();
        let regime_state = intent.regime_state;
        let phase = intent.phase;

        // Handle close intents
        match intent_type {
            IntentType::CloseLong | IntentType::CloseShort | IntentType::Close => {
                return self.close_position(
                    signal_id,
                    &symbol,
                    fill_price,
                    "MANUAL".to_string(),
                    Some(fill_size),
                );
            }
            _ => {}
        }

        let side = if direction == 1 {
            Side::Long
        } else {
            Side::Short
        };

        // Check for existing position
        if let Some(existing_position) = self.positions.get_mut(&symbol) {
            // Pyramiding
            let total_size = existing_position.size + fill_size;
            // Weighted average price
            // (old_entry * old_size + new_fill * new_size) / total_size
            let old_val = existing_position.entry_price * existing_position.size;
            let new_val = fill_price * fill_size;
            let avg_price = (old_val + new_val) / total_size;

            existing_position.size = total_size;
            existing_position.entry_price = avg_price;

            info!(
                signal_id = %signal_id,
                symbol = %symbol,
                side = ?side,
                new_size = %total_size,
                avg_price = %avg_price,
                "Position increased (pyramid)"
            );

            return Some(ExecutionEvent::Updated(existing_position.clone()));
        }

        // New Position
        let position = Position {
            symbol: symbol.clone(),
            side: side.clone(),
            size: fill_size,
            entry_price: fill_price,
            stop_loss,
            take_profits,
            signal_id: signal_id.to_string(),
            opened_at: Utc::now(),
            regime_state,
            phase,
            metadata: intent.metadata.clone(),
        };

        self.positions.insert(symbol.clone(), position.clone());

        info!(
            signal_id = %signal_id,
            symbol = %symbol,
            side = ?side,
            size = %fill_size,
            entry_price = %fill_price,
            "Position opened"
        );

        Some(ExecutionEvent::Opened(position))
    }

    fn calculate_pnl(
        side: &Side,
        entry_price: Decimal,
        exit_price: Decimal,
        size: Decimal,
    ) -> (Decimal, Decimal) {
        match side {
            Side::Long => {
                let pnl = (exit_price - entry_price) * size;
                // Avoid division by zero
                let pnl_pct = if entry_price.is_zero() {
                    Decimal::ZERO
                } else {
                    (exit_price - entry_price) / entry_price * Decimal::from(100)
                };
                (pnl, pnl_pct)
            }
            Side::Short => {
                let pnl = (entry_price - exit_price) * size;
                let pnl_pct = if entry_price.is_zero() {
                    Decimal::ZERO
                } else {
                    (entry_price - exit_price) / entry_price * Decimal::from(100)
                };
                (pnl, pnl_pct)
            }
            _ => (Decimal::ZERO, Decimal::ZERO), // Should not happen for positions usually
        }
    }

    fn close_position(
        &mut self,
        signal_id: &str,
        symbol: &str,
        exit_price: Decimal,
        close_reason: String,
        close_size: Option<Decimal>,
    ) -> Option<ExecutionEvent> {
        // Use if let to avoid getting mutable ref twice or unwrapping
        let position = match self.positions.get_mut(symbol) {
            Some(p) => p,
            None => {
                warn!(signal_id = %signal_id, symbol = %symbol, "No position to close");
                return None;
            }
        };

        if position.size.is_zero() {
            warn!(signal_id = %signal_id, symbol = %symbol, "Position has zero size, removing");
            self.positions.remove(symbol);
            return None;
        }

        let actual_close_size = close_size.unwrap_or(position.size);
        // Ensure we don't close more than we have
        let actual_close_size = if actual_close_size > position.size {
            position.size
        } else {
            actual_close_size
        };

        let is_partial_close = actual_close_size < position.size;

        let (pnl, pnl_pct) = Self::calculate_pnl(
            &position.side,
            position.entry_price,
            exit_price,
            actual_close_size,
        );

        let trade_record = TradeRecord {
            signal_id: position.signal_id.clone(),
            symbol: symbol.to_string(),
            side: position.side.clone(),
            entry_price: position.entry_price,
            exit_price,
            size: actual_close_size,
            pnl,
            pnl_pct,
            opened_at: position.opened_at,
            closed_at: Utc::now(),
            close_reason,
            metadata: position.metadata.clone(),
        };

        self.trade_history.push(trade_record.clone());
        if self.trade_history.len() > self.max_trade_history {
            self.trade_history.remove(0); // O(n) but simple for Vec. Deque might be better if frequent.
        }

        if is_partial_close {
            // Partial Close
            position.size -= actual_close_size;
            info!(
                signal_id = %signal_id,
                symbol = %symbol,
                remaining_size = %position.size,
                pnl = %pnl,
                "Position partially closed"
            );
            return Some(ExecutionEvent::Updated(position.clone()));
        } else {
            // Full Close
            self.positions.remove(symbol);
            info!(
                signal_id = %signal_id,
                symbol = %symbol,
                pnl = %pnl,
                "Position closed"
            );
            return Some(ExecutionEvent::Closed(trade_record));
        }
    }

    pub fn has_position(&self, symbol: &str) -> bool {
        self.positions.contains_key(symbol)
    }

    pub fn get_position(&self, symbol: &str) -> Option<&Position> {
        self.positions.get(symbol)
    }

    pub fn get_all_positions(&self) -> HashMap<String, Position> {
        self.positions.clone()
    }

    pub fn get_trade_history(&self) -> &Vec<TradeRecord> {
        &self.trade_history
    }
}
