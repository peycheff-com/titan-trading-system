/**
 * OI Wipeout Detector (V-Shape Catch)
 * 
 * Strategy: Exploit the physics of liquidation cascades
 * 
 * The Physics:
 * When a massive dump happens, it's driven by long liquidations. Once liquidations
 * finish, there are NO SELLERS LEFT. Price must bounce because selling pressure
 * physically evaporated.
 * 
 * Detection Criteria:
 * 1. Price drop > 3% in last 5 minutes
 * 2. Open Interest drop > 20% in last 5 minutes
 * 3. CVD flips from red to green (buying pressure returning)
 * 
 * Requirements: 15.2-15.3 - Migrate detectors to Execution Service
 */

const PRICE_DROP_THRESHOLD = 0.03; // 3%
const OI_DROP_THRESHOLD = 0.20; // 20%
const HISTORY_WINDOW_MS = 600000; // 10 minutes
const DETECTION_WINDOW_MS = 300000; // 5 minutes

export class OIWipeoutDetector {
  /**
   * Create a new OIWipeoutDetector
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
    
    /** @type {Map<string, Array<{oi: number, timestamp: number}>>} */
    this.oiHistory = new Map();
  }

  /**
   * Detect OI Wipeout pattern
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object|null>} Tripwire if detected, null otherwise
   */
  async detect(symbol) {
    try {
      // 1. Get current Open Interest
      const currentOI = await this.brokerGateway.getOpenInterest(symbol);
      const currentPrice = await this.brokerGateway.getCurrentPrice(symbol);

      // 2. Get OI from 5 minutes ago
      const history = this.oiHistory.get(symbol) || [];
      const fiveMinAgo = history.find(h => Date.now() - h.timestamp >= DETECTION_WINDOW_MS);

      if (!fiveMinAgo) {
        // Not enough history yet
        return null;
      }

      // 3. Calculate OI drop %
      const oiDrop = (fiveMinAgo.oi - currentOI) / fiveMinAgo.oi;

      // 4. Calculate price drop %
      const priceHistory = await this.brokerGateway.fetchOHLCV(symbol, '1m', 5);
      if (!priceHistory || priceHistory.length < 5) {
        return null;
      }

      const priceStart = priceHistory[0].close;
      const priceDrop = (priceStart - currentPrice) / priceStart;

      // 5. Check conditions
      const isPriceDump = priceDrop > PRICE_DROP_THRESHOLD;
      const isOIWipeout = oiDrop > OI_DROP_THRESHOLD;

      if (!isPriceDump || !isOIWipeout) {
        return null;
      }

      // 6. Check CVD flip (Red → Green)
      let isCVDGreen = true;
      if (this.cvdCalculator) {
        const cvd = await this.cvdCalculator.calcCVD(symbol, 60);
        isCVDGreen = cvd > 0;
      }

      if (!isCVDGreen) {
        return null;
      }

      // 7. Calculate retracement target (50% of dump)
      const dumpSize = priceStart - currentPrice;
      const targetPrice = currentPrice + dumpSize * 0.5;

      this.logger.info({
        symbol,
        priceDrop: (priceDrop * 100).toFixed(1),
        oiDrop: (oiDrop * 100).toFixed(1),
        targetPrice: targetPrice.toFixed(2),
      }, 'OI Wipeout detected');

      return {
        symbol,
        triggerPrice: currentPrice,
        direction: 'LONG',
        trapType: 'OI_WIPEOUT',
        confidence: 95,
        leverage: 20,
        estimatedCascadeSize: 0.05,
        activated: false,
        targetPrice,
        stopLoss: currentPrice * 0.98,
      };
    } catch (error) {
      this.logger.error({ symbol, error: error.message }, 'Error detecting OI wipeout');
      return null;
    }
  }

  /**
   * Record Open Interest for historical tracking
   * @param {string} symbol - Trading symbol
   * @param {number} oi - Open Interest value
   */
  recordOI(symbol, oi) {
    if (!this.oiHistory.has(symbol)) {
      this.oiHistory.set(symbol, []);
    }

    const history = this.oiHistory.get(symbol);
    history.push({ oi, timestamp: Date.now() });

    // Keep only last 10 minutes
    const cutoff = Date.now() - HISTORY_WINDOW_MS;
    this.oiHistory.set(
      symbol,
      history.filter(h => h.timestamp > cutoff)
    );
  }

  /**
   * Get OI history for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Array} OI history
   */
  getOIHistory(symbol) {
    return this.oiHistory.get(symbol) || [];
  }

  /**
   * Clear OI history for a symbol
   * @param {string} symbol - Trading symbol
   */
  clearOIHistory(symbol) {
    this.oiHistory.delete(symbol);
  }
}

export default OIWipeoutDetector;
