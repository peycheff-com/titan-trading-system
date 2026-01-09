/**
 * Broker State Reconciliation Loop
 * 
 * Periodically reconciles Shadow State with broker positions to detect
 * desynchronization immediately. Auto-flattens after 3 consecutive mismatches.
 * 
 * Requirements: 32.1-32.5
 * 
 * @module Reconciliation
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} BrokerPosition
 * @property {string} symbol - Trading symbol
 * @property {'LONG'|'SHORT'} side - Position direction
 * @property {number} size - Position size
 * @property {number} entry_price - Average entry price
 */

/**
 * @typedef {Object} MismatchRecord
 * @property {string} symbol - Symbol with mismatch
 * @property {'MISSING_IN_SHADOW'|'MISSING_IN_BROKER'|'SIZE_MISMATCH'|'SIDE_MISMATCH'} mismatch_type
 * @property {Object|null} shadow_state - Position from Shadow State
 * @property {Object|null} broker_state - Position from Broker
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} ReconciliationResult
 * @property {boolean} in_sync - Whether states are synchronized
 * @property {MismatchRecord[]} mismatches - List of detected mismatches
 * @property {number} shadow_position_count - Number of positions in Shadow State
 * @property {number} broker_position_count - Number of positions from Broker
 * @property {string} timestamp - ISO timestamp
 */

/**
 * Reconciliation class - Broker state sync every 60s
 * 
 * Key responsibilities:
 * 1. Run reconciliation loop every 60 seconds (Requirement 32.1)
 * 2. Call broker API to get positions (Requirement 32.2)
 * 3. Compare Shadow State to Broker positions (Requirement 32.3)
 * 4. Log mismatches with detailed info (Requirement 32.4)
 * 5. Auto-flatten after 3 consecutive mismatches (Requirement 32.5)
 * 
 * @extends EventEmitter
 * @fires Reconciliation#mismatch - When a mismatch is detected
 * @fires Reconciliation#emergency_flatten - When auto-flatten is triggered
 * @fires Reconciliation#sync_ok - When reconciliation passes
 */
export class Reconciliation extends EventEmitter {
  /**
   * Create a new Reconciliation instance
   * 
   * @param {Object} options - Configuration options
   * @param {Object} options.shadowState - ShadowState instance
   * @param {Object} options.brokerGateway - BrokerGateway instance with getPositions()
   * @param {Object} [options.databaseManager] - DatabaseManager instance for system event logging
   * @param {Function} [options.logger] - Logger function (defaults to console)
   * @param {number} [options.intervalMs=60000] - Reconciliation interval in ms (default 60s)
   * @param {number} [options.maxConsecutiveMismatches=3] - Max mismatches before flatten
   * @param {Function} [options.getPriceForSymbol] - Function to get current price for a symbol
   */
  constructor(options = {}) {
    super();
    
    if (!options.shadowState) {
      throw new Error('shadowState is required');
    }
    if (!options.brokerGateway) {
      throw new Error('brokerGateway is required');
    }
    
    /** @type {Object} ShadowState instance */
    this.shadowState = options.shadowState;
    
    /** @type {Object} BrokerGateway instance */
    this.brokerGateway = options.brokerGateway;
    
    /** @type {Object|null} DatabaseManager instance */
    this.databaseManager = options.databaseManager || null;
    
    /** @type {Function} Logger function */
    this.logger = options.logger || console;
    
    /** @type {number} Reconciliation interval in milliseconds */
    this.intervalMs = options.intervalMs || 60000; // 60 seconds (Requirement 32.1)
    
    /** @type {number} Maximum consecutive mismatches before auto-flatten */
    this.maxConsecutiveMismatches = options.maxConsecutiveMismatches || 3;
    
    /** @type {Function} Function to get current price for a symbol */
    this.getPriceForSymbol = options.getPriceForSymbol || (() => null);
    
    /** @type {number} Current consecutive mismatch count */
    this._consecutiveMismatchCount = 0;
    
    /** @type {NodeJS.Timeout|null} Interval timer reference */
    this._intervalTimer = null;
    
    /** @type {boolean} Whether reconciliation loop is running */
    this._isRunning = false;
    
    /** @type {boolean} Whether auto-execution is disabled due to mismatches */
    this._autoExecutionDisabled = false;
    
    /** @type {ReconciliationResult|null} Last reconciliation result */
    this._lastResult = null;
    
    /** @type {number} Epsilon for float comparison */
    this._epsilon = 1e-10;
  }

  /**
   * Start the reconciliation loop
   * Requirement 32.1: Execute every 60 seconds
   */
  start() {
    if (this._isRunning) {
      this.logger.warn?.({}, 'Reconciliation loop already running');
      return;
    }
    
    this._isRunning = true;
    this.logger.info?.({ interval_ms: this.intervalMs }, 'Reconciliation loop started');
    
    // Run immediately on start
    this._runReconciliation();
    
    // Then run at interval
    this._intervalTimer = setInterval(() => {
      this._runReconciliation();
    }, this.intervalMs);
  }

