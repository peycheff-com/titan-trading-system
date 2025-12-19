/**
 * Z-Score Drift Monitor with Drawdown Velocity Check
 * 
 * Detects when live performance deviates statistically from backtest parameters.
 * Implements flash crash protection via Drawdown Velocity check.
 * 
 * Requirements: 27.1-27.8
 * 
 * @module ZScoreDrift
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} BacktestParams
 * @property {number} expected_mean - Expected mean PnL from backtest
 * @property {number} expected_stddev - Expected standard deviation from backtest
 */

/**
 * @typedef {Object} EquitySnapshot
 * @property {number} equity - Equity value
 * @property {number} timestamp - Unix timestamp in milliseconds
 */

/**
 * @typedef {Object} ZScoreStatus
 * @property {number} z_score - Current Z-Score
 * @property {number} recent_pnl_count - Number of trades in rolling window
 * @property {number} recent_pnl_mean - Mean of recent PnL
 * @property {number} expected_mean - Expected mean from backtest
 * @property {number} expected_stddev - Expected stddev from backtest
 * @property {boolean} is_safety_stop - Whether safety stop is active
 * @property {boolean} auto_execution_enabled - Whether auto-execution is enabled
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} DrawdownVelocityStatus
 * @property {number} equity_change_pct - Percentage change in equity
 * @property {number} time_window_ms - Time window in milliseconds
 * @property {boolean} is_hard_kill - Whether hard kill is active
 */

/**
 * ZScoreDrift class - Performance drift detection with flash crash protection
 * 
 * Key responsibilities:
 * 1. Maintain rolling window of last 30 trades' PnL (Requirement 27.1)
 * 2. Calculate Z-Score against expected mean from backtest (Requirement 27.2)
 * 3. Trigger Safety Stop when Z < -2.0 (Requirement 27.3)
 * 4. Disable auto-execution and alert operator (Requirement 27.4)
 * 5. Log detailed diagnostics (Requirement 27.5)
 * 6. Require manual reset after investigation (Requirement 27.6)
 * 7. Drawdown Velocity check: equity drops > 2% in < 5 minutes → Hard Kill (Requirement 27.7)
 * 8. Log FLASH_CRASH_PROTECTION with details (Requirement 27.8)
 * 
 * @extends EventEmitter
 * @fires ZScoreDrift#safety_stop - When Z-Score triggers safety stop
 * @fires ZScoreDrift#hard_kill - When Drawdown Velocity triggers hard kill
 * @fires ZScoreDrift#alert - When an alert should be sent
 */
export class ZScoreDrift extends EventEmitter {
  /**
   * Create a new ZScoreDrift instance
   * 
   * @param {Object} options - Configuration options
   * @param {Object} options.shadowState - ShadowState instance for position management
   * @param {Object} [options.brokerGateway] - BrokerGateway instance for closing positions
   * @param {Object} [options.databaseManager] - DatabaseManager instance for system event logging
   * @param {Function} [options.logger] - Logger function (defaults to console)
   * @param {number} [options.windowSize=30] - Rolling window size for PnL (Requirement 27.1)
   * @param {number} [options.zScoreThreshold=-2.0] - Z-Score threshold for safety stop (Requirement 27.3)
   * @param {BacktestParams} [options.backtestParams] - Expected mean and stddev from backtest
   * @param {number} [options.drawdownThresholdPct=2.0] - Drawdown threshold percentage (Requirement 27.7)
   * @param {number} [options.drawdownTimeWindowMs=300000] - Drawdown time window in ms (5 minutes)
   * @param {number} [options.equityCheckIntervalMs=10000] - How often to check equity (10 seconds)
   * @param {Function} [options.getEquity] - Function to get current equity
   * @param {Function} [options.getPriceForSymbol] - Function to get current price for a symbol
   * @param {Function} [options.sendAlert] - Function to send email/SMS alert
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
    
    /** @type {number} Rolling window size for PnL (Requirement 27.1: 30 trades) */
    this.windowSize = options.windowSize || 30;
    
    /** @type {number} Z-Score threshold for safety stop (Requirement 27.3: -2.0) */
    this.zScoreThreshold = options.zScoreThreshold || -2.0;
    
    /** @type {BacktestParams} Expected parameters from backtest */
    this.backtestParams = options.backtestParams || {
      expected_mean: 0,
      expected_stddev: 1,
    };
    
    /** @type {number} Drawdown threshold percentage (Requirement 27.7: 2%) */
    this.drawdownThresholdPct = options.drawdownThresholdPct || 2.0;
    
