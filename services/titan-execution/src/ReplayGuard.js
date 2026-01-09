/**
 * ReplayGuard - Timestamp Validation and Replay Attack Prevention
 * 
 * Validates webhook requests against timestamp drift and replay attacks.
 * Uses Redis for signal_id caching with fallback to in-memory LRU cache.
 * 
 * Requirements: 65.1-65.8
 */

import { createClient } from 'redis';

/**
 * Simple LRU Cache implementation for fallback when Redis is unavailable
 */
class LRUCache {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) {
      return null;
    }
    // Move to end (most recently used)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value, ttlMs) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    const expiresAt = Date.now() + ttlMs;
    this.cache.set(key, { value, expiresAt });
  }

  has(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}


/**
 * ReplayGuard class for webhook security
 * 
 * Features:
 * - Timestamp drift validation (max 5000ms)
 * - Signal ID caching to prevent replay attacks
 * - Redis primary storage with LRU cache fallback
 * - Detailed rejection logging
 */
export class ReplayGuard {
  /**
   * @param {Object} options Configuration options
   * @param {string} options.redisUrl Redis connection URL
   * @param {number} options.maxDriftMs Maximum allowed timestamp drift (default: 5000ms)
   * @param {number} options.signalTtlMs Signal ID cache TTL (default: 300000ms = 5 minutes)
   * @param {number} options.lruCacheSize LRU cache size for fallback (default: 1000)
   * @param {Object} options.logger Logger instance
   */
  constructor(options = {}) {
    this.maxDriftMs = options.maxDriftMs || 5000;
    this.signalTtlMs = options.signalTtlMs || 300000; // 5 minutes
    this.lruCacheSize = options.lruCacheSize || 1000;
    this.logger = options.logger || console;
    this.redisUrl = options.redisUrl;
    
    // Initialize LRU cache for fallback
    this.lruCache = new LRUCache(this.lruCacheSize);
    
    // Redis client (initialized lazily)
    this.redisClient = null;
    this.redisConnected = false;
    this.redisInitializing = false;
  }

  /**
   * Initialize Redis connection
   * @returns {Promise<boolean>} True if connected successfully
   */
  async initRedis() {
    if (!this.redisUrl) {
      this.logger.info('ReplayGuard: No Redis URL configured, using LRU cache only');
      return false;
    }

    if (this.redisConnected) {
      return true;
    }

    if (this.redisInitializing) {
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.redisConnected;
    }

    this.redisInitializing = true;

    try {
      this.redisClient = createClient({ url: this.redisUrl });
      
      this.redisClient.on('error', (err) => {
        this.logger.error({ error: err.message }, 'ReplayGuard: Redis client error');
        this.redisConnected = false;
      });

      this.redisClient.on('connect', () => {
        this.logger.info('ReplayGuard: Redis connected');
        this.redisConnected = true;
      });

      this.redisClient.on('disconnect', () => {
        this.logger.warn('ReplayGuard: Redis disconnected, falling back to LRU cache');
        this.redisConnected = false;
      });

      await this.redisClient.connect();
      this.redisConnected = true;
      return true;
    } catch (err) {
      this.logger.warn({ error: err.message }, 'ReplayGuard: Failed to connect to Redis, using LRU cache');
      this.redisConnected = false;
      return false;
    } finally {
      this.redisInitializing = false;
    }
  }

  /**
   * Validate timestamp drift
   * Requirements: 65.1-65.3
   * 
   * @param {string} timestamp ISO 8601 timestamp from payload
   * @returns {Object} Validation result { valid: boolean, driftMs: number, error?: string }
   */
  validateTimestamp(timestamp) {
    if (!timestamp) {
      return {
        valid: false,
        driftMs: null,
        error: 'MISSING_TIMESTAMP',
        message: 'Payload must include timestamp field',
      };
    }

    const payloadTime = new Date(timestamp).getTime();
    
    if (isNaN(payloadTime)) {
      return {
        valid: false,
        driftMs: null,
        error: 'INVALID_TIMESTAMP',
        message: 'Timestamp must be valid ISO 8601 format',
      };
    }

    const serverNow = Date.now();
    const driftMs = Math.abs(serverNow - payloadTime);

    if (driftMs > this.maxDriftMs) {
      return {
        valid: false,
        driftMs,
        error: 'TIMESTAMP_DRIFT_EXCEEDED',
        message: `Timestamp drift ${driftMs}ms exceeds maximum ${this.maxDriftMs}ms`,
      };
    }

    return {
      valid: true,
      driftMs,
    };
  }

