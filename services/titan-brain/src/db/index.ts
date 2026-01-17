/**
 * Database Layer Barrel Export
 * Exports DatabaseManager and all repositories
 *
 * Requirements: 1.8, 2.7, 4.7, 5.7, 9.1, 9.2, 9.3, 9.6
 */

export {
  DatabaseManager,
  DatabaseError,
  QueryMetrics,
  TransactionCallback,
} from './DatabaseManager.js';
export { runMigrations, rollbackMigration } from './migrate.js';
export {
  BaseRepository,
  AllocationRepository,
  PerformanceRepository,
  DecisionRepository,
  TreasuryRepository,
  BreakerRepository,
  RiskRepository,
} from './repositories/index.js';
export { OptimizedQueries } from './OptimizedQueries.js';
