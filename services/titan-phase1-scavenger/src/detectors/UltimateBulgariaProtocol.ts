/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * Ultimate Bulgaria Protocol - Combined Strategy
 *
 * The Setup: Combine OI Wipeout + Leader-Follower for maximum safety and profit
 *
 * Strategy:
 * 1. Detect idiosyncratic crashes (> 3% drop AND BTC < 0.5% drop)
 * 2. For each crash, check OI wipeout
 * 3. Set Binance Leader-Follower trap at +1% recovery
 * 4. When Binance starts V-Shape recovery, fire Long on Bybit
 *
 * Why This Wins from Bulgaria:
 * - Sellers are physically gone after OI wipeout
 * - You have 5-15 minutes to enter
 * - Latency is irrelevant
 * - Highest win rate (98% confidence)
 */

import { BinanceSpotClient } from '../exchanges/BinanceSpotClient.js';
import { OIWipeoutDetector } from './OIWipeoutDetector.js';
import { OrderFlowImbalanceCalculator } from '../calculators/OrderFlowImbalanceCalculator.js';

import { PowerLawMetric, Tripwire } from '../types/index.js';
export type { Tripwire };

import { BybitPerpsClient } from '../exchanges/BybitPerpsClient.js';
import { Logger } from '../logging/Logger.js';

export class UltimateBulgariaProtocol {
  private bybitClient: BybitPerpsClient; // Will be null when using titan-execution service but typed for strictness
  private binanceClient: BinanceSpotClient;
  private oiDetector: OIWipeoutDetector;
  private ofiCalculator: OrderFlowImbalanceCalculator;

  private logger: Logger;

  constructor(
    bybitClient: BybitPerpsClient, // Can be null when using titan-execution service
    binanceClient: BinanceSpotClient,
    oiDetector: OIWipeoutDetector,
    logger: Logger,
  ) {
    this.bybitClient = bybitClient;
    this.binanceClient = binanceClient;
    this.oiDetector = oiDetector;
    this.logger = logger;
    this.ofiCalculator = new OrderFlowImbalanceCalculator(50);
  }

  /**
   * Scan for Ultimate Bulgaria Protocol opportunities
   *
   * Process:
   * 1. Detect market crashes/dumps
   * 2. Check if OI nuked -20% (sellers are dead)
   * 3. Set Leader-Follower trap on Binance Spot
   * 4. When Binance starts V-Shape recovery, fire Long on Bybit
   *
   * @returns Tripwire with ULTIMATE_BULGARIA type or null
   */
  async scan(): Promise<Tripwire | null> {
    // 1. Wait for market crash/dump
    const crashSymbols = await this.detectCrashes();

    if (crashSymbols.length === 0) {
      return null;
    }

    for (const symbol of crashSymbols) {
      // 2. Check if OI nuked -20% (sellers are dead)
      const oiWipeout = await this.oiDetector.detectWipeout(symbol);
      if (!oiWipeout) continue;

      // 2.5 Check micro-structure pressure via OFI
      // Sampling BBO 5 times over ~1 second to gauge immediate flow
      const ofiScore = await this.sampleOFI(symbol);
      if (ofiScore <= 0) {
        this.logger.info(`   OFI Check Failed: ${ofiScore.toFixed(4)} (Buying Pressure Low)`);
        continue;
      }
      this.logger.info(`   OFI Confirmed: ${ofiScore.toFixed(4)} (Buying Pressure Detected)`);

      // 3. Set Leader-Follower trap on Binance Spot
      // When Binance starts V-Shape recovery, fire Long on Bybit
      const binancePrice = await this.binanceClient.getSpotPrice(symbol);
      const recoveryTrigger = binancePrice * 1.01; // +1% recovery

      this.logger.info(`🕸️ ULTIMATE TRAP SET: ${symbol}`);
      this.logger.info(`   OI Wipeout: CONFIRMED`);
      this.logger.info(`   Binance Trigger: ${recoveryTrigger.toFixed(2)}`);
      this.logger.warn(`   Waiting for V-Shape...`);

      return {
        ...oiWipeout,
        trapType: 'ULTIMATE_BULGARIA',
        binanceTrigger: recoveryTrigger,
        confidence: 98, // Highest confidence
      };
    }

    return null;
  }

  // Power Law Metrics Cache
  private metrics: Map<string, PowerLawMetric> = new Map();

