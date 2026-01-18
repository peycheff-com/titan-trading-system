/**
 * Portfolio Types for Titan Phase 3 - The Sentinel
 *
 * Defines position tracking, risk management, and performance metrics.
 */

/**
 * Position type classification
 */
export type PositionType = 'CORE' | 'SATELLITE' | 'VACUUM';

/**
 * Risk status levels
 */
export type RiskStatusLevel = 'HEALTHY' | 'WARNING' | 'CRITICAL';

/**
 * Trade type classification
 */
export type TradeType = 'BASIS_SCALP' | 'VACUUM_ARB' | 'REBALANCE';

/**
 * Rebalance action type
 */
export type RebalanceAction = 'TIER1' | 'TIER2' | 'COMPOUND' | 'NONE';

/**
 * Portfolio position
 */
export interface Position {
  /** Trading pair symbol */
  symbol: string;
  /** Spot position size (positive = long) */
  spotSize: number;
  /** Perpetual position size (negative = short) */
  perpSize: number;
  /** Spot entry price */
  spotEntry: number;
  /** Perpetual entry price */
  perpEntry: number;
  /** Basis at entry */
  entryBasis: number;
  /** Current basis */
  currentBasis: number;
  /** Unrealized P&L in USD */
  unrealizedPnL: number;
  /** Position type */
  type: PositionType;
}

/**
 * Portfolio health report
 */
export interface HealthReport {
  /** Net Asset Value in USD */
  nav: number;
  /** Portfolio delta (directional exposure) */
  delta: number;
  /** Current margin utilization (0-1) */
  marginUtilization: number;
  /** Overall risk status */
  riskStatus: RiskStatusLevel;
  /** All active positions */
  positions: Position[];
  /** Active alerts */
  alerts: string[];
}

/**
 * Rebalancing result
 */
export interface RebalanceResult {
  /** Action taken */
  action: RebalanceAction;
  /** Symbol affected */
  symbol: string;
  /** Amount transferred in USD */
  amountTransferred: number;
  /** New margin utilization after rebalance */
  newMarginUtilization: number;
  /** Whether rebalance was successful */
  success: boolean;
}

/**
 * Margin utilization thresholds
 */
export interface MarginThresholds {
  /** Tier 1 rebalance trigger (default: 30%) */
  tier1Trigger: number;
  /** Tier 2 rebalance trigger (default: 30% after Tier1 fails) */
  tier2Trigger: number;
  /** Profit compounding trigger (default: 5%) */
  compoundTrigger: number;
  /** Critical margin level (default: 50%) */
  criticalLevel: number;
}

/**
 * Default margin thresholds
 */
export const DEFAULT_MARGIN_THRESHOLDS: MarginThresholds = {
  tier1Trigger: 0.3,
  tier2Trigger: 0.3,
  compoundTrigger: 0.05,
  criticalLevel: 0.5,
};

/**
 * Risk limits configuration
 */
export interface RiskLimits {
  /** Maximum delta before warning (default: 2%) */
  maxDelta: number;
  /** Critical delta threshold (default: 5%) */
  criticalDelta: number;
  /** Maximum position size in USD (default: $50,000) */
  maxPositionSize: number;
  /** Maximum leverage (default: 3x) */
  maxLeverage: number;
  /** Stop loss threshold per position (default: 10%) */
  stopLossThreshold: number;
  /** Daily drawdown limit (default: 5%) */
  dailyDrawdownLimit: number;
  /** Critical drawdown threshold (default: 10%) */
  criticalDrawdown: number;
}

/**
 * Default risk limits
 */
export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxDelta: 0.02,
  criticalDelta: 0.05,
  maxPositionSize: 50000,
  maxLeverage: 3,
  stopLossThreshold: 0.1,
  dailyDrawdownLimit: 0.05,
  criticalDrawdown: 0.1,
};

/**
 * Risk status report
 */
export interface RiskStatus {
  /** Whether all limits are within bounds */
  withinLimits: boolean;
  /** List of violated limits */
  violations: string[];
  /** Current portfolio delta */
  delta: number;
  /** Current leverage */
  leverage: number;
  /** Current drawdown */
  drawdown: number;
}

/**
 * Trade record for performance tracking
 */
export interface Trade {
  /** Unique trade ID */
  id: string;
  /** Trading pair symbol */
  symbol: string;
  /** Trade type */
  type: TradeType;
  /** Entry timestamp */
  entryTime: number;
  /** Exit timestamp */
  exitTime: number;
  /** Entry Price */
  entryPrice: number;
  /** Basis at entry */
  entryBasis: number;
  /** Basis at exit */
  exitBasis: number;
  /** Position size in base asset */
  size: number;
  /** Realized P&L in USD */
  realizedPnL: number;
  /** Total fees paid */
  fees: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /** Total deployed capital in USD */
  totalDeployed: number;
  /** Average funding rate APY */
  avgFundingAPY: number;
  /** Basis scalping P&L in last 24h */
  basisScalpingPnL24h: number;
  /** Total yield in last 24h */
  totalYield24h: number;
  /** Sharpe ratio (annualized) */
  sharpeRatio: number;
  /** Maximum drawdown */
  maxDrawdown: number;
  /** Win rate (0-1) */
  winRate: number;
  /** Total number of trades */
  totalTrades: number;
}
