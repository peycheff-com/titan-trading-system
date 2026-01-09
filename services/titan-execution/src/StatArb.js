/**
 * Statistical Arbitrage Engine with Cointegration Testing and Hurst-Adjusted Z-Score
 * 
 * Implements statistical arbitrage strategies during Neutral regime using
 * cointegration testing (ADF test) and Hurst exponent analysis to ensure only
 * statistically valid mean-reverting spreads are traded. Hurst-adjusted Z-Score
 * prevents fading diverging spreads that appear mean-reverting by Z-Score alone.
 * 
 * Requirements: 44.1-44.7, 55.1-55.6, 80.1-80.6
 * 
 * @module StatArb
 */

import { EventEmitter } from 'events';

/**
 * @typedef {Object} PairConfig
 * @property {string} asset1 - First asset symbol
 * @property {string} asset2 - Second asset symbol
 * @property {number} [lookback=100] - Lookback period for calculations
 * @property {number} [zScoreEntry=2.0] - Z-Score threshold for entry
 * @property {number} [zScoreExit=0.0] - Z-Score threshold for exit
 */

/**
 * @typedef {Object} SpreadAnalysis
 * @property {number} beta - Hedge ratio (beta coefficient)
 * @property {number[]} spread - Spread series (asset1 - beta * asset2)
 * @property {number} spreadMean - Mean of spread
 * @property {number} spreadStd - Standard deviation of spread
 * @property {number} currentSpread - Current spread value
 * @property {number} zScore - Current Z-Score of spread
 * @property {number} correlation - Correlation between assets
 * @property {number} hurstExponent - Hurst exponent of spread (0-1)
 * @property {string} spreadDirection - Direction of spread ('DIVERGING_UP', 'DIVERGING_DOWN', 'UNKNOWN')
 */

/**
 * @typedef {Object} ADFResult
 * @property {number} adfStatistic - ADF test statistic
 * @property {number} criticalValue - Critical value at 5% significance (-2.86)
 * @property {boolean} isStationary - Whether spread is stationary
 * @property {string} conclusion - Human-readable conclusion
 */

/**
 * @typedef {Object} StatArbSignal
 * @property {boolean} valid - Whether signal is valid
 * @property {string} action - 'LONG_SPREAD', 'SHORT_SPREAD', 'EXIT', 'NONE'
 * @property {string} asset1 - First asset symbol
 * @property {string} asset2 - Second asset symbol
 * @property {number} beta - Hedge ratio
 * @property {number} zScore - Current Z-Score
 * @property {number} positionSizeMultiplier - Position size multiplier (0.5 for stat arb)
 * @property {string} reason - Reason for signal
 * @property {ADFResult} adfResult - ADF test result
 * @property {SpreadAnalysis} spreadAnalysis - Spread analysis details
 */

/**
 * StatArb class - Statistical Arbitrage Engine with Cointegration Testing and Hurst-Adjusted Z-Score
 * 
 * Key responsibilities:
 * 1. Enable stat arb mode when regime_state == 0 (Neutral) (Requirement 44.1)
 * 2. Identify cointegrated pairs using ADF test (Requirement 44.2, 55.1-55.6)
 * 3. Signal mean reversion when spread z-score > 2.0 AND stationary (Requirement 44.3)
 * 4. Close position when z-score returns to 0 (Requirement 44.4)
 * 5. Reduce position size by 50% (Requirement 44.5)
 * 6. Reject trading if ADF test fails (Requirement 44.6)
 * 7. Log warning for correlated but not cointegrated pairs (Requirement 44.7)
 * 8. Calculate Hurst exponent of spread (not individual assets) (Requirement 80.1)
 * 9. Reject entry when Hurst(spread) > 0.6 (trending/diverging) (Requirement 80.2)
 * 10. Allow entry when Hurst(spread) < 0.5 AND Z-Score > 2.0 (mean-reverting) (Requirement 80.3)
 * 11. Reduce position size by 50% when 0.5 <= Hurst(spread) <= 0.6 (uncertain) (Requirement 80.4)
 * 12. Log "SPREAD_TRENDING" when Hurst gate rejects entry (Requirement 80.5)
 * 13. Require BOTH ADF and Hurst to pass for full position size (Requirement 80.6)
 * 
 * @extends EventEmitter
 * @fires StatArb#signal - When a stat arb signal is generated
 * @fires StatArb#warning - When a warning condition is detected
 */
