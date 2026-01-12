/**
 * CVDValidator - Order Flow X-Ray (CVD Absorption Detection)
 *
 * Purpose: Confirm reversals by detecting limit order absorption
 *
 * Key Features:
 * - Calculate Cumulative Volume Delta from tick-level trades
 * - Detect CVD Absorption (price Lower Low, CVD Higher Low)
 * - Detect CVD Distribution (price Higher High, CVD Lower High)
 * - Validate POIs with CVD confirmation
 * - Maintain 10-minute trade history for analysis
 *
 * Requirements: 4.1-4.7 (Order Flow X-Ray)
 */

import { EventEmitter } from "events";
import { Absorption, Distribution, POI } from "../types";

export interface CVDTrade {
  symbol: string;
  price: number;
  qty: number;
  time: number;
  isBuyerMaker: boolean; // true = sell order hit buy limit, false = buy order hit sell limit
}

export class CVDValidator extends EventEmitter {
  private tradeHistory: Map<string, CVDTrade[]> = new Map();
  private readonly HISTORY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private readonly CVD_WINDOW_MS = 5 * 60 * 1000; // 5 minutes for CVD calculation

  constructor() {
    super();
  }

  /**
   * Calculate Cumulative Volume Delta for a symbol
   * CVD = Sum of (Buy Volume - Sell Volume) over time window
   *
   * @param trades - Array of trades for calculation
   * @param windowMs - Time window in milliseconds (default: 5 minutes)
   * @returns CVD value (positive = net buying, negative = net selling)
   */
  calcCVD(trades: CVDTrade[], windowMs: number = this.CVD_WINDOW_MS): number {
    const cutoff = Date.now() - windowMs;
    const recentTrades = trades.filter((t) => t.time > cutoff);

    let cvd = 0;
    for (const trade of recentTrades) {
      const volume = trade.qty * trade.price; // Dollar volume

      if (trade.isBuyerMaker) {
        // Buyer is maker = sell order hit buy limit = selling pressure
        cvd -= volume;
      } else {
        // Seller is maker = buy order hit sell limit = buying pressure
        cvd += volume;
      }
    }

    return cvd;
  }

  /**
   * Detect CVD Absorption pattern
   * Pattern: Price makes Lower Low but CVD makes Higher Low
   * Indicates: Limit buy orders absorbing market sells (bullish reversal signal)
   *
   * @param prices - Array of recent prices (at least 3 values)
   * @param cvdValues - Array of corresponding CVD values
   * @returns Absorption object if pattern detected, null otherwise
   */
  detectAbsorption(prices: number[], cvdValues: number[]): Absorption | null {
    if (prices.length < 3 || cvdValues.length < 3) {
      return null;
    }

    // Get last 3 values for pattern detection
    const p1 = prices[prices.length - 3];
    const p2 = prices[prices.length - 2];
    const p3 = prices[prices.length - 1];

    const cvd1 = cvdValues[cvdValues.length - 3];
    const cvd2 = cvdValues[cvdValues.length - 2];
    const cvd3 = cvdValues[cvdValues.length - 1];

    // Check for price Lower Low pattern
    const priceLowerLow = p3 < p2 && p2 < p1;

    // Check for CVD Higher Low pattern
    const cvdHigherLow = cvd3 > cvd2 && cvd2 < cvd1;

    if (priceLowerLow && cvdHigherLow) {
      // Calculate absorption strength based on divergence magnitude
      const priceDrop = Math.abs((p1 - p3) / p1);
      const cvdRise = Math.abs((cvd3 - cvd2) / Math.max(Math.abs(cvd2), 1));
      const strength = Math.min(100, (priceDrop + cvdRise) * 50);

      console.log(
        `🔍 CVD Absorption detected: Price LL ${p3.toFixed(2)}, CVD HL ${
          cvd3.toFixed(0)
        }, Strength: ${strength.toFixed(1)}`,
      );

      const absorption: Absorption = {
        price: p3,
        cvdValue: cvd3,
        timestamp: Date.now(),
        confidence: strength,
      };

      // Emit absorption event
      this.emit("absorption", absorption);

      return absorption;
    }

    return null;
  }

  /**
   * Detect CVD Distribution pattern
   * Pattern: Price makes Higher High but CVD makes Lower High
   * Indicates: Limit sell orders absorbing market buys (bearish reversal signal)
   *
   * @param prices - Array of recent prices (at least 3 values)
   * @param cvdValues - Array of corresponding CVD values
   * @returns Distribution object if pattern detected, null otherwise
   */
  detectDistribution(
    prices: number[],
    cvdValues: number[],
  ): Distribution | null {
    if (prices.length < 3 || cvdValues.length < 3) {
      return null;
    }

    // Get last 3 values for pattern detection
    const p1 = prices[prices.length - 3];
    const p2 = prices[prices.length - 2];
    const p3 = prices[prices.length - 1];

    const cvd1 = cvdValues[cvdValues.length - 3];
    const cvd2 = cvdValues[cvdValues.length - 2];
    const cvd3 = cvdValues[cvdValues.length - 1];

    // Check for price Higher High pattern
    const priceHigherHigh = p3 > p2 && p2 > p1;

    // Check for CVD Lower High pattern
    const cvdLowerHigh = cvd3 < cvd2 && cvd2 > cvd1;

    if (priceHigherHigh && cvdLowerHigh) {
      // Calculate distribution strength based on divergence magnitude
      const priceRise = Math.abs((p3 - p1) / p1);
      const cvdDrop = Math.abs((cvd2 - cvd3) / Math.max(Math.abs(cvd2), 1));
      const strength = Math.min(100, (priceRise + cvdDrop) * 50);

      console.log(
        `🔍 CVD Distribution detected: Price HH ${p3.toFixed(2)}, CVD LH ${
          cvd3.toFixed(0)
        }, Strength: ${strength.toFixed(1)}`,
      );

      const distribution: Distribution = {
        price: p3,
        cvdValue: cvd3,
        timestamp: Date.now(),
        confidence: strength,
      };

      // Emit distribution event
      this.emit("distribution", distribution);

      return distribution;
    }

    return null;
  }

