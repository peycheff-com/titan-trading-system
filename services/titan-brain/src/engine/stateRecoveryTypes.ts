/**
 * State Recovery Types
 *
 * Extracted to avoid circular dependencies between
 * StateRecoveryService and FileSystemBackupService.
 */

import {
  AllocationVector,
  PhaseId,
  PhasePerformance,
  Position,
  RiskMetrics,
} from '../types/index.js';

/**
 * State recovered from database or backup on startup
 */
export interface RecoveredState {
  allocation: AllocationVector | null;
  performance: Record<PhaseId, PhasePerformance>;
  highWatermark: number;
  riskMetrics: RiskMetrics | null;
  equity?: number;
  positions?: Position[];
  dailyStartEquity?: number;
  lastUpdated?: number;
}

/**
 * Configuration for state recovery
 */
export interface RecoveryConfig {
  performanceWindowDays: number;
  defaultAllocation: AllocationVector;
  defaultHighWatermark: number;
}
