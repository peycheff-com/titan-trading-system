/**
 * Heartbeat Dead Man's Switch
 * 
 * Monitors heartbeat signals from Pine Script and triggers emergency actions
 * when communication fails. Requires manual reset after emergency flatten.
 * 
 * Requirements: 37.1-37.5
 * 
 * @module Heartbeat
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} HeartbeatPayload
 * @property {string} timestamp - ISO timestamp from Pine Script
 * @property {string} [symbol] - Optional symbol context
 * @property {Object} [regime_vector] - Optional regime state snapshot
 */

/**
 * @typedef {Object} MarketHours
 * @property {number} openHour - Market open hour (UTC)
 * @property {number} closeHour - Market close hour (UTC)
 * @property {number[]} tradingDays - Days of week (0=Sunday, 6=Saturday)
 */

/**
 * @typedef {Object} HeartbeatStatus
 * @property {string|null} last_heartbeat_time - ISO timestamp of last heartbeat
 * @property {number} missed_heartbeat_count - Consecutive missed heartbeats
 * @property {boolean} is_emergency_state - Whether emergency flatten was triggered
 * @property {boolean} auto_execution_enabled - Whether auto-execution is enabled
 * @property {number} expected_interval_ms - Expected heartbeat interval
 * @property {string} timestamp - Current status timestamp
 */

/**
 * Heartbeat class - Dead Man's Switch for Pine Script communication
 * 
 * Key responsibilities:
 * 1. Track last_heartbeat_time (Requirement 37.2)
 * 2. Increment missed_heartbeat_count when heartbeat is missed (Requirement 37.3)
 * 3. Trigger emergency_flatten_and_alert after 3 consecutive misses while market is open (Requirement 37.4)
 * 4. Skip emergency flatten when market is closed (Requirement 37.5)
 * 5. Require manual reset after emergency (Requirement 37.7)
 * 
 * @extends EventEmitter
 * @fires Heartbeat#heartbeat_received - When a heartbeat is received
 * @fires Heartbeat#heartbeat_missed - When a heartbeat check fails
 * @fires Heartbeat#emergency_flatten - When emergency flatten is triggered
 * @fires Heartbeat#alert - When an alert should be sent
 */
export class Heartbeat extends EventEmitter {
  /**
   * Create a new Heartbeat instance
   * 
   * @param {Object} options - Configuration options
   * @param {Object} options.shadowState - ShadowState instance for position management
   * @param {Object} [options.brokerGateway] - BrokerGateway instance for closing positions
   * @param {Object} [options.databaseManager] - DatabaseManager instance for system event logging
   * @param {Function} [options.logger] - Logger function (defaults to console)
   * @param {number} [options.expectedIntervalMs=60000] - Expected heartbeat interval (default 60s per Req 37.1)
   * @param {number} [options.checkIntervalMs=65000] - How often to check for missed heartbeats
   * @param {number} [options.maxMissedHeartbeats=3] - Max missed heartbeats before emergency (Req 37.4)
   * @param {Function} [options.getPriceForSymbol] - Function to get current price for a symbol
   * @param {Function} [options.sendAlert] - Function to send email/SMS alert (Req 37.6)
   * @param {MarketHours} [options.marketHours] - Market hours configuration
   * @param {Function} [options.isMarketOpen] - Custom function to check if market is open
   */
  constructor(options = {}) {
    super();
    
    if (!options.shadowState) {
      throw new Error('shadowState is required');
    }
    
    /** @type {Object} ShadowState instance */
    this.shadowState = options.shadowState;
    
    /** @type {Object|null} BrokerGateway instance */
    this.brokerGateway = options.brokerGateway || null;
    
    /** @type {Object|null} DatabaseManager instance */
    this.databaseManager = options.databaseManager || null;
    
    /** @type {Function} Logger function */
    this.logger = options.logger || console;
    
    /** @type {number} Expected heartbeat interval in milliseconds (Requirement 37.1: 60 seconds) */
    this.expectedIntervalMs = options.expectedIntervalMs || 60000;
    
    /** @type {number} Check interval - slightly longer than expected to allow for latency */
    this.checkIntervalMs = options.checkIntervalMs || 65000;
    
    /** @type {number} Maximum consecutive missed heartbeats before emergency (Requirement 37.4: 3) */
    this.maxMissedHeartbeats = options.maxMissedHeartbeats || 3;
    
    /** @type {Function} Function to get current price for a symbol */
    this.getPriceForSymbol = options.getPriceForSymbol || (() => null);
    
    /** @type {Function} Function to send email/SMS alert */
    this.sendAlert = options.sendAlert || this._defaultSendAlert.bind(this);
    
    /** @type {MarketHours} Market hours configuration (default: 24/7 crypto) */
    this.marketHours = options.marketHours || {
      openHour: 0,
      closeHour: 24,
      tradingDays: [0, 1, 2, 3, 4, 5, 6], // All days for crypto
    };
    
    /** @type {Function|null} Custom market open check function */
    this._customIsMarketOpen = options.isMarketOpen || null;
    
    /** @type {string|null} Last heartbeat timestamp */
    this._lastHeartbeatTime = null;
    
    /** @type {number} Consecutive missed heartbeat count */
    this._missedHeartbeatCount = 0;
    
    /** @type {boolean} Whether emergency flatten has been triggered */
    this._isEmergencyState = false;
    
    /** @type {boolean} Whether auto-execution is enabled */
    this._autoExecutionEnabled = true;
    
    /** @type {NodeJS.Timeout|null} Check interval timer */
    this._checkTimer = null;
    
    /** @type {boolean} Whether monitoring is active */
    this._isMonitoring = false;
  }

