/**
 * LimitChaser - Limit Order Chasing Algorithm
 * 
 * Places Limit orders at Ask (for BUY) and chases price if not filled,
 * preventing slippage spikes during regime shifts.
 * 
 * Requirements: 13.7-13.8
 * 
 * @module LimitChaser
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  CHASE_INTERVAL_MS: 200,           // Check every 200ms
  MAX_CHASE_TIME_MS: 1000,          // Maximum 1 second chase
  DEFAULT_TICK_SIZE: 0.01,          // Default tick size
  MAX_CHASE_TICKS: 5,               // Maximum ticks to chase
  MIN_ALPHA_THRESHOLD: 0.3,         // Minimum alpha before cancellation
  ALPHA_HALF_LIFE_SCALP: 10000,     // 10 seconds for scalp signals
  ALPHA_HALF_LIFE_DAY: 30000,       // 30 seconds for day signals
  ALPHA_HALF_LIFE_SWING: 120000,    // 120 seconds for swing signals
  URGENCY_EXTENSION_THRESHOLD: 95,  // Momentum score threshold for extension
  URGENCY_EXTENSION_FACTOR: 1.5,    // 50% extension when urgent
};

/** @constant {Set<string>} Valid order sides */
const VALID_SIDES = new Set(['BUY', 'SELL']);

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ChaseParams
 * @property {string} signal_id - Signal ID
 * @property {string} symbol - Trading symbol
 * @property {'BUY'|'SELL'} side - Order side
 * @property {number} size - Order size
 * @property {number} [stop_loss] - Stop loss price
 * @property {number[]} [take_profits] - Take profit prices
 * @property {number} [tick_size] - Tick size for price increments
 * @property {boolean} [reduce_only] - Whether this is a reduce-only order
 * @property {boolean} [post_only] - Whether to use post-only mode
 * @property {number} [alpha_half_life_ms] - Alpha decay half-life in milliseconds
 * @property {string} [signal_type] - Signal type (scalp, day, swing) for default half-life
 * @property {number} [urgency_score] - Urgency score (0-100) for alpha extension
 * @property {number} [min_alpha_threshold] - Minimum alpha threshold (default: 0.3)
 */

/**
 * @typedef {Object} ChaseResult
 * @property {boolean} success - Whether order was filled
 * @property {string} signal_id - Signal ID
 * @property {string} [broker_order_id] - Broker order ID if filled
 * @property {number} [fill_price] - Actual fill price
 * @property {number} [fill_size] - Actual filled size
 * @property {number} chase_time_ms - Total chase time
 * @property {number} chase_ticks - Number of price adjustments
 * @property {string} [reason] - Reason for result (FILLED, FILL_TIMEOUT, ALPHA_EXPIRED, OBI_WORSENING, etc.)
 * @property {Object} [market_conditions] - Market conditions at timeout
 * @property {number} [remaining_alpha] - Remaining alpha at cancellation
 * @property {number} [obi_trend] - OBI trend (current - previous)
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

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate chase parameters
 * @param {ChaseParams} params - Chase parameters
 * @throws {Error} If validation fails
 */
function validateChaseParams(params) {
  if (!params) {
    throw new Error('Chase parameters are required');
  }
  if (!params.signal_id || typeof params.signal_id !== 'string') {
    throw new Error('signal_id is required and must be a string');
  }
  if (!params.symbol || typeof params.symbol !== 'string') {
    throw new Error('symbol is required and must be a string');
  }
  if (!params.side || !VALID_SIDES.has(params.side)) {
    throw new Error('side must be BUY or SELL');
  }
  if (typeof params.size !== 'number' || params.size <= 0 || !Number.isFinite(params.size)) {
    throw new Error('size must be a positive finite number');
  }
}

/**
 * Get default alpha half-life based on signal type
 * Requirements: 79.1 - Default half-lives: scalp=10s, day=30s, swing=120s
 * 
 * @param {string} signalType - Signal type (scalp, day, swing)
 * @returns {number} Alpha half-life in milliseconds
 */
