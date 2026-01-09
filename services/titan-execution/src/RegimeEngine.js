/**
 * Regime Engine
 * 
 * Shared regime calculation library for all phases (Scavenger, Hunter, Sentinel).
 * Migrated from Pine Script to JavaScript for unified regime detection.
 * 
 * Requirements: System Integration 4.1-4.5, Regime Engine migration
 * 
 * @module RegimeEngine
 */

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {number} Default lookback period for calculations */
const DEFAULT_LOOKBACK = 20;

/** @constant {number} Hurst exponent threshold for trending vs mean-reverting */
const HURST_THRESHOLD = 0.5;

/** @constant {number} FDI threshold for trending vs mean-reverting */
const FDI_THRESHOLD = 1.5;

/** @constant {number} Efficiency ratio threshold for trend strength */
const ER_THRESHOLD = 0.3;

/** @constant {number} Shannon entropy threshold for disorder */
const ENTROPY_THRESHOLD = 0.8;

/** @constant {number} VPIN threshold for flow toxicity */
const VPIN_THRESHOLD = 0.7;

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} RegimeVector
 * @property {1|0|-1} trend_state - 1=Bull, 0=Range, -1=Bear
 * @property {0|1|2} vol_state - 0=Low, 1=Normal, 2=Extreme
 * @property {0|1|2} liquidity_state - 0=Low, 1=Normal, 2=High
 * @property {1|0|-1} regime_state - 1=Risk-On, 0=Neutral, -1=Risk-Off
 * @property {number} hurst_exponent - 0-1, market memory
 * @property {number} fdi - 1-2, Fractal Dimension Index
 * @property {number} efficiency_ratio - 0-1, Kaufman's ER
 * @property {number} vpin_approx - 0-1, VPIN approximation
 * @property {boolean} absorption_state - Flow toxicity flag
 * @property {number} shannon_entropy - 0-1, disorder measure
 * @property {number} market_structure_score - 0-100
 * @property {number} trend_score - 0-30
 * @property {number} momentum_score - 0-25
 * @property {number} vol_score - 0-15
 * @property {number} macro_score - 0-10
 * @property {'TREND_FOLLOW'|'MEAN_REVERT'|'NO_TRADE'} model_recommendation
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

/**
 * Calculate standard deviation
 * @param {number[]} values - Array of values
 * @returns {number} Standard deviation
 */
function calculateStdDev(values) {
  const n = values.length;
  if (n === 0) return 0;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / n;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
  return Math.sqrt(variance);
}

/**
 * Calculate Average True Range (ATR)
 * @param {Object[]} candles - Array of OHLC candles
 * @param {number} period - Lookback period
 * @returns {number} ATR value
 */
function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return 0;
  
  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // Simple moving average of true ranges
  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
}

//─────────────────────────────────────────────────────────────────────────────
// REGIME ENGINE CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Regime Engine class
 * 
 * Calculates comprehensive regime state for market conditions.
 * Shared library for all phases (Scavenger, Hunter, Sentinel).
 */