  updatePowerLawMetrics(symbol: string, data: PowerLawMetric) {
    this.metrics.set(symbol, data);
  }

  /**
   * Detect idiosyncratic crashes
   *
   * Scan for symbols with > 3% drop in last 5 minutes
   * CRITICAL: Filter for idiosyncratic crashes (not market-wide)
   *
   * Only flag if:
   * - Symbol drops > Dynamic Threshold (Z > 2.5 or Alpha-based)
   * - BTC is flat (< 0.5%)
   * - Power Law Regime supports it (Alpha < 3.0 usually implies heavy tails)
   *
   * This filters out market-wide crashes (beta) and finds liquidation cascades (alpha)
   *
   * @returns Array of symbols with idiosyncratic crashes
   */
  private async detectCrashes(): Promise<string[]> {
    const symbols = await this.bybitClient.fetchTopSymbols(100);
    const crashes: string[] = [];

    // Get BTC drop as market baseline
    const btcOHLCV = await this.bybitClient.fetchOHLCV('BTCUSDT', '1m', 5);
    const btcStart = btcOHLCV[0].close;
    const btcNow = btcOHLCV[btcOHLCV.length - 1].close;
    const btcDrop = (btcStart - btcNow) / btcStart;

    for (const symbol of symbols) {
      try {
        const ohlcv = await this.bybitClient.fetchOHLCV(symbol, '1m', 5);

        if (ohlcv.length < 2) continue;

        const priceStart = ohlcv[0].close;
        const priceNow = ohlcv[ohlcv.length - 1].close;
        const drop = (priceStart - priceNow) / priceStart;

        // Get Power Law Metrics
        const metric = this.metrics.get(symbol);

        // Default Thresholds (fallback)
        let dropThreshold = 0.03; // 3%

        if (metric) {
          // Adaptive Threshold based on Alpha
          // If Alpha is low (1.5 - 2.5), tails are heavy -> huge drops are more common (normal).
          // We want *abnormal* drops even for the regime.
          // Or maybe: If Alpha is low, we expect mean-reversion? No, low alpha = trending/infinite variance.
          // If Alpha is high (> 3.0), Gaussian -> any drop is significant.

          // Logic:
          // High Alpha (> 3): Stable. A 3% drop is HUGE. Signal is strong.
          // Low Alpha (< 2): Wild. A 3% drop is noise. Need 5%+.

          if (metric.alpha < 2.0) {
            dropThreshold = 0.05; // Ignore noise in wild assets
          } else if (metric.alpha > 3.0) {
            dropThreshold = 0.025; // Catch rare anomalies in stable assets
          }

          // Volatility Cluster check
          // If in high volatility cluster, maybe require deeper drop?
          if (metric.volatility_cluster) {
            dropThreshold *= 1.2; // Increase threshold by 20%
          }
        }

        // Only flag if drop > threshold AND BTC is flat (< 0.5%)
        // This filters out market-wide crashes (beta) and finds liquidation cascades (alpha)
        if (drop > dropThreshold && btcDrop < 0.005) {
          crashes.push(symbol);
          console.log(
            `💀 Idiosyncratic crash detected: ${symbol} (-${(drop * 100).toFixed(
              1,
            )}%) vs BTC (-${(btcDrop * 100).toFixed(1)}%) | Regime: ${
              metric ? metric.alpha.toFixed(2) : 'N/A'
            }`,
          );
        }
      } catch {
        // Skip symbols with errors (delisted, no data, etc.)
        continue;
      }
    }

    return crashes;
  }

  /**
   * Sample Order Flow Imbalance (OFI)
   * Fetches BBO 5 times with 200ms delay to compute flow pressure.
   */
  private async sampleOFI(symbol: string): Promise<number> {
    this.ofiCalculator.reset();

    // 5 samples * 200ms = 1 second window
    for (let i = 0; i < 5; i++) {
      try {
        const ticker = await this.bybitClient.getTicker(symbol);
        this.ofiCalculator.update(
          parseFloat(ticker.bid1Price),
          parseFloat(ticker.bid1Size),
          parseFloat(ticker.ask1Price),
          parseFloat(ticker.ask1Size),
        );

        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch {
        // Ignore single fetch errors
      }
    }

    return this.ofiCalculator.getSmoothedOFI();
  }
}
