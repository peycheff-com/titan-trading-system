/**
 * Migration 001: Initial Schema
 * Creates all tables for Titan Brain
 */

import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const up = async (pool: Pool): Promise<void> => {
  const schemaPath = join(__dirname, '..', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  
  await pool.query(schema);
  
  // Insert initial high watermark
  await pool.query(`
    INSERT INTO high_watermark (value, updated_at)
    VALUES (200.00, $1)
    ON CONFLICT DO NOTHING
  `, [Date.now()]);
  
  // Insert initial system state
  await pool.query(`
    INSERT INTO system_state (key, value, updated_at)
    VALUES 
      ('allocation_vector', '{"w1": 1.0, "w2": 0.0, "w3": 0.0, "timestamp": 0}', $1),
      ('circuit_breaker', '{"active": false}', $1)
    ON CONFLICT (key) DO NOTHING
  `, [Date.now()]);
};

export const down = async (pool: Pool): Promise<void> => {
  await pool.query(`
    DROP TABLE IF EXISTS operators;
    DROP TABLE IF EXISTS manual_overrides;
    DROP TABLE IF EXISTS system_state;
    DROP TABLE IF EXISTS high_watermark;
    DROP TABLE IF EXISTS risk_snapshots;
    DROP TABLE IF EXISTS circuit_breaker_events;
    DROP TABLE IF EXISTS treasury_operations;
    DROP TABLE IF EXISTS brain_decisions;
    DROP TABLE IF EXISTS phase_performance;
    DROP TABLE IF EXISTS phase_trades;
    DROP TABLE IF EXISTS allocation_history;
  `);
};

export const version = 1;
export const name = 'initial_schema';
