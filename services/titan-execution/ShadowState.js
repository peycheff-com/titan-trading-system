/**
 * Shadow State Tracker
 * 
 * Master of Truth for position state, independent of Pine's strategy.position_size.
 * Prevents ghost positions where Pine thinks it's long but broker is flat.
 * 
 * Requirements: 31.1-31.6
 * 
 * @module ShadowState
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  MAX_TRADE_HISTORY: 1000,
  INTENT_TTL_MS: 5 * 60 * 1000,      // 5 minutes
  CLEANUP_INTERVAL_MS: 60 * 1000,    // 1 minute
};

/** @constant {number[]} Valid direction values */
const VALID_DIRECTIONS = [1, -1];

/** @constant {Set<string>} Valid close intent types */
const CLOSE_INTENT_TYPES = new Set(['CLOSE', 'CLOSE_LONG', 'CLOSE_SHORT']);

//─────────────────────────────────────────────────────────────────────────────
// PNL CALCULATION STRATEGIES
//─────────────────────────────────────────────────────────────────────────────

/**
 * PnL calculation strategies by position side
 * @type {Object<string, Function>}
 */
const pnlCalculators = {
  LONG: (entryPrice, exitPrice, size) => (exitPrice - entryPrice) * size,
  SHORT: (entryPrice, exitPrice, size) => (entryPrice - exitPrice) * size,
};

/**
 * PnL percentage calculation strategies by position side
 * @type {Object<string, Function>}
 */
const pnlPctCalculators = {
  LONG: (entryPrice, exitPrice) => ((exitPrice - entryPrice) / entryPrice) * 100,
  SHORT: (entryPrice, exitPrice) => ((entryPrice - exitPrice) / entryPrice) * 100,
};


//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Position
 * @property {string} symbol - Trading symbol (e.g., "BTCUSDT")
 * @property {'LONG'|'SHORT'} side - Position direction
 * @property {number} size - Position size in units
 * @property {number} entry_price - Average entry price
 * @property {number} stop_loss - Stop loss price
 * @property {number[]} take_profits - Array of take profit prices
 * @property {string} signal_id - Original signal ID that opened this position
 * @property {string} opened_at - ISO timestamp when position was opened
 */

/**
 * @typedef {Object} Intent
 * @property {string} signal_id - Unique signal identifier
 * @property {'BUY_SETUP'|'SELL_SETUP'|'CLOSE_LONG'|'CLOSE_SHORT'} type - Intent type
 * @property {string} symbol - Trading symbol
 * @property {number} direction - 1 for long, -1 for short
 * @property {number[]} entry_zone - Entry price ladder [E1, E2, E3]
 * @property {number} stop_loss - Stop loss price
 * @property {number[]} take_profits - Take profit prices [TP1, TP2, TP3]
 * @property {number} size - Calculated position size
 * @property {string} received_at - ISO timestamp when intent was received
 * @property {'PENDING'|'VALIDATED'|'REJECTED'|'EXECUTED'|'EXPIRED'} status - Intent status
 * @property {string} [rejection_reason] - Reason for rejection if status is REJECTED
 */

/**
 * @typedef {Object} TradeRecord
 * @property {string} signal_id - Signal ID
 * @property {string} symbol - Trading symbol
 * @property {'LONG'|'SHORT'} side - Position direction
 * @property {number} entry_price - Entry price
 * @property {number} exit_price - Exit price
 * @property {number} size - Position size
 * @property {number} pnl - Profit/Loss in quote currency
 * @property {number} pnl_pct - Profit/Loss percentage
 * @property {string} opened_at - ISO timestamp
 * @property {string} closed_at - ISO timestamp
 * @property {string} close_reason - Reason for closing (TP1, TP2, TP3, SL, REGIME_KILL, MANUAL)
 */

/**
 * @typedef {Object} Logger
 * @property {Function} info - Info level logging
 * @property {Function} warn - Warning level logging
 * @property {Function} error - Error level logging
 */


//─────────────────────────────────────────────────────────────────────────────
// VALIDATION HELPERS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Validate intent payload has required fields
 * @param {Object} payload - Intent payload to validate
 * @throws {Error} If validation fails
 */
function validateIntentPayload(payload) {
  if (!payload) {
    throw new Error('Intent payload is required');
  }
  if (!payload.signal_id || typeof payload.signal_id !== 'string') {
    throw new Error('signal_id is required and must be a string');
  }
  if (!payload.symbol || typeof payload.symbol !== 'string') {
    throw new Error('symbol is required and must be a string');
  }
  if (typeof payload.direction !== 'number' || !VALID_DIRECTIONS.includes(payload.direction)) {
    throw new Error('direction must be 1 (long) or -1 (short)');
  }
}

/**
 * Validate exit price is a valid positive finite number
 * @param {number} exitPrice - Exit price to validate
 * @throws {Error} If validation fails
 */
function validateExitPrice(exitPrice) {
  if (typeof exitPrice !== 'number' || exitPrice <= 0 || !Number.isFinite(exitPrice)) {
    throw new Error('exitPrice must be a positive finite number');
  }
}

/**
 * Validate close size is valid for the position
 * @param {number} closeSize - Size to close
 * @param {number} positionSize - Current position size
 * @throws {Error} If validation fails
 */
function validateCloseSize(closeSize, positionSize) {
  if (typeof closeSize !== 'number' || closeSize <= 0 || !Number.isFinite(closeSize)) {
    throw new Error('closeSize must be a positive finite number');
  }
  if (closeSize > positionSize) {
    throw new Error(`closeSize (${closeSize}) cannot exceed position size (${positionSize})`);
  }
}

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
// INTENT BUILDER
//─────────────────────────────────────────────────────────────────────────────

