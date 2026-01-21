/**
 * Migration 007: PowerLaw Metrics
 * Creates table for storing PowerLaw Lab metrics (Tail Risk & Volatility)
 */

import { Pool } from "pg";

export const up = async (pool: Pool): Promise<void> => {
    // PowerLaw metrics history
    await pool.query(`
    CREATE TABLE IF NOT EXISTS powerlaw_metrics (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL,
      tail_exponent DECIMAL(5, 4) NOT NULL,
      tail_confidence DECIMAL(5, 4) NOT NULL,
      exceedance_probability DECIMAL(5, 4) NOT NULL,
      vol_state VARCHAR(20) NOT NULL,
      vol_persistence DECIMAL(5, 4) NOT NULL,
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_powerlaw_metrics_timestamp ON powerlaw_metrics(timestamp DESC);
  `);

    await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_powerlaw_metrics_symbol_time ON powerlaw_metrics(symbol, timestamp DESC);
  `);

    await pool.query(`
    ALTER TABLE powerlaw_metrics ENABLE ROW LEVEL SECURITY;
  `);
};

export const down = async (pool: Pool): Promise<void> => {
    await pool.query(`
    DROP TABLE IF EXISTS powerlaw_metrics;
  `);
};

export const version = 7;
export const name = "powerlaw_metrics";