  /**
   * Stop the reconciliation loop
   */
  stop() {
    if (this._intervalTimer) {
      clearInterval(this._intervalTimer);
      this._intervalTimer = null;
    }
    this._isRunning = false;
    this.logger.info?.({}, 'Reconciliation loop stopped');
  }

  /**
   * Run a single reconciliation cycle
   * @private
   */
  async _runReconciliation() {
    try {
      // reconcile() now handles all state updates and events
      await this.reconcile();
    } catch (error) {
      this.logger.error?.({ error: error.message }, 'Reconciliation cycle failed');
    }
  }

  /**
   * Perform reconciliation between Shadow State and Broker
   * Requirements: 32.2, 32.3, 32.4
   * 
   * @returns {Promise<ReconciliationResult>} Reconciliation result
   */
  async reconcile() {
    const timestamp = new Date().toISOString();
    
    // Requirement 32.2: Call GET /account/positions from broker API
    let brokerPositions;
    try {
      brokerPositions = await this.brokerGateway.getPositions();
    } catch (error) {
      this.logger.error?.({ error: error.message }, 'Failed to fetch broker positions');
      throw error;
    }
    
    // Get Shadow State positions
    const shadowPositions = this.shadowState.getAllPositions();
    
    // Compare states
    const mismatches = this._compareStates(shadowPositions, brokerPositions, timestamp);
    
    const result = {
      in_sync: mismatches.length === 0,
      mismatches,
      shadow_position_count: shadowPositions.size,
      broker_position_count: brokerPositions.length,
      timestamp,
    };
    
    // Store last result
    this._lastResult = result;
    
    // Requirement 32.4: Log mismatches
    if (!result.in_sync) {
      this._consecutiveMismatchCount++;
      
      this.logger.warn?.({
        mismatch_count: mismatches.length,
        consecutive_count: this._consecutiveMismatchCount,
        shadow_count: result.shadow_position_count,
        broker_count: result.broker_position_count,
      }, 'RECONCILIATION_MISMATCH - State desynchronization detected');
      
      mismatches.forEach(mismatch => {
        this.logger.warn?.({
          symbol: mismatch.symbol,
          mismatch_type: mismatch.mismatch_type,
          shadow_state: mismatch.shadow_state,
          broker_state: mismatch.broker_state,
          timestamp: mismatch.timestamp,
        }, 'Mismatch detail');
      });
      
      this.emit('mismatch', result);
      
      // Requirement 32.5: Auto-flatten after 3 consecutive mismatches
      if (this._consecutiveMismatchCount >= this.maxConsecutiveMismatches) {
        await this._triggerEmergencyFlatten(result);
      }
    } else {
      this._consecutiveMismatchCount = 0;
      this.logger.info?.({
        position_count: result.shadow_position_count,
        timestamp,
      }, 'Reconciliation OK - States in sync');
      this.emit('sync_ok', result);
    }
    
    return result;
  }

  /**
   * Compare Shadow State positions with Broker positions
   * Requirement 32.3: Trigger ALARM when broker position differs from Shadow State
   * 
   * @param {Map<string, Object>} shadowPositions - Positions from Shadow State
   * @param {BrokerPosition[]} brokerPositions - Positions from Broker
   * @param {string} timestamp - Current timestamp
   * @returns {MismatchRecord[]} List of mismatches
   * @private
   */
  _compareStates(shadowPositions, brokerPositions, timestamp) {
    const mismatches = [];
    const brokerSymbols = new Set();
    
    // Check each broker position against Shadow State
    for (const brokerPos of brokerPositions) {
      brokerSymbols.add(brokerPos.symbol);
      const shadowPos = shadowPositions.get(brokerPos.symbol);
      
      if (!shadowPos) {
        // Position exists in broker but not in Shadow State
        mismatches.push({
          symbol: brokerPos.symbol,
          mismatch_type: 'MISSING_IN_SHADOW',
          shadow_state: null,
          broker_state: this._sanitizePosition(brokerPos),
          timestamp,
        });
        continue;
      }
      
      // Check for side mismatch
      if (shadowPos.side !== brokerPos.side) {
        mismatches.push({
          symbol: brokerPos.symbol,
          mismatch_type: 'SIDE_MISMATCH',
          shadow_state: this._sanitizePosition(shadowPos),
          broker_state: this._sanitizePosition(brokerPos),
          timestamp,
        });
        continue;
      }
      
      // Check for size mismatch (using epsilon comparison)
      if (!this._floatEquals(shadowPos.size, brokerPos.size)) {
        mismatches.push({
          symbol: brokerPos.symbol,
          mismatch_type: 'SIZE_MISMATCH',
          shadow_state: this._sanitizePosition(shadowPos),
          broker_state: this._sanitizePosition(brokerPos),
          timestamp,
        });
      }
    }
    
    // Check for positions in Shadow State but not in Broker
    for (const [symbol, shadowPos] of shadowPositions) {
      if (!brokerSymbols.has(symbol)) {
        mismatches.push({
          symbol,
          mismatch_type: 'MISSING_IN_BROKER',
          shadow_state: this._sanitizePosition(shadowPos),
          broker_state: null,
          timestamp,
        });
      }
    }
    
    return mismatches;
  }

