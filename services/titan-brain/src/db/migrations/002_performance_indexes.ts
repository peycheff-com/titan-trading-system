/**
 * Migration 002: Performance Indexes
 * Adds additional indexes for query optimization
 * 
 * Requirements: 2.2, 9.1
 */

import { Pool } from 'pg';

export const up = async (pool: Pool): Promise<void> => {
  // Composite index for Sharpe ratio calculation query
  // Optimizes: SELECT pnl FROM phase_trades WHERE phase_id = ? AND timestamp >= ? ORDER BY timestamp
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_phase_trades_sharpe_calc 
    ON phase_trades(phase_id, timestamp DESC, pnl);
  `);

  // Index for trade count queries
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_phase_trades_count 
    ON phase_trades(phase_id, timestamp);
  `);

  // Index for allocation history lookups by tier
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_allocation_history_tier 
    ON allocation_history(tier, timestamp DESC);
  `);

  // Index for brain decisions by approval status
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_brain_decisions_approved 
    ON brain_decisions(approved, timestamp DESC);
  `);

  // Index for recent decisions query
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_brain_decisions_recent 
    ON brain_decisions(timestamp DESC) 
    INCLUDE (signal_id, phase_id, approved, reason);
  `);

  // Index for treasury operations by type
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_treasury_operations_type 
    ON treasury_operations(operation_type, timestamp DESC);
  `);

  // Index for circuit breaker events by type
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_circuit_breaker_type 
    ON circuit_breaker_events(event_type, timestamp DESC);
  `);

  // Index for risk snapshots - covering index for dashboard queries
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_risk_snapshots_dashboard 
    ON risk_snapshots(timestamp DESC) 
    INCLUDE (global_leverage, net_delta, correlation_score, portfolio_beta);
  `);

  // Partial index for active manual overrides
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_manual_overrides_active_only 
    ON manual_overrides(timestamp DESC) 
    WHERE active = true;
  `);

  // Index for phase performance aggregation
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_phase_performance_agg 
    ON phase_performance(phase_id, timestamp DESC) 
    INCLUDE (sharpe_ratio, modifier, trade_count);
  `);
};

export const down = async (pool: Pool): Promise<void> => {
  await pool.query(`
    DROP INDEX IF EXISTS idx_phase_trades_sharpe_calc;
    DROP INDEX IF EXISTS idx_phase_trades_count;
    DROP INDEX IF EXISTS idx_allocation_history_tier;
    DROP INDEX IF EXISTS idx_brain_decisions_approved;
    DROP INDEX IF EXISTS idx_brain_decisions_recent;
    DROP INDEX IF EXISTS idx_treasury_operations_type;
    DROP INDEX IF EXISTS idx_circuit_breaker_type;
    DROP INDEX IF EXISTS idx_risk_snapshots_dashboard;
    DROP INDEX IF EXISTS idx_manual_overrides_active_only;
    DROP INDEX IF EXISTS idx_phase_performance_agg;
  `);
};

export const version = 2;
export const name = 'performance_indexes';
