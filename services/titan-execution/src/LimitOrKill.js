/**
 * Limit-or-Kill Execution (Phase 1)
 * 
 * Places Limit Order at Bid (BUY) or Ask (SELL) with postOnly=true.
 * Waits exactly 5 seconds for fill, polling every 100ms.
 * If not filled: CANCEL ORDER (do not chase).
 * Handles partial fills: cancel remaining, keep partial position.
 * 
 * Requirements: 94.1-94.6
 * 
 * @module LimitOrKill
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  WAIT_TIME_MS: 5000,           // Exactly 5 seconds wait time
  POLL_INTERVAL_MS: 100,        // Poll every 100ms
  MIN_FILL_RATIO: 0.0,          // Accept any partial fill (even 1%)
};

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} LimitOrKillParams
 * @property {string} signal_id - Signal ID for tracking
 * @property {string} symbol - Trading symbol (e.g., "BTCUSDT")
 * @property {'BUY'|'SELL'} side - Order side
 * @property {number} size - Order size in units
 * @property {number} limit_price - Limit price (Bid for BUY, Ask for SELL)
 * @property {number} [stop_loss] - Stop loss price
 * @property {number[]} [take_profits] - Array of take profit prices
 */

/**
 * @typedef {Object} LimitOrKillResult
 * @property {boolean} success - Whether execution was successful
 * @property {'FILLED'|'PARTIALLY_FILLED'|'MISSED_ENTRY'} status - Execution status
 * @property {string} [broker_order_id] - Broker's order ID
 * @property {number} [fill_price] - Actual fill price
 * @property {number} [fill_size] - Actual filled size
 * @property {number} [requested_size] - Originally requested size
 * @property {string} [reason] - Reason for missed entry
 * @property {Object} [price_movement] - Price movement data for missed entries
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} Logger
 * @property {Function} info - Info level logging
 * @property {Function} warn - Warning level logging
 * @property {Function} error - Error level logging
 */

/**
 * @typedef {Object} BrokerGateway
 * @property {Function} sendOrder - Send order to broker
 * @property {Function} cancelOrder - Cancel an order
 * @property {Function} getOrderStatus - Get order status
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
 * Validate LimitOrKill parameters
 * @param {LimitOrKillParams} params - Parameters to validate
 * @throws {Error} If validation fails
 */
function validateParams(params) {
  if (!params) {
    throw new Error('LimitOrKill parameters are required');
  }
  if (!params.signal_id || typeof params.signal_id !== 'string') {
    throw new Error('signal_id is required and must be a string');
  }
  if (!params.symbol || typeof params.symbol !== 'string') {
    throw new Error('symbol is required and must be a string');
  }
  if (!params.side || !['BUY', 'SELL'].includes(params.side)) {
    throw new Error('side must be BUY or SELL');
  }
  if (typeof params.size !== 'number' || params.size <= 0 || !Number.isFinite(params.size)) {
    throw new Error('size must be a positive finite number');
  }
  if (typeof params.limit_price !== 'number' || params.limit_price <= 0) {
    throw new Error('limit_price is required and must be positive');
  }
}

//─────────────────────────────────────────────────────────────────────────────
// MOCK BROKER ADAPTER (for testing)
//─────────────────────────────────────────────────────────────────────────────

/**
 * Mock broker adapter for testing LimitOrKill
 * Simulates order placement and status checking
 */
export class MockLimitOrKillAdapter {
  constructor() {
    /** @type {Map<string, Object>} */
    this.orders = new Map();
    
    /** @type {number} Order counter for generating IDs */
    this._orderCounter = 2000;
    
    /** @type {boolean} Whether to simulate fill */
    this.simulateFill = true;
    
    /** @type {number} Simulated fill delay in ms */
    this.fillDelayMs = 1000;
    
    /** @type {number} Simulated partial fill ratio (0-1) */
    this.partialFillRatio = 1.0; // 1.0 = full fill, 0.5 = 50% fill
    
    /** @type {number} Current market price */
    this.currentPrice = 50000;
  }

  /**
   * Send an order
   * @param {Object} order - Order to send
   * @returns {Promise<Object>} Order result
   */
  async sendOrder(order) {
    const orderId = `LOK_${++this._orderCounter}`;
    
    const orderRecord = {
      ...order,
      broker_order_id: orderId,
      status: 'NEW',
      fill_price: null,
      fill_size: 0,
      created_at: Date.now(),
    };
    
    this.orders.set(orderId, orderRecord);
    
    // Simulate fill after delay
    if (this.simulateFill) {
      setTimeout(() => {
        const order = this.orders.get(orderId);
        if (order && order.status === 'NEW') {
          const fillSize = order.size * this.partialFillRatio;
          order.status = fillSize >= order.size ? 'FILLED' : 'PARTIALLY_FILLED';
          order.fill_price = order.limit_price;
          order.fill_size = fillSize;
          order.filled_at = Date.now();
        }
      }, this.fillDelayMs);
    }
    
    return {
      broker_order_id: orderId,
      status: 'NEW',
    };
  }

