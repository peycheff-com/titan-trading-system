/**
 * Regime-Conditional Weight Learning Module
 * 
 * Implements hard-coded meta-rules for regime-conditional weight adjustment
 * based on volatility state. Tracks feature importance from trade outcomes
 * for validation and alerts operator if meta-rule performance deviates.
 * 
 * Requirements: 43.1-43.8
 * 
 * @module WeightLearning
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  DEFAULT_SAMPLE_SIZE_THRESHOLD: 100,    // Minimum trades for validation
  DEFAULT_CORRELATION_WINDOW: 50,         // Rolling window for correlation
  DEFAULT_DEVIATION_THRESHOLD: 0.3,       // Correlation flip threshold
  DEFAULT_WEIGHT_ADJUSTMENT: 0.3,         // 30% weight adjustment
  DEFAULT_WEBHOOK_TIMEOUT_MS: 5000,       // Webhook timeout
};

/** @constant {Object} Volatility state values */
const VOL_STATE = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
};

/** @constant {Object} Meta-rule identifiers */
const META_RULE = {
  LOW_VOL_TREND_BOOST: 'LOW_VOL_TREND_BOOST',
  HIGH_VOL_MEAN_REVERT_BOOST: 'HIGH_VOL_MEAN_REVERT_BOOST',
  NORMAL_VOL_BASE_WEIGHTS: 'NORMAL_VOL_BASE_WEIGHTS',
};


//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BaseWeights
 * @property {number} trend_weight - Base trend weight (0-1)
 * @property {number} momentum_weight - Base momentum weight (0-1)
 * @property {number} vol_weight - Base volatility weight (0-1)
 * @property {number} macro_weight - Base macro weight (0-1)
 * @property {number} mean_revert_weight - Base mean reversion weight (0-1)
 */

/**
 * @typedef {Object} AdjustedWeights
 * @property {number} trend_weight - Adjusted trend weight
 * @property {number} momentum_weight - Adjusted momentum weight
 * @property {number} vol_weight - Adjusted volatility weight
 * @property {number} macro_weight - Adjusted macro weight
 * @property {number} mean_revert_weight - Adjusted mean reversion weight
 * @property {string} applied_meta_rule - Which meta-rule was applied
 * @property {number} vol_state - Current volatility state
 */

/**
 * @typedef {Object} TradeOutcome
 * @property {string} signal_id - Signal ID
 * @property {number} vol_state - Volatility state at entry
 * @property {number} trend_score - Trend score at entry
 * @property {number} momentum_score - Momentum score at entry
 * @property {number} vol_score - Volatility score at entry
 * @property {number} macro_score - Macro score at entry
 * @property {string} model_recommendation - Model recommendation at entry
 * @property {number} pnl - Trade PnL
 * @property {boolean} is_winner - Whether trade was profitable
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} FeatureImportance
 * @property {number} trend_correlation - Correlation of trend_score with wins
 * @property {number} momentum_correlation - Correlation of momentum_score with wins
 * @property {number} vol_correlation - Correlation of vol_score with wins
 * @property {number} macro_correlation - Correlation of macro_score with wins
 * @property {number} sample_size - Number of trades analyzed
 */

/**
 * @typedef {Object} MetaRulePerformance
 * @property {string} rule - Meta-rule identifier
 * @property {number} win_rate - Win rate when rule was applied
 * @property {number} avg_pnl - Average PnL when rule was applied
 * @property {number} sample_size - Number of trades with this rule
 * @property {number} expected_correlation - Expected correlation direction
 * @property {number} actual_correlation - Actual observed correlation
 * @property {boolean} is_deviating - Whether performance is deviating significantly
 */

/**
 * @typedef {Object} WeightLearningStatus
 * @property {BaseWeights} base_weights - Base weights from backtest
 * @property {AdjustedWeights} current_weights - Currently applied weights
 * @property {number} total_trades - Total trades recorded
 * @property {FeatureImportance} feature_importance - Feature importance metrics
 * @property {Object<string, MetaRulePerformance>} meta_rule_performance - Performance by rule
 * @property {boolean} has_deviation_alert - Whether there's an active deviation alert
 * @property {string} timestamp - ISO timestamp
 */

