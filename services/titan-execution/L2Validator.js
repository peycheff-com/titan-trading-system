/**
 * L2 Validator with Zero-IO Validation
 * 
 * Validates orders against local WebSocket order book cache.
 * Provides zero network latency validation for sub-100ms execution.
 * 
 * Requirements: 22.1-22.9, 36.1-36.5
 * 
 * @module L2Validator
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {number} Maximum cache age in milliseconds */
const MAX_CACHE_AGE_MS = 100;

/** @constant {number} OBI threshold for heavy sell wall */
const OBI_HEAVY_SELL_THRESHOLD = 0.5;

/** @constant {number} OBI threshold for heavy bid support */
const OBI_HEAVY_BID_THRESHOLD = 2.0;

/** @constant {number} Default minimum structure threshold */
const DEFAULT_MIN_STRUCTURE_THRESHOLD = 60;

//─────────────────────────────────────────────────────────────────────────────
// ASSET PRESETS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Asset presets for different market types
 * Requirements: 24.4 - Provide presets for crypto, equity, and fx
 */
const ASSET_PRESETS = {
  crypto: {
    max_spread_pct: 0.1,      // 0.1% max spread
    max_slippage_pct: 0.2,    // 0.2% max slippage
    min_depth: 10000,         // Minimum depth in quote currency
    delta_scale: 1.0,
    volume_scale: 1.0,
    obi_threshold: OBI_HEAVY_SELL_THRESHOLD,
  },
  equity: {
    max_spread_pct: 0.05,     // 0.05% max spread
    max_slippage_pct: 0.1,    // 0.1% max slippage
    min_depth: 50000,         // Minimum depth in quote currency
    delta_scale: 0.5,
    volume_scale: 0.8,
    obi_threshold: OBI_HEAVY_SELL_THRESHOLD,
  },
  fx: {
    max_spread_pct: 0.02,     // 0.02% max spread (2 pips for majors)
    max_slippage_pct: 0.05,   // 0.05% max slippage
    min_depth: 100000,        // Minimum depth in quote currency
    delta_scale: 0.3,
    volume_scale: 0.5,
    obi_threshold: OBI_HEAVY_SELL_THRESHOLD,
  },
};

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string} [reason] - Rejection reason if invalid
 * @property {string} [recommendation] - Recommended action (MARKET, LIMIT, ABORT)
 * @property {Object} [details] - Additional validation details
 */

/**
 * @typedef {Object} OrderParams
 * @property {string} symbol - Trading symbol
 * @property {'BUY'|'SELL'} side - Order side
 * @property {number} size - Order size
 * @property {number} [price] - Limit price (optional for market orders)
 * @property {number} [market_structure_score] - Market structure score from regime
 * @property {number} [momentum_score] - Momentum score for dynamic thresholds
 */

/**
 * @typedef {Object} Logger
 * @property {Function} info - Info level logging
 * @property {Function} warn - Warning level logging
 * @property {Function} error - Error level logging
 */

//─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create a default logger with consistent interface
 * @returns {Logger} Default logger
 */
function createDefaultLogger() {
  return {
    info: (data, message) => console.log(`[INFO] ${message}`, data),
    warn: (data, message) => console.warn(`[WARN] ${message}`, data),
    error: (data, message) => console.error(`[ERROR] ${message}`, data),
  };
}


//─────────────────────────────────────────────────────────────────────────────
// L2 VALIDATOR CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * L2 Validator class
 * 
 * Validates orders against local WebSocket order book cache.
 * Implements zero-IO validation for sub-100ms latency.
 * 
 * Events emitted:
 * - 'validation:passed' - Order passed validation
 * - 'validation:failed' - Order failed validation
 * - 'validation:warning' - Validation passed with warnings
 */
export class L2Validator extends EventEmitter {
  /**
   * Create a new L2Validator instance
   * @param {Object} options - Configuration options
   * @param {Object} options.wsCache - WebSocketCache instance
   * @param {number} [options.minStructureThreshold] - Minimum market structure score
   * @param {number} [options.maxCacheAgeMs] - Maximum cache age before rejection
   * @param {Object} [options.assetPresets] - Custom asset presets
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    if (!options.wsCache) {
      throw new Error('WebSocketCache instance is required');
    }
    
    /** @type {Object} WebSocket cache instance */
    this.wsCache = options.wsCache;
    
    /** @type {number} Minimum market structure threshold */
    this.minStructureThreshold = options.minStructureThreshold || DEFAULT_MIN_STRUCTURE_THRESHOLD;
    
    /** @type {number} Maximum cache age in milliseconds */
    this.maxCacheAgeMs = options.maxCacheAgeMs || MAX_CACHE_AGE_MS;
    
