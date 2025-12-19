/**
 * Brain Types for Titan Brain
 * Defines types for the main orchestrator
 */

import { AllocationVector } from './allocation.js';
import { PhasePerformance, PhaseId } from './performance.js';
import { RiskDecision, RiskMetrics, IntentSignal } from './risk.js';
import { TreasuryStatus } from './capital.js';
import { BreakerStatus } from './breaker.js';

/**
 * Brain decision result
 */
export interface BrainDecision {
  signalId: string;
  approved: boolean;
  authorizedSize: number;
  reason: string;
  allocation: AllocationVector;
  performance: PhasePerformance;
  risk: RiskDecision;
  timestamp: number;
}

/**
 * Brain decision record for persistence
 */
export interface DecisionRecord {
  id?: number;
  signalId: string;
  phaseId: PhaseId;
  timestamp: number;
  approved: boolean;
  requestedSize: number;
  authorizedSize: number | null;
  reason: string;
  riskMetrics: RiskMetrics | null;
}

/**
 * Dashboard data aggregation
 */
export interface DashboardData {
  /** Net Asset Value */
  nav: number;
  /** Current allocation vector */
  allocation: AllocationVector;
  /** Equity allocated to each phase */
  phaseEquity: Record<PhaseId, number>;
  /** Current risk metrics */
  riskMetrics: {
    globalLeverage: number;
    netDelta: number;
    correlationScore: number;
    portfolioBeta: number;
  };
  /** Treasury status */
  treasury: TreasuryStatus;
  /** Circuit breaker status */
  circuitBreaker: BreakerStatus;
  /** Recent brain decisions */
  recentDecisions: BrainDecision[];
  /** Last update timestamp */
  lastUpdated: number;
  /** Manual override status */
  manualOverride?: {
    active: boolean;
    operatorId: string;
    reason: string;
    allocation: AllocationVector;
    expiresAt?: number;
  } | null;
  /** Warning banner active flag */
  warningBannerActive?: boolean;
}

/**
 * Health status for system monitoring
 */
export interface HealthStatus {
  healthy: boolean;
  components: {
    database: boolean;
    redis: boolean;
    executionEngine: boolean;
    phases: Record<PhaseId, boolean>;
  };
  lastCheck: number;
  errors: string[];
}

/**
 * Signal queue entry
 */
export interface QueuedSignal {
  signal: IntentSignal;
  priority: number;
  enqueuedAt: number;
}

/**
 * Brain configuration
 */
export interface BrainConfig {
  /** Signal processing timeout (ms) */
  signalTimeout: number;
  /** Metric update interval (ms) */
  metricUpdateInterval: number;
  /** Dashboard data cache TTL (ms) */
  dashboardCacheTTL: number;
  /** Maximum signals in queue */
  maxQueueSize: number;
}
