/**
 * Performance Types for Titan Brain
 * Defines types for performance tracking and throttling
 */

/**
 * Phase identifier
 */
export type PhaseId = "phase1" | "phase2" | "phase3";

/**
 * Trade record for performance tracking
 */
export interface TradeRecord {
  id?: number;
  phaseId: PhaseId;
  pnl: number;
  timestamp: number;
  symbol?: string;
  side?: "BUY" | "SELL";
}

/**
 * Phase performance metrics
 */
export interface PhasePerformance {
  phaseId: PhaseId;
  sharpeRatio: number;
  totalPnL: number;
  tradeCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  /** Performance modifier (0.5x malus to 1.2x bonus) */
  modifier: number;
}

/**
 * Performance tracker configuration
 */
export interface PerformanceTrackerConfig {
  /** Rolling window for Sharpe calculation (days) */
  windowDays: number;
  /** Minimum trades required before applying modifiers */
  minTradeCount: number;
  /** Multiplier for underperforming phases (Sharpe < 0) */
  malusMultiplier: number;
  /** Multiplier for outperforming phases (Sharpe > 2.0) */
  bonusMultiplier: number;
  /** Sharpe threshold for malus */
  malusThreshold: number;
  /** Sharpe threshold for bonus */
  bonusThreshold: number;
}

/**
 * Performance record for database persistence
 */
export interface PerformanceRecord {
  id?: number;
  phaseId: PhaseId;
  timestamp: number;
  pnl: number;
  tradeCount: number;
  sharpeRatio: number | null;
  modifier: number;
}

/**
 * Execution Report from Titan Execution
 */
export interface ExecutionReport {
  type: string;
  phaseId: PhaseId;
  signalId?: string;
  symbol: string;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  fee?: number;
  feeCurrency?: string;
  executionId?: string;
  orderId?: string;
  realizedPnL?: number;
  timestamp: number;
}
