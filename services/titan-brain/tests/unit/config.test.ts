/**
 * Configuration Tests
 * Verifies default configuration and merging logic
 */

import { defaultConfig, mergeConfig, loadConfigFromEnv } from '../../src/config/defaults.js';
import { EquityTier } from '../../src/types/index.js';

describe('Configuration', () => {
  describe('defaultConfig', () => {
    it('should have valid brain configuration', () => {
      expect(defaultConfig.brain.signalTimeout).toBe(100);
      expect(defaultConfig.brain.metricUpdateInterval).toBe(60000);
      expect(defaultConfig.brain.dashboardCacheTTL).toBe(5000);
      expect(defaultConfig.brain.maxQueueSize).toBe(100);
    });

    it('should have valid allocation engine configuration', () => {
      expect(defaultConfig.allocationEngine.transitionPoints.startP2).toBe(1500);
      expect(defaultConfig.allocationEngine.transitionPoints.fullP2).toBe(5000);
      expect(defaultConfig.allocationEngine.transitionPoints.startP3).toBe(25000);
    });

    it('should have valid leverage caps for all tiers', () => {
      const caps = defaultConfig.allocationEngine.leverageCaps;
      expect(caps[EquityTier.MICRO]).toBe(20);
      expect(caps[EquityTier.SMALL]).toBe(10);
      expect(caps[EquityTier.MEDIUM]).toBe(5);
      expect(caps[EquityTier.LARGE]).toBe(3);
      expect(caps[EquityTier.INSTITUTIONAL]).toBe(2);
    });

    it('should have valid performance tracker configuration', () => {
      expect(defaultConfig.performanceTracker.windowDays).toBe(7);
      expect(defaultConfig.performanceTracker.minTradeCount).toBe(10);
      expect(defaultConfig.performanceTracker.malusMultiplier).toBe(0.5);
      expect(defaultConfig.performanceTracker.bonusMultiplier).toBe(1.2);
    });

    it('should have valid circuit breaker configuration', () => {
      expect(defaultConfig.circuitBreaker.maxDailyDrawdown).toBe(0.15);
      expect(defaultConfig.circuitBreaker.minEquity).toBe(150);
      expect(defaultConfig.circuitBreaker.consecutiveLossLimit).toBe(3);
      expect(defaultConfig.circuitBreaker.cooldownMinutes).toBe(30);
    });

    it('should have valid capital flow configuration', () => {
      expect(defaultConfig.capitalFlow.sweepThreshold).toBe(1.2);
      expect(defaultConfig.capitalFlow.reserveLimit).toBe(200);
      expect(defaultConfig.capitalFlow.maxRetries).toBe(3);
    });

    it('should have valid risk guardian configuration', () => {
      expect(defaultConfig.riskGuardian.maxCorrelation).toBe(0.8);
      expect(defaultConfig.riskGuardian.correlationPenalty).toBe(0.5);
    });
  });

  describe('mergeConfig', () => {
    it('should merge partial config with defaults', () => {
      const partial = {
        brain: {
          signalTimeout: 200,
          metricUpdateInterval: 30000,
          dashboardCacheTTL: 10000,
          maxQueueSize: 50,
        },
      };

      const merged = mergeConfig(partial);

      expect(merged.brain.signalTimeout).toBe(200);
      expect(merged.brain.metricUpdateInterval).toBe(30000);
      // Other sections should use defaults
      expect(merged.circuitBreaker.maxDailyDrawdown).toBe(0.15);
    });

    it('should preserve defaults when partial is empty', () => {
      const merged = mergeConfig({});

      expect(merged.brain.signalTimeout).toBe(100);
      expect(merged.allocationEngine.transitionPoints.startP2).toBe(1500);
    });
  });

  describe('loadConfigFromEnv', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should load database config from environment', () => {
      process.env.DB_HOST = 'testhost';
      process.env.DB_PORT = '5433';
      process.env.DB_NAME = 'testdb';
      process.env.DB_USER = 'testuser';
      process.env.DB_PASSWORD = 'testpass';

      const config = loadConfigFromEnv();

      expect(config.database?.host).toBe('testhost');
      expect(config.database?.port).toBe(5433);
      expect(config.database?.database).toBe('testdb');
      expect(config.database?.user).toBe('testuser');
      expect(config.database?.password).toBe('testpass');
    });

    it('should load redis config from environment', () => {
      process.env.REDIS_URL = 'redis://testhost:6380';

      const config = loadConfigFromEnv();

      expect(config.redis?.url).toBe('redis://testhost:6380');
    });

    it('should load server config from environment', () => {
      process.env.SERVER_HOST = '127.0.0.1';
      process.env.SERVER_PORT = '4000';

      const config = loadConfigFromEnv();

      expect(config.server?.host).toBe('127.0.0.1');
      expect(config.server?.port).toBe(4000);
    });

    it('should enable telegram when both token and chat id are set', () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test_token';
      process.env.TELEGRAM_CHAT_ID = 'test_chat';

      const config = loadConfigFromEnv();

      expect(config.notifications?.telegram?.enabled).toBe(true);
      expect(config.notifications?.telegram?.botToken).toBe('test_token');
      expect(config.notifications?.telegram?.chatId).toBe('test_chat');
    });
  });
});