/**
 * Builder class for creating Intent objects
 * Provides a fluent API for constructing intents with optional fields
 */
class IntentBuilder {
  /**
   * Create a new IntentBuilder
   * @param {string} signalId - Unique signal identifier
   * @param {string} symbol - Trading symbol
   * @param {number} direction - 1 for long, -1 for short
   */
  constructor(signalId, symbol, direction) {
    this.intent = {
      signal_id: signalId,
      symbol,
      direction,
      entry_zone: [],
      stop_loss: 0,
      take_profits: [],
      size: 0,
      status: 'PENDING',
    };
  }

  /**
   * Set the intent type
   * @param {string} type - Intent type
   * @returns {IntentBuilder} this for chaining
   */
  withType(type) {
    this.intent.type = type;
    return this;
  }

  /**
   * Set entry zone prices
   * @param {number[]} zone - Entry price ladder
   * @returns {IntentBuilder} this for chaining
   */
  withEntryZone(zone) {
    this.intent.entry_zone = zone || [];
    return this;
  }

  /**
   * Set stop loss price
   * @param {number} stopLoss - Stop loss price
   * @returns {IntentBuilder} this for chaining
   */
  withStopLoss(stopLoss) {
    this.intent.stop_loss = stopLoss || 0;
    return this;
  }

  /**
   * Set take profit prices
   * @param {number[]} takeProfits - Take profit prices
   * @returns {IntentBuilder} this for chaining
   */
  withTakeProfits(takeProfits) {
    this.intent.take_profits = takeProfits || [];
    return this;
  }

  /**
   * Set position size
   * @param {number} size - Position size
   * @returns {IntentBuilder} this for chaining
   */
  withSize(size) {
    this.intent.size = size || 0;
    return this;
  }

  /**
   * Set regime state
   * @param {number} regimeState - Regime state at entry
   * @returns {IntentBuilder} this for chaining
   */
  withRegimeState(regimeState) {
    this.intent.regime_state = regimeState;
    return this;
  }

  /**
   * Set phase
   * @param {number} phase - Phase at entry
   * @returns {IntentBuilder} this for chaining
   */
  withPhase(phase) {
    this.intent.phase = phase;
    return this;
  }

  /**
   * Build the final Intent object
   * @returns {Intent} The constructed intent
   */
  build() {
    return {
      ...this.intent,
      received_at: new Date().toISOString(),
    };
  }
}


//─────────────────────────────────────────────────────────────────────────────
// SHADOW STATE CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Shadow State class - Master of Truth for position tracking
 * 
 * Extends EventEmitter to allow other components (ZScoreDrift, Reconciliation)
 * to react to state changes.
 * 
 * Events emitted:
 * - 'position:opened' - When a new position is opened
 * - 'position:updated' - When a position is modified (pyramid)
 * - 'position:closed' - When a position is closed
 * - 'position:partial_close' - When a position is partially closed
 * - 'trade:recorded' - When a trade is added to history
 * - 'intent:processed' - When an intent is received
 * - 'intent:validated' - When an intent passes L2 validation
 * - 'intent:rejected' - When an intent is rejected
 * - 'intent:expired' - When intents are cleaned up
 * 
 * Key responsibilities:
 * 1. Track positions independently of Pine's internal state
 * 2. Process intent signals (not position commands)
 * 3. Prevent ghost positions from L2 rejections
 * 4. Detect and ignore zombie signals (close signals for non-existent positions)
 * 5. Calculate PnL from Shadow State, not Pine metrics
 */
export class ShadowState extends EventEmitter {
  /**
   * Create a new ShadowState instance
   * @param {Object} options - Configuration options
   * @param {Logger} [options.logger] - Logger object with info/warn/error methods
   * @param {number} [options.intentTtlMs] - Intent TTL in milliseconds (default: 5 minutes)
   * @param {number} [options.maxTradeHistory] - Maximum trade history to keep (default: 1000)
   * @param {number} [options.cleanupIntervalMs] - Cleanup interval in milliseconds (default: 1 minute)
   * @param {Object} [options.databaseManager] - DatabaseManager instance for persistence
   */
  constructor(options = {}) {
    super();
    
    /** @type {Map<string, Position>} symbol → Position */
    this.positions = new Map();
    
    /** @type {Map<string, Intent>} signal_id → Intent */
    this.pendingIntents = new Map();
    
    /** @type {TradeRecord[]} Historical trade records for PnL calculation */
    this.tradeHistory = [];
    
    /** @type {number} Maximum trade history to keep */
    this.maxTradeHistory = options.maxTradeHistory || CONFIG.MAX_TRADE_HISTORY;
    
    /** @type {number} Intent TTL in milliseconds */
    this.intentTtlMs = options.intentTtlMs || CONFIG.INTENT_TTL_MS;
    
    /** @type {number} Cleanup interval in milliseconds */
    this._cleanupIntervalMs = options.cleanupIntervalMs || CONFIG.CLEANUP_INTERVAL_MS;
    
    /** @type {Object|null} DatabaseManager instance for persistence */
    this.databaseManager = options.databaseManager || null;
    
    // Create logger with consistent interface
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
    
    /** @type {number} Last cleanup timestamp */
    this._lastCleanup = Date.now();
    
    /** @type {boolean} Whether the instance has been destroyed */
    this._destroyed = false;
    
    // Requirements: 97.10 - Recover Shadow State from database on startup
    if (this.databaseManager) {
      this._recoverFromDatabase().catch(error => {
        this.logger.error({
          error: error.message,
        }, 'Failed to recover Shadow State from database (non-blocking)');
      });
    }
  }


