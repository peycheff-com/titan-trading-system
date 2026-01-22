/**
 * VelocityCalculator - Calculate price velocity for order type selection
 *
 * CRITICAL: Uses exchange timestamps (NOT Date.now()) to prevent velocity noise
 * from network jitter and clock drift.
 *
 * Requirements: 4.2-4.4 (Velocity-Based Order Type), Robustness #2
 */

interface PricePoint {
  price: number;
  timestamp: number; // Exchange timestamp in milliseconds
}

export class VelocityCalculator {
  private priceHistory: Map<string, PricePoint[]> = new Map();

  /**
   * Record a price point with exchange timestamp
   *
   * @param symbol - Trading symbol (e.g., 'BTCUSDT')
   * @param price - Current price
   * @param exchangeTime - Exchange timestamp in milliseconds (NOT Date.now())
   *
   * CRITICAL: exchangeTime MUST be from exchange data, not local clock
   * This prevents velocity noise from network jitter and clock drift
   */
  recordPrice(symbol: string, price: number, exchangeTime: number): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }

    const history = this.priceHistory.get(symbol)!;
    history.push({ price, timestamp: exchangeTime });

    // Keep only last 10 seconds (based on exchange time)
    const cutoff = exchangeTime - 10000;
    this.priceHistory.set(
      symbol,
      history.filter((h) => h.timestamp > cutoff),
    );
  }

  /**
   * Calculate price velocity (% change per second over last 5 seconds)
   *
   * @param symbol - Trading symbol
   * @returns Absolute velocity value (e.g., 0.005 = 0.5%/s)
   *
   * Velocity determines order type:
   * - > 0.5%/s (0.005) → Market Order
   * - 0.1-0.5%/s (0.001-0.005) → Aggressive Limit (Ask + 0.2%)
   * - < 0.1%/s (0.001) → Limit (Ask)
   */
  calcVelocity(symbol: string): number {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length < 2) {
      return 0;
    }

    // Get most recent timestamp
    const latestTimestamp = history[history.length - 1].timestamp;
    const fiveSecondsAgo = latestTimestamp - 5000;

    // Filter to last 5 seconds
    const recentPrices = history.filter((h) => h.timestamp >= fiveSecondsAgo);
    if (recentPrices.length < 2) {
      return 0;
    }

    // Calculate velocity using oldest and newest prices in 5s window
    const oldestPrice = recentPrices[0].price;
    const newestPrice = recentPrices[recentPrices.length - 1].price;
    const timeDiffSeconds =
      (recentPrices[recentPrices.length - 1].timestamp - recentPrices[0].timestamp) / 1000;

    // Avoid division by zero
    if (timeDiffSeconds === 0) {
      return 0;
    }

    // Calculate % change per second
    const priceChange = (newestPrice - oldestPrice) / oldestPrice;
    const velocity = priceChange / timeDiffSeconds;

    // Return absolute value (direction doesn't matter for order type selection)
    return Math.abs(velocity);
  }

  /**
   * Clear price history for a symbol
   * Useful for cleanup or testing
   */
  clearHistory(symbol: string): void {
    this.priceHistory.delete(symbol);
  }

  /**
   * Get current history size for a symbol
   * Useful for debugging
   */
  getHistorySize(symbol: string): number {
    return this.priceHistory.get(symbol)?.length || 0;
  }

  /**
   * Get the most recent price for a symbol
   * Used for trap validation after PREPARE signal
   *
   * @param symbol - Trading symbol
   * @returns Most recent price or null if no history
   */
  getLastPrice(symbol: string): number | null {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length === 0) {
      return null;
    }

    return history[history.length - 1].price;
  }

  /**
   * Calculate Acceleration (Rate of change of velocity)
   *
   * Used for "Knife-Catch Protection".
   * If Acceleration > 0, the move is speeding up. DO NOT ENTER.
   * If Acceleration < 0, the move is slowing down (decelerating). SAFE TO ENTER.
   *
   * @param symbol
   * @returns Acceleration value (positive = speeding up, negative = slowing down)
   */
  getAcceleration(symbol: string): number {
    const history = this.priceHistory.get(symbol);
    if (!history || history.length < 4) return 0;

    // We need at least 2 velocity points to calculate acceleration
    // Vel 1: t-2 to t-1
    // Vel 2: t-1 to t0

    const p0 = history[history.length - 1]; // Current
    const p1 = history[history.length - 2];
    const p2 = history[history.length - 3];

    const timeDiff1 = (p0.timestamp - p1.timestamp) / 1000;
    const timeDiff2 = (p1.timestamp - p2.timestamp) / 1000;

    if (timeDiff1 <= 0 || timeDiff2 <= 0) return 0;

    const vel1 = Math.abs((p0.price - p1.price) / p1.price) / timeDiff1;
    const vel2 = Math.abs((p1.price - p2.price) / p2.price) / timeDiff2;

    // Acceleration = Delta Velocity / Delta Time
    // roughly (vel1 - vel2) / ((t1+t2)/2)

    const acceleration = vel1 - vel2; // Simple difference is enough for sign detection
    return acceleration;
  }
}