export class StatArb extends EventEmitter {
  /**
   * Create a new StatArb instance
   * 
   * @param {Object} options - Configuration options
   * @param {Function} [options.logger] - Logger function (defaults to console)
   * @param {number} [options.lookback=100] - Default lookback period for calculations
   * @param {number} [options.zScoreEntry=2.0] - Z-Score threshold for entry (Requirement 44.3)
   * @param {number} [options.zScoreExit=0.0] - Z-Score threshold for exit (Requirement 44.4)
   * @param {number} [options.adfCriticalValue=-2.86] - ADF critical value at 5% significance (Requirement 55.3)
   * @param {number} [options.correlationWarningThreshold=0.8] - Correlation threshold for warning (Requirement 44.7)
   * @param {number} [options.positionSizeMultiplier=0.5] - Position size multiplier (Requirement 44.5)
   * @param {number} [options.minDataPoints=30] - Minimum data points required for analysis
   * @param {number} [options.hurstRejectThreshold=0.6] - Hurst threshold for rejection (Requirement 80.2)
   * @param {number} [options.hurstAcceptThreshold=0.5] - Hurst threshold for acceptance (Requirement 80.3)
   * @param {number} [options.hurstUncertainMultiplier=0.5] - Position size multiplier for uncertain Hurst (Requirement 80.4)
   */
  constructor(options = {}) {
    super();
    
    /** @type {Function} Logger function */
    this.logger = options.logger || console;
    
    /** @type {number} Default lookback period */
    this.lookback = options.lookback || 100;
    
    /** @type {number} Z-Score threshold for entry (Requirement 44.3: > 2.0) */
    this.zScoreEntry = options.zScoreEntry || 2.0;
    
    /** @type {number} Z-Score threshold for exit (Requirement 44.4: returns to 0) */
    this.zScoreExit = options.zScoreExit || 0.0;
    
    /** @type {number} ADF critical value at 5% significance (Requirement 55.3: -2.86) */
    this.adfCriticalValue = options.adfCriticalValue || -2.86;
    
    /** @type {number} Correlation threshold for warning (Requirement 44.7: > 0.8) */
    this.correlationWarningThreshold = options.correlationWarningThreshold || 0.8;
    
    /** @type {number} Position size multiplier (Requirement 44.5: 50%) */
    this.positionSizeMultiplier = options.positionSizeMultiplier || 0.5;
    
    /** @type {number} Minimum data points required */
    this.minDataPoints = options.minDataPoints || 30;
    
    /** @type {number} Hurst threshold for rejection (Requirement 80.2: > 0.6 = trending/diverging) */
    this.hurstRejectThreshold = options.hurstRejectThreshold || 0.6;
    
    /** @type {number} Hurst threshold for acceptance (Requirement 80.3: < 0.5 = mean-reverting) */
    this.hurstAcceptThreshold = options.hurstAcceptThreshold || 0.5;
    
    /** @type {number} Position size multiplier for uncertain Hurst regime (Requirement 80.4: 0.5 <= H <= 0.6) */
    this.hurstUncertainMultiplier = options.hurstUncertainMultiplier || 0.5;
    
    /** @type {Map<string, Object>} Active stat arb positions */
    this._activePositions = new Map();
    
    /** @type {Map<string, ADFResult>} Cached ADF results */
    this._adfCache = new Map();
    
    /** @type {number} Cache TTL in milliseconds (5 minutes) */
    this._cacheTTL = 300000;
  }

  /**
   * Generate pair key for caching
   * @param {string} asset1 - First asset
   * @param {string} asset2 - Second asset
   * @returns {string} Pair key
   * @private
   */
  _getPairKey(asset1, asset2) {
    return `${asset1}:${asset2}`;
  }

