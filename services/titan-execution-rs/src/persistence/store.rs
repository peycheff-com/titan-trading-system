use std::sync::Arc;
use crate::model::{Intent, Position, TradeRecord};
use crate::persistence::redb_store::{RedbStore, StoreError};
use crate::persistence::wal::{WalManager, WalEntry};
use redb::{TableDefinition, ReadableTable};

// Tables
const POSITIONS_TABLE: TableDefinition<&str, Vec<u8>> = TableDefinition::new("positions");
const INTENTS_TABLE: TableDefinition<&str, Vec<u8>> = TableDefinition::new("intents");
const TRADES_TABLE: TableDefinition<&str, Vec<u8>> = TableDefinition::new("trades");

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

    pub fn save_intent(&self, intent: &Intent) -> Result<(), StoreError> {
        // WAL first
        self.wal.append(&WalEntry::IntentReceived(intent.clone()))?;

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

    pub fn log_order_placed(&self, signal_id: String, exchange: String, client_order_id: String, payload: serde_json::Value) -> Result<(), StoreError> {
        self.wal.append(&WalEntry::OrderPlaced {
            signal_id,
            exchange,
            client_order_id,
            request_payload: payload,
        })?;
        Ok(())
    }
}
