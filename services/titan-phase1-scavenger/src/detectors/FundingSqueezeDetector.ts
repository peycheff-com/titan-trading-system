/**
 * Funding Squeeze Detector (Predatory Funding Squeeze)
 *
 * Strategy: Exploit trapped short positions in negative funding environments
 *
 * The Physics:
 * When funding rate is highly negative (shorts pay longs), but price stops dropping,
 * shorts are trapped. They're paying to hold a losing position. This is a "pressure
 * cooker" that builds over hours/minutes. When it pops, it pops hard (10-20%).
 *
 * The Edge:
 * This setup builds over hours, making 200ms latency irrelevant. When the squeeze
 * triggers, you have 30-60 seconds to enter - plenty of time for Bulgaria.
 *
 * Detection Criteria:
 * 1. Funding rate < -0.02% (shorts crowded and paying longs)
 * 2. Price making higher lows on 5m chart (shorts trapped)
 * 3. CVD is rising (whales absorbing short pressure)
 *
 * Entry:
 * - Enter at current price + 0.1%
 * - Target: Recent high + 2% (liquidation cascade)
 * - Stop: Below recent low - 0.5%
 * - Confidence: 90%
 * - Leverage: 15x
 */

import { Tripwire } from '../types/index.js';

interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BybitClient {
  getFundingRate(symbol: string): Promise<number>;
  getCurrentPrice(symbol: string): Promise<number>;
  fetchOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]>;
}

interface CVDCalculator {
  calcCVD(symbol: string, windowSeconds: number, offsetSeconds?: number): Promise<number>;
}

export class FundingSqueezeDetector {
  private bybitClient: BybitClient;
  private cvdCalculator: CVDCalculator;
  private isGeoBlocked: boolean = false;

  constructor(bybitClient: BybitClient | null, cvdCalculator: CVDCalculator) {
    this.bybitClient = bybitClient as any; // Can be null when using titan-execution service
    this.cvdCalculator = cvdCalculator;
  }

  /**
   * Detect Funding Squeeze pattern
   *
   * Returns a Tripwire if all conditions are met:
   * - Funding rate < -0.02% (shorts crowded)
   * - Price making higher lows on 5m chart (shorts trapped)
   * - CVD is rising (whales absorbing)
   */
  async detectSqueeze(symbol: string): Promise<Tripwire | null> {
    if (this.isGeoBlocked) return null;

    try {
      // 1. Get current funding rate
      const fundingRate = await this.bybitClient.getFundingRate(symbol);

      // 2. Check if funding is highly negative (shorts crowded)
      if (fundingRate > -0.0002) {
        // Not negative enough (threshold is -0.02%)
        return null;
      }

      console.log(
        `🔍 Checking funding squeeze: ${symbol} (Funding: ${(fundingRate * 100).toFixed(3)}%)`,
      );

      // 3. Check if price is making higher lows (shorts trapped)
      const ohlcv = await this.bybitClient.fetchOHLCV(symbol, '5m', 20);
      if (ohlcv.length < 3) {
        return null;
      }

      // Get last 3 lows
      const recentLows = ohlcv.slice(-3).map((bar) => bar.low);
      const isHigherLow = recentLows[2] > recentLows[1] && recentLows[1] > recentLows[0];

      if (!isHigherLow) {
        return null;
      }

      // 4. Check if CVD is rising (whales absorbing shorts)
      const cvd = await this.cvdCalculator.calcCVD(symbol, 300); // Last 5 minutes
      const previousCVD = await this.cvdCalculator.calcCVD(symbol, 300, 300); // 5-10 min ago
      const isCVDRising = cvd > previousCVD;

      if (!isCVDRising) {
        return null;
      }

      // 5. Calculate liquidation target (estimate where shorts get liquidated)
      const currentPrice = ohlcv[ohlcv.length - 1].close;
      const recentHigh = Math.max(...ohlcv.slice(-10).map((bar) => bar.high));
      const liquidationTarget = recentHigh * 1.02; // +2% above recent high

      // 6. Calculate stop loss (below recent low)
      const stopLoss = recentLows[2] * 0.995; // -0.5% below recent low

      console.log(`⚡ FUNDING SQUEEZE DETECTED: ${symbol}`);
      console.log(`   Funding Rate: ${(fundingRate * 100).toFixed(3)}%`);
      console.log(
        `   Higher Low: YES (${recentLows[0].toFixed(2)} → ${recentLows[1].toFixed(
          2,
        )} → ${recentLows[2].toFixed(2)})`,
      );
      console.log(`   CVD Rising: YES (${previousCVD.toFixed(0)} → ${cvd.toFixed(0)})`);
      console.log(
        `   Target: ${liquidationTarget.toFixed(2)} (+${(
          (liquidationTarget / currentPrice - 1) *
          100
        ).toFixed(1)}%)`,
      );

      return {
        symbol,
        triggerPrice: currentPrice * 1.001, // Slight markup for entry
        direction: 'LONG',
        trapType: 'FUNDING_SQUEEZE',
        confidence: 90,
        leverage: 15,
        estimatedCascadeSize: 0.1, // 10% squeeze expected
        activated: false,
        targetPrice: liquidationTarget,
        stopLoss: stopLoss,
      };
    } catch (error: any) {
      // Check for Geo-blocking (HTTP 403)
      if (error && (error.message || '').includes('403')) {
        if (!this.isGeoBlocked) {
          console.warn(
            `⛔ Geo-blocking detected for ${symbol} (HTTP 403). Disabling FundingSqueezeDetector.`,
          );
          this.isGeoBlocked = true;
        }
        return null;
      }

      console.error(`Error detecting funding squeeze for ${symbol}:`, error);
      return null;
    }
  }
}