/**
 * @typedef {Object} Logger
 * @property {Function} info - Info level logging
 * @property {Function} warn - Warning level logging
 * @property {Function} error - Error level logging
 * @property {Function} [debug] - Debug level logging
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
    debug: (data, message) => console.debug(`[DEBUG] ${message}`, data),
  };
}

/**
 * Calculate Pearson correlation coefficient between two arrays
 * @param {number[]} x - First array
 * @param {number[]} y - Second array
 * @returns {number} Correlation coefficient (-1 to 1)
 */
function calculateCorrelation(x, y) {
  if (x.length !== y.length || x.length < 2) {
    return 0;
  }
  
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
  const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
  const sumY2 = y.reduce((total, yi) => total + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) {
    return 0;
  }
  
  return numerator / denominator;
}

/**
 * Validate volatility state value
 * @param {number} volState - Volatility state to validate
 * @returns {boolean} True if valid
 */
function isValidVolState(volState) {
  return volState === VOL_STATE.LOW || 
         volState === VOL_STATE.NORMAL || 
         volState === VOL_STATE.HIGH;
}


//─────────────────────────────────────────────────────────────────────────────
// WEIGHT LEARNING CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * WeightLearning class - Regime-conditional weight adjustment
 * 
 * Key responsibilities:
 * 1. Track feature importance from trade outcomes (Requirement 43.1)
 * 2. Apply meta-rule: vol_state == Low → increase trend_weight by 30% (Requirement 43.2)
 * 3. Apply meta-rule: vol_state == High → increase mean_revert_weight by 30% (Requirement 43.3)
 * 4. Apply meta-rule: vol_state == Normal → use base weights (Requirement 43.4)
 * 5. Compute rolling correlation to validate meta-rules (Requirement 43.5)
 * 6. Alert operator if meta-rule performance deviates (Requirement 43.6)
 * 7. Log weight adjustments (Requirement 43.7)
 * 8. Push updated weights to Pine via webhook (Requirement 43.8)
 * 
 * @extends EventEmitter
 * @fires WeightLearning#weights_adjusted - When weights are adjusted
 * @fires WeightLearning#deviation_alert - When meta-rule performance deviates
 * @fires WeightLearning#weights_pushed - When weights are pushed to Pine
 * @fires WeightLearning#trade_recorded - When a trade outcome is recorded
 */