  /**
   * Calculate correlation between two price series
   * 
   * @param {number[]} prices1 - First price series
   * @param {number[]} prices2 - Second price series
   * @returns {number} Correlation coefficient (-1 to 1)
   */
  calculateCorrelation(prices1, prices2) {
    if (prices1.length !== prices2.length || prices1.length < 2) {
      return 0;
    }
    
    const n = prices1.length;
    const mean1 = prices1.reduce((a, b) => a + b, 0) / n;
    const mean2 = prices2.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denom1 = 0;
    let denom2 = 0;
    
    for (let i = 0; i < n; i++) {
      const diff1 = prices1[i] - mean1;
      const diff2 = prices2[i] - mean2;
      numerator += diff1 * diff2;
      denom1 += diff1 * diff1;
      denom2 += diff2 * diff2;
    }
    
    const denominator = Math.sqrt(denom1 * denom2);
    if (denominator === 0) return 0;
    
    return numerator / denominator;
  }

  /**
   * Calculate beta (hedge ratio) using OLS regression
   * Requirement 55.1: Compute spread = asset1 - beta * asset2
   * 
   * @param {number[]} prices1 - First price series (dependent variable)
   * @param {number[]} prices2 - Second price series (independent variable)
   * @returns {number} Beta coefficient (hedge ratio)
   */
  calculateBeta(prices1, prices2) {
    if (prices1.length !== prices2.length || prices1.length < 2) {
      return 1;
    }
    
    const n = prices1.length;
    const mean1 = prices1.reduce((a, b) => a + b, 0) / n;
    const mean2 = prices2.reduce((a, b) => a + b, 0) / n;
    
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      const diff1 = prices1[i] - mean1;
      const diff2 = prices2[i] - mean2;
      numerator += diff1 * diff2;
      denominator += diff2 * diff2;
    }
    
    if (denominator === 0) return 1;
    