  /**
   * Check if signal_id is a duplicate (replay attack)
   * Requirements: 65.4-65.7
   * 
   * @param {string} signalId Signal ID to check
   * @returns {Promise<Object>} Check result { isDuplicate: boolean, error?: string }
   */
  async checkDuplicate(signalId) {
    if (!signalId) {
      return {
        isDuplicate: false,
        error: 'MISSING_SIGNAL_ID',
        message: 'Payload must include signal_id field',
      };
    }

    const cacheKey = `replay:${signalId}`;

    // Try Redis first
    if (this.redisConnected && this.redisClient) {
      try {
        const exists = await this.redisClient.exists(cacheKey);
        if (exists) {
          return {
            isDuplicate: true,
            error: 'DUPLICATE_SIGNAL_ID',
            message: 'Signal ID already processed (potential replay attack)',
          };
        }
        return { isDuplicate: false };
      } catch (err) {
        this.logger.warn({ error: err.message }, 'ReplayGuard: Redis check failed, falling back to LRU');
        // Fall through to LRU cache
      }
    }

    // Fallback to LRU cache
    if (this.lruCache.has(cacheKey)) {
      return {
        isDuplicate: true,
        error: 'DUPLICATE_SIGNAL_ID',
        message: 'Signal ID already processed (potential replay attack)',
      };
    }

    return { isDuplicate: false };
  }

  /**
   * Record signal_id to prevent replay
   * Requirements: 65.6-65.7
   * 
   * @param {string} signalId Signal ID to record
   * @returns {Promise<boolean>} True if recorded successfully
   */
  async recordSignal(signalId) {
    if (!signalId) {
      return false;
    }

    const cacheKey = `replay:${signalId}`;
    const ttlSeconds = Math.ceil(this.signalTtlMs / 1000);

    // Try Redis first
    if (this.redisConnected && this.redisClient) {
      try {
        await this.redisClient.setEx(cacheKey, ttlSeconds, Date.now().toString());
        return true;
      } catch (err) {
        this.logger.warn({ error: err.message }, 'ReplayGuard: Redis set failed, falling back to LRU');
        // Fall through to LRU cache
      }
    }

    // Fallback to LRU cache
    this.lruCache.set(cacheKey, Date.now(), this.signalTtlMs);
    return true;
  }


  /**
   * Validate a webhook request for replay attacks
   * Requirements: 65.1-65.8
   * 
   * @param {Object} payload Webhook payload
   * @param {string} sourceIp Source IP address for logging
   * @returns {Promise<Object>} Validation result
   */
  async validate(payload, sourceIp = 'unknown') {
    const { signal_id, timestamp } = payload || {};

    // Step 1: Validate timestamp drift
    const timestampResult = this.validateTimestamp(timestamp);
    
    if (!timestampResult.valid) {
      this.logRejection({
        signal_id,
        timestamp,
        drift_ms: timestampResult.driftMs,
        rejection_reason: timestampResult.error,
        source_ip: sourceIp,
      });
      
      return {
        valid: false,
        statusCode: 400,
        error: timestampResult.error,
        message: timestampResult.message,
        drift_ms: timestampResult.driftMs,
      };
    }

    // Step 2: Check for duplicate signal_id (replay attack)
    const duplicateResult = await this.checkDuplicate(signal_id);
    
    if (duplicateResult.isDuplicate) {
      this.logRejection({
        signal_id,
        timestamp,
        drift_ms: timestampResult.driftMs,
        rejection_reason: duplicateResult.error,
        source_ip: sourceIp,
      });
      
      return {
        valid: false,
        statusCode: 409,
        error: duplicateResult.error,
        message: duplicateResult.message,
        drift_ms: timestampResult.driftMs,
      };
    }

    // Step 3: Record signal_id to prevent future replays
    await this.recordSignal(signal_id);

    return {
      valid: true,
      drift_ms: timestampResult.driftMs,
    };
  }

  /**
   * Log rejection details
   * Requirements: 65.8
   * 
   * @param {Object} details Rejection details
   */
  logRejection(details) {
    this.logger.warn({
      type: 'REPLAY_GUARD_REJECTION',
      signal_id: details.signal_id,
      timestamp: details.timestamp,
      drift_ms: details.drift_ms,
      rejection_reason: details.rejection_reason,
      source_ip: details.source_ip,
      server_time: new Date().toISOString(),
    }, `ReplayGuard: Request rejected - ${details.rejection_reason}`);
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redisClient && this.redisConnected) {
      try {
        await this.redisClient.quit();
        this.redisConnected = false;
        this.logger.info('ReplayGuard: Redis connection closed');
      } catch (err) {
        this.logger.error({ error: err.message }, 'ReplayGuard: Error closing Redis connection');
      }
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      redisConnected: this.redisConnected,
      lruCacheSize: this.lruCache.size(),
      maxDriftMs: this.maxDriftMs,
      signalTtlMs: this.signalTtlMs,
    };
  }

  /**
   * Clear all cached signal IDs (for testing)
   */
  async clearCache() {
    this.lruCache.clear();
    
    if (this.redisConnected && this.redisClient) {
      try {
        // Delete all replay keys
        const keys = await this.redisClient.keys('replay:*');
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      } catch (err) {
        this.logger.warn({ error: err.message }, 'ReplayGuard: Failed to clear Redis cache');
      }
    }
  }
}

// Export LRUCache for testing
export { LRUCache };