  //─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Clone a position object (deep copy for arrays)
   * @param {Position|undefined} position - Position to clone
   * @returns {Position|undefined} Cloned position or undefined
   * @private
   */
  _clonePosition(position) {
    if (!position) return undefined;
    return { 
      ...position, 
      take_profits: [...position.take_profits],
    };
  }

  /**
   * Clone an intent object (deep copy for arrays)
   * @param {Intent|undefined} intent - Intent to clone
   * @returns {Intent|undefined} Cloned intent or undefined
   * @private
   */
  _cloneIntent(intent) {
    if (!intent) return undefined;
    return {
      ...intent,
      entry_zone: intent.entry_zone ? [...intent.entry_zone] : [],
      take_profits: intent.take_profits ? [...intent.take_profits] : [],
    };
  }

  /**
   * Calculate PnL for a position
   * @param {string} side - Position side ('LONG' or 'SHORT')
   * @param {number} entryPrice - Entry price
   * @param {number} exitPrice - Exit price
   * @param {number} size - Position size
   * @returns {{pnl: number, pnl_pct: number}} PnL values
   * @private
   */
  _calculatePnl(side, entryPrice, exitPrice, size) {
    const calculator = pnlCalculators[side];
    const pctCalculator = pnlPctCalculators[side];
    
    if (!calculator || !pctCalculator) {
      throw new Error(`Invalid position side: ${side}`);
    }
    
    return {
      pnl: calculator(entryPrice, exitPrice, size),
      pnl_pct: pctCalculator(entryPrice, exitPrice),
    };
  }

  /**
   * Determine intent type based on payload
   * @param {Object} payload - Intent payload
   * @returns {string} Intent type
   * @private
   */
  _determineIntentType(payload) {
    const { type, direction } = payload;
    
    if (CLOSE_INTENT_TYPES.has(type)) {
      return direction === 1 ? 'CLOSE_LONG' : 'CLOSE_SHORT';
    }
    return direction === 1 ? 'BUY_SETUP' : 'SELL_SETUP';
  }

  /**
   * Trim trade history to max size using shift (O(1) per removal)
   * @private
   */
  _trimTradeHistory() {
    while (this.tradeHistory.length > this.maxTradeHistory) {
      this.tradeHistory.shift();
    }
  }


  //─────────────────────────────────────────────────────────────────────────────
  // INTENT PROCESSING
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Process an incoming intent signal from Pine
   * Requirements: 31.1 - Pine sends Intent Signals, not position commands
   * 
   * @param {Object} intentPayload - Intent payload from webhook
   * @param {string} intentPayload.signal_id - Unique signal identifier
   * @param {string} intentPayload.type - Signal type (PREPARE, CONFIRM, ABORT)
   * @param {string} intentPayload.symbol - Trading symbol
   * @param {number} intentPayload.direction - 1 for long, -1 for short
   * @param {number[]} [intentPayload.entry_zone] - Entry price ladder
   * @param {number} [intentPayload.stop_loss] - Stop loss price
   * @param {number[]} [intentPayload.take_profits] - Take profit prices
   * @param {number} [intentPayload.size] - Position size
   * @returns {Intent} The processed intent
   * @throws {Error} If required fields are missing or invalid
   */
  processIntent(intentPayload) {
    if (this._destroyed) {
      throw new Error('ShadowState has been destroyed');
    }
    
    // Validate required fields
    validateIntentPayload(intentPayload);
    
    this._maybeCleanupExpiredIntents();
    
    const { signal_id, symbol, direction, entry_zone, stop_loss, take_profits, size, regime_state, phase } = intentPayload;
    const intentType = this._determineIntentType(intentPayload);
    
    // Use builder pattern for cleaner intent construction
    const intent = new IntentBuilder(signal_id, symbol, direction)
      .withType(intentType)
      .withEntryZone(entry_zone)
      .withStopLoss(stop_loss)
      .withTakeProfits(take_profits)
      .withSize(size)
      .withRegimeState(regime_state)
      .withPhase(phase)
      .build();
    
    this.pendingIntents.set(signal_id, intent);
    
    this.logger.info({ signal_id, type: intentType, symbol }, 'Intent processed');
    this.emit('intent:processed', this._cloneIntent(intent));
    
    return this._cloneIntent(intent);
  }

  /**
   * Mark an intent as validated (passed L2 checks)
   * 
   * @param {string} signalId - Signal ID to validate
   * @returns {Intent|null} The validated intent (copy) or null if not found
   */
  validateIntent(signalId) {
    const intent = this.pendingIntents.get(signalId);
    if (!intent) {
      this.logger.warn({ signal_id: signalId }, 'Intent not found for validation');
      return null;
    }
    
    intent.status = 'VALIDATED';
    this.logger.info({ signal_id: signalId }, 'Intent validated');
    this.emit('intent:validated', this._cloneIntent(intent));
    
    return this._cloneIntent(intent);
  }

  /**
   * Reject an intent (L2 validation failed)
   * Requirements: 31.2 - When Node.js rejects a trade, log "REJECTED" and NOT update position state
   * 
   * @param {string} signalId - Signal ID to reject
   * @param {string} reason - Rejection reason
   * @returns {Intent|null} The rejected intent (copy) or null if not found
   */
  rejectIntent(signalId, reason) {
    const intent = this.pendingIntents.get(signalId);
    if (!intent) {
      this.logger.warn({ signal_id: signalId }, 'Intent not found for rejection');
      return null;
    }
    
    intent.status = 'REJECTED';
    intent.rejection_reason = reason;
    
    // Log REJECTED as required by 31.2
    this.logger.warn({ 
      signal_id: signalId, 
      reason,
      symbol: intent.symbol,
      type: intent.type,
    }, 'REJECTED - Intent rejected, position state NOT updated');
    
    this.emit('intent:rejected', this._cloneIntent(intent));
    
    return this._cloneIntent(intent);
  }