    return numerator / denominator;
  }

  /**
   * Calculate spread series
   * Requirement 55.1: spread = asset1 - beta * asset2
   * 
   * @param {number[]} prices1 - First price series
   * @param {number[]} prices2 - Second price series
   * @param {number} beta - Hedge ratio
   * @returns {number[]} Spread series
   */
  calculateSpread(prices1, prices2, beta) {
    const spread = [];
    const len = Math.min(prices1.length, prices2.length);
    
    for (let i = 0; i < len; i++) {
      spread.push(prices1[i] - beta * prices2[i]);
    }
    
    return spread;
  }

  /**
   * Calculate Z-Score of current spread value
   * 
   * @param {number[]} spread - Spread series
   * @returns {{zScore: number, mean: number, std: number}} Z-Score and statistics
   */
  calculateZScore(spread) {
    if (spread.length < 2) {
      return { zScore: 0, mean: 0, std: 1 };
    }
    
    const mean = spread.reduce((a, b) => a + b, 0) / spread.length;
    
    const variance = spread.reduce((sum, val) => {
      const diff = val - mean;
      return sum + diff * diff;
    }, 0) / spread.length;
    
    const std = Math.sqrt(variance);
    
    if (std === 0) {
      return { zScore: 0, mean, std: 0 };
    }
    
    const currentSpread = spread[spread.length - 1];
    const zScore = (currentSpread - mean) / std;
    
    return { zScore, mean, std };
  }

  /**
   * Calculate Hurst Exponent using R/S analysis
   * Requirement 80.1: Calculate Hurst exponent of the spread itself (not individual assets)
   * 
   * Hurst exponent measures the long-term memory of a time series:
   * - H < 0.5: Mean-reverting (anti-persistent)
   * - H = 0.5: Random walk (no memory)
   * - H > 0.5: Trending (persistent)
   * 
   * @param {number[]} series - Time series (spread)
   * @param {number} [lookback=100] - Lookback period for calculation
   * @returns {number} Hurst exponent (0-1)
   */
  calculateHurstExponent(series, lookback = 100) {
    if (series.length < 30) {
      return 0.5; // Default to random walk if insufficient data
    }
    
    // Use the most recent lookback bars
    const data = series.slice(-Math.min(lookback, series.length));
    const n = data.length;
    
    if (n < 30) {
      return 0.5;
    }
    
    // Calculate mean
    const mean = data.reduce((a, b) => a + b, 0) / n;
    
    // Calculate mean-adjusted cumulative deviations
    const deviations = [];
    let cumSum = 0;
    for (let i = 0; i < n; i++) {
      cumSum += data[i] - mean;
      deviations.push(cumSum);
    }
    
    // Calculate Range (R): max - min of cumulative deviations
    const maxDev = Math.max(...deviations);
    const minDev = Math.min(...deviations);
    const range = maxDev - minDev;
    
    // Calculate Standard Deviation (S)
    const variance = data.reduce((sum, val) => {
      const diff = val - mean;
      return sum + diff * diff;
    }, 0) / n;
    const std = Math.sqrt(variance);
    
    // Avoid division by zero
    if (std === 0 || range === 0) {
      return 0.5;
    }
    
    // Calculate R/S ratio
    const rs = range / std;
    
    // Hurst exponent: H = log(R/S) / log(n)
    const hurst = Math.log(rs) / Math.log(n);
    
    // Clamp to [0, 1] range
    return Math.max(0, Math.min(1, hurst));
  }

  /**
   * Perform Augmented Dickey-Fuller (ADF) test approximation
   * Requirements 55.2-55.5: Test stationarity using lagged differences regression
   * 
   * The ADF test checks if a time series is stationary by testing for a unit root.
   * H0: Series has a unit root (non-stationary)
   * H1: Series is stationary
   * 
   * If ADF statistic < critical value (-2.86 at 5%), reject H0 → series is stationary
   * 
   * @param {number[]} spread - Spread series to test
   * @returns {ADFResult} ADF test result
   */
  performADFTest(spread) {
    if (spread.length < this.minDataPoints) {
      return {
        adfStatistic: 0,
        criticalValue: this.adfCriticalValue,
        isStationary: false,
        conclusion: 'INSUFFICIENT_DATA',
      };
    }
    
    // Calculate first differences: delta_y[t] = y[t] - y[t-1]
    const deltaY = [];
    for (let i = 1; i < spread.length; i++) {
      deltaY.push(spread[i] - spread[i - 1]);
    }
    
    // Lagged values: y[t-1]
    const laggedY = spread.slice(0, -1);
    
    // Requirement 55.2: Approximate ADF using lagged differences regression
    // Regression: delta_y[t] = alpha + gamma * y[t-1] + epsilon
    // ADF statistic = gamma / SE(gamma)
    
    const n = deltaY.length;
    const meanDeltaY = deltaY.reduce((a, b) => a + b, 0) / n;
    const meanLaggedY = laggedY.reduce((a, b) => a + b, 0) / n;
    
    // Calculate gamma (coefficient on lagged Y)
    let numerator = 0;
    let denominator = 0;
    
    for (let i = 0; i < n; i++) {
      const diffDeltaY = deltaY[i] - meanDeltaY;
      const diffLaggedY = laggedY[i] - meanLaggedY;
      numerator += diffDeltaY * diffLaggedY;
      denominator += diffLaggedY * diffLaggedY;
    }
    
    if (denominator === 0) {
      return {
        adfStatistic: 0,
        criticalValue: this.adfCriticalValue,
        isStationary: false,
        conclusion: 'ZERO_VARIANCE',
      };
    }
    
    const gamma = numerator / denominator;
    
    // Calculate residuals and standard error
    const alpha = meanDeltaY - gamma * meanLaggedY;
    let sse = 0;
    
    for (let i = 0; i < n; i++) {
      const predicted = alpha + gamma * laggedY[i];
      const residual = deltaY[i] - predicted;
      sse += residual * residual;
    }
    
    const mse = sse / (n - 2);
    const seGamma = Math.sqrt(mse / denominator);
    
    if (seGamma === 0) {
      return {
        adfStatistic: 0,
        criticalValue: this.adfCriticalValue,
        isStationary: false,
        conclusion: 'ZERO_SE',
      };
    }
    
    // ADF statistic = gamma / SE(gamma)
    const adfStatistic = gamma / seGamma;
    
    // Requirement 55.3: ADF statistic < -2.86 (5% significance) = stationary
    const isStationary = adfStatistic < this.adfCriticalValue;
    
    let conclusion;
    if (isStationary) {
      conclusion = 'STATIONARY';
    } else {
      conclusion = 'NON_STATIONARY';
    }
    
    return {
      adfStatistic,
      criticalValue: this.adfCriticalValue,
      isStationary,
      conclusion,
    };
  }

  /**
   * Analyze a pair for statistical arbitrage opportunity
   * Requirement 80.1: Calculate Hurst exponent of the spread itself
   * 
   * @param {string} asset1 - First asset symbol
   * @param {string} asset2 - Second asset symbol
   * @param {number[]} prices1 - First asset price series
   * @param {number[]} prices2 - Second asset price series
   * @returns {SpreadAnalysis} Spread analysis result
   */
  analyzeSpread(asset1, asset2, prices1, prices2) {
    const beta = this.calculateBeta(prices1, prices2);
    const spread = this.calculateSpread(prices1, prices2, beta);
    const { zScore, mean, std } = this.calculateZScore(spread);
    const correlation = this.calculateCorrelation(prices1, prices2);
    
    // Requirement 80.1: Calculate Hurst exponent of the spread (not individual assets)
    const hurstExponent = this.calculateHurstExponent(spread, this.lookback);
    
    // Determine spread direction (for logging)
    const spreadDirection = spread.length >= 2 
      ? (spread[spread.length - 1] > spread[spread.length - 2] ? 'DIVERGING_UP' : 'DIVERGING_DOWN')
      : 'UNKNOWN';
    
    return {
      asset1,
      asset2,
      beta,
      spread,
      spreadMean: mean,
      spreadStd: std,
      currentSpread: spread.length > 0 ? spread[spread.length - 1] : 0,
      zScore,
      correlation,
      hurstExponent,
      spreadDirection,
    };
  }

  /**
   * Evaluate a pair for stat arb trading
   * Requirements 44.1-44.7, 55.1-55.6
   * 
   * @param {string} asset1 - First asset symbol
   * @param {string} asset2 - Second asset symbol
   * @param {number[]} prices1 - First asset price series
   * @param {number[]} prices2 - Second asset price series
   * @param {number} regimeState - Current regime state (0 = Neutral)
   * @returns {StatArbSignal} Stat arb signal
   */
  evaluatePair(asset1, asset2, prices1, prices2, regimeState) {
    const pairKey = this._getPairKey(asset1, asset2);
    
    // Requirement 44.1: Enable stat arb mode only when regime_state == 0 (Neutral)
    if (regimeState !== 0) {
      return {
        valid: false,
        action: 'NONE',
        asset1,
        asset2,
        beta: 0,
        zScore: 0,
        positionSizeMultiplier: this.positionSizeMultiplier,
        reason: 'REGIME_NOT_NEUTRAL',
        adfResult: null,
        spreadAnalysis: null,
      };
    }
    
    // Check minimum data points
    if (prices1.length < this.minDataPoints || prices2.length < this.minDataPoints) {
      return {
        valid: false,
        action: 'NONE',
        asset1,
        asset2,
        beta: 0,
        zScore: 0,
        positionSizeMultiplier: this.positionSizeMultiplier,
        reason: 'INSUFFICIENT_DATA',
        adfResult: null,
        spreadAnalysis: null,
      };
    }
    
    // Analyze spread
    const spreadAnalysis = this.analyzeSpread(asset1, asset2, prices1, prices2);
    
    // Requirement 44.2, 55.1-55.5: Perform ADF test for cointegration
    const adfResult = this.performADFTest(spreadAnalysis.spread);
    
    // Requirement 44.7: Log warning for correlated but not cointegrated pairs
    if (spreadAnalysis.correlation > this.correlationWarningThreshold && !adfResult.isStationary) {
      const warning = {
        type: 'CORRELATED_NOT_COINTEGRATED',
        asset1,
        asset2,
        correlation: spreadAnalysis.correlation,
        adfStatistic: adfResult.adfStatistic,
        message: `Pair ${asset1}/${asset2} has high correlation (${spreadAnalysis.correlation.toFixed(3)}) but spread is non-stationary (ADF: ${adfResult.adfStatistic.toFixed(3)})`,
        timestamp: new Date().toISOString(),
      };
      
      this.logger.warn?.(warning, 'Correlated but not cointegrated');
      this.emit('warning', warning);
    }
    
    // Requirement 44.6, 55.5: Reject stat arb if ADF test fails (spread non-stationary)
    if (!adfResult.isStationary) {
      return {
        valid: false,
        action: 'NONE',
        asset1,
        asset2,
        beta: spreadAnalysis.beta,
        zScore: spreadAnalysis.zScore,
        positionSizeMultiplier: this.positionSizeMultiplier,
        reason: 'SPREAD_NON_STATIONARY',
        adfResult,
        spreadAnalysis,
      };
    }
    
    // Requirement 80.2: Reject entry when Hurst(spread) > 0.6 (spread is trending/diverging)
    if (spreadAnalysis.hurstExponent > this.hurstRejectThreshold) {
      // Requirement 80.5: Log "SPREAD_TRENDING" with details
      const trendingLog = {
        type: 'SPREAD_TRENDING',
        asset1,
        asset2,
        hurst_value: spreadAnalysis.hurstExponent,
        z_score: spreadAnalysis.zScore,
        spread_direction: spreadAnalysis.spreadDirection,
        message: `Spread ${asset1}/${asset2} is trending (H=${spreadAnalysis.hurstExponent.toFixed(3)}) - rejecting stat arb entry despite Z-Score=${spreadAnalysis.zScore.toFixed(2)}`,
        timestamp: new Date().toISOString(),
      };
      
      this.logger.warn?.(trendingLog, 'Spread trending - Hurst gate rejection');
      this.emit('warning', trendingLog);
      
      return {
        valid: false,
        action: 'NONE',
        asset1,
        asset2,
        beta: spreadAnalysis.beta,
        zScore: spreadAnalysis.zScore,
        positionSizeMultiplier: this.positionSizeMultiplier,
        reason: 'SPREAD_TRENDING',
        adfResult,
        spreadAnalysis,
      };
    }
    
    // Requirement 80.4: Reduce position size by 50% when 0.5 <= Hurst(spread) <= 0.6 (uncertain regime)
    let effectivePositionSizeMultiplier = this.positionSizeMultiplier;
    if (spreadAnalysis.hurstExponent >= this.hurstAcceptThreshold && 
        spreadAnalysis.hurstExponent <= this.hurstRejectThreshold) {
      // Uncertain regime: reduce position size by additional 50%
      effectivePositionSizeMultiplier = this.positionSizeMultiplier * this.hurstUncertainMultiplier;
      
      this.logger.info?.({
        pair: pairKey,
        hurst_value: spreadAnalysis.hurstExponent,
        original_multiplier: this.positionSizeMultiplier,
        reduced_multiplier: effectivePositionSizeMultiplier,
      }, 'Hurst uncertain regime - reducing position size');
    }
    
    // Check if we have an active position
    const activePosition = this._activePositions.get(pairKey);
    
    // Requirement 44.4: Exit when z-score returns to 0
    if (activePosition) {
      const exitThreshold = 0.5; // Small buffer around 0
      if (Math.abs(spreadAnalysis.zScore) <= exitThreshold) {
        return {
          valid: true,
          action: 'EXIT',
          asset1,
          asset2,
          beta: spreadAnalysis.beta,
          zScore: spreadAnalysis.zScore,
          positionSizeMultiplier: effectivePositionSizeMultiplier,
          reason: 'Z_SCORE_RETURNED_TO_ZERO',
          adfResult,
          spreadAnalysis,
        };
      }
      
      // Still in position, no new signal
      return {
        valid: false,
        action: 'HOLD',
        asset1,
        asset2,
        beta: spreadAnalysis.beta,
        zScore: spreadAnalysis.zScore,
        positionSizeMultiplier: effectivePositionSizeMultiplier,
        reason: 'POSITION_ACTIVE',
        adfResult,
        spreadAnalysis,
      };
    }
    
    // Requirement 44.3, 80.3: Signal mean reversion when z-score > 2.0 AND stationary AND Hurst < 0.5
    if (Math.abs(spreadAnalysis.zScore) >= this.zScoreEntry) {
      // Determine direction based on z-score sign
      // Positive z-score: spread is above mean → SHORT spread (sell asset1, buy asset2)
      // Negative z-score: spread is below mean → LONG spread (buy asset1, sell asset2)
      const action = spreadAnalysis.zScore > 0 ? 'SHORT_SPREAD' : 'LONG_SPREAD';
      
      return {
        valid: true,
        action,
        asset1,
        asset2,
        beta: spreadAnalysis.beta,
        zScore: spreadAnalysis.zScore,
        // Requirement 44.5, 80.4, 80.6: Position size based on Hurst regime
        // Full size if Hurst < 0.5, reduced by 50% if 0.5 <= Hurst <= 0.6
        positionSizeMultiplier: effectivePositionSizeMultiplier,
        reason: 'Z_SCORE_EXTREME',
        adfResult,
        spreadAnalysis,
      };
    }
    
    // No signal
    return {
      valid: false,
      action: 'NONE',
      asset1,
      asset2,
      beta: spreadAnalysis.beta,
      zScore: spreadAnalysis.zScore,
      positionSizeMultiplier: effectivePositionSizeMultiplier,
      reason: 'Z_SCORE_WITHIN_BOUNDS',
      adfResult,
      spreadAnalysis,
    };
  }

  /**
   * Open a stat arb position
   * 
   * @param {string} asset1 - First asset symbol
   * @param {string} asset2 - Second asset symbol
   * @param {string} action - 'LONG_SPREAD' or 'SHORT_SPREAD'
   * @param {number} beta - Hedge ratio
   * @param {number} zScore - Entry Z-Score
   * @returns {Object} Position details
   */
  openPosition(asset1, asset2, action, beta, zScore) {
    const pairKey = this._getPairKey(asset1, asset2);
    
    const position = {
      asset1,
      asset2,
      action,
      beta,
      entryZScore: zScore,
      openedAt: new Date().toISOString(),
    };
    
    this._activePositions.set(pairKey, position);
    
    this.logger.info?.({
      pair: pairKey,
      action,
      beta,
      entry_z_score: zScore,
    }, 'Stat arb position opened');
    
    this.emit('signal', {
      type: 'OPEN',
      ...position,
    });
    
    return position;
  }

  /**
   * Close a stat arb position
   * 
   * @param {string} asset1 - First asset symbol
   * @param {string} asset2 - Second asset symbol
   * @param {number} exitZScore - Exit Z-Score
   * @returns {Object|null} Closed position details or null if not found
   */
  closePosition(asset1, asset2, exitZScore) {
    const pairKey = this._getPairKey(asset1, asset2);
    const position = this._activePositions.get(pairKey);
    
    if (!position) {
      this.logger.warn?.({ pair: pairKey }, 'No active position to close');
      return null;
    }
    
    this._activePositions.delete(pairKey);
    
    const closedPosition = {
      ...position,
      exitZScore,
      closedAt: new Date().toISOString(),
    };
    
    this.logger.info?.({
      pair: pairKey,
      entry_z_score: position.entryZScore,
      exit_z_score: exitZScore,
    }, 'Stat arb position closed');
    
    this.emit('signal', {
      type: 'CLOSE',
      ...closedPosition,
    });
    
    return closedPosition;
  }

  /**
   * Check if a pair has an active position
   * 
   * @param {string} asset1 - First asset symbol
   * @param {string} asset2 - Second asset symbol
   * @returns {boolean} True if position is active
   */
  hasActivePosition(asset1, asset2) {
    const pairKey = this._getPairKey(asset1, asset2);
    return this._activePositions.has(pairKey);
  }

  /**
   * Get active position for a pair
   * 
   * @param {string} asset1 - First asset symbol
   * @param {string} asset2 - Second asset symbol
   * @returns {Object|null} Position details or null
   */
  getActivePosition(asset1, asset2) {
    const pairKey = this._getPairKey(asset1, asset2);
    return this._activePositions.get(pairKey) || null;
  }

  /**
   * Get all active positions
   * 
   * @returns {Object[]} Array of active positions
   */
  getAllActivePositions() {
    return Array.from(this._activePositions.values());
  }

  /**
   * Clear all active positions (for testing/reset)
   */
  clearAllPositions() {
    this._activePositions.clear();
    this.logger.info?.({}, 'All stat arb positions cleared');
  }

  /**
   * Get status summary
   * 
   * @returns {Object} Status summary
   */
  getStatus() {
    return {
      activePositions: this._activePositions.size,
      positions: this.getAllActivePositions(),
      config: {
        lookback: this.lookback,
        zScoreEntry: this.zScoreEntry,
        zScoreExit: this.zScoreExit,
        adfCriticalValue: this.adfCriticalValue,
        correlationWarningThreshold: this.correlationWarningThreshold,
        positionSizeMultiplier: this.positionSizeMultiplier,
        hurstRejectThreshold: this.hurstRejectThreshold,
        hurstAcceptThreshold: this.hurstAcceptThreshold,
        hurstUncertainMultiplier: this.hurstUncertainMultiplier,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export default StatArb;
