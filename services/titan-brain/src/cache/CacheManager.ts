/**
 * CacheManager - Redis with in-memory fallback strategy
 * 
 * Provides reliable caching with Redis as primary and in-memory as fallback.
 * Handles Redis unavailability gracefully for Railway deployment.
 * 
 * Requirements: 3.2.1, 3.2.2, 3.2.3, 3.2.4, 3.2.5
 */

import { EventEmitter } from 'events';
import { createClient, RedisClientType } from 'redis';
import { InMemoryCache } from './InMemoryCache.js';

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
 * Cache operation result
 */
export interface CacheResult<T = any> {
  success: boolean;
  value?: T;
  source: 'redis' | 'memory' | 'none';
  error?: string;
  duration: number;
}

/**
 * Cache metrics
 */
export interface CacheMetrics {
  redisConnected: boolean;
  redisHits: number;
  redisMisses: number;
  redisErrors: number;
  memoryHits: number;
  memoryMisses: number;
  totalOperations: number;
  averageResponseTime: number;
  lastHealthCheck: number;
  fallbackActive: boolean;
}

/**
 * Cache manager with Redis primary and in-memory fallback
 */
export class CacheManager extends EventEmitter {
  private redisClient: RedisClientType | null = null;
  private inMemoryCache: InMemoryCache;
  private config: CacheConfig;
  private metrics: CacheMetrics;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private isShuttingDown: boolean = false;
  private responseTimeHistory: number[] = [];

  constructor(config: CacheConfig) {
    super();
    this.config = config;
    this.inMemoryCache = new InMemoryCache(config.inMemoryMaxSize, config.inMemoryTtlMs);
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize metrics object
   */
  private initializeMetrics(): CacheMetrics {
    return {
      redisConnected: false,
      redisHits: 0,
      redisMisses: 0,
      redisErrors: 0,
      memoryHits: 0,
      memoryMisses: 0,
      totalOperations: 0,
      averageResponseTime: 0,
      lastHealthCheck: 0,
      fallbackActive: false
    };
  }

  /**
   * Create cache configuration from environment variables
   */
  static createConfigFromEnv(): CacheConfig {
    // Parse Railway REDIS_URL if available
    const redisUrl = process.env.REDIS_URL;
    let redisConfig: CacheConfig['redis'] = undefined;

    if (redisUrl) {
      redisConfig = { url: redisUrl };
    } else if (process.env.REDIS_HOST) {
      redisConfig = {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000'),
        commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
        retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY || '100'),
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3')
      };
    }

    return {
      redis: redisConfig,
      enableInMemoryFallback: process.env.CACHE_ENABLE_MEMORY_FALLBACK !== 'false',
      inMemoryMaxSize: parseInt(process.env.CACHE_MEMORY_MAX_SIZE || '1000'),
      inMemoryTtlMs: parseInt(process.env.CACHE_MEMORY_TTL || '300000'), // 5 minutes
      healthCheckIntervalMs: parseInt(process.env.CACHE_HEALTH_CHECK_INTERVAL || '30000'),
      healthCheckTimeoutMs: parseInt(process.env.CACHE_HEALTH_CHECK_TIMEOUT || '5000'),
      maxReconnectAttempts: parseInt(process.env.CACHE_MAX_RECONNECT_ATTEMPTS || '5'),
      reconnectDelayMs: parseInt(process.env.CACHE_RECONNECT_DELAY || '5000')
    };
  }

  /**
   * Initialize cache manager
   */
  async initialize(): Promise<void> {
    // Initialize in-memory cache (always available)
    this.inMemoryCache.initialize();

    // Initialize Redis if configured
    if (this.config.redis) {
      await this.initializeRedis();
    } else {
      console.log('Redis not configured, using in-memory cache only');
      this.metrics.fallbackActive = true;
    }

    // Start health check monitoring
    this.startHealthCheckMonitoring();

    this.emit('initialized', { 
      redisEnabled: !!this.config.redis,
      fallbackActive: this.metrics.fallbackActive 
    });
  }

