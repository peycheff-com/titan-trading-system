/**
 * CVD (Cumulative Volume Delta) Calculator
 * 
 * Purpose: Track buy volume - sell volume over time windows
 * 
 * CVD is a critical indicator for detecting institutional flow:
 * - Positive CVD = Net buying pressure (whales accumulating)
 * - Negative CVD = Net selling pressure (whales distributing)
 * 
 * Requirements: 16.1-16.2 - Migrate calculators to Execution Service
 */

const MAX_HISTORY_SECONDS = 600; // Keep 10 minutes of history

export class CVDCalculator {
  /**
   * Create a new CVDCalculator
   * @param {Object} [options] - Configuration options
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    /** @type {Map<string, Array<{qty: number, time: number, isBuy: boolean}>>} */
    this.tradeHistory = new Map();
    
    this.logger = options.logger || {
      info: (data, msg) => console.log(`[INFO] ${msg}`, data),
      warn: (data, msg) => console.warn(`[WARN] ${msg}`, data),
      error: (data, msg) => console.error(`[ERROR] ${msg}`, data),
    };
  }

  /**
   * Record a trade for CVD calculation
   * @param {Object} trade - Trade data from exchange
   * @param {string} trade.symbol - Trading symbol
   * @param {number} trade.price - Trade price
   * @param {number} trade.qty - Trade quantity
   * @param {number} trade.time - Exchange timestamp
   * @param {boolean} trade.isBuyerMaker - Whether buyer was maker
   */
  recordTrade(trade) {
    if (!this.tradeHistory.has(trade.symbol)) {
      this.tradeHistory.set(trade.symbol, []);
    }

    const history = this.tradeHistory.get(trade.symbol);
    
    // isBuyerMaker = false means the buyer was the aggressor (market buy = bullish)
    history.push({
      qty: trade.qty,
      time: trade.time,
      isBuy: !trade.isBuyerMaker,
    });

    // Keep only last MAX_HISTORY_SECONDS
    const cutoff = trade.time - (MAX_HISTORY_SECONDS * 1000);
    this.tradeHistory.set(
      trade.symbol,
      history.filter(t => t.time > cutoff)
    );
  }

  /**
   * Calculate CVD (Cumulative Volume Delta) for a symbol
   * @param {string} symbol - Trading symbol
   * @param {number} windowSeconds - Time window in seconds
   * @param {number} [offsetSeconds=0] - Offset to look back in time
   * @returns {Promise<number>} CVD value
   */
  async calcCVD(symbol, windowSeconds, offsetSeconds = 0) {
    const history = this.tradeHistory.get(symbol);
    
    if (!history || history.length === 0) {
      return 0;
    }

    const latestTime = history[history.length - 1].time;
    const windowEnd = latestTime - (offsetSeconds * 1000);
    const windowStart = windowEnd - (windowSeconds * 1000);

    const tradesInWindow = history.filter(
      t => t.time >= windowStart && t.time <= windowEnd
    );

    if (tradesInWindow.length === 0) {
      return 0;
    }

    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of tradesInWindow) {
      if (trade.isBuy) {
        buyVolume += trade.qty;
      } else {
        sellVolume += trade.qty;
      }
    }

    return buyVolume - sellVolume;
  }

  /**
   * Get trade history for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Array} Trade history
   */
  getTradeHistory(symbol) {
    return this.tradeHistory.get(symbol) || [];
  }

  /**
   * Clear trade history for a symbol
   * @param {string} symbol - Trading symbol
   */
  clearTradeHistory(symbol) {
    this.tradeHistory.delete(symbol);
  }

  /**
   * Get the number of trades in history for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {number} Trade count
   */
  getTradeCount(symbol) {
    return this.tradeHistory.get(symbol)?.length || 0;
  }
}

export default CVDCalculator;