  /**
   * Confirm execution of an intent and update position state
   * Requirements: 31.3 - Maintain Shadow State independent of Pine's strategy.position_size
   * 
   * @param {string} signalId - Signal ID to confirm
   * @param {Object} brokerResponse - Response from broker
   * @param {string} brokerResponse.broker_order_id - Broker's order ID
   * @param {number} brokerResponse.fill_price - Actual fill price
   * @param {number} brokerResponse.fill_size - Actual filled size
   * @param {boolean} brokerResponse.filled - Whether order was filled
   * @returns {Position|null} The updated position (copy) or null if execution failed
   */
  confirmExecution(signalId, brokerResponse) {
    const intent = this.pendingIntents.get(signalId);
    if (!intent) {
      this.logger.warn({ signal_id: signalId }, 'Intent not found for execution confirmation');
      return null;
    }
    
    // Only update state if broker confirms fill
    if (!brokerResponse.filled) {
      intent.status = 'REJECTED';
      intent.rejection_reason = 'Broker did not fill order';
      this.logger.warn({ signal_id: signalId }, 'REJECTED - Broker did not fill order');
      this.emit('intent:rejected', this._cloneIntent(intent));
      return null;
    }
    
    intent.status = 'EXECUTED';
    
    const { symbol, type, direction, stop_loss, take_profits } = intent;
    const { fill_price, fill_size, broker_order_id } = brokerResponse;
    
    // Handle close intents
    if (type === 'CLOSE_LONG' || type === 'CLOSE_SHORT') {
      return this._closePosition(signalId, symbol, fill_price, 'MANUAL');
    }
    
    // Handle open intents (BUY_SETUP, SELL_SETUP)
    const side = direction === 1 ? 'LONG' : 'SHORT';
    
    // Check if we already have a position in this symbol
    const existingPosition = this.positions.get(symbol);
    if (existingPosition) {
      // Add to existing position (pyramiding)
      const totalSize = existingPosition.size + fill_size;
      const avgPrice = (existingPosition.entry_price * existingPosition.size + fill_price * fill_size) / totalSize;
      
      existingPosition.size = totalSize;
      existingPosition.entry_price = avgPrice;
      
      this.logger.info({ 
        signal_id: signalId, 
        symbol, 
        side,
        new_size: totalSize,
        avg_price: avgPrice,
        broker_order_id,
      }, 'Position increased (pyramid)');
      
      this.emit('position:updated', this._clonePosition(existingPosition));
      
      // Requirements: 97.3 - Update position record in database (fire-and-forget)
      if (this.databaseManager) {
        this._updatePositionRecord(symbol, {
          size: totalSize,
          avg_entry: avgPrice,
        }).catch(error => {
          this.logger.error({
            signal_id: signalId,
            symbol,
            error: error.message,
          }, 'Failed to update position record in database (non-blocking)');
        });
      }
      
      return this._clonePosition(existingPosition);
    }
    
    // Create new position
    const position = {
      symbol,
      side,
      size: fill_size,
      entry_price: fill_price,
      stop_loss,
      take_profits,
      signal_id: signalId,
      opened_at: new Date().toISOString(),
      regime_state: intent.regime_state || null,
      phase: intent.phase || null,
    };
    
    this.positions.set(symbol, position);
    
    this.logger.info({ 
      signal_id: signalId, 
      symbol, 
      side,
      size: fill_size,
      entry_price: fill_price,
      broker_order_id,
    }, 'Position opened');
    
    this.emit('position:opened', this._clonePosition(position));
    
    // Requirements: 97.3 - Insert position record to database (fire-and-forget)
    if (this.databaseManager) {
      this._insertPositionRecord(position).catch(error => {
        this.logger.error({
          signal_id: signalId,
          symbol,
          error: error.message,
        }, 'Failed to insert position record to database (non-blocking)');
      });
    }
    
    return this._clonePosition(position);
  }


  //─────────────────────────────────────────────────────────────────────────────
  // POSITION QUERIES
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Check if we have an open position for a symbol
   * Requirements: 31.4 - When receiving a "Close" signal, query: "Do I have an open position?"
   * 
   * @param {string} symbol - Trading symbol
   * @returns {boolean} True if position exists
   */
  hasPosition(symbol) {
    return this.positions.has(symbol);
  }

  /**
   * Get position for a symbol (returns immutable copy)
   * 
   * @param {string} symbol - Trading symbol
   * @returns {Position|undefined} Copy of the position or undefined
   */
  getPosition(symbol) {
    return this._clonePosition(this.positions.get(symbol));
  }

  /**
   * Get all open positions (returns immutable copies)
   * 
   * @returns {Map<string, Position>} Map of position copies
   */
  getAllPositions() {
    const copy = new Map();
    for (const [symbol, position] of this.positions) {
      copy.set(symbol, this._clonePosition(position));
    }
    return copy;
  }

  /**
   * Get pending intent by signal ID (returns immutable copy)
   * 
   * @param {string} signalId - Signal ID
   * @returns {Intent|undefined} Copy of the intent or undefined
   */
  getIntent(signalId) {
    return this._cloneIntent(this.pendingIntents.get(signalId));
  }

