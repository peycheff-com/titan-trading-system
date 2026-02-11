/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * CacheManager - Redis with in-memory fallback strategy
 *
 * Provides reliable caching with Redis as primary and in-memory as fallback.
 * Handles Redis unavailability gracefully.
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import { InMemoryCache } from './InMemoryCache.js';
import { getLogger } from '../monitoring/index.js';

const logger = getLogger();

/**
 * Cache namespaces
 */
export enum CacheNamespace {
  RISK = 'risk',
  QUERY = 'query',
  CORRELATION = 'correlation',
  SESSION = 'session',
  METRICS = 'metrics',
  ALLOCATION = 'allocation',
  PERFORMANCE = 'performance',
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  redis?: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    connectTimeout?: number;
    commandTimeout?: number;
    retryDelayOnFailover?: number;
    maxRetriesPerRequest?: number;
  };

  // Fallback settings
  enableInMemoryFallback: boolean;
  inMemoryMaxSize: number;
  inMemoryTtlMs: number;

  // Health check settings
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  maxReconnectAttempts: number;
  reconnectDelayMs: number;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  enableInMemoryFallback: true,
  inMemoryMaxSize: 1000,
  inMemoryTtlMs: 300000,
  healthCheckIntervalMs: 30000,
  healthCheckTimeoutMs: 5000,
  maxReconnectAttempts: 5,
  reconnectDelayMs: 5000,
};

/**
 * Cache stats
 */
export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  memoryUsage: number;
}

/**
 * Cache operation result
 */
export interface CacheResult<T = unknown> {
  success: boolean;
  value?: T;
  source: 'redis' | 'memory' | 'none';
  error?: string;
}

/**
 * Cache status
 */
export interface CacheStatus {
  redisConnected: boolean;
  fallbackActive: boolean;
  totalOperations: number;
  hitRate: number;
  averageResponseTime: number;
}

/**
 * Cache metrics
 */
export interface CacheMetrics {
  redisConnected: boolean;
  fallbackActive: boolean;
  totalOperations: number;
  redisHits: number;
  redisMisses: number;
  memoryHits: number;
  memoryMisses: number;
  errors: number;
}

/**
 * Cache manager with Redis primary and in-memory fallback
 */
export class CacheManager extends EventEmitter {
  private redisClient: ReturnType<typeof createClient> | null = null;
  private readonly inMemoryCache: InMemoryCache;
  private readonly config: CacheConfig;
  private readonly metrics: CacheMetrics;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;
  private operationCount: number = 0;
  private totalResponseTime: number = 0;

  constructor(config: CacheConfig = DEFAULT_CACHE_CONFIG) {
    super();
    this.config = config;
    this.inMemoryCache = new InMemoryCache(config.inMemoryMaxSize, config.inMemoryTtlMs);
    this.metrics = {
      redisConnected: false,
      fallbackActive: false,
      totalOperations: 0,
      redisHits: 0,
      redisMisses: 0,
      memoryHits: 0,
      memoryMisses: 0,
      errors: 0,
    };
  }

  /**
   * Create cache configuration from environment variables
   */
  static createConfigFromEnv(): CacheConfig {
    const redisUrl = process.env.REDIS_URL;

    let redisConfig: CacheConfig['redis'] = undefined;
    const redisDisabled = process.env.REDIS_DISABLED === 'true';

    if (redisUrl && !redisDisabled) {
      redisConfig = { url: redisUrl };
    } else if (process.env.REDIS_HOST) {
      redisConfig = {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
      };
    }

    return {
      redis: redisConfig,
      enableInMemoryFallback: process.env.CACHE_ENABLE_MEMORY_FALLBACK !== 'false',
      inMemoryMaxSize: parseInt(process.env.CACHE_MEMORY_MAX_SIZE || '1000'),
      inMemoryTtlMs: parseInt(process.env.CACHE_MEMORY_TTL || '300000'),
      healthCheckIntervalMs: parseInt(process.env.CACHE_HEALTH_CHECK_INTERVAL || '30000'),
      healthCheckTimeoutMs: parseInt(process.env.CACHE_HEALTH_CHECK_TIMEOUT || '5000'),
      maxReconnectAttempts: parseInt(process.env.CACHE_MAX_RECONNECT_ATTEMPTS || '5'),
      reconnectDelayMs: parseInt(process.env.CACHE_RECONNECT_DELAY || '5000'),
    };
  }

