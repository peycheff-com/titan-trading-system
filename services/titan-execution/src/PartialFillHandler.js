/**
 * PartialFillHandler - Partial Fill Management
 * 
 * Handles partial fills by updating Shadow State with actual filled size
 * and deciding whether to chase remaining or cancel.
 * 
 * Requirements: 68.1-68.7
 * 
 * @module PartialFillHandler
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  MIN_FILL_RATIO_TO_CHASE: 0.5,     // 50% fill ratio threshold
  CANCEL_TIMEOUT_MS: 5000,          // 5 seconds before cancelling low fills
  MIN_REMAINING_SIZE: 0.0001,       // Minimum size worth chasing
};

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} FillUpdate
 * @property {string} signal_id - Signal ID
 * @property {string} symbol - Trading symbol
 * @property {number} requested_size - Originally requested size
 * @property {number} filled_size - Actually filled size
 * @property {number} fill_price - Average fill price
 * @property {number} remaining_size - Remaining unfilled size
 * @property {number} fill_ratio - Ratio of filled to requested (0-1)
 * @property {number} elapsed_ms - Time elapsed since order placement
 */

/**
 * @typedef {Object} FillDecision
 * @property {'CHASE'|'CANCEL'|'COMPLETE'} action - Action to take
 * @property {string} reason - Reason for the decision
 * @property {number} [chase_size] - Size to chase (if action is CHASE)
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
// PARTIAL FILL HANDLER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * PartialFillHandler class
 * 
 * Features:
 * - Update Shadow State with actual filled_size, not requested_size
 * - Cancel remaining if fill_ratio < 0.5 AND time_elapsed > 5000ms
 * - Chase remaining with Limit Chaser if fill_ratio >= 0.5
 * - Exit signals use current_position_size, not original_size
 * 
 * Events emitted:
 * - 'fill:partial' - When a partial fill is received
 * - 'fill:complete' - When order is fully filled
 * - 'fill:chase' - When remaining is being chased
 * - 'fill:cancel' - When remaining is cancelled
 */
