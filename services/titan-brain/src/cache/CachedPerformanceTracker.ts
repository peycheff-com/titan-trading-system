/**
 * CachedPerformanceTracker - Wrapper that adds caching to PerformanceTracker
 * Caches performance metrics with 1 minute TTL
 * 
 * Requirements: 2.2
 */

import { PerformanceTracker } from '../engine/PerformanceTracker.js';
import { PhaseId, PhasePerformance, PerformanceTrackerConfig } from '../types/index.js';
import { DatabaseManager } from '../db/DatabaseManager.js';
import { CacheManager, CacheNamespace } from './CacheManager.js';

/**
 * CachedPerformanceTracker wraps PerformanceTracker with caching
 * to reduce database query overhead for frequently accessed metrics.
 */
export class CachedPerformanceTracker {
  private readonly tracker: PerformanceTracker;
  private readonly cache: CacheManager;

  constructor(config: PerformanceTrackerConfig, cache: CacheManager, db?: DatabaseManager) {
    this.tracker = new PerformanceTracker(config, db);
    this.cache = cache;
  }

  /**
   * Record a trade - invalidates cache for the phase
   */
  async recordTrade(
    phaseId: PhaseId,
    pnl: number,
    timestamp: number,
    symbol?: string,
    side?: 'BUY' | 'SELL'
  ): Promise<void> {
    await this.tracker.recordTrade(phaseId, pnl, timestamp, symbol, side);
    // Invalidate cache for this phase
    this.invalidatePhaseCache(phaseId);
  }

  /**
   * Get Sharpe ratio with caching
   */
  async getSharpeRatio(phaseId: PhaseId, windowDays?: number): Promise<number> {
    const cacheKey = `sharpe:${phaseId}:${windowDays ?? 'default'}`;

    const cached = this.cache.get<number>(CacheNamespace.PERFORMANCE, cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const sharpe = await this.tracker.getSharpeRatio(phaseId, windowDays);
    this.cache.set(CacheNamespace.PERFORMANCE, cacheKey, sharpe);
    return sharpe;
  }

  /**
   * Get performance modifier with caching
   */
  async getPerformanceModifier(phaseId: PhaseId): Promise<number> {
    const cacheKey = `modifier:${phaseId}`;

    const cached = this.cache.get<number>(CacheNamespace.PERFORMANCE, cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const modifier = await this.tracker.getPerformanceModifier(phaseId);
    this.cache.set(CacheNamespace.PERFORMANCE, cacheKey, modifier);
    return modifier;
  }

  /**
   * Get trade count with caching
   */
  async getTradeCount(phaseId: PhaseId, windowDays: number): Promise<number> {
    const cacheKey = `tradeCount:${phaseId}:${windowDays}`;

    const cached = this.cache.get<number>(CacheNamespace.PERFORMANCE, cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const count = await this.tracker.getTradeCount(phaseId, windowDays);
    this.cache.set(CacheNamespace.PERFORMANCE, cacheKey, count);
    return count;
  }

  /**
   * Get full phase performance with caching
   */
  async getPhasePerformance(phaseId: PhaseId): Promise<PhasePerformance> {
    const cacheKey = `performance:${phaseId}`;

    const cached = this.cache.get<PhasePerformance>(CacheNamespace.PERFORMANCE, cacheKey);
    if (cached) {
      return cached;
    }

    const performance = await this.tracker.getPhasePerformance(phaseId);
    this.cache.set(CacheNamespace.PERFORMANCE, cacheKey, performance);
    return performance;
  }

  /**
   * Get all phase performance with caching
   */
  async getAllPhasePerformance(): Promise<PhasePerformance[]> {
    const cacheKey = 'allPerformance';

    const cached = this.cache.get<PhasePerformance[]>(CacheNamespace.PERFORMANCE, cacheKey);
    if (cached) {
      return cached;
    }

    const performance = await this.tracker.getAllPhasePerformance();
    this.cache.set(CacheNamespace.PERFORMANCE, cacheKey, performance);
    return performance;
  }

  /**
   * Persist performance snapshot - invalidates cache
   */
  async persistPerformanceSnapshot(phaseId: PhaseId): Promise<void> {
    await this.tracker.persistPerformanceSnapshot(phaseId);
    this.invalidatePhaseCache(phaseId);
  }

  /**
   * Invalidate cache for a specific phase
   */
  invalidatePhaseCache(phaseId: PhaseId): void {
    this.cache.invalidatePattern(CacheNamespace.PERFORMANCE, `*:${phaseId}*`);
    this.cache.delete(CacheNamespace.PERFORMANCE, 'allPerformance');
  }

  /**
   * Invalidate all performance cache
   */
  invalidateAllCache(): void {
    this.cache.invalidateNamespace(CacheNamespace.PERFORMANCE);
  }

  /**
   * Get the underlying tracker
   */
  getTracker(): PerformanceTracker {
    return this.tracker;
  }

  /**
   * Get configuration
   */
  getConfig(): PerformanceTrackerConfig {
    return this.tracker.getConfig();
  }

  /**
   * Calculate Sharpe ratio from PnL values (pure function, no caching needed)
   */
  calculateSharpeRatio(pnlValues: number[]): number {
    return this.tracker.calculateSharpeRatio(pnlValues);
  }

  /**
   * Calculate modifier from Sharpe ratio (pure function, no caching needed)
   */
  calculateModifier(sharpeRatio: number): number {
    return this.tracker.calculateModifier(sharpeRatio);
  }
}
