/**
 * Latency Model - Bulgaria Tax
 *
 * Applies latency penalty and slippage model to simulated executions.
 * This models the real-world impact of geographic distance to exchange servers
 * and market microstructure effects on execution quality.
 *
 * Implementation: Task 7
 * Requirements: 3.6
 */

import { OHLCV } from '../types/index.js';

export class LatencyModel {
  private baseLatency: number;

  /**
   * Create a new LatencyModel
   * @param baseLatencyMs - Base latency in milliseconds (default 200ms for Bulgaria)
   */
  constructor(baseLatencyMs = 200) {
    this.baseLatency = baseLatencyMs;
  }

  /**
   * Apply latency penalty to execution price
   *
   * Finds the price at timestamp + latency to simulate delayed execution.
   * This accounts for the "Bulgaria Tax" - the price movement that occurs
   * between signal generation and order arrival at the exchange.
   *
   * @param idealEntry - The ideal entry price at signal time
   * @param marketData - OHLCV data array sorted by timestamp ascending
   * @param timestamp - The timestamp of the signal (in milliseconds)
   * @returns The adjusted entry price after latency penalty
   */
  applyLatencyPenalty(idealEntry: number, marketData: OHLCV[], timestamp: number): number {
    if (marketData.length === 0) {
      return idealEntry;
    }

    // Calculate the delayed timestamp
    const delayedTimestamp = timestamp + this.baseLatency;

    // Find the price at the delayed timestamp
    const delayedPrice = this.interpolatePrice(marketData, delayedTimestamp);

    // If we couldn't find a valid price, return the ideal entry
    if (delayedPrice === null || isNaN(delayedPrice)) {
      return idealEntry;
    }

    return delayedPrice;
  }

  /**
   * Calculate slippage based on ATR and liquidity state
   *
   * Slippage increases with:
   * - Higher volatility (ATR)
   * - Lower liquidity
   * - Larger order sizes
   *
   * @param orderSize - The order size in base currency
   * @param atr - Average True Range (volatility measure)
   * @param liquidityState - Liquidity state: 0=Low, 1=Normal, 2=High
   * @returns The slippage amount as a price delta
   */
  calculateSlippage(orderSize: number, atr: number, liquidityState: number): number {
    // Handle edge cases
    if (atr <= 0 || orderSize <= 0) {
      return 0;
    }

    // Base slippage from ATR (10% of ATR as baseline)
    let slippage = atr * 0.1;

    // Liquidity multiplier
    // Low liquidity (0) = 2x slippage
    // Normal liquidity (1) = 1x slippage
    // High liquidity (2) = 0.5x slippage
    const liquidityMultiplier = this.getLiquidityMultiplier(liquidityState);
    slippage *= liquidityMultiplier;

    // Size impact: larger orders have more market impact
    // Using log scale to model diminishing marginal impact
    // Base reference is $1000 order size
    const sizeMultiplier = Math.max(1, Math.log10(orderSize / 1000) + 1);
    slippage *= sizeMultiplier;

    return slippage;
  }

  /**
   * Interpolate price at a specific timestamp from OHLCV data
   *
   * Uses linear interpolation between candles when the exact timestamp
   * falls between two data points. For timestamps within a candle,
   * interpolates between open and close.
   *
   * @param marketData - OHLCV data array sorted by timestamp ascending
   * @param timestamp - The target timestamp to find price for
   * @returns The interpolated price, or null if data is insufficient
   */
  interpolatePrice(marketData: OHLCV[], timestamp: number): number | null {
    if (marketData.length === 0) {
      return null;
    }

    // Sort data by timestamp to ensure correct ordering
    const sortedData = [...marketData].sort((a, b) => a.timestamp - b.timestamp);

    // If timestamp is before all data, return first open
    if (timestamp <= sortedData[0].timestamp) {
      return sortedData[0].open;
    }

    // If timestamp is after all data, return last close
    if (timestamp >= sortedData[sortedData.length - 1].timestamp) {
      return sortedData[sortedData.length - 1].close;
    }

    // Find the candle that contains or precedes the timestamp
    let prevCandle: OHLCV | null = null;
    let nextCandle: OHLCV | null = null;

    for (let i = 0; i < sortedData.length; i++) {
      const candle = sortedData[i];

      // Exact match
      if (candle.timestamp === timestamp) {
        return candle.open;
      }

      // Find bracketing candles
      if (candle.timestamp < timestamp) {
        prevCandle = candle;
      } else if (candle.timestamp > timestamp && nextCandle === null) {
        nextCandle = candle;
        break;
      }
    }

    // If we have both candles, interpolate between them
    if (prevCandle && nextCandle) {
      return this.linearInterpolate(
        prevCandle.timestamp,
        prevCandle.close,
        nextCandle.timestamp,
        nextCandle.open,
        timestamp,
      );
    }

    // Fallback: return the previous candle's close
    if (prevCandle) {
      return prevCandle.close;
    }

    return null;
  }

  /**
   * Get base latency in milliseconds
   */
  getBaseLatency(): number {
    return this.baseLatency;
  }

  /**
   * Set base latency in milliseconds
   * @param latencyMs - New latency value
   */
  setBaseLatency(latencyMs: number): void {
    if (latencyMs < 0) {
      throw new Error('Latency cannot be negative');
    }
    this.baseLatency = latencyMs;
  }

  /**
   * Get liquidity multiplier based on liquidity state
   * @param liquidityState - 0=Low, 1=Normal, 2=High
   * @returns Multiplier for slippage calculation
   */
  private getLiquidityMultiplier(liquidityState: number): number {
    switch (liquidityState) {
      case 0: // Low liquidity - double slippage
        return 2.0;
      case 1: // Normal liquidity - baseline
        return 1.0;
      case 2: // High liquidity - half slippage
        return 0.5;
      default:
        // Default to normal liquidity for unknown states
        return 1.0;
    }
  }

  /**
   * Linear interpolation between two points
   * @param x1 - First x value (timestamp)
   * @param y1 - First y value (price)
   * @param x2 - Second x value (timestamp)
   * @param y2 - Second y value (price)
   * @param x - Target x value to interpolate
   * @returns Interpolated y value
   */
  private linearInterpolate(x1: number, y1: number, x2: number, y2: number, x: number): number {
    // Avoid division by zero
    if (x2 === x1) {
      return y1;
    }

    const t = (x - x1) / (x2 - x1);
    return y1 + t * (y2 - y1);
  }
}