export class WeightLearning extends EventEmitter {
  /**
   * Create a new WeightLearning instance
   * 
   * @param {Object} options - Configuration options
   * @param {BaseWeights} options.baseWeights - Base weights from backtest optimization
   * @param {Logger} [options.logger] - Logger object
   * @param {number} [options.sampleSizeThreshold] - Min trades for validation (default: 100)
   * @param {number} [options.correlationWindow] - Rolling window for correlation (default: 50)
   * @param {number} [options.deviationThreshold] - Correlation flip threshold (default: 0.3)
   * @param {number} [options.weightAdjustment] - Weight adjustment factor (default: 0.3)
   * @param {string} [options.pineWebhookUrl] - URL to push weights to Pine
   * @param {number} [options.webhookTimeoutMs] - Webhook timeout in ms
   * @param {Function} [options.fetchFn] - Custom fetch function (for testing)
   * @param {Function} [options.sendAlert] - Function to send operator alerts
   */
  constructor(options = {}) {
    super();
    
    /** @type {BaseWeights} Base weights from backtest optimization */
    this.baseWeights = options.baseWeights || {
      trend_weight: 0.30,
      momentum_weight: 0.25,
      vol_weight: 0.15,
      macro_weight: 0.10,
      mean_revert_weight: 0.20,
    };
    
    /** @type {number} Minimum sample size for validation (Requirement 43.5: 100+ trades) */
    this.sampleSizeThreshold = options.sampleSizeThreshold || CONFIG.DEFAULT_SAMPLE_SIZE_THRESHOLD;
    
    /** @type {number} Rolling window for correlation calculation */
    this.correlationWindow = options.correlationWindow || CONFIG.DEFAULT_CORRELATION_WINDOW;
    
    /** @type {number} Threshold for significant deviation (correlation flip) */
    this.deviationThreshold = options.deviationThreshold || CONFIG.DEFAULT_DEVIATION_THRESHOLD;
    
    /** @type {number} Weight adjustment factor (Requirement 43.2, 43.3: 30%) */
    this.weightAdjustment = options.weightAdjustment || CONFIG.DEFAULT_WEIGHT_ADJUSTMENT;
    
    /** @type {string} URL to push weights to Pine */
    this.pineWebhookUrl = options.pineWebhookUrl || '';
    
    /** @type {number} Webhook timeout in milliseconds */
    this.webhookTimeoutMs = options.webhookTimeoutMs || CONFIG.DEFAULT_WEBHOOK_TIMEOUT_MS;
    
    /** @type {Function} Fetch function (injectable for testing) */
    this._fetch = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
    
    /** @type {Function} Alert sender function */
    this.sendAlert = options.sendAlert || this._defaultSendAlert.bind(this);
    
    // Create logger with consistent interface
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
    
    /** @type {TradeOutcome[]} All recorded trade outcomes */
    this._tradeOutcomes = [];
    
    /** @type {AdjustedWeights|null} Currently applied weights */
    this._currentWeights = null;
    
    /** @type {boolean} Whether there's an active deviation alert */
    this._hasDeviationAlert = false;
    
    /** @type {Object<string, TradeOutcome[]>} Trade outcomes grouped by meta-rule */
    this._outcomesByRule = {
      [META_RULE.LOW_VOL_TREND_BOOST]: [],
      [META_RULE.HIGH_VOL_MEAN_REVERT_BOOST]: [],
      [META_RULE.NORMAL_VOL_BASE_WEIGHTS]: [],
    };
    
    /** @type {boolean} Whether instance has been destroyed */
    this._destroyed = false;
  }


  //─────────────────────────────────────────────────────────────────────────────
  // WEIGHT ADJUSTMENT METHODS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get adjusted weights based on current volatility state
   * Requirements 43.2, 43.3, 43.4: Apply meta-rules based on vol_state
   * 
   * @param {number} volState - Current volatility state (0=Low, 1=Normal, 2=High)
   * @returns {AdjustedWeights} Adjusted weights with applied meta-rule
   */
  getAdjustedWeights(volState) {
    if (!isValidVolState(volState)) {
      this.logger.warn?.({ vol_state: volState }, 'Invalid vol_state, using base weights');
      return this._createAdjustedWeights(this.baseWeights, META_RULE.NORMAL_VOL_BASE_WEIGHTS, VOL_STATE.NORMAL);
    }
    
    const oldWeights = this._currentWeights ? { ...this._currentWeights } : null;
    let adjustedWeights;
    let appliedRule;
    
    switch (volState) {
      case VOL_STATE.LOW:
        // Requirement 43.2: vol_state == Low → increase trend_weight by 30%
        adjustedWeights = {
          trend_weight: Math.min(1.0, this.baseWeights.trend_weight * (1 + this.weightAdjustment)),
          momentum_weight: this.baseWeights.momentum_weight,
          vol_weight: this.baseWeights.vol_weight,
          macro_weight: this.baseWeights.macro_weight,
          mean_revert_weight: this.baseWeights.mean_revert_weight,
        };
        appliedRule = META_RULE.LOW_VOL_TREND_BOOST;
        break;
        
      case VOL_STATE.HIGH:
        // Requirement 43.3: vol_state == High → increase mean_revert_weight by 30%
        adjustedWeights = {
          trend_weight: this.baseWeights.trend_weight,
          momentum_weight: this.baseWeights.momentum_weight,
          vol_weight: this.baseWeights.vol_weight,
          macro_weight: this.baseWeights.macro_weight,
          mean_revert_weight: Math.min(1.0, this.baseWeights.mean_revert_weight * (1 + this.weightAdjustment)),
        };
        appliedRule = META_RULE.HIGH_VOL_MEAN_REVERT_BOOST;
        break;
        
      case VOL_STATE.NORMAL:
      default:
        // Requirement 43.4: vol_state == Normal → use base weights
        adjustedWeights = { ...this.baseWeights };
        appliedRule = META_RULE.NORMAL_VOL_BASE_WEIGHTS;
        break;
    }
    
    const result = this._createAdjustedWeights(adjustedWeights, appliedRule, volState);
    this._currentWeights = result;
    
    // Requirement 43.7: Log weight adjustments
    this.logger.info?.({
      vol_state: volState,
      applied_meta_rule: appliedRule,
      old_weights: oldWeights,
      new_weights: result,
    }, 'Weight adjustment applied');
    
    this.emit('weights_adjusted', {
      vol_state: volState,
      applied_meta_rule: appliedRule,
      old_weights: oldWeights,
      new_weights: result,
      timestamp: new Date().toISOString(),
    });
    
    return result;
  }

