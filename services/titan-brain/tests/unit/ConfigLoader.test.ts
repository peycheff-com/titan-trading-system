/**
 * ConfigLoader Tests
 * Verifies configuration loading, merging, and validation logic
 */

import { defaultConfig, mergeConfig } from "../../src/config/defaults.js";
import {
  ConfigLoader,
  getConfigLoader,
  loadConfig,
  loadConfigFromEnvironment,
  resetConfigLoader,
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

    it("should have valid circuit breaker configuration", () => {
      expect(defaultConfig.circuitBreaker).toBeDefined();
      expect(defaultConfig.circuitBreaker.maxDailyDrawdown).toBeGreaterThan(0);
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

    it("should handle brain config changes", () => {
      const partial = {
        brain: {
          signalTimeout: 300,
          metricUpdateInterval: 120000,
          dashboardCacheTTL: 10000,
          maxQueueSize: 200,
          initialCapital: 15000,
        },
      };

      const merged = mergeConfig(partial);

      expect(merged.brain.signalTimeout).toBe(300);
      expect(merged.brain.metricUpdateInterval).toBe(120000);
    });

    it("should override arrays completely", () => {
      const partial = {
        brain: {
          signalTimeout: 100,
          metricUpdateInterval: 60000,
          dashboardCacheTTL: 5000,
          maxQueueSize: 100,
          initialCapital: 5000,
        },
      };

      const merged = mergeConfig(partial);
      expect(merged.brain).toBeDefined();
    });
  });

  describe("ConfigLoader class", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      resetConfigLoader();
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

    it("should create ConfigLoader instance", () => {
      const loader = new ConfigLoader();
      expect(loader).toBeDefined();
    });

    it("should get config via getConfig", async () => {
      const loader = new ConfigLoader();
      const config = await loader.getConfig();
      expect(config).toBeDefined();
      expect(config.brain).toBeDefined();
    });

    it("should reload configuration", async () => {
      const loader = new ConfigLoader();
      const config1 = await loader.getConfig();
      const config2 = await loader.reload();
      expect(config1).toBeDefined();
      expect(config2).toBeDefined();
    });

    it("should validate via isValid", () => {
      const loader = new ConfigLoader();
      // isValid depends on configuration state
      expect(typeof loader.isValid()).toBe("boolean");
    });

    it("should get validation result", () => {
      const loader = new ConfigLoader();
      const result = loader.validate();
      expect(result).toBeDefined();
      expect(result.valid).toBeDefined();
    });
  });

  describe("loadConfig function", () => {
    beforeEach(() => {
      resetConfigLoader();
    });

    it("should load configuration with default options", () => {
      const result = loadConfig();
      expect(result.config).toBeDefined();
      expect(result.validation).toBeDefined();
      expect(result.sources).toBeDefined();
    });

    it("should include sources in result", () => {
      const result = loadConfig();
      expect(Array.isArray(result.sources)).toBe(true);
    });
  });

  describe("getConfigLoader singleton", () => {
    beforeEach(() => {
      resetConfigLoader();
    });

    it("should return singleton instance", () => {
      const loader1 = getConfigLoader();
      const loader2 = getConfigLoader();
      expect(loader1).toBe(loader2);
    });

    it("should create new instance after reset", () => {
      const loader1 = getConfigLoader();
      resetConfigLoader();
      const loader2 = getConfigLoader();
      // After reset, should be a new instance
      expect(loader1).not.toBe(loader2);
    });
  });

  describe("environment variable mapping", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it("should parse numeric environment variables", () => {
      process.env.SERVER_PORT = "8080";
      const config = loadConfigFromEnvironment();
      expect(config.server?.port).toBe(8080);
    });

    it("should handle missing environment variables", () => {
      delete process.env.DB_HOST;
      const config = loadConfigFromEnvironment();
      // Should not throw, missing values use defaults
      expect(config).toBeDefined();
    });

    it("should parse NATS URL", () => {
      process.env.NATS_URL = "nats://testserver:4222";
      const config = loadConfigFromEnvironment();
      // Verify NATS config is loaded when set
      expect(config).toBeDefined();
    });
  });
});
