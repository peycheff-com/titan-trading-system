/**
 * VelocityCalculator - Price Velocity Tracking
 * 
 * Tracks price movement velocity over time windows.
 * Used for detecting rapid price movements and momentum.
 * 
 * Requirements: 16.1-16.2 - Migrate calculators to Execution Service
 */

const MAX_HISTORY_MS = 600000; // 10 minutes

export class VelocityCalculator {
  /**
   * Create a new VelocityCalculator
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    /** @type {Map<string, Array<{price: number, timestamp: number}>>} */
    this.priceHistory = new Map();
    
    this.logger = options.logger || {
      info: (data, msg) => console.log(`[INFO] ${msg}`, data),
      warn: (data, msg) => console.warn(`[WARN] ${msg}`, data),
      error: (data, msg) => console.error(`[ERROR] ${msg}`, data),
    };
  }

  /**
   * Record a price tick
   * @param {string} symbol - Trading symbol
   * @param {number} price - Current price
   * @param {number} [timestamp] - Timestamp (defaults to Date.now())
   */
  recordPrice(symbol, price, timestamp = Date.now()) {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }

    const history = this.priceHistory.get(symbol);
    history.push({ price, timestamp });

    // Keep only last 10 minutes
    const cutoff = timestamp - MAX_HISTORY_MS;
    this.priceHistory.set(
      symbol,
      history.filter(h => h.timestamp > cutoff)
    );
  }

  /**
   * Calculate price velocity over a time window
   * @param {string} symbol - Trading symbol
   * @param {number} windowMs - Time window in milliseconds
   * @returns {number} Velocity (price change per second)
   */
  calcVelocity(symbol, windowMs) {
    const history = this.priceHistory.get(symbol);
    
    if (!history || history.length < 2) {
      return 0;
    }

    const now = history[history.length - 1].timestamp;
    const windowStart = now - windowMs;

    // Find first price in window
    const startPoint = history.find(h => h.timestamp >= windowStart);
    const endPoint = history[history.length - 1];

    if (!startPoint || startPoint === endPoint) {
      return 0;
    }

    const priceChange = endPoint.price - startPoint.price;
    const timeChange = (endPoint.timestamp - startPoint.timestamp) / 1000; // Convert to seconds

    if (timeChange === 0) {
      return 0;
    }

    return priceChange / timeChange;
  }

  /**
   * Calculate price change percentage over a time window
   * @param {string} symbol - Trading symbol
   * @param {number} windowMs - Time window in milliseconds
   * @returns {number} Price change percentage
   */
  calcPriceChangePercent(symbol, windowMs) {
    const history = this.priceHistory.get(symbol);
    
    if (!history || history.length < 2) {
      return 0;
    }

    const now = history[history.length - 1].timestamp;
    const windowStart = now - windowMs;

    const startPoint = history.find(h => h.timestamp >= windowStart);
    const endPoint = history[history.length - 1];

    if (!startPoint || startPoint.price === 0) {
      return 0;
    }

    return ((endPoint.price - startPoint.price) / startPoint.price) * 100;
  }

  /**
   * Get the last recorded price for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {number|null} Last price or null
   */
  getLastPrice(symbol) {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length === 0) {
      return null;
    }
    return history[history.length - 1].price;
  }

  /**
   * Get price history for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Array} Price history
   */
  getPriceHistory(symbol) {
    return this.priceHistory.get(symbol) || [];
  }

  /**
   * Clear price history for a symbol
   * @param {string} symbol - Trading symbol
   */
  clearPriceHistory(symbol) {
    this.priceHistory.delete(symbol);
  }

  /**
   * Check if price is within proximity of a target
   * @param {string} symbol - Trading symbol
   * @param {number} targetPrice - Target price
   * @param {number} proximityPercent - Proximity threshold as decimal
   * @returns {boolean} Whether price is within proximity
   */
  isPriceNearTarget(symbol, targetPrice, proximityPercent = 0.001) {
    const lastPrice = this.getLastPrice(symbol);
    if (lastPrice === null || targetPrice === 0) {
      return false;
    }

    const distance = Math.abs(lastPrice - targetPrice) / targetPrice;
    return distance <= proximityPercent;
  }
}

export default VelocityCalculator;
