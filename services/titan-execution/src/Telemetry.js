/**
 * Telemetry and Observability Module
 * 
 * Comprehensive telemetry for monitoring system health, model accuracy, and trade outcomes.
 * Includes trade utilization metrics for over-filtering detection.
 * 
 * Requirements: 25.1-25.6, 58.1-58.7
 * 
 * @module Telemetry
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  HISTOGRAM_BUCKETS: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  LATENCY_BUCKETS: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  SLIPPAGE_BUCKETS: [-0.5, -0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2, 0.5],
  ROLLING_WINDOW_DAYS: 7,
  LOW_SIGNAL_PASS_RATE_THRESHOLD: 0.10, // 10%
  LOW_TIME_IN_MARKET_THRESHOLD: 0.05,   // 5%
  CONSECUTIVE_DAYS_ALERT: 7,
};

/** @constant {string[]} Veto reason types */
const VETO_REASONS = [
  'entropy_veto',
  'vol_veto',
  'econ_veto',
  'session_veto',
  'correlation_veto',
  'l2_rejection',
  'spread_exceeded',
  'obi_rejection',
];


//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PipelineMetrics
 * @property {number} latency_ms - Pipeline recalculation latency
 * @property {number} timestamp - Unix timestamp
 */

/**
 * @typedef {Object} ExecutionMetrics
 * @property {string} signal_id - Signal identifier
 * @property {number} latency_ms - Execution latency
 * @property {number} slippage_pct - Slippage percentage
 * @property {number} fill_rate - Fill rate (0-1)
 * @property {number} timestamp - Unix timestamp
 */

/**
 * @typedef {Object} FeatureDrift
 * @property {string} feature_name - Feature name
 * @property {number} zscore - Z-Score of drift
 * @property {number} timestamp - Unix timestamp
 */

/**
 * @typedef {Object} TradeUtilization
 * @property {number} risk_on_trades - Trades in Risk-On regime
 * @property {number} neutral_trades - Trades in Neutral regime
 * @property {number} risk_off_blocked - Signals blocked by Risk-Off
 * @property {number} time_in_market_pct - Percentage of time with position
 * @property {number} signal_pass_rate - Signals executed / signals generated
 * @property {Object} veto_breakdown - Breakdown by veto reason
 */

/**
 * @typedef {Object} DailyStats
 * @property {string} date - ISO date string (YYYY-MM-DD)
 * @property {number} signals_generated - Total signals generated
 * @property {number} signals_executed - Signals that were executed
 * @property {number} bars_total - Total bars observed
 * @property {number} bars_with_position - Bars with open position
 * @property {Object} regime_trades - Trades by regime
 * @property {Object} veto_counts - Counts by veto reason
 */

//─────────────────────────────────────────────────────────────────────────────
// HISTOGRAM HELPER
//─────────────────────────────────────────────────────────────────────────────

/**
 * Simple histogram implementation for metric distribution tracking
 */
class Histogram {
  /**
   * @param {number[]} buckets - Bucket boundaries
   */
  constructor(buckets) {
    this.buckets = [...buckets].sort((a, b) => a - b);
    this.counts = new Array(this.buckets.length + 1).fill(0);
    this.sum = 0;
    this.count = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }

  /**
   * Record a value in the histogram
   * @param {number} value - Value to record
   */
  observe(value) {
    this.sum += value;
    this.count++;
    this.min = Math.min(this.min, value);
    this.max = Math.max(this.max, value);

    // Find bucket
    let bucketIndex = this.buckets.length;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        bucketIndex = i;
        break;
      }
    }
    this.counts[bucketIndex]++;
  }

  /**
   * Get histogram statistics
   * @returns {Object} Histogram stats
   */
  getStats() {
    return {
      count: this.count,
      sum: this.sum,
      mean: this.count > 0 ? this.sum / this.count : 0,
      min: this.count > 0 ? this.min : 0,
      max: this.count > 0 ? this.max : 0,
      buckets: this.buckets.map((b, i) => ({
        le: b,
        count: this.counts[i],
      })).concat([{ le: '+Inf', count: this.counts[this.buckets.length] }]),
    };
  }

  /**
   * Reset histogram
   */
  reset() {
    this.counts.fill(0);
    this.sum = 0;
    this.count = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }
}


