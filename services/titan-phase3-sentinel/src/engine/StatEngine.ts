/**
 * Statistical Engine for Titan Phase 3 - The Sentinel
 *
 * Provides real-time statistical analysis of basis behavior to generate trading signals.
 * Uses rolling statistics with Welford's online algorithm for numerical stability.
 *
 * @module engine/StatEngine
 */

import type { Signal, SignalAction, SignalThresholds } from '../types/signals.js';
import type { BasisStats, OrderBook, RollingStatsConfig } from '../types/statistics.js';
import { DEFAULT_SIGNAL_THRESHOLDS } from '../types/signals.js';
import { DEFAULT_ROLLING_STATS_CONFIG } from '../types/statistics.js';

/**
 * Generic circular buffer for efficient rolling window operations
 * Provides O(1) add operation for performance
 */
export class CircularBuffer<T> {
  private buffer: T[];
  private size: number;
  private index: number;
  private count: number;

  constructor(size: number) {
    this.size = size;
    this.buffer = new Array(size);
    this.index = 0;
    this.count = 0;
  }

  /**
   * Add item to buffer (O(1) operation)
   * Returns the removed item if buffer was full, undefined otherwise
   */
  add(item: T): T | undefined {
    let removed: T | undefined;
    if (this.isFull()) {
      removed = this.buffer[this.index];
    }
    this.buffer[this.index] = item;
    this.index = (this.index + 1) % this.size;
    if (this.count < this.size) {
      this.count++;
    }
    return removed;
  }

  /**
   * Get all items in buffer (oldest to newest)
   */
  getAll(): T[] {
    if (this.count < this.size) {
      return this.buffer.slice(0, this.count);
    }
    // Return items in order from oldest to newest
    return [...this.buffer.slice(this.index), ...this.buffer.slice(0, this.index)];
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.count >= this.size;
  }

  /**
   * Get current count of items
   */
  getCount(): number {
    return this.count;
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = new Array(this.size);
    this.index = 0;
    this.count = 0;
  }
}

/**
 * Rolling statistics calculator using Welford's online algorithm
 * Provides numerically stable mean and standard deviation calculation
 */
export class RollingStatistics {
  private buffer: CircularBuffer<number>;
  private config: RollingStatsConfig;
  private mean: number = 0;
  private m2: number = 0; // Usage for variance calculation
  private count: number = 0;

  constructor(config: RollingStatsConfig = DEFAULT_ROLLING_STATS_CONFIG) {
    this.config = config;
    this.buffer = new CircularBuffer<number>(config.windowSize);
  }

  /**
   * Add a new value to the rolling window
   * Updates stats O(1) using Welford's algorithm
   */
  add(value: number): void {
    // If buffer is full, remove the oldest value first
    const removedId = this.buffer.add(value);

    if (removedId !== undefined) {
      this.removeValue(removedId);
    }

    this.addValue(value);
  }

  private addValue(value: number): void {
    this.count++;
    const delta = value - this.mean;
    this.mean += delta / this.count;
    const delta2 = value - this.mean;
    this.m2 += delta * delta2;
  }

  private removeValue(value: number): void {
    if (this.count <= 0) return;

    // Welford removal logic
    const delta = value - this.mean;
    this.mean -= delta / (this.count - 1);
    const delta2 = value - this.mean;
    this.m2 -= delta * delta2;
    this.count--;
  }

  /**
   * Get the rolling mean
   */
  getMean(): number {
    return this.count > 0 ? this.mean : 0;
  }

  /**
   * Get the rolling standard deviation using Welford's algorithm
   */
  getStdDev(): number {
    if (this.count < 2) return 0;
    return Math.sqrt(this.m2 / (this.count - 1));
  }

  /**
   * Calculate Z-Score for a given value
   * Formula: (current - mean) / stdDev
   */
  getZScore(current: number): number {
    const stdDev = this.getStdDev();
    if (stdDev === 0) return 0;
    return (current - this.getMean()) / stdDev;
  }

  /**
   * Get percentile ranking for a value (0-100)
   * Note: This is still O(N) as it requires sorting
   */
  getPercentile(value: number): number {
    const values = this.buffer.getAll();
    if (values.length === 0) return 50;

    const sorted = [...values].sort((a, b) => a - b);
    const belowCount = sorted.filter((v) => v < value).length;
    return (belowCount / sorted.length) * 100;
  }

  /**
   * Check if we have enough samples for valid statistics
   */
  hasMinSamples(): boolean {
    return this.count >= this.config.minSamples;
  }

  /**
   * Get all values in the buffer
   */
  getHistory(): number[] {
    return this.buffer.getAll();
  }

  /**
   * Clear all statistics
   */
  clear(): void {
    this.buffer.clear();
    this.mean = 0;
    this.m2 = 0;
    this.count = 0;
  }
}

/**
 * Basis calculator for spot/perpetual spread analysis
 */
export class BasisCalculator {
  /**
   * Calculate simple basis: (perp - spot) / spot
   */
  calculateBasis(spotPrice: number, perpPrice: number): number {
    if (spotPrice === 0) return 0;
    return (perpPrice - spotPrice) / spotPrice;
  }