  /**
   * Create AdjustedWeights object
   * @private
   */
  _createAdjustedWeights(weights, appliedRule, volState) {
    return {
      trend_weight: weights.trend_weight,
      momentum_weight: weights.momentum_weight,
      vol_weight: weights.vol_weight,
      macro_weight: weights.macro_weight,
      mean_revert_weight: weights.mean_revert_weight,
      applied_meta_rule: appliedRule,
      vol_state: volState,
    };
  }


  //─────────────────────────────────────────────────────────────────────────────
  // TRADE OUTCOME TRACKING
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Record a trade outcome for feature importance tracking
   * Requirement 43.1: Log feature importance - which components correlated with winning trades
   * 
   * @param {Object} outcome - Trade outcome data
   * @param {string} outcome.signal_id - Signal ID
   * @param {number} outcome.vol_state - Volatility state at entry
   * @param {number} outcome.trend_score - Trend score at entry
   * @param {number} outcome.momentum_score - Momentum score at entry
   * @param {number} outcome.vol_score - Volatility score at entry
   * @param {number} outcome.macro_score - Macro score at entry
   * @param {string} outcome.model_recommendation - Model recommendation at entry
   * @param {number} outcome.pnl - Trade PnL
   */
  recordTradeOutcome(outcome) {
    if (this._destroyed) {
      throw new Error('WeightLearning has been destroyed');
    }
    
    const tradeOutcome = {
      signal_id: outcome.signal_id,
      vol_state: outcome.vol_state,
      trend_score: outcome.trend_score || 0,
      momentum_score: outcome.momentum_score || 0,
      vol_score: outcome.vol_score || 0,
      macro_score: outcome.macro_score || 0,
      model_recommendation: outcome.model_recommendation || 'UNKNOWN',
      pnl: outcome.pnl,
      is_winner: outcome.pnl > 0,
      timestamp: new Date().toISOString(),
    };
    
    this._tradeOutcomes.push(tradeOutcome);
    
    // Group by applied meta-rule based on vol_state
    const rule = this._getMetaRuleForVolState(outcome.vol_state);
    this._outcomesByRule[rule].push(tradeOutcome);
    
    this.logger.info?.({
      signal_id: outcome.signal_id,
      vol_state: outcome.vol_state,
      pnl: outcome.pnl,
      is_winner: tradeOutcome.is_winner,
      applied_rule: rule,
      total_trades: this._tradeOutcomes.length,
    }, 'Trade outcome recorded');
    
    this.emit('trade_recorded', {
      outcome: tradeOutcome,
      total_trades: this._tradeOutcomes.length,
      timestamp: tradeOutcome.timestamp,
    });
    
    // Check if we have enough samples to validate meta-rules
    if (this._tradeOutcomes.length >= this.sampleSizeThreshold) {
      this._validateMetaRules();
    }
  }

  /**
   * Get meta-rule identifier for a volatility state
   * @private
   */
  _getMetaRuleForVolState(volState) {
    switch (volState) {
      case VOL_STATE.LOW:
        return META_RULE.LOW_VOL_TREND_BOOST;
      case VOL_STATE.HIGH:
        return META_RULE.HIGH_VOL_MEAN_REVERT_BOOST;
      default:
        return META_RULE.NORMAL_VOL_BASE_WEIGHTS;
    }
  }


