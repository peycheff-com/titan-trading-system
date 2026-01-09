/**
 * OrderManager - Fee-Aware Order Manager
 * 
 * Manages order execution with fee awareness, defaulting to Maker orders
 * and only converting to Taker when profitable.
 * 
 * Requirements: 67.1-67.7
 * 
 * @module OrderManager
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  DEFAULT_MAKER_FEE_PCT: 0.02,      // 0.02% maker fee
  DEFAULT_TAKER_FEE_PCT: 0.05,      // 0.05% taker fee
  DEFAULT_CHASE_TIMEOUT_MS: 2000,   // 2 seconds before evaluating taker conversion
  MIN_PROFIT_MARGIN: 0.001,         // 0.1% minimum profit margin
};

/** @constant {Set<string>} Valid order types */
const VALID_ORDER_TYPES = new Set(['LIMIT', 'MARKET']);

/** @constant {Set<string>} Valid order sides */
const VALID_SIDES = new Set(['BUY', 'SELL']);

/** @constant {Set<string>} Exit signal types */
const EXIT_SIGNAL_TYPES = new Set(['CLOSE', 'CLOSE_LONG', 'CLOSE_SHORT', 'EXIT', 'STOP_LOSS', 'TAKE_PROFIT']);

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} OrderParams
 * @property {string} signal_id - Signal ID for tracking
 * @property {string} symbol - Trading symbol
 * @property {'BUY'|'SELL'} side - Order side
 * @property {number} size - Order size
 * @property {number} limit_price - Limit price for maker orders
 * @property {number} [stop_loss] - Stop loss price
 * @property {number[]} [take_profits] - Take profit prices
 * @property {string} [signal_type] - Signal type (for exit detection)
 * @property {number} [expected_profit_pct] - Expected profit percentage
 */

/**
 * @typedef {Object} OrderDecision
 * @property {'LIMIT'|'MARKET'} order_type - Decided order type
 * @property {boolean} post_only - Whether to use post_only (maker)
 * @property {boolean} reduce_only - Whether this is a reduce-only order
 * @property {number} limit_price - Limit price (for LIMIT orders)
 * @property {string} reason - Reason for the decision
 * @property {Object} fee_analysis - Fee analysis details
 */

/**
 * @typedef {Object} FeeAnalysis
 * @property {number} maker_fee_pct - Maker fee percentage
 * @property {number} taker_fee_pct - Taker fee percentage
 * @property {number} expected_profit_pct - Expected profit percentage
 * @property {number} profit_after_maker - Profit after maker fee
 * @property {number} profit_after_taker - Profit after taker fee
 * @property {boolean} taker_profitable - Whether taker is profitable
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
 * Validate order parameters
 * @param {OrderParams} params - Order parameters
 * @throws {Error} If validation fails
 */
