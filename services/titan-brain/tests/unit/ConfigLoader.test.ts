/**
 * ConfigLoader Tests
 * Verifies configuration loading, merging, and validation logic
 */

import { defaultConfig, mergeConfig } from "../../src/config/defaults.js";
import {
  loadConfigFromEnvironment,
  validateConfig,
} from "../../src/config/ConfigLoader.js";
import { EquityTier } from "../../src/types/index.js";

describe("Configuration", () => {
  describe("defaultConfig", () => {
    it("should have valid brain configuration", () => {
      expect(defaultConfig.brain.signalTimeout).toBe(100);
      expect(defaultConfig.brain.metricUpdateInterval).toBe(60000);
      expect(defaultConfig.brain.dashboardCacheTTL).toBe(5000);
      expect(defaultConfig.brain.maxQueueSize).toBe(100);
    });

    it("should have valid allocation engine configuration", () => {
      expect(defaultConfig.allocationEngine.transitionPoints.startP2).toBe(
        1500,
      );
      expect(defaultConfig.allocationEngine.transitionPoints.fullP2).toBe(5000);
      expect(defaultConfig.allocationEngine.transitionPoints.startP3).toBe(
        25000,
      );
    });

    it("should have valid leverage caps for all tiers", () => {
      const caps = defaultConfig.allocationEngine.leverageCaps;
      expect(caps[EquityTier.MICRO]).toBe(20);
      expect(caps[EquityTier.SMALL]).toBe(10);
      expect(caps[EquityTier.MEDIUM]).toBe(5);
      expect(caps[EquityTier.LARGE]).toBe(3);
      expect(caps[EquityTier.INSTITUTIONAL]).toBe(2);
    });
  });

  describe("mergeConfig", () => {
    it("should merge partial config with defaults", () => {
      const partial = {
        brain: {
          signalTimeout: 200,
          metricUpdateInterval: 30000,
          dashboardCacheTTL: 10000,
          maxQueueSize: 50,
          initialCapital: 10000,
        },
      };

      const merged = mergeConfig(partial);

      expect(merged.brain.signalTimeout).toBe(200);
      expect(merged.brain.metricUpdateInterval).toBe(30000);
      // Other sections should use defaults
      expect(merged.circuitBreaker.maxDailyDrawdown).toBe(0.15);
    });

    it("should preserve defaults when partial is empty", () => {
      const merged = mergeConfig({});

      expect(merged.brain.signalTimeout).toBe(100);
      expect(merged.allocationEngine.transitionPoints.startP2).toBe(1500);
    });
  });

  describe("ConfigLoader", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it("should load configuration from environment variables", () => {
      process.env.DB_HOST = "testhost";
      process.env.DB_PORT = "5433";
      process.env.REDIS_URL = "redis://testhost:6380";
      process.env.SERVER_PORT = "4000";

      const config = loadConfigFromEnvironment();

      expect(config.database?.host).toBe("testhost");
      expect(config.database?.port).toBe(5433);
      expect(config.redis?.url).toBe("redis://testhost:6380");
      expect(config.server?.port).toBe(4000);
    });

    it("should validate configuration", () => {
      const validConfig = { ...defaultConfig };
      const result = validateConfig(validConfig);
      expect(result.valid).toBe(true);
    });

    it("should detect invalid configuration", () => {
      const invalidConfig = {
        ...defaultConfig,
        brain: { ...defaultConfig.brain, signalTimeout: -1 },
      };
      const result = validateConfig(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