  /**
   * Calculate depth-weighted basis using order book depth
   * Accounts for execution impact costs
   */
  calculateDepthWeightedBasis(
    spotOrderBook: OrderBook,
    perpOrderBook: OrderBook,
    size: number,
  ): number {
    const spotPrice = this.calculateVwap(spotOrderBook.asks, size);
    const perpPrice = this.calculateVwap(perpOrderBook.bids, size);

    if (spotPrice === 0) return 0;
    return (perpPrice - spotPrice) / spotPrice;
  }

  /**
   * Calculate VWAP for a given size through order book levels
   */
  private calculateVwap(levels: Array<[price: number, size: number]>, targetSize: number): number {
    let remainingSize = targetSize;
    let totalCost = 0;
    let totalFilled = 0;

    for (const [price, size] of levels) {
      const fillSize = Math.min(remainingSize, size);
      totalCost += price * fillSize;
      totalFilled += fillSize;
      remainingSize -= fillSize;

      if (remainingSize <= 0) break;
    }

    return totalFilled > 0 ? totalCost / totalFilled : 0;
  }

  /**
   * Calculate execution impact cost for a given size
   */
  calculateImpactCost(orderBook: OrderBook, size: number): number {
    const midPrice = this.getMidPrice(orderBook);
    const vwap = this.calculateVwap(orderBook.asks, size);

    if (midPrice === 0) return 0;
    return (vwap - midPrice) / midPrice;
  }

  /**
   * Get mid price from order book
   */
  private getMidPrice(orderBook: OrderBook): number {
    if (orderBook.bids.length === 0 || orderBook.asks.length === 0) return 0;
    return (orderBook.bids[0][0] + orderBook.asks[0][0]) / 2;
  }
}

/**
 * Signal generator for basis trading decisions
 */
export class SignalGenerator {
  private stats: Map<string, RollingStatistics>;
  private thresholds: SignalThresholds;
  private basisCalculator: BasisCalculator;

  constructor(thresholds: SignalThresholds = DEFAULT_SIGNAL_THRESHOLDS) {
    this.stats = new Map();
    this.thresholds = thresholds;
    this.basisCalculator = new BasisCalculator();
  }

  /**
   * Update basis for a symbol
   */
  updateBasis(symbol: string, basis: number): void {
    if (!this.stats.has(symbol)) {
      this.stats.set(symbol, new RollingStatistics());
    }
    this.stats.get(symbol)!.add(basis);
  }

  /**
   * Get trading signal for a symbol
   */
  getSignal(symbol: string): Signal {
    const stats = this.stats.get(symbol);
    if (!stats || !stats.hasMinSamples()) {
      return this.createSignal(symbol, 'HOLD', 0, 0, 0);
    }

    const history = stats.getHistory();
    const currentBasis = history[history.length - 1];
    const zScore = stats.getZScore(currentBasis);
    const confidence = this.calculateConfidence(stats);

    let action: SignalAction = 'HOLD';
    if (zScore >= this.thresholds.expandZScore) {
      action = 'EXPAND';
    } else if (zScore <= this.thresholds.contractZScore) {
      action = 'CONTRACT';
    }

    return this.createSignal(symbol, action, currentBasis, zScore, confidence);
  }

  /**
   * Check if should expand position (basis expensive)
   */
  shouldExpand(symbol: string): boolean {
    const signal = this.getSignal(symbol);
    return signal.action === 'EXPAND' && signal.confidence >= this.thresholds.minConfidence;
  }

  /**
   * Check if should contract position (basis mean-reverting)
   */
  shouldContract(symbol: string): boolean {
    const signal = this.getSignal(symbol);
    return signal.action === 'CONTRACT' && signal.confidence >= this.thresholds.minConfidence;
  }

  /**
   * Get basis statistics for a symbol
   */
  getBasisStats(symbol: string): BasisStats | null {
    const stats = this.stats.get(symbol);
    if (!stats) return null;

    const history = stats.getHistory();
    const current = history.length > 0 ? history[history.length - 1] : 0;

    return {
      symbol,
      current,
      mean: stats.getMean(),
      stdDev: stats.getStdDev(),
      zScore: stats.getZScore(current),
      percentile: stats.getPercentile(current),
      history,
    };
  }

  /**
   * Calculate confidence based on sample size and stability
   */
  private calculateConfidence(stats: RollingStatistics): number {
    const history = stats.getHistory();
    const sampleRatio = Math.min(history.length / 60, 1); // Full confidence at 60 samples
    const stdDev = stats.getStdDev();
    const stabilityFactor = stdDev > 0 ? Math.min(1, 0.01 / stdDev) : 0.5;

    return sampleRatio * 0.7 + stabilityFactor * 0.3;
  }

  /**
   * Create a signal object
   */
  private createSignal(
    symbol: string,
    action: SignalAction,
    basis: number,
    zScore: number,
    confidence: number,
  ): Signal {
    return {
      symbol,
      action,
      basis,
      zScore,
      confidence,
      timestamp: Date.now(),
    };
  }

  /**
   * Clear statistics for a symbol
   */
  clearSymbol(symbol: string): void {
    this.stats.delete(symbol);
  }

  /**
   * Clear all statistics
   */
  clearAll(): void {
    this.stats.clear();
  }
}
