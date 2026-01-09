/**
 * Polymarket Types for Titan Phase 3 - The Sentinel
 * 
 * Defines types for Polymarket latency arbitrage engine.
 */

/**
 * Polymarket market information
 */
export interface PolymarketMarket {
  /** Market condition ID */
  conditionId: string;
  /** Market question/title */
  question: string;
  /** Market end time */
  endTime: number;
  /** Whether market is active */
  active: boolean;
  /** Market liquidity in USD */
  liquidity: number;
  /** Market volume in USD */
  volume: number;
  /** Token IDs for YES/NO outcomes */
  tokens: {
    yes: string;
    no: string;
  };
}

/**
 * Polymarket order book entry
 */
export interface PolymarketOrderBookEntry {
  /** Price (0-1 representing probability) */
  price: number;
  /** Size in shares */
  size: number;
}

/**
 * Polymarket order book
 */
export interface PolymarketOrderBook {
  /** Market condition ID */
  conditionId: string;
  /** YES token order book */
  yes: {
    bids: PolymarketOrderBookEntry[];
    asks: PolymarketOrderBookEntry[];
  };
  /** NO token order book */
  no: {
    bids: PolymarketOrderBookEntry[];
    asks: PolymarketOrderBookEntry[];
  };
  /** Timestamp */
  timestamp: number;
}

/**
 * Arbitrage trigger condition
 */
export interface ArbTriggerCondition {
  /** Price change threshold (e.g., 0.01 = 1%) */
  priceChangeThreshold: number;
  /** Time window in milliseconds */
  timeWindowMs: number;
  /** Minimum probability mismatch to trigger */
  minProbabilityMismatch: number;
}

/**
 * Default arbitrage trigger conditions
 */
export const DEFAULT_ARB_TRIGGER: ArbTriggerCondition = {
  priceChangeThreshold: 0.01, // 1%
  timeWindowMs: 5000, // 5 seconds
  minProbabilityMismatch: 0.05, // 5% probability difference
};

/**
 * Arbitrage opportunity
 */
export interface ArbOpportunity {
  /** Market condition ID */
  conditionId: string;
  /** Direction of Binance move */
  binanceDirection: 'UP' | 'DOWN';
  /** Binance price change percentage */
  binancePriceChange: number;
  /** Current Polymarket YES probability */
  polyYesProbability: number;
  /** Expected Polymarket YES probability based on Binance */
  expectedYesProbability: number;
  /** Probability mismatch */
  probabilityMismatch: number;
  /** Side to buy on Polymarket */
  buyingSide: 'YES' | 'NO';
  /** Best available price */
  bestPrice: number;
  /** Available size at best price */
  availableSize: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Polymarket order
 */
export interface PolymarketOrder {
  /** Market condition ID */
  conditionId: string;
  /** Token ID (YES or NO) */
  tokenId: string;
  /** Order side */
  side: 'BUY' | 'SELL';
  /** Order type */
  type: 'LIMIT' | 'MARKET';
  /** Price (0-1) */
  price: number;
  /** Size in shares */
  size: number;
}

/**
 * Polymarket order result
 */
export interface PolymarketOrderResult {
  /** Order ID */
  orderId: string;
  /** Transaction hash */
  txHash?: string;
  /** Order status */
  status: 'PENDING' | 'FILLED' | 'PARTIAL' | 'FAILED';
  /** Filled size */
  filledSize: number;
  /** Average fill price */
  avgPrice: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Binance price update
 */
export interface BinancePriceUpdate {
  /** Symbol (e.g., 'BTCUSDT') */
  symbol: string;
  /** Current price */
  price: number;
  /** Price velocity (change per second) */
  velocity: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Polymarket arbitrage engine configuration
 */
export interface PolymarketArbConfig {
  /** Polygon RPC URL */
  polygonRpcUrl: string;
  /** Private key for signing (encrypted) */
  privateKey: string;
  /** Trigger conditions */
  triggerConditions: ArbTriggerCondition;
  /** Maximum position size in USD */
  maxPositionSize: number;
  /** Minimum liquidity required */
  minLiquidity: number;
  /** Target markets (BTC 15m/Hourly) */
  targetMarkets: string[];
}

/**
 * Default Polymarket arbitrage configuration
 */
export const DEFAULT_POLYMARKET_ARB_CONFIG: Omit<PolymarketArbConfig, 'polygonRpcUrl' | 'privateKey'> = {
  triggerConditions: DEFAULT_ARB_TRIGGER,
  maxPositionSize: 1000,
  minLiquidity: 10000,
  targetMarkets: ['BTC 15m', 'BTC Hourly'],
};