  /**
   * Get order status
   * @param {string} orderId - Order ID
   * @returns {Promise<Object>} Order status
   */
  async getOrderStatus(orderId) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    
    return {
      broker_order_id: orderId,
      status: order.status,
      fill_price: order.fill_price,
      fill_size: order.fill_size,
      remaining_size: order.size - order.fill_size,
    };
  }

  /**
   * Cancel an order
   * @param {string} orderId - Order ID to cancel
   * @returns {Promise<Object>} Cancellation result
   */
  async cancelOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    
    if (order.status === 'FILLED') {
      return { success: false, reason: 'ALREADY_FILLED' };
    }
    
    order.status = 'CANCELED';
    order.canceled_at = Date.now();
    
    return { 
      success: true, 
      order_id: orderId,
      fill_size: order.fill_size,
    };
  }

  /**
   * Reset mock state
   */
  reset() {
    this.orders.clear();
    this._orderCounter = 2000;
    this.simulateFill = true;
    this.fillDelayMs = 1000;
    this.partialFillRatio = 1.0;
    this.currentPrice = 50000;
  }
}

//─────────────────────────────────────────────────────────────────────────────
// LIMIT-OR-KILL CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * LimitOrKill execution class
 * 
 * Phase 1 execution strategy:
 * - Place Limit Order at Bid (BUY) or Ask (SELL) with postOnly=true
 * - Wait exactly 5 seconds for fill, polling every 100ms
 * - If not filled: CANCEL ORDER (do not chase)
 * - Handle partial fills: cancel remaining, keep partial position
 * 
 * Events emitted:
 * - 'order:placed' - When order is placed
 * - 'order:filled' - When order is fully filled
 * - 'order:partially_filled' - When order is partially filled
 * - 'order:missed' - When order is not filled and canceled
 * - 'order:canceled' - When remaining order is canceled
 */
