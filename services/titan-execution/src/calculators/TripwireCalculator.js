/**
 * TripwireCalculator - Structural Level Detection
 * 
 * Calculates tripwire levels based on:
 * - Liquidation clusters
 * - Daily levels (highs/lows)
 * - Bollinger bands
 * 
 * Requirements: 16.1-16.2 - Migrate calculators to Execution Service
 */

export class TripwireCalculator {
  /**
   * Create a new TripwireCalculator
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.brokerGateway] - BrokerGateway instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.brokerGateway = options.brokerGateway;
    this.logger = options.logger || {
      info: (data, msg) => console.log(`[INFO] ${msg}`, data),
      warn: (data, msg) => console.warn(`[WARN] ${msg}`, data),
      error: (data, msg) => console.error(`[ERROR] ${msg}`, data),
    };
  }

  /**
   * Calculate all tripwire levels for a symbol
   * @param {string} symbol - Trading symbol
   * @param {Object} [options] - Calculation options
   * @param {number} [options.bbPeriod=20] - Bollinger band period
   * @param {number} [options.bbStdDev=2] - Bollinger band standard deviation
   * @returns {Promise<Object>} Tripwire levels
   */
  async calcTripwires(symbol, options = {}) {
    const { bbPeriod = 20, bbStdDev = 2 } = options;

    try {
      // Get OHLCV data
      const ohlcv = await this.brokerGateway?.fetchOHLCV(symbol, '1d', 30);
      
      if (!ohlcv || ohlcv.length < bbPeriod) {
        return {
          symbol,
          liquidationLevels: [],
          dailyLevels: { high: null, low: null },
          bollingerBands: { upper: null, middle: null, lower: null },
          timestamp: Date.now(),
        };
      }

      // Calculate daily levels
      const dailyLevels = this._calcDailyLevels(ohlcv);

      // Calculate Bollinger bands
      const bollingerBands = this._calcBollingerBands(ohlcv, bbPeriod, bbStdDev);

      // Estimate liquidation levels (simplified)
      const liquidationLevels = this._estimateLiquidationLevels(ohlcv, dailyLevels);

      return {
        symbol,
        liquidationLevels,
        dailyLevels,
        bollingerBands,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error({ symbol, error: error.message }, 'Error calculating tripwires');
      return {
        symbol,
        liquidationLevels: [],
        dailyLevels: { high: null, low: null },
        bollingerBands: { upper: null, middle: null, lower: null },
        timestamp: Date.now(),
        error: error.message,
      };
    }
  }

  /**
   * Calculate daily high/low levels
   * @param {Array} ohlcv - OHLCV data
   * @returns {Object} Daily levels
   * @private
   */
  _calcDailyLevels(ohlcv) {
    if (!ohlcv || ohlcv.length === 0) {
      return { high: null, low: null };
    }

    // Get yesterday's high/low
    const yesterday = ohlcv[ohlcv.length - 2];
    if (!yesterday) {
      return { high: null, low: null };
    }

    return {
      high: yesterday.high,
      low: yesterday.low,
      previousClose: yesterday.close,
    };
  }

  /**
   * Calculate Bollinger bands
   * @param {Array} ohlcv - OHLCV data
   * @param {number} period - Period for SMA
   * @param {number} stdDev - Standard deviation multiplier
   * @returns {Object} Bollinger bands
   * @private
   */
  _calcBollingerBands(ohlcv, period, stdDev) {
    if (!ohlcv || ohlcv.length < period) {
      return { upper: null, middle: null, lower: null };
    }

    // Get closing prices for the period
    const closes = ohlcv.slice(-period).map(bar => bar.close);

    // Calculate SMA (middle band)
    const sma = closes.reduce((sum, price) => sum + price, 0) / period;

    // Calculate standard deviation
    const squaredDiffs = closes.map(price => Math.pow(price - sma, 2));
    const variance = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / period;
    const standardDeviation = Math.sqrt(variance);

    // Calculate bands
    const upper = sma + (standardDeviation * stdDev);
    const lower = sma - (standardDeviation * stdDev);

    return {
      upper: Math.round(upper * 100) / 100,
      middle: Math.round(sma * 100) / 100,
      lower: Math.round(lower * 100) / 100,
    };
  }

  /**
   * Estimate liquidation levels based on price structure
   * @param {Array} ohlcv - OHLCV data
   * @param {Object} dailyLevels - Daily high/low levels
   * @returns {Array} Estimated liquidation levels
   * @private
   */
  _estimateLiquidationLevels(ohlcv, dailyLevels) {
    if (!ohlcv || ohlcv.length === 0) {
      return [];
    }

    const currentPrice = ohlcv[ohlcv.length - 1].close;
    const levels = [];

    // Estimate long liquidation levels (below current price)
    // Typically at -3%, -5%, -7% from recent highs
    const recentHigh = Math.max(...ohlcv.slice(-7).map(bar => bar.high));
    levels.push({
      price: recentHigh * 0.97,
      type: 'LONG_LIQUIDATION',
      leverage: 20,
      estimatedSize: 'MEDIUM',
    });
    levels.push({
      price: recentHigh * 0.95,
      type: 'LONG_LIQUIDATION',
      leverage: 10,
      estimatedSize: 'LARGE',
    });

    // Estimate short liquidation levels (above current price)
    const recentLow = Math.min(...ohlcv.slice(-7).map(bar => bar.low));
    levels.push({
      price: recentLow * 1.03,
      type: 'SHORT_LIQUIDATION',
      leverage: 20,
      estimatedSize: 'MEDIUM',
    });
    levels.push({
      price: recentLow * 1.05,
      type: 'SHORT_LIQUIDATION',
      leverage: 10,
      estimatedSize: 'LARGE',
    });

    return levels.map(level => ({
      ...level,
      price: Math.round(level.price * 100) / 100,
    }));
  }
}

export default TripwireCalculator;
