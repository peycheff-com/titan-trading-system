/**
 * Basis Arb Detector (The Rubber Band)
 * 
 * Strategy: Exploit Spot-Perp price disconnects during extreme volatility
 * 
 * The Physics:
 * During extreme volatility, Perp price disconnects from Spot. Perp MUST return
 * to Spot price - it's mathematical law. The basis (Spot - Perp) / Spot represents
 * a rubber band that will snap back.
 * 
 * Detection Criteria:
 * 1. Basis > 0.5% (Perp is discounted relative to Spot)
 * 2. 24h volume > $1M (not a dead market)
 * 3. Perp must converge to Spot (mathematical certainty)
 * 
 * Requirements: 15.2-15.3 - Migrate detectors to Execution Service
 */

const BASIS_THRESHOLD = 0.005; // 0.5%
const MIN_VOLUME = 1000000; // $1M

export class BasisArbDetector {
  /**
   * Create a new BasisArbDetector
   * @param {Object} options - Configuration options
   * @param {Object} options.brokerGateway - BrokerGateway instance for exchange data
   * @param {Object} [options.spotClient] - Spot exchange client (Binance)
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.brokerGateway = options.brokerGateway;
    this.spotClient = options.spotClient;
    this.logger = options.logger || {
      info: (data, msg) => console.log(`[INFO] ${msg}`, data),
      warn: (data, msg) => console.warn(`[WARN] ${msg}`, data),
      error: (data, msg) => console.error(`[ERROR] ${msg}`, data),
    };
  }

  /**
   * Detect Basis Arb pattern
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object|null>} Tripwire if detected, null otherwise
   */
  async detect(symbol) {
    try {
      // 1. Get Spot price (from Binance or broker)
      let spotPrice;
      if (this.spotClient && typeof this.spotClient.getSpotPrice === 'function') {
        spotPrice = await this.spotClient.getSpotPrice(symbol);
      } else {
        // Fallback: use broker's spot price if available
        spotPrice = await this.brokerGateway.getSpotPrice?.(symbol);
        if (!spotPrice) {
          this.logger.warn({ symbol }, 'No spot price available');
          return null;
        }
      }

      // 2. Get Perp price from broker
      const perpPrice = await this.brokerGateway.getCurrentPrice(symbol);

      // 3. Calculate basis: (Spot - Perp) / Spot
      const basis = (spotPrice - perpPrice) / spotPrice;

      // 4. Check if basis exceeds threshold (Perp is discounted)
      if (basis <= BASIS_THRESHOLD) {
        return null;
      }

      this.logger.info({
        symbol,
        spotPrice: spotPrice.toFixed(2),
        perpPrice: perpPrice.toFixed(2),
        basis: (basis * 100).toFixed(2),
      }, 'Checking basis arb');

      // 5. Validate with volume (ensure it's not a dead market)
      const volume = await this.brokerGateway.get24hVolume(symbol);
      if (volume < MIN_VOLUME) {
        return null;
      }

      // 6. Calculate target (Perp converges to Spot)
      const targetPrice = spotPrice * 0.999;

      // 7. Calculate stop loss (tight stop for arb)
      const stopLoss = perpPrice * 0.995;

      this.logger.info({
        symbol,
        basis: (basis * 100).toFixed(2),
        volume: (volume / 1000000).toFixed(1),
        targetPrice: targetPrice.toFixed(2),
      }, 'Basis arb detected');

      return {
        symbol,
        triggerPrice: perpPrice * 1.001,
        direction: 'LONG',
        trapType: 'BASIS_ARB',
        confidence: 85,
        leverage: 10,
        estimatedCascadeSize: basis,
        activated: false,
        targetPrice,
        stopLoss,
      };
    } catch (error) {
      this.logger.error({ symbol, error: error.message }, 'Error detecting basis arb');
      return null;
    }
  }
}

export default BasisArbDetector;