  /**
   * Check if a close signal is a zombie signal (no matching position)
   * Requirements: 31.5 - When no matching position exists for Close signal, ignore as Zombie Signal
   * 
   * @param {string} symbol - Trading symbol
   * @param {string} signalId - Signal ID for logging
   * @returns {boolean} True if this is a zombie signal
   */
  isZombieSignal(symbol, signalId) {
    if (!this.hasPosition(symbol)) {
      this.logger.warn({ 
        signal_id: signalId, 
        symbol,
      }, 'ZOMBIE_SIGNAL - Close signal for non-existent position, ignoring');
      return true;
    }
    return false;
  }


  //─────────────────────────────────────────────────────────────────────────────
  // POSITION CLOSING
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Close a position and record the trade (internal)
   * 
   * @param {string} signalId - Signal ID
   * @param {string} symbol - Trading symbol
   * @param {number} exitPrice - Exit price
   * @param {string} closeReason - Reason for closing (TP1, TP2, TP3, SL, REGIME_KILL, MANUAL)
   * @param {number} [closeSize] - Size to close (optional, defaults to full position)
   * @returns {TradeRecord|null} The trade record or null if no position
   * @private
   */
  _closePosition(signalId, symbol, exitPrice, closeReason, closeSize = null) {
    const position = this.positions.get(symbol);
    if (!position) {
      this.logger.warn({ signal_id: signalId, symbol }, 'No position to close');
      return null;
    }
    
    // Handle edge case: zero-size position
    if (position.size === 0) {
      this.logger.warn({ signal_id: signalId, symbol }, 'Position has zero size, removing without PnL');
      this.positions.delete(symbol);
      return null;
    }
    
    // Determine actual close size
    const actualCloseSize = closeSize !== null ? closeSize : position.size;
    const isPartialClose = actualCloseSize < position.size;
    
    // Calculate PnL using strategy pattern - Requirements: 31.6
    const { pnl, pnl_pct } = this._calculatePnl(
      position.side, 
      position.entry_price, 
      exitPrice, 
      actualCloseSize
    );
    
    const tradeRecord = {
      signal_id: position.signal_id,
      symbol,
      side: position.side,
      entry_price: position.entry_price,
      exit_price: exitPrice,
      size: actualCloseSize,
      pnl,
      pnl_pct,
      opened_at: position.opened_at,
      closed_at: new Date().toISOString(),
      close_reason: closeReason,
    };
    
    // Add to trade history
    this.tradeHistory.push(tradeRecord);
    this._trimTradeHistory();
    
    // Update or remove position
    if (isPartialClose) {
      position.size -= actualCloseSize;
      
      this.logger.info({ 
        signal_id: signalId,
        symbol,
        side: position.side,
        closed_size: actualCloseSize,
        remaining_size: position.size,
        pnl,
        pnl_pct,
        close_reason: closeReason,
      }, 'Position partially closed');
      
      this.emit('position:partial_close', { 
        ...this._clonePosition(position),
        trade_record: { ...tradeRecord },
      });
      
      // Requirements: 97.3 - Update position record in database (fire-and-forget)
      if (this.databaseManager) {
        this._updatePositionRecord(symbol, {
          size: position.size,
        }).catch(error => {
          this.logger.error({
            signal_id: signalId,
            symbol,
            error: error.message,
          }, 'Failed to update position record in database (non-blocking)');
        });
      }
    } else {
      // Full close - remove position
      this.positions.delete(symbol);
      
      this.logger.info({ 
        signal_id: signalId,
        symbol,
        side: position.side,
        pnl,
        pnl_pct,
        close_reason: closeReason,
      }, 'Position closed');
      
      this.emit('position:closed', { ...tradeRecord });
      
      // Requirements: 97.3 - Close position record in database (fire-and-forget)
      if (this.databaseManager) {
        this._closePositionRecord(symbol, {
          closed_at: tradeRecord.closed_at,
          close_price: exitPrice,
          realized_pnl: pnl,
          close_reason: closeReason,
        }).catch(error => {
          this.logger.error({
            signal_id: signalId,
            symbol,
            error: error.message,
          }, 'Failed to close position record in database (non-blocking)');
        });
      }
    }
    
    // Emit trade recorded event for analytics (ZScoreDrift, etc.)
    this.emit('trade:recorded', { ...tradeRecord });
    
    return { ...tradeRecord };
  }

  /**
   * Close position by symbol (for regime kill, reconciliation, etc.)
   * 
   * @param {string} symbol - Trading symbol
   * @param {number} exitPrice - Exit price
   * @param {string} closeReason - Reason for closing
   * @returns {TradeRecord|null} The trade record or null if no position
   * @throws {Error} If exitPrice is invalid
   */
  closePosition(symbol, exitPrice, closeReason) {
    validateExitPrice(exitPrice);
    return this._closePosition(`close_${symbol}_${Date.now()}`, symbol, exitPrice, closeReason);
  }

  /**
   * Partially close a position (for take-profit scaling)
   * 
   * @param {string} symbol - Trading symbol
   * @param {number} exitPrice - Exit price
   * @param {number} closeSize - Size to close
   * @param {string} closeReason - Reason for closing (TP1, TP2, TP3)
   * @returns {TradeRecord|null} The trade record or null if no position
   * @throws {Error} If exitPrice or closeSize is invalid
   */
  closePartialPosition(symbol, exitPrice, closeSize, closeReason) {
    validateExitPrice(exitPrice);
    
    const position = this.positions.get(symbol);
    if (!position) {
      this.logger.warn({ symbol }, 'No position to partially close');
      return null;
    }
    
    validateCloseSize(closeSize, position.size);
    
    return this._closePosition(
      `partial_${symbol}_${Date.now()}`, 
      symbol, 
      exitPrice, 
      closeReason, 
      closeSize
    );
  }

