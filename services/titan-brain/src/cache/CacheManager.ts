/**
 * CacheManager - Redis with in-memory fallback strategy
 *
 * Provides reliable caching with Redis as primary and in-memory as fallback.
 * Handles Redis unavailability gracefully.
 */

import { EventEmitter } from "events";
import { createClient, RedisClientType } from "redis";
import { InMemoryCache } from "./InMemoryCache.js";

/**
 * Cache namespaces
 */
export enum CacheNamespace {
  RISK = "risk",
  QUERY = "query",
  CORRELATION = "correlation",
  SESSION = "session",
  METRICS = "metrics",
  ALLOCATION = "allocation",
  PERFORMANCE = "performance",
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
 * Cache manager with Redis primary and in-memory fallback
 */
export class CacheManager extends EventEmitter {
  private redisClient: RedisClientType | null = null;
  private inMemoryCache: InMemoryCache;
  private config: CacheConfig;
  private metrics: any; // Simplified metrics
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;

  constructor(config: CacheConfig = DEFAULT_CACHE_CONFIG) {
    super();
    this.config = config;
    this.inMemoryCache = new InMemoryCache(
      config.inMemoryMaxSize,
      config.inMemoryTtlMs,
    );
    this.metrics = {
      redisConnected: false,
      fallbackActive: false,
    };
  }

  /**
   * Create cache configuration from environment variables
   */
  static createConfigFromEnv(): CacheConfig {
    const redisUrl = process.env.REDIS_URL;
    let redisConfig: CacheConfig["redis"] = undefined;

    if (redisUrl) {
      redisConfig = { url: redisUrl };
    } else if (process.env.REDIS_HOST) {
      redisConfig = {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || "6379"),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || "0"),
      };
    }

    return {
      redis: redisConfig,
      enableInMemoryFallback:
        process.env.CACHE_ENABLE_MEMORY_FALLBACK !== "false",
      inMemoryMaxSize: parseInt(process.env.CACHE_MEMORY_MAX_SIZE || "1000"),
      inMemoryTtlMs: parseInt(process.env.CACHE_MEMORY_TTL || "300000"),
      healthCheckIntervalMs: parseInt(
        process.env.CACHE_HEALTH_CHECK_INTERVAL || "30000",
      ),
      healthCheckTimeoutMs: parseInt(
        process.env.CACHE_HEALTH_CHECK_TIMEOUT || "5000",
      ),
      maxReconnectAttempts: parseInt(
        process.env.CACHE_MAX_RECONNECT_ATTEMPTS || "5",
      ),
      reconnectDelayMs: parseInt(process.env.CACHE_RECONNECT_DELAY || "5000"),
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
      console.log("Redis not configured, using in-memory cache only");
      this.metrics.fallbackActive = true;
    }
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

      this.redisClient.on("error", (err) => {
        console.error("Redis error:", err);
        this.metrics.redisConnected = false;
        this.metrics.fallbackActive = true;
      });

      this.redisClient.on("connect", () => {
        console.log("Redis connected");
        this.metrics.redisConnected = true;
        this.metrics.fallbackActive = false;
      });

      await this.redisClient.connect();
    } catch (error) {
      console.warn("Failed to connect to Redis, using fallback:", error);
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
  async get<T>(
    arg1: string | CacheNamespace,
    arg2?: string,
  ): Promise<T | null> {
    let key: string;

    if (arg2) {
      key = this.getKey(arg1, arg2);
    } else {
      key = arg1 as string;
    }

    // specific handling for "key" only calls if needed, but assuming namespace usage mostly

    // Try Redis
    if (this.redisClient && this.metrics.redisConnected) {
      try {
        const value = await this.redisClient.get(key);
        if (value) {
          return JSON.parse(value) as T;
        }
        return null; // Redis miss
      } catch (err) {
        console.error("Redis get error:", err);
        // Fallback
      }
    }

    // Fallback to memory
    if (this.config.enableInMemoryFallback) {
      const value = this.inMemoryCache.get<T>(key);
      return value !== undefined ? value : null;
    }

    return null;
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
  ): Promise<void> {
    let key: string;
    let value: T;
    let ttl: number | undefined;

    if (typeof arg2 === "string" && arg3 !== undefined) {
      // set(namespace, key, value, ttl?)
      key = this.getKey(arg1, arg2);
      value = arg3 as T;
      ttl = arg4;
    } else {
      // set(key, value, ttl?)
      key = arg1 as string;
      value = arg2 as T;
      ttl = arg3 as number | undefined;
    }

    const stringValue = JSON.stringify(value);

    // Try Redis
    if (this.redisClient && this.metrics.redisConnected) {
      try {
        if (ttl) {
          await this.redisClient.setEx(key, ttl, stringValue);
        } else {
          await this.redisClient.set(key, stringValue);
        }
      } catch (err) {
        console.error("Redis set error:", err);
        // Fallback
      }
    }

    // Fallback to memory
    if (this.config.enableInMemoryFallback) {
      this.inMemoryCache.set(
        key,
        value,
        ttl ? ttl * 1000 : this.config.inMemoryTtlMs,
      );
    }
  }

  /**
   * Delete value from cache
   * Supports delete(key) and delete(namespace, key)
   */
  async delete(arg1: string | CacheNamespace, arg2?: string): Promise<void> {
    let key: string;
    if (arg2) {
      key = this.getKey(arg1, arg2);
    } else {
      key = arg1 as string;
    }

    if (this.redisClient && this.metrics.redisConnected) {
      try {
        await this.redisClient.del(key);
      } catch (err) {
        console.error("Redis delete error:", err);
      }
    }

    if (this.config.enableInMemoryFallback) {
      this.inMemoryCache.delete(key);
    }
  }

  /**
   * Invalidate keys by pattern
   */
  async invalidatePattern(
    namespace: CacheNamespace,
    pattern: string,
  ): Promise<void> {
    const fullPattern = this.getKey(namespace, pattern);

    if (this.redisClient && this.metrics.redisConnected) {
      try {
        const keys = await this.redisClient.keys(fullPattern);
        if (keys.length > 0) {
          await this.redisClient.del(keys);
        }
      } catch (err) {
        console.error("Redis invalidatePattern error:", err);
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
    await this.invalidatePattern(namespace, "*");
  }

  async clear(): Promise<void> {
    if (this.redisClient && this.metrics.redisConnected) {
      await this.redisClient.flushDb();
    }
    this.inMemoryCache.clear();
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.redisClient) {
      await this.redisClient.disconnect();
    }
    this.inMemoryCache.clear();
  }
}