export class RegimeEngine {
  /**
   * Create a new RegimeEngine instance
   * @param {Object} options - Configuration options
   * @param {Logger} [options.logger] - Logger instance
   * @param {number} [options.lookback] - Lookback period for calculations
   */
  constructor(options = {}) {
    /** @type {number} Lookback period */
    this.lookback = options.lookback || DEFAULT_LOOKBACK;
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // CORE REGIME CALCULATION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate comprehensive regime vector
   * Requirements: System Integration 4.1-4.5
   * 
   * @param {Object[]} candles - Array of OHLC candles
   * @param {Object} [options] - Calculation options
   * @param {number} [options.lookback] - Override default lookback
   * @returns {RegimeVector} Regime vector
   */
  calculate(candles, options = {}) {
    const lookback = options.lookback || this.lookback;
    
    if (candles.length < lookback) {
      this.logger.warn({
        candles_length: candles.length,
        required_lookback: lookback,
      }, 'Insufficient candles for regime calculation');
      
      return this._getDefaultRegimeVector();
    }
    
    // Calculate component metrics
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    
    const hurst = this.calculateHurstExponent(closes, lookback);
    const fdi = this.calculateFDI(closes, lookback);
    const er = this.calculateEfficiencyRatio(closes, lookback);
    const entropy = this.calculateShannonEntropy(closes, lookback);
    const vpin = this.calculateVPINApprox(candles, lookback);
    const absorption = this.detectAbsorption(candles, lookback);
    
    // Calculate state vectors
    const trendState = this._calculateTrendState(closes, lookback);
    const volState = this._calculateVolState(candles, lookback);
    const liquidityState = this._calculateLiquidityState(candles, lookback);
    
    // Calculate component scores
    const trendScore = this._calculateTrendScore(trendState, er);
    const momentumScore = this._calculateMomentumScore(closes, lookback);
    const volScore = this._calculateVolScore(volState);
    const macroScore = this._calculateMacroScore(hurst, fdi);
    
    const marketStructureScore = trendScore + momentumScore + volScore + macroScore;
    
    // Veto-based regime logic: Extreme volatility overrides everything
    let regimeState;
    if (volState === 2) {
      // Extreme volatility = Risk-Off regardless of trend
      regimeState = -1;
    } else if (vpin > VPIN_THRESHOLD) {
      // High flow toxicity = Preemptive Risk-Off
      regimeState = -1;
    } else if (trendState === 0 && entropy > ENTROPY_THRESHOLD) {
      // Range + high disorder = Neutral
      regimeState = 0;
    } else if (trendState !== 0 && er > ER_THRESHOLD) {
      // Trending + high efficiency = Risk-On
      regimeState = 1;
    } else {
      // Default to Neutral
      regimeState = 0;
    }
    
    // Model recommendation based on regime characteristics
    let modelRecommendation;
    if (regimeState === -1) {
      modelRecommendation = 'NO_TRADE';
    } else if (fdi < FDI_THRESHOLD && er > ER_THRESHOLD) {
      modelRecommendation = 'TREND_FOLLOW';
    } else if (fdi > FDI_THRESHOLD && absorption) {
      modelRecommendation = 'MEAN_REVERT';
    } else {
      modelRecommendation = 'NO_TRADE';
    }
    
    return {
      trend_state: trendState,
      vol_state: volState,
      liquidity_state: liquidityState,
      regime_state: regimeState,
      hurst_exponent: hurst,
      fdi,
      efficiency_ratio: er,
      vpin_approx: vpin,
      absorption_state: absorption,
      shannon_entropy: entropy,
      market_structure_score: marketStructureScore,
      trend_score: trendScore,
      momentum_score: momentumScore,
      vol_score: volScore,
      macro_score: macroScore,
      model_recommendation: modelRecommendation,
    };
  }

  /**
   * Get default regime vector (for insufficient data)
   * @returns {RegimeVector} Default regime vector
   * @private
   */
  _getDefaultRegimeVector() {
    return {
      trend_state: 0,
      vol_state: 1,
      liquidity_state: 1,
      regime_state: 0,
      hurst_exponent: 0.5,
      fdi: 1.5,
      efficiency_ratio: 0,
      vpin_approx: 0,
      absorption_state: false,
      shannon_entropy: 0.5,
      market_structure_score: 0,
      trend_score: 0,
      momentum_score: 0,
      vol_score: 0,
      macro_score: 0,
      model_recommendation: 'NO_TRADE',
    };
  }

  //─────────────────────────────────────────────────────────────────────────────
  // STATE CALCULATIONS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate trend state
   * @param {number[]} closes - Close prices
   * @param {number} lookback - Lookback period
   * @returns {1|0|-1} Trend state
   * @private
   */
  _calculateTrendState(closes, lookback) {
    const recent = closes.slice(-lookback);
    const firstPrice = recent[0];
    const lastPrice = recent[recent.length - 1];
    const change = (lastPrice - firstPrice) / firstPrice;
    
    // Simple trend detection based on price change
    if (change > 0.05) return 1;  // Bull
    if (change < -0.05) return -1; // Bear
    return 0; // Range
  }

  /**
   * Calculate volatility state
   * @param {Object[]} candles - OHLC candles
   * @param {number} lookback - Lookback period
   * @returns {0|1|2} Volatility state
   * @private
   */
  _calculateVolState(candles, lookback) {
    const atr = calculateATR(candles, lookback);
    const closes = candles.slice(-lookback).map(c => c.close);
    const avgPrice = closes.reduce((sum, c) => sum + c, 0) / closes.length;
    const atrPct = (atr / avgPrice) * 100;
    
    // Volatility classification
    if (atrPct > 5) return 2;  // Extreme
    if (atrPct > 2) return 1;  // Normal
    return 0; // Low
  }

  /**
   * Calculate liquidity state
   * @param {Object[]} candles - OHLC candles with volume
   * @param {number} lookback - Lookback period
   * @returns {0|1|2} Liquidity state
   * @private
   */
  _calculateLiquidityState(candles, lookback) {
    const volumes = candles.slice(-lookback).map(c => c.volume || 0);
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const recentVolume = volumes[volumes.length - 1];
    
    // Liquidity classification based on volume
    if (recentVolume > avgVolume * 1.5) return 2;  // High
    if (recentVolume > avgVolume * 0.5) return 1;  // Normal
    return 0; // Low
  }

  //─────────────────────────────────────────────────────────────────────────────
  // SCORE CALCULATIONS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate trend score (0-30)
   * @param {number} trendState - Trend state
   * @param {number} er - Efficiency ratio
   * @returns {number} Trend score
   * @private
   */
  _calculateTrendScore(trendState, er) {
    if (trendState === 0) return 0;
    return Math.min(30, er * 30);
  }

  /**
   * Calculate momentum score (0-25)
   * @param {number[]} closes - Close prices
   * @param {number} lookback - Lookback period
   * @returns {number} Momentum score
   * @private
   */
  _calculateMomentumScore(closes, lookback) {
    const recent = closes.slice(-lookback);
    const roc = (recent[recent.length - 1] - recent[0]) / recent[0];
    return Math.min(25, Math.abs(roc) * 100);
  }

  /**
   * Calculate volatility score (0-15)
   * @param {number} volState - Volatility state
   * @returns {number} Volatility score
   * @private
   */
  _calculateVolScore(volState) {
    // Penalize extreme volatility
    if (volState === 2) return 0;
    if (volState === 1) return 15;
    return 10;
  }

  /**
   * Calculate macro score (0-10)
   * @param {number} hurst - Hurst exponent
   * @param {number} fdi - Fractal Dimension Index
   * @returns {number} Macro score
   * @private
   */
  _calculateMacroScore(hurst, fdi) {
    // Reward trending markets (low FDI, high Hurst)
    const trendingScore = (1 - (fdi - 1)) * 5; // 0-5
    const memoryScore = hurst * 5; // 0-5
    return Math.min(10, trendingScore + memoryScore);
  }

  //─────────────────────────────────────────────────────────────────────────────
  // ADVANCED METRICS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Calculate Hurst Exponent (market memory)
   * @param {number[]} closes - Close prices
   * @param {number} lookback - Lookback period
   * @returns {number} Hurst exponent (0-1)
   */
  calculateHurstExponent(closes, lookback) {
    const recent = closes.slice(-lookback);
    if (recent.length < 10) return 0.5;
    
    // Simplified R/S analysis
    const returns = [];
    for (let i = 1; i < recent.length; i++) {
      returns.push(Math.log(recent[i] / recent[i - 1]));
    }
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const deviations = returns.map(r => r - mean);
    
    // Cumulative deviations
    let cumSum = 0;
    const cumDeviations = deviations.map(d => {
      cumSum += d;
      return cumSum;
    });
    
    const range = Math.max(...cumDeviations) - Math.min(...cumDeviations);
    const stdDev = calculateStdDev(returns);
    
    if (stdDev === 0) return 0.5;
    
    const rs = range / stdDev;
    const hurst = Math.log(rs) / Math.log(returns.length);
    
    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, hurst));
  }

  /**
   * Calculate Fractal Dimension Index (faster than Hurst)
   * @param {number[]} closes - Close prices
   * @param {number} lookback - Lookback period
   * @returns {number} FDI (1-2)
   */
  calculateFDI(closes, lookback) {
    const recent = closes.slice(-lookback);
    if (recent.length < 3) return 1.5;
    
    // Calculate path length
    let pathLength = 0;
    for (let i = 1; i < recent.length; i++) {
      pathLength += Math.abs(recent[i] - recent[i - 1]);
    }
    
    // Calculate direct distance
    const directDistance = Math.abs(recent[recent.length - 1] - recent[0]);
    
    if (directDistance === 0) return 2;
    
    // FDI = 1 + log(pathLength / directDistance) / log(2)
    const fdi = 1 + Math.log(pathLength / directDistance) / Math.log(2);
    
    // Clamp to [1, 2]
    return Math.max(1, Math.min(2, fdi));
  }

  /**
   * Calculate Efficiency Ratio (Kaufman's ER)
   * @param {number[]} closes - Close prices
   * @param {number} lookback - Lookback period
   * @returns {number} Efficiency ratio (0-1)
   */
  calculateEfficiencyRatio(closes, lookback) {
    const recent = closes.slice(-lookback);
    if (recent.length < 2) return 0;
    
    // Direction = abs(close - close[lookback])
    const direction = Math.abs(recent[recent.length - 1] - recent[0]);
    
    // Volatility = sum of abs(close - close[1])
    let volatility = 0;
    for (let i = 1; i < recent.length; i++) {
      volatility += Math.abs(recent[i] - recent[i - 1]);
    }
    
    if (volatility === 0) return 0;
    
    return direction / volatility;
  }

  /**
   * Calculate Shannon Entropy (disorder measure)
   * @param {number[]} closes - Close prices
   * @param {number} lookback - Lookback period
   * @returns {number} Shannon entropy (0-1)
   */
  calculateShannonEntropy(closes, lookback) {
    const recent = closes.slice(-lookback);
    if (recent.length < 2) return 0.5;
    
    // Calculate returns
    const returns = [];
    for (let i = 1; i < recent.length; i++) {
      returns.push((recent[i] - recent[i - 1]) / recent[i - 1]);
    }
    
    // Bin returns into 10 buckets
    const bins = 10;
    const minReturn = Math.min(...returns);
    const maxReturn = Math.max(...returns);
    const binSize = (maxReturn - minReturn) / bins;
    
    if (binSize === 0) return 0;
    
    const histogram = new Array(bins).fill(0);
    for (const ret of returns) {
      const binIndex = Math.min(bins - 1, Math.floor((ret - minReturn) / binSize));
      histogram[binIndex]++;
    }
    
    // Calculate entropy
    let entropy = 0;
    for (const count of histogram) {
      if (count > 0) {
        const p = count / returns.length;
        entropy -= p * Math.log2(p);
      }
    }
    
    // Normalize to [0, 1]
    const maxEntropy = Math.log2(bins);
    return entropy / maxEntropy;
  }

  /**
   * Calculate VPIN approximation (flow toxicity)
   * @param {Object[]} candles - OHLC candles with volume
   * @param {number} lookback - Lookback period
   * @returns {number} VPIN approximation (0-1)
   */
  calculateVPINApprox(candles, lookback) {
    const recent = candles.slice(-lookback);
    if (recent.length < 2) return 0;
    
    // Approximate buy/sell volume using price movement
    let buyVolume = 0;
    let sellVolume = 0;
    
    for (let i = 1; i < recent.length; i++) {
      const volume = recent[i].volume || 0;
      const priceChange = recent[i].close - recent[i - 1].close;
      
      if (priceChange > 0) {
        buyVolume += volume;
      } else {
        sellVolume += volume;
      }
    }
    
    const totalVolume = buyVolume + sellVolume;
    if (totalVolume === 0) return 0;
    
    // VPIN = abs(buyVolume - sellVolume) / totalVolume
    return Math.abs(buyVolume - sellVolume) / totalVolume;
  }

  /**
   * Detect absorption state (high effort, low result)
   * @param {Object[]} candles - OHLC candles with volume
   * @param {number} lookback - Lookback period
   * @returns {boolean} True if absorption detected
   */
  detectAbsorption(candles, lookback) {
    const recent = candles.slice(-lookback);
    if (recent.length < 2) return false;
    
    // Calculate average volume and price movement
    const volumes = recent.map(c => c.volume || 0);
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    
    const priceChanges = [];
    for (let i = 1; i < recent.length; i++) {
      priceChanges.push(Math.abs(recent[i].close - recent[i - 1].close) / recent[i - 1].close);
    }
    const avgPriceChange = priceChanges.reduce((sum, c) => sum + c, 0) / priceChanges.length;
    
    // Check last candle
    const lastVolume = volumes[volumes.length - 1];
    const lastPriceChange = priceChanges[priceChanges.length - 1];
    
    // Absorption: high volume (> 2x avg) but low price movement (< 0.5x avg)
    return lastVolume > avgVolume * 2 && lastPriceChange < avgPriceChange * 0.5;
  }
}

export default RegimeEngine;