  /**
   * Close all positions (for emergency flatten)
   * 
   * @param {Function} getPriceForSymbol - Function to get current price for a symbol
   * @param {string} closeReason - Reason for closing
   * @returns {TradeRecord[]} Array of trade records
   */
  closeAllPositions(getPriceForSymbol, closeReason) {
    const records = [];
    const symbols = [...this.positions.keys()]; // Snapshot keys to avoid mutation during iteration
    
    for (const symbol of symbols) {
      const exitPrice = getPriceForSymbol(symbol);
      if (exitPrice !== undefined && exitPrice !== null && Number.isFinite(exitPrice) && exitPrice > 0) {
        const record = this._closePosition(
          `emergency_${symbol}_${Date.now()}`,
          symbol,
          exitPrice,
          closeReason
        );
        if (record) {
          records.push(record);
        }
      } else {
        this.logger.warn({ symbol, reason: closeReason }, 'Could not get valid price for symbol during emergency flatten');
      }
    }
    
    this.logger.warn({ 
      positions_closed: records.length,
      reason: closeReason,
    }, 'All positions closed');
    
    return records;
  }


  //─────────────────────────────────────────────────────────────────────────────
  // PNL STATISTICS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get recent trade history for PnL calculation (returns copies)
   * Requirements: 31.6 - Use Node.js Shadow State for PnL calculation
   * 
   * @param {number} [count=30] - Number of recent trades to return
   * @returns {TradeRecord[]} Recent trade records (copies)
   */
  getRecentTrades(count = 30) {
    return this.tradeHistory.slice(-count).map(t => ({ ...t }));
  }

  /**
   * Calculate rolling PnL statistics
   * Requirements: 31.6 - Use Node.js Shadow State for PnL calculation
   * 
   * @param {number} [windowSize=30] - Number of trades to include
   * @returns {Object} PnL statistics
   */
  calculatePnLStats(windowSize = 30) {
    const recentTrades = this.tradeHistory.slice(-windowSize);
    
    if (recentTrades.length === 0) {
      return {
        total_pnl: 0,
        avg_pnl: 0,
        win_rate: 0,
        avg_win: 0,
        avg_loss: 0,
        trade_count: 0,
        stddev: 0,
      };
    }
    
    const pnls = recentTrades.map(t => t.pnl);
    const totalPnl = pnls.reduce((sum, pnl) => sum + pnl, 0);
    const avgPnl = totalPnl / pnls.length;
    
    const wins = pnls.filter(pnl => pnl > 0);
    const losses = pnls.filter(pnl => pnl < 0);
    
    const winRate = wins.length / pnls.length;
    const avgWin = wins.length > 0 ? wins.reduce((sum, w) => sum + w, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, l) => sum + l, 0) / losses.length : 0;
    
    // Calculate standard deviation
    const variance = pnls.reduce((sum, pnl) => sum + Math.pow(pnl - avgPnl, 2), 0) / pnls.length;
    const stddev = Math.sqrt(variance);
    
