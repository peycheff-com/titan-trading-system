/**
 * InMemoryCache - High-performance in-memory cache with TTL support
 *
 * Provides fast in-memory caching with automatic expiration and LRU eviction.
 * Used as fallback when Redis is unavailable.
 *
 * Requirements: 3.2.1, 3.2.2, 3.2.3
 */

import { EventEmitter } from 'events';

/**
 * Cache entry with TTL support
 */
interface CacheEntry<T = any> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * In-memory cache statistics
 */
export interface InMemoryCacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  evictions: number;
  expired: number;
  hitRate: number;
  memoryUsage: number; // Estimated in bytes
}

/**
 * High-performance in-memory cache with TTL and LRU eviction
 */
export class InMemoryCache extends EventEmitter {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private defaultTtlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    expired: number;
  } = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expired: 0,
  };

  constructor(maxSize: number = 1000, defaultTtlMs: number = 300000) {
    super();
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Initialize the cache with cleanup interval
   */
  initialize(): void {
    // Start cleanup interval to remove expired entries
    this.startCleanupInterval();
    this.emit('initialized', { maxSize: this.maxSize, defaultTtlMs: this.defaultTtlMs });
  }

  /**
   * Start cleanup interval for expired entries
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Run cleanup every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, 30000);
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.stats.expired++;
    }

    if (expiredKeys.length > 0) {
      this.emit('cleanup', { expiredCount: expiredKeys.length, remainingSize: this.cache.size });
    }
  }

  /**
   * Evict least recently used entries to make space
   */
  private evictLRU(count: number = 1): void {
    if (this.cache.size === 0) return;

    // Sort entries by last accessed time (ascending)
    const entries = Array.from(this.cache.entries()).sort(
      ([, a], [, b]) => a.lastAccessed - b.lastAccessed,
    );

    // Remove the oldest entries
    const actualEvictCount = Math.min(count, entries.length);
    for (let i = 0; i < actualEvictCount; i++) {
      const [key] = entries[i];
      this.cache.delete(key);
      this.stats.evictions++;
    }

    this.emit('eviction', { evictedCount: actualEvictCount, remainingSize: this.cache.size });
  }

  /**
   * Get a value from cache
   */
  get<T = any>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.emit('miss', { key });
      return undefined;
    }

    // Check if entry has expired
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      this.stats.expired++;
      this.stats.misses++;
      this.emit('expired', { key });
      return undefined;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    this.emit('hit', { key, accessCount: entry.accessCount });
    return entry.value as T;
  }

  /**
   * Set a value in cache
   */
  set<T = any>(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();
    const effectiveTtl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    const expiresAt = effectiveTtl > 0 ? now + effectiveTtl : now; // If TTL is 0, expire immediately

    // Check if we need to make space
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      // Evict 10% of entries or at least 1
      const evictCount = Math.max(1, Math.floor(this.maxSize * 0.1));
      this.evictLRU(evictCount);
    }

    // Set the entry
    this.cache.set(key, {
      value,
      expiresAt,
      accessCount: 0,
      lastAccessed: now,
    });

    this.emit('set', {
      key,
      ttlMs: effectiveTtl,
      size: this.cache.size,
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  /**
   * Delete a value from cache
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key);

    if (existed) {
      this.emit('delete', { key, remainingSize: this.cache.size });
    }

    return existed;
  }

  /**
   * Check if a key exists in cache (without updating access stats)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      this.stats.expired++;
      return false;
    }

    return true;
  }

  /**
   * Get multiple values from cache
   */
  getMultiple<T = any>(keys: string[]): Map<string, T> {
    const result = new Map<string, T>();

    for (const key of keys) {
      const value = this.get<T>(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }

    return result;
  }

  /**
   * Set multiple values in cache
   */
  setMultiple<T = any>(entries: Map<string, T>, ttlMs?: number): void {
    for (const [key, value] of entries.entries()) {
      this.set(key, value, ttlMs);
    }
  }

  /**
   * Delete multiple values from cache
   */
  deleteMultiple(keys: string[]): number {
    let deletedCount = 0;

    for (const key of keys) {
      if (this.delete(key)) {
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    const previousSize = this.cache.size;
    this.cache.clear();

    // Reset stats
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expired: 0,
    };

    this.emit('clear', { previousSize });
  }

  /**
   * Get all keys in cache (excluding expired)
   */
  keys(): string[] {
    const now = Date.now();
    const validKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt > now) {
        validKeys.push(key);
      }
    }

    return validKeys;
  }

  /**
   * Get cache statistics
   */
  getStats(): InMemoryCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    // Estimate memory usage (rough calculation)
    let estimatedMemoryUsage = 0;
    for (const [key, entry] of this.cache.entries()) {
      // Rough estimation: key size + JSON serialized value size + overhead
      estimatedMemoryUsage += key.length * 2; // UTF-16 characters
      estimatedMemoryUsage += JSON.stringify(entry.value).length * 2;
      estimatedMemoryUsage += 64; // Estimated overhead per entry
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      expired: this.stats.expired,
      hitRate,
      memoryUsage: estimatedMemoryUsage,
    };
  }

  /**
   * Get entries that will expire soon
   */
  getExpiringEntries(
    withinMs: number = 60000,
  ): Array<{ key: string; expiresAt: number; timeLeft: number }> {
    const now = Date.now();
    const threshold = now + withinMs;
    const expiringEntries: Array<{ key: string; expiresAt: number; timeLeft: number }> = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= threshold && entry.expiresAt > now) {
        expiringEntries.push({
          key,
          expiresAt: entry.expiresAt,
          timeLeft: entry.expiresAt - now,
        });
      }
    }

    return expiringEntries.sort((a, b) => a.timeLeft - b.timeLeft);
  }

  /**
   * Get most accessed entries
   */
  getMostAccessed(
    limit: number = 10,
  ): Array<{ key: string; accessCount: number; lastAccessed: number }> {
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        accessCount: entry.accessCount,
        lastAccessed: entry.lastAccessed,
      }))
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);

    return entries;
  }

  /**
   * Update TTL for an existing entry
   */
  updateTTL(key: string, ttlMs: number): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      this.stats.expired++;
      return false;
    }

    // Update expiration time
    entry.expiresAt = Date.now() + ttlMs;

    this.emit('ttl_updated', {
      key,
      newTtlMs: ttlMs,
      expiresAt: new Date(entry.expiresAt).toISOString(),
    });

    return true;
  }

  /**
   * Get TTL for an entry (in milliseconds)
   */
  getTTL(key: string): number | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();

    // Check if entry has expired
    if (entry.expiresAt <= now) {
      this.cache.delete(key);
      this.stats.expired++;
      return null;
    }

    return entry.expiresAt - now;
  }

  /**
   * Shutdown the cache and cleanup resources
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.clear();
    this.emit('shutdown');
  }

  /**
   * Get current size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Check if cache is empty
   */
  isEmpty(): boolean {
    return this.cache.size === 0;
  }

  /**
   * Check if cache is full
   */
  isFull(): boolean {
    return this.cache.size >= this.maxSize;
  }
}