  //─────────────────────────────────────────────────────────────────────────────
  // FEATURE IMPORTANCE & CORRELATION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate feature importance from trade outcomes
   * Requirement 43.1: Track which components correlated with winning trades
   * 
   * @returns {FeatureImportance} Feature importance metrics
   */
  calculateFeatureImportance() {
    if (this._tradeOutcomes.length < 5) {
      return {
        trend_correlation: 0,
        momentum_correlation: 0,
        vol_correlation: 0,
        macro_correlation: 0,
        sample_size: this._tradeOutcomes.length,
      };
    }
    
    // Use recent trades for correlation
    const recentTrades = this._tradeOutcomes.slice(-this.correlationWindow);
    
    // Extract feature arrays and outcome array
    const trendScores = recentTrades.map(t => t.trend_score);
    const momentumScores = recentTrades.map(t => t.momentum_score);
    const volScores = recentTrades.map(t => t.vol_score);
    const macroScores = recentTrades.map(t => t.macro_score);
    const outcomes = recentTrades.map(t => t.is_winner ? 1 : 0);
    
    return {
      trend_correlation: calculateCorrelation(trendScores, outcomes),
      momentum_correlation: calculateCorrelation(momentumScores, outcomes),
      vol_correlation: calculateCorrelation(volScores, outcomes),
      macro_correlation: calculateCorrelation(macroScores, outcomes),
      sample_size: recentTrades.length,
    };
  }

  /**
   * Validate meta-rules by computing rolling correlation
   * Requirements 43.5, 43.6: Compute correlation and alert on deviation
   * @private
   */
  async _validateMetaRules() {
    const performances = {};
    let hasDeviation = false;
    
    for (const [rule, outcomes] of Object.entries(this._outcomesByRule)) {
      if (outcomes.length < 10) {
        continue; // Need minimum sample
      }
      
      const recentOutcomes = outcomes.slice(-this.correlationWindow);
      const winRate = recentOutcomes.filter(o => o.is_winner).length / recentOutcomes.length;
      const avgPnl = recentOutcomes.reduce((sum, o) => sum + o.pnl, 0) / recentOutcomes.length;
      
      // Calculate correlation based on the rule's expected behavior
      let expectedCorrelation;
      let actualCorrelation;
      
      if (rule === META_RULE.LOW_VOL_TREND_BOOST) {
        // In low vol, trend_score should correlate positively with wins
        const trendScores = recentOutcomes.map(o => o.trend_score);
        const wins = recentOutcomes.map(o => o.is_winner ? 1 : 0);
        actualCorrelation = calculateCorrelation(trendScores, wins);
        expectedCorrelation = 0.3; // Expect positive correlation
      } else if (rule === META_RULE.HIGH_VOL_MEAN_REVERT_BOOST) {
        // In high vol, mean revert signals should work better
        // Use inverse of trend_score as proxy for mean reversion
        const meanRevertProxy = recentOutcomes.map(o => 100 - o.trend_score);
        const wins = recentOutcomes.map(o => o.is_winner ? 1 : 0);
        actualCorrelation = calculateCorrelation(meanRevertProxy, wins);
        expectedCorrelation = 0.3; // Expect positive correlation
      } else {
        // Normal vol - balanced approach
        const totalScores = recentOutcomes.map(o => o.trend_score + o.momentum_score);
        const wins = recentOutcomes.map(o => o.is_winner ? 1 : 0);
        actualCorrelation = calculateCorrelation(totalScores, wins);
        expectedCorrelation = 0.2;
      }
      
      // Requirement 43.6: Check for significant deviation (correlation flip)
      const isDeviating = (expectedCorrelation > 0 && actualCorrelation < -this.deviationThreshold) ||
                          (expectedCorrelation < 0 && actualCorrelation > this.deviationThreshold);
      
      if (isDeviating) {
        hasDeviation = true;
      }
      
      performances[rule] = {
        rule,
        win_rate: winRate,
        avg_pnl: avgPnl,
        sample_size: recentOutcomes.length,
        expected_correlation: expectedCorrelation,
        actual_correlation: actualCorrelation,
        is_deviating: isDeviating,
      };
    }
    
    // Requirement 43.6: Alert operator if meta-rule performance deviates significantly
    if (hasDeviation && !this._hasDeviationAlert) {
      this._hasDeviationAlert = true;
      await this._sendDeviationAlert(performances);
    } else if (!hasDeviation && this._hasDeviationAlert) {
      this._hasDeviationAlert = false;
      this.logger.info?.({}, 'Meta-rule deviation resolved');
    }
    
    return performances;
  }