    return {
      total_pnl: totalPnl,
      avg_pnl: avgPnl,
      win_rate: winRate,
      avg_win: avgWin,
      avg_loss: avgLoss,
      trade_count: pnls.length,
      stddev,
    };
  }


  //─────────────────────────────────────────────────────────────────────────────
  // STATE MANAGEMENT
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get state snapshot for reconciliation
   * 
   * @returns {Object} State snapshot
   */
  getStateSnapshot() {
    return {
      positions: Object.fromEntries(
        [...this.positions].map(([k, v]) => [k, this._clonePosition(v)])
      ),
      pending_intents_count: this.pendingIntents.size,
      trade_history_count: this.tradeHistory.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Cleanup expired intents
   * @private
   */
  _maybeCleanupExpiredIntents() {
    const now = Date.now();
    
    // Only cleanup periodically
    if (now - this._lastCleanup < this._cleanupIntervalMs) {
      return;
    }
    
    this._lastCleanup = now;
    const expiredBefore = now - this.intentTtlMs;
    
    // Collect keys to delete (avoid mutation during iteration)
    const toDelete = [];
    for (const [signalId, intent] of this.pendingIntents) {
      const receivedTime = new Date(intent.received_at).getTime();
      if (receivedTime < expiredBefore && intent.status === 'PENDING') {
        intent.status = 'EXPIRED';
        toDelete.push(signalId);
      }
    }
    
    // Delete collected keys
    for (const signalId of toDelete) {
      this.pendingIntents.delete(signalId);
    }
    
    if (toDelete.length > 0) {
      this.logger.info({ expired_count: toDelete.length }, 'Expired intents cleaned up');
      this.emit('intent:expired', { count: toDelete.length, signal_ids: toDelete });
    }
  }

  /**
   * Clear all state (for testing)
   */
  clear() {
    this.positions.clear();
    this.pendingIntents.clear();
    this.tradeHistory = [];
  }

  /**
   * Destroy the instance and clean up resources
   * Removes all event listeners and clears state
   */
  destroy() {
    if (this._destroyed) {
      return;
    }
    
    this._destroyed = true;
    this.removeAllListeners();
    this.clear();
    this.logger.info({}, 'ShadowState destroyed');
  }

  /**
   * Check if the instance has been destroyed
   * @returns {boolean} True if destroyed
   */
  isDestroyed() {
    return this._destroyed;
  }


  //─────────────────────────────────────────────────────────────────────────────
  // DATABASE INTEGRATION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Recover Shadow State from database on startup (crash recovery)
   * Requirements: 97.10 - Reconcile Shadow State from database positions table on restart
   * 
   * This method:
   * 1. Queries database for active positions (closed_at IS NULL)
   * 2. Restores positions to in-memory Shadow State
   * 3. Logs recovery summary
   * 
   * @returns {Promise<void>}
   * @private
   */
  async _recoverFromDatabase() {
    if (!this.databaseManager || !this.databaseManager.isInitialized) {
      this.logger.warn({}, 'DatabaseManager not initialized, skipping crash recovery');
      return;
    }

    try {
      // Get active positions from database
      const activePositions = await this.databaseManager.getActivePositions();
      
      if (!activePositions || activePositions.length === 0) {
        this.logger.info({}, 'No active positions found in database, starting with clean state');
        return;
      }

      // Restore positions to Shadow State
      let recoveredCount = 0;
      for (const dbPosition of activePositions) {
        // Convert database record to Position object
        let opened_at;
        try {
          if (dbPosition.opened_at instanceof Date) {
            opened_at = dbPosition.opened_at.toISOString();
          } else if (typeof dbPosition.opened_at === 'string') {
            // Already a string, use as-is if valid ISO format, otherwise parse
            const parsed = new Date(dbPosition.opened_at);
            opened_at = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
          } else {
            opened_at = new Date().toISOString();
          }
        } catch (error) {
          this.logger.warn({
            symbol: dbPosition.symbol,
            opened_at: dbPosition.opened_at,
            error: error.message,
          }, 'Failed to parse opened_at timestamp, using current time');
          opened_at = new Date().toISOString();
        }

        const position = {
          symbol: dbPosition.symbol,
          side: dbPosition.side,
          size: parseFloat(dbPosition.size),
          entry_price: parseFloat(dbPosition.avg_entry),
          stop_loss: dbPosition.current_stop ? parseFloat(dbPosition.current_stop) : 0,
          take_profits: dbPosition.current_tp ? [parseFloat(dbPosition.current_tp)] : [],
          signal_id: `recovered_${dbPosition.symbol}_${Date.now()}`,
          opened_at,
        };

        // Add to Shadow State
        this.positions.set(position.symbol, position);
        recoveredCount++;

        this.logger.info({
          symbol: position.symbol,
          side: position.side,
          size: position.size,
          entry_price: position.entry_price,
        }, 'Position recovered from database');
      }

      this.logger.info({
        recovered_count: recoveredCount,
      }, `Shadow State recovered from database: ${recoveredCount} positions restored`);

      // Emit recovery event for monitoring
      this.emit('state:recovered', {
        recovered_count: recoveredCount,
        positions: this.getAllPositions(),
      });

    } catch (error) {
      this.logger.error({
        error: error.message,
        stack: error.stack,
      }, 'Failed to recover Shadow State from database');
      throw error;
    }
  }

  /**
   * Insert position record to database (fire-and-forget with retry)
   * Requirements: 97.3 - Call DatabaseManager.insertPosition() on position open
   * Requirements: 97.4 - Fire-and-forget pattern: log error but don't block execution
   * Requirements: 97.5 - Retry queue for failed DB writes (max 3 retries with exponential backoff)
   * @param {Position} position - Position to insert
   * @returns {Promise<void>}
   * @private
   */
  async _insertPositionRecord(position) {
    if (!this.databaseManager) {
      return;
    }

    const positionData = {
      symbol: position.symbol,
      side: position.side,
      size: position.size,
      avg_entry: position.entry_price,
      current_stop: position.stop_loss,
      current_tp: position.take_profits && position.take_profits.length > 0 ? position.take_profits[0] : null,
      unrealized_pnl: 0,
      regime_at_entry: position.regime_state || null,
      phase_at_entry: position.phase || null,
      opened_at: new Date(position.opened_at),
    };

    try {
      await this.databaseManager.insertPosition(positionData);
      this.logger.info({
        symbol: position.symbol,
      }, 'Position record inserted to database');
    } catch (error) {
      // Fire-and-forget: log error but don't throw
      this.logger.error({
        symbol: position.symbol,
        error: error.message,
      }, 'Failed to insert position record (will retry via DatabaseManager retry queue)');
    }
  }

  /**
   * Update position record in database (fire-and-forget with retry)
   * Requirements: 97.3 - Call DatabaseManager.updatePosition() on position update
   * Requirements: 97.4 - Fire-and-forget pattern: log error but don't block execution
   * Requirements: 97.5 - Retry queue for failed DB writes (max 3 retries with exponential backoff)
   * @param {string} symbol - Symbol to update
   * @param {Object} updates - Fields to update
   * @returns {Promise<void>}
   * @private
   */
  async _updatePositionRecord(symbol, updates) {
    if (!this.databaseManager) {
      return;
    }

    try {
      await this.databaseManager.updatePosition(symbol, updates);
      this.logger.info({
        symbol,
        updates,
      }, 'Position record updated in database');
    } catch (error) {
      // Fire-and-forget: log error but don't throw
      this.logger.error({
        symbol,
        error: error.message,
      }, 'Failed to update position record (will retry via DatabaseManager retry queue)');
    }
  }

  /**
   * Close position record in database (fire-and-forget with retry)
   * Requirements: 97.3 - Call DatabaseManager.closePosition() on position close with close_reason
   * Requirements: 97.4 - Fire-and-forget pattern: log error but don't block execution
   * Requirements: 97.5 - Retry queue for failed DB writes (max 3 retries with exponential backoff)
   * @param {string} symbol - Symbol to close
   * @param {Object} closeData - Close data
   * @returns {Promise<void>}
   * @private
   */
  async _closePositionRecord(symbol, closeData) {
    if (!this.databaseManager) {
      return;
    }

    try {
      await this.databaseManager.closePosition(symbol, closeData);
      this.logger.info({
        symbol,
        close_reason: closeData.close_reason,
      }, 'Position record closed in database');
    } catch (error) {
      // Fire-and-forget: log error but don't throw
      this.logger.error({
        symbol,
        error: error.message,
      }, 'Failed to close position record (will retry via DatabaseManager retry queue)');
    }
  }

  //─────────────────────────────────────────────────────────────────────────────
  // SERIALIZATION / PERSISTENCE
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Serialize state for persistence (Redis/file)
   * Useful for crash recovery
   * 
   * @returns {string} JSON string of state
   */
  serialize() {
    return JSON.stringify({
      positions: Object.fromEntries(this.positions),
      pendingIntents: Object.fromEntries(this.pendingIntents),
      tradeHistory: this.tradeHistory,
      serializedAt: new Date().toISOString(),
    });
  }

  /**
   * Restore state from serialized data
   * 
   * @param {string} data - JSON string from serialize()
   * @throws {Error} If data is invalid JSON or missing required fields
   */
  deserialize(data) {
    if (!data || typeof data !== 'string') {
      throw new Error('Invalid serialized data: must be a non-empty string');
    }
    
    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch (e) {
      throw new Error(`Invalid JSON in serialized data: ${e.message}`);
    }
    
    // Restore positions
    this.positions = new Map(Object.entries(parsed.positions || {}));
    
    // Restore pending intents
    this.pendingIntents = new Map(Object.entries(parsed.pendingIntents || {}));
    
    // Restore trade history
    this.tradeHistory = parsed.tradeHistory || [];
    
    this.logger.info({ 
      positions_count: this.positions.size,
      intents_count: this.pendingIntents.size,
      trades_count: this.tradeHistory.length,
      serialized_at: parsed.serializedAt,
    }, 'State restored from serialized data');
  }

  //─────────────────────────────────────────────────────────────────────────────
  // GETTERS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get position count
   * @returns {number} Number of open positions
   */
  get positionCount() {
    return this.positions.size;
  }

  /**
   * Get pending intent count
   * @returns {number} Number of pending intents
   */
  get pendingIntentCount() {
    return this.pendingIntents.size;
  }

  /**
   * Get trade history count
   * @returns {number} Number of trades in history
   */
  get tradeCount() {
    return this.tradeHistory.length;
  }

  /**
   * Remove a specific position (for API position close)
   * Requirements: 13.1-13.2 - Close Position API endpoint
   * 
   * @param {string} symbol - Trading symbol
   * @returns {boolean} True if position was removed, false if not found
   */
  removePosition(symbol) {
    if (this.positions.has(symbol)) {
      this.positions.delete(symbol);
      
      this.logger.info({ symbol }, 'Position removed from Shadow State');
      
      // Requirements: 97.3 - Close position record in database (fire-and-forget)
      if (this.databaseManager) {
        this._closePositionRecord(symbol, {
          closed_at: new Date().toISOString(),
          close_reason: 'API_CLOSE',
        }).catch(error => {
          this.logger.error({
            symbol,
            error: error.message,
          }, 'Failed to close position record in database (non-blocking)');
        });
      }
      
      this.emit('position:removed', { symbol });
      return true;
    }
    return false;
  }

  /**
   * Clear all positions (for emergency flatten)
   * Requirements: 13.1-13.2 - Emergency flatten all positions
   * 
   * @returns {number} Number of positions cleared
   */
  clearAllPositions() {
    const count = this.positions.size;
    const symbols = Array.from(this.positions.keys());
    
    this.positions.clear();
    
    this.logger.warn({ count, symbols }, 'All positions cleared from Shadow State');
    
    // Requirements: 97.3 - Close all position records in database (fire-and-forget)
    if (this.databaseManager) {
      const closedAt = new Date().toISOString();
      symbols.forEach(symbol => {
        this._closePositionRecord(symbol, {
          closed_at: closedAt,
          close_reason: 'EMERGENCY_FLATTEN',
        }).catch(error => {
          this.logger.error({
            symbol,
            error: error.message,
          }, 'Failed to close position record in database (non-blocking)');
        });
      });
    }
    
    this.emit('positions:cleared', { count, symbols });
    return count;
  }

  /**
   * Update position stop loss and take profit levels
   * Requirements: 13.3-13.5 - Modify Stop/Target API endpoint
   * 
   * @param {string} symbol - Trading symbol
   * @param {number} [stopLoss] - New stop loss price
   * @param {number} [takeProfit] - New take profit price
   * @returns {boolean} True if position was updated, false if not found
   */
  updatePositionStopTarget(symbol, stopLoss, takeProfit) {
    const position = this.positions.get(symbol);
    if (!position) {
      return false;
    }

    if (stopLoss !== undefined) {
      position.stop_loss = stopLoss;
    }

    if (takeProfit !== undefined) {
      // Update first take profit level
      if (position.take_profits && position.take_profits.length > 0) {
        position.take_profits[0] = takeProfit;
      } else {
        position.take_profits = [takeProfit];
      }
    }

    this.logger.info({ 
      symbol, 
      stop_loss: stopLoss, 
      take_profit: takeProfit 
    }, 'Position stop/target updated in Shadow State');

    // Requirements: 97.3 - Update position record in database (fire-and-forget)
    if (this.databaseManager) {
      this._updatePositionRecord(symbol, {
        stop_loss: position.stop_loss,
        take_profits: position.take_profits,
      }).catch(error => {
        this.logger.error({
          symbol,
          error: error.message,
        }, 'Failed to update position record in database (non-blocking)');
      });
    }

    this.emit('position:updated', { 
      symbol, 
      position: this._clonePosition(position) 
    });
    
    return true;
  }
}

export default ShadowState;
