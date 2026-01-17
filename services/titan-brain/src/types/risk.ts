/**
 * Risk Types for Titan Brain
 * Defines types for risk management and correlation guards
 */

import { PhaseId } from './performance.js';

/**
 * Intent signal from a phase requesting execution
 */
export interface IntentSignal {
  signalId: string;
  phaseId: PhaseId;
  symbol: string;
  side: 'BUY' | 'SELL';
  /** Requested position size in USD notional */
  requestedSize: number;
  timestamp: number;
  /** Optional: leverage requested */
  leverage?: number;
  /** Target entry price (required for stop distance checks) */
  entryPrice?: number;
  /** Optional: calculated volatility (ATR) associated with signal */
  volatility?: number;
  /** Optional: stop loss distance or price */
  /** Optional: stop loss distance or price */
  stopLossPrice?: number;
  /** Optional: latency profile for feedback loop */
  latencyProfile?: {
    transit: number;
    processing: number;
    endToEnd: number;
  };
}

/**
 * Current position state
 */
export interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  /** Position size in USD notional */
  size: number;
  /** Entry price */
  entryPrice: number;
  /** Current unrealized PnL */
  unrealizedPnL: number;
  /** Leverage used */
  leverage: number;
  /** Phase that opened this position */
  phaseId: PhaseId;
}

/**
 * Risk metrics snapshot
 */
export interface RiskMetrics {
  currentLeverage: number;
  projectedLeverage: number;
  correlation: number;
  portfolioDelta: number;
  portfolioBeta: number;
}

/**
 * Risk decision result
 */
export interface RiskDecision {
  approved: boolean;
  reason: string;
  /** Adjusted size if approved with reduction */
  adjustedSize?: number;
  riskMetrics: RiskMetrics;
}

/**
 * Risk snapshot for database persistence
 */
export interface RiskSnapshot {
  id?: number;
  timestamp: number;
  globalLeverage: number;
  netDelta: number;
  correlationScore: number;
  portfolioBeta: number;
  var95: number;
}

/**
 * Risk guardian configuration
 */
export interface RiskGuardianConfig {
  /** Maximum correlation before flagging high-risk */
  maxCorrelation: number;
  /** Size reduction penalty for high correlation */
  correlationPenalty: number;
  /** Interval for beta updates (ms) */
  betaUpdateInterval: number;
  /** Correlation matrix update interval (ms) */
  correlationUpdateInterval: number;
  /** Minimum stop distance multiplier (x ATR) */
  minStopDistanceMultiplier: number;
}