export class LimitOrKill extends EventEmitter {
  /**
   * Create a new LimitOrKill instance
   * @param {Object} options - Configuration options
   * @param {BrokerGateway} options.brokerGateway - Broker gateway instance
   * @param {Logger} [options.logger] - Logger instance
   * @param {number} [options.waitTimeMs] - Wait time in milliseconds (default: 5000)
   * @param {number} [options.pollIntervalMs] - Poll interval in milliseconds (default: 100)
   */
  constructor(options = {}) {
    super();
    
    if (!options.brokerGateway) {
      throw new Error('brokerGateway is required');
    }
    
    /** @type {BrokerGateway} Broker gateway */
    this.brokerGateway = options.brokerGateway;
    
    /** @type {number} Wait time in milliseconds */
    this.waitTimeMs = options.waitTimeMs || CONFIG.WAIT_TIME_MS;
    
    /** @type {number} Poll interval in milliseconds */
    this.pollIntervalMs = options.pollIntervalMs || CONFIG.POLL_INTERVAL_MS;
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // EXECUTION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Execute Limit-or-Kill order
   * 
   * Requirements: 94.1 - Place Limit Order at Bid (BUY) or Ask (SELL)
   * Requirements: 94.2 - Wait exactly 5 seconds for fill
   * Requirements: 94.3 - If not filled after 5 seconds, CANCEL ORDER
   * Requirements: 94.4 - Log missed entry with price movement
   * Requirements: 94.5 - Proceed with normal position management if filled
   * Requirements: 94.6 - Handle partial fills: cancel remaining, keep partial
   * 
   * @param {LimitOrKillParams} params - Execution parameters
   * @returns {Promise<LimitOrKillResult>} Execution result
   */
  async execute(params) {
    // Validate parameters
    validateParams(params);
    
    const startTime = Date.now();
    const bidAtEntry = params.limit_price; // Store entry price for logging
    
    this.logger.info({
      signal_id: params.signal_id,
      symbol: params.symbol,
      side: params.side,
      size: params.size,
      limit_price: params.limit_price,
    }, 'Starting Limit-or-Kill execution');
    
    try {
      // Requirements: 94.1 - Place Limit Order at Bid (BUY) or Ask (SELL) with postOnly=true
      const orderResult = await this.brokerGateway.sendOrder(params.signal_id, {
        symbol: params.symbol,
        side: params.side,
        size: params.size,
        limit_price: params.limit_price,
        stop_loss: params.stop_loss,
        take_profits: params.take_profits,
        order_type: 'LIMIT',
        post_only: true, // Maker order only
        reduce_only: false,
      });
      
      if (!orderResult.success) {
        throw new Error(`Order placement failed: ${orderResult.error}`);
      }
      
      const orderId = orderResult.broker_order_id;
      
      this.emit('order:placed', {
        signal_id: params.signal_id,
        broker_order_id: orderId,
        limit_price: params.limit_price,
        size: params.size,
      });
      
      this.logger.info({
        signal_id: params.signal_id,
        broker_order_id: orderId,
      }, 'Order placed, waiting for fill');
      
      // Requirements: 94.2 - Wait exactly 5 seconds for fill, polling every 100ms
      const endTime = startTime + this.waitTimeMs;
      let lastStatus = null;
      
      while (Date.now() < endTime) {
        // Poll order status
        try {
          const status = await this.brokerGateway.getAdapter().getOrderStatus(orderId);
          lastStatus = status;
          
          // Check if fully filled
          if (status.status === 'FILLED') {
            // Requirements: 94.5 - Proceed with normal position management if filled
            const result = {
              success: true,
              filled: true, // Compatibility with tests
              status: 'FILLED',
              broker_order_id: orderId,
              fill_price: status.fill_price,
              fill_size: status.fill_size,
              requested_size: params.size,
              timestamp: new Date().toISOString(),
            };
            
            this.emit('order:filled', result);
            
            this.logger.info({
              signal_id: params.signal_id,
              broker_order_id: orderId,
              fill_price: status.fill_price,
              fill_size: status.fill_size,
            }, 'Order fully filled');
            
            return result;
          }
          
          // Check if partially filled
          if (status.status === 'PARTIALLY_FILLED' && status.fill_size > 0) {
            this.logger.info({
              signal_id: params.signal_id,
              broker_order_id: orderId,
              fill_size: status.fill_size,
              remaining_size: status.remaining_size,
            }, 'Order partially filled, continuing to wait');
          }
          
        } catch (error) {
          this.logger.warn({
            signal_id: params.signal_id,
            broker_order_id: orderId,
            error: error.message,
          }, 'Error polling order status');
        }
        
        // Wait before next poll
        await sleep(this.pollIntervalMs);
      }
      
      // Requirements: 94.3 - If not filled after 5 seconds, CANCEL ORDER
      this.logger.warn({
        signal_id: params.signal_id,
        broker_order_id: orderId,
        elapsed_ms: Date.now() - startTime,
      }, 'Wait time expired, canceling order');
      
      // Cancel the order
      const cancelResult = await this.brokerGateway.cancelOrder(orderId);
      
      // Check final status after cancellation
      const finalStatus = lastStatus || await this.brokerGateway.getAdapter().getOrderStatus(orderId);
      
      // Requirements: 94.6 - Handle partial fills: cancel remaining, keep partial position
      if (finalStatus.fill_size > 0) {
        const result = {
          success: true,
          filled: true, // Compatibility with tests (partial fill is still filled)
          partial: true, // Compatibility with tests
          status: 'PARTIALLY_FILLED',
          broker_order_id: orderId,
          fill_price: finalStatus.fill_price,
          fill_size: finalStatus.fill_size,
          requested_size: params.size,
          timestamp: new Date().toISOString(),
        };
        
        this.emit('order:partially_filled', result);
        this.emit('order:canceled', {
          broker_order_id: orderId,
          remaining_size: finalStatus.remaining_size,
        });
        
        this.logger.info({
          signal_id: params.signal_id,
          broker_order_id: orderId,
          fill_size: finalStatus.fill_size,
          remaining_size: finalStatus.remaining_size,
        }, 'Partial fill kept, remaining canceled');
        
        return result;
      }
      
      // Requirements: 94.4 - Log missed entry with price movement
      // Get current market price (would come from WebSocket cache in production)
      const currentBid = params.limit_price; // Placeholder - would get from market data
      const priceMovement = {
        bid_at_entry: bidAtEntry,
        current_bid: currentBid,
        movement_pct: ((currentBid - bidAtEntry) / bidAtEntry) * 100,
      };
      
      const result = {
        success: false,
        filled: false, // Compatibility with tests
        status: 'MISSED_ENTRY',
        reason: 'Price ran away', // Requirements: 94.4 - Log missed entry reason
        broker_order_id: orderId,
        requested_size: params.size,
        price_movement: priceMovement,
        timestamp: new Date().toISOString(),
      };
      
      this.emit('order:missed', result);
      
      // Requirements: 94.4 - Log: "Missed Entry - Price ran away", signal_id, bid_at_entry, current_bid, price_movement
      this.logger.warn({
        signal_id: params.signal_id,
        broker_order_id: orderId,
        bid_at_entry: bidAtEntry,
        current_bid: currentBid,
        price_movement: priceMovement,
      }, 'Missed Entry - Price ran away');
      
      return result;
      
    } catch (error) {
      this.logger.error({
        signal_id: params.signal_id,
        error: error.message,
      }, 'Limit-or-Kill execution failed');
      
      return {
        success: false,
        status: 'MISSED_ENTRY',
        reason: error.message,
        requested_size: params.size,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export helper functions for testing
export { validateParams, createDefaultLogger };

export default LimitOrKill;