    /** @type {number} Drawdown time window in milliseconds (5 minutes) */
    this.drawdownTimeWindowMs = options.drawdownTimeWindowMs || 300000;
    
    /** @type {number} Equity check interval in milliseconds */
    this.equityCheckIntervalMs = options.equityCheckIntervalMs || 10000;
    
    /** @type {Function} Function to get current equity */
    this.getEquity = options.getEquity || (() => null);
    
    /** @type {Function} Function to get current price for a symbol */
    this.getPriceForSymbol = options.getPriceForSymbol || (() => null);
    
    /** @type {Function} Function to send email/SMS alert */
    this.sendAlert = options.sendAlert || this._defaultSendAlert.bind(this);
    
    /** @type {number[]} Rolling window of recent PnL values */
    this._recentPnL = [];
    
    /** @type {EquitySnapshot[]} Rolling window of equity snapshots for drawdown velocity */
    this._equitySnapshots = [];
    
    /** @type {boolean} Whether safety stop is active */
    this._isSafetyStop = false;
    
    /** @type {boolean} Whether hard kill is active */
    this._isHardKill = false;
    
    /** @type {boolean} Whether auto-execution is enabled */
    this._autoExecutionEnabled = true;
    
    /** @type {number} Current Z-Score */
    this._currentZScore = 0;
    
    /** @type {NodeJS.Timeout|null} Equity check timer */
    this._equityCheckTimer = null;
    
