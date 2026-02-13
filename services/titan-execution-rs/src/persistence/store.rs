use crate::model::{Intent, Position, TradeRecord};
use crate::order_fsm::OrderFsm;
use crate::persistence::redb_store::{RedbStore, StoreError};
use crate::persistence::wal::{WalEntry, WalManager};
use redb::{ReadableTable, TableDefinition};
use std::sync::Arc;

// Tables
const POSITIONS_TABLE: TableDefinition<&str, Vec<u8>> = TableDefinition::new("positions");
const INTENTS_TABLE: TableDefinition<&str, Vec<u8>> = TableDefinition::new("intents");
const TRADES_TABLE: TableDefinition<&str, Vec<u8>> = TableDefinition::new("trades");
const METADATA_TABLE: TableDefinition<&str, Vec<u8>> = TableDefinition::new("metadata");
const FSM_TABLE: TableDefinition<&str, Vec<u8>> = TableDefinition::new("order_fsm");

pub struct PersistenceStore {
    store: Arc<RedbStore>,
    wal: Arc<WalManager>,
}

impl PersistenceStore {
    pub fn new(store: Arc<RedbStore>, wal: Arc<WalManager>) -> Self {
        Self { store, wal }
    }

    pub fn load_positions(&self) -> Result<Vec<Position>, StoreError> {
        let txn = self.store.begin_read()?;
        let table = txn.open_table(POSITIONS_TABLE)?;
        let mut items = Vec::new();
        for res in table.range::<&str>(..)? {
            let (_, v) = res?;
            let item: Position = serde_json::from_slice(&v.value())?;
            items.push(item);
        }
        Ok(items)
    }

    pub fn load_intents(&self) -> Result<Vec<Intent>, StoreError> {
        let txn = self.store.begin_read()?;
        let table = txn.open_table(INTENTS_TABLE)?;
        let mut items = Vec::new();
        for res in table.range::<&str>(..)? {
            let (_, v) = res?;
            let item: Intent = serde_json::from_slice(&v.value())?;
            items.push(item);
        }
        Ok(items)
    }

    pub fn load_trades(&self) -> Result<Vec<TradeRecord>, StoreError> {
        let txn = self.store.begin_read()?;
        let table = txn.open_table(TRADES_TABLE)?;
        let mut items = Vec::new();
        for res in table.range::<&str>(..)? {
            let (_, v) = res?;
            let item: TradeRecord = serde_json::from_slice(&v.value())?;
            items.push(item);
        }
        Ok(items)
    }

    pub fn load_recent_trades(&self, limit: usize) -> Result<Vec<TradeRecord>, StoreError> {
        let txn = self.store.begin_read()?;
        let table = txn.open_table(TRADES_TABLE)?;
        let mut items = Vec::new();

        // Scan all trades
        for res in table.range::<&str>(..)? {
            let (_, v) = res?;
            let item: TradeRecord = serde_json::from_slice(&v.value())?;
            items.push(item);
        }

        // Sort by closed_at descending (newest first)
        items.sort_by(|a, b| b.closed_at.cmp(&a.closed_at));

        // Take top N
        if items.len() > limit {
            items.truncate(limit);
        }

        // Sort back to ascending for display/consistency if needed?
        // ShadowState appends new trades impacting "latest at end".
        // So we should probably return them sorted ASCENDING by time so the Vec represents history [old -> new].
        items.sort_by(|a, b| a.closed_at.cmp(&b.closed_at));

        Ok(items)
    }

    pub fn save_intent(&self, intent: &Intent) -> Result<(), StoreError> {
        // WAL first
        self.wal
            .append(&WalEntry::IntentReceived(Box::new(intent.clone())))?;

        // State update
        let txn = self.store.begin_write()?;
        {
            let mut table = txn.open_table(INTENTS_TABLE)?;
            let data = serde_json::to_vec(intent)?;
            table.insert(intent.signal_id.as_str(), data)?;
        }
        txn.commit()?;
        Ok(())
    }

    pub fn delete_intent(&self, signal_id: &str) -> Result<(), StoreError> {
        let txn = self.store.begin_write()?;
        {
            let mut table = txn.open_table(INTENTS_TABLE)?;
            table.remove(signal_id)?;
        }
        txn.commit()?;
        Ok(())
    }

    pub fn save_position(&self, position: &Position) -> Result<(), StoreError> {
        let txn = self.store.begin_write()?;
        {
            let mut table = txn.open_table(POSITIONS_TABLE)?;
            let data = serde_json::to_vec(position)?;
            table.insert(position.symbol.as_str(), data)?;
        }
        txn.commit()?;
        Ok(())
    }

