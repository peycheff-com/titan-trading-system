/**
 * Ultimate Bulgaria Protocol - Combined Strategy
 * 
 * The Setup: Combine OI Wipeout + Leader-Follower for maximum safety and profit
 * 
 * Strategy:
 * 1. Detect idiosyncratic crashes (> 3% drop AND BTC < 0.5% drop)
 * 2. For each crash, check OI wipeout
 * 3. Set Binance Leader-Follower trap at +1% recovery
 * 4. When Binance starts V-Shape recovery, fire Long on Bybit
 * 
 * Why This Wins from Bulgaria:
 * - Sellers are physically gone after OI wipeout
 * - You have 5-15 minutes to enter
 * - Latency is irrelevant
 * - Highest win rate (98% confidence)
 * 
 * Requirements: 15.2-15.3 - Migrate detectors to Execution Service
 */

const CRASH_THRESHOLD = 0.03; // 3%
const BTC_THRESHOLD = 0.005; // 0.5%
const RECOVERY_TRIGGER = 1.01; // +1%

export class UltimateBulgariaProtocol {
  /**
   * Create a new UltimateBulgariaProtocol
   * @param {Object} options - Configuration options
   * @param {Object} options.brokerGateway - BrokerGateway instance for exchange data
   * @param {Object} options.oiDetector - OIWipeoutDetector instance
   * @param {Object} [options.spotClient] - Spot exchange client (Binance)
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.brokerGateway = options.brokerGateway;
    this.oiDetector = options.oiDetector;
    this.spotClient = options.spotClient;
    this.logger = options.logger || {
      info: (data, msg) => console.log(`[INFO] ${msg}`, data),
      warn: (data, msg) => console.warn(`[WARN] ${msg}`, data),
      error: (data, msg) => console.error(`[ERROR] ${msg}`, data),
    };
  }

  /**
   * Detect Ultimate Bulgaria Protocol pattern
   * @param {string} symbol - Trading symbol (or 'SCAN' to scan all)
   * @returns {Promise<Object|null>} Tripwire if detected, null otherwise
   */
  async detect(symbol) {
    try {
      // If specific symbol provided, check it directly
      if (symbol && symbol !== 'SCAN') {
        return await this._checkSymbol(symbol);
      }

      // Scan for crashes
      const crashSymbols = await this._detectCrashes();
      if (crashSymbols.length === 0) {
        return null;
      }

      // Check each crash for OI wipeout
      for (const crashSymbol of crashSymbols) {
        const tripwire = await this._checkSymbol(crashSymbol);
        if (tripwire) {
          return tripwire;
        }
      }

      return null;
    } catch (error) {
      this.logger.error({ symbol, error: error.message }, 'Error in Ultimate Bulgaria Protocol');
      return null;
    }
  }

  /**
   * Check a specific symbol for Ultimate Bulgaria setup
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object|null>} Tripwire if detected, null otherwise
   * @private
   */
  async _checkSymbol(symbol) {
    // Check OI wipeout
    const oiWipeout = await this.oiDetector.detect(symbol);
    if (!oiWipeout) {
      return null;
    }

    // Get spot price for recovery trigger
    let spotPrice;
    if (this.spotClient && typeof this.spotClient.getSpotPrice === 'function') {
      spotPrice = await this.spotClient.getSpotPrice(symbol);
    } else {
      spotPrice = await this.brokerGateway.getCurrentPrice(symbol);
    }

    const recoveryTrigger = spotPrice * RECOVERY_TRIGGER;

    this.logger.info({
      symbol,
      oiWipeout: true,
      recoveryTrigger: recoveryTrigger.toFixed(2),
    }, 'Ultimate Bulgaria trap set');

    return {
      ...oiWipeout,
      trapType: 'ULTIMATE_BULGARIA',
      binanceTrigger: recoveryTrigger,
      confidence: 98,
    };
  }

  /**
   * Detect idiosyncratic crashes
   * @returns {Promise<string[]>} Array of symbols with crashes
   * @private
   */
  async _detectCrashes() {
    const crashes = [];

    try {
      // Get top symbols
      const symbols = await this.brokerGateway.getTopSymbols?.(100) || ['BTCUSDT', 'ETHUSDT'];

      // Get BTC drop as market baseline
      const btcOHLCV = await this.brokerGateway.fetchOHLCV('BTCUSDT', '1m', 5);
      if (!btcOHLCV || btcOHLCV.length < 2) {
        return crashes;
      }

      const btcStart = btcOHLCV[0].close;
      const btcNow = btcOHLCV[btcOHLCV.length - 1].close;
      const btcDrop = (btcStart - btcNow) / btcStart;

      // Check each symbol
      for (const symbol of symbols) {
        if (symbol === 'BTCUSDT') continue;

        try {
          const ohlcv = await this.brokerGateway.fetchOHLCV(symbol, '1m', 5);
          if (!ohlcv || ohlcv.length < 2) continue;

          const priceStart = ohlcv[0].close;
          const priceNow = ohlcv[ohlcv.length - 1].close;
          const drop = (priceStart - priceNow) / priceStart;

          // Only flag if drop > 3% AND BTC is flat (< 0.5%)
          if (drop > CRASH_THRESHOLD && btcDrop < BTC_THRESHOLD) {
            crashes.push(symbol);
            this.logger.info({
              symbol,
              drop: (drop * 100).toFixed(1),
              btcDrop: (btcDrop * 100).toFixed(1),
            }, 'Idiosyncratic crash detected');
          }
        } catch {
          // Skip symbols with errors
          continue;
        }
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Error detecting crashes');
    }

    return crashes;
  }
}

export default UltimateBulgariaProtocol;
