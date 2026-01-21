use crate::context::ExecutionContext;
use crate::exposure::{ExposureCalculator, ExposureMetrics};
use crate::metrics;
use crate::model::{Intent, IntentStatus, IntentType, Position, Side, TradeRecord};
use crate::persistence::store::PersistenceStore;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::{error, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExecutionEvent {
    Opened(Position),
    Updated(Position),
    Closed(TradeRecord),
    FundingPaid(String, Decimal, String), // Symbol, Amount, Asset
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderChild {
    pub exchange: String,
    pub client_order_id: String,
    pub execution_order_id: String,
    pub size: Decimal,
    pub created_at: i64,
}

// Constants
const MAX_TRADE_HISTORY: usize = 1000;

pub struct ShadowState {
    positions: HashMap<String, Position>,
    pending_intents: HashMap<String, Intent>,
    trade_history: Vec<TradeRecord>,
    max_trade_history: usize,
    order_children: HashMap<String, Vec<OrderChild>>,
    persistence: Arc<PersistenceStore>,
    ctx: Arc<ExecutionContext>,
}

impl ShadowState {
    pub fn new(persistence: Arc<PersistenceStore>, ctx: Arc<ExecutionContext>) -> Self {
        let mut state = Self {
            positions: HashMap::new(),
            pending_intents: HashMap::new(),
            trade_history: Vec::new(),
            max_trade_history: MAX_TRADE_HISTORY,
            order_children: HashMap::new(),
            persistence,
            ctx,
        };
        state.hydrate_from_persistence();
        state
    }

    fn hydrate_from_persistence(&mut self) {
        match self.persistence.load_positions() {
            Ok(positions) => {
                for pos in positions {
                    self.positions.insert(pos.symbol.clone(), pos);
                }
                info!("Positions hydrated: {}", self.positions.len());
                metrics::set_active_positions(self.positions.len() as i64);
            }
            Err(e) => error!("Failed to hydrate positions: {}", e),
        }

        match self.persistence.load_intents() {
            Ok(intents) => {
                for intent in intents {
                    self.pending_intents
                        .insert(intent.signal_id.clone(), intent);
                }
                info!("Intents hydrated: {}", self.pending_intents.len());
            }
            Err(e) => error!("Failed to hydrate intents: {}", e),
        }

        match self.persistence.load_trades() {
            Ok(trades) => {
                self.trade_history = trades;
                info!("Trade history hydrated: {}", self.trade_history.len());
            }
            Err(e) => error!("Failed to hydrate trade history: {}", e),
        }
    }

    pub fn process_intent(&mut self, mut intent: Intent) -> Intent {
        // Idempotency Check
        if let Some(existing) = self.pending_intents.get(&intent.signal_id) {
            warn!(signal_id = %intent.signal_id, "Duplicate intent received - returning existing state");
            return existing.clone();
        }
        // Also check if it's already executed (in trade history) - simplified check
        // Ideally we check a dedicated "processed_ids" set or WAL index

        intent.t_ingress = Some(self.ctx.time.now_millis());
        intent.status = IntentStatus::Pending;

        // Clone for storage and return
        let stored_intent = intent.clone();

        // Persist first
        if let Err(e) = self.persistence.save_intent(&stored_intent) {
            error!("Failed to persist intent {}: {}", intent.signal_id, e);
        }

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
            // Update persistence
            if let Err(e) = self.persistence.save_intent(intent) {
                error!("Failed to update intent persistence {}: {}", signal_id, e);
            }
            info!(signal_id = %signal_id, "Intent validated");
            return Some(intent.clone());
        }
        warn!(signal_id = %signal_id, "Intent not found for validation");
        None
    }

    pub fn reject_intent(&mut self, signal_id: &str, reason: String) -> Option<Intent> {
        if let Some(mut intent) = self.pending_intents.remove(signal_id) {
            intent.status = IntentStatus::Rejected;
            intent.rejection_reason = Some(reason.clone());

            // Delete from persistence since we are removing from pending?
            // OR update status to REJECTED?
            // "remove" from HashMap suggests it's gone from active memory.
            // But we should probably keep history?
            // Existing code returns it, but removes from Map.
            // I will mimic map behavior: Remove from persistence.
            if let Err(e) = self.persistence.delete_intent(signal_id) {
                error!("Failed to delete intent persistence {}: {}", signal_id, e);
            }

            warn!(
                signal_id = %signal_id,
                reason = %reason,
                symbol = %intent.symbol,
                "REJECTED - Intent rejected, position state NOT updated"
            );

            return Some(intent);
        }
        warn!(signal_id = %signal_id, "Intent not found for rejection");
        None
    }

    pub fn expire_intent(&mut self, signal_id: &str, reason: String) -> Option<Intent> {
        if let Some(mut intent) = self.pending_intents.remove(signal_id) {
            intent.status = IntentStatus::Expired;
            intent.rejection_reason = Some(reason.clone());

            if let Err(e) = self.persistence.delete_intent(signal_id) {
                error!("Failed to delete intent persistence {}: {}", signal_id, e);
            }

            warn!(
                signal_id = %signal_id,
                reason = %reason,
                symbol = %intent.symbol,
                "EXPIRED - Intent expired before execution"
            );

            return Some(intent);
        }
        warn!(signal_id = %signal_id, "Intent not found for expiration");
        None
    }

    pub fn confirm_execution(
        &mut self,
        signal_id: &str,
        fill_price: Decimal,
        fill_size: Decimal,
        filled: bool,
        fee: Decimal,
        fee_asset: String,
    ) -> Vec<ExecutionEvent> {
        let mut events = Vec::new();
        // We need to clone the intent ID first to avoid borrow check issues if we removed it,
        // but here we just get a mutable reference.
        // Logic: Get intent -> Check status -> Update -> Logic

        // Temporarily get intent details needed for logic, to avoid holding mutable borrow on `pending_intents` too long if possible.
        // Actually, we can just use the mutable reference since we are mostly operating on `positions` map which is separate.

        let mut intent = match self.pending_intents.remove(signal_id) {
            Some(i) => i,
            None => {
                warn!(signal_id = %signal_id, "Intent not found for execution confirmation");
                return events;
            }
        };

        if !filled {
            intent.status = IntentStatus::Rejected;
            intent.rejection_reason = Some("Broker did not fill order".to_string());
            if let Err(e) = self.persistence.delete_intent(signal_id) {
                error!("Failed to delete intent persistence {}: {}", signal_id, e);
            }
            warn!(signal_id = %signal_id, "REJECTED - Broker did not fill order");
            return events;
        }

        if fill_size <= Decimal::ZERO || fill_price <= Decimal::ZERO {
            intent.status = IntentStatus::Rejected;
            intent.rejection_reason = Some("Invalid fill size/price".to_string());
            if let Err(e) = self.persistence.delete_intent(signal_id) {
                error!("Failed to delete intent persistence {}: {}", signal_id, e);
            }
            warn!(
                signal_id = %signal_id,
                fill_size = %fill_size,
                fill_price = %fill_price,
                "REJECTED - Invalid fill size/price"
            );
            return events;
        }

        intent.status = IntentStatus::Executed;
        // Clean up intent from persistence as it is now executed and becomes a position/trade
        if let Err(e) = self.persistence.delete_intent(signal_id) {
            error!("Failed to delete intent persistence {}: {}", signal_id, e);
        }

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
                if let Some(event) = self.close_position(
                    signal_id,
                    &symbol,
                    fill_price,
                    "MANUAL".to_string(),
                    Some(fill_size),
                    fee,
                    fee_asset,
                ) {
                    events.push(event);
                }
                return events;
            }
            _ => {}
        }

        let side = if direction == 1 {
            Side::Long
        } else {
            Side::Short
        };

        // Check for existing position
        if let Some(existing_position) = self.positions.get(&symbol).cloned() {
            if existing_position.side == side {
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
                    existing_position.fees_paid += fee; // Accumulate fees

                    if let Err(e) = self.persistence.save_position(existing_position) {
                        error!("Failed to persist position update {}: {}", symbol, e);
                    }

                    info!(
                        signal_id = %signal_id,
                        symbol = %symbol,
                        side = ?side,
                        new_size = %total_size,
                        avg_price = %avg_price,
                        "Position increased (pyramid)"
                    );

                    events.push(ExecutionEvent::Updated(existing_position.clone()));
                    return events;
                }
            }

            // Opposite direction fill: reduce/close, and flip if remainder remains
            let existing_size = existing_position.size;
            if fill_size <= existing_size {
                if let Some(existing_position_mut) = self.positions.get_mut(&symbol) {
                    existing_position_mut.fees_paid += fee; // Fees paid regardless of reduction
                }
                if let Some(event) = self.close_position(
                    signal_id,
                    &symbol,
                    fill_price,
                    "OPPOSITE_FILL".to_string(),
                    Some(fill_size),
                    fee,
                    fee_asset,
                ) {
                    events.push(event);
                }
                return events;
            }

            let remainder = fill_size - existing_size;
            if let Some(existing_position_mut) = self.positions.get_mut(&symbol) {
                existing_position_mut.fees_paid += fee; // Fees paid for the closing part
            }
            if let Some(event) = self.close_position(
                signal_id,
                &symbol,
                fill_price,
                "OPPOSITE_FILL".to_string(),
                Some(existing_size),
                fee, // Fee for the closed part
                fee_asset.clone(),
            ) {
                events.push(event);
            }

            let mut position = Position {
                symbol: symbol.clone(),
                side: side.clone(),
                size: remainder,
                entry_price: fill_price,
                stop_loss,
                take_profits,
                signal_id: signal_id.to_string(),
                opened_at: self.ctx.time.now(),
                regime_state,
                phase,
                metadata: intent.metadata.clone(),
                exchange: Some("BYBIT".to_string()), // Default for now
                position_mode: Some("ONE_WAY".to_string()), // Default for now
                realized_pnl: Decimal::ZERO,
                unrealized_pnl: Decimal::ZERO,
                fees_paid: Decimal::ZERO, // This is for the new position, the fee for the closed part was handled above
                funding_paid: Decimal::ZERO,
                last_mark_price: None,
                last_update_ts: self.ctx.time.now_millis(),
            };
            position.fees_paid = fee; // This fee is for the new position part
            position.funding_paid = Decimal::ZERO;

            if let Err(e) = self.persistence.save_position(&position) {
                error!("Failed to persist flipped position {}: {}", symbol, e);
            }

            self.positions.insert(symbol.clone(), position.clone());
            metrics::set_active_positions(self.positions.len() as i64);

            info!(
                signal_id = %signal_id,
                symbol = %symbol,
                side = ?side,
                size = %remainder,
                entry_price = %fill_price,
                "Position flipped"
            );

            events.push(ExecutionEvent::Opened(position));
            metrics::inc_position_flips();
            return events;
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
            opened_at: self.ctx.time.now(),
            regime_state,
            phase,
            metadata: intent.metadata.clone(),
            exchange: Some("BYBIT".to_string()), // Default for now
            position_mode: Some("ONE_WAY".to_string()), // Default for now
            realized_pnl: Decimal::ZERO,
            unrealized_pnl: Decimal::ZERO,
            fees_paid: Decimal::ZERO,
            funding_paid: Decimal::ZERO,
            last_mark_price: None,
            last_update_ts: self.ctx.time.now_millis(),
        };

        if let Err(e) = self.persistence.save_position(&position) {
            error!("Failed to persist new position {}: {}", symbol, e);
        }

        self.positions.insert(symbol.clone(), position.clone());

        info!(
            signal_id = %signal_id,
            symbol = %symbol,
            side = ?side,
            size = %fill_size,
            entry_price = %fill_price,
            "Position opened"
        );

        events.push(ExecutionEvent::Opened(position));
        events
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
        fee: Decimal,
        fee_asset: String,
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
        if actual_close_size <= Decimal::ZERO {
            warn!(signal_id = %signal_id, symbol = %symbol, "Close size is non-positive");
            return None;
        }
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
            closed_at: self.ctx.time.now(),
            close_reason,
            metadata: position.metadata.clone(),
            fee,
            fee_asset,
        };

        if let Err(e) = self.persistence.save_trade(&trade_record) {
            error!(
                "Failed to persist trade record {}: {}",
                trade_record.signal_id, e
            );
        }
        self.trade_history.push(trade_record.clone());
        if self.trade_history.len() > self.max_trade_history {
            self.trade_history.remove(0); // O(n) but simple for Vec. Deque might be better if frequent.
        }

        if is_partial_close {
            // Partial Close
            position.size -= actual_close_size;

            if let Err(e) = self.persistence.save_position(position) {
                error!("Failed to persist partial close {}: {}", symbol, e);
            }
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
            if let Err(e) = self.persistence.delete_position(symbol) {
                error!("Failed to delete closed position {}: {}", symbol, e);
            }
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

    pub fn update_valuation(
        &mut self,
        ticker: &crate::market_data::types::BookTicker,
    ) -> Option<ExecutionEvent> {
        let symbol = &ticker.symbol;
        if let Some(position) = self.positions.get_mut(symbol) {
            let mid_price = (ticker.best_bid + ticker.best_ask) / Decimal::from(2);
            let pnl = match position.side {
                Side::Long => (mid_price - position.entry_price) * position.size,
                Side::Short => (position.entry_price - mid_price) * position.size,
                _ => Decimal::ZERO,
            };

            position.unrealized_pnl = pnl;
            position.last_mark_price = Some(mid_price);
            position.last_update_ts = ticker.transaction_time;

            return Some(ExecutionEvent::Updated(position.clone()));
        }
        None
    }

    pub fn apply_funding(
        &mut self,
        symbol: &str,
        amount: Decimal,
        asset: String,
    ) -> Option<ExecutionEvent> {
        if let Some(position) = self.positions.get_mut(symbol) {
            position.funding_paid += amount;
            position.last_update_ts = self.ctx.time.now_millis();

            // Persist
            if let Err(e) = self.persistence.save_position(position) {
                error!("Failed to persist funding update {}: {}", symbol, e);
            }

            return Some(ExecutionEvent::FundingPaid(
                symbol.to_string(),
                amount,
                asset,
            ));
        }
        None
    }

    pub fn get_all_positions(&self) -> HashMap<String, Position> {
        self.positions.clone()
    }

    pub fn get_trade_history(&self) -> &Vec<TradeRecord> {
        &self.trade_history
    }

    pub fn record_child_order(
        &mut self,
        signal_id: &str,
        exchange: String,
        client_order_id: String,
        execution_order_id: String,
        size: Decimal,
    ) {
        let entry = self
            .order_children
            .entry(signal_id.to_string())
            .or_default();
        entry.push(OrderChild {
            exchange: exchange.clone(),
            client_order_id: client_order_id.clone(),
            execution_order_id: execution_order_id.clone(),
            size,
            created_at: self.ctx.time.now_millis(),
        });

        // Persist "Order Placed" event to WAL
        let payload = serde_json::json!({
            "size": size,
            "execution_id": execution_order_id,
            "created_at": self.ctx.time.now_millis() // Assuming we want consistent time here too
        });

        if let Err(e) = self.persistence.log_order_placed(
            signal_id.to_string(),
            exchange.clone(),
            client_order_id.clone(),
            payload,
        ) {
            error!("Failed to log order placed to WAL {}: {}", signal_id, e);
        }
    }

    pub fn get_child_orders(&self, signal_id: &str) -> Option<&Vec<OrderChild>> {
        self.order_children.get(signal_id)
    }

    pub fn calculate_exposure(&self) -> ExposureMetrics {
        ExposureCalculator::calculate(&self.positions)
    }
}
