/**
 * CacheManager - In-memory caching layer with TTL support
 * Provides caching for allocation vectors, correlation matrices, and performance metrics
 * 
 * Requirements: 1.1, 3.8
 */

/**
 * Cache entry with value and expiration
 */
interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  hitRate: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** TTL for allocation vectors in milliseconds (default: 60000 = 1 min) */
  allocationTTL: number;
  /** TTL for correlation matrix in milliseconds (default: 300000 = 5 min) */
  correlationTTL: number;
  /** TTL for performance metrics in milliseconds (default: 60000 = 1 min) */
  performanceTTL: number;
  /** TTL for query results in milliseconds (default: 30000 = 30 sec) */
  queryTTL: number;
  /** Maximum number of entries per cache namespace */
  maxEntries: number;
  /** Enable automatic cleanup interval */
  enableAutoCleanup: boolean;
  /** Cleanup interval in milliseconds (default: 60000 = 1 min) */
  cleanupInterval: number;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  allocationTTL: 60 * 1000,      // 1 minute
  correlationTTL: 5 * 60 * 1000, // 5 minutes
  performanceTTL: 60 * 1000,     // 1 minute
  queryTTL: 30 * 1000,           // 30 seconds
  maxEntries: 1000,
  enableAutoCleanup: true,
  cleanupInterval: 60 * 1000,    // 1 minute
};

/**
 * Cache namespaces for different data types
 */
export enum CacheNamespace {
  ALLOCATION = 'allocation',
  CORRELATION = 'correlation',
  PERFORMANCE = 'performance',
  QUERY = 'query',
  RISK = 'risk',
}



/**
 * CacheManager provides in-memory caching with TTL support
 * for allocation vectors, correlation matrices, and performance metrics.
 */
