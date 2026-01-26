/**
 * Capital Flow Types for Titan Brain
 * Defines types for profit sweeping and treasury management
 */

/**
 * Sweep decision result
 */
export interface SweepDecision {
  shouldSweep: boolean;
  amount: number;
  reason: string;
  futuresBalance: number;
  targetAllocation: number;
}

/**
 * Sweep execution result
 */
export interface SweepResult {
  success: boolean;
  amount: number;
  transactionId?: string;
  error?: string;
  timestamp: number;
}

/**
 * Treasury status snapshot
 */
export interface TreasuryStatus {
  /** Futures wallet balance (risky capital) */
  futuresWallet: number;
  /** Spot wallet balance (safe capital) */
  spotWallet: number;
  /** Total amount swept to spot since inception */
  totalSwept: number;
  /** Highest recorded equity */
  highWatermark: number;
  /** Locked profit (total swept amount) */
  lockedProfit: number;
  /** Risk capital (futures wallet balance) */
  riskCapital: number;
}

/**
 * Treasury operation record for persistence
 */
export interface TreasuryOperation {
  id?: number;
  timestamp: number;
  operationType: 'SWEEP' | 'MANUAL_TRANSFER';
  amount: number;
  fromWallet: 'FUTURES' | 'SPOT';
  toWallet: 'FUTURES' | 'SPOT';
  reason?: string;
  highWatermark: number;
}

/**
 * Capital flow manager configuration
 */
export interface CapitalFlowConfig {
  /** Threshold for sweep trigger (1.2 = 20% excess) */
  sweepThreshold: number;
  /** Minimum balance that cannot be swept */
  reserveLimit: number;
  /** Cron expression for scheduled sweeps */
  sweepSchedule: string;
  /** Maximum retry attempts for failed sweeps */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  retryBaseDelay: number;
}

export const _forceEmit = true;