    /** @type {Object} Asset presets */
    this.assetPresets = { ...ASSET_PRESETS, ...options.assetPresets };
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
  }

  /**
   * Get asset preset for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Object} Asset preset
   */
  getAssetPreset(symbol) {
    // Determine asset type from symbol
    const upperSymbol = symbol.toUpperCase();
    
    // Crypto pairs typically end with USDT, BTC, ETH, etc.
    if (upperSymbol.includes('USDT') || upperSymbol.includes('BTC') || 
        upperSymbol.includes('ETH') || upperSymbol.includes('BUSD')) {
      return this.assetPresets.crypto;
    }
    
    // FX pairs are typically 6 characters (EURUSD, GBPJPY, etc.)
    if (upperSymbol.length === 6 && !upperSymbol.includes('USD')) {
      return this.assetPresets.fx;
    }
    
    // Default to equity
    return this.assetPresets.equity;
  }

  /**
   * Apply dynamic threshold adjustment based on momentum
   * Requirements: 36.1-36.2 - Dynamic validation threshold adjustment
   * 
   * @param {Object} preset - Base asset preset
   * @param {number} momentumScore - Momentum score (0-100)
   * @returns {Object} Adjusted preset
   */
  applyDynamicThresholds(preset, momentumScore) {
    const adjusted = { ...preset };
    
    // Requirements: 36.1-36.2 - When momentum_score > 90, relax max_spread_pct by 50%
    if (momentumScore > 90) {
      adjusted.max_spread_pct = preset.max_spread_pct * 1.5;
      adjusted.max_slippage_pct = preset.max_slippage_pct * 1.5;
    } else if (momentumScore > 80) {
      adjusted.max_spread_pct = preset.max_spread_pct * 1.25;
      adjusted.max_slippage_pct = preset.max_slippage_pct * 1.25;
    }
    
    return adjusted;
  }

  /**
   * Check order book depth
   * @param {string} symbol - Trading symbol
   * @param {number} minDepth - Minimum required depth
   * @returns {{valid: boolean, depth: number, reason?: string}}
   */
  checkDepth(symbol, minDepth) {
    const orderbook = this.wsCache.getOrderbook(symbol);
    if (!orderbook) {
      return { valid: false, depth: 0, reason: 'NO_ORDERBOOK_DATA' };
    }
    
    // Calculate total depth (bid + ask volume at top levels)
    let bidDepth = 0;
    let askDepth = 0;
    
    for (const level of orderbook.bids) {
      bidDepth += level.price * level.quantity;
    }
    for (const level of orderbook.asks) {
      askDepth += level.price * level.quantity;
    }
    
    const totalDepth = bidDepth + askDepth;
    
    if (totalDepth < minDepth) {
      return { 
        valid: false, 
        depth: totalDepth, 
        reason: `INSUFFICIENT_DEPTH: ${totalDepth.toFixed(2)} < ${minDepth}`,
      };
    }
    
    return { valid: true, depth: totalDepth };
  }

  /**
   * Check spread
   * Requirements: 22.3 - Check spread_pct <= max_spread_pct
   * 
   * @param {string} symbol - Trading symbol
   * @param {number} maxSpreadPct - Maximum allowed spread percentage
   * @returns {{valid: boolean, spreadPct: number, reason?: string}}
   */
  checkSpread(symbol, maxSpreadPct) {
    const spreadPct = this.wsCache.getSpreadPct(symbol);
    
    if (spreadPct === null) {
      return { valid: false, spreadPct: 0, reason: 'CANNOT_CALCULATE_SPREAD' };
    }
    
    if (spreadPct > maxSpreadPct) {
      return { 
        valid: false, 
        spreadPct, 
        reason: `SPREAD_EXCEEDED: ${spreadPct.toFixed(4)}% > ${maxSpreadPct}%`,
      };
    }
    
    return { valid: true, spreadPct };
  }

  /**
   * Calculate expected slippage for an order
   * Requirements: 22.4 - Compute expected slippage and compare to max_slippage_pct
   * 
   * @param {string} symbol - Trading symbol
   * @param {'BUY'|'SELL'} side - Order side
   * @param {number} size - Order size
   * @returns {{slippagePct: number, avgPrice: number, levels: number}}
   */
  calculateSlippage(symbol, side, size) {
    const orderbook = this.wsCache.getOrderbook(symbol);
    if (!orderbook) {
      return { slippagePct: Infinity, avgPrice: 0, levels: 0 };
    }
    
    const levels = side === 'BUY' ? orderbook.asks : orderbook.bids;
    if (!levels || levels.length === 0) {
      return { slippagePct: Infinity, avgPrice: 0, levels: 0 };
    }
    
    const bestPrice = levels[0].price;
    let remainingSize = size;
    let totalCost = 0;
    let levelsUsed = 0;
    
    for (const level of levels) {
      if (remainingSize <= 0) break;
      
      const fillSize = Math.min(remainingSize, level.quantity);
      totalCost += fillSize * level.price;
      remainingSize -= fillSize;
      levelsUsed++;
    }
    
    // If we couldn't fill the entire order
    if (remainingSize > 0) {
      return { slippagePct: Infinity, avgPrice: 0, levels: levelsUsed };
    }
    
    const avgPrice = totalCost / size;
    const slippagePct = side === 'BUY'
      ? ((avgPrice - bestPrice) / bestPrice) * 100
      : ((bestPrice - avgPrice) / bestPrice) * 100;
    
    return { slippagePct: Math.max(0, slippagePct), avgPrice, levels: levelsUsed };
  }

  /**
   * Validate Order Book Imbalance (OBI)
   * Requirements: 22.5-22.7 - OBI validation for buy/sell orders
   * 
   * @param {string} symbol - Trading symbol
   * @param {'BUY'|'SELL'} side - Order side
   * @param {number} [threshold=0.5] - OBI threshold
   * @returns {{valid: boolean, obi: number, recommendation: string, reason?: string}}
   */
  validateOBI(symbol, side, threshold = OBI_HEAVY_SELL_THRESHOLD) {
    const obi = this.wsCache.calculateOBI(symbol);
    
    if (obi === null) {
      return { 
        valid: false, 
        obi: 0, 
        recommendation: 'ABORT',
        reason: 'CANNOT_CALCULATE_OBI',
      };
    }
    
    // Requirements: 22.6 - When OBI < 0.5 (heavy sell wall) for a BUY order
    if (side === 'BUY') {
      if (obi < threshold) {
        // Heavy sell wall - recommend LIMIT or ABORT
        return {
          valid: false,
          obi,
          recommendation: 'LIMIT',
          reason: `HEAVY_SELL_WALL: OBI=${obi.toFixed(2)} < ${threshold}`,
        };
      }
      
      // Requirements: 22.7 - When OBI > 2.0 (heavy bid support) for a BUY order
      if (obi > OBI_HEAVY_BID_THRESHOLD) {
        return {
          valid: true,
          obi,
          recommendation: 'MARKET',
          reason: `STRONG_BID_SUPPORT: OBI=${obi.toFixed(2)}`,
        };
      }
    } else {
      // SELL order - inverse logic
      if (obi > 1 / threshold) {
        // Heavy bid wall - recommend LIMIT or ABORT
        return {
          valid: false,
          obi,
          recommendation: 'LIMIT',
          reason: `HEAVY_BID_WALL: OBI=${obi.toFixed(2)} > ${(1/threshold).toFixed(2)}`,
        };
      }
      
      if (obi < 1 / OBI_HEAVY_BID_THRESHOLD) {
        return {
          valid: true,
          obi,
          recommendation: 'MARKET',
          reason: `STRONG_ASK_SUPPORT: OBI=${obi.toFixed(2)}`,
        };
      }
    }
    
    // Neutral OBI - allow with LIMIT recommendation
    return {
      valid: true,
      obi,
      recommendation: 'LIMIT',
      reason: `NEUTRAL_OBI: ${obi.toFixed(2)}`,
    };
  }

  /**
   * Validate an order against L2 data
   * Requirements: 22.1-22.9 - Full L2 validation
   * 
   * @param {OrderParams} params - Order parameters
   * @returns {ValidationResult} Validation result
   */
  validate(params) {
    const { symbol, side, size, market_structure_score, momentum_score } = params;
    
    const details = {
      symbol,
      side,
      size,
      checks: {},
    };
    
    // Requirements: 22.2 - Read L2 data from local WebSocket cache (max age 100ms)
    const cacheValidation = this.wsCache.validateCacheForSymbol(symbol);
    if (!cacheValidation.valid) {
      // Requirements: 22.9 - Abort validation and log "STALE_L2_CACHE"
      this.logger.warn({ symbol, reason: cacheValidation.reason }, 'STALE_L2_CACHE');
      this.emit('validation:failed', { symbol, reason: cacheValidation.reason });
      return {
        valid: false,
        reason: cacheValidation.reason,
        recommendation: 'ABORT',
        details,
      };
    }
    
    details.checks.cache = { valid: true, age: this.wsCache.getCacheAge(symbol) };
    
    // Requirements: 22.1 - Check market_structure_score >= config.min_structure_threshold
    if (market_structure_score !== undefined && market_structure_score < this.minStructureThreshold) {
      const reason = `STRUCTURE_BELOW_THRESHOLD: ${market_structure_score} < ${this.minStructureThreshold}`;
      this.logger.warn({ symbol, market_structure_score, threshold: this.minStructureThreshold }, reason);
      this.emit('validation:failed', { symbol, reason });
      return {
        valid: false,
        reason,
        recommendation: 'ABORT',
        details,
      };
    }
    
    details.checks.structure = { valid: true, score: market_structure_score };
    
    // Get asset preset and apply dynamic thresholds
    let preset = this.getAssetPreset(symbol);
    if (momentum_score !== undefined) {
      preset = this.applyDynamicThresholds(preset, momentum_score);
    }
    
    details.preset = preset;
    
    // Check depth
    const depthCheck = this.checkDepth(symbol, preset.min_depth);
    details.checks.depth = depthCheck;
    if (!depthCheck.valid) {
      this.logger.warn({ symbol, ...depthCheck }, 'Depth check failed');
      this.emit('validation:failed', { symbol, reason: depthCheck.reason });
      return {
        valid: false,
        reason: depthCheck.reason,
        recommendation: 'ABORT',
        details,
      };
    }
    
    // Requirements: 22.3 - Check spread
    const spreadCheck = this.checkSpread(symbol, preset.max_spread_pct);
    details.checks.spread = spreadCheck;
    if (!spreadCheck.valid) {
      this.logger.warn({ symbol, ...spreadCheck }, 'Spread check failed');
      this.emit('validation:failed', { symbol, reason: spreadCheck.reason });
      return {
        valid: false,
        reason: spreadCheck.reason,
        recommendation: 'ABORT',
        details,
      };
    }
    
    // Requirements: 22.4 - Calculate expected slippage
    const slippageCalc = this.calculateSlippage(symbol, side, size);
    details.checks.slippage = slippageCalc;
    if (slippageCalc.slippagePct > preset.max_slippage_pct) {
      const reason = `SLIPPAGE_EXCEEDED: ${slippageCalc.slippagePct.toFixed(4)}% > ${preset.max_slippage_pct}%`;
      this.logger.warn({ symbol, ...slippageCalc, max: preset.max_slippage_pct }, reason);
      this.emit('validation:failed', { symbol, reason });
      return {
        valid: false,
        reason,
        recommendation: 'LIMIT',
        details,
      };
    }
    
    // Requirements: 22.5-22.7 - Validate OBI
    const obiCheck = this.validateOBI(symbol, side, preset.obi_threshold);
    details.checks.obi = obiCheck;
    if (!obiCheck.valid) {
      this.logger.warn({ symbol, ...obiCheck }, 'OBI check failed');
      this.emit('validation:failed', { symbol, reason: obiCheck.reason });
      return {
        valid: false,
        reason: obiCheck.reason,
        recommendation: obiCheck.recommendation,
        details,
      };
    }
    
    // All checks passed
    this.logger.info({ symbol, side, size, recommendation: obiCheck.recommendation }, 'L2 validation passed');
    this.emit('validation:passed', { symbol, details });
    
    return {
      valid: true,
      recommendation: obiCheck.recommendation,
      details,
    };
  }

  /**
   * Quick validation for cache staleness only
   * Requirements: 22.9 - Reject validation if cache age > 100ms
   * 
   * @param {string} symbol - Trading symbol
   * @returns {boolean} True if cache is valid
   */
  isCacheValid(symbol) {
    return this.wsCache.validateCacheForSymbol(symbol).valid;
  }

  /**
   * Get current market conditions for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Object|null} Market conditions or null
   */
  getMarketConditions(symbol) {
    if (!this.isCacheValid(symbol)) {
      return null;
    }
    
    const orderbook = this.wsCache.getOrderbook(symbol);
    if (!orderbook) {
      return null;
    }
    
    return {
      symbol,
      bestBid: this.wsCache.getBestBid(symbol),
      bestAsk: this.wsCache.getBestAsk(symbol),
      spread: this.wsCache.getSpread(symbol),
      spreadPct: this.wsCache.getSpreadPct(symbol),
      obi: this.wsCache.calculateOBI(symbol),
      cacheAge: this.wsCache.getCacheAge(symbol),
      bidLevels: orderbook.bids.length,
      askLevels: orderbook.asks.length,
      timestamp: Date.now(),
    };
  }

  /**
   * Update minimum structure threshold
   * @param {number} threshold - New threshold value
   */
  setMinStructureThreshold(threshold) {
    this.minStructureThreshold = threshold;
    this.logger.info({ threshold }, 'Updated minimum structure threshold');
  }

  /**
   * Update asset preset
   * @param {string} assetType - Asset type (crypto, equity, fx)
   * @param {Object} preset - New preset values
   */
  updateAssetPreset(assetType, preset) {
    this.assetPresets[assetType] = { ...this.assetPresets[assetType], ...preset };
    this.logger.info({ assetType, preset }, 'Updated asset preset');
  }
}

// Export asset presets for external use
export { ASSET_PRESETS };

export default L2Validator;
