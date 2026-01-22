import { EventEmitter } from 'events';
import type { SignalGenerator } from '../engine/StatEngine.js';
import type { LiquidationEvent, VacuumOpportunity } from './interfaces.js';
import type { OrderBook } from '../types/statistics.js';

/**
 * Monitors market for Vacuum Arbitrage opportunities
 * Typically triggered by cascading liquidations causing temporary price dislocation
 */
export class VacuumMonitor extends EventEmitter {
  private signalGenerator: SignalGenerator;
  private recentLiquidations: ReadonlyArray<LiquidationEvent> = [];
  private readonly LIQUIDATION_WINDOW_MS = 10000; // 10 seconds to correlate
  private readonly MIN_LIQUIDATION_SIZE = 1000; // Min USD size to care about

  constructor(signalGenerator: SignalGenerator) {
    super();
    this.signalGenerator = signalGenerator;
  }

  /**
   * Ingest a liquidation event
   */
  onLiquidation(event: LiquidationEvent): void {
    if (event.size < this.MIN_LIQUIDATION_SIZE) return;

    const now = Date.now();
    // Ignore events older than window
    if (now - event.timestamp > this.LIQUIDATION_WINDOW_MS) return;

    // Prune old events and add new one
    // eslint-disable-next-line functional/immutable-data
    this.recentLiquidations = [
      ...this.recentLiquidations.filter((e) => now - e.timestamp < this.LIQUIDATION_WINDOW_MS),
      event,
    ];

    // Check if this specific liquidation triggers immediate opportunity?
    // Usually we wait for price update to see basis dislocation.
  }

  /**
   * Check liquidity health of order book to prevent entering thin markets
   */
  private spreadHistory: ReadonlyArray<number> = [];
  private readonly MAX_SPREAD_DEVIATION = 3.0; // 3x average
  private readonly MAX_DATA_LATENCY = 100; // 100ms tolerance (softened from 50ms for realistic ops)

  /**
   * Check liquidity health of order book to prevent entering thin markets
   */
  private checkLiquidityHealth(spotPrice: number, orderBook?: OrderBook): boolean {
    // If no OrderBook provided (mock/sim), assume filtered elsewhere or safe
    if (!orderBook) return true;

    // 1. Data Latency Check
    const latency = Date.now() - orderBook.timestamp;
    if (latency > this.MAX_DATA_LATENCY) {
      // console.warn(`[VACUUM_SKIP] Data Latency High: ${latency}ms`);
      return false;
    }

    // 2. Spread Check
    const bestBid = orderBook.bids[0]?.[0];
    const bestAsk = orderBook.asks[0]?.[0];

    if (!bestBid || !bestAsk) return false;

    const currentSpread = (bestAsk - bestBid) / spotPrice;

    // Update history (Exponential Moving Average is better, but simple average for now)
    // Keep last 100
    const newHistory = [...this.spreadHistory, currentSpread];
    // eslint-disable-next-line functional/immutable-data
    this.spreadHistory = newHistory.slice(Math.max(0, newHistory.length - 100));

    // Check Deviation
    if (this.spreadHistory.length > 20) {
      const avgSpread = this.spreadHistory.reduce((a, b) => a + b, 0) / this.spreadHistory.length;
      if (currentSpread > avgSpread * this.MAX_SPREAD_DEVIATION) {
        // Spread blown out - likely volatile/illiquid
        return false;
      }
    }

    // 3. Depth Check
    // Requirement: Order Book depth > $50k within 10bps (0.1%)
    const thresholdBps = 0.001;
    const requiredDepth = 50000;

    const calculateDepth = (
      orders: readonly [number, number][],
      priceFunc: (p: number) => boolean,
    ): number => {
      return orders.reduce((acc, [price, size]) => {
        if (priceFunc(price)) {
          return acc + size * price;
        }
        return acc; // Should break optimization ideally, but reduce visits all.
        // For immutability, this full scan is acceptable for OB depth 20-50.
      }, 0);
    };

    const bidDepth = calculateDepth(orderBook.bids, (p) => p >= spotPrice * (1 - thresholdBps));
    const askDepth = calculateDepth(orderBook.asks, (p) => p <= spotPrice * (1 + thresholdBps));

    return bidDepth >= requiredDepth && askDepth >= requiredDepth;
  }

  /**
   * Check for vacuum opportunity based on current market state
   */
  async checkForOpportunity(
    symbol: string,
    spotPrice: number,
    perpPrice: number,
    orderBook?: OrderBook,
  ): Promise<VacuumOpportunity | null> {
    // 1. Safety Check: Liquidity Health
    if (!this.checkLiquidityHealth(spotPrice, orderBook)) {
      // console.warn(`[VACUUM_SKIP] Low Liquidity for ${symbol}`);
      return null;
    }

    const now = Date.now();

    // Calculate Basis
    if (spotPrice <= 0) return null;
    const basis = (perpPrice - spotPrice) / spotPrice;

    // Check Thresholds from SignalGenerator
    // Note: SignalGenerator might not expose specific threshold config easily publicly,
    // but assuming we know the logic: Vacuum implies extreme deviation.
    // For now, let's hardcode or pass config?
    // Better: Helper method on SignalGenerator?
    // Or just re-implement simple check here as Vacuum logic is specific.

    const VACUUM_THRESHOLD = -0.005; // -0.5% (backwardation due to long liquidation?)
    // Or +0.5% (contango due to short liquidation?)

    // Logic:
    // If Basis < -0.5% -> Implies Long Liquidation (Perp crashed). Direction: BUY Perp, SELL Spot (if possible) or just BUY Perp (Long Reversal).
    // If Basis > +0.5% -> Implies Short Liquidation (Perp spiked). Direction: SELL Perp.

    const direction: 'LONG' | 'SHORT' | null =
      basis < VACUUM_THRESHOLD ? 'LONG' : basis > -VACUUM_THRESHOLD ? 'SHORT' : null;

    if (!direction) return null;

    // Correlate with recent liquidations
    const relevantLiquidations = this.recentLiquidations.filter((e) => e.symbol === symbol);
    // If no recent liquidation, maybe just volatility?
    // Vacuum Arb strategy explicitly relies on "Liquidation" signal to confirm it's not fundamental news.

    const confidence = relevantLiquidations.length > 0 ? 0.9 : 0.5;

    // If confident enough
    if (confidence > 0.6) {
      return {
        id: `vac-${symbol}-${now}`,
        symbol,
        direction,
        maxEntryPrice: perpPrice * 1.001, // 0.1% slip tolerance?
        targetExitPrice: spotPrice, // Revert to spot
        confidence,
        timestamp: now,
        liquidationEvent: relevantLiquidations[relevantLiquidations.length - 1],
      };
    }

    return null;
  }
}
