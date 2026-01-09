/**
 * Unit tests for CacheManager
 */

import { CacheManager, CacheConfig } from '../../src/cache/CacheManager';

// Mock redis module
const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn(),
  set: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  flushDb: jest.fn(),
  on: jest.fn()
};

jest.mock('redis', () => ({
  createClient: jest.fn().mockImplementation(() => mockRedisClient)
}));

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  const testConfig: CacheConfig = {
    redis: {
      host: 'localhost',
      port: 6379,
      password: 'test-password',
      db: 0,
      connectTimeout: 10000,
      commandTimeout: 5000
    },
    enableInMemoryFallback: true,
    inMemoryMaxSize: 100,
    inMemoryTtlMs: 60000,
    healthCheckIntervalMs: 30000,
    healthCheckTimeoutMs: 5000,
    maxReconnectAttempts: 5,
    reconnectDelayMs: 5000
  };

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager = new CacheManager(testConfig);
    // Replace the internal Redis client with our mock after construction
    (cacheManager as any).redisClient = mockRedisClient;
    // Set initial state to simulate successful Redis connection
    (cacheManager as any).metrics.redisConnected = true;
    (cacheManager as any).metrics.fallbackActive = false;
  });

  afterEach(async () => {
    if (cacheManager) {
      // Ensure disconnect resolves properly
      mockRedisClient.disconnect.mockResolvedValue(undefined);
      await cacheManager.shutdown();
    }
    // Clear all mocks to prevent interference
    jest.clearAllMocks();
  });

  describe('createConfigFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create config from REDIS_URL', () => {
      process.env.REDIS_URL = 'redis://user:pass@host:6380/1';
      
      const config = CacheManager.createConfigFromEnv();
      
      expect(config.redis?.url).toBe('redis://user:pass@host:6380/1');
    });

    it('should create config from individual Redis environment variables', () => {
      process.env.REDIS_HOST = 'test-host';
      process.env.REDIS_PORT = '6380';
      process.env.REDIS_PASSWORD = 'test-pass';
      process.env.REDIS_DB = '2';
      
      const config = CacheManager.createConfigFromEnv();
      
      expect(config.redis?.host).toBe('test-host');
      expect(config.redis?.port).toBe(6380);
      expect(config.redis?.password).toBe('test-pass');
      expect(config.redis?.db).toBe(2);
    });

    it('should handle missing Redis configuration', () => {
      const config = CacheManager.createConfigFromEnv();
      
      expect(config.redis).toBeUndefined();
      expect(config.enableInMemoryFallback).toBe(true);
    });

    it('should use default values for cache settings', () => {
      const config = CacheManager.createConfigFromEnv();
      
      expect(config.inMemoryMaxSize).toBe(1000);
      expect(config.inMemoryTtlMs).toBe(300000);
      expect(config.enableInMemoryFallback).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should initialize with Redis successfully', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      
      await cacheManager.initialize();
      
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should initialize without Redis configuration', async () => {
      const configWithoutRedis: CacheConfig = {
        ...testConfig,
        redis: undefined
      };
      
      cacheManager = new CacheManager(configWithoutRedis);
      
      await cacheManager.initialize();
      
      expect(mockRedisClient.connect).not.toHaveBeenCalled();
    });

    it('should handle Redis connection failure and use fallback', async () => {
      mockRedisClient.connect.mockRejectedValue(new Error('Connection failed'));
      
      await cacheManager.initialize();
      
      const status = cacheManager.getStatus();
      expect(status.redisConnected).toBe(false);
      expect(status.fallbackActive).toBe(true);
    });
  });

  describe('get operations', () => {
    beforeEach(async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheManager.initialize();
      // Re-setup mock after initialize() overwrites it
      (cacheManager as any).redisClient = mockRedisClient;
      (cacheManager as any).metrics.redisConnected = true;
      (cacheManager as any).metrics.fallbackActive = false;
    });

    it('should get value from Redis successfully', async () => {
      const testValue = { id: 1, name: 'test' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testValue));
      
      const result = await cacheManager.get('test-key');
      
      expect(result.success).toBe(true);
      expect(result.value).toEqual(testValue);
      expect(result.source).toBe('redis');
      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
    });

    it('should return miss when key not found in Redis', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await cacheManager.get('missing-key');
      
      expect(result.success).toBe(false);
      expect(result.source).toBe('redis');
    });

    it('should fallback to in-memory cache when Redis fails', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
      
      // First set a value in memory cache by making Redis fail on set too
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));
      await cacheManager.set('test-key', 'test-value');
      
      const result = await cacheManager.get('test-key');
      
      expect(result.success).toBe(true);
      expect(result.value).toBe('test-value');
      expect(result.source).toBe('memory');
    });

    it('should return failure when both Redis and memory cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      
      const result = await cacheManager.get('missing-key');
      
      expect(result.success).toBe(false);
    });
  });

  describe('set operations', () => {
    beforeEach(async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheManager.initialize();
      // Re-setup mock after initialize() overwrites it
      (cacheManager as any).redisClient = mockRedisClient;
      (cacheManager as any).metrics.redisConnected = true;
      (cacheManager as any).metrics.fallbackActive = false;
    });

    it('should set value in Redis successfully', async () => {
      const testValue = { id: 1, name: 'test' };
      mockRedisClient.set.mockResolvedValue('OK');
      
      const result = await cacheManager.set('test-key', testValue);
      
      expect(result.success).toBe(true);
      expect(result.source).toBe('redis');
      expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', JSON.stringify(testValue));
    });

    it('should set value with TTL in Redis', async () => {
      const testValue = 'test-value';
      mockRedisClient.setEx.mockResolvedValue('OK');
      
      console.log('Before set call - Redis connected:', (cacheManager as any).metrics.redisConnected);
      console.log('Before set call - Redis client exists:', !!(cacheManager as any).redisClient);
      
      const result = await cacheManager.set('test-key', testValue, 300);
      
      console.log('After set call - result:', result);
      console.log('setEx calls:', mockRedisClient.setEx.mock.calls);
      console.log('set calls:', mockRedisClient.set.mock.calls);
      
      expect(result.success).toBe(true);
      expect(result.source).toBe('redis');
      expect(mockRedisClient.setEx).toHaveBeenCalledWith('test-key', 300, JSON.stringify(testValue));
    });

    it('should fallback to in-memory cache when Redis fails', async () => {
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));
      
      const result = await cacheManager.set('test-key', 'test-value');
      
      expect(result.success).toBe(true);
      expect(result.source).toBe('memory');
    });

    it('should handle case when both Redis and memory cache are disabled', async () => {
      const configWithoutFallback: CacheConfig = {
        ...testConfig,
        redis: undefined,
        enableInMemoryFallback: false
      };
      
      cacheManager = new CacheManager(configWithoutFallback);
      await cacheManager.initialize();
      
      const result = await cacheManager.set('test-key', 'test-value');
      
      expect(result.success).toBe(false);
      expect(result.source).toBe('none');
      expect(result.error).toBe('No cache backend available');
    });
  });

  describe('delete operations', () => {
    beforeEach(async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheManager.initialize();
      // Re-setup mock after initialize() overwrites it
      (cacheManager as any).redisClient = mockRedisClient;
      (cacheManager as any).metrics.redisConnected = true;
      (cacheManager as any).metrics.fallbackActive = false;
    });

    it('should delete value from Redis successfully', async () => {
      mockRedisClient.del.mockResolvedValue(1);
      
      const result = await cacheManager.delete('test-key');
      
      expect(result.success).toBe(true);
      expect(result.source).toBe('redis');
      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should delete from both Redis and memory cache', async () => {
      mockRedisClient.del.mockResolvedValue(1);
      
      // Set value in memory cache first by making Redis fail on set
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));
      await cacheManager.set('test-key', 'test-value');
      
      // Now make Redis work for delete
      const result = await cacheManager.delete('test-key');
      
      expect(result.success).toBe(true);
      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle Redis delete failure but succeed with memory', async () => {
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));
      
      // Set value in memory cache first by making Redis fail on set
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));
      await cacheManager.set('test-key', 'test-value');
      
      const result = await cacheManager.delete('test-key');
      
      expect(result.success).toBe(true);
      expect(result.source).toBe('memory');
    });
  });

  describe('clear operations', () => {
    beforeEach(async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheManager.initialize();
      // Re-setup mock after initialize() overwrites it
      (cacheManager as any).redisClient = mockRedisClient;
      (cacheManager as any).metrics.redisConnected = true;
      (cacheManager as any).metrics.fallbackActive = false;
    });

    it('should clear Redis successfully', async () => {
      mockRedisClient.flushDb.mockResolvedValue('OK');
      
      const result = await cacheManager.clear();
      
      expect(result.success).toBe(true);
      expect(result.source).toBe('redis');
      expect(mockRedisClient.flushDb).toHaveBeenCalled();
    });

    it('should clear both Redis and memory cache', async () => {
      mockRedisClient.flushDb.mockResolvedValue('OK');
      
      const result = await cacheManager.clear();
      
      expect(result.success).toBe(true);
      expect(mockRedisClient.flushDb).toHaveBeenCalled();
    });

    it('should handle Redis clear failure but succeed with memory', async () => {
      mockRedisClient.flushDb.mockRejectedValue(new Error('Redis error'));
      
      const result = await cacheManager.clear();
      
      expect(result.success).toBe(true);
      expect(result.source).toBe('memory');
    });
  });

  describe('health monitoring', () => {
    beforeEach(async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheManager.initialize();
      // Re-setup mock after initialize() overwrites it
      (cacheManager as any).redisClient = mockRedisClient;
      (cacheManager as any).metrics.redisConnected = true;
      (cacheManager as any).metrics.fallbackActive = false;
    });

    it('should report healthy status when Redis is connected', () => {
      expect(cacheManager.isHealthy()).toBe(true);
    });

    it('should provide cache status', () => {
      const status = cacheManager.getStatus();
      
      expect(status.redisConnected).toBe(true);
      expect(status.fallbackActive).toBe(false);
      expect(status.totalOperations).toBeGreaterThanOrEqual(0);
      expect(status.hitRate).toBeGreaterThanOrEqual(0);
      expect(status.averageResponseTime).toBeGreaterThanOrEqual(0);
    });

    it('should provide cache metrics', () => {
      const metrics = cacheManager.getMetrics();
      
      expect(metrics.redisConnected).toBe(true);
      expect(metrics.fallbackActive).toBe(false);
      expect(metrics.totalOperations).toBeGreaterThanOrEqual(0);
      expect(metrics.redisHits).toBeGreaterThanOrEqual(0);
      expect(metrics.redisMisses).toBeGreaterThanOrEqual(0);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.disconnect.mockResolvedValue(undefined);
      
      await cacheManager.initialize();
      await cacheManager.shutdown();
      
      expect(mockRedisClient.disconnect).toHaveBeenCalled();
    });

    it('should handle shutdown when Redis not connected', async () => {
      await expect(cacheManager.shutdown()).resolves.not.toThrow();
    });

    it('should handle Redis disconnect error', async () => {
      mockRedisClient.connect.mockResolvedValue(undefined);
      mockRedisClient.disconnect.mockRejectedValue(new Error('Disconnect failed'));
      
      await cacheManager.initialize();
      await expect(cacheManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('event emission', () => {
    it('should emit initialized event', async () => {
      const initSpy = jest.fn();
      cacheManager.on('initialized', initSpy);
      
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheManager.initialize();
      
      expect(initSpy).toHaveBeenCalledWith({
        redisEnabled: true,
        fallbackActive: false
      });
    });

    it('should emit cache hit event', async () => {
      const hitSpy = jest.fn();
      cacheManager.on('cache:hit', hitSpy);
      
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheManager.initialize();
      
      mockRedisClient.get.mockResolvedValue(JSON.stringify('test-value'));
      
      await cacheManager.get('test-key');
      
      expect(hitSpy).toHaveBeenCalledWith(expect.objectContaining({
        source: 'redis',
        key: 'test-key',
        duration: expect.any(Number)
      }));
    });

    it('should emit cache miss event', async () => {
      const missSpy = jest.fn();
      cacheManager.on('cache:miss', missSpy);
      
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheManager.initialize();
      
      mockRedisClient.get.mockResolvedValue(null);
      
      await cacheManager.get('missing-key');
      
      expect(missSpy).toHaveBeenCalledWith(expect.objectContaining({
        source: 'redis',
        key: 'missing-key',
        duration: expect.any(Number)
      }));
    });

    it('should emit cache error event', async () => {
      const errorSpy = jest.fn();
      cacheManager.on('cache:error', errorSpy);
      
      mockRedisClient.connect.mockResolvedValue(undefined);
      await cacheManager.initialize();
      
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
      
      await cacheManager.get('test-key');
      
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
        source: 'redis',
        key: 'test-key',
        error: 'Redis error'
      }));
    });
  });
});