//─────────────────────────────────────────────────────────────────────────────
// TELEMETRY CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Telemetry class - Comprehensive observability for the Titan execution system
 * 
 * Key responsibilities:
 * 1. Emit pipeline.latency_ms metric per recalc cycle (Requirement 25.1)
 * 2. Emit market_structure_score distribution histogram (Requirement 25.2)
 * 3. Emit execution.latency_ms, slippage_pct, fill_rate (Requirement 25.4)
 * 4. Emit feature_drift.zscore for top features (Requirement 25.5)
 * 5. Structured JSON logging (Requirement 25.6)
 * 6. Track trade utilization metrics (Requirements 58.1-58.7)
 * 
 * @extends EventEmitter
 * @fires Telemetry#metric - When a metric is recorded
 * @fires Telemetry#alert - When an alert condition is triggered
 */
export class Telemetry extends EventEmitter {
  /**
   * Create a new Telemetry instance
   * 
   * @param {Object} options - Configuration options
   * @param {Function} [options.logger] - Logger function (defaults to console)
   * @param {number} [options.lowSignalPassRateThreshold] - Threshold for low signal pass rate alert
   * @param {number} [options.lowTimeInMarketThreshold] - Threshold for low time in market warning
   * @param {number} [options.consecutiveDaysAlert] - Days of low pass rate before alert
   */
  constructor(options = {}) {
    super();

    /** @type {Function} Logger function */
    this.logger = options.logger || console;

    /** @type {number} Low signal pass rate threshold (Requirement 58.4) */
    this.lowSignalPassRateThreshold = options.lowSignalPassRateThreshold || CONFIG.LOW_SIGNAL_PASS_RATE_THRESHOLD;

    /** @type {number} Low time in market threshold (Requirement 58.5) */
    this.lowTimeInMarketThreshold = options.lowTimeInMarketThreshold || CONFIG.LOW_TIME_IN_MARKET_THRESHOLD;

    /** @type {number} Consecutive days for alert (Requirement 58.4) */
    this.consecutiveDaysAlert = options.consecutiveDaysAlert || CONFIG.CONSECUTIVE_DAYS_ALERT;

    // Histograms for metric distribution tracking
    /** @type {Histogram} Pipeline latency histogram (Requirement 25.1) */
    this._pipelineLatencyHistogram = new Histogram(CONFIG.LATENCY_BUCKETS);

    /** @type {Histogram} Market structure score histogram (Requirement 25.2) */
    this._marketStructureHistogram = new Histogram(CONFIG.HISTOGRAM_BUCKETS);

    /** @type {Histogram} Execution latency histogram (Requirement 25.4) */
    this._executionLatencyHistogram = new Histogram(CONFIG.LATENCY_BUCKETS);

    /** @type {Histogram} Slippage histogram (Requirement 25.4) */
    this._slippageHistogram = new Histogram(CONFIG.SLIPPAGE_BUCKETS);

    // Feature drift tracking (Requirement 25.5)
    /** @type {Map<string, number[]>} Feature values for drift calculation */
    this._featureValues = new Map();

    /** @type {Map<string, {mean: number, stddev: number}>} Feature baselines */
    this._featureBaselines = new Map();

    // Trade utilization tracking (Requirements 58.1-58.7)
    /** @type {Map<string, DailyStats>} Daily statistics by date */
    this._dailyStats = new Map();

    /** @type {number} Current bar count */
    this._totalBars = 0;

    /** @type {number} Bars with open position */
    this._barsWithPosition = 0;

    /** @type {number} Total signals generated */
    this._signalsGenerated = 0;

    /** @type {number} Total signals executed */
    this._signalsExecuted = 0;

    /** @type {Object} Regime trade counts (Requirement 58.1) */
    this._regimeTrades = {
      risk_on: 0,
      neutral: 0,
      risk_off_blocked: 0,
    };

    /** @type {Object} Veto reason counts (Requirement 58.6) */
    this._vetoCounts = {};
    VETO_REASONS.forEach(reason => {
      this._vetoCounts[reason] = 0;
    });

    /** @type {number} Consecutive days with low pass rate */
    this._consecutiveLowPassRateDays = 0;

    /** @type {string|null} Last processed date */
    this._lastProcessedDate = null;
  }