  /**
   * Initialize cache manager
   */
  async initialize(): Promise<void> {
    this.inMemoryCache.initialize();

    if (this.config.redis) {
      await this.initializeRedis();
    } else {
      logger.info('Redis not configured, using in-memory cache only');

      this.metrics.fallbackActive = true;
    }

    // Emit initialized event
    this.emit('initialized', {
      redisEnabled: !!this.config.redis,
      fallbackActive: this.metrics.fallbackActive,
    });
  }

  private async initializeRedis(): Promise<void> {
    if (!this.config.redis) return;

    try {
      this.redisClient = createClient({
        url: this.config.redis.url,
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port,
        },
      });

      this.redisClient.on('error', (err: Error) => {
        logger.error('Redis error:', err);

        this.metrics.redisConnected = false;

        this.metrics.fallbackActive = true;
      });

      this.redisClient.on('connect', () => {
        logger.info('Redis connected');

        this.metrics.redisConnected = true;

        this.metrics.fallbackActive = false;
      });

      await this.redisClient.connect();
    } catch (error) {
      (
        logger as {
          warn: (msg: string, ctx: undefined, meta: { error: unknown }) => void;
        }
      ).warn('Failed to connect to Redis, using fallback:', undefined, {
        error,
      });

      this.metrics.redisConnected = false;

      this.metrics.fallbackActive = true;
    }
  }

  /**
   * Generate namespaced key
   */
  private getKey(namespace: string | CacheNamespace, key: string): string {
    return `${namespace}:${key}`;
  }

  /**
   * Get value from cache
   * Supports both get(key) and get(namespace, key) signatures
   */
  async get<T>(arg1: string | CacheNamespace, arg2?: string): Promise<CacheResult<T>> {
    const startTime = Date.now();
    const key = arg2 ? this.getKey(arg1, arg2) : (arg1 as string);

    this.metrics.totalOperations++;

    // Try Redis first
    if (this.redisClient && this.metrics.redisConnected) {
      try {
        const value = await this.redisClient.get(key);
        const duration = Date.now() - startTime;

        this.totalResponseTime += duration;

        if (value) {
          this.metrics.redisHits++;
          this.emit('cache:hit', { source: 'redis', key, duration });
          return {
            success: true,
            value: JSON.parse(value) as T,
            source: 'redis',
          };
        } else {
          this.metrics.redisMisses++;
          this.emit('cache:miss', { source: 'redis', key, duration });
          return {
            success: false,
            source: 'redis',
          };
        }
      } catch (err) {
        this.metrics.errors++;
        const duration = Date.now() - startTime;
        this.emit('cache:error', {
          source: 'redis',
          key,
          error: err instanceof Error ? err.message : 'Unknown error',
          duration,
        });
        // Fall through to memory cache
      }
    }

    // Fallback to memory
    if (this.config.enableInMemoryFallback) {
      const value = this.inMemoryCache.get<T>(key);
      const duration = Date.now() - startTime;

      this.totalResponseTime += duration;

      if (value !== undefined) {
        this.metrics.memoryHits++;
        this.emit('cache:hit', { source: 'memory', key, duration });
        return {
          success: true,
          value,
          source: 'memory',
        };
      } else {
        this.metrics.memoryMisses++;
        this.emit('cache:miss', { source: 'memory', key, duration });
        return {
          success: false,
          source: 'memory',
        };
      }
    }

    return {
      success: false,
      source: 'none',
    };
  }

  /**
   * Set value in cache
   * Supports both set(key, value, ttl?) and set(namespace, key, value, ttl?)
   */
  async set<T>(
    arg1: string | CacheNamespace,
    arg2: string | T,
    arg3?: T | number,
    arg4?: number,
  ): Promise<CacheResult<void>> {
    const isNamespace =
      typeof arg1 === 'string' && Object.values(CacheNamespace).includes(arg1 as CacheNamespace);

    const key = isNamespace
      ? this.getKey(arg1 as CacheNamespace, arg2 as string)
      : (arg1 as string);
    const value = (isNamespace ? arg3 : arg2) as T;
    const ttl = (isNamespace ? arg4 : arg3) as number | undefined;

    const stringValue = JSON.stringify(value);

    this.metrics.totalOperations++;

    // Try Redis first
    if (this.redisClient && this.metrics.redisConnected) {
      try {
        if (ttl) {
          await this.redisClient.setEx(key, ttl, stringValue);
        } else {
          await this.redisClient.set(key, stringValue);
        }
        return {
          success: true,
          source: 'redis',
        };
      } catch (err) {
        this.metrics.errors++;
        logger.error('Redis set error:', err);
        // Fall through to memory cache
      }
    }

    // Fallback to memory
    if (this.config.enableInMemoryFallback) {
      this.inMemoryCache.set(key, value, ttl ? ttl * 1000 : this.config.inMemoryTtlMs);
      return {
        success: true,
        source: 'memory',
      };
    }

    return {
      success: false,
      source: 'none',
      error: 'No cache backend available',
    };
  }

  /**
   * Delete value from cache
   * Supports delete(key) and delete(namespace, key)
   */
  async delete(arg1: string | CacheNamespace, arg2?: string): Promise<CacheResult<void>> {
    const key = arg2 ? this.getKey(arg1, arg2) : (arg1 as string);

    this.metrics.totalOperations++;

    let redisSuccess = false;

    let memorySuccess = false;

    if (this.redisClient && this.metrics.redisConnected) {
      try {
        await this.redisClient.del(key);
        redisSuccess = true;
      } catch (err) {
        this.metrics.errors++;
        logger.error('Redis delete error:', err);
      }
    }

    if (this.config.enableInMemoryFallback) {
      this.inMemoryCache.delete(key);
      memorySuccess = true;
    }

    if (redisSuccess) {
      return { success: true, source: 'redis' };
    } else if (memorySuccess) {
      return { success: true, source: 'memory' };
    } else {
      return { success: false, source: 'none' };
    }
  }

  /**
   * Invalidate keys by pattern
   */
  async invalidatePattern(namespace: CacheNamespace, pattern: string): Promise<void> {
    const fullPattern = this.getKey(namespace, pattern);

    if (this.redisClient && this.metrics.redisConnected) {
      try {
        const keys = await this.redisClient.keys(fullPattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      } catch (err) {
        logger.error('Redis invalidatePattern error:', err);
      }
    }

    // Memory cache doesn't efficiently support patterns in this implementation
    // Ideally we iterate keys
    // For now, assuming Redis is primary
  }

  /**
   * Invalidate entire namespace
   */
  async invalidateNamespace(namespace: CacheNamespace): Promise<void> {
    await this.invalidatePattern(namespace, '*');
  }

  async clear(): Promise<CacheResult<void>> {
    this.metrics.totalOperations++;

    let redisSuccess = false;

    let memorySuccess = false;

    if (this.redisClient && this.metrics.redisConnected) {
      try {
        await this.redisClient.flushDb();
        redisSuccess = true;
      } catch (err) {
        this.metrics.errors++;
        logger.error('Redis clear error:', err);
      }
    }

    if (this.config.enableInMemoryFallback) {
      this.inMemoryCache.clear();
      memorySuccess = true;
    }

    if (redisSuccess) {
      return { success: true, source: 'redis' };
    } else if (memorySuccess) {
      return { success: true, source: 'memory' };
    } else {
      return { success: false, source: 'none' };
    }
  }

  /**
   * Check if cache is healthy
   */
  isHealthy(): boolean {
    return this.metrics.redisConnected || this.config.enableInMemoryFallback;
  }

  /**
   * Get cache status
   */
  getStatus(): CacheStatus {
    const hitRate =
      this.metrics.totalOperations > 0
        ? (this.metrics.redisHits + this.metrics.memoryHits) / this.metrics.totalOperations
        : 0;

    const averageResponseTime =
      this.metrics.totalOperations > 0 ? this.totalResponseTime / this.metrics.totalOperations : 0;

    return {
      redisConnected: this.metrics.redisConnected,
      fallbackActive: this.metrics.fallbackActive,
      totalOperations: this.metrics.totalOperations,
      hitRate,
      averageResponseTime,
    };
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.redisClient) {
      try {
        await this.redisClient.disconnect();
      } catch (err) {
        logger.error('Redis disconnect error:', err);
      }
    }
    this.inMemoryCache.clear();
  }
}
