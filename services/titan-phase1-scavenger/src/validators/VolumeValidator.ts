/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * VolumeValidator
 *
 * Validates breakout signals by tracking trade count in 100ms windows.
 * Requires minimum 50 trades for validation to distinguish real breakouts from fake-outs.
 *
 * Requirements: 3.4-3.5 (Volume Validation)
 */

interface VolumeCounter {
  count: number;
  startTime: number;
}

export class VolumeValidator {
  private volumeCounters: Map<string, VolumeCounter> = new Map();
  private readonly WINDOW_MS: number = 100;
  private readonly MIN_TRADES: number = 50;

  /**
   * Validate volume for a symbol by tracking trades in 100ms window
   *
   * @param symbol - Trading symbol (e.g., 'BTCUSDT')
   * @param tradeCount - Number of trades in current tick
   * @returns true if validation succeeds (>= 50 trades in 100ms), false otherwise
   */
  validateVolume(symbol: string, tradeCount: number): boolean {
    // Get or create counter for this symbol
    let counter = this.volumeCounters.get(symbol);

    if (!counter) {
      // Start new counter
      counter = {
        count: tradeCount,
        startTime: Date.now(),
      };
      this.volumeCounters.set(symbol, counter);
      return false; // Not enough time elapsed yet
    }

    // Add trades to counter
    counter.count += tradeCount;

    // Check if 100ms window has elapsed
    const elapsed = Date.now() - counter.startTime;

    if (elapsed >= this.WINDOW_MS) {
      // Window complete - check if validation passes
      const isValid = counter.count >= this.MIN_TRADES;

      // Reset counter after validation
      this.volumeCounters.delete(symbol);

      return isValid;
    }

    // Window not complete yet
    return false;
  }

  /**
   * Reset counter for a specific symbol
   * Useful for manual cleanup or testing
   *
   * @param symbol - Trading symbol to reset
   */
  resetCounter(symbol: string): void {
    this.volumeCounters.delete(symbol);
  }

  /**
   * Reset all counters
   * Useful for cleanup or testing
   */
  resetAllCounters(): void {
    this.volumeCounters.clear();
  }

  /**
   * Get current counter state for a symbol (for debugging/monitoring)
   *
   * @param symbol - Trading symbol
   * @returns Counter state or null if no counter exists
   */
  getCounterState(symbol: string): { count: number; elapsed: number } | null {
    const counter = this.volumeCounters.get(symbol);
    if (!counter) return null;

    return {
      count: counter.count,
      elapsed: Date.now() - counter.startTime,
    };
  }

  /**
   * Get configuration values (for testing/monitoring)
   */
  getConfig(): { windowMs: number; minTrades: number } {
    return {
      windowMs: this.WINDOW_MS,
      minTrades: this.MIN_TRADES,
    };
  }
}