  //─────────────────────────────────────────────────────────────────────────────
  // WEBHOOK & ALERT METHODS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Push updated weights to Pine via webhook
   * Requirement 43.8: Push new weights to Pine via webhook input or external signal
   * 
   * @param {AdjustedWeights} weights - Weights to push
   * @returns {Promise<boolean>} True if push was successful
   */
  async pushWeightsToPine(weights) {
    if (!this.pineWebhookUrl) {
      this.logger.warn?.({}, 'Pine webhook URL not configured, skipping weight push');
      return false;
    }
    
    if (!this._fetch) {
      this.logger.warn?.({}, 'Fetch function not available, skipping weight push');
      return false;
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.webhookTimeoutMs);
      
      const payload = {
        type: 'WEIGHT_UPDATE',
        weights: {
          trend_weight: weights.trend_weight,
          momentum_weight: weights.momentum_weight,
          vol_weight: weights.vol_weight,
          macro_weight: weights.macro_weight,
          mean_revert_weight: weights.mean_revert_weight,
        },
        applied_meta_rule: weights.applied_meta_rule,
        vol_state: weights.vol_state,
        timestamp: new Date().toISOString(),
      };
      
      const response = await this._fetch(this.pineWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      this.logger.info?.({
        weights: payload.weights,
        applied_meta_rule: weights.applied_meta_rule,
      }, 'Weights pushed to Pine successfully');
      
      this.emit('weights_pushed', {
        weights: payload.weights,
        applied_meta_rule: weights.applied_meta_rule,
        success: true,
        timestamp: payload.timestamp,
      });
      
      return true;
    } catch (error) {
      this.logger.error?.({
        error: error.message,
        weights,
      }, 'Failed to push weights to Pine');
      
      this.emit('weights_pushed', {
        weights,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      
      return false;
    }
  }

  /**
   * Send deviation alert to operator
   * Requirement 43.6: Alert operator if meta-rule performance deviates significantly
   * @private
   */
  async _sendDeviationAlert(performances) {
    const deviatingRules = Object.values(performances).filter(p => p.is_deviating);
    
    const alertData = {
      type: 'META_RULE_DEVIATION',
      title: 'Titan Weight Learning - Meta-Rule Deviation Alert',
      message: `${deviatingRules.length} meta-rule(s) showing significant performance deviation. ` +
               `Review recommended.`,
      deviating_rules: deviatingRules,
      all_performances: performances,
      total_trades: this._tradeOutcomes.length,
      timestamp: new Date().toISOString(),
    };
    
    this.logger.error?.(alertData, 'META_RULE_DEVIATION - Performance deviating from expected');
    
    this.emit('deviation_alert', alertData);
    
    try {
      await this.sendAlert(alertData);
    } catch (error) {
      this.logger.error?.({ error: error.message }, 'Failed to send deviation alert');
    }
  }

  /**
   * Default alert sender (logs to console)
   * @private
   */
  async _defaultSendAlert(alert) {
    this.logger.error?.({
      alert_type: alert.type,
      title: alert.title,
      message: alert.message,
    }, 'ALERT - Would send notification (no alert handler configured)');
  }


  //─────────────────────────────────────────────────────────────────────────────
  // STATUS & CONFIGURATION METHODS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get current status
   * 
   * @returns {WeightLearningStatus} Current status
   */
  getStatus() {
    const featureImportance = this.calculateFeatureImportance();
    
    const metaRulePerformance = {};
    for (const [rule, outcomes] of Object.entries(this._outcomesByRule)) {
      if (outcomes.length === 0) {
        metaRulePerformance[rule] = {
          rule,
          win_rate: 0,
          avg_pnl: 0,
          sample_size: 0,
          expected_correlation: 0,
          actual_correlation: 0,
          is_deviating: false,
        };
        continue;
      }
      
      const winRate = outcomes.filter(o => o.is_winner).length / outcomes.length;
      const avgPnl = outcomes.reduce((sum, o) => sum + o.pnl, 0) / outcomes.length;
      
      metaRulePerformance[rule] = {
        rule,
        win_rate: winRate,
        avg_pnl: avgPnl,
        sample_size: outcomes.length,
        expected_correlation: 0,
        actual_correlation: 0,
        is_deviating: false,
      };
    }
    
    return {
      base_weights: { ...this.baseWeights },
      current_weights: this._currentWeights ? { ...this._currentWeights } : null,
      total_trades: this._tradeOutcomes.length,
      feature_importance: featureImportance,
      meta_rule_performance: metaRulePerformance,
      has_deviation_alert: this._hasDeviationAlert,
      sample_size_threshold: this.sampleSizeThreshold,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get base weights
   * 
   * @returns {BaseWeights} Base weights
   */
  getBaseWeights() {
    return { ...this.baseWeights };
  }

  /**
   * Get current adjusted weights
   * 
   * @returns {AdjustedWeights|null} Current weights or null if not set
   */
  getCurrentWeights() {
    return this._currentWeights ? { ...this._currentWeights } : null;
  }

  /**
   * Update base weights
   * 
   * @param {BaseWeights} weights - New base weights
   */
  setBaseWeights(weights) {
    this.baseWeights = {
      trend_weight: weights.trend_weight ?? this.baseWeights.trend_weight,
      momentum_weight: weights.momentum_weight ?? this.baseWeights.momentum_weight,
      vol_weight: weights.vol_weight ?? this.baseWeights.vol_weight,
      macro_weight: weights.macro_weight ?? this.baseWeights.macro_weight,
      mean_revert_weight: weights.mean_revert_weight ?? this.baseWeights.mean_revert_weight,
    };
    
    this.logger.info?.({ base_weights: this.baseWeights }, 'Base weights updated');
  }

  /**
   * Set Pine webhook URL
   * 
   * @param {string} url - Webhook URL
   */
  setPineWebhookUrl(url) {
    this.pineWebhookUrl = url;
    this.logger.info?.({ url }, 'Pine webhook URL updated');
  }

  /**
   * Get trade outcomes history
   * 
   * @param {number} [count] - Number of recent outcomes to return
   * @returns {TradeOutcome[]} Trade outcomes
   */
  getTradeOutcomes(count) {
    const outcomes = count 
      ? this._tradeOutcomes.slice(-count)
      : [...this._tradeOutcomes];
    return outcomes.map(o => ({ ...o }));
  }

  /**
   * Get outcomes by meta-rule
   * 
   * @param {string} rule - Meta-rule identifier
   * @returns {TradeOutcome[]} Trade outcomes for the rule
   */
  getOutcomesByRule(rule) {
    const outcomes = this._outcomesByRule[rule] || [];
    return outcomes.map(o => ({ ...o }));
  }

  /**
   * Check if deviation alert is active
   * 
   * @returns {boolean} True if deviation alert is active
   */
  hasDeviationAlert() {
    return this._hasDeviationAlert;
  }

  /**
   * Clear deviation alert (after operator review)
   */
  clearDeviationAlert() {
    this._hasDeviationAlert = false;
    this.logger.info?.({}, 'Deviation alert cleared by operator');
  }

  /**
   * Reset all trade history
   */
  reset() {
    this._tradeOutcomes = [];
    this._outcomesByRule = {
      [META_RULE.LOW_VOL_TREND_BOOST]: [],
      [META_RULE.HIGH_VOL_MEAN_REVERT_BOOST]: [],
      [META_RULE.NORMAL_VOL_BASE_WEIGHTS]: [],
    };
    this._currentWeights = null;
    this._hasDeviationAlert = false;
    
    this.logger.info?.({}, 'WeightLearning reset - all trade history cleared');
  }

  /**
   * Destroy the instance and clean up resources
   */
  destroy() {
    this._destroyed = true;
    this._tradeOutcomes = [];
    this._outcomesByRule = {};
    this.removeAllListeners();
  }
}

// Export constants for external use
export { VOL_STATE, META_RULE, CONFIG };

export default WeightLearning;
