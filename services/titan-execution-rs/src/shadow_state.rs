use crate::context::ExecutionContext;
use crate::exposure::{ExposureCalculator, ExposureMetrics};
use crate::metrics;
use crate::model::{Intent, IntentStatus, IntentType, Position, Side, TradeRecord};
use crate::persistence::store::PersistenceStore;
use chrono::Utc;

use rust_decimal::prelude::ToPrimitive;
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
    BalanceUpdated(Decimal, Decimal),     // Total Equity, Available Cash
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderChild {
    pub exchange: String,
    pub client_order_id: String,
    pub execution_order_id: String,
    pub size: Decimal,
    pub created_at: i64,
    #[serde(default)]
    pub status: String, // "FILLED", "REJECTED", "PENDING"
}

// Constants
const MAX_TRADE_HISTORY: usize = 5000;

pub struct ShadowState {
    positions: HashMap<String, Position>,
    pending_intents: HashMap<String, Intent>,
    trade_history: Vec<TradeRecord>,
    max_trade_history: usize,
    order_children: HashMap<String, Vec<OrderChild>>,
    persistence: Arc<PersistenceStore>,
    ctx: Arc<ExecutionContext>,
    cash_balance: Decimal,
    initial_balance: Decimal,
}

impl ShadowState {
    pub fn new(
        persistence: Arc<PersistenceStore>,
        ctx: Arc<ExecutionContext>,
        initial_balance_f64: Option<f64>,
    ) -> Self {
        let initial = if let Some(b) = initial_balance_f64 {
            Decimal::from_f64_retain(b).unwrap_or(Decimal::ZERO)
        } else {
            Decimal::ZERO
        };

        let mut state = Self {
            positions: HashMap::new(),
            pending_intents: HashMap::new(),
            trade_history: Vec::new(),
            max_trade_history: MAX_TRADE_HISTORY,
            order_children: HashMap::new(),
            persistence,
            ctx,
            cash_balance: initial,
            initial_balance: initial,
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

        match self.persistence.load_recent_trades(self.max_trade_history) {
            Ok(trades) => {
                self.trade_history = trades;
                info!(
                    "Trade history hydrated: {} (capped at {})",
                    self.trade_history.len(),
                    self.max_trade_history
                );
            }
            Err(e) => error!("Failed to hydrate trade history: {}", e),
        }

        // Hydrate Cash Balance
        match self.persistence.load_metadata("cash_balance") {
            Ok(Some(val)) => {
                if let Some(f) = val.as_f64() {
                    self.cash_balance = Decimal::from_f64_retain(f).unwrap_or(self.initial_balance);
                    info!("Cash Balance hydrated: {}", self.cash_balance);
                }
            }
            Ok(None) => {
                info!(
                    "No cash balance found, using initial: {}",
                    self.initial_balance
                );
                self.cash_balance = self.initial_balance;
            }
            Err(e) => error!("Failed to hydrate cash balance: {}", e),
        }
    }

    pub fn process_intent(&mut self, mut intent: Intent) -> Intent {
        if let Some(existing) = self.pending_intents.get(&intent.signal_id) {
            warn!(signal_id = %intent.signal_id, "Duplicate intent received - returning existing state");
            return existing.clone();
        }

        if !intent.status.is_active() {
            return intent;
        }

        // --- Phase 2: Shadow Reconciliation (ForceSync) ---
        if let IntentType::ForceSync = intent.intent_type {
            info!(signal_id = %intent.signal_id, "FORCE SYNC: Overwriting state for {}", intent.symbol);

            let side = if intent.direction >= 0 {
                Side::Long
            } else {
                Side::Short
            };
            // Use intent size as target position size.
            // If size is 0, we close/remove position.

            if intent.size.is_zero() {
                self.positions.remove(&intent.symbol);
                if let Err(e) = self.persistence.delete_position(&intent.symbol) {
                    warn!("Failed to delete forced position: {}", e);
                }
                info!("ForceSync: Position cleared for {}", intent.symbol);
            } else {
                let entry_price = intent.entry_zone.first().cloned().unwrap_or(Decimal::ZERO);

                let position = Position {
                    symbol: intent.symbol.clone(),
                    side,
                    size: intent.size,
                    entry_price,
                    stop_loss: intent.stop_loss,
                    take_profits: intent.take_profits.clone(),
                    signal_id: intent.signal_id.clone(),
                    opened_at: Utc::now(),
                    regime_state: intent.regime_state,
                    phase: intent.phase,
                    metadata: intent.metadata.clone(),
                    exchange: intent.exchange.clone(),
                    position_mode: intent.position_mode.clone(),

                    realized_pnl: Decimal::ZERO,
                    unrealized_pnl: Decimal::ZERO,
                    fees_paid: Decimal::ZERO,
                    funding_paid: Decimal::ZERO,
                    last_mark_price: None,
                    last_update_ts: Utc::now().timestamp_millis(),
                };

                self.positions
                    .insert(intent.symbol.clone(), position.clone());
                if let Err(e) = self.persistence.save_position(&position) {
                    warn!("Failed to save forced position: {}", e);
                }
                info!(
                    "ForceSync: Position set for {} to {:?}",
                    intent.symbol, position
                );
            }

            intent.status = IntentStatus::Executed;
            return intent;
        }

        // 1. Idempotency Check (Explicit)
        if let Some(causation_id) = &intent.causation_id {
            match self
                .persistence
                .check_idempotency(causation_id, intent.ttl_ms.unwrap_or(5000))
            {
                Ok(false) => {
                    warn!(signal_id = %intent.signal_id, causation_id = %causation_id, "Duplicate causation_id detected - rejecting");
                    intent.status = IntentStatus::Rejected;
                    intent.rejection_reason = Some("Duplicate causation_id".to_string());
                    return intent;
                }
                Err(e) => {
                    error!("Idempotency check failed: {}", e);
                    intent.status = IntentStatus::Rejected;
                    intent.rejection_reason = Some("Idempotency check failed".to_string());
                    return intent;
                }
                Ok(true) => {
                    // Mark as seen (At Most Once)
                    if let Err(e) = self
                        .persistence
                        .set_idempotency(causation_id, intent.ttl_ms.unwrap_or(5000))
                    {
                        error!("Failed to set idempotency key: {}", e);
                        intent.status = IntentStatus::Rejected;
                        intent.rejection_reason = Some("Storage failure".to_string());
                        return intent;
                    }
                }
            }
        }

        if intent.t_ingress.is_none() {
            intent.t_ingress = Some(self.ctx.time.now_millis());
        }
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

            // Retain for audit trail
            if let Err(e) = self.persistence.save_intent(&intent) {
                error!(
                    "Failed to update intent persistence (REJECTED) {}: {}",
                    signal_id, e
                );
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

            // Retain for audit trail
            if let Err(e) = self.persistence.save_intent(&intent) {
                error!(
                    "Failed to update intent persistence (EXPIRED) {}: {}",
                    signal_id, e
                );
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
        child_order_id: &str, // Idempotency Key
        fill_price: Decimal,
        fill_size: Decimal,
        filled: bool,
        fee: Decimal,
        fee_asset: String,
        exchange: &str,
    ) -> Vec<ExecutionEvent> {
        println!(
            "DEBUG: confirm_execution: {}, child: {}",
            signal_id, child_order_id
        );
        let mut events = Vec::new();

        // 0. Update Child Order Status
        if let Some(children) = self.order_children.get_mut(signal_id) {
            for child in children {
                // Heuristic: matching execution_id OR client_order_id if execution_id unknown
                if child.execution_order_id == child_order_id
                    || child.client_order_id == child_order_id
                {
                    match filled {
                        true => child.status = "FILLED".to_string(),
                        false => child.status = "REJECTED".to_string(), // Or Partial if fill_size > 0
                    }
                    // Refined logic: if fill_size > 0 but not filled, assume PARTIAL?
                    // Function arg `filled` means "Is this a terminal fill/reject event?"
                    // Wait, `filled` arg is boolean? "filled: bool".
                    // Looking at usage, it means "Is this a valid fill (true) or a reject (false)?"

                    if !filled {
                        child.status = "REJECTED".to_string();
                    } else if fill_size < child.size {
                        child.status = "PARTIALLY_FILLED".to_string();
                    } else {
                        child.status = "FILLED".to_string();
                    }
                }
            }
        }

        // 1. Retrieve Intent & Determine Status
        // Returns: (should_remove, intent_snapshot)
        let (should_remove, intent_snapshot) = {
            let intent_opt = self.pending_intents.get_mut(signal_id);
            if intent_opt.is_none() {
                warn!(signal_id = %signal_id, "Intent not found for execution confirmation");
                return events;
            }
            let intent = intent_opt.unwrap();

            // 2. Idempotency Check
            if intent.child_fills.contains(&child_order_id.to_string()) {
                warn!(signal_id = %signal_id, child_id = %child_order_id, "Duplicate fill detected - ignoring");
                return events;
            }

            // 3. Mark child as processed
            intent.child_fills.push(child_order_id.to_string());

            if !filled {
                // Child Rejected - Fail Fast for Single Access
                // Only if ALL children failed? Or just one?
                // For simplicity Phase 4: Any reject = Intent Rejected (Fail Fast)
                intent.status = IntentStatus::Rejected;
                intent.rejection_reason = Some(format!("Child order rejected on {}", exchange));
                (true, Some(intent.clone()))
            } else {
                // 4. Validate Fill
                if fill_size <= Decimal::ZERO || fill_price <= Decimal::ZERO {
                    warn!(signal_id = %signal_id, "Invalid fill details");
                    (false, None) // Ignore, don't remove, don't process position
                } else {
                    // 5. Aggregate
                    intent.filled_size += fill_size;

                    // 6. Check Completion
                    let is_complete = if intent.filled_size >= intent.size {
                        intent.status = IntentStatus::Executed;
                        true
                    } else {
                        intent.status = IntentStatus::PartiallyFilled;

                        // Time Budget Check (Lazy)
                        let now = self.ctx.time.now_millis();
                        if let Some(t0) = intent.t_ingress {
                            if now > t0 + 5000 {
                                warn!(signal_id = %signal_id, "Time Budget Exceeded during Partial Fill");
                                intent.status = IntentStatus::PartiallyCompleted;
                                true // Remove (Terminal Partial)
                            } else {
                                false
                            }
                        } else {
                            false
                        }
                    };

                    // Save State if NOT complete/removing (if removing, we delete later)
                    if !is_complete {
                        if let Err(e) = self.persistence.save_intent(intent) {
                            error!("Failed to update intent state: {}", e);
                        }
                    }

                    (is_complete, Some(intent.clone()))
                }
            }
        };

        let intent = if let Some(i) = intent_snapshot {
            i
        } else {
            return events;
        };

        // If we rejected (not filled), skip position logic but remove if needed
        if !filled {
            if should_remove {
                self.pending_intents.remove(signal_id);
                if let Err(e) = self.persistence.delete_intent(signal_id) {
                    error!("Failed to delete intent persistence {}: {}", signal_id, e);
                }
            }
            return events;
        }

        // --- POSITION LOGIC (Driven by Snapshot) ---
        let symbol = intent.symbol.clone();
        let intent_type = intent.intent_type;
        let direction = intent.direction;
        let stop_loss = intent.stop_loss;
        let take_profits = intent.take_profits.clone();
        let regime_state = intent.regime_state;
        let phase = intent.phase;

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
                if should_remove {
                    self.pending_intents.remove(signal_id);
                    if let Err(e) = self.persistence.delete_intent(signal_id) {
                        error!("Failed to delete intent persistence {}: {}", signal_id, e);
                    }
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
                // Pyramiding
                if let Some(existing_position) = self.positions.get_mut(&symbol) {
                    let total_size = existing_position.size + fill_size;
                    let old_val = existing_position.entry_price * existing_position.size;
                    let new_val = fill_price * fill_size;
                    let avg_price = if total_size.is_zero() {
                        Decimal::ZERO
                    } else {
                        (old_val + new_val) / total_size
                    };

                    existing_position.size = total_size;
                    existing_position.entry_price = avg_price;
                    existing_position.fees_paid += fee;

                    if let Err(e) = self.persistence.save_position(existing_position) {
                        error!("Failed to persist position update {}: {}", symbol, e);
                    }
                    events.push(ExecutionEvent::Updated(existing_position.clone()));
                }
            } else {
                // Flip / Reduce Logic
                let existing_size = existing_position.size;
                if fill_size <= existing_size {
                    // Reduce
                    if let Some(existing_position_mut) = self.positions.get_mut(&symbol) {
                        existing_position_mut.fees_paid += fee;
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
                } else {
                    // Flip (Close + Open Remainder)
                    let remainder = fill_size - existing_size;
                    if let Some(existing_position_mut) = self.positions.get_mut(&symbol) {
                        existing_position_mut.fees_paid += fee;
                    }
                    if let Some(event) = self.close_position(
                        signal_id,
                        &symbol,
                        fill_price,
                        "OPPOSITE_FILL".to_string(),
                        Some(existing_size),
                        fee,
                        fee_asset.clone(),
                    ) {
                        events.push(event);
                    }

                    // Open Remainder
                    let position = Position {
                        symbol: symbol.clone(),
                        side: side.clone(),
                        size: remainder,
                        entry_price: fill_price,
                        stop_loss,
                        take_profits: take_profits.clone(),
                        signal_id: signal_id.to_string(),
                        opened_at: self.ctx.time.now(),
                        regime_state,
                        phase,
                        metadata: intent.metadata.clone(),
                        exchange: Some("BYBIT".to_string()),
                        position_mode: Some("ONE_WAY".to_string()),
                        realized_pnl: Decimal::ZERO,
                        unrealized_pnl: Decimal::ZERO,
                        fees_paid: Decimal::ZERO,
                        funding_paid: Decimal::ZERO,
                        last_mark_price: None,
                        last_update_ts: self.ctx.time.now_millis(),
                    };

                    self.positions.insert(symbol.clone(), position.clone());
                    if let Err(e) = self.persistence.save_position(&position) {
                        error!("Failed to persist new position {}: {}", symbol, e);
                    }
                    events.push(ExecutionEvent::Opened(position));
                }
            }
        } else {
            // New Position
            let position = Position {
                symbol: symbol.clone(),
                side,
                size: fill_size,
                entry_price: fill_price,
                stop_loss,
                take_profits,
                signal_id: signal_id.to_string(),
                opened_at: self.ctx.time.now(),
                regime_state,
                phase,
                metadata: intent.metadata.clone(),
                exchange: Some("BYBIT".to_string()),
                position_mode: Some("ONE_WAY".to_string()),
                realized_pnl: Decimal::ZERO,
                unrealized_pnl: Decimal::ZERO,
                fees_paid: fee,
                funding_paid: Decimal::ZERO,
                last_mark_price: None,
                last_update_ts: self.ctx.time.now_millis(),
            };
            self.positions.insert(symbol.clone(), position.clone());
            if let Err(e) = self.persistence.save_position(&position) {
                error!("Failed to persist new position {}: {}", symbol, e);
            }
            events.push(ExecutionEvent::Opened(position));
        }

        // Final Cleanup
        if should_remove {
            self.pending_intents.remove(signal_id);
            if let Err(e) = self.persistence.delete_intent(signal_id) {
                error!("Failed to delete intent persistence {}: {}", signal_id, e);
            }
        }

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
        // 1. Get position snapshot (clone) to calculate PnL
        let position = if let Some(p) = self.positions.get(symbol) {
            p.clone()
        } else {
            warn!(signal_id = %signal_id, symbol = %symbol, "No position to close");
            return None;
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

        // Update Cash Balance (PnL - Fee)
        // Check if fee is same asset as PnL (Quote). Assuming yes for now.
        let net_pnl = pnl - fee;
        self.update_cash_balance(net_pnl);

        self.trade_history.push(trade_record.clone());
        if self.trade_history.len() > self.max_trade_history {
            self.trade_history.remove(0); // O(n) but simple for Vec. Deque might be better if frequent.
        }

        if is_partial_close {
            if let Some(real_pos) = self.positions.get_mut(symbol) {
                real_pos.size -= actual_close_size;
                if let Err(e) = self.persistence.save_position(real_pos) {
                    error!("Failed to persist partial close {}: {}", symbol, e);
                }
                info!(
                    signal_id = %signal_id,
                    symbol = %symbol,
                    remaining_size = %real_pos.size,
                    pnl = %pnl,
                    "Position partially closed"
                );
                return Some(ExecutionEvent::Updated(real_pos.clone()));
            }
            None
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

    fn update_cash_balance(&mut self, amount: Decimal) {
        self.cash_balance += amount;
        if let Err(e) = self.persistence.save_metadata(
            "cash_balance",
            serde_json::json!(self.cash_balance.to_f64().unwrap_or(0.0)),
        ) {
            error!("Failed to persist cash balance: {}", e);
        }
    }

    pub fn get_equity(&self) -> Decimal {
        let unrealized: Decimal = self.positions.values().map(|p| p.unrealized_pnl).sum();
        self.cash_balance + unrealized
    }

    pub fn get_cash_balance(&self) -> Decimal {
        self.cash_balance
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

            // Deduct funding from cash
            self.update_cash_balance(-amount);

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
            status: "PENDING".to_string(), // Default status
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

    pub fn count_open_intents_for_symbol(&self, symbol: &str) -> usize {
        self.pending_intents
            .values()
            .filter(|i| i.symbol == symbol && i.status.is_active())
            .count()
    }
}