  //─────────────────────────────────────────────────────────────────────────────
  // PIPELINE METRICS (Requirement 25.1)
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Record pipeline recalculation latency
   * Requirement 25.1: Emit pipeline.latency_ms metric per recalc cycle
   * 
   * @param {number} latencyMs - Pipeline latency in milliseconds
   */
  recordPipelineLatency(latencyMs) {
    this._pipelineLatencyHistogram.observe(latencyMs);

    const metric = {
      type: 'pipeline.latency_ms',
      value: latencyMs,
      timestamp: Date.now(),
    };

    this._emitStructuredLog('metric', metric);
    this.emit('metric', metric);
  }

  /**
   * Get pipeline latency statistics
   * @returns {Object} Pipeline latency histogram stats
   */
  getPipelineLatencyStats() {
    return this._pipelineLatencyHistogram.getStats();
  }

  //─────────────────────────────────────────────────────────────────────────────
  // MARKET STRUCTURE METRICS (Requirement 25.2)
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Record market structure score
   * Requirement 25.2: Emit market_structure_score distribution histogram
   * 
   * @param {number} score - Market structure score (0-100)
   */
  recordMarketStructureScore(score) {
    this._marketStructureHistogram.observe(score);

    const metric = {
      type: 'market_structure_score',
      value: score,
      timestamp: Date.now(),
    };

    this._emitStructuredLog('metric', metric);
    this.emit('metric', metric);
  }

  /**
   * Get market structure score histogram
   * @returns {Object} Market structure histogram stats
   */
  getMarketStructureHistogram() {
    return this._marketStructureHistogram.getStats();
  }

  //─────────────────────────────────────────────────────────────────────────────
  // EXECUTION METRICS (Requirement 25.4)
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Record execution metrics
   * Requirement 25.4: Emit execution.latency_ms, slippage_pct, fill_rate
   * 
   * @param {ExecutionMetrics} metrics - Execution metrics
   */
  recordExecution(metrics) {
    const { signal_id, latency_ms, slippage_pct, fill_rate } = metrics;

    this._executionLatencyHistogram.observe(latency_ms);
    this._slippageHistogram.observe(slippage_pct);

    const metric = {
      type: 'execution',
      signal_id,
      latency_ms,
      slippage_pct,
      fill_rate,
      timestamp: Date.now(),
    };

    this._emitStructuredLog('metric', metric);
    this.emit('metric', metric);
  }

  /**
   * Get execution latency statistics
   * @returns {Object} Execution latency histogram stats
   */
  getExecutionLatencyStats() {
    return this._executionLatencyHistogram.getStats();
  }

  /**
   * Get slippage statistics
   * @returns {Object} Slippage histogram stats
   */
  getSlippageStats() {
    return this._slippageHistogram.getStats();
  }


  //─────────────────────────────────────────────────────────────────────────────
  // FEATURE DRIFT METRICS (Requirement 25.5)
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Set baseline for a feature (from backtest)
   * 
   * @param {string} featureName - Feature name (delta, poc_shift, vwap_diff, hurst, entropy)
   * @param {number} mean - Expected mean from backtest
   * @param {number} stddev - Expected standard deviation from backtest
   */
  setFeatureBaseline(featureName, mean, stddev) {
    this._featureBaselines.set(featureName, { mean, stddev });
    this._featureValues.set(featureName, []);
  }

  /**
   * Record feature value and calculate drift
   * Requirement 25.5: Emit feature_drift.zscore for top features
   * 
   * @param {string} featureName - Feature name
   * @param {number} value - Current feature value
   * @returns {FeatureDrift|null} Feature drift info or null if no baseline
   */
  recordFeatureValue(featureName, value) {
    const baseline = this._featureBaselines.get(featureName);
    if (!baseline) {
      return null;
    }

    // Store value for rolling calculation
    let values = this._featureValues.get(featureName) || [];
    values.push(value);
    
    // Keep last 100 values for rolling mean
    if (values.length > 100) {
      values = values.slice(-100);
    }
    this._featureValues.set(featureName, values);

    // Calculate rolling mean
    const rollingMean = values.reduce((sum, v) => sum + v, 0) / values.length;

    // Calculate Z-Score against baseline
    const zscore = baseline.stddev > 0 
      ? (rollingMean - baseline.mean) / baseline.stddev 
      : 0;

    const drift = {
      type: 'feature_drift.zscore',
      feature_name: featureName,
      zscore,
      rolling_mean: rollingMean,
      baseline_mean: baseline.mean,
      baseline_stddev: baseline.stddev,
      sample_count: values.length,
      timestamp: Date.now(),
    };

    this._emitStructuredLog('metric', drift);
    this.emit('metric', drift);

    return drift;
  }