function getDefaultAlphaHalfLife(signalType) {
  const type = (signalType || '').toLowerCase();
  switch (type) {
    case 'scalp':
      return CONFIG.ALPHA_HALF_LIFE_SCALP;
    case 'day':
      return CONFIG.ALPHA_HALF_LIFE_DAY;
    case 'swing':
      return CONFIG.ALPHA_HALF_LIFE_SWING;
    default:
      // Default to day if unknown
      return CONFIG.ALPHA_HALF_LIFE_DAY;
  }
}

/**
 * Calculate remaining alpha using exponential decay
 * Requirements: 79.2 - remaining_alpha = initial_alpha * 0.5^(chase_time / half_life)
 * 
 * @param {number} chaseTimeMs - Time elapsed in chase (milliseconds)
 * @param {number} alphaHalfLifeMs - Alpha half-life (milliseconds)
 * @param {number} initialAlpha - Initial alpha value (default: 1.0)
 * @returns {number} Remaining alpha (0-1)
 */
function calculateRemainingAlpha(chaseTimeMs, alphaHalfLifeMs, initialAlpha = 1.0) {
  if (alphaHalfLifeMs <= 0) return initialAlpha;
  const exponent = chaseTimeMs / alphaHalfLifeMs;
  return initialAlpha * Math.pow(0.5, exponent);
}

/**
 * Apply urgency extension to alpha half-life
 * Requirements: 79.6 - Extend alpha_half_life by 50% when urgency_score > 95
 * 
 * @param {number} baseHalfLife - Base alpha half-life (milliseconds)
 * @param {number} urgencyScore - Urgency score (0-100)
 * @returns {number} Extended alpha half-life (milliseconds)
 */
function applyUrgencyExtension(baseHalfLife, urgencyScore) {
  if (urgencyScore > CONFIG.URGENCY_EXTENSION_THRESHOLD) {
    return baseHalfLife * CONFIG.URGENCY_EXTENSION_FACTOR;
  }
  return baseHalfLife;
}

/**
 * Check if OBI is worsening (sell wall growing for BUY, buy wall growing for SELL)
 * Requirements: 79.4 - Cancel immediately if OBI is worsening during chase
 * 
 * @param {number} currentOBI - Current OBI value
 * @param {number} previousOBI - Previous OBI value
 * @param {'BUY'|'SELL'} side - Order side
 * @returns {boolean} True if OBI is worsening
 */
function isOBIWorsening(currentOBI, previousOBI, side) {
  if (currentOBI === null || previousOBI === null) return false;
  
  if (side === 'BUY') {
    // For BUY orders, worsening means OBI is decreasing (sell wall growing)
    return currentOBI < previousOBI;
  } else {
    // For SELL orders, worsening means OBI is increasing (buy wall growing)
    return currentOBI > previousOBI;
  }
}



//─────────────────────────────────────────────────────────────────────────────
// LIMIT CHASER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * LimitChaser class
 * 
 * Implements the Limit Chaser algorithm for sub-100ms execution:
 * 1. Place Limit at Ask (for BUY) or Bid (for SELL)
 * 2. If not filled in 200ms, move to Ask+1 tick (or Bid-1 tick)
 * 3. Repeat until filled or timeout (1s max)
 * 4. On timeout, abort and log "FILL_TIMEOUT"
 * 
 * Events emitted:
 * - 'chase:start' - When chase begins
 * - 'chase:tick' - When price is adjusted
 * - 'chase:filled' - When order is filled
 * - 'chase:timeout' - When chase times out
 * - 'chase:error' - When an error occurs
 */
export class LimitChaser extends EventEmitter {
  /**
   * Create a new LimitChaser instance
   * @param {Object} options - Configuration options
   * @param {Object} options.wsCache - WebSocketCache instance for price data
   * @param {Object} options.brokerGateway - BrokerGateway instance for order execution
   * @param {number} [options.chaseIntervalMs] - Interval between price checks (default: 200ms)
   * @param {number} [options.maxChaseTimeMs] - Maximum chase time (default: 1000ms)
   * @param {number} [options.maxChaseTicks] - Maximum ticks to chase (default: 5)
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    if (!options.wsCache) {
      throw new Error('WebSocketCache instance is required');
    }
    if (!options.brokerGateway) {
      throw new Error('BrokerGateway instance is required');
    }
    
    this.wsCache = options.wsCache;
    this.brokerGateway = options.brokerGateway;
    this.chaseIntervalMs = options.chaseIntervalMs || CONFIG.CHASE_INTERVAL_MS;
    this.maxChaseTimeMs = options.maxChaseTimeMs || CONFIG.MAX_CHASE_TIME_MS;
    this.maxChaseTicks = options.maxChaseTicks || CONFIG.MAX_CHASE_TICKS;
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
    
    /** @type {Map<string, Object>} Active chases */
    this.activeChases = new Map();
    
