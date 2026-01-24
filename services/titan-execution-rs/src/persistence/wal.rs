use crate::model::Intent;
use crate::persistence::redb_store::{RedbStore, StoreError};
use redb::{ReadableTable, TableDefinition};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::debug;

// Tables
const WAL_TABLE: TableDefinition<u64, Vec<u8>> = TableDefinition::new("wal_log");
const META_TABLE: TableDefinition<&str, Vec<u8>> = TableDefinition::new("metadata");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WalEntry {
    IntentReceived(Intent),
    OrderPlaced {
        signal_id: String,
        exchange: String,
        client_order_id: String,
        request_payload: serde_json::Value,
    },
    ExecutionReport {
        signal_id: String,
        fill_id: String,
        payload: serde_json::Value,
    },
    StateCorrection {
        signal_id: String,
        reason: String,
        payload: serde_json::Value,
    },
}

pub struct WalManager {
    store: Arc<RedbStore>,
}

impl WalManager {
    pub fn new(store: Arc<RedbStore>) -> Self {
        Self { store }
    }

    pub fn initialize(&self) -> Result<(), StoreError> {
        let txn = self.store.begin_write()?;
        {
            let _ = txn.open_table(WAL_TABLE)?;
            let _ = txn.open_table(META_TABLE)?;
        }
        txn.commit()?;
        Ok(())
    }

    pub fn append(&self, entry: &WalEntry) -> Result<u64, StoreError> {
        let txn = self.store.begin_write()?;
        let sequence_id = {
            let mut table = txn.open_table(WAL_TABLE)?;
            let last_id = table.last()?.map(|(k, _)| k.value()).unwrap_or(0);
            let new_id = last_id + 1;

            let data = serde_json::to_vec(entry)?;
            table.insert(new_id, data)?;
            new_id
        };
        txn.commit()?;

        debug!("📝 WAL Append: Seq {}", sequence_id);
        Ok(sequence_id)
    }

    pub fn read_from(&self, start_seq: u64) -> Result<Vec<(u64, WalEntry)>, StoreError> {
        let txn = self.store.begin_read()?;
        let table = txn.open_table(WAL_TABLE)?;

        let mut entries = Vec::new();
        for result in table.range(start_seq..)? {
            let (k, v) = result?;
            let entry: WalEntry = serde_json::from_slice(&v.value())?;
            entries.push((k.value(), entry));
        }
        Ok(entries)
    }
}