  /**
   * Get all feature drift Z-Scores
   * @returns {Object} Feature drift Z-Scores by feature name
   */
  getFeatureDriftZScores() {
    const drifts = {};
    
    for (const [featureName, baseline] of this._featureBaselines) {
      const values = this._featureValues.get(featureName) || [];
      if (values.length === 0) {
        drifts[featureName] = { zscore: 0, sample_count: 0 };
        continue;
      }

      const rollingMean = values.reduce((sum, v) => sum + v, 0) / values.length;
      const zscore = baseline.stddev > 0 
        ? (rollingMean - baseline.mean) / baseline.stddev 
        : 0;

      drifts[featureName] = {
        zscore,
        rolling_mean: rollingMean,
        sample_count: values.length,
      };
    }

    return drifts;
  }


  //─────────────────────────────────────────────────────────────────────────────
  // TRADE UTILIZATION METRICS (Requirements 58.1-58.7)
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Record a bar observation
   * Requirement 58.2: Compute time_in_market_pct = bars_with_position / total_bars
   * 
   * @param {boolean} hasPosition - Whether there's an open position
   */
  recordBar(hasPosition) {
    this._totalBars++;
    if (hasPosition) {
      this._barsWithPosition++;
    }

    // Update daily stats
    this._updateDailyStats('bars_total', 1);
    if (hasPosition) {
      this._updateDailyStats('bars_with_position', 1);
    }
  }

  /**
   * Record a signal generation
   * Requirement 58.3: Compute signal_pass_rate = signals_executed / signals_generated
   * 
   * @param {Object} signalInfo - Signal information
   * @param {string} signalInfo.signal_id - Signal identifier
   * @param {number} signalInfo.regime_state - Regime state (1=Risk-On, 0=Neutral, -1=Risk-Off)
   */
  recordSignalGenerated(signalInfo) {
    this._signalsGenerated++;
    this._updateDailyStats('signals_generated', 1);

    const metric = {
      type: 'signal.generated',
      signal_id: signalInfo.signal_id,
      regime_state: signalInfo.regime_state,
      timestamp: Date.now(),
    };

    this._emitStructuredLog('signal', metric);
  }

  /**
   * Record a signal execution
   * Requirement 58.1: Track per-regime trade counts
   * 
   * @param {Object} executionInfo - Execution information
   * @param {string} executionInfo.signal_id - Signal identifier
   * @param {number} executionInfo.regime_state - Regime state at execution
   */
  recordSignalExecuted(executionInfo) {
    this._signalsExecuted++;
    this._updateDailyStats('signals_executed', 1);

    // Track by regime (Requirement 58.1)
    const regimeState = executionInfo.regime_state;
    if (regimeState === 1) {
      this._regimeTrades.risk_on++;
      this._updateDailyStats('regime_risk_on', 1);
    } else if (regimeState === 0) {
      this._regimeTrades.neutral++;
      this._updateDailyStats('regime_neutral', 1);
    }

    const metric = {
      type: 'signal.executed',
      signal_id: executionInfo.signal_id,
      regime_state: regimeState,
      timestamp: Date.now(),
    };

    this._emitStructuredLog('signal', metric);
  }

