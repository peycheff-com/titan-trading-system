/**
 * Detector Registry
 * 
 * Central registry for all Phase 1 detectors.
 * Provides a unified interface for running detectors and caching results.
 * 
 * Requirements: 15.1 - Create DetectorRegistry
 */

/**
 * @typedef {Object} Tripwire
 * @property {string} symbol - Trading symbol
 * @property {number} triggerPrice - Price to trigger entry
 * @property {'LONG'|'SHORT'} direction - Trade direction
 * @property {string} trapType - Type of trap detected
 * @property {number} confidence - Confidence level (0-100)
 * @property {number} leverage - Recommended leverage
 * @property {number} estimatedCascadeSize - Expected price move
 * @property {boolean} activated - Whether trap is activated
 * @property {number} [targetPrice] - Take profit price
 * @property {number} [stopLoss] - Stop loss price
 */

/**
 * @typedef {Object} DetectorResult
 * @property {string} detector - Detector name
 * @property {string} symbol - Trading symbol
 * @property {Tripwire|null} tripwire - Detected tripwire or null
 * @property {number} timestamp - Detection timestamp
 * @property {boolean} cached - Whether result was from cache
 */

/**
 * @typedef {Object} CacheEntry
 * @property {Tripwire|null} result - Cached result
 * @property {number} timestamp - Cache timestamp
 */

const DEFAULT_CACHE_TTL_MS = 60000; // 60 seconds

export class DetectorRegistry {
  /**
   * Create a new DetectorRegistry
   * @param {Object} options - Configuration options
   * @param {Object} [options.logger] - Logger instance
   * @param {number} [options.cacheTtlMs] - Cache TTL in milliseconds
   */
  constructor(options = {}) {
    /** @type {Map<string, Object>} */
    this.detectors = new Map();
    
    /** @type {Map<string, CacheEntry>} */
    this.cache = new Map();
    
    /** @type {number} */
    this.cacheTtlMs = options.cacheTtlMs || DEFAULT_CACHE_TTL_MS;
    
    /** @type {Object} */
    this.logger = options.logger || {
      info: (data, msg) => console.log(`[INFO] ${msg}`, data),
      warn: (data, msg) => console.warn(`[WARN] ${msg}`, data),
      error: (data, msg) => console.error(`[ERROR] ${msg}`, data),
    };
  }

  /**
   * Register a detector
   * @param {string} name - Detector name
   * @param {Object} detector - Detector instance
   * @param {Function} detector.detect - Detection method
   */
  register(name, detector) {
    if (!name || typeof name !== 'string') {
      throw new Error('Detector name must be a non-empty string');
    }
    if (!detector || typeof detector.detect !== 'function') {
      throw new Error('Detector must have a detect() method');
    }
    
    this.detectors.set(name, detector);
    this.logger.info({ name }, 'Detector registered');
  }

  /**
   * Get a registered detector
   * @param {string} name - Detector name
   * @returns {Object|undefined} Detector instance or undefined
   */
  get(name) {
    return this.detectors.get(name);
  }

  /**
   * Get all registered detector names
   * @returns {string[]} Array of detector names
   */
  getRegisteredDetectors() {
    return Array.from(this.detectors.keys());
  }

  /**
   * Run a specific detector
   * @param {string} name - Detector name
   * @param {string} symbol - Trading symbol
   * @param {boolean} [useCache=true] - Whether to use cached results
   * @returns {Promise<DetectorResult>} Detection result
   */
  async run(name, symbol, useCache = true) {
    const detector = this.detectors.get(name);
    if (!detector) {
      throw new Error(`Detector '${name}' not found`);
    }

    const cacheKey = `${name}:${symbol}`;
    
    // Check cache
    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
        return {
          detector: name,
          symbol,
          tripwire: cached.result,
          timestamp: cached.timestamp,
          cached: true,
        };
      }
    }

    // Run detector
    const startTime = Date.now();
    let tripwire = null;
    
    try {
      tripwire = await detector.detect(symbol);
    } catch (error) {
      this.logger.error({ name, symbol, error: error.message }, 'Detector error');
      throw error;
    }

    const timestamp = Date.now();
    
    // Cache result
    this.cache.set(cacheKey, {
      result: tripwire,
      timestamp,
    });

    this.logger.info({
      name,
      symbol,
      detected: tripwire !== null,
      latencyMs: timestamp - startTime,
    }, 'Detector run complete');

    return {
      detector: name,
      symbol,
      tripwire,
      timestamp,
      cached: false,
    };
  }

  /**
   * Run all registered detectors for a symbol
   * @param {string} symbol - Trading symbol
   * @param {boolean} [useCache=true] - Whether to use cached results
   * @returns {Promise<DetectorResult[]>} Array of detection results
   */
  async runAll(symbol, useCache = true) {
    const results = [];
    
    for (const name of this.detectors.keys()) {
      try {
        const result = await this.run(name, symbol, useCache);
        results.push(result);
      } catch (error) {
        // Log error but continue with other detectors
        this.logger.error({ name, symbol, error: error.message }, 'Detector failed');
        results.push({
          detector: name,
          symbol,
          tripwire: null,
          timestamp: Date.now(),
          cached: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Clear cache for a specific detector/symbol or all cache
   * @param {string} [name] - Detector name (optional)
   * @param {string} [symbol] - Trading symbol (optional)
   */
  clearCache(name, symbol) {
    if (name && symbol) {
      this.cache.delete(`${name}:${symbol}`);
    } else if (name) {
      // Clear all cache entries for this detector
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${name}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    let validEntries = 0;
    let expiredEntries = 0;
    const now = Date.now();

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp < this.cacheTtlMs) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
      cacheTtlMs: this.cacheTtlMs,
    };
  }
}

export default DetectorRegistry;
