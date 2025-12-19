/**
 * Funding Squeeze Detector (Predatory Funding Squeeze)
 * 
 * Strategy: Exploit trapped short positions in negative funding environments
 * 
 * The Physics:
 * When funding rate is highly negative (shorts pay longs), but price stops dropping,
 * shorts are trapped. They're paying to hold a losing position. This is a "pressure
 * cooker" that builds over hours/minutes. When it pops, it pops hard (10-20%).
 * 
 * Detection Criteria:
 * 1. Funding rate < -0.02% (shorts crowded and paying longs)
 * 2. Price making higher lows on 5m chart (shorts trapped)
 * 3. CVD is rising (whales absorbing short pressure)
 * 
 * Requirements: 15.2-15.3 - Migrate detectors to Execution Service
 */

const FUNDING_THRESHOLD = -0.0002; // -0.02%

export class FundingSqueezeDetector {
  /**
   * Create a new FundingSqueezeDetector
   * @param {Object} options - Configuration options
   * @param {Object} options.brokerGateway - BrokerGateway instance for exchange data
   * @param {Object} [options.cvdCalculator] - CVD calculator instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.brokerGateway = options.brokerGateway;
    this.cvdCalculator = options.cvdCalculator;
    this.logger = options.logger || {
      info: (data, msg) => console.log(`[INFO] ${msg}`, data),
      warn: (data, msg) => console.warn(`[WARN] ${msg}`, data),
      error: (data, msg) => console.error(`[ERROR] ${msg}`, data),
    };
  }

  /**
   * Detect Funding Squeeze pattern
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object|null>} Tripwire if detected, null otherwise
   */
  async detect(symbol) {
    try {
      // 1. Get current funding rate
      const fundingRate = await this.brokerGateway.getFundingRate(symbol);

      // 2. Check if funding is highly negative (shorts crowded)
      if (fundingRate > FUNDING_THRESHOLD) {
        return null;
      }

      this.logger.info({
        symbol,
        fundingRate: (fundingRate * 100).toFixed(3),
      }, 'Checking funding squeeze');

      // 3. Check if price is making higher lows (shorts trapped)
      const ohlcv = await this.brokerGateway.fetchOHLCV(symbol, '5m', 20);
      if (!ohlcv || ohlcv.length < 3) {
        return null;
      }

      // Get last 3 lows
      const recentLows = ohlcv.slice(-3).map(bar => bar.low);
      const isHigherLow = recentLows[2] > recentLows[1] && recentLows[1] > recentLows[0];

      if (!isHigherLow) {
        return null;
      }

      // 4. Check if CVD is rising (whales absorbing shorts)
      let isCVDRising = true;
      if (this.cvdCalculator) {
        const cvd = await this.cvdCalculator.calcCVD(symbol, 300);
        const previousCVD = await this.cvdCalculator.calcCVD(symbol, 300, 300);
        isCVDRising = cvd > previousCVD;
      }

      if (!isCVDRising) {
        return null;
      }

      // 5. Calculate liquidation target
      const currentPrice = ohlcv[ohlcv.length - 1].close;
      const recentHigh = Math.max(...ohlcv.slice(-10).map(bar => bar.high));
      const liquidationTarget = recentHigh * 1.02;

      // 6. Calculate stop loss
      const stopLoss = recentLows[2] * 0.995;

      this.logger.info({
        symbol,
        fundingRate: (fundingRate * 100).toFixed(3),
        higherLow: true,
        targetPrice: liquidationTarget.toFixed(2),
      }, 'Funding squeeze detected');

      return {
        symbol,
        triggerPrice: currentPrice * 1.001,
        direction: 'LONG',
        trapType: 'FUNDING_SQUEEZE',
        confidence: 90,
        leverage: 15,
        estimatedCascadeSize: 0.10,
        activated: false,
        targetPrice: liquidationTarget,
        stopLoss,
      };
    } catch (error) {
      this.logger.error({ symbol, error: error.message }, 'Error detecting funding squeeze');
      return null;
    }
  }
}

export default FundingSqueezeDetector;
