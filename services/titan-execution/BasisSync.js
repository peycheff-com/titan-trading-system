/**
 * Basis Tolerance & Feed Synchronization
 * 
 * Handles price discrepancies between TradingView data and Broker data,
 * preventing client-side triggers from hanging indefinitely due to basis spreads.
 * 
 * Requirements: 82.1-82.7
 * 
 * @module BasisSync
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {number} Default maximum basis tolerance (0.5%) */
const DEFAULT_MAX_BASIS_TOLERANCE_PCT = 0.005;

/** @constant {number} Default maximum wait time for trigger (5 seconds) */
const DEFAULT_MAX_BASIS_WAIT_TIME_MS = 5000;

/** @constant {number} Critical basis threshold for operator alert (1%) */
const CRITICAL_BASIS_THRESHOLD_PCT = 0.01;

/** @constant {number} Duration for critical basis alert (5 minutes) */
const CRITICAL_BASIS_DURATION_MS = 300000;

/** @constant {number} Interval for checking critical basis (10 seconds) */
const CRITICAL_BASIS_CHECK_INTERVAL_MS = 10000;

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BasisCalculation
 * @property {number} tv_price - TradingView price
 * @property {number} broker_price - Broker price
 * @property {number} basis_spread - Absolute spread (TV - Broker)
 * @property {number} basis_spread_pct - Spread as percentage
 * @property {number} adjusted_trigger_price - Trigger price adjusted by basis
 * @property {boolean} exceeds_tolerance - Whether spread exceeds tolerance
 * @property {number} calculated_at - Timestamp of calculation
 */

/**
 * @typedef {Object} BasisIntent
 * @property {string} signal_id - Signal identifier
 * @property {string} symbol - Trading symbol
 * @property {number} tv_price - TradingView price from PREPARE
 * @property {number} trigger_price - Original trigger price
 * @property {number} adjusted_trigger_price - Adjusted trigger price
 * @property {number} basis_spread - Calculated basis spread
 * @property {number} basis_spread_pct - Basis spread percentage
 * @property {number} prepared_at - Timestamp when prepared
 * @property {NodeJS.Timeout} timeout_timer - Timeout timer reference
 * @property {boolean} force_filled - Whether force fill was triggered
 * @property {boolean} confirm_received - Whether CONFIRM was received
 */

/**
 * @typedef {Object} BasisHistory
 * @property {string} symbol - Trading symbol
 * @property {number} timestamp - Timestamp
 * @property {number} basis_spread_pct - Basis spread percentage
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
// BASIS SYNC CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Basis Tolerance & Feed Synchronization
 * 
 * Monitors and handles price discrepancies between TradingView and Broker feeds.
 * 
 * Events emitted:
 * - 'basis:high' - Basis spread exceeds tolerance
 * - 'basis:critical' - Basis spread consistently > 1% for 5 minutes
 * - 'basis:force_fill' - Force fill triggered due to basis timeout
 * - 'basis:normalized' - Basis spread returned to normal
 */
export class BasisSync extends EventEmitter {
  /**
   * Create a new BasisSync instance
   * @param {Object} options - Configuration options
   * @param {number} [options.maxBasisTolerancePct] - Maximum basis tolerance (default: 0.5%)
   * @param {number} [options.maxBasisWaitTimeMs] - Maximum wait time (default: 5000ms)
   * @param {Function} [options.getBrokerPrice] - Function to get current broker price for symbol
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    /** @type {number} Maximum basis tolerance as percentage */
    this.maxBasisTolerancePct = options.maxBasisTolerancePct || DEFAULT_MAX_BASIS_TOLERANCE_PCT;
    
    /** @type {number} Maximum wait time in milliseconds */
    this.maxBasisWaitTimeMs = options.maxBasisWaitTimeMs || DEFAULT_MAX_BASIS_WAIT_TIME_MS;
    
    /** @type {Function} Function to get broker price */
    this.getBrokerPrice = options.getBrokerPrice || null;
    
    /** @type {Map<string, BasisIntent>} signal_id → BasisIntent */
    this.activeIntents = new Map();
    
    /** @type {Map<string, BasisHistory[]>} symbol → history array */
    this.basisHistory = new Map();
    
    /** @type {Map<string, boolean>} symbol → critical alert sent */
    this.criticalAlertsSent = new Map();
    
    /** @type {NodeJS.Timeout|null} Critical basis check timer */
    this._criticalCheckTimer = null;
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
    