    /** @type {boolean} Whether monitoring is active */
    this._isMonitoring = false;
  }

  /**
   * Start monitoring for drift and drawdown velocity
   */
  start() {
    if (this._isMonitoring) {
      this.logger.warn?.({}, 'ZScoreDrift monitoring already running');
      return;
    }
    
    this._isMonitoring = true;
    this.logger.info?.({
      window_size: this.windowSize,
      z_score_threshold: this.zScoreThreshold,
      drawdown_threshold_pct: this.drawdownThresholdPct,
      drawdown_time_window_ms: this.drawdownTimeWindowMs,
      backtest_params: this.backtestParams,
    }, 'ZScoreDrift monitoring started');
    
    // Start periodic equity check for drawdown velocity
    this._equityCheckTimer = setInterval(() => {
      this._checkDrawdownVelocity();
    }, this.equityCheckIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this._equityCheckTimer) {
      clearInterval(this._equityCheckTimer);
      this._equityCheckTimer = null;
    }
    this._isMonitoring = false;
    this.logger.info?.({}, 'ZScoreDrift monitoring stopped');
  }

  /**
   * Record a completed trade's PnL
   * Requirement 27.1: Maintain rolling window of last 30 trades' PnL
   * 
   * @param {number} pnl - Profit/Loss from the trade
   * @returns {Object} Z-Score calculation result
   */
  recordTrade(pnl) {
    // Add to rolling window
    this._recentPnL.push(pnl);
    
    // Trim to window size (Requirement 27.1: 30 trades)
    if (this._recentPnL.length > this.windowSize) {
      this._recentPnL.shift();
    }
    
    this.logger.info?.({
      pnl,
      window_size: this._recentPnL.length,
    }, 'Trade PnL recorded');
    
    // Calculate and check Z-Score
    return this._calculateAndCheckZScore();
  }

  /**
   * Calculate Z-Score and check for safety stop
   * Requirements 27.2, 27.3: Calculate Z-Score and trigger safety stop if < -2.0
   * 
   * @returns {Object} Z-Score calculation result
   * @private
   */
  _calculateAndCheckZScore() {
    // Need at least a few trades to calculate meaningful Z-Score
    if (this._recentPnL.length < 5) {
      return {
        z_score: 0,
        triggered: false,
        reason: 'INSUFFICIENT_DATA',
      };
    }
    
    // Calculate recent mean
    const recentMean = this._recentPnL.reduce((sum, pnl) => sum + pnl, 0) / this._recentPnL.length;
    
    // Requirement 27.2: Calculate Z-Score against expected mean from backtest
    const { expected_mean, expected_stddev } = this.backtestParams;
    
    // Avoid division by zero
    if (expected_stddev === 0) {
      this.logger.warn?.({}, 'Expected stddev is zero, cannot calculate Z-Score');
      return {
        z_score: 0,
        triggered: false,
        reason: 'ZERO_STDDEV',
      };
    }
    
    // Z-Score = (observed_mean - expected_mean) / expected_stddev
    const zScore = (recentMean - expected_mean) / expected_stddev;
    this._currentZScore = zScore;
    
    this.logger.debug?.({
      recent_mean: recentMean,
      expected_mean,
      expected_stddev,
      z_score: zScore,
    }, 'Z-Score calculated');
    
    // Requirement 27.3: Trigger safety stop if Z < -2.0
    if (zScore < this.zScoreThreshold && !this._isSafetyStop) {
      this._triggerSafetyStop(zScore, recentMean);
      return {
        z_score: zScore,
        triggered: true,
        reason: 'Z_SCORE_BELOW_THRESHOLD',
      };
    }
    
    return {
      z_score: zScore,
      triggered: false,
      reason: null,
    };
  }

  /**
   * Trigger safety stop due to Z-Score drift
   * Requirements 27.3, 27.4, 27.5: Trigger safety stop, disable auto-execution, log diagnostics
   * 
   * @param {number} zScore - Current Z-Score
   * @param {number} recentMean - Recent PnL mean
   * @private
   */
  async _triggerSafetyStop(zScore, recentMean) {
    this._isSafetyStop = true;
    this._autoExecutionEnabled = false;
    
    // Requirement 27.5: Log detailed diagnostics
    const diagnostics = {
      recent_pnl: [...this._recentPnL],
      recent_pnl_mean: recentMean,
      expected_mean: this.backtestParams.expected_mean,
      expected_stddev: this.backtestParams.expected_stddev,
      z_score: zScore,
      trigger_reason: 'Z_SCORE_BELOW_THRESHOLD',
      threshold: this.zScoreThreshold,
      timestamp: new Date().toISOString(),
    };
    
    this.logger.error?.(diagnostics, 'SAFETY_STOP - Z-Score drift detected, auto-execution disabled');
    
    this.emit('safety_stop', diagnostics);
    
    // Requirement 97.7: Log system event to database
    if (this.databaseManager) {
      await this.databaseManager.insertSystemEvent({
        event_type: 'z_score_drift_stop',
        severity: 'CRITICAL',
        description: `Safety stop triggered due to Z-Score drift (Z=${zScore.toFixed(2)})`,
        context: {
          z_score: zScore,
          recent_pnl_mean: recentMean,
          expected_mean: this.backtestParams.expected_mean,
          expected_stddev: this.backtestParams.expected_stddev,
          threshold: this.zScoreThreshold,
          recent_pnl_count: this._recentPnL.length,
        },
        timestamp: diagnostics.timestamp,
      });
    }
    
    // Requirement 27.4: Alert operator
    await this._sendSafetyStopAlert(diagnostics);
  }

  /**
   * Check for drawdown velocity (flash crash protection)
   * Requirement 27.7: If equity drops > 2% in < 5 minutes → Hard Kill immediately
   * @private
   */
  async _checkDrawdownVelocity() {
    // Skip if already in hard kill state
    if (this._isHardKill) {
      return;
    }
    
    const currentEquity = await this.getEquity();
    if (currentEquity === null || currentEquity === undefined) {
      return;
    }
    
    const now = Date.now();
    
    // Add current snapshot
    this._equitySnapshots.push({
      equity: currentEquity,
      timestamp: now,
    });
    
    // Remove snapshots older than the time window
    const cutoffTime = now - this.drawdownTimeWindowMs;
    this._equitySnapshots = this._equitySnapshots.filter(s => s.timestamp >= cutoffTime);
    
    // Need at least 2 snapshots to calculate velocity
    if (this._equitySnapshots.length < 2) {
      return;
    }
    
    // Find the maximum equity in the window
    const maxEquitySnapshot = this._equitySnapshots.reduce((max, s) => 
      s.equity > max.equity ? s : max, this._equitySnapshots[0]);
    
    // Calculate drawdown percentage from max
    const drawdownPct = ((maxEquitySnapshot.equity - currentEquity) / maxEquitySnapshot.equity) * 100;
    const timeElapsedMs = now - maxEquitySnapshot.timestamp;
    
    // Requirement 27.7: Trigger hard kill if drawdown > 2% in < 5 minutes
    if (drawdownPct >= this.drawdownThresholdPct && timeElapsedMs <= this.drawdownTimeWindowMs) {
      await this._triggerHardKill(drawdownPct, timeElapsedMs, maxEquitySnapshot.equity, currentEquity);
    }
  }

  /**
   * Trigger hard kill due to drawdown velocity
   * Requirement 27.7, 27.8: Hard Kill immediately, log FLASH_CRASH_PROTECTION
   * 
   * @param {number} drawdownPct - Drawdown percentage
   * @param {number} timeElapsedMs - Time elapsed in milliseconds
   * @param {number} peakEquity - Peak equity value
   * @param {number} currentEquity - Current equity value
   * @private
   */
  async _triggerHardKill(drawdownPct, timeElapsedMs, peakEquity, currentEquity) {
    this._isHardKill = true;
    this._autoExecutionEnabled = false;
    
    // Close all positions
    const tradeRecords = this.shadowState.closeAllPositions(
      this.getPriceForSymbol,
      'FLASH_CRASH_PROTECTION'
    );
    
    // Also close via broker if available
    if (this.brokerGateway) {
      try {
        await this.brokerGateway.closeAllPositions();
      } catch (error) {
        this.logger.error?.({ error: error.message }, 'Failed to close broker positions during hard kill');
      }
    }
    
    // Requirement 27.8: Log FLASH_CRASH_PROTECTION with details
    const diagnostics = {
      trigger_reason: 'FLASH_CRASH_PROTECTION',
      equity_change_pct: -drawdownPct,
      peak_equity: peakEquity,
      current_equity: currentEquity,
      time_window_ms: timeElapsedMs,
      positions_closed: tradeRecords.length,
      trade_records: tradeRecords,
      drawdown_velocity: (drawdownPct / (timeElapsedMs / 60000)).toFixed(4) + '%/min',
      timestamp: new Date().toISOString(),
    };
    
    this.logger.error?.(diagnostics, 'HARD_KILL - Drawdown velocity exceeded threshold, all positions closed');
    
    this.emit('hard_kill', diagnostics);
    
    // Requirement 97.7: Log system event to database
    if (this.databaseManager) {
      await this.databaseManager.insertSystemEvent({
        event_type: 'drawdown_velocity_kill',
        severity: 'CRITICAL',
        description: `Hard kill triggered due to rapid drawdown (${drawdownPct.toFixed(2)}% in ${(timeElapsedMs / 60000).toFixed(1)} minutes)`,
        context: {
          equity_change_pct: -drawdownPct,
          peak_equity: peakEquity,
          current_equity: currentEquity,
          time_window_ms: timeElapsedMs,
          positions_closed: tradeRecords.length,
          drawdown_velocity: (drawdownPct / (timeElapsedMs / 60000)).toFixed(4) + '%/min',
        },
        timestamp: diagnostics.timestamp,
      });
    }
    
    // Alert operator
    await this._sendHardKillAlert(diagnostics);
  }

  /**
   * Send safety stop alert
   * Requirement 27.4: Alert operator
   * 
   * @param {Object} diagnostics - Diagnostic data
   * @private
   */
  async _sendSafetyStopAlert(diagnostics) {
    try {
      await this.sendAlert({
        type: 'SAFETY_STOP',
        title: 'Titan Z-Score Drift Safety Stop',
        message: `Safety stop triggered due to Z-Score drift (Z=${diagnostics.z_score.toFixed(2)}). ` +
                 `Recent PnL mean: ${diagnostics.recent_pnl_mean.toFixed(2)}, ` +
                 `Expected mean: ${diagnostics.expected_mean.toFixed(2)}. ` +
                 `Auto-execution disabled. Manual reset required.`,
        data: diagnostics,
        timestamp: diagnostics.timestamp,
      });
      
      this.emit('alert', {
        type: 'SAFETY_STOP',
        sent: true,
        timestamp: diagnostics.timestamp,
      });
    } catch (error) {
      this.logger.error?.({ error: error.message }, 'Failed to send safety stop alert');
      this.emit('alert', {
        type: 'SAFETY_STOP',
        sent: false,
        error: error.message,
        timestamp: diagnostics.timestamp,
      });
    }
  }

  /**
   * Send hard kill alert
   * 
   * @param {Object} diagnostics - Diagnostic data
   * @private
   */
  async _sendHardKillAlert(diagnostics) {
    try {
      await this.sendAlert({
        type: 'HARD_KILL',
        title: 'Titan Flash Crash Protection - HARD KILL',
        message: `Hard kill triggered due to rapid drawdown (${Math.abs(diagnostics.equity_change_pct).toFixed(2)}% in ${(diagnostics.time_window_ms / 60000).toFixed(1)} minutes). ` +
                 `${diagnostics.positions_closed} positions closed. ` +
                 `Auto-execution disabled. Manual reset required.`,
        data: diagnostics,
        timestamp: diagnostics.timestamp,
      });
      
      this.emit('alert', {
        type: 'HARD_KILL',
        sent: true,
        timestamp: diagnostics.timestamp,
      });
    } catch (error) {
      this.logger.error?.({ error: error.message }, 'Failed to send hard kill alert');
      this.emit('alert', {
        type: 'HARD_KILL',
        sent: false,
        error: error.message,
        timestamp: diagnostics.timestamp,
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
   * Manually reset after safety stop or hard kill
   * Requirement 27.6: Require manual reset before re-enabling auto-execution
   * 
   * @param {BacktestParams} [newBacktestParams] - Optional new backtest parameters
   * @returns {boolean} True if reset was successful
   */
  reset(newBacktestParams) {
    if (!this._isSafetyStop && !this._isHardKill) {
      this.logger.warn?.({}, 'Reset called but not in safety stop or hard kill state');
      return false;
    }
    
    // Update backtest params if provided
    if (newBacktestParams) {
      this.backtestParams = newBacktestParams;
    }
    
    // Clear rolling windows (Requirement 27.6: fresh rolling window)
    this._recentPnL = [];
    this._equitySnapshots = [];
    
    // Reset state
    this._isSafetyStop = false;
    this._isHardKill = false;
    this._autoExecutionEnabled = true;
    this._currentZScore = 0;
    
    this.logger.info?.({
      backtest_params: this.backtestParams,
    }, 'ZScoreDrift reset - Auto-execution re-enabled with fresh rolling window');
    
    this.emit('reset', {
      timestamp: new Date().toISOString(),
      backtest_params: this.backtestParams,
    });
    
    return true;
  }

  /**
   * Update backtest parameters
   * 
   * @param {BacktestParams} params - New backtest parameters
   */
  setBacktestParams(params) {
    this.backtestParams = params;
    this.logger.info?.({ backtest_params: params }, 'Backtest parameters updated');
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
   * Check if in safety stop state
   * 
   * @returns {boolean} True if in safety stop state
   */
  isSafetyStop() {
    return this._isSafetyStop;
  }

  /**
   * Check if in hard kill state
   * 
   * @returns {boolean} True if in hard kill state
   */
  isHardKill() {
    return this._isHardKill;
  }

  /**
   * Get current Z-Score
   * 
   * @returns {number} Current Z-Score
   */
  getCurrentZScore() {
    return this._currentZScore;
  }

  /**
   * Get recent PnL array
   * 
   * @returns {number[]} Copy of recent PnL array
   */
  getRecentPnL() {
    return [...this._recentPnL];
  }

  /**
   * Get current status
   * 
   * @returns {ZScoreStatus} Current status
   */
  getStatus() {
    const recentMean = this._recentPnL.length > 0
      ? this._recentPnL.reduce((sum, pnl) => sum + pnl, 0) / this._recentPnL.length
      : 0;
    
    return {
      z_score: this._currentZScore,
      recent_pnl_count: this._recentPnL.length,
      recent_pnl_mean: recentMean,
      expected_mean: this.backtestParams.expected_mean,
      expected_stddev: this.backtestParams.expected_stddev,
      is_safety_stop: this._isSafetyStop,
      is_hard_kill: this._isHardKill,
      auto_execution_enabled: this._autoExecutionEnabled,
      is_monitoring: this._isMonitoring,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get drawdown velocity status
   * 
   * @returns {DrawdownVelocityStatus|null} Drawdown velocity status or null if insufficient data
   */
  getDrawdownVelocityStatus() {
    if (this._equitySnapshots.length < 2) {
      return null;
    }
    
    const now = Date.now();
    const currentEquity = this._equitySnapshots[this._equitySnapshots.length - 1].equity;
    const maxEquitySnapshot = this._equitySnapshots.reduce((max, s) => 
      s.equity > max.equity ? s : max, this._equitySnapshots[0]);
    
    const drawdownPct = ((maxEquitySnapshot.equity - currentEquity) / maxEquitySnapshot.equity) * 100;
    const timeElapsedMs = now - maxEquitySnapshot.timestamp;
    
    return {
      equity_change_pct: -drawdownPct,
      peak_equity: maxEquitySnapshot.equity,
      current_equity: currentEquity,
      time_window_ms: timeElapsedMs,
      is_hard_kill: this._isHardKill,
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
   * Force a drawdown velocity check (for testing)
   */
  async forceDrawdownCheck() {
    await this._checkDrawdownVelocity();
  }

  /**
   * Add equity snapshot manually (for testing)
   * 
   * @param {number} equity - Equity value
   * @param {number} [timestamp] - Optional timestamp (defaults to now)
   */
  addEquitySnapshot(equity, timestamp) {
    this._equitySnapshots.push({
      equity,
      timestamp: timestamp || Date.now(),
    });
  }

  /**
   * Clear equity snapshots (for testing)
   */
  clearEquitySnapshots() {
    this._equitySnapshots = [];
  }
}

export default ZScoreDrift;
