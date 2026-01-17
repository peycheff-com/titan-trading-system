/**
 * Order Types for Titan Phase 3 - The Sentinel
 *
 * Defines order structures, execution results, and TWAP execution types.
 */

/**
 * Order side
 */
export type OrderSide = 'BUY' | 'SELL';

/**
 * Order type
 */
export type OrderType = 'MARKET' | 'LIMIT';

/**
 * Time in force for orders
 */
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

/**
 * Order status
 */
export type OrderStatus = 'FILLED' | 'PARTIAL' | 'FAILED' | 'PENDING' | 'CANCELLED';

/**
 * Order request structure
 */
export interface Order {
  /** Trading pair symbol */
  symbol: string;
  /** Order side */
  side: OrderSide;
  /** Order type */
  type: OrderType;
  /** Order size in base asset */
  size: number;
  /** Limit price (required for LIMIT orders) */
  price?: number;
  /** Time in force */
  timeInForce?: TimeInForce;
}

/**
 * Order execution result
 */
export interface OrderResult {
  /** Exchange order ID */
  orderId: string;
  /** Order status */
  status: OrderStatus;
  /** Filled size */
  filledSize: number;
  /** Average fill price */
  avgPrice: number;
  /** Total fees paid */
  fees: number;
  /** Execution timestamp */
  timestamp: number;
}

/**
 * Atomic execution result for paired spot/perp trades
 */
export interface ExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Spot leg result */
  spotResult?: OrderResult;
  /** Perpetual leg result */
  perpResult?: OrderResult;
  /** Total execution cost including fees */
  totalCost: number;
  /** Effective basis captured */
  effectiveBasis: number;
  /** Whether execution was aborted */
  aborted: boolean;
  /** Reason for failure or abort */
  reason?: string;
}

/**
 * TWAP clip execution result
 */
export interface ClipResult {
  /** Clip number in sequence */
  clipNumber: number;
  /** Clip size */
  size: number;
  /** Execution price */
  price: number;
  /** Slippage from expected price */
  slippage: number;
  /** Execution timestamp */
  timestamp: number;
}

/**
 * TWAP execution result
 */
export interface TwapResult {
  /** Total filled quantity */
  totalFilled: number;
  /** Volume-weighted average price */
  avgPrice: number;
  /** Total fees paid */
  totalFees: number;
  /** Individual clip results */
  clips: ClipResult[];
  /** Whether execution was aborted */
  aborted: boolean;
  /** Reason for abort if applicable */
  reason?: string;
}

/**
 * TWAP execution configuration
 */
export interface TwapConfig {
  /** Maximum clip size in USD (default: $500) */
  maxClipSize: number;
  /** Minimum interval between clips in ms (default: 30000) */
  minInterval: number;
  /** Maximum interval between clips in ms (default: 90000) */
  maxInterval: number;
  /** Maximum allowed slippage per clip (default: 0.002 = 0.2%) */
  maxSlippage: number;
}

/**
 * Default TWAP configuration
 */
export const DEFAULT_TWAP_CONFIG: TwapConfig = {
  maxClipSize: 500,
  minInterval: 30000,
  maxInterval: 90000,
  maxSlippage: 0.002,
};
