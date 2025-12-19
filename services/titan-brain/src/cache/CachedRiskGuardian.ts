/**
 * CachedRiskGuardian - Wrapper that adds caching to RiskGuardian
 * Caches correlation matrix with 5 minute TTL
 * 
 * Requirements: 3.8
 */

import { RiskGuardian, HighCorrelationNotifier, PriceHistoryEntry } from '../engine/RiskGuardian.js';
import { IntentSignal, Position, RiskDecision, RiskMetrics, RiskGuardianConfig } from '../types/index.js';
import { AllocationEngine } from '../engine/AllocationEngine.js';
import { CacheManager, CacheNamespace } from './CacheManager.js';

/**
 * CachedRiskGuardian wraps RiskGuardian with caching
 * to reduce computation overhead for correlation calculations.
 */
export class CachedRiskGuardian {
  private readonly guardian: RiskGuardian;
  private readonly cache: CacheManager;

  constructor(config: RiskGuardianConfig, allocationEngine: AllocationEngine, cache: CacheManager) {
    this.guardian = new RiskGuardian(config, allocationEngine);
    this.cache = cache;
  }

  /**
   * Set the high correlation notifier
   */
  setCorrelationNotifier(notifier: HighCorrelationNotifier): void {
    this.guardian.setCorrelationNotifier(notifier);
  }

  /**
   * Set current equity
   */
  setEquity(equity: number): void {
    this.guardian.setEquity(equity);
  }

  /**
   * Get current equity
   */
  getEquity(): number {
    return this.guardian.getEquity();
  }

  /**
   * Check signal against risk rules
   * Uses cached correlation data when available
   */
  checkSignal(signal: IntentSignal, currentPositions: Position[]): RiskDecision {
    return this.guardian.checkSignal(signal, currentPositions);
  }

  /**
   * Calculate portfolio delta (no caching - fast calculation)
   */
  calculatePortfolioDelta(positions: Position[]): number {
    return this.guardian.calculatePortfolioDelta(positions);
  }

  /**
   * Calculate combined leverage (no caching - fast calculation)
   */
  calculateCombinedLeverage(positions: Position[]): number {
    return this.guardian.calculateCombinedLeverage(positions);
  }

  /**
   * Calculate correlation with caching
   */
  calculateCorrelation(assetA: string, assetB: string): number {
    // Sort assets for consistent cache key
    const [first, second] = [assetA, assetB].sort();
    const cacheKey = `corr:${first}:${second}`;

    const cached = this.cache.get<number>(CacheNamespace.CORRELATION, cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const correlation = this.guardian.calculateCorrelation(assetA, assetB);
    this.cache.set(CacheNamespace.CORRELATION, cacheKey, correlation);
    return correlation;
  }

  /**
   * Get portfolio beta with caching
   */
  getPortfolioBeta(positions: Position[]): number {
    // Create cache key from position symbols
    const positionKey = positions
      .map(p => `${p.symbol}:${p.side}:${Math.round(p.size)}`)
      .sort()
      .join('|');
    const cacheKey = `beta:${positionKey}`;

    const cached = this.cache.get<number>(CacheNamespace.CORRELATION, cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const beta = this.guardian.getPortfolioBeta(positions);
    this.cache.set(CacheNamespace.CORRELATION, cacheKey, beta);
    return beta;
  }

  /**
   * Update price history - invalidates correlation cache for the symbol
   */
  updatePriceHistory(symbol: string, price: number, timestamp?: number): void {
    this.guardian.updatePriceHistory(symbol, price, timestamp);
    // Invalidate correlations involving this symbol
    this.cache.invalidatePattern(CacheNamespace.CORRELATION, `corr:*${symbol}*`);
    this.cache.invalidatePattern(CacheNamespace.CORRELATION, `beta:*${symbol}*`);
  }

  /**
   * Clear correlation cache
   */
  clearCorrelationCache(): void {
    this.guardian.clearCorrelationCache();
    this.cache.invalidateNamespace(CacheNamespace.CORRELATION);
  }

  /**
   * Get risk metrics with caching
   */
  getRiskMetrics(positions: Position[]): RiskMetrics {
    // Create cache key from position state
    const positionKey = positions
      .map(p => `${p.symbol}:${p.side}:${Math.round(p.size)}`)
      .sort()
      .join('|');
    const cacheKey = `metrics:${positionKey}`;

    const cached = this.cache.get<RiskMetrics>(CacheNamespace.RISK, cacheKey);
    if (cached) {
      return cached;
    }

    const metrics = this.guardian.getRiskMetrics(positions);
    this.cache.set(CacheNamespace.RISK, cacheKey, metrics);
    return metrics;
  }

  /**
   * Invalidate all risk-related caches
   */
  invalidateAllCache(): void {
    this.cache.invalidateNamespace(CacheNamespace.CORRELATION);
    this.cache.invalidateNamespace(CacheNamespace.RISK);
  }

  /**
   * Get the underlying guardian
   */
  getGuardian(): RiskGuardian {
    return this.guardian;
  }

  /**
   * Get configuration
   */
  getConfig(): RiskGuardianConfig {
    return this.guardian.getConfig();
  }
}
