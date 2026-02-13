/**
 * Unit tests for ConfigManager
 * Tests configuration loading, saving, validation, and hot-reload functionality
 */

import { ConfigManager, Phase2Config } from "../../src/config/ConfigManager";
import { ConfigManager as SharedConfigManager } from "@titan/shared";
import { HunterConfigSchema } from "../../src/config/schema";

// Mock @titan/shared
const mockSharedManager = {
  loadPhaseConfig: jest.fn(),
  getPhaseConfig: jest.fn(),
  savePhaseConfig: jest.fn(),
  on: jest.fn(),
  removeAllListeners: jest.fn(),
};

jest.mock("@titan/shared", () => ({
  getConfigManager: jest.fn(() => mockSharedManager),
  ConfigManager: jest.fn(),
  Logger: {
    // Called at import-time by src/config/ConfigManager.ts, so avoid referencing
    // any top-level variables that may not be initialized yet (Jest mock hoisting).
    getInstance: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
    })),
  },
}));

describe("ConfigManager", () => {
  let configManager: ConfigManager;
  let mockConfig: Partial<Phase2Config>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      enabled: true,
      maxLeverage: 20,
      version: 1,
      alignmentWeights: { daily: 40, h4: 35, m15: 25 },
      rsConfig: { threshold: 3, lookbackPeriod: 6 },
      // ... minimal valid config parts
    };

    mockSharedManager.getPhaseConfig.mockReturnValue(mockConfig);
    configManager = new ConfigManager();
  });

  afterEach(() => {
    configManager.destroy();
  });

  describe("Configuration Loading", () => {
    it("should initialize and load config from shared manager", async () => {
      await configManager.initialize();
      expect(mockSharedManager.loadPhaseConfig).toHaveBeenCalledWith(
        "phase2-hunter",
      );
      expect(mockSharedManager.getPhaseConfig).toHaveBeenCalledWith(
        "phase2-hunter",
      );
    });

    it("should merge with defaults if shared config is missing fields", async () => {
      mockSharedManager.getPhaseConfig.mockReturnValue({}); // Empty config
      await configManager.initialize();

      const config = configManager.getConfig();
      expect(config.alignmentWeights.daily).toBe(50); // Default
    });
  });

  describe("Configuration Validation", () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it("should validate valid configuration updates", () => {
      expect(() => {
        configManager.updateAlignmentWeights({ daily: 45, h4: 35, m15: 20 });
      }).not.toThrow();

      expect(mockSharedManager.savePhaseConfig).toHaveBeenCalled();
    });

    it("should reject invalid alignment weights", () => {
      expect(() => {
        configManager.updateAlignmentWeights({ daily: 70 }); // > 60%
      }).toThrow();
    });
  });

  describe("Configuration Updates", () => {
    beforeEach(async () => {
      await configManager.initialize();
    });

    it("should update alignment weights and save", () => {
      configManager.updateAlignmentWeights({ daily: 45, h4: 35, m15: 20 });

      expect(mockSharedManager.savePhaseConfig).toHaveBeenCalledWith(
        "phase2-hunter",
        expect.objectContaining({
          alignmentWeights: expect.objectContaining({
            daily: 45,
            h4: 35,
            m15: 20,
          }),
        }),
      );
    });

    it("should emit configChanged event on updates", (done) => {
      configManager.on("configChanged", (event) => {
        expect(event.newValue.alignmentWeights.daily).toBe(45);
        done();
      });

      configManager.updateAlignmentWeights({ daily: 45, h4: 35, m15: 20 });
    });
  });

  describe("Hot Reload", () => {
    it("should listen to shared manager events", async () => {
      await configManager.initialize();
      expect(mockSharedManager.on).toHaveBeenCalledWith(
        "configChanged",
        expect.any(Function),
      );
      expect(mockSharedManager.on).toHaveBeenCalledWith(
        "configReloaded",
        expect.any(Function),
      );
    });
  });

  describe("Oracle Configuration Validation", () => {
    it("should validate Oracle veto threshold range (30-70%)", () => {
      expect(() => {
        configManager.updateOracleConfig({ vetoThreshold: 50 });
      }).not.toThrow();

      expect(() => {
        configManager.updateOracleConfig({ vetoThreshold: 20 });
      }).toThrow();

      expect(() => {
        configManager.updateOracleConfig({ vetoThreshold: 80 });
      }).toThrow();
    });

    it("should validate Oracle conviction multiplier max (1.0-2.0)", () => {
      expect(() => {
        configManager.updateOracleConfig({ convictionMultiplierMax: 1.5 });
      }).not.toThrow();

      expect(() => {
        configManager.updateOracleConfig({ convictionMultiplierMax: 0.5 });
      }).toThrow();

      expect(() => {
        configManager.updateOracleConfig({ convictionMultiplierMax: 2.5 });
      }).toThrow();
    });
  });

  describe("Bot Trap Configuration Validation", () => {
    it("should validate precision threshold range (0.1-1%)", () => {
      expect(() => {
        configManager.updateBotTrapConfig({ precisionThreshold: 0.5 });
      }).not.toThrow();

      expect(() => {
        configManager.updateBotTrapConfig({ precisionThreshold: 0.05 });
      }).toThrow();

      expect(() => {
        configManager.updateBotTrapConfig({ precisionThreshold: 2.0 });
      }).toThrow();
    });
  });

  describe("Utility Methods", () => {
    it("should generate proper summary", async () => {
      await configManager.initialize();
      const summary = configManager.getConfigSummary();
      expect(summary).toContain("Alignment:");
      expect(summary).toContain("Risk:");
      expect(summary).toContain("Oracle");
    });
  });
});