    /** @type {boolean} Whether instance is destroyed */
    this._destroyed = false;
  }

  /**
   * Get initial limit price based on side
   * Requirements: 13.7 - Place Limit at Ask (for BUY)
   * 
   * @param {string} symbol - Trading symbol
   * @param {'BUY'|'SELL'} side - Order side
   * @returns {number|null} Initial limit price or null
   */
  getInitialPrice(symbol, side) {
    if (side === 'BUY') {
      // For BUY, start at Ask (best offer)
      return this.wsCache.getBestAsk(symbol);
    } else {
      // For SELL, start at Bid (best bid)
      return this.wsCache.getBestBid(symbol);
    }
  }

  /**
   * Get next chase price (move towards market)
   * Requirements: 13.7 - If not filled in 200ms move to Ask+1 tick
   * 
   * @param {number} currentPrice - Current limit price
   * @param {'BUY'|'SELL'} side - Order side
   * @param {number} tickSize - Tick size
   * @returns {number} Next chase price
   */
  getNextChasePrice(currentPrice, side, tickSize) {
    if (side === 'BUY') {
      // For BUY, increase price (more aggressive)
      return currentPrice + tickSize;
    } else {
      // For SELL, decrease price (more aggressive)
      return currentPrice - tickSize;
    }
  }

  /**
   * Get tick size for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {number} Tick size
   */
  getTickSize(symbol) {
    // In production, this would come from exchange info
    // For now, use a reasonable default based on price
    const price = this.wsCache.getBestBid(symbol) || this.wsCache.getBestAsk(symbol);
    if (!price) return CONFIG.DEFAULT_TICK_SIZE;
    
    // Estimate tick size based on price magnitude
    if (price > 10000) return 0.1;
    if (price > 1000) return 0.01;
    if (price > 100) return 0.001;
    if (price > 10) return 0.0001;
    return 0.00001;
  }

  /**
   * Get current market conditions for logging
   * @param {string} symbol - Trading symbol
   * @returns {Object} Market conditions
   */
  getMarketConditions(symbol) {
    return {
      best_bid: this.wsCache.getBestBid(symbol),
      best_ask: this.wsCache.getBestAsk(symbol),
      spread: this.wsCache.getSpread(symbol),
      spread_pct: this.wsCache.getSpreadPct(symbol),
      obi: this.wsCache.calculateOBI(symbol),
      cache_age: this.wsCache.getCacheAge(symbol),
      timestamp: Date.now(),
    };
  }

  /**
   * Execute the Limit Chaser algorithm with Alpha Decay
   * Requirements: 13.7-13.8 - Limit Chaser algorithm
   * Requirements: 79.1-79.6 - Alpha decay logic
   * 
   * @param {ChaseParams} params - Chase parameters
   * @returns {Promise<ChaseResult>} Chase result
   */
  async execute(params) {
    return this.chase(params);
  }

  /**
   * Chase implementation (internal)
   * @param {ChaseParams} params - Chase parameters
   * @returns {Promise<ChaseResult>} Chase result
   * @private
   */
  async chase(params) {
    if (this._destroyed) {
      throw new Error('LimitChaser has been destroyed');
    }
    
    validateChaseParams(params);
    
    const { signal_id, symbol, side, size, stop_loss, take_profits, reduce_only, post_only } = params;
    const tickSize = params.tick_size || this.getTickSize(symbol);
    
    // Requirements: 79.1 - Calculate alpha_half_life based on signal type
    let alphaHalfLife = params.alpha_half_life_ms;
    if (!alphaHalfLife) {
      alphaHalfLife = getDefaultAlphaHalfLife(params.signal_type);
    }
    
    // Requirements: 79.6 - Extend alpha_half_life by 50% when urgency_score > 95
    if (params.urgency_score) {
      alphaHalfLife = applyUrgencyExtension(alphaHalfLife, params.urgency_score);
    }
    
    const minAlphaThreshold = params.min_alpha_threshold || CONFIG.MIN_ALPHA_THRESHOLD;
    const initialAlpha = 1.0;
    
    const startTime = Date.now();
    let chaseTicks = 0;
    let currentOrderId = null;
    let lastPrice = null;
    let previousOBI = null;
    
    // Get initial price
    const initialPrice = this.getInitialPrice(symbol, side);
    if (!initialPrice) {
      this.logger.error({ signal_id, symbol, side }, 'Cannot get initial price from cache');
      return {
        success: false,
        signal_id,
        chase_time_ms: 0,
        chase_ticks: 0,
        reason: 'NO_PRICE_DATA',
        market_conditions: this.getMarketConditions(symbol),
      };
    }
    
    let currentPrice = initialPrice;
    
    // Track active chase
    this.activeChases.set(signal_id, {
      symbol,
      side,
      size,
      start_time: startTime,
      current_price: currentPrice,
    });
    
    this.logger.info({
      signal_id,
      symbol,
      side,
      size,
      initial_price: initialPrice,
      tick_size: tickSize,
      alpha_half_life_ms: alphaHalfLife,
      min_alpha_threshold: minAlphaThreshold,
      urgency_score: params.urgency_score,
    }, 'Starting Limit Chaser with Alpha Decay');
    
    this.emit('chase:start', { 
      signal_id, 
      symbol, 
      side, 
      size, 
      initial_price: initialPrice,
      alpha_half_life_ms: alphaHalfLife,
    });
    
    try {
      // Chase loop
      while (!this._destroyed) {
        const elapsedMs = Date.now() - startTime;
        
        // Requirements: 79.2, 79.3 - Check alpha decay
        const remainingAlpha = calculateRemainingAlpha(elapsedMs, alphaHalfLife, initialAlpha);
        
        if (remainingAlpha < minAlphaThreshold) {
          // Cancel any pending order
          if (currentOrderId) {
            try {
              await this.brokerGateway.cancelOrder(currentOrderId);
            } catch (cancelError) {
              this.logger.warn({ signal_id, order_id: currentOrderId, error: cancelError.message }, 
                'Failed to cancel order on alpha expiry');
            }
          }
          
          const marketConditions = this.getMarketConditions(symbol);
          const currentOBI = this.wsCache.calculateOBI(symbol);
          
          // Requirements: 79.5 - Log "ALPHA_EXPIRED" with details
          this.logger.warn({
            signal_id,
            symbol,
            side,
            size,
            chase_time_ms: elapsedMs,
            remaining_alpha: remainingAlpha,
            min_alpha_threshold: minAlphaThreshold,
            obi_trend: previousOBI !== null ? (currentOBI - previousOBI) : null,
            current_obi: currentOBI,
            market_conditions: marketConditions,
          }, 'ALPHA_EXPIRED - Signal edge has decayed');
          
          this.emit('chase:alpha_expired', {
            signal_id,
            symbol,
            chase_time_ms: elapsedMs,
            remaining_alpha: remainingAlpha,
            obi_trend: previousOBI !== null ? (currentOBI - previousOBI) : null,
          });
          
          this.activeChases.delete(signal_id);
          
          return {
            success: false,
            signal_id,
            chase_time_ms: elapsedMs,
            chase_ticks: chaseTicks,
            reason: 'ALPHA_EXPIRED',
            remaining_alpha: remainingAlpha,
            market_conditions: marketConditions,
          };
        }
        
        // Requirements: 79.4 - Cancel immediately if OBI is worsening
        const currentOBI = this.wsCache.calculateOBI(symbol);
        if (previousOBI !== null && isOBIWorsening(currentOBI, previousOBI, side)) {
          // Cancel any pending order
          if (currentOrderId) {
            try {
              await this.brokerGateway.cancelOrder(currentOrderId);
            } catch (cancelError) {
              this.logger.warn({ signal_id, order_id: currentOrderId, error: cancelError.message }, 
                'Failed to cancel order on OBI worsening');
            }
          }
          
          const marketConditions = this.getMarketConditions(symbol);
          const obiTrend = currentOBI - previousOBI;
          
          // Requirements: 79.5 - Log with OBI trend
          this.logger.warn({
            signal_id,
            symbol,
            side,
            size,
            chase_time_ms: elapsedMs,
            remaining_alpha: remainingAlpha,
            obi_trend: obiTrend,
            current_obi: currentOBI,
            previous_obi: previousOBI,
            market_conditions: marketConditions,
          }, 'ALPHA_EXPIRED - OBI worsening during chase');
          
          this.emit('chase:obi_worsening', {
            signal_id,
            symbol,
            chase_time_ms: elapsedMs,
            obi_trend: obiTrend,
            current_obi: currentOBI,
            previous_obi: previousOBI,
          });
          
          this.activeChases.delete(signal_id);
          
          return {
            success: false,
            signal_id,
            chase_time_ms: elapsedMs,
            chase_ticks: chaseTicks,
            reason: 'OBI_WORSENING',
            remaining_alpha: remainingAlpha,
            obi_trend: obiTrend,
            market_conditions: marketConditions,
          };
        }
        
        // Store current OBI for next iteration
        previousOBI = currentOBI;
        
        // Requirements: 13.8 - Timeout after 1s
        if (elapsedMs >= this.maxChaseTimeMs) {
          // Cancel any pending order
          if (currentOrderId) {
            try {
              await this.brokerGateway.cancelOrder(currentOrderId);
            } catch (cancelError) {
              this.logger.warn({ signal_id, order_id: currentOrderId, error: cancelError.message }, 
                'Failed to cancel order on timeout');
            }
          }
          
          const marketConditions = this.getMarketConditions(symbol);
          
          // Requirements: 13.8 - Log "FILL_TIMEOUT" with market conditions
          this.logger.warn({
            signal_id,
            symbol,
            side,
            size,
            chase_time_ms: elapsedMs,
            chase_ticks: chaseTicks,
            last_price: lastPrice,
            market_conditions: marketConditions,
          }, 'FILL_TIMEOUT - Limit Chaser timed out');
          
          this.emit('chase:timeout', {
            signal_id,
            symbol,
            chase_time_ms: elapsedMs,
            chase_ticks: chaseTicks,
            market_conditions: marketConditions,
          });
          
          this.activeChases.delete(signal_id);
          
          return {
            success: false,
            signal_id,
            chase_time_ms: elapsedMs,
            chase_ticks: chaseTicks,
            reason: 'FILL_TIMEOUT',
            market_conditions: marketConditions,
          };
        }
        
        // Check if we've exceeded max chase ticks
        if (chaseTicks >= this.maxChaseTicks) {
          const marketConditions = this.getMarketConditions(symbol);
          
          this.logger.warn({
            signal_id,
            symbol,
            chase_ticks: chaseTicks,
            max_chase_ticks: this.maxChaseTicks,
          }, 'FILL_TIMEOUT - Max chase ticks exceeded');
          
          this.activeChases.delete(signal_id);
          
          return {
            success: false,
            signal_id,
            chase_time_ms: elapsedMs,
            chase_ticks: chaseTicks,
            reason: 'MAX_TICKS_EXCEEDED',
            market_conditions: marketConditions,
          };
        }
        
        // Place or update order
        lastPrice = currentPrice;
        
        try {
          // Cancel previous order if exists
          if (currentOrderId) {
            await this.brokerGateway.cancelOrder(currentOrderId);
            currentOrderId = null;
          }
          
          // Place new limit order
          const orderResult = await this.brokerGateway.sendOrder(
            `${signal_id}_chase_${chaseTicks}`,
            {
              symbol,
              side,
              size,
              order_type: 'LIMIT',
              limit_price: currentPrice,
              stop_loss,
              take_profits,
              reduce_only: reduce_only || false,
              post_only: post_only !== false, // Default to true
            }
          );
          
          // Check if filled
          if (orderResult.success && orderResult.filled) {
            const chaseTimeMs = Date.now() - startTime;
            
            this.logger.info({
              signal_id,
              symbol,
              side,
              size,
              fill_price: orderResult.fill_price,
              fill_size: orderResult.fill_size,
              chase_time_ms: chaseTimeMs,
              chase_ticks: chaseTicks,
            }, 'Limit Chaser filled');
            
            this.emit('chase:filled', {
              signal_id,
              symbol,
              fill_price: orderResult.fill_price,
              fill_size: orderResult.fill_size,
              chase_time_ms: chaseTimeMs,
              chase_ticks: chaseTicks,
            });
            
            this.activeChases.delete(signal_id);
            
            return {
              success: true,
              signal_id,
              broker_order_id: orderResult.broker_order_id,
              fill_price: orderResult.fill_price,
              fill_size: orderResult.fill_size,
              chase_time_ms: chaseTimeMs,
              chase_ticks: chaseTicks,
              reason: 'FILLED',
            };
          }
          
          currentOrderId = orderResult.broker_order_id;
          
        } catch (orderError) {
          this.logger.error({
            signal_id,
            symbol,
            error: orderError.message,
          }, 'Order placement failed during chase');
          
          this.emit('chase:error', {
            signal_id,
            symbol,
            error: orderError.message,
          });
        }
        
        // Wait for chase interval
        await sleep(this.chaseIntervalMs);
        
        // Move to next price
        // Requirements: 13.7 - If not filled in 200ms move to Ask+1 tick
        currentPrice = this.getNextChasePrice(currentPrice, side, tickSize);
        chaseTicks++;
        
        // Update active chase tracking
        const activeChase = this.activeChases.get(signal_id);
        if (activeChase) {
          activeChase.current_price = currentPrice;
          activeChase.chase_ticks = chaseTicks;
        }
        
        this.logger.info({
          signal_id,
          symbol,
          chase_tick: chaseTicks,
          new_price: currentPrice,
          elapsed_ms: Date.now() - startTime,
        }, 'Chase tick - adjusting price');
        
        this.emit('chase:tick', {
          signal_id,
          symbol,
          tick: chaseTicks,
          price: currentPrice,
        });
      }
      
    } catch (error) {
      this.logger.error({
        signal_id,
        symbol,
        error: error.message,
      }, 'Limit Chaser error');
      
      this.activeChases.delete(signal_id);
      
      return {
        success: false,
        signal_id,
        chase_time_ms: Date.now() - startTime,
        chase_ticks: chaseTicks,
        reason: `ERROR: ${error.message}`,
        market_conditions: this.getMarketConditions(symbol),
      };
    }
    
    // Should not reach here
    this.activeChases.delete(signal_id);
    return {
      success: false,
      signal_id,
      chase_time_ms: Date.now() - startTime,
      chase_ticks: chaseTicks,
      reason: 'UNEXPECTED_EXIT',
    };
  }

  /**
   * Cancel an active chase
   * @param {string} signalId - Signal ID to cancel
   * @returns {boolean} True if chase was cancelled
   */
  cancelChase(signalId) {
    const chase = this.activeChases.get(signalId);
    if (chase) {
      this.activeChases.delete(signalId);
      this.logger.info({ signal_id: signalId }, 'Chase cancelled');
      return true;
    }
    return false;
  }

  /**
   * Get active chases
   * @returns {Map<string, Object>} Active chases
   */
  getActiveChases() {
    return new Map(this.activeChases);
  }

  /**
   * Get chaser status
   * @returns {Object} Chaser status
   */
  getStatus() {
    return {
      active_chases: this.activeChases.size,
      chase_interval_ms: this.chaseIntervalMs,
      max_chase_time_ms: this.maxChaseTimeMs,
      max_chase_ticks: this.maxChaseTicks,
    };
  }

  /**
   * Destroy the chaser
   */
  destroy() {
    this._destroyed = true;
    this.activeChases.clear();
    this.removeAllListeners();
    this.logger.info({}, 'LimitChaser destroyed');
  }
}

// Export config and helpers for testing
export { 
  CONFIG, 
  validateChaseParams,
  getDefaultAlphaHalfLife,
  calculateRemainingAlpha,
  applyUrgencyExtension,
  isOBIWorsening,
};

export default LimitChaser;