  /**
   * Validate POI with CVD confirmation
   * Adjusts POI confidence based on CVD absorption/distribution signals
   *
   * @param poi - Point of Interest to validate
   * @param absorption - Absorption signal (if any)
   * @param distribution - Distribution signal (if any)
   * @returns Confidence adjustment (-30 to +30)
   */
  validateWithCVD(
    poi: POI,
    absorption: Absorption | null = null,
    distribution: Distribution | null = null,
  ): number {
    let confidenceAdjustment = 0;

    // Check if POI type matches CVD signal
    if ("type" in poi) {
      // For Bullish POIs (Order Blocks, FVGs)
      if (poi.type === "BULLISH") {
        if (absorption) {
          // Bullish POI + CVD Absorption = Strong confirmation
          confidenceAdjustment += 30;
          console.log(`✅ CVD validates Bullish POI: +30 confidence`);
        } else if (distribution) {
          // Bullish POI + CVD Distribution = Conflicting signal
          confidenceAdjustment -= 20;
          console.log(`❌ CVD conflicts with Bullish POI: -20 confidence`);
        }
      }

      // For Bearish POIs (Order Blocks, FVGs)
      if (poi.type === "BEARISH") {
        if (distribution) {
          // Bearish POI + CVD Distribution = Strong confirmation
          confidenceAdjustment += 30;
          console.log(`✅ CVD validates Bearish POI: +30 confidence`);
        } else if (absorption) {
          // Bearish POI + CVD Absorption = Conflicting signal
          confidenceAdjustment -= 20;
          console.log(`❌ CVD conflicts with Bearish POI: -20 confidence`);
        }
      }
    }

    // For Liquidity Pools, any CVD divergence adds confidence
    if ("strength" in poi && (absorption || distribution)) {
      confidenceAdjustment += 15;
      console.log(`✅ CVD confirms Liquidity Pool: +15 confidence`);
    }

    return confidenceAdjustment;
  }

  /**
   * Record a trade for CVD calculation
   * Maintains 10-minute rolling history per symbol
   *
   * @param trade - Trade data to record
   */
  recordTrade(trade: CVDTrade): void {
    if (!this.tradeHistory.has(trade.symbol)) {
      this.tradeHistory.set(trade.symbol, []);
    }

    const history = this.tradeHistory.get(trade.symbol)!;
    history.push(trade);

    // Keep only trades within the history window (10 minutes)
    const cutoff = Date.now() - this.HISTORY_WINDOW_MS;
    const filteredHistory = history.filter((t) => t.time > cutoff);

    this.tradeHistory.set(trade.symbol, filteredHistory);

    // Log if history is getting large (performance monitoring)
    if (filteredHistory.length > 10000) {
      console.warn(
        `⚠️ Large trade history for ${trade.symbol}: ${filteredHistory.length} trades`,
      );
    }
  }

  /**
   * Get trade history for a symbol
   *
   * @param symbol - Symbol to get history for
   * @param windowMs - Time window (default: full history window)
   * @returns Array of trades within the time window
   */
  getTradeHistory(
    symbol: string,
    windowMs: number = this.HISTORY_WINDOW_MS,
  ): CVDTrade[] {
    const history = this.tradeHistory.get(symbol) || [];
    const cutoff = Date.now() - windowMs;
    return history.filter((t) => t.time > cutoff);
  }

  /**
   * Get current CVD value for a symbol
   *
   * @param symbol - Symbol to calculate CVD for
   * @param windowMs - Time window for calculation (default: 5 minutes)
   * @returns Current CVD value
   */
  getCurrentCVD(symbol: string, windowMs: number = this.CVD_WINDOW_MS): number {
    const trades = this.getTradeHistory(symbol, windowMs);
    // Don't pass windowMs again since trades are already filtered
    let cvd = 0;
    for (const trade of trades) {
      const volume = trade.qty * trade.price; // Dollar volume

      if (trade.isBuyerMaker) {
        // Buyer is maker = sell order hit buy limit = selling pressure
        cvd -= volume;
      } else {
        // Seller is maker = buy order hit sell limit = buying pressure
        cvd += volume;
      }
    }

    return cvd;
  }

  /**
   * Clear trade history for a symbol (cleanup)
   *
   * @param symbol - Symbol to clear history for
   */
  clearHistory(symbol: string): void {
    this.tradeHistory.delete(symbol);
  }

  /**
   * Get statistics about trade history
   *
   * @returns Object with history statistics
   */
  getHistoryStats(): {
    totalSymbols: number;
    totalTrades: number;
    memoryUsage: string;
  } {
    let totalTrades = 0;
    for (const history of this.tradeHistory.values()) {
      totalTrades += history.length;
    }

    const memoryUsage = `${(totalTrades * 64 / 1024).toFixed(1)} KB`; // Rough estimate

    return {
      totalSymbols: this.tradeHistory.size,
      totalTrades,
      memoryUsage,
    };
  }
}