  /**
   * Record a signal blocked by Risk-Off regime
   * Requirement 58.1: Track risk_off_blocked count
   * 
   * @param {Object} blockInfo - Block information
   * @param {string} blockInfo.signal_id - Signal identifier
   * @param {string} blockInfo.veto_reason - Reason for veto
   */
  recordSignalBlocked(blockInfo) {
    this._regimeTrades.risk_off_blocked++;
    this._updateDailyStats('risk_off_blocked', 1);

    // Track veto reason (Requirement 58.6)
    const reason = blockInfo.veto_reason || 'unknown';
    if (this._vetoCounts[reason] !== undefined) {
      this._vetoCounts[reason]++;
      this._updateDailyStats(`veto_${reason}`, 1);
    }

    const metric = {
      type: 'signal.blocked',
      signal_id: blockInfo.signal_id,
      veto_reason: reason,
      timestamp: Date.now(),
    };

    this._emitStructuredLog('signal', metric);
  }

  /**
   * Get time in market percentage
   * Requirement 58.2: time_in_market_pct = bars_with_position / total_bars
   * 
   * @returns {number} Time in market percentage (0-1)
   */
  getTimeInMarketPct() {
    if (this._totalBars === 0) return 0;
    return this._barsWithPosition / this._totalBars;
  }

  /**
   * Get signal pass rate
   * Requirement 58.3: signal_pass_rate = signals_executed / signals_generated
   * 
   * @returns {number} Signal pass rate (0-1)
   */
  getSignalPassRate() {
    if (this._signalsGenerated === 0) return 0;
    return this._signalsExecuted / this._signalsGenerated;
  }

  /**
   * Get trade utilization metrics
   * Requirements 58.1-58.6
   * 
   * @returns {TradeUtilization} Trade utilization metrics
   */
  getTradeUtilization() {
    return {
      risk_on_trades: this._regimeTrades.risk_on,
      neutral_trades: this._regimeTrades.neutral,
      risk_off_blocked: this._regimeTrades.risk_off_blocked,
      time_in_market_pct: this.getTimeInMarketPct(),
      signal_pass_rate: this.getSignalPassRate(),
      signals_generated: this._signalsGenerated,
      signals_executed: this._signalsExecuted,
      total_bars: this._totalBars,
      bars_with_position: this._barsWithPosition,
      veto_breakdown: { ...this._vetoCounts },
    };
  }


  /**
   * Get recommendation on which veto is blocking most trades
   * Requirement 58.7: Provide recommendation on which veto is blocking most trades
   * 
   * @returns {Object} Veto analysis with recommendation
   */
  getVetoRecommendation() {
    const totalVetos = Object.values(this._vetoCounts).reduce((sum, count) => sum + count, 0);
    
    if (totalVetos === 0) {
      return {
        top_veto: null,
        top_veto_count: 0,
        top_veto_pct: 0,
        recommendation: 'No vetoes recorded yet.',
        veto_breakdown: { ...this._vetoCounts },
      };
    }

    // Find top veto reason
    let topVeto = null;
    let topCount = 0;
    
    for (const [reason, count] of Object.entries(this._vetoCounts)) {
      if (count > topCount) {
        topCount = count;
        topVeto = reason;
      }
    }

    const topPct = (topCount / totalVetos) * 100;

    // Generate recommendation based on top veto
    let recommendation = '';
    switch (topVeto) {
      case 'entropy_veto':
        recommendation = 'High entropy (choppy market) is blocking most trades. Consider relaxing entropy threshold or waiting for cleaner market conditions.';
        break;
      case 'vol_veto':
        recommendation = 'Extreme volatility is blocking most trades. This is protective behavior during volatile periods. Consider if vol_state thresholds are too sensitive.';
        break;
      case 'econ_veto':
        recommendation = 'Economic calendar events are blocking most trades. Review economic filter settings or trading schedule around major events.';
        break;
      case 'session_veto':
        recommendation = 'Session filtering is blocking most trades. Review session settings - you may be trading during off-hours too often.';
        break;
      case 'correlation_veto':
        recommendation = 'Correlation decoupling is blocking most trades. Market may be in unusual regime. Review correlation thresholds.';
        break;
      case 'l2_rejection':
        recommendation = 'L2 validation is rejecting most trades. Check spread/depth thresholds or market liquidity conditions.';
        break;
      case 'spread_exceeded':
        recommendation = 'Spread is too wide for most signals. Consider trading more liquid instruments or relaxing spread threshold.';
        break;
      case 'obi_rejection':
        recommendation = 'Order Book Imbalance is rejecting most trades. Heavy sell walls may be present. Consider using limit orders.';
        break;
      default:
        recommendation = `${topVeto} is the primary blocker. Review its threshold settings.`;
    }

    return {
      top_veto: topVeto,
      top_veto_count: topCount,
      top_veto_pct: topPct,
      total_vetos: totalVetos,
      recommendation,
      veto_breakdown: { ...this._vetoCounts },
    };
  }

