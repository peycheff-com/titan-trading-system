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

const migrations: Migration[] = [
  migration001,
];

/**
 * Run all pending migrations
 */
export async function runMigrations(db: DatabaseManager): Promise<void> {
  const pool = db.getPool();

  // Create migrations table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Get applied migrations
  const result = await pool.query<{ version: number }>(
    'SELECT version FROM migrations ORDER BY version'
  );
  const appliedVersions = new Set(result.rows.map(r => r.version));

  // Run pending migrations
  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      console.log(`Running migration ${migration.version}: ${migration.name}`);
      
      await migration.up(pool);
      
      await pool.query(
        'INSERT INTO migrations (version, name) VALUES ($1, $2)',
        [migration.version, migration.name]
      );
      
      console.log(`Migration ${migration.version} completed`);
    }
  }

  console.log('All migrations completed');
}

/**
 * Rollback the last migration
 */
export async function rollbackMigration(db: DatabaseManager): Promise<void> {
  const pool = db.getPool();

  // Get last applied migration
  const result = await pool.query<{ version: number }>(
    'SELECT version FROM migrations ORDER BY version DESC LIMIT 1'
  );

  if (result.rows.length === 0) {
    console.log('No migrations to rollback');
    return;
  }

  const lastVersion = result.rows[0].version;
  const migration = migrations.find(m => m.version === lastVersion);

  if (!migration) {
    throw new Error(`Migration ${lastVersion} not found`);
  }

  console.log(`Rolling back migration ${migration.version}: ${migration.name}`);
  
  await migration.down(pool);
  
  await pool.query('DELETE FROM migrations WHERE version = $1', [lastVersion]);
  
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
