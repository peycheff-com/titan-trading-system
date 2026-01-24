use redb::{Database, ReadableTable, TableDefinition}; // Ensure TableDefinition and ReadableTable are imported
use tracing::warn;

const IDEMPOTENCY_TABLE: TableDefinition<&str, i64> = TableDefinition::new("idempotency_keys");

use std::path::Path;
use std::sync::Arc;
use thiserror::Error;
use tracing::info;

#[derive(Error, Debug)]
pub enum StoreError {
    #[error("Redb error: {0}")]
    Redb(#[from] redb::Error),
    #[error("Commit error: {0}")]
    Commit(#[from] redb::CommitError),
    #[error("Table error: {0}")]
    Table(#[from] redb::TableError),
    #[error("Storage error: {0}")]
    Storage(#[from] redb::StorageError),
    #[error("Transaction error: {0}")]
    Transaction(#[from] redb::TransactionError),
    #[error("Database error: {0}")]
    Database(#[from] redb::DatabaseError),
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
    #[error("Data integrity error: {0}")]
    Integrity(String),
}

pub struct RedbStore {
    db: Arc<Database>,
}

impl RedbStore {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, StoreError> {
        let db = Database::create(path)?;
        info!("📦 Redb Database opened");
        Ok(Self { db: Arc::new(db) })
    }

    pub fn begin_write(&self) -> Result<redb::WriteTransaction<'_>, StoreError> {
        Ok(self.db.begin_write()?)
    }

    pub fn begin_read(&self) -> Result<redb::ReadTransaction<'_>, StoreError> {
        Ok(self.db.begin_read()?)
    }

    pub fn check_idempotency(&self, key: &str, ttl_ms: i64) -> Result<bool, StoreError> {
        let read_txn = self.db.begin_read()?;
        let table = read_txn.open_table(IDEMPOTENCY_TABLE)?;

        let now = chrono::Utc::now().timestamp_millis();

        if let Some(expiry) = table.get(key)? {
            let expiry_ts = expiry.value();
            if expiry_ts > now {
                // Key exists and is valid -> Duplicate
                return Ok(false);
            }
        }

        // Key doesn't exist or is expired -> New
        // Need write txn to set it.
        // Note: This function only CHECKS. Setting happens in a separated write txn usually,
        // or we upgrade here. But Redb doesn't support upgrade easily.
        // We will return true if it's safe to process. Caller must write.
        Ok(true)
    }

    pub fn set_idempotency(&self, key: &str, ttl_ms: i64) -> Result<(), StoreError> {
        let write_txn = self.db.begin_write()?;
        {
            let mut table = write_txn.open_table(IDEMPOTENCY_TABLE)?;
            let now = chrono::Utc::now().timestamp_millis();
            let expiry = now + ttl_ms;
            table.insert(key, expiry)?;
        }
        write_txn.commit()?;
        Ok(())
    }
}
