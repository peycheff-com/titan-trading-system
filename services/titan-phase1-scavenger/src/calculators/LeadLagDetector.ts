import { Logger } from '@titan/shared';
/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * Lead/Lag Detector
 *
 * Empirically determines which exchange is leading price discovery.
 * Uses a sliding window correlation approach on synchronized price buckets.
 *
 * Requirements: 2.1 (Remove hardcoded "Spot leads Perps")
 */
const logger = Logger.getInstance('scavenger:LeadLagDetector');

export class LeadLagDetector {
  // Map<Symbol, Map<TimestampBucket, Price>>
  private binancePrices: Map<string, Map<number, number>> = new Map();
  private bybitPrices: Map<string, Map<number, number>> = new Map();

  private windowSize: number = 60000; // 60 seconds rolling window
  private bucketSize: number = 100; // 100ms buckets

  private lastCalculation: Map<string, number> = new Map();
  private calculationInterval: number = 1000; // Recalculate every 1 second

  // Default leader is BINANCE for all symbols until proven otherwise
  private currentLeader: Map<string, 'BINANCE' | 'BYBIT'> = new Map();
  private correlation: Map<string, number> = new Map();

  constructor() {}

  /**
   * Record a price update from an exchange
   */
  recordPrice(symbol: string, source: 'BINANCE' | 'BYBIT', price: number, timestamp: number): void {
    // Quantize timestamp to bucket size
    const bucket = Math.floor(timestamp / this.bucketSize) * this.bucketSize;

    const pricesMap = source === 'BINANCE' ? this.binancePrices : this.bybitPrices;

    if (!pricesMap.has(symbol)) {
      pricesMap.set(symbol, new Map());
    }

    pricesMap.get(symbol)!.set(bucket, price);

    // Cleanup old data occasionally (per symbol check to avoid global scan)
    if (Math.random() < 0.01) {
      this.cleanup(symbol, timestamp);
    }

    // Trigger recalculation if interval buckets have passed
    const lastCalc = this.lastCalculation.get(symbol) || 0;
    if (Date.now() - lastCalc > this.calculationInterval) {
      this.calculateLeadLag(symbol);
      this.lastCalculation.set(symbol, Date.now());
    }
  }

  /**
   * Determine which exchange is leading for a specific symbol
   */
  getLeader(symbol: string): 'BINANCE' | 'BYBIT' {
    return this.currentLeader.get(symbol) || 'BINANCE';
  }

  getCorrelation(symbol: string): number {
    return this.correlation.get(symbol) || 0;
  }

  private cleanup(symbol: string, currentTimestamp: number): void {
    const cutoff = currentTimestamp - this.windowSize;

    const binanceMap = this.binancePrices.get(symbol);
    if (binanceMap) {
      for (const t of binanceMap.keys()) {
        if (t < cutoff) binanceMap.delete(t);
      }
    }

    const bybitMap = this.bybitPrices.get(symbol);
    if (bybitMap) {
      for (const t of bybitMap.keys()) {
        if (t < cutoff) bybitMap.delete(t);
      }
    }
  }

  private calculateLeadLag(symbol: string): void {
    const binanceMap = this.binancePrices.get(symbol);
    const bybitMap = this.bybitPrices.get(symbol);

    if (!binanceMap || !bybitMap) return;

    // Get common timestamps (or interpolated)
    const now = Date.now();
    const start = Math.floor((now - 10000) / this.bucketSize) * this.bucketSize; // Look at last 10 seconds for HFT lead
    const end = Math.floor(now / this.bucketSize) * this.bucketSize;

    const binanceSeries: number[] = [];
    const bybitSeries: number[] = [];

    // Fill series
    for (let t = start; t <= end; t += this.bucketSize) {
      // Find nearest price if exact bucket missing (Zero-Order Hold)
      const pA = this.findNearest(binanceMap, t);
      const pB = this.findNearest(bybitMap, t);

      if (pA !== undefined && pB !== undefined) {
        binanceSeries.push(pA);
        bybitSeries.push(pB);
      }
    }

    if (binanceSeries.length < 10) return; // Not enough data

    // Calculate Cross-Correlation at Lag -1, 0, +1
    const r0 = this.correlationCoefficient(binanceSeries, bybitSeries, 0);
    const rPlus = this.correlationCoefficient(binanceSeries, bybitSeries, 1); // Shift Bybit forward (Binance leads)
    const rMinus = this.correlationCoefficient(binanceSeries, bybitSeries, -1); // Shift Bybit backward (Bybit leads)

    this.correlation.set(symbol, r0);

    // Simple heuristic
    if (rPlus > rMinus && rPlus > r0) {
      if (this.currentLeader.get(symbol) !== 'BINANCE') {
        logger.info(
          `📡 Lead/Lag Flip [${symbol}]: BINANCE is leading (R+=${rPlus.toFixed(
            3,
          )} vs R-=${rMinus.toFixed(3)})`,
        );
        this.currentLeader.set(symbol, 'BINANCE');
      }
    } else if (rMinus > rPlus && rMinus > r0) {
      if (this.currentLeader.get(symbol) !== 'BYBIT') {
        logger.info(
          `📡 Lead/Lag Flip [${symbol}]: BYBIT is leading (R-=${rMinus.toFixed(
            3,
          )} vs R+=${rPlus.toFixed(3)})`,
        );
        this.currentLeader.set(symbol, 'BYBIT');
      }
    }
  }

  private findNearest(map: Map<number, number>, target: number): number | undefined {
    if (map.has(target)) return map.get(target);
    // Look back up to 5 buckets
    for (let i = 1; i <= 5; i++) {
      if (map.has(target - i * this.bucketSize)) {
        return map.get(target - i * this.bucketSize);
      }
    }
    return undefined;
  }

  private correlationCoefficient(x: number[], y: number[], lag: number): number {
    // Apply lag
    let x_s: number[], y_s: number[];

    if (lag === 0) {
      x_s = x;
      y_s = y;
    } else if (lag > 0) {
      // x leads y, so compare x[t] with y[t+lag]
      x_s = x.slice(0, x.length - lag);
      y_s = y.slice(lag);
    } else {
      // y leads x (lag < 0)
      const absLag = Math.abs(lag);
      x_s = x.slice(absLag);
      y_s = y.slice(0, y.length - absLag);
    }

    if (x_s.length === 0) return 0;

    const n = x_s.length;
    const sum_x = x_s.reduce((a, b) => a + b, 0);
    const sum_y = y_s.reduce((a, b) => a + b, 0);
    const sum_xy = x_s.reduce((a, b, i) => a + b * y_s[i], 0);
    const sum_x2 = x_s.reduce((a, b) => a + b * b, 0);
    const sum_y2 = y_s.reduce((a, b) => a + b * b, 0);

    const numerator = n * sum_xy - sum_x * sum_y;
    const denominator = Math.sqrt((n * sum_x2 - sum_x * sum_x) * (n * sum_y2 - sum_y * sum_y));

    if (denominator === 0) return 0;
    return numerator / denominator;
  }
}