  /**
   * Start monitoring heartbeats
   */
  start() {
    if (this._isMonitoring) {
      this.logger.warn?.({}, 'Heartbeat monitoring already running');
      return;
    }
    
    this._isMonitoring = true;
    this.logger.info?.({ 
      expected_interval_ms: this.expectedIntervalMs,
      check_interval_ms: this.checkIntervalMs,
      max_missed: this.maxMissedHeartbeats,
    }, 'Heartbeat monitoring started');
    
    // Start periodic check
    this._checkTimer = setInterval(() => {
      this._checkHeartbeat();
    }, this.checkIntervalMs);
  }

  /**
   * Stop monitoring heartbeats
   */
  stop() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }
    this._isMonitoring = false;
    this.logger.info?.({}, 'Heartbeat monitoring stopped');
  }

  /**
   * Receive a heartbeat from Pine Script
   * Requirement 37.2: Update last_heartbeat_time and reset missed_heartbeat_count
   * 
   * @param {HeartbeatPayload} payload - Heartbeat payload from webhook
   * @returns {boolean} True if heartbeat was accepted
   */
  receiveHeartbeat(payload = {}) {
    const now = new Date().toISOString();
    const pineTimestamp = payload.timestamp || now;
    
    // Update last heartbeat time (Requirement 37.2)
    this._lastHeartbeatTime = now;
    
    // Reset missed heartbeat count (Requirement 37.2)
    this._missedHeartbeatCount = 0;
    
    this.logger.info?.({
      pine_timestamp: pineTimestamp,
      received_at: now,
      symbol: payload.symbol,
    }, 'Heartbeat received');
    
    this.emit('heartbeat_received', {
      pine_timestamp: pineTimestamp,
      received_at: now,
      payload,
    });
    
    return true;
  }

  /**
   * Check if heartbeat is overdue
   * Requirement 37.3: Increment missed_heartbeat_count when heartbeat is missed
   * @private
   */
  _checkHeartbeat() {
    // Skip check if in emergency state (waiting for manual reset)
    if (this._isEmergencyState) {
      return;
    }
    
    const now = Date.now();
    
    // If we've never received a heartbeat, don't trigger emergency yet
    // (system might be starting up)
    if (!this._lastHeartbeatTime) {
      this.logger.debug?.({}, 'No heartbeat received yet, waiting...');
      return;
    }
    
    const lastHeartbeatMs = new Date(this._lastHeartbeatTime).getTime();
    const timeSinceLastHeartbeat = now - lastHeartbeatMs;
    
    // Check if heartbeat is overdue
    if (timeSinceLastHeartbeat > this.expectedIntervalMs) {
      // Requirement 37.3: Increment missed_heartbeat_count
      this._missedHeartbeatCount++;
      
      this.logger.warn?.({
        missed_count: this._missedHeartbeatCount,
        time_since_last_ms: timeSinceLastHeartbeat,
        last_heartbeat: this._lastHeartbeatTime,
      }, 'Heartbeat missed');
      
      this.emit('heartbeat_missed', {
        missed_count: this._missedHeartbeatCount,
        time_since_last_ms: timeSinceLastHeartbeat,
        last_heartbeat: this._lastHeartbeatTime,
        timestamp: new Date().toISOString(),
      });
      
      // Requirement 37.4: Trigger emergency after 3 consecutive misses while market is open
      if (this._missedHeartbeatCount >= this.maxMissedHeartbeats) {
        // Requirement 37.5: Check if market is open
        if (this.isMarketOpen()) {
          this._triggerEmergencyFlatten();
        } else {
          this.logger.info?.({
            missed_count: this._missedHeartbeatCount,
          }, 'Market closed - skipping emergency flatten despite missed heartbeats');
        }
      }
    }
  }

  /**
   * Check if market is currently open
   * Requirement 37.5: NOT trigger emergency flatten when market is closed
   * 
   * @returns {boolean} True if market is open
   */
  isMarketOpen() {
    // Use custom function if provided
    if (this._customIsMarketOpen) {
      return this._customIsMarketOpen();
    }
    
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const hour = now.getUTCHours();
    
    // Check if today is a trading day
    if (!this.marketHours.tradingDays.includes(dayOfWeek)) {
      return false;
    }
    
    // Check if within trading hours
    const { openHour, closeHour } = this.marketHours;
    
    // Handle 24-hour markets (closeHour >= 24)
    if (closeHour >= 24) {
      return hour >= openHour;
    }
    
    return hour >= openHour && hour < closeHour;
  }

  /**
   * Trigger emergency flatten and alert
   * Requirement 37.4, 37.6: Close all positions at market and send alert
   * @private
   */
  async _triggerEmergencyFlatten() {
    this.logger.error?.({
      missed_count: this._missedHeartbeatCount,
      last_heartbeat: this._lastHeartbeatTime,
    }, 'EMERGENCY_FLATTEN - Dead man\'s switch triggered');
    
    // Set emergency state
    this._isEmergencyState = true;
    
    // Requirement 37.7: Disable auto-execution until manual reset
    this._autoExecutionEnabled = false;
    
    // Requirement 37.6: Close all positions at market
    const tradeRecords = this.shadowState.closeAllPositions(
      this.getPriceForSymbol,
      'DEAD_MANS_SWITCH'
    );
    
    // Also close via broker if available
    if (this.brokerGateway) {
      try {
        await this.brokerGateway.closeAllPositions();
      } catch (error) {
        this.logger.error?.({ error: error.message }, 'Failed to close broker positions');
      }
    }
    
    const emergencyData = {
      reason: 'DEAD_MANS_SWITCH',
      missed_heartbeat_count: this._missedHeartbeatCount,
      last_heartbeat: this._lastHeartbeatTime,
      positions_closed: tradeRecords.length,
      trade_records: tradeRecords,
      timestamp: new Date().toISOString(),
    };
    
    this.emit('emergency_flatten', emergencyData);
    
    // Requirement 97.7: Log system event to database
    if (this.databaseManager) {
      await this.databaseManager.insertSystemEvent({
        event_type: 'heartbeat_timeout',
        severity: 'CRITICAL',
        description: `Emergency flatten triggered due to ${this._missedHeartbeatCount} consecutive missed heartbeats`,
        context: {
          missed_heartbeat_count: this._missedHeartbeatCount,
          last_heartbeat: this._lastHeartbeatTime,
          positions_closed: tradeRecords.length,
          reason: 'DEAD_MANS_SWITCH',
        },
        timestamp: emergencyData.timestamp,
      });
    }
    
    // Requirement 37.6: Send email/SMS alert
    await this._sendEmergencyAlert(emergencyData);
    
    this.logger.error?.({
      positions_closed: tradeRecords.length,
      auto_execution_disabled: true,
    }, 'Emergency flatten complete - Manual reset required');
  }

  /**
   * Send emergency alert
   * Requirement 37.6: Send email/SMS alert
   * 
   * @param {Object} emergencyData - Emergency event data
   * @private
   */
  async _sendEmergencyAlert(emergencyData) {
    try {
      await this.sendAlert({
        type: 'EMERGENCY_FLATTEN',
        title: 'Titan Dead Man\'s Switch Triggered',
        message: `Emergency flatten triggered due to ${emergencyData.missed_heartbeat_count} consecutive missed heartbeats. ` +
                 `${emergencyData.positions_closed} positions closed. Manual reset required.`,
        data: emergencyData,
        timestamp: emergencyData.timestamp,
      });
      
      this.emit('alert', {
        type: 'EMERGENCY_FLATTEN',
        sent: true,
        timestamp: emergencyData.timestamp,
      });
    } catch (error) {
      this.logger.error?.({ error: error.message }, 'Failed to send emergency alert');
      this.emit('alert', {
        type: 'EMERGENCY_FLATTEN',
        sent: false,
        error: error.message,
        timestamp: emergencyData.timestamp,
      });
    }
  }

  /**
   * Default alert sender (logs to console)
   * Override with sendAlert option for real email/SMS
   * 
   * @param {Object} alert - Alert data
   * @private
   */
  async _defaultSendAlert(alert) {
    this.logger.error?.({
      alert_type: alert.type,
      title: alert.title,
      message: alert.message,
    }, 'ALERT - Would send email/SMS (no alert handler configured)');
  }

  /**
   * Manually reset after emergency
   * Requirement 37.7: Require manual reset before re-enabling auto-execution
   * 
   * @returns {boolean} True if reset was successful
   */
  reset() {
    if (!this._isEmergencyState) {
      this.logger.warn?.({}, 'Reset called but not in emergency state');
      return false;
    }
    
    this._isEmergencyState = false;
    this._autoExecutionEnabled = true;
    this._missedHeartbeatCount = 0;
    this._lastHeartbeatTime = null; // Require fresh heartbeat
    
    this.logger.info?.({}, 'Heartbeat monitor reset - Auto-execution re-enabled');
    
    this.emit('reset', {
      timestamp: new Date().toISOString(),
    });
    
    return true;
  }

  /**
   * Check if auto-execution is enabled
   * 
   * @returns {boolean} True if auto-execution is enabled
   */
  isAutoExecutionEnabled() {
    return this._autoExecutionEnabled;
  }

  /**
   * Check if in emergency state
   * 
   * @returns {boolean} True if in emergency state
   */
  isEmergencyState() {
    return this._isEmergencyState;
  }

  /**
   * Get current missed heartbeat count
   * 
   * @returns {number} Missed heartbeat count
   */
  getMissedHeartbeatCount() {
    return this._missedHeartbeatCount;
  }

  /**
   * Get last heartbeat time
   * 
   * @returns {string|null} ISO timestamp of last heartbeat
   */
  getLastHeartbeatTime() {
    return this._lastHeartbeatTime;
  }

  /**
   * Get current status
   * 
   * @returns {HeartbeatStatus} Current heartbeat status
   */
  getStatus() {
    return {
      last_heartbeat_time: this._lastHeartbeatTime,
      missed_heartbeat_count: this._missedHeartbeatCount,
      is_emergency_state: this._isEmergencyState,
      auto_execution_enabled: this._autoExecutionEnabled,
      expected_interval_ms: this.expectedIntervalMs,
      is_monitoring: this._isMonitoring,
      is_market_open: this.isMarketOpen(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check if monitoring is active
   * 
   * @returns {boolean} True if monitoring
   */
  isMonitoring() {
    return this._isMonitoring;
  }

  /**
   * Force a heartbeat check (for testing)
   */
  forceCheck() {
    this._checkHeartbeat();
  }

  /**
   * Set market hours configuration
   * 
   * @param {MarketHours} marketHours - New market hours configuration
   */
  setMarketHours(marketHours) {
    this.marketHours = marketHours;
    this.logger.info?.({ market_hours: marketHours }, 'Market hours updated');
  }

  /**
   * Set custom market open check function
   * 
   * @param {Function} isMarketOpenFn - Function that returns boolean
   */
  setIsMarketOpenFunction(isMarketOpenFn) {
    this._customIsMarketOpen = isMarketOpenFn;
  }
}

export default Heartbeat;
