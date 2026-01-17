/**
 * Unit tests for ConfigManager
 * Tests configuration loading, saving, validation, and hot-reload functionality
 */

import {
  AlignmentWeights,
  ConfigManager,
  Phase2Config,
  PortfolioConfig,
  RiskConfig,
  RSConfig,
} from "../../src/config/ConfigManager";
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";

describe("ConfigManager", () => {
  const testConfigDir = join(__dirname, "test-config");
  const testConfigPath = join(testConfigDir, "phase2.config.json");
  let configManager: ConfigManager;

  beforeEach(() => {
    // Create test config directory
    if (!existsSync(testConfigDir)) {
      mkdirSync(testConfigDir, { recursive: true });
    }

    // Clean up any existing config file
    if (existsSync(testConfigPath)) {
      unlinkSync(testConfigPath);
    }

    configManager = new ConfigManager(testConfigDir);
  });

  afterEach(() => {
    // Cleanup
    if (configManager) {
      configManager.destroy();
    }

    // Remove test config directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe("Configuration Loading", () => {
    it("should create default configuration when no file exists", () => {
      const config = configManager.getConfig();

      expect(config.alignmentWeights.daily).toBe(50);
      expect(config.alignmentWeights.h4).toBe(30);
      expect(config.alignmentWeights.m15).toBe(20);
      expect(config.rsConfig.threshold).toBe(2);
      expect(config.rsConfig.lookbackPeriod).toBe(4);
      expect(config.riskConfig.maxLeverage).toBe(5);
      expect(config.riskConfig.stopLossPercent).toBe(1.5);
      expect(config.riskConfig.targetPercent).toBe(4.5);
      expect(config.portfolioConfig.maxConcurrentPositions).toBe(5);
      expect(config.portfolioConfig.maxPortfolioHeat).toBe(15);
      expect(config.portfolioConfig.correlationThreshold).toBe(0.7);
    });

    it("should load valid configuration from file", () => {
      const testConfig: Phase2Config = {
        alignmentWeights: { daily: 40, h4: 35, m15: 25 },
        rsConfig: { threshold: 3, lookbackPeriod: 6 },
        riskConfig: { maxLeverage: 4, stopLossPercent: 2, targetPercent: 5 },
        portfolioConfig: {
          maxConcurrentPositions: 6,
          maxPortfolioHeat: 18,
          correlationThreshold: 0.8,
        },
        forwardTestConfig: {
          enabled: false,
          duration: 24,
          logSignalsOnly: false,
          compareToBacktest: false,
        },
        version: 1,
        lastModified: Date.now(),
      };

      writeFileSync(testConfigPath, JSON.stringify(testConfig, null, 2));

      const newConfigManager = new ConfigManager(testConfigDir);
      const loadedConfig = newConfigManager.getConfig();

      expect(loadedConfig.alignmentWeights.daily).toBe(40);
      expect(loadedConfig.alignmentWeights.h4).toBe(35);
      expect(loadedConfig.alignmentWeights.m15).toBe(25);
      expect(loadedConfig.rsConfig.threshold).toBe(3);
      expect(loadedConfig.rsConfig.lookbackPeriod).toBe(6);

      newConfigManager.destroy();
    });

    it("should load defaults when configuration file is corrupted", () => {
      // Write invalid JSON
      writeFileSync(testConfigPath, "invalid json content");

      const newConfigManager = new ConfigManager(testConfigDir);
      const config = newConfigManager.getConfig();

      // Should load defaults
      expect(config.alignmentWeights.daily).toBe(50);
      expect(config.alignmentWeights.h4).toBe(30);
      expect(config.alignmentWeights.m15).toBe(20);

      newConfigManager.destroy();
    });
  });

  describe("Configuration Validation", () => {
    it("should reject invalid alignment weights", () => {
      expect(() => {
        configManager.updateAlignmentWeights({ daily: 70 }); // > 60%
      }).toThrow("Daily weight must be 30-60%");

      expect(() => {
        configManager.updateAlignmentWeights({ h4: 50 }); // > 40%
      }).toThrow("4H weight must be 20-40%");

      expect(() => {
        configManager.updateAlignmentWeights({ m15: 35 }); // > 30%
      }).toThrow("15m weight must be 10-30%");
    });

    it("should reject alignment weights that do not sum to 100%", () => {
      expect(() => {
        configManager.updateAlignmentWeights({ daily: 30, h4: 30, m15: 30 }); // Sum = 90%
      }).toThrow("Alignment weights must sum to 100%");
    });

    it("should reject invalid RS configuration", () => {
      expect(() => {
        configManager.updateRSConfig({ threshold: 6 }); // > 5%
      }).toThrow("RS threshold must be 0-5%");

      expect(() => {
        configManager.updateRSConfig({ lookbackPeriod: 10 }); // > 8 hours
      }).toThrow("RS lookback period must be 2-8 hours");
    });

    it("should reject invalid risk configuration", () => {
      expect(() => {
        configManager.updateRiskConfig({ maxLeverage: 6 }); // > 5x
      }).toThrow("Max leverage must be 3-5x");

      expect(() => {
        configManager.updateRiskConfig({ stopLossPercent: 4 }); // > 3%
      }).toThrow("Stop loss must be 1-3%");

      expect(() => {
        configManager.updateRiskConfig({ targetPercent: 7 }); // > 6%
      }).toThrow("Target must be 3-6%");
    });

    it("should reject invalid portfolio configuration", () => {
      expect(() => {
        configManager.updatePortfolioConfig({ maxConcurrentPositions: 10 }); // > 8
      }).toThrow("Max concurrent positions must be 3-8");

      expect(() => {
        configManager.updatePortfolioConfig({ maxPortfolioHeat: 25 }); // > 20%
      }).toThrow("Max portfolio heat must be 10-20%");

      expect(() => {
        configManager.updatePortfolioConfig({ correlationThreshold: 1.0 }); // > 0.9
      }).toThrow("Correlation threshold must be 0.6-0.9");
    });
  });

  describe("Configuration Updates", () => {
    it("should update alignment weights correctly", () => {
      configManager.updateAlignmentWeights({ daily: 45, h4: 35, m15: 20 });

      const config = configManager.getConfig();
      expect(config.alignmentWeights.daily).toBe(45);
      expect(config.alignmentWeights.h4).toBe(35);
      expect(config.alignmentWeights.m15).toBe(20);
    });

    it("should update RS configuration correctly", () => {
      configManager.updateRSConfig({ threshold: 3.5, lookbackPeriod: 6 });

      const config = configManager.getConfig();
      expect(config.rsConfig.threshold).toBe(3.5);
      expect(config.rsConfig.lookbackPeriod).toBe(6);
    });

    it("should update risk configuration correctly", () => {
      configManager.updateRiskConfig({
        maxLeverage: 4,
        stopLossPercent: 2,
        targetPercent: 5,
      });

      const config = configManager.getConfig();
      expect(config.riskConfig.maxLeverage).toBe(4);
      expect(config.riskConfig.stopLossPercent).toBe(2);
      expect(config.riskConfig.targetPercent).toBe(5);
    });

    it("should update portfolio configuration correctly", () => {
      configManager.updatePortfolioConfig({
        maxConcurrentPositions: 7,
        maxPortfolioHeat: 18,
        correlationThreshold: 0.8,
      });

      const config = configManager.getConfig();
      expect(config.portfolioConfig.maxConcurrentPositions).toBe(7);
      expect(config.portfolioConfig.maxPortfolioHeat).toBe(18);
      expect(config.portfolioConfig.correlationThreshold).toBe(0.8);
    });

    it("should emit configChanged event on updates", (done) => {
      configManager.on("configChanged", (event) => {
        expect(event.section).toBe("all");
        expect(event.newValue.alignmentWeights.daily).toBe(45);
        done();
      });

      configManager.updateAlignmentWeights({ daily: 45, h4: 35, m15: 20 });
    });

    it("should increment version on save", () => {
      const initialVersion = configManager.getConfig().version;

      configManager.updateAlignmentWeights({ daily: 45, h4: 35, m15: 20 });

      const newVersion = configManager.getConfig().version;
      expect(newVersion).toBe(initialVersion + 1);
    });
  });

  describe("Hot Reload", () => {
    it("should start and stop watching", () => {
      expect(() => {
        configManager.startWatching();
        configManager.stopWatching();
      }).not.toThrow();
    });

    it("should not start watching twice", () => {
      configManager.startWatching();
      configManager.startWatching(); // Should not throw
      configManager.stopWatching();
    });
  });

  describe("Utility Methods", () => {
    it("should reset to defaults", () => {
      // Change some values
      configManager.updateAlignmentWeights({ daily: 45, h4: 35, m15: 20 });

      // Reset to defaults
      configManager.resetToDefaults();

      const config = configManager.getConfig();
      expect(config.alignmentWeights.daily).toBe(50);
      expect(config.alignmentWeights.h4).toBe(30);
      expect(config.alignmentWeights.m15).toBe(20);
    });

    it("should generate configuration summary", () => {
      const summary = configManager.getConfigSummary();

      expect(summary).toContain("Alignment: Daily 50%, 4H 30%, 15m 20%");
      expect(summary).toContain("RS: Threshold 2%, Lookback 4h");
      expect(summary).toContain("Risk: Leverage 5x, Stop 1.5%, Target 4.5%");
      expect(summary).toContain(
        "Portfolio: Max 5 positions, Heat 15%, Correlation 0.7",
      );
    });

    it("should cleanup resources on destroy", () => {
      configManager.startWatching();

      expect(() => {
        configManager.destroy();
      }).not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    it("should handle partial updates", () => {
      // Update all weights to ensure they sum to 100%
      configManager.updateAlignmentWeights({ daily: 45, h4: 35, m15: 20 });

      const config = configManager.getConfig();
      expect(config.alignmentWeights.daily).toBe(45);
      expect(config.alignmentWeights.h4).toBe(35);
      expect(config.alignmentWeights.m15).toBe(20);
    });

    it("should handle missing config directory", () => {
      const nonExistentDir = join(__dirname, "non-existent");

      expect(() => {
        new ConfigManager(nonExistentDir);
      }).not.toThrow();
    });
  });
});