    // Start critical basis monitoring
    this._startCriticalBasisMonitoring();
  }

  /**
   * Calculate basis spread between TradingView and Broker prices
   * Requirements: 82.1 - Calculate basis_spread = TV_price - Broker_price
   * 
   * @param {string} symbol - Trading symbol
   * @param {number} tv_price - TradingView price
   * @param {number} trigger_price - Original trigger price
   * @returns {BasisCalculation} Basis calculation result
   */
  calculateBasis(symbol, tv_price, trigger_price) {
    if (!this.getBrokerPrice) {
      throw new Error('getBrokerPrice function not provided');
    }
    
    // Get current broker price
    const broker_price = this.getBrokerPrice(symbol);
    
    if (!broker_price || broker_price <= 0) {
      throw new Error(`Invalid broker price for ${symbol}: ${broker_price}`);
    }
    
    // Calculate basis spread
    // Requirements: 82.1 - basis_spread = TV_price - Broker_price
    const basis_spread = tv_price - broker_price;
    const basis_spread_pct = Math.abs(basis_spread) / broker_price;
    
    // Adjust trigger price by basis spread
    // Requirements: 82.2 - Adjust trigger_price by basis_spread offset
    const adjusted_trigger_price = trigger_price + basis_spread;
    
    // Check if exceeds tolerance
    // Requirements: 82.3 - Log warning when basis > max_basis_tolerance (0.5%)
    const exceeds_tolerance = basis_spread_pct > this.maxBasisTolerancePct;
    
    const result = {
      tv_price,
      broker_price,
      basis_spread,
      basis_spread_pct,
      adjusted_trigger_price,
      exceeds_tolerance,
      calculated_at: Date.now(),
    };
    
    // Log warning if exceeds tolerance
    if (exceeds_tolerance) {
      this.logger.warn({
        symbol,
        tv_price,
        broker_price,
        basis_spread,
        basis_spread_pct: (basis_spread_pct * 100).toFixed(3) + '%',
        tolerance_pct: (this.maxBasisTolerancePct * 100).toFixed(3) + '%',
      }, 'HIGH_BASIS_SPREAD - Basis exceeds tolerance');
      
      this.emit('basis:high', {
        symbol,
        basis_spread,
        basis_spread_pct,
        tv_price,
        broker_price,
      });
    }
    
    // Record in history for critical monitoring
    this._recordBasisHistory(symbol, basis_spread_pct);
    
    return result;
  }

  /**
   * Prepare basis intent from PREPARE payload
   * Requirements: 82.1-82.4 - Calculate basis and set up timeout monitoring
   * 
   * @param {Object} payload - PREPARE payload
   * @returns {BasisIntent} Prepared intent
   */
  prepareBasisIntent(payload) {
    const { signal_id, symbol, trigger_price } = payload;
    
    // Use trigger_price as TV price (or close price if available)
    const tv_price = payload.close || trigger_price;
    
    try {
      // Calculate basis
      const basisCalc = this.calculateBasis(symbol, tv_price, trigger_price);
      
      const intent = {
        signal_id,
        symbol,
        tv_price,
        trigger_price,
        adjusted_trigger_price: basisCalc.adjusted_trigger_price,
        basis_spread: basisCalc.basis_spread,
        basis_spread_pct: basisCalc.basis_spread_pct,
        prepared_at: Date.now(),
        timeout_timer: null,
        force_filled: false,
        confirm_received: false,
      };
      
      // Set timeout timer
      // Requirements: 82.4 - Implement max_basis_wait_time (5s) timeout check
      intent.timeout_timer = setTimeout(() => {
        this._handleBasisTimeout(signal_id);
      }, this.maxBasisWaitTimeMs);
      
      // Store intent
      this.activeIntents.set(signal_id, intent);
      
      this.logger.info({
        signal_id,
        symbol,
        tv_price,
        broker_price: basisCalc.broker_price,
        basis_spread: basisCalc.basis_spread,
        basis_spread_pct: (basisCalc.basis_spread_pct * 100).toFixed(3) + '%',
        adjusted_trigger_price: basisCalc.adjusted_trigger_price,
      }, 'Basis intent prepared');
      
      return intent;
      
    } catch (error) {
      this.logger.error({
        signal_id,
        symbol,
        error: error.message,
      }, 'Failed to prepare basis intent');
      throw error;
    }
  }

  /**
   * Handle CONFIRM webhook arrival
   * Requirements: 82.5 - When timeout AND CONFIRM arrives: execute Force Fill
   * 
   * @param {string} signal_id - Signal identifier
   * @returns {{should_force_fill: boolean, intent?: BasisIntent}} Result
   */
  handleConfirm(signal_id) {
    const intent = this.activeIntents.get(signal_id);
    
    if (!intent) {
      // No active intent, normal flow
      return { should_force_fill: false };
    }
    
    // Mark CONFIRM as received
    intent.confirm_received = true;
    
    // Check if we already force filled
    if (intent.force_filled) {
      this.logger.info({ signal_id }, 'CONFIRM received after Force Fill - already executed');
      return { should_force_fill: false, intent };
    }
    
    // Clear timeout and remove intent
    if (intent.timeout_timer) {
      clearTimeout(intent.timeout_timer);
    }
    this.activeIntents.delete(signal_id);
    
    return { should_force_fill: false, intent };
  }

  /**
   * Handle basis timeout
   * Requirements: 82.5-82.6 - Execute Force Fill when timeout AND CONFIRM arrives
   * 
   * @param {string} signal_id - Signal identifier
   * @private
   */
  _handleBasisTimeout(signal_id) {
    const intent = this.activeIntents.get(signal_id);
    
    if (!intent) {
      return;
    }
    
    const wait_time = Date.now() - intent.prepared_at;
    
    // Check if CONFIRM has arrived
    if (intent.confirm_received) {
      // Requirements: 82.5 - When timeout AND CONFIRM arrives: execute Force Fill
      intent.force_filled = true;
      
      // Get current broker price for logging
      let current_broker_price = null;
      try {
        current_broker_price = this.getBrokerPrice(intent.symbol);
      } catch (error) {
        // Ignore error
      }
      
      // Requirements: 82.6 - Log "FORCE_FILL_BASIS_SYNC"
      this.logger.warn({
        signal_id,
        symbol: intent.symbol,
        basis_spread: intent.basis_spread,
        basis_spread_pct: (intent.basis_spread_pct * 100).toFixed(3) + '%',
        wait_time,
        tv_price: intent.tv_price,
        broker_price: current_broker_price,
        reason: 'CLIENT_TRIGGER_TIMEOUT_WITH_CONFIRM',
      }, 'FORCE_FILL_BASIS_SYNC - Executing to sync with strategy');
      
      this.emit('basis:force_fill', {
        signal_id,
        symbol: intent.symbol,
        basis_spread: intent.basis_spread,
        basis_spread_pct: intent.basis_spread_pct,
        wait_time,
        tv_price: intent.tv_price,
        broker_price: current_broker_price,
        intent,
      });
      
      // Keep intent for a short time for idempotency
      setTimeout(() => {
        this.activeIntents.delete(signal_id);
      }, 5000);
      
    } else {
      // CONFIRM not received yet, just log timeout
      this.logger.info({
        signal_id,
        symbol: intent.symbol,
        wait_time,
      }, 'Basis timeout - waiting for CONFIRM');
      
      // Keep intent active, waiting for CONFIRM
      // Will be cleaned up when CONFIRM arrives or after extended timeout
      setTimeout(() => {
        if (this.activeIntents.has(signal_id)) {
          this.activeIntents.delete(signal_id);
          this.logger.warn({ signal_id }, 'Basis intent expired - no CONFIRM received');
        }
      }, 30000); // Extended timeout: 30 seconds
    }
  }

  /**
   * Handle ABORT webhook
   * @param {string} signal_id - Signal identifier
   */
  handleAbort(signal_id) {
    const intent = this.activeIntents.get(signal_id);
    
    if (intent) {
      if (intent.timeout_timer) {
        clearTimeout(intent.timeout_timer);
      }
      this.activeIntents.delete(signal_id);
      
      this.logger.info({ signal_id }, 'Basis intent aborted');
    }
  }

  /**
   * Record basis history for critical monitoring
   * @param {string} symbol - Trading symbol
   * @param {number} basis_spread_pct - Basis spread percentage
   * @private
   */
  _recordBasisHistory(symbol, basis_spread_pct) {
    if (!this.basisHistory.has(symbol)) {
      this.basisHistory.set(symbol, []);
    }
    
    const history = this.basisHistory.get(symbol);
    const now = Date.now();
    
    // Add new entry
    history.push({
      symbol,
      timestamp: now,
      basis_spread_pct,
    });
    
    // Keep only last 5 minutes of history
    const cutoff = now - CRITICAL_BASIS_DURATION_MS;
    const filtered = history.filter(entry => entry.timestamp > cutoff);
    this.basisHistory.set(symbol, filtered);
  }

  /**
   * Start critical basis monitoring
   * Requirements: 82.7 - Alert when basis > 1% for 5 minutes
   * @private
   */
  _startCriticalBasisMonitoring() {
    this._criticalCheckTimer = setInterval(() => {
      this._checkCriticalBasis();
    }, CRITICAL_BASIS_CHECK_INTERVAL_MS);
  }

  /**
   * Check for critical basis conditions
   * Requirements: 82.7 - Alert operator when basis > 1% for 5 minutes
   * @private
   */
  _checkCriticalBasis() {
    const now = Date.now();
    const cutoff = now - CRITICAL_BASIS_DURATION_MS;
    
    for (const [symbol, history] of this.basisHistory) {
      // Get entries from last 5 minutes
      const recentEntries = history.filter(entry => entry.timestamp > cutoff);
      
      if (recentEntries.length === 0) {
        // No recent data, clear alert if sent
        if (this.criticalAlertsSent.get(symbol)) {
          this.criticalAlertsSent.set(symbol, false);
          this.emit('basis:normalized', { symbol });
        }
        continue;
      }
      
      // Check if ALL entries exceed critical threshold
      const allExceedCritical = recentEntries.every(
        entry => entry.basis_spread_pct > CRITICAL_BASIS_THRESHOLD_PCT
      );
      
      if (allExceedCritical && !this.criticalAlertsSent.get(symbol)) {
        // Requirements: 82.7 - Alert "FEED_DESYNC_CRITICAL"
        const avgBasis = recentEntries.reduce((sum, e) => sum + e.basis_spread_pct, 0) / recentEntries.length;
        
        this.logger.error({
          symbol,
          avg_basis_spread_pct: (avgBasis * 100).toFixed(3) + '%',
          duration_minutes: 5,
          sample_count: recentEntries.length,
        }, 'FEED_DESYNC_CRITICAL - Basis consistently > 1% for 5 minutes');
        
        this.emit('basis:critical', {
          symbol,
          avg_basis_spread_pct: avgBasis,
          duration_ms: CRITICAL_BASIS_DURATION_MS,
          sample_count: recentEntries.length,
        });
        
        this.criticalAlertsSent.set(symbol, true);
      } else if (!allExceedCritical && this.criticalAlertsSent.get(symbol)) {
        // Basis normalized
        this.logger.info({ symbol }, 'Basis spread normalized - below critical threshold');
        this.criticalAlertsSent.set(symbol, false);
        this.emit('basis:normalized', { symbol });
      }
    }
  }

  /**
   * Get adjusted trigger price for a symbol
   * @param {string} symbol - Trading symbol
   * @param {number} tv_price - TradingView price
   * @param {number} trigger_price - Original trigger price
   * @returns {number} Adjusted trigger price
   */
  getAdjustedTriggerPrice(symbol, tv_price, trigger_price) {
    const basisCalc = this.calculateBasis(symbol, tv_price, trigger_price);
    return basisCalc.adjusted_trigger_price;
  }

  /**
   * Get current basis spread for a symbol
   * @param {string} symbol - Trading symbol
   * @param {number} tv_price - TradingView price
   * @returns {{basis_spread: number, basis_spread_pct: number}} Basis spread
   */
  getCurrentBasis(symbol, tv_price) {
    if (!this.getBrokerPrice) {
      throw new Error('getBrokerPrice function not provided');
    }
    
    const broker_price = this.getBrokerPrice(symbol);
    const basis_spread = tv_price - broker_price;
    const basis_spread_pct = Math.abs(basis_spread) / broker_price;
    
    return { basis_spread, basis_spread_pct };
  }

  /**
   * Get status information
   * @returns {Object} Status information
   */
  getStatus() {
    const criticalSymbols = [];
    for (const [symbol, alerted] of this.criticalAlertsSent) {
      if (alerted) {
        criticalSymbols.push(symbol);
      }
    }
    
    return {
      active_intents: this.activeIntents.size,
      monitored_symbols: this.basisHistory.size,
      critical_symbols: criticalSymbols,
      max_basis_tolerance_pct: this.maxBasisTolerancePct,
      max_basis_wait_time_ms: this.maxBasisWaitTimeMs,
    };
  }

  /**
   * Get active intents
   * @returns {Map<string, BasisIntent>} Active intents
   */
  getActiveIntents() {
    return this.activeIntents;
  }

  /**
   * Get basis history for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {BasisHistory[]} Basis history
   */
  getBasisHistory(symbol) {
    return this.basisHistory.get(symbol) || [];
  }

  /**
   * Clear basis history for a symbol
   * @param {string} symbol - Trading symbol
   */
  clearBasisHistory(symbol) {
    this.basisHistory.delete(symbol);
    this.criticalAlertsSent.delete(symbol);
  }

  /**
   * Shutdown and cleanup
   */
  shutdown() {
    if (this._criticalCheckTimer) {
      clearInterval(this._criticalCheckTimer);
      this._criticalCheckTimer = null;
    }
    
    // Clear all active intent timers
    for (const [signal_id, intent] of this.activeIntents) {
      if (intent.timeout_timer) {
        clearTimeout(intent.timeout_timer);
      }
    }
    this.activeIntents.clear();
    
    this.logger.info({}, 'BasisSync shutdown complete');
  }
}

export default BasisSync;