function validateOrderParams(params) {
  if (!params) {
    throw new Error('Order parameters are required');
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
 * Check if signal type is an exit signal
 * @param {string} signalType - Signal type
 * @returns {boolean} True if exit signal
 */
function isExitSignal(signalType) {
  if (!signalType) return false;
  const upperType = signalType.toUpperCase();
  return EXIT_SIGNAL_TYPES.has(upperType) || upperType.includes('CLOSE') || upperType.includes('EXIT');
}



//─────────────────────────────────────────────────────────────────────────────
// ORDER MANAGER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * OrderManager class - Fee-Aware Order Management
 * 
 * Features:
 * - Default to Limit Orders with post_only=true (Maker orders)
 * - Fee-aware conversion to Market orders only when profitable
 * - Automatic reduce_only for exit orders
 * - Configurable fee tiers from environment
 * 
 * Events emitted:
 * - 'order:decision' - When order type decision is made
 * - 'order:maker' - When maker order is chosen
 * - 'order:taker' - When taker order is chosen
 * - 'order:cancelled' - When order is cancelled due to insufficient profit
 */
export class OrderManager extends EventEmitter {
  /**
   * Create a new OrderManager instance
   * @param {Object} options - Configuration options
   * @param {number} [options.makerFeePct] - Maker fee percentage (default from env or 0.02%)
   * @param {number} [options.takerFeePct] - Taker fee percentage (default from env or 0.05%)
   * @param {number} [options.chaseTimeoutMs] - Chase timeout before taker evaluation (default: 2000ms)
   * @param {number} [options.minProfitMargin] - Minimum profit margin (default: 0.1%)
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    // Load fee tiers from environment or use defaults
    // Requirements: 67.5 - Load fee_tier from environment
    this.makerFeePct = options.makerFeePct ?? 
      parseFloat(process.env.MAKER_FEE_PCT || CONFIG.DEFAULT_MAKER_FEE_PCT);
    
    this.takerFeePct = options.takerFeePct ?? 
      parseFloat(process.env.TAKER_FEE_PCT || CONFIG.DEFAULT_TAKER_FEE_PCT);
    
    this.chaseTimeoutMs = options.chaseTimeoutMs || CONFIG.DEFAULT_CHASE_TIMEOUT_MS;
    this.minProfitMargin = options.minProfitMargin || CONFIG.MIN_PROFIT_MARGIN;
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
    
    this.logger.info({
      maker_fee_pct: this.makerFeePct,
      taker_fee_pct: this.takerFeePct,
      chase_timeout_ms: this.chaseTimeoutMs,
    }, 'OrderManager initialized');
  }

  /**
   * Analyze fees for an order
   * @param {number} expectedProfitPct - Expected profit percentage
   * @returns {FeeAnalysis} Fee analysis
   */
  analyzeFees(expectedProfitPct) {
    const profitAfterMaker = expectedProfitPct - this.makerFeePct;
    const profitAfterTaker = expectedProfitPct - this.takerFeePct;
    
    return {
      maker_fee_pct: this.makerFeePct,
      taker_fee_pct: this.takerFeePct,
      expected_profit_pct: expectedProfitPct,
      profit_after_maker: profitAfterMaker,
      profit_after_taker: profitAfterTaker,
      taker_profitable: profitAfterTaker > this.minProfitMargin,
    };
  }

  /**
   * Decide order type based on parameters and fees
   * Requirements: 67.1 - Default to Limit Orders with post_only=true
   * Requirements: 67.3-67.4 - Convert to Market only if expected_profit > taker_fee
   * Requirements: 67.6 - Always use reduce_only=true for exit orders
   * 
   * @param {OrderParams} params - Order parameters
   * @returns {OrderDecision} Order decision
   */
  decideOrderType(params) {
    validateOrderParams(params);
    
    const { signal_id, symbol, side, limit_price, signal_type, expected_profit_pct } = params;
    
    // Requirements: 67.6 - Always use reduce_only=true for exit orders
    const reduceOnly = isExitSignal(signal_type);
    
    // Default decision: Maker order
    // Requirements: 67.1 - Default to Limit Orders with post_only=true
    const decision = {
      order_type: 'LIMIT',
      post_only: true,
      reduce_only: reduceOnly,
      limit_price: limit_price,
      reason: 'DEFAULT_MAKER',
      fee_analysis: null,
    };
    
    // If no expected profit provided, use maker order
    if (expected_profit_pct === undefined || expected_profit_pct === null) {
      this.logger.info({
        signal_id,
        symbol,
        side,
        order_type: 'LIMIT',
        post_only: true,
        reduce_only: reduceOnly,
      }, 'Using default maker order (no profit estimate)');
      
      this.emit('order:decision', { ...decision, signal_id, symbol });
      this.emit('order:maker', { signal_id, symbol, reason: 'NO_PROFIT_ESTIMATE' });
      
      return decision;
    }
    
    // Analyze fees
    const feeAnalysis = this.analyzeFees(expected_profit_pct);
    decision.fee_analysis = feeAnalysis;
    
    this.logger.info({
      signal_id,
      symbol,
      expected_profit_pct,
      profit_after_maker: feeAnalysis.profit_after_maker,
      profit_after_taker: feeAnalysis.profit_after_taker,
      taker_profitable: feeAnalysis.taker_profitable,
    }, 'Fee analysis completed');
    
    this.emit('order:decision', { ...decision, signal_id, symbol });
    this.emit('order:maker', { signal_id, symbol, reason: 'DEFAULT_MAKER' });
    
    return decision;
  }

  /**
   * Evaluate whether to convert unfilled maker order to taker
   * Requirements: 67.2 - If Maker order not filled within chase_timeout_ms, evaluate
   * Requirements: 67.3 - Convert to Market Order only if expected_profit > taker_fee
   * Requirements: 67.4 - Cancel order if expected_profit <= taker_fee
   * 
   * @param {string} signalId - Signal ID
   * @param {number} expectedProfitPct - Expected profit percentage
   * @param {number} elapsedMs - Time elapsed since order placement
   * @returns {{action: 'CONVERT_TO_TAKER'|'CANCEL'|'WAIT', reason: string, fee_analysis: FeeAnalysis}}
   */
  evaluateTakerConversion(signalId, expectedProfitPct, elapsedMs) {
    // If not past chase timeout, wait
    if (elapsedMs < this.chaseTimeoutMs) {
      return {
        action: 'WAIT',
        reason: `Chase timeout not reached (${elapsedMs}ms < ${this.chaseTimeoutMs}ms)`,
        fee_analysis: null,
      };
    }
    
    const feeAnalysis = this.analyzeFees(expectedProfitPct);
    
    // Requirements: 67.3 - Convert to Market Order only if expected_profit > taker_fee
    if (feeAnalysis.taker_profitable) {
      this.logger.info({
        signal_id: signalId,
        expected_profit_pct: expectedProfitPct,
        profit_after_taker: feeAnalysis.profit_after_taker,
        elapsed_ms: elapsedMs,
      }, 'Converting to taker order - profitable');
      
      this.emit('order:taker', { 
        signal_id: signalId, 
        reason: 'TAKER_PROFITABLE',
        profit_after_taker: feeAnalysis.profit_after_taker,
      });
      
      return {
        action: 'CONVERT_TO_TAKER',
        reason: `Taker profitable: ${feeAnalysis.profit_after_taker.toFixed(4)}% after fees`,
        fee_analysis: feeAnalysis,
      };
    }
    
    // Requirements: 67.4 - Cancel order if expected_profit <= taker_fee
    this.logger.warn({
      signal_id: signalId,
      expected_profit_pct: expectedProfitPct,
      profit_after_taker: feeAnalysis.profit_after_taker,
      elapsed_ms: elapsedMs,
    }, 'INSUFFICIENT_PROFIT_FOR_TAKER - Cancelling order');
    
    this.emit('order:cancelled', {
      signal_id: signalId,
      reason: 'INSUFFICIENT_PROFIT_FOR_TAKER',
      expected_profit_pct: expectedProfitPct,
      profit_after_taker: feeAnalysis.profit_after_taker,
    });
    
    return {
      action: 'CANCEL',
      reason: `INSUFFICIENT_PROFIT_FOR_TAKER: ${feeAnalysis.profit_after_taker.toFixed(4)}% < ${this.minProfitMargin}%`,
      fee_analysis: feeAnalysis,
    };
  }

  /**
   * Build order payload with fee-aware settings
   * @param {OrderParams} params - Order parameters
   * @param {OrderDecision} decision - Order decision
   * @returns {Object} Order payload for broker
   */
  buildOrderPayload(params, decision) {
    const payload = {
      symbol: params.symbol,
      side: params.side,
      size: params.size,
      order_type: decision.order_type,
      post_only: decision.post_only,
      reduce_only: decision.reduce_only,
      client_order_id: `titan_${params.signal_id}_${Date.now()}`,
    };
    
    if (decision.order_type === 'LIMIT') {
      payload.limit_price = decision.limit_price;
    }
    
    if (params.stop_loss) {
      payload.stop_loss = params.stop_loss;
    }
    
    if (params.take_profits && params.take_profits.length > 0) {
      payload.take_profits = params.take_profits;
    }
    
    return payload;
  }

  /**
   * Update fee configuration
   * @param {number} makerFeePct - New maker fee percentage
   * @param {number} takerFeePct - New taker fee percentage
   */
  updateFees(makerFeePct, takerFeePct) {
    this.makerFeePct = makerFeePct;
    this.takerFeePct = takerFeePct;
    
    this.logger.info({
      maker_fee_pct: makerFeePct,
      taker_fee_pct: takerFeePct,
    }, 'Fee configuration updated');
  }

  /**
   * Get current fee configuration
   * @returns {Object} Fee configuration
   */
  getFeeConfig() {
    return {
      maker_fee_pct: this.makerFeePct,
      taker_fee_pct: this.takerFeePct,
      chase_timeout_ms: this.chaseTimeoutMs,
      min_profit_margin: this.minProfitMargin,
    };
  }
}

// Export helper functions for testing
export { validateOrderParams, isExitSignal, CONFIG };

export default OrderManager;
