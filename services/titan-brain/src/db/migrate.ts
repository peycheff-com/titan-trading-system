/**
 * Database Migration Runner
 * Executes migrations in order
 */

// Load environment variables from .env file
import 'dotenv/config';

import { Pool } from 'pg';
import { DatabaseManager } from './DatabaseManager.js';
import * as migration001 from './migrations/001_initial_schema.js';

interface Migration {
  version: number;
  name: string;
  up: (pool: Pool) => Promise<void>;
  down: (pool: Pool) => Promise<void>;
}

const migrations: Migration[] = [migration001];

/**
 * Run all pending migrations
 */
export async function runMigrations(db: DatabaseManager): Promise<void> {
  // For Railway environment, we DO want to run migrations now that we have persistent storage
  // if (process.env.RAILWAY_ENVIRONMENT) {
  //   console.log('🚂 Railway environment detected, skipping database migrations');
  //   return;
  // }

  // Create migrations table if not exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get applied migrations
  const result = await db.query<{ version: number }>(
    'SELECT version FROM migrations ORDER BY version',
  );
  const appliedVersions = new Set(result.rows.map((r) => r.version));

  // Run pending migrations
  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`Running migration ${migration.version}: ${migration.name}`);

      // For SQLite compatibility, we'll run migrations through DatabaseManager
      // instead of directly on the pool
      try {
        // Check if we have a pool (PostgreSQL)
        const pool = db.getPool();
        if (pool) {
          // Verify we really are on Postgres
          // Run migration via its native up() function
          await migration.up(pool);
        } else if (db.isConnected()) {
          // SQLite fallback (original logic)
          // Run migration SQL directly through DatabaseManager
          await runMigrationSQL(db, migration.version);
        }
      } catch (error) {
        console.error(`Migration ${migration.version} failed:`, error);
        throw error;
      }

      await db.query('INSERT INTO migrations (version, name) VALUES ($1, $2)', [
        migration.version,
        migration.name,
      ]);

      console.log(`Migration ${migration.version} completed`);
    }
  }

  console.log('All migrations completed');
}

/**
 * Run migration SQL for a specific version
 */
async function runMigrationSQL(db: DatabaseManager, version: number): Promise<void> {
  if (version === 1) {
    // Initial schema migration
    await db.query(`
      CREATE TABLE IF NOT EXISTS brain_decisions (
        id INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        phase_id TEXT NOT NULL,
        decision_type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS phase_performance (
        id INTEGER PRIMARY KEY,
        phase_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        equity REAL NOT NULL,
        pnl REAL NOT NULL,
        drawdown REAL NOT NULL,
        win_rate REAL NOT NULL,
        sharpe_ratio REAL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS risk_snapshots (
        id INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        total_exposure REAL NOT NULL,
        max_drawdown REAL NOT NULL,
        correlation_matrix TEXT,
        risk_score REAL NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS allocation_vectors (
        id INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        phase_allocations TEXT NOT NULL,
        total_equity REAL NOT NULL,
        leverage_utilization REAL NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Add missing tables from schema.sql
    await db.query(`
      CREATE TABLE IF NOT EXISTS phase_trades (
        id INTEGER PRIMARY KEY,
        phase_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        pnl REAL NOT NULL,
        symbol TEXT,
        side TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS allocation_history (
        id INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        equity REAL NOT NULL,
        w1 REAL NOT NULL,
        w2 REAL NOT NULL,
        w3 REAL NOT NULL,
        tier TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS treasury_operations (
        id INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        operation_type TEXT NOT NULL,
        amount REAL NOT NULL,
        from_wallet TEXT NOT NULL,
        to_wallet TEXT NOT NULL,
        reason TEXT,
        high_watermark REAL NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS high_watermark (
        id INTEGER PRIMARY KEY,
        value REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS system_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS manual_overrides (
        id INTEGER PRIMARY KEY,
        operator_id TEXT NOT NULL,
        original_allocation TEXT NOT NULL,
        override_allocation TEXT NOT NULL,
        reason TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        expires_at INTEGER,
        deactivated_by TEXT,
        deactivated_at INTEGER,
        expired_at INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS operators (
        id INTEGER PRIMARY KEY,
        operator_id TEXT UNIQUE NOT NULL,
        hashed_password TEXT NOT NULL,
        permissions TEXT NOT NULL DEFAULT '[]',
        last_login INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create indexes
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON brain_decisions(timestamp)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_decisions_phase_id ON brain_decisions(phase_id)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_performance_phase_timestamp ON phase_performance(phase_id, timestamp)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_risk_snapshots_timestamp ON risk_snapshots(timestamp)`,
    );
    await db.query(
      `CREATE INDEX IF NOT EXISTS idx_allocation_vectors_timestamp ON allocation_vectors(timestamp)`,
    );
  }
}

/**
 * Rollback the last migration
 */
export async function rollbackMigration(db: DatabaseManager): Promise<void> {
  // Get last applied migration
  const result = await db.query<{ version: number }>(
    'SELECT version FROM migrations ORDER BY version DESC LIMIT 1',
  );

  if (result.rows.length === 0) {
    console.log('No migrations to rollback');
    return;
  }

  const lastVersion = result.rows[0].version;
  const migration = migrations.find((m) => m.version === lastVersion);

  if (!migration) {
    throw new Error(`Migration ${lastVersion} not found`);
  }

  console.log(`Rolling back migration ${migration.version}: ${migration.name}`);

  // For SQLite compatibility, we'll handle rollback through DatabaseManager
  // For now, just remove the migration record (tables will remain)
  console.log('Note: Table rollback not implemented for SQLite compatibility');

  await db.query('DELETE FROM migrations WHERE version = $1', [lastVersion]);

  console.log(`Migration ${migration.version} rolled back`);
}

// CLI entry point
if (process.argv[1]?.endsWith('migrate.js')) {
  const command = process.argv[2] || 'up';

  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'titan_brain',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    maxConnections: 10,
    idleTimeout: 30000,
  };

  const db = new DatabaseManager(config);

  (async () => {
    try {
      await db.connect();

      if (command === 'up') {
        await runMigrations(db);
      } else if (command === 'down') {
        await rollbackMigration(db);
      } else {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }

      await db.disconnect();
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  })();
}
