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
 * The Edge:
 * You don't catch the falling knife. You wait for the "Pop." Recovery takes 5-15
 * minutes - plenty of time for Bulgaria (200ms latency).
 *
 * Detection Criteria:
 * 1. Price drop > 3% in last 5 minutes
 * 2. Open Interest drop > 20% in last 5 minutes
 * 3. CVD flips from red to green (buying pressure returning)
 *
 * Entry:
 * - Immediate entry when all conditions met
 * - Target: 50% retracement of the dump
 * - Stop: -2% from entry
 * - Confidence: 95%
 * - Leverage: 20x
 */

import { Tripwire } from '../types/index.js';

interface OIHistoryPoint {
  oi: number;
  timestamp: number;
}

interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BybitClient {
  getOpenInterest(symbol: string): Promise<number>;
  getCurrentPrice(symbol: string): Promise<number>;
  fetchOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]>;
}

interface CVDCalculator {
  calcCVD(symbol: string, windowSeconds: number): Promise<number>;
}

export class OIWipeoutDetector {
  private oiHistory: Map<string, OIHistoryPoint[]> = new Map();
  private bybitClient: BybitClient;
  private cvdCalculator: CVDCalculator;
  private isGeoBlocked: boolean = false;

  constructor(bybitClient: BybitClient | null, cvdCalculator: CVDCalculator) {
    this.bybitClient = bybitClient as any; // Can be null when using titan-execution service
    this.cvdCalculator = cvdCalculator;
  }

  /**
   * Detect OI Wipeout pattern
   *
   * Returns a Tripwire if all conditions are met:
   * - Price dropped > 3% in last 5 minutes
   * - Open Interest dropped > 20% in last 5 minutes
   * - CVD is positive (buying pressure returning)
   */
  async detectWipeout(symbol: string): Promise<Tripwire | null> {
    if (this.isGeoBlocked) return null;

    try {
      // 1. Get current Open Interest
      const currentOI = await this.bybitClient.getOpenInterest(symbol);
      const currentPrice = await this.bybitClient.getCurrentPrice(symbol);

      // 2. Get OI from 5 minutes ago
      const history = this.oiHistory.get(symbol) || [];
      const fiveMinAgo = history.find((h) => Date.now() - h.timestamp >= 300000);

      if (!fiveMinAgo) {
        // Not enough history yet
        return null;
      }

      // 3. Calculate OI drop %
      const oiDrop = (fiveMinAgo.oi - currentOI) / fiveMinAgo.oi;

      // 4. Calculate price drop %
      const priceHistory = await this.bybitClient.fetchOHLCV(symbol, '1m', 5);
      if (priceHistory.length < 5) {
        return null;
      }

      const priceStart = priceHistory[0].close;
      const priceDrop = (priceStart - currentPrice) / priceStart;

      // 5. Check conditions
      const isPriceDump = priceDrop > 0.03; // > 3% drop
      const isOIWipeout = oiDrop > 0.2; // > 20% OI drop

      if (!isPriceDump || !isOIWipeout) {
        return null;
      }

      // 6. Check CVD flip (Red → Green)
      const cvd = await this.cvdCalculator.calcCVD(symbol, 60); // Last 1 minute
      const isCVDGreen = cvd > 0; // Buying pressure returning

      if (!isCVDGreen) {
        return null;
      }

      // 7. Calculate retracement target (50% of dump)
      const dumpSize = priceStart - currentPrice;
      const targetPrice = currentPrice + dumpSize * 0.5;

      console.log(`💀 OI WIPEOUT DETECTED: ${symbol}`);
      console.log(`   Price Drop: ${(priceDrop * 100).toFixed(1)}%`);
      console.log(`   OI Drop: ${(oiDrop * 100).toFixed(1)}%`);
      console.log(`   CVD: ${cvd > 0 ? 'GREEN' : 'RED'}`);
      console.log(
        `   Target: ${targetPrice.toFixed(2)} (+${((targetPrice / currentPrice - 1) * 100).toFixed(
          1,
        )}%)`,
      );

      return {
        symbol,
        triggerPrice: currentPrice, // Enter immediately
        direction: 'LONG',
        trapType: 'OI_WIPEOUT',
        confidence: 95,
        leverage: 20,
        estimatedCascadeSize: 0.05, // 5% bounce expected
        activated: false,
        targetPrice,
        stopLoss: currentPrice * 0.98, // -2% stop
      };
    } catch (error: any) {
      // Check for Geo-blocking (HTTP 403)
      if (error && (error.message || '').includes('403')) {
        if (!this.isGeoBlocked) {
          console.warn(
            `⛔ Geo-blocking detected for ${symbol} (HTTP 403). Disabling OIWipeoutDetector.`,
          );
          this.isGeoBlocked = true;
        }
        return null;
      }

      console.error(`Error detecting OI wipeout for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Record Open Interest for historical tracking
   *
   * Call this method periodically (e.g., every minute) to build up
   * the OI history needed for wipeout detection.
   *
   * Keeps only the last 10 minutes of history.
   */
  recordOI(symbol: string, oi: number): void {
    if (!this.oiHistory.has(symbol)) {
      this.oiHistory.set(symbol, []);
    }

    const history = this.oiHistory.get(symbol)!;
    history.push({ oi, timestamp: Date.now() });

    // Keep only last 10 minutes
    const cutoff = Date.now() - 600000;
    this.oiHistory.set(
      symbol,
      history.filter((h) => h.timestamp > cutoff),
    );
  }

  /**
   * Get the current OI history for a symbol (for testing/debugging)
   */
  getOIHistory(symbol: string): OIHistoryPoint[] {
    return this.oiHistory.get(symbol) || [];
  }

  /**
   * Clear OI history for a symbol (for testing)
   */
  clearOIHistory(symbol: string): void {
    this.oiHistory.delete(symbol);
  }
}
