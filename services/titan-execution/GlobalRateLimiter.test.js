/**
 * GlobalRateLimiter Tests
 * 
 * Tests for the Global Rate Limiter (Anti-Ban Protection)
 * 
 * Requirements: 92.1-92.6
 */

import { jest } from '@jest/globals';
import { GlobalRateLimiter } from './GlobalRateLimiter.js';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('GlobalRateLimiter', () => {
  let rateLimiter;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (rateLimiter && !rateLimiter._destroyed) {
      await rateLimiter.destroy();
    }
  });

  describe('Constructor', () => {
    test('should create instance with default config', () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      expect(rateLimiter.maxRequestsPerSecond).toBe(12);
      expect(rateLimiter.queueDepthWarning).toBe(5);
      expect(rateLimiter.queueDepthForceMarket).toBe(8);
      expect(rateLimiter.alertThresholdCount).toBe(10);
    });

    test('should create instance with custom config', () => {
      rateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 10,
        queueDepthWarning: 3,
        queueDepthForceMarket: 6,
        alertThresholdCount: 5,
        logger: mockLogger,
      });
      
      expect(rateLimiter.maxRequestsPerSecond).toBe(10);
      expect(rateLimiter.queueDepthWarning).toBe(3);
      expect(rateLimiter.queueDepthForceMarket).toBe(6);
      expect(rateLimiter.alertThresholdCount).toBe(5);
    });
  });

  describe('execute()', () => {
    test('should execute function with rate limiting', async () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      const mockFn = jest.fn(async () => 'result');
      const result = await rateLimiter.execute(mockFn);
      
      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    test('should throw error if function not provided', async () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      await expect(rateLimiter.execute('not a function')).rejects.toThrow(
        'execute() requires a function argument'
      );
    });

    test('should throw error if destroyed', async () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      await rateLimiter.destroy();
      
      await expect(rateLimiter.execute(async () => {})).rejects.toThrow(
        'GlobalRateLimiter has been destroyed'
      );
    });

    test('should execute multiple requests respecting rate limit', async () => {
      rateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 5,
        logger: mockLogger,
      });
      
      const mockFn = jest.fn(async () => 'result');
      const promises = [];
      
      // Queue 10 requests
      for (let i = 0; i < 10; i++) {
        promises.push(rateLimiter.execute(mockFn));
      }
      
      await Promise.all(promises);
      
      expect(mockFn).toHaveBeenCalledTimes(10);
    });
  });

  describe('isLimitApproaching()', () => {
    test('should return false when queue is empty', () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      expect(rateLimiter.isLimitApproaching()).toBe(false);
    });

    test('should return true when queue depth exceeds warning threshold', async () => {
      rateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 1, // Very slow to build queue
        queueDepthWarning: 2,
        logger: mockLogger,
      });
      
      // Queue multiple slow requests
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 100));
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(rateLimiter.execute(slowFn));
      }
      
      // Give time for queue to build
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(rateLimiter.isLimitApproaching()).toBe(true);
      
      // Wait for all to complete
      await Promise.all(promises);
    });
  });

  describe('shouldForceMarketOrder()', () => {
    test('should return false when queue is empty', () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      expect(rateLimiter.shouldForceMarketOrder()).toBe(false);
    });

    test('should return true when queue depth exceeds force market threshold', async () => {
      rateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 1, // Very slow to build queue
        queueDepthForceMarket: 3,
        logger: mockLogger,
      });
      
      // Queue multiple slow requests
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 100));
      const promises = [];
      
      for (let i = 0; i < 6; i++) {
        promises.push(rateLimiter.execute(slowFn));
      }
      
      // Give time for queue to build
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(rateLimiter.shouldForceMarketOrder()).toBe(true);
      
      // Wait for all to complete
      await Promise.all(promises);
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('getQueueDepth()', () => {
    test('should return 0 when queue is empty', () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      expect(rateLimiter.getQueueDepth()).toBe(0);
    });

    test('should return correct queue depth', async () => {
      rateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 1,
        logger: mockLogger,
      });
      
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 100));
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(rateLimiter.execute(slowFn));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(rateLimiter.getQueueDepth()).toBeGreaterThan(0);
      
      await Promise.all(promises);
    });
  });

  describe('getMetrics()', () => {
    test('should return metrics', async () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      const mockFn = jest.fn(async () => 'result');
      await rateLimiter.execute(mockFn);
      
      const metrics = rateLimiter.getMetrics();
      
      expect(metrics).toHaveProperty('current_rate');
      expect(metrics).toHaveProperty('limit');
      expect(metrics).toHaveProperty('queued_requests');
      expect(metrics).toHaveProperty('running_requests');
      expect(metrics).toHaveProperty('requests_executed');
      expect(metrics).toHaveProperty('requests_queued');
      expect(metrics).toHaveProperty('is_limit_approaching');
      expect(metrics).toHaveProperty('should_force_market');
      
      expect(metrics.requests_executed).toBeGreaterThan(0);
    });
  });

  describe('getStatus()', () => {
    test('should return status', () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      const status = rateLimiter.getStatus();
      
      expect(status).toHaveProperty('queued');
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('is_limit_approaching');
      expect(status).toHaveProperty('should_force_market');
    });
  });

  describe('Events', () => {
    test('should emit rate_limit:approaching event', async () => {
      rateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 1,
        queueDepthWarning: 2,
        logger: mockLogger,
      });
      
      const approachingListener = jest.fn();
      rateLimiter.on('rate_limit:approaching', approachingListener);
      
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 100));
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(rateLimiter.execute(slowFn));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await Promise.all(promises);
      
      // Should have emitted at least once
      expect(approachingListener.mock.calls.length).toBeGreaterThan(0);
    });

    test('should emit rate_limit:force_market event', async () => {
      rateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 1,
        queueDepthForceMarket: 2,
        logger: mockLogger,
      });
      
      const forceMarketListener = jest.fn();
      rateLimiter.on('rate_limit:force_market', forceMarketListener);
      
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 100));
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(rateLimiter.execute(slowFn));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await Promise.all(promises);
      
      // Should have emitted at least once
      expect(forceMarketListener.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('resetMetrics()', () => {
    test('should reset all metrics', async () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      const mockFn = jest.fn(async () => 'result');
      await rateLimiter.execute(mockFn);
      
      let metrics = rateLimiter.getMetrics();
      expect(metrics.requests_executed).toBeGreaterThan(0);
      
      rateLimiter.resetMetrics();
      
      metrics = rateLimiter.getMetrics();
      expect(metrics.requests_executed).toBe(0);
      expect(metrics.requests_queued).toBe(0);
      expect(metrics.warnings_count).toBe(0);
    });
  });

  describe('stop() and destroy()', () => {
    test('should stop accepting new requests', async () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      await rateLimiter.stop();
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Stopping GlobalRateLimiter')
      );
      
      // Manually destroy to avoid double stop in afterEach
      await rateLimiter.destroy();
      rateLimiter = null;
    });

    test('should destroy instance', async () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      await rateLimiter.destroy();
      
      expect(rateLimiter._destroyed).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('GlobalRateLimiter destroyed')
      );
    });

    test('should not throw when destroying already destroyed instance', async () => {
      rateLimiter = new GlobalRateLimiter({ logger: mockLogger });
      
      await rateLimiter.destroy();
      await expect(rateLimiter.destroy()).resolves.not.toThrow();
    });
  });

  describe('Logging', () => {
    test('should log rate limit events', async () => {
      rateLimiter = new GlobalRateLimiter({
        maxRequestsPerSecond: 1,
        queueDepthWarning: 2,
        logger: mockLogger,
      });
      
      const slowFn = () => new Promise(resolve => setTimeout(resolve, 100));
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        promises.push(rateLimiter.execute(slowFn));
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      await Promise.all(promises);
      
      // Should have logged warnings
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});

