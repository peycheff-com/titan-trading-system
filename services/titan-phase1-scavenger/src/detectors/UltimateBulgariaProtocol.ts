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

import { BinanceSpotClient } from '../exchanges/BinanceSpotClient';
import { OIWipeoutDetector } from './OIWipeoutDetector';

export interface Tripwire {
  symbol: string;
  triggerPrice: number;
  direction: 'LONG' | 'SHORT';
  trapType: 'LIQUIDATION' | 'DAILY_LEVEL' | 'BOLLINGER' | 'OI_WIPEOUT' | 'FUNDING_SQUEEZE' | 'BASIS_ARB' | 'ULTIMATE_BULGARIA';
  confidence: number;
  leverage: number;
  estimatedCascadeSize: number;
  activated: boolean;
  activatedAt?: number;
  targetPrice?: number;
  stopLoss?: number;
  binanceTrigger?: number;
}

export class UltimateBulgariaProtocol {
  private bybitClient: any; // Will be null when using titan-execution service
  private binanceClient: BinanceSpotClient;
  private oiDetector: OIWipeoutDetector;

  constructor(
    bybitClient: any, // Can be null when using titan-execution service
    binanceClient: BinanceSpotClient,
    oiDetector: OIWipeoutDetector
  ) {
    this.bybitClient = bybitClient;
    this.binanceClient = binanceClient;
    this.oiDetector = oiDetector;
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

      // 3. Set Leader-Follower trap on Binance Spot
      // When Binance starts V-Shape recovery, fire Long on Bybit
      const binancePrice = await this.binanceClient.getSpotPrice(symbol);
      const recoveryTrigger = binancePrice * 1.01; // +1% recovery

      console.log(`🕸️ ULTIMATE TRAP SET: ${symbol}`);
      console.log(`   OI Wipeout: CONFIRMED`);
      console.log(`   Binance Trigger: ${recoveryTrigger.toFixed(2)}`);
      console.log(`   Waiting for V-Shape...`);

      return {
        ...oiWipeout,
        trapType: 'ULTIMATE_BULGARIA',
        binanceTrigger: recoveryTrigger,
        confidence: 98, // Highest confidence
      };
    }

    return null;
  }

  /**
   * Detect idiosyncratic crashes
   * 
   * Scan for symbols with > 3% drop in last 5 minutes
   * CRITICAL: Filter for idiosyncratic crashes (not market-wide)
   * 
   * Only flag if:
   * - Symbol drops > 3%
   * - BTC is flat (< 0.5%)
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

        // Only flag if drop > 3% AND BTC is flat (< 0.5%)
        // This filters out market-wide crashes (beta) and finds liquidation cascades (alpha)
        if (drop > 0.03 && btcDrop < 0.005) {
          crashes.push(symbol);
          console.log(
            `💀 Idiosyncratic crash detected: ${symbol} (-${(drop * 100).toFixed(1)}%) vs BTC (-${(btcDrop * 100).toFixed(1)}%)`
          );
        }
      } catch (error) {
        // Skip symbols with errors (delisted, no data, etc.)
        continue;
      }
    }

    return crashes;
  }
}
