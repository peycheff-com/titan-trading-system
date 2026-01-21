use redb::Database;
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
}