  /**
   * Initialize Redis connection
   */
  private async initializeRedis(): Promise<void> {
    if (!this.config.redis) return;

    try {
      // Create Redis client
      this.redisClient = createClient({
        url: this.config.redis.url,
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port,
          connectTimeout: this.config.redis.connectTimeout,
          reconnectStrategy: (retries) => {
            if (retries > this.config.maxReconnectAttempts) {
              return false; // Stop reconnecting
            }
            return Math.min(retries * this.config.reconnectDelayMs, 30000);
          }
        },
        commandsQueueMaxLength: this.config.redis.maxRetriesPerRequest || 3,
        password: this.config.redis.password,
        database: this.config.redis.db
      });

      // Set up Redis event listeners
      this.setupRedisEventListeners();

      // Connect to Redis
      await this.redisClient.connect();
      
      this.metrics.redisConnected = true;
      this.metrics.fallbackActive = false;
      this.reconnectAttempts = 0;

      this.emit('redis:connected');
    } catch (error) {
      console.warn('Failed to connect to Redis, using in-memory fallback:', error);
      this.metrics.redisConnected = false;
      this.metrics.fallbackActive = true;
      this.redisClient = null;
      
      this.emit('redis:connection:failed', { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Set up Redis event listeners
   */
  private setupRedisEventListeners(): void {
    if (!this.redisClient) return;

    this.redisClient.on('connect', () => {
      this.metrics.redisConnected = true;
      this.metrics.fallbackActive = false;
      this.reconnectAttempts = 0;
      this.emit('redis:connected');
    });

    this.redisClient.on('ready', () => {
      this.emit('redis:ready');
    });

    this.redisClient.on('error', (error) => {
      this.metrics.redisErrors++;
      this.metrics.redisConnected = false;
      this.metrics.fallbackActive = true;
      
      this.emit('redis:error', { 
        error: error.message,
        totalErrors: this.metrics.redisErrors 
      });
    });

    this.redisClient.on('end', () => {
      this.metrics.redisConnected = false;
      this.metrics.fallbackActive = true;
      this.emit('redis:disconnected');
    });

    this.redisClient.on('reconnecting', () => {
      this.reconnectAttempts++;
      this.emit('redis:reconnecting', { 
        attempt: this.reconnectAttempts,
        maxAttempts: this.config.maxReconnectAttempts 
      });
    });
  }

  /**
   * Start health check monitoring
   */
  private startHealthCheckMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    if (this.isShuttingDown) return;

    const startTime = Date.now();
    
    try {
      if (this.redisClient && this.metrics.redisConnected) {
        // Test Redis connection
        await Promise.race([
          this.redisClient.ping(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Redis health check timeout')), this.config.healthCheckTimeoutMs)
          )
        ]);
        
        this.metrics.lastHealthCheck = Date.now();
        this.emit('health:check:success', { 
          source: 'redis',
          duration: Date.now() - startTime 
        });
      } else {
        // Test in-memory cache
        const testKey = '__health_check__';
        const testValue = Date.now().toString();
        
        this.inMemoryCache.set(testKey, testValue, 1000); // 1 second TTL
        const retrieved = this.inMemoryCache.get(testKey);
        
        if (retrieved !== testValue) {
          throw new Error('In-memory cache health check failed');
        }
        
        this.inMemoryCache.delete(testKey);
        this.metrics.lastHealthCheck = Date.now();
        
        this.emit('health:check:success', { 
          source: 'memory',
          duration: Date.now() - startTime 
        });
      }
    } catch (error) {
      this.metrics.lastHealthCheck = Date.now();
      this.emit('health:check:failure', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      });
    }
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string): Promise<CacheResult<T>> {
    const startTime = Date.now();
    this.metrics.totalOperations++;

    // Try Redis first if available
    if (this.redisClient && this.metrics.redisConnected) {
      try {
        const value = await this.redisClient.get(key);
        const duration = Date.now() - startTime;
        this.updateResponseTimeMetrics(duration);

        if (value !== null) {
          this.metrics.redisHits++;
          this.emit('cache:hit', { source: 'redis', key, duration });
          
          return {
            success: true,
            value: JSON.parse(value),
            source: 'redis',
            duration
          };
        } else {
          this.metrics.redisMisses++;
          this.emit('cache:miss', { source: 'redis', key, duration });
          
          return {
            success: false,
            source: 'redis',
            duration
          };
        }
      } catch (error) {
        this.metrics.redisErrors++;
        this.emit('cache:error', { 
          source: 'redis', 
          key, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        
        // Fall through to in-memory cache
      }
    }

    // Use in-memory cache as fallback
    if (this.config.enableInMemoryFallback) {
      const value = this.inMemoryCache.get<T>(key);
      const duration = Date.now() - startTime;
      this.updateResponseTimeMetrics(duration);

      if (value !== undefined) {
        this.metrics.memoryHits++;
        this.emit('cache:hit', { source: 'memory', key, duration });
        
        return {
          success: true,
          value,
          source: 'memory',
          duration
        };
      } else {
        this.metrics.memoryMisses++;
        this.emit('cache:miss', { source: 'memory', key, duration });
        
        return {
          success: false,
          source: 'memory',
          duration
        };
      }
    }

    // No cache available
    return {
      success: false,
      source: 'none',
      duration: Date.now() - startTime
    };
  }

  /**
   * Set a value in cache
   */
  async set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<CacheResult<void>> {
    const startTime = Date.now();
    this.metrics.totalOperations++;

    // Try Redis first if available
    if (this.redisClient && this.metrics.redisConnected) {
      try {
        const serializedValue = JSON.stringify(value);
        
        if (ttlSeconds) {
          await this.redisClient.setEx(key, ttlSeconds, serializedValue);
        } else {
          await this.redisClient.set(key, serializedValue);
        }
        
        const duration = Date.now() - startTime;
        this.updateResponseTimeMetrics(duration);
        this.emit('cache:set', { source: 'redis', key, duration });
        
        return {
          success: true,
          source: 'redis',
          duration
        };
      } catch (error) {
        this.metrics.redisErrors++;
        this.emit('cache:error', { 
          source: 'redis', 
          key, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        
        // Fall through to in-memory cache
      }
    }

    // Use in-memory cache as fallback
    if (this.config.enableInMemoryFallback) {
      const ttlMs = ttlSeconds ? ttlSeconds * 1000 : this.config.inMemoryTtlMs;
      this.inMemoryCache.set(key, value, ttlMs);
      
      const duration = Date.now() - startTime;
      this.updateResponseTimeMetrics(duration);
      this.emit('cache:set', { source: 'memory', key, duration });
      
      return {
        success: true,
        source: 'memory',
        duration
      };
    }

    // No cache available
    return {
      success: false,
      source: 'none',
      duration: Date.now() - startTime,
      error: 'No cache backend available'
    };
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<CacheResult<void>> {
    const startTime = Date.now();
    this.metrics.totalOperations++;

    let redisSuccess = false;
    let memorySuccess = false;

    // Try Redis first if available
    if (this.redisClient && this.metrics.redisConnected) {
      try {
        await this.redisClient.del(key);
        redisSuccess = true;
        this.emit('cache:delete', { source: 'redis', key });
      } catch (error) {
        this.metrics.redisErrors++;
        this.emit('cache:error', { 
          source: 'redis', 
          key, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    // Also delete from in-memory cache
    if (this.config.enableInMemoryFallback) {
      memorySuccess = this.inMemoryCache.delete(key);
      if (memorySuccess) {
        this.emit('cache:delete', { source: 'memory', key });
      }
    }

    const duration = Date.now() - startTime;
    this.updateResponseTimeMetrics(duration);

    return {
      success: redisSuccess || memorySuccess,
      source: redisSuccess ? 'redis' : (memorySuccess ? 'memory' : 'none'),
      duration
    };
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<CacheResult<void>> {
    const startTime = Date.now();
    this.metrics.totalOperations++;

    let redisSuccess = false;
    let memorySuccess = false;

    // Clear Redis if available
    if (this.redisClient && this.metrics.redisConnected) {
      try {
        await this.redisClient.flushDb();
        redisSuccess = true;
        this.emit('cache:clear', { source: 'redis' });
      } catch (error) {
        this.metrics.redisErrors++;
        this.emit('cache:error', { 
          source: 'redis', 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    // Clear in-memory cache
    if (this.config.enableInMemoryFallback) {
      this.inMemoryCache.clear();
      memorySuccess = true;
      this.emit('cache:clear', { source: 'memory' });
    }

    const duration = Date.now() - startTime;
    this.updateResponseTimeMetrics(duration);

    return {
      success: redisSuccess || memorySuccess,
      source: redisSuccess ? 'redis' : (memorySuccess ? 'memory' : 'none'),
      duration
    };
  }

  /**
   * Update response time metrics
   */
  private updateResponseTimeMetrics(duration: number): void {
    this.responseTimeHistory.push(duration);
    
    // Keep only last 100 operations for average calculation
    if (this.responseTimeHistory.length > 100) {
      this.responseTimeHistory.shift();
    }
    
    // Calculate average response time
    this.metrics.averageResponseTime = this.responseTimeHistory.reduce((sum, time) => sum + time, 0) / this.responseTimeHistory.length;
  }

  /**
   * Get current cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Check if cache is healthy
   */
  isHealthy(): boolean {
    return this.metrics.redisConnected || this.metrics.fallbackActive;
  }

  /**
   * Get cache status
   */
  getStatus(): {
    redisConnected: boolean;
    fallbackActive: boolean;
    totalOperations: number;
    hitRate: number;
    averageResponseTime: number;
  } {
    const totalHits = this.metrics.redisHits + this.metrics.memoryHits;
    const totalMisses = this.metrics.redisMisses + this.metrics.memoryMisses;
    const hitRate = totalHits + totalMisses > 0 ? (totalHits / (totalHits + totalMisses)) * 100 : 0;

    return {
      redisConnected: this.metrics.redisConnected,
      fallbackActive: this.metrics.fallbackActive,
      totalOperations: this.metrics.totalOperations,
      hitRate,
      averageResponseTime: this.metrics.averageResponseTime
    };
  }

  /**
   * Gracefully shutdown the cache manager
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Stop health check monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Disconnect Redis
    if (this.redisClient) {
      try {
        await this.redisClient.disconnect();
      } catch (error) {
        console.warn('Error disconnecting Redis:', error);
      }
      this.redisClient = null;
    }

    // Clear in-memory cache
    this.inMemoryCache.clear();

    this.emit('shutdown');
  }
}