  /**
   * Check for over-filtering alerts
   * Requirements 58.4, 58.5: Alert on low pass rate, warn on low time in market
   * 
   * @returns {Object} Alert status
   */
  checkOverFilteringAlerts() {
    const alerts = [];
    const warnings = [];

    const signalPassRate = this.getSignalPassRate();
    const timeInMarketPct = this.getTimeInMarketPct();

    // Requirement 58.5: Log warning if time_in_market_pct < 5%
    if (timeInMarketPct < this.lowTimeInMarketThreshold && this._totalBars > 100) {
      warnings.push({
        type: 'LOW_TIME_IN_MARKET',
        message: `Time in market (${(timeInMarketPct * 100).toFixed(2)}%) is below ${this.lowTimeInMarketThreshold * 100}% threshold`,
        value: timeInMarketPct,
        threshold: this.lowTimeInMarketThreshold,
      });

      this.logger.warn?.({
        time_in_market_pct: timeInMarketPct,
        threshold: this.lowTimeInMarketThreshold,
      }, 'LOW_TIME_IN_MARKET - System may be over-filtering');
    }

    // Check daily pass rate for consecutive days alert
    const today = this._getDateString();
    if (today !== this._lastProcessedDate) {
      this._processEndOfDay();
      this._lastProcessedDate = today;
    }

    // Requirement 58.4: Alert if signal_pass_rate < 10% for 7 consecutive days
    if (this._consecutiveLowPassRateDays >= this.consecutiveDaysAlert) {
      alerts.push({
        type: 'CONSECUTIVE_LOW_PASS_RATE',
        message: `Signal pass rate has been below ${this.lowSignalPassRateThreshold * 100}% for ${this._consecutiveLowPassRateDays} consecutive days`,
        consecutive_days: this._consecutiveLowPassRateDays,
        threshold: this.lowSignalPassRateThreshold,
      });

      this.logger.error?.({
        consecutive_days: this._consecutiveLowPassRateDays,
        threshold: this.lowSignalPassRateThreshold,
      }, 'ALERT - Consecutive low signal pass rate detected');

      this.emit('alert', {
        type: 'CONSECUTIVE_LOW_PASS_RATE',
        consecutive_days: this._consecutiveLowPassRateDays,
        timestamp: Date.now(),
      });
    }

    return {
      alerts,
      warnings,
      signal_pass_rate: signalPassRate,
      time_in_market_pct: timeInMarketPct,
      consecutive_low_pass_rate_days: this._consecutiveLowPassRateDays,
    };
  }


  //─────────────────────────────────────────────────────────────────────────────
  // STRUCTURED LOGGING (Requirement 25.6)
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Log a signal with structured JSON format
   * Requirement 25.6: Output structured JSON: {signal_id, symbol, active_tf, regime_vector, market_structure, decision, payload, ts}
   * 
   * @param {Object} signalData - Signal data to log
   */
  logSignal(signalData) {
    const structuredLog = {
      signal_id: signalData.signal_id,
      symbol: signalData.symbol,
      active_tf: signalData.timeframe,
      regime_vector: signalData.regime_vector,
      market_structure: signalData.market_structure,
      decision: signalData.decision,
      payload: signalData.payload,
      ts: new Date().toISOString(),
    };

    this._emitStructuredLog('signal', structuredLog);
  }

  /**
   * Emit structured log
   * @param {string} category - Log category
   * @param {Object} data - Log data
   * @private
   */
  _emitStructuredLog(category, data) {
    const log = {
      category,
      ...data,
      ts: data.ts || new Date().toISOString(),
    };

    if (this.logger.info) {
      this.logger.info(log, `telemetry.${category}`);
    }
  }

