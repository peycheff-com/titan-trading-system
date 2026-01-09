/**
 * IdempotencyStore - Idempotent Order Execution Store
 * 
 * Ensures duplicate alerts don't create duplicate orders by caching
 * signal_id results. Uses Redis in production with in-memory fallback.
 * 
 * Requirements: 21.1-21.4
 * 
 * @module IdempotencyStore
 */

import { createClient } from 'redis';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  DEFAULT_TTL_MS: 24 * 60 * 60 * 1000, // 24 hours
  MAX_MEMORY_ENTRIES: 10000,
  REDIS_KEY_PREFIX: 'idempotency:',
};

//─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY STORE (FALLBACK)
//─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory store with TTL support for testing/fallback
 */
class MemoryStore {
  /**
   * @param {number} maxEntries - Maximum entries to store
   */
  constructor(maxEntries = CONFIG.MAX_MEMORY_ENTRIES) {
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  /**
   * Get value by key
   * @param {string} key - Key to retrieve
   * @returns {*} Value or null if not found/expired
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    
    return entry.value;
  }

  /**
   * Set value with TTL
   * @param {string} key - Key to set
   * @param {*} value - Value to store
   * @param {number} ttlMs - Time to live in milliseconds
   */
  set(key, value, ttlMs) {
    // Evict oldest if at capacity
    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Key to check
   * @returns {boolean} True if exists and not expired
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * Delete a key
   * @param {string} key - Key to delete
   * @returns {boolean} True if deleted
   */
  delete(key) {
    return this.store.delete(key);
  }

  /**
   * Clear all entries
   */
  clear() {
    this.store.clear();
  }

  /**
   * Get store size
   * @returns {number} Number of entries
   */
  size() {
    return this.store.size;
  }

  /**
   * Cleanup expired entries
   * @returns {number} Number of entries removed
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
      }
    }
    
    return removed;
  }
}

//─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY STORE CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * IdempotencyStore class
 * 
 * Features:
 * - Redis primary storage with configurable TTL
 * - In-memory fallback when Redis unavailable
 * - Automatic result caching for duplicate detection
 * - Structured result storage with metadata
 * 
 * Requirements:
 * - 21.1: Use signal_id as idempotency key
 * - 21.2: Return cached result for duplicates
 * - 21.3: Use Redis in production with configurable TTL
 * - 21.4: Fallback to in-memory for testing
 */
export class IdempotencyStore {
  /**
   * Create a new IdempotencyStore instance
   * @param {Object} options - Configuration options
   * @param {string} [options.redisUrl] - Redis connection URL
   * @param {number} [options.ttlMs] - Default TTL in milliseconds (default: 24h)
   * @param {number} [options.maxMemoryEntries] - Max in-memory entries (default: 10000)
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.redisUrl = options.redisUrl;
    this.ttlMs = options.ttlMs || CONFIG.DEFAULT_TTL_MS;
    this.maxMemoryEntries = options.maxMemoryEntries || CONFIG.MAX_MEMORY_ENTRIES;
    this.logger = options.logger || console;
    
    /** @type {MemoryStore} In-memory fallback store */
    this.memoryStore = new MemoryStore(this.maxMemoryEntries);
    
    /** @type {Object|null} Redis client */
    this.redisClient = null;
    
    /** @type {boolean} Redis connection status */
    this.redisConnected = false;
    
    /** @type {boolean} Redis initialization in progress */
    this.redisInitializing = false;
  }

  /**
   * Initialize Redis connection
   * @returns {Promise<boolean>} True if connected successfully
   */
  async initRedis() {
    if (!this.redisUrl) {
      this.logger.info('IdempotencyStore: No Redis URL configured, using memory store');
      return false;
    }

    if (this.redisConnected) {
      return true;
    }

    if (this.redisInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.redisConnected;
    }

    this.redisInitializing = true;

    try {
      this.redisClient = createClient({ url: this.redisUrl });
      
      this.redisClient.on('error', (err) => {
        this.logger.error({ error: err.message }, 'IdempotencyStore: Redis error');
        this.redisConnected = false;
      });

      this.redisClient.on('connect', () => {
        this.logger.info('IdempotencyStore: Redis connected');
        this.redisConnected = true;
      });

      this.redisClient.on('disconnect', () => {
        this.logger.warn('IdempotencyStore: Redis disconnected, using memory fallback');
        this.redisConnected = false;
      });

      await this.redisClient.connect();
      this.redisConnected = true;
      return true;
    } catch (err) {
      this.logger.warn({ error: err.message }, 'IdempotencyStore: Redis connection failed');
      this.redisConnected = false;
      return false;
    } finally {
      this.redisInitializing = false;
    }
  }

  /**
   * Get cached result for a signal_id
   * Requirements: 21.2 - Return cached result for duplicates
   * 
   * @param {string} signalId - Signal ID to check
   * @returns {Promise<Object|null>} Cached result or null
   */
  async get(signalId) {
    if (!signalId) {
      return null;
    }

    const key = `${CONFIG.REDIS_KEY_PREFIX}${signalId}`;

    // Try Redis first
    if (this.redisConnected && this.redisClient) {
      try {
        const data = await this.redisClient.get(key);
        if (data) {
          return JSON.parse(data);
        }
        return null;
      } catch (err) {
        this.logger.warn({ error: err.message }, 'IdempotencyStore: Redis get failed');
        // Fall through to memory store
      }
    }

    // Fallback to memory store
    return this.memoryStore.get(key);
  }

  /**
   * Store result for a signal_id
   * Requirements: 21.3 - Use Redis with configurable TTL
   * 
   * @param {string} signalId - Signal ID
   * @param {Object} result - Result to cache
   * @param {number} [ttlMs] - Optional TTL override
   * @returns {Promise<boolean>} True if stored successfully
   */
  async set(signalId, result, ttlMs = null) {
    if (!signalId) {
      return false;
    }

    const key = `${CONFIG.REDIS_KEY_PREFIX}${signalId}`;
    const ttl = ttlMs || this.ttlMs;
    const ttlSeconds = Math.ceil(ttl / 1000);

    const storedResult = {
      ...result,
      signal_id: signalId,
      cached_at: new Date().toISOString(),
    };

    // Try Redis first
    if (this.redisConnected && this.redisClient) {
      try {
        await this.redisClient.setEx(key, ttlSeconds, JSON.stringify(storedResult));
        return true;
      } catch (err) {
        this.logger.warn({ error: err.message }, 'IdempotencyStore: Redis set failed');
        // Fall through to memory store
      }
    }

    // Fallback to memory store
    this.memoryStore.set(key, storedResult, ttl);
    return true;
  }

  /**
   * Check if a signal_id has been processed
   * Requirements: 21.1 - Use signal_id as idempotency key
   * 
   * @param {string} signalId - Signal ID to check
   * @returns {Promise<boolean>} True if already processed
   */
  async has(signalId) {
    const result = await this.get(signalId);
    return result !== null;
  }

  /**
   * Process a signal with idempotency check
   * Convenience method that combines check and store
   * 
   * @param {string} signalId - Signal ID
   * @param {Function} processor - Async function to process if not cached
   * @returns {Promise<{result: Object, cached: boolean}>} Result and cache status
   */
  async processWithIdempotency(signalId, processor) {
    // Check for cached result
    const cached = await this.get(signalId);
    if (cached) {
      this.logger.info({ signal_id: signalId }, 'Returning cached result (idempotent)');
      return { result: cached, cached: true };
    }

    // Process and cache
    const result = await processor();
    await this.set(signalId, result);
    
    return { result, cached: false };
  }

  /**
   * Delete a cached result
   * @param {string} signalId - Signal ID to delete
   * @returns {Promise<boolean>} True if deleted
   */
  async delete(signalId) {
    if (!signalId) {
      return false;
    }

    const key = `${CONFIG.REDIS_KEY_PREFIX}${signalId}`;

    // Try Redis first
    if (this.redisConnected && this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (err) {
        this.logger.warn({ error: err.message }, 'IdempotencyStore: Redis delete failed');
      }
    }

    // Also delete from memory store
    return this.memoryStore.delete(key);
  }

  /**
   * Get store status
   * @returns {Object} Store status
   */
  getStatus() {
    return {
      redis_connected: this.redisConnected,
      memory_store_size: this.memoryStore.size(),
      ttl_ms: this.ttlMs,
    };
  }

  /**
   * Cleanup expired entries (memory store only)
   * @returns {number} Number of entries removed
   */
  cleanup() {
    return this.memoryStore.cleanup();
  }

  /**
   * Clear all cached results
   * @returns {Promise<void>}
   */
  async clear() {
    this.memoryStore.clear();

    if (this.redisConnected && this.redisClient) {
      try {
        const keys = await this.redisClient.keys(`${CONFIG.REDIS_KEY_PREFIX}*`);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      } catch (err) {
        this.logger.warn({ error: err.message }, 'IdempotencyStore: Redis clear failed');
      }
    }
  }

  /**
   * Close Redis connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.redisClient && this.redisConnected) {
      try {
        await this.redisClient.quit();
        this.redisConnected = false;
        this.logger.info('IdempotencyStore: Redis connection closed');
      } catch (err) {
        this.logger.error({ error: err.message }, 'IdempotencyStore: Error closing Redis');
      }
    }
  }
}

// Export MemoryStore for testing
export { MemoryStore };