  /**
   * Sanitize position object for logging (remove sensitive data)
   * 
   * @param {Object} position - Position object
   * @returns {Object} Sanitized position
   * @private
   */
  _sanitizePosition(position) {
    if (!position) return null;
    return {
      symbol: position.symbol,
      side: position.side,
      size: position.size,
      entry_price: position.entry_price,
    };
  }

  /**
   * Compare floats with epsilon tolerance
   * Requirement 38: Use epsilon comparison for floats
   * 
   * @param {number} a - First number
   * @param {number} b - Second number
   * @returns {boolean} True if equal within epsilon
   * @private
   */
  _floatEquals(a, b) {
    return Math.abs(a - b) < this._epsilon;
  }

  /**
   * Trigger emergency flatten due to persistent mismatches
   * Requirement 32.5: Auto-flatten after 3 consecutive mismatches
   * 
   * @param {ReconciliationResult} result - Last reconciliation result
   * @private
   */
  async _triggerEmergencyFlatten(result) {
    this.logger.error?.({
      consecutive_mismatches: this._consecutiveMismatchCount,
      mismatches: result.mismatches,
    }, 'EMERGENCY_FLATTEN - Triggering auto-flatten due to persistent mismatches');
    
    // Disable auto-execution
    this._autoExecutionDisabled = true;
    
    // Close all positions in Shadow State
    const tradeRecords = this.shadowState.closeAllPositions(
      this.getPriceForSymbol,
      'RECONCILIATION_FLATTEN'
    );
    
    // Also close all positions via broker
    try {
      await this.brokerGateway.closeAllPositions();
    } catch (error) {
      this.logger.error?.({ error: error.message }, 'Failed to close broker positions');
    }
    
    const emergencyData = {
      reason: 'CONSECUTIVE_MISMATCHES',
      consecutive_count: this._consecutiveMismatchCount,
      mismatches: result.mismatches,
      trades_closed: tradeRecords.length,
      timestamp: new Date().toISOString(),
    };
    
    this.emit('emergency_flatten', emergencyData);
    
    // Requirement 97.7: Log system event to database
    if (this.databaseManager) {
      await this.databaseManager.insertSystemEvent({
        event_type: 'reconciliation_mismatch',
        severity: 'CRITICAL',
        description: `Emergency flatten triggered due to ${this._consecutiveMismatchCount} consecutive reconciliation mismatches`,
        context: {
          consecutive_count: this._consecutiveMismatchCount,
          mismatches: result.mismatches,
          trades_closed: tradeRecords.length,
          shadow_position_count: result.shadow_position_count,
          broker_position_count: result.broker_position_count,
        },
        timestamp: emergencyData.timestamp,
      });
    }
    
    this.logger.error?.({
      trades_closed: tradeRecords.length,
      auto_execution_disabled: true,
    }, 'Emergency flatten complete - Auto-execution disabled');
  }

  /**
   * Manually reset after emergency flatten
   * Allows resuming normal operation after investigation
   */
  reset() {
    this._consecutiveMismatchCount = 0;
    this._autoExecutionDisabled = false;
    this.logger.info?.({}, 'Reconciliation reset - Auto-execution re-enabled');
  }

  /**
   * Check if auto-execution is disabled
   * 
   * @returns {boolean} True if auto-execution is disabled
   */
  isAutoExecutionDisabled() {
    return this._autoExecutionDisabled;
  }

  /**
   * Get current consecutive mismatch count
   * 
   * @returns {number} Consecutive mismatch count
   */
  getConsecutiveMismatchCount() {
    return this._consecutiveMismatchCount;
  }

  /**
   * Get last reconciliation result
   * 
   * @returns {ReconciliationResult|null} Last result
   */
  getLastResult() {
    return this._lastResult;
  }

  /**
   * Check if reconciliation loop is running
   * 
   * @returns {boolean} True if running
   */
  isRunning() {
    return this._isRunning;
  }

  /**
   * Force a reconciliation cycle (for testing)
   * 
   * @returns {Promise<ReconciliationResult>} Reconciliation result
   */
  async forceReconcile() {
    return this.reconcile();
  }
}

export default Reconciliation;