  //─────────────────────────────────────────────────────────────────────────────
  // DAILY STATS HELPERS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get current date string
   * @returns {string} ISO date string (YYYY-MM-DD)
   * @private
   */
  _getDateString() {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Update daily statistics
   * @param {string} field - Field to update
   * @param {number} increment - Amount to increment
   * @private
   */
  _updateDailyStats(field, increment) {
    const date = this._getDateString();
    
    if (!this._dailyStats.has(date)) {
      this._dailyStats.set(date, {
        date,
        signals_generated: 0,
        signals_executed: 0,
        bars_total: 0,
        bars_with_position: 0,
        regime_risk_on: 0,
        regime_neutral: 0,
        risk_off_blocked: 0,
      });

      // Initialize veto counts for the day
      VETO_REASONS.forEach(reason => {
        this._dailyStats.get(date)[`veto_${reason}`] = 0;
      });
    }

    const stats = this._dailyStats.get(date);
    if (stats[field] !== undefined) {
      stats[field] += increment;
    }
  }

  /**
   * Process end of day statistics
   * @private
   */
  _processEndOfDay() {
    // Get yesterday's stats
    const dates = [...this._dailyStats.keys()].sort();
    if (dates.length === 0) return;

    const yesterday = dates[dates.length - 1];
    const stats = this._dailyStats.get(yesterday);
    
    if (!stats) return;

    // Calculate daily pass rate
    const dailyPassRate = stats.signals_generated > 0 
      ? stats.signals_executed / stats.signals_generated 
      : 0;

    // Check if below threshold
    if (dailyPassRate < this.lowSignalPassRateThreshold) {
      this._consecutiveLowPassRateDays++;
    } else {
      this._consecutiveLowPassRateDays = 0;
    }

    // Clean up old daily stats (keep last 30 days)
    while (this._dailyStats.size > 30) {
      const oldestDate = [...this._dailyStats.keys()].sort()[0];
      this._dailyStats.delete(oldestDate);
    }
  }

  /**
   * Get daily statistics for a date range
   * @param {number} [days=7] - Number of days to retrieve
   * @returns {DailyStats[]} Daily statistics
   */
  getDailyStats(days = 7) {
    const dates = [...this._dailyStats.keys()].sort().slice(-days);
    return dates.map(date => ({ ...this._dailyStats.get(date) }));
  }


  //─────────────────────────────────────────────────────────────────────────────
  // STATUS AND RESET
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get comprehensive telemetry status
   * @returns {Object} Full telemetry status
   */
  getStatus() {
    return {
      pipeline: {
        latency: this.getPipelineLatencyStats(),
      },
      market_structure: {
        histogram: this.getMarketStructureHistogram(),
      },
      execution: {
        latency: this.getExecutionLatencyStats(),
        slippage: this.getSlippageStats(),
      },
      feature_drift: this.getFeatureDriftZScores(),
      trade_utilization: this.getTradeUtilization(),
      veto_analysis: this.getVetoRecommendation(),
      alerts: this.checkOverFilteringAlerts(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset all telemetry counters
   */
  reset() {
    // Reset histograms
    this._pipelineLatencyHistogram.reset();
    this._marketStructureHistogram.reset();
    this._executionLatencyHistogram.reset();
    this._slippageHistogram.reset();

    // Reset feature tracking
    for (const [featureName] of this._featureValues) {
      this._featureValues.set(featureName, []);
    }

    // Reset trade utilization
    this._totalBars = 0;
    this._barsWithPosition = 0;
    this._signalsGenerated = 0;
    this._signalsExecuted = 0;
    this._regimeTrades = {
      risk_on: 0,
      neutral: 0,
      risk_off_blocked: 0,
    };

    // Reset veto counts
    VETO_REASONS.forEach(reason => {
      this._vetoCounts[reason] = 0;
    });

    // Reset daily stats
    this._dailyStats.clear();
    this._consecutiveLowPassRateDays = 0;
    this._lastProcessedDate = null;

    this.logger.info?.({}, 'Telemetry reset');
  }

  /**
   * Reset only daily counters (for end of day)
   */
  resetDaily() {
    // Process end of day before reset
    this._processEndOfDay();

    this.logger.info?.({
      date: this._getDateString(),
    }, 'Daily telemetry counters reset');
  }
}

export default Telemetry;
