/**
 * CVD (Cumulative Volume Delta) Calculator
 *
 * Purpose: Track buy volume - sell volume over time windows
 *
 * CVD is a critical indicator for detecting institutional flow:
 * - Positive CVD = Net buying pressure (whales accumulating)
 * - Negative CVD = Net selling pressure (whales distributing)
 *
 * Used by:
 * - OIWipeoutDetector: Detect when CVD flips from red to green (buying returns)
 * - FundingSqueezeDetector: Detect when CVD is rising (whales absorbing shorts)
 * - BasisArbDetector: Validate that volume is real, not wash trading
 *
 * Key Features:
 * - Variable time windows (60s, 300s, 600s)
 * - Offset support for comparing historical CVD
 * - Uses exchange timestamps (not Date.now()) to avoid clock drift
 */
export class CVDCalculator {
    tradeHistory = new Map();
    MAX_HISTORY_SECONDS = 600; // Keep 10 minutes of history
    /**
     * Record a trade for CVD calculation
     *
     * Call this method for every trade received from the exchange WebSocket.
     *
     * @param trade - Trade data from exchange
     */
    recordTrade(trade) {
        if (!this.tradeHistory.has(trade.symbol)) {
            this.tradeHistory.set(trade.symbol, []);
        }
        const history = this.tradeHistory.get(trade.symbol);
        // Add trade to history
        // isBuyerMaker = false means the buyer was the aggressor (market buy = bullish)
        // isBuyerMaker = true means the seller was the aggressor (market sell = bearish)
        history.push({
            qty: trade.qty,
            time: trade.time,
            isBuy: !trade.isBuyerMaker, // Invert: buyer aggressor = buy
        });
        // Keep only last MAX_HISTORY_SECONDS
        const cutoff = trade.time - (this.MAX_HISTORY_SECONDS * 1000);
        this.tradeHistory.set(trade.symbol, history.filter((t) => t.time > cutoff));
    }
    /**
     * Calculate CVD (Cumulative Volume Delta) for a symbol
     *
     * CVD = Sum(Buy Volume) - Sum(Sell Volume)
     *
     * @param symbol - Trading symbol (e.g., 'BTCUSDT')
     * @param windowSeconds - Time window in seconds (e.g., 60, 300, 600)
     * @param offsetSeconds - Optional offset to look back in time (for comparing historical CVD)
     * @returns CVD value (positive = net buying, negative = net selling)
     *
     * @example
     * // Get CVD for last 5 minutes
     * const cvd = await calculator.calcCVD('BTCUSDT', 300);
     *
     * @example
     * // Get CVD from 5-10 minutes ago (for comparison)
     * const previousCVD = await calculator.calcCVD('BTCUSDT', 300, 300);
     */
    async calcCVD(symbol, windowSeconds, offsetSeconds = 0) {
        const history = this.tradeHistory.get(symbol);
        if (!history || history.length === 0) {
            return 0;
        }
        // Get the most recent timestamp
        const latestTime = history[history.length - 1].time;
        // Calculate time window boundaries
        // windowEnd is the end of the time window (most recent point)
        // If offset is 0, windowEnd = latestTime (now)
        // If offset is 300, windowEnd = latestTime - 300s (5 minutes ago)
        const windowEnd = latestTime - (offsetSeconds * 1000);
        const windowStart = windowEnd - (windowSeconds * 1000);
        // Filter trades within the time window
        // Use <= for windowEnd to include trades at the exact boundary
        const tradesInWindow = history.filter((t) => t.time >= windowStart && t.time <= windowEnd);
        if (tradesInWindow.length === 0) {
            return 0;
        }
        // Calculate CVD: Buy Volume - Sell Volume
        let buyVolume = 0;
        let sellVolume = 0;
        for (const trade of tradesInWindow) {
            if (trade.isBuy) {
                buyVolume += trade.qty;
            }
            else {
                sellVolume += trade.qty;
            }
        }
        const cvd = buyVolume - sellVolume;
        return cvd;
    }
    /**
     * Get trade history for a symbol (for testing/debugging)
     */
    getTradeHistory(symbol) {
        return this.tradeHistory.get(symbol) || [];
    }
    /**
     * Clear trade history for a symbol (for testing)
     */
    clearTradeHistory(symbol) {
        this.tradeHistory.delete(symbol);
    }
    /**
     * Get the number of trades in history for a symbol
     */
    getTradeCount(symbol) {
        return this.tradeHistory.get(symbol)?.length || 0;
    }
}
//# sourceMappingURL=CVDCalculator.js.map