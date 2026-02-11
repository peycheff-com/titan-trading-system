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
  /** Target price (take profit) */
  targetPrice?: number;
  /** Estimated confidence score (0-100) */
  confidence?: number;
  /** Expected edge/profit margin for this trade (e.g. 0.005 for 0.5%) */
  expectedEdge?: number;
  /** Optional: latency profile for feedback loop */
  latencyProfile?: {
    transit: number;
    processing: number;
    endToEnd: number;
  };
  /** Exchange where this signal should be executed */
  exchange?: string;
  /** Position mode (One-Way vs Hedge) */
  positionMode?: 'ONE_WAY' | 'HEDGE';
  /** Intent Type */
  type?: 'MANUAL' | 'STRATEGY' | 'RECONCILIATION' | 'LIQUIDATION';
  /** Trap Type for Bayesian Calibration (Phase 1) */
  trap_type?: string;
  /** Policy Hash for Truth Verification (Risk Immune System) */
  policy_hash?: string;
  /** Additional metadata (source, velocity, orderType, etc.) */
  metadata?: Record<string, unknown>;
}

// RiskPolicy for BudgetService broadcast (snake_case to match legacy NATS consumers)
export interface RiskPolicy {
  current_state: RiskPolicyState;
  max_position_notional: number;
  max_account_leverage: number;
  max_daily_loss: number;
  max_open_orders_per_symbol: number;
  symbol_whitelist: string[];
  max_slippage_bps: number;
  max_staleness_ms: number;
}

export enum RiskPolicyState {
  Normal = 'Normal',
  Cautious = 'Cautious',
  Defensive = 'Defensive',
  Emergency = 'Emergency',
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
  /** Exchange where position is held */
  exchange?: string;
  /** Position mode (One-Way vs Hedge) */
  positionMode?: 'ONE_WAY' | 'HEDGE';
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
  var95?: number;
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
import { RiskPolicyV1 } from '@titan/shared';

/**
 * Risk guardian configuration
 * Extends Unified Risk Policy V1 with Brain-specific settings
 */
export interface RiskGuardianConfig extends RiskPolicyV1 {
  /** Interval for beta updates (ms) */
  betaUpdateInterval: number;
  /** Correlation matrix update interval (ms) */
  correlationUpdateInterval: number;
  /** Confidence score configuration (Detailed) */
  confidence: ConfidenceScoreConfig;
  /** Fractal risk constraints per phase */
  fractal: {
    [key: string]: PhaseRiskConstraints;
  };
  riskAversionLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Cost-Ensure Veto Configuration */
  costVeto?: {
    enabled: boolean;
    minExpectancyRatio: number; // e.g. 5.0 (Expected Profit must be > 5x Cost)
    baseFeeBps: number; // e.g. 6 bps (Taker + Spread)
  };
  /** Feature Flags */
  features?: {
    disableTruthGating?: boolean;
    [key: string]: boolean | undefined;
  };
}

/**
 * Phase Risk Constraints
 */
export interface PhaseRiskConstraints {
  maxLeverage: number;
  maxDrawdown: number;
  maxAllocation: number;
}

/**
 * Confidence Score Configuration
 */
export interface ConfidenceScoreConfig {
  decayRate: number; // Rate at which confidence decays on drift
  recoveryRate: number; // Rate at which confidence recovers
  threshold: number; // Minimum confidence to allow trading
}

/**
 * Metrics from PowerLaw Lab (Tail Risk & Volatility)
 */
export interface PowerLawMetrics {
  symbol: string;
  tailExponent: number; // Hill alpha
  tailConfidence: number;
  exceedanceProbability: number; // POT
  volatilityCluster: {
    state: string;
    persistence: number;
    sigma: number;
  };
  timestamp: number;
}

/**
 * Integrated Risk State for Observability
 */
export interface RiskGuardianState {
  config: RiskGuardianConfig;
  metrics: {
    currentEquity: number;
    portfolioBeta: number;
    maxDrawdown: number;
  };
  regime: string; // RegimeState enum not imported here to avoid cycles, using string
  powerLaw: Record<string, PowerLawMetrics>;
  circuitBreaker: {
    active: boolean;
    reason?: string;
    tripCount: number;
    lastTripTime?: number;
  };
}

export const _forceEmit = true;