export class CacheManager {
  private readonly config: CacheConfig;
  private readonly caches: Map<CacheNamespace, Map<string, CacheEntry<unknown>>>;
  private readonly stats: Map<CacheNamespace, CacheStats>;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CACHE_CONFIG, ...config };
    this.caches = new Map();
    this.stats = new Map();

    // Initialize caches for each namespace
    for (const namespace of Object.values(CacheNamespace)) {
      this.caches.set(namespace, new Map());
      this.stats.set(namespace, {
        hits: 0,
        misses: 0,
        sets: 0,
        evictions: 0,
        hitRate: 0,
      });
    }

    // Start automatic cleanup if enabled
    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Get a value from cache
   * @param namespace - Cache namespace
   * @param key - Cache key
   * @returns Cached value or undefined if not found/expired
   */
  get<T>(namespace: CacheNamespace, key: string): T | undefined {
    const cache = this.caches.get(namespace);
    const stats = this.stats.get(namespace);

    if (!cache || !stats) {
      return undefined;
    }

    const entry = cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      stats.misses++;
      this.updateHitRate(stats);
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      stats.misses++;
      stats.evictions++;
      this.updateHitRate(stats);
      return undefined;
    }

    stats.hits++;
    this.updateHitRate(stats);
    return entry.value;
  }

  /**
   * Set a value in cache with TTL
   * @param namespace - Cache namespace
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Optional custom TTL in milliseconds
   */
  set<T>(namespace: CacheNamespace, key: string, value: T, ttl?: number): void {
    const cache = this.caches.get(namespace);
    const stats = this.stats.get(namespace);

    if (!cache || !stats) {
      return;
    }

    // Enforce max entries limit
    if (cache.size >= this.config.maxEntries && !cache.has(key)) {
      this.evictOldest(namespace);
    }

    const effectiveTTL = ttl ?? this.getTTLForNamespace(namespace);
    const now = Date.now();

    cache.set(key, {
      value,
      expiresAt: now + effectiveTTL,
      createdAt: now,
    });

    stats.sets++;
  }

  /**
   * Delete a value from cache
   * @param namespace - Cache namespace
   * @param key - Cache key
   * @returns true if value was deleted
   */
  delete(namespace: CacheNamespace, key: string): boolean {
    const cache = this.caches.get(namespace);
    return cache?.delete(key) ?? false;
  }

  /**
   * Check if a key exists and is not expired
   * @param namespace - Cache namespace
   * @param key - Cache key
   * @returns true if key exists and is valid
   */
  has(namespace: CacheNamespace, key: string): boolean {
    const cache = this.caches.get(namespace);
    if (!cache) return false;

    const entry = cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate all entries in a namespace
   * @param namespace - Cache namespace to clear
   */
  invalidateNamespace(namespace: CacheNamespace): void {
    const cache = this.caches.get(namespace);
    const stats = this.stats.get(namespace);

    if (cache && stats) {
      stats.evictions += cache.size;
      cache.clear();
    }
  }

  /**
   * Invalidate entries matching a pattern
   * @param namespace - Cache namespace
   * @param pattern - Key pattern (supports * wildcard)
   */
  invalidatePattern(namespace: CacheNamespace, pattern: string): void {
    const cache = this.caches.get(namespace);
    const stats = this.stats.get(namespace);

    if (!cache || !stats) return;

    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    const keysToDelete: string[] = [];

    for (const key of cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      cache.delete(key);
      stats.evictions++;
    }
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    for (const namespace of Object.values(CacheNamespace)) {
      this.invalidateNamespace(namespace);
    }
  }

  /**
   * Get cache statistics for a namespace
   * @param namespace - Cache namespace
   * @returns Cache statistics
   */
  getStats(namespace: CacheNamespace): CacheStats | undefined {
    return this.stats.get(namespace);
  }

  /**
   * Get all cache statistics
   * @returns Map of namespace to statistics
   */
  getAllStats(): Map<CacheNamespace, CacheStats> {
    return new Map(this.stats);
  }

  /**
   * Get cache size for a namespace
   * @param namespace - Cache namespace
   * @returns Number of entries in cache
   */
  getSize(namespace: CacheNamespace): number {
    return this.caches.get(namespace)?.size ?? 0;
  }

  /**
   * Get total cache size across all namespaces
   * @returns Total number of entries
   */
  getTotalSize(): number {
    let total = 0;
    for (const cache of this.caches.values()) {
      total += cache.size;
    }
    return total;
  }

  /**
   * Get or set a value with a factory function
   * @param namespace - Cache namespace
   * @param key - Cache key
   * @param factory - Function to create value if not cached
   * @param ttl - Optional custom TTL
   * @returns Cached or newly created value
   */
  async getOrSet<T>(
    namespace: CacheNamespace,
    key: string,
    factory: () => T | Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(namespace, key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    this.set(namespace, key, value, ttl);
    return value;
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Cleanup expired entries across all namespaces
   */
  cleanup(): void {
    const now = Date.now();

    for (const [namespace, cache] of this.caches) {
      const stats = this.stats.get(namespace);
      const keysToDelete: string[] = [];

      for (const [key, entry] of cache) {
        if (now > entry.expiresAt) {
          keysToDelete.push(key);
        }
      }

      for (const key of keysToDelete) {
        cache.delete(key);
        if (stats) stats.evictions++;
      }
    }
  }

  /**
   * Get configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  // ============ Private Helper Methods ============

  /**
   * Get TTL for a namespace
   */
  private getTTLForNamespace(namespace: CacheNamespace): number {
    switch (namespace) {
      case CacheNamespace.ALLOCATION:
        return this.config.allocationTTL;
      case CacheNamespace.CORRELATION:
        return this.config.correlationTTL;
      case CacheNamespace.PERFORMANCE:
        return this.config.performanceTTL;
      case CacheNamespace.QUERY:
        return this.config.queryTTL;
      case CacheNamespace.RISK:
        return this.config.queryTTL;
      default:
        return this.config.queryTTL;
    }
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(stats: CacheStats): void {
    const total = stats.hits + stats.misses;
    stats.hitRate = total > 0 ? stats.hits / total : 0;
  }

  /**
   * Evict oldest entry from a namespace
   */
  private evictOldest(namespace: CacheNamespace): void {
    const cache = this.caches.get(namespace);
    const stats = this.stats.get(namespace);

    if (!cache || cache.size === 0) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of cache) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
      if (stats) stats.evictions++;
    }
  }

  /**
   * Start automatic cleanup interval
   */
  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);

    // Ensure timer doesn't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }
}