export class PartialFillHandler extends EventEmitter {
  /**
   * Create a new PartialFillHandler instance
   * @param {Object} options - Configuration options
   * @param {Object} options.shadowState - ShadowState instance
   * @param {number} [options.minFillRatioToChase] - Minimum fill ratio to chase (default: 0.5)
   * @param {number} [options.cancelTimeoutMs] - Timeout before cancelling low fills (default: 5000ms)
   * @param {number} [options.minRemainingSize] - Minimum size worth chasing
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    if (!options.shadowState) {
      throw new Error('ShadowState instance is required');
    }
    
    this.shadowState = options.shadowState;
    this.minFillRatioToChase = options.minFillRatioToChase ?? CONFIG.MIN_FILL_RATIO_TO_CHASE;
    this.cancelTimeoutMs = options.cancelTimeoutMs ?? CONFIG.CANCEL_TIMEOUT_MS;
    this.minRemainingSize = options.minRemainingSize ?? CONFIG.MIN_REMAINING_SIZE;
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
    
    /** @type {Map<string, Object>} Tracking active orders */
    this.activeOrders = new Map();
  }

  /**
   * Calculate fill update from broker response
   * @param {string} signalId - Signal ID
   * @param {number} requestedSize - Originally requested size
   * @param {number} filledSize - Actually filled size
   * @param {number} fillPrice - Average fill price
   * @param {number} elapsedMs - Time elapsed since order placement
   * @returns {FillUpdate} Fill update
   */
  calculateFillUpdate(signalId, requestedSize, filledSize, fillPrice, elapsedMs) {
    const remainingSize = requestedSize - filledSize;
    const fillRatio = requestedSize > 0 ? filledSize / requestedSize : 0;
    
    return {
      signal_id: signalId,
      requested_size: requestedSize,
      filled_size: filledSize,
      fill_price: fillPrice,
      remaining_size: remainingSize,
      fill_ratio: fillRatio,
      elapsed_ms: elapsedMs,
    };
  }

  /**
   * Decide action for partial fill
   * Requirements: 68.3 - If fill_ratio < 0.5 AND time_elapsed > 5000ms: cancel remaining
   * Requirements: 68.4 - If fill_ratio >= 0.5: chase remaining with Limit Chaser
   * 
   * @param {FillUpdate} fillUpdate - Fill update
   * @returns {FillDecision} Decision on what to do
   */
  decideAction(fillUpdate) {
    const { signal_id, fill_ratio, remaining_size, elapsed_ms } = fillUpdate;
    
    // If fully filled, complete
    if (remaining_size <= this.minRemainingSize) {
      return {
        action: 'COMPLETE',
        reason: 'Order fully filled',
      };
    }
    
    // Requirements: 68.3 - Cancel if fill_ratio < 0.5 AND time_elapsed > 5000ms
    if (fill_ratio < this.minFillRatioToChase && elapsed_ms > this.cancelTimeoutMs) {
      this.logger.warn({
        signal_id,
        fill_ratio,
        elapsed_ms,
        remaining_size,
      }, 'Cancelling remaining order - low fill ratio after timeout');
      
      return {
        action: 'CANCEL',
        reason: `fill_ratio (${(fill_ratio * 100).toFixed(1)}%) < ${this.minFillRatioToChase * 100}% after ${elapsed_ms}ms`,
      };
    }
    
    // Requirements: 68.4 - Chase remaining if fill_ratio >= 0.5
    if (fill_ratio >= this.minFillRatioToChase) {
      this.logger.info({
        signal_id,
        fill_ratio,
        remaining_size,
      }, 'Chasing remaining order - good fill ratio');
      
      return {
        action: 'CHASE',
        reason: `fill_ratio (${(fill_ratio * 100).toFixed(1)}%) >= ${this.minFillRatioToChase * 100}%`,
        chase_size: remaining_size,
      };
    }
    
    // Still within timeout, wait
    return {
      action: 'CHASE',
      reason: `Within timeout (${elapsed_ms}ms < ${this.cancelTimeoutMs}ms), continuing chase`,
      chase_size: remaining_size,
    };
  }

  /**
   * Handle partial fill from broker
   * Requirements: 68.2 - Update Shadow State with actual filled_size, not requested_size
   * 
   * @param {string} signalId - Signal ID
   * @param {string} symbol - Trading symbol
   * @param {Object} brokerResponse - Broker response
   * @param {number} brokerResponse.fill_size - Filled size
   * @param {number} brokerResponse.fill_price - Fill price
   * @param {number} requestedSize - Originally requested size
   * @param {number} orderStartTime - Timestamp when order was placed
   * @returns {{fillUpdate: FillUpdate, decision: FillDecision, position: Object|null}}
   */
  handlePartialFill(signalId, symbol, brokerResponse, requestedSize, orderStartTime) {
    const elapsedMs = Date.now() - orderStartTime;
    const { fill_size, fill_price } = brokerResponse;
    
    // Calculate fill update
    const fillUpdate = this.calculateFillUpdate(
      signalId,
      requestedSize,
      fill_size,
      fill_price,
      elapsedMs
    );
    fillUpdate.symbol = symbol;
    
    // Log the fill
    // Requirements: 68.7 - Log: signal_id, requested_size, filled_size, fill_ratio, action_taken
    this.logger.info({
      signal_id: signalId,
      symbol,
      requested_size: requestedSize,
      filled_size: fill_size,
      fill_ratio: fillUpdate.fill_ratio,
      remaining_size: fillUpdate.remaining_size,
      elapsed_ms: elapsedMs,
    }, 'Partial fill received');
    
    // Decide action
    const decision = this.decideAction(fillUpdate);
    
    // Requirements: 68.2 - Update Shadow State with actual filled_size
    let position = null;
    if (fill_size > 0) {
      // Confirm execution with actual filled size
      position = this.shadowState.confirmExecution(signalId, {
        broker_order_id: brokerResponse.broker_order_id,
        fill_price: fill_price,
        fill_size: fill_size, // Use actual filled size, not requested
        filled: true,
      });
    }
    
    // Emit events
    if (decision.action === 'COMPLETE') {
      this.emit('fill:complete', { signal_id: signalId, symbol, fillUpdate });
    } else if (decision.action === 'CANCEL') {
      this.emit('fill:cancel', { signal_id: signalId, symbol, fillUpdate, decision });
    } else {
      this.emit('fill:partial', { signal_id: signalId, symbol, fillUpdate, decision });
      if (decision.action === 'CHASE') {
        this.emit('fill:chase', { 
          signal_id: signalId, 
          symbol, 
          chase_size: decision.chase_size,
          fill_price,
        });
      }
    }
    
    // Log action taken
    this.logger.info({
      signal_id: signalId,
      requested_size: requestedSize,
      filled_size: fill_size,
      fill_ratio: fillUpdate.fill_ratio,
      action_taken: decision.action,
      reason: decision.reason,
    }, 'Partial fill handled');
    
    return { fillUpdate, decision, position };
  }

  /**
   * Get exit size for a symbol
   * Requirements: 68.5 - Exit signals use size = current_position_size (not original_size)
   * 
   * @param {string} symbol - Trading symbol
   * @returns {number} Current position size or 0
   */
  getExitSize(symbol) {
    const position = this.shadowState.getPosition(symbol);
    if (!position) {
      this.logger.warn({ symbol }, 'No position found for exit size calculation');
      return 0;
    }
    return position.size;
  }

  /**
   * Track an active order
   * @param {string} signalId - Signal ID
   * @param {Object} orderInfo - Order information
   */
  trackOrder(signalId, orderInfo) {
    this.activeOrders.set(signalId, {
      ...orderInfo,
      start_time: Date.now(),
      fills: [],
    });
  }

  /**
   * Get tracked order
   * @param {string} signalId - Signal ID
   * @returns {Object|null} Order info or null
   */
  getTrackedOrder(signalId) {
    return this.activeOrders.get(signalId) || null;
  }

  /**
   * Remove tracked order
   * @param {string} signalId - Signal ID
   */
  removeTrackedOrder(signalId) {
    this.activeOrders.delete(signalId);
  }

  /**
   * Get all active orders
   * @returns {Map<string, Object>} Active orders
   */
  getActiveOrders() {
    return new Map(this.activeOrders);
  }

  /**
   * Get handler status
   * @returns {Object} Handler status
   */
  getStatus() {
    return {
      active_orders: this.activeOrders.size,
      min_fill_ratio_to_chase: this.minFillRatioToChase,
      cancel_timeout_ms: this.cancelTimeoutMs,
      min_remaining_size: this.minRemainingSize,
    };
  }
}

// Export config for testing
export { CONFIG };

export default PartialFillHandler;