    pub fn delete_position(&self, symbol: &str) -> Result<(), StoreError> {
        let txn = self.store.begin_write()?;
        {
            let mut table = txn.open_table(POSITIONS_TABLE)?;
            table.remove(symbol)?;
        }
        txn.commit()?;
        Ok(())
    }

    pub fn save_trade(&self, trade: &TradeRecord) -> Result<(), StoreError> {
        // WAL
        self.wal.append(&WalEntry::ExecutionReport {
            signal_id: trade.signal_id.clone(),
            fill_id: "trade_closed".to_string(),
            payload: serde_json::to_value(trade)?,
        })?;

        let txn = self.store.begin_write()?;
        {
            let mut table = txn.open_table(TRADES_TABLE)?;
            let data = serde_json::to_vec(trade)?;
            table.insert(trade.signal_id.as_str(), data)?;
        }
        txn.commit()?;
        Ok(())
    }

    pub fn log_order_placed(
        &self,
        signal_id: String,
        exchange: String,
        client_order_id: String,
        payload: serde_json::Value,
    ) -> Result<(), StoreError> {
        self.wal.append(&WalEntry::OrderPlaced {
            signal_id,
            exchange,
            client_order_id,
            request_payload: payload,
        })?;
        Ok(())
    }

    pub fn save_metadata(&self, key: &str, value: serde_json::Value) -> Result<(), StoreError> {
        let txn = self.store.begin_write()?;
        {
            let mut table = txn.open_table(METADATA_TABLE)?;
            let data = serde_json::to_vec(&value)?;
            table.insert(key, data)?;
        }
        txn.commit()?;
        Ok(())
    }

    pub fn load_metadata(&self, key: &str) -> Result<Option<serde_json::Value>, StoreError> {
        let txn = self.store.begin_read()?;
        let table = txn.open_table(METADATA_TABLE)?;
        let mut result_json = None;

        if let Some(v) = table.get(key)? {
            let val: serde_json::Value = serde_json::from_slice(&v.value())?;
            result_json = Some(val);
        }

        Ok(result_json)
    }

    pub fn check_idempotency(&self, key: &str, ttl_ms: i64) -> Result<bool, StoreError> {
        self.store.check_idempotency(key, ttl_ms)
    }

    pub fn set_idempotency(&self, key: &str, ttl_ms: i64) -> Result<(), StoreError> {
        self.store.set_idempotency(key, ttl_ms)
    }

    /// Persist an OrderFsm to Redb for crash recovery (Phase 3.3)
    pub fn save_fsm(&self, fsm: &OrderFsm) -> Result<(), StoreError> {
        // WAL first
        self.wal.append(&WalEntry::ExecutionReport {
            signal_id: fsm.signal_id.clone(),
            fill_id: format!("fsm_{}", fsm.state),
            payload: serde_json::to_value(fsm)?,
        })?;

        // State update
        let txn = self.store.begin_write()?;
        {
            let mut table = txn.open_table(FSM_TABLE)?;
            let data = serde_json::to_vec(fsm)?;
            table.insert(fsm.signal_id.as_str(), data)?;
        }
        txn.commit()?;
        Ok(())
    }

    /// Load an OrderFsm by signal_id for crash recovery
    pub fn load_fsm(&self, signal_id: &str) -> Result<Option<OrderFsm>, StoreError> {
        let txn = self.store.begin_read()?;
        let table = txn.open_table(FSM_TABLE)?;
        let maybe_guard = table.get(signal_id)?;
        let maybe_fsm = maybe_guard
            .map(|v| serde_json::from_slice::<OrderFsm>(&v.value()))
            .transpose()?;

        Ok(maybe_fsm)
    }

    /// Load all non-terminal FSMs (for crash recovery on startup)
    pub fn load_active_fsms(&self) -> Result<Vec<OrderFsm>, StoreError> {
        let txn = self.store.begin_read()?;
        let table = txn.open_table(FSM_TABLE)?;
        let mut items = Vec::new();
        for res in table.range::<&str>(..)? {
            let (_, v) = res?;
            let fsm: OrderFsm = serde_json::from_slice(&v.value())?;
            if !fsm.is_terminal() {
                items.push(fsm);
            }
        }
        Ok(items)
    }

    /// Delete a completed FSM from Redb (cleanup after reconciliation)
    pub fn delete_fsm(&self, signal_id: &str) -> Result<(), StoreError> {
        let txn = self.store.begin_write()?;
        {
            let mut table = txn.open_table(FSM_TABLE)?;
            table.remove(signal_id)?;
        }
        txn.commit()?;
        Ok(())
    }
}
