/**
 * Database Layer Barrel Export
 * Exports DatabaseManager and all repositories
 *
 * Requirements: 1.8, 2.7, 4.7, 5.7, 9.1, 9.2, 9.3, 9.6
 */

export {
  DatabaseError,
  DatabaseManager,
  QueryMetrics,
  TransactionCallback,
} from './DatabaseManager.js';
export { rollbackMigration, runMigrations } from './migrate.js';
export {
  AllocationRepository,
  BaseRepository,
  BreakerRepository,
  DecisionRepository,
  PerformanceRepository,
  PowerLawRepository,
  RiskRepository,
  TreasuryRepository,
} from './repositories/index.js';
export { OptimizedQueries } from './OptimizedQueries.js';
