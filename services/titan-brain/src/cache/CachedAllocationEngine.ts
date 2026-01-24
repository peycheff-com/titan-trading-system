/**
 * CachedAllocationEngine - Wrapper that adds caching to AllocationEngine
 * Caches allocation vectors with 1 minute TTL
 *
 * Requirements: 1.1
 */

import { AllocationEngine } from "../features/Allocation/AllocationEngine.js";
import {
  AllocationEngineConfig,
  AllocationVector,
  EquityTier,
} from "../types/index.js";
import { CacheManager, CacheNamespace } from "./CacheManager.js";

/**
 * Rounds equity to nearest bucket for cache key generation
 * This prevents cache fragmentation from minor equity fluctuations
 */
function getEquityBucket(equity: number): number {
  // Round to nearest $10 for small accounts, $100 for larger
  if (equity < 1000) {
    return Math.round(equity / 10) * 10;
  } else if (equity < 10000) {
    return Math.round(equity / 50) * 50;
  } else {
    return Math.round(equity / 100) * 100;
  }
}

/**
 * CachedAllocationEngine wraps AllocationEngine with caching
 * to reduce computation overhead for frequently accessed allocation vectors.
 */
export class CachedAllocationEngine {
  private readonly engine: AllocationEngine;
  private readonly cache: CacheManager;

  constructor(config: AllocationEngineConfig, cache: CacheManager) {
    this.engine = new AllocationEngine(config);
    this.cache = cache;
  }

  /**
   * Get allocation weights with caching
   * Uses equity buckets to improve cache hit rate
   *
   * @param equity - Current account equity in USD
   * @returns AllocationVector with weights summing to 1.0
   */
  async getWeights(equity: number): Promise<AllocationVector> {
    const bucket = getEquityBucket(equity);
    const cacheKey = `weights:${bucket}`;

    // Try to get from cache
    const cached = await this.cache.get<AllocationVector>(
      CacheNamespace.ALLOCATION,
      cacheKey,
    );
    if (cached.success && cached.value) {
      // Update timestamp to current time
      return { ...cached.value, timestamp: Date.now() };
    }

    // Calculate and cache
    const weights = this.engine.getWeights(equity);
    await this.cache.set(CacheNamespace.ALLOCATION, cacheKey, weights);
    return weights;
  }

  /**
   * Get equity tier (no caching needed - simple calculation)
   *
   * @param equity - Current account equity in USD
   * @returns EquityTier classification
   */
  getEquityTier(equity: number): EquityTier {
    return this.engine.getEquityTier(equity);
  }

  /**
   * Get maximum leverage for equity tier (no caching needed - simple lookup)
   *
   * @param equity - Current account equity in USD
   * @returns Maximum leverage multiplier
   */
  getMaxLeverage(equity: number): number {
    return this.engine.getMaxLeverage(equity);
  }

  /**
   * Invalidate allocation cache
   * Call this when allocation rules change
   */
  invalidateCache(): void {
    this.cache.invalidateNamespace(CacheNamespace.ALLOCATION);
  }

  /**
   * Get the underlying allocation engine
   */
  getEngine(): AllocationEngine {
    return this.engine;
  }

  /**
   * Get transition points configuration
   */
  getTransitionPoints() {
    return this.engine.getTransitionPoints();
  }

  /**
   * Get leverage caps configuration
   */
  getLeverageCaps() {
    return this.engine.getLeverageCaps();
  }
}
