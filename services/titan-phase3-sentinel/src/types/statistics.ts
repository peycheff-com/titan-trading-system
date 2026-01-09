/**
 * Statistics Types for Titan Phase 3 - The Sentinel
 * 
 * Defines statistical analysis structures for basis monitoring.
 */

/**
 * Order book structure
 */
export interface OrderBook {
  /** Bid levels [price, size][] sorted by price descending */
  bids: Array<[price: number, size: number]>;
  /** Ask levels [price, size][] sorted by price ascending */
  asks: Array<[price: number, size: number]>;
  /** Order book timestamp */
  timestamp: number;
}

/**
 * Basis statistics for a trading pair
 */
export interface BasisStats {
  /** Trading pair symbol */
  symbol: string;
  /** Current basis value */
  current: number;
  /** Rolling mean of basis */
  mean: number;
  /** Rolling standard deviation */
  stdDev: number;
  /** Current Z-Score */
  zScore: number;
  /** Current percentile (0-100) */
  percentile: number;
  /** Historical basis values in rolling window */
  history: number[];
}

/**
 * Rolling statistics configuration
 */
export interface RollingStatsConfig {
  /** Window size in number of samples (default: 60 for 1-hour at 1-min intervals) */
  windowSize: number;
  /** Minimum samples required for valid statistics */
  minSamples: number;
}

/**
 * Default rolling statistics configuration
 */
export const DEFAULT_ROLLING_STATS_CONFIG: RollingStatsConfig = {
  windowSize: 60,
  minSamples: 10,
};

/**
 * Price data from exchange
 */
export interface PriceData {
  /** Trading pair symbol */
  symbol: string;
  /** Current price */
  price: number;
  /** 24h volume */
  volume24h: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Exchange price with depth information
 */
export interface ExchangePrice {
  /** Exchange name */
  exchange: string;
  /** Trading pair symbol */
  symbol: string;
  /** Current price */
  price: number;
  /** Available depth at this price level */
  depth: number;
  /** Timestamp */
  timestamp: number;
}
