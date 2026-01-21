/**
 * Migration 003: Disable RLS
 * Temporarily disables Row Level Security issues to ensure application access
 * until a robust role-based policy system is defined.
 */

import { Pool } from 'pg';

export const up = async (pool: Pool): Promise<void> => {
  const tables = [
    'allocation_history',
    'phase_trades',
    'phase_performance',
    'brain_decisions',
    'treasury_operations',
    'circuit_breaker_events',
    'risk_snapshots',
    'high_watermark',
    'system_state',
    'manual_overrides',
    'operators',
    'fills',
  ];

  for (const table of tables) {
    try {
      await pool.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
    } catch (e) {
      // @ts-expect-error - Ignoring type check for raw query execution
      console.warn(`Could not disable RLS for ${table}: ${e.message}`);
    }
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const tables = [
    'allocation_history',
    'phase_trades',
    'phase_performance',
    'brain_decisions',
    'treasury_operations',
    'circuit_breaker_events',
    'risk_snapshots',
    'high_watermark',
    'system_state',
    'manual_overrides',
    'operators',
    'fills',
  ];

  for (const table of tables) {
    await pool.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
  }
};

export const version = 3;
export const name = 'disable_rls';
