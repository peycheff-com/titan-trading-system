/**
 * Unit tests for HotReloadConfigManager
 *
 * Tests hot-reload functionality with encryption support
 * and configuration change validation.
 */

import { HotReloadConfigManager } from "../../../src/config/HotReloadConfigManager";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

describe("HotReloadConfigManager", () => {
  const testConfigDir = "./test-hot-reload-config";
  let manager: HotReloadConfigManager;

  beforeEach(async () => {
    // Create test config directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
    mkdirSync(testConfigDir, { recursive: true });

    // Initialize manager
    manager = new HotReloadConfigManager({
      configDirectory: testConfigDir,
      environment: "development",
      enableEncryption: true,
      watchInterval: 100, // Fast for testing
      rollbackOnError: true,
    });

    await manager.initialize("TestMasterPassword123!@#");
  });

  afterEach(() => {
    manager.destroy();

    // Clean up test config directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
  });

  describe("Configuration Loading and Watching", () => {
    it("should load and watch brain configuration", async () => {
      // Create brain config
      const brainConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000,
        },
      };

      writeFileSync(
        join(testConfigDir, "brain.config.json"),
        JSON.stringify(brainConfig, null, 2),
      );

      const loadedConfig = await manager.loadAndWatchBrainConfig();

      expect(loadedConfig).toMatchObject(brainConfig);
      expect(manager.getCurrentConfig("brain")).toMatchObject(brainConfig);
    });

    it("should load and watch phase configuration", async () => {
      // Create phase config
      const phaseConfig = {
        enabled: true,
        maxLeverage: 20,
        maxDrawdown: 0.07,
        maxPositionSize: 0.5,
        riskPerTrade: 0.02,
        exchanges: {
          bybit: {
            enabled: true,
            executeOn: true,
            testnet: false,
            rateLimit: 10,
            timeout: 5000,
            apiKey: "dummy",
            apiSecret: "dummy",
          },
        },
      };

      writeFileSync(
        join(testConfigDir, "phase1.config.json"),
        JSON.stringify(phaseConfig, null, 2),
      );

      const loadedConfig = await manager.loadAndWatchPhaseConfig("phase1");

      expect(loadedConfig).toMatchObject(phaseConfig);
      expect(manager.getCurrentConfig("phase1")).toMatchObject(phaseConfig);
    });

    it("should load and watch service configuration", async () => {
      // Create service config
      const serviceConfig = {
        port: 3100,
        logLevel: "info",
        database: {
          host: "localhost",
          port: 5432,
          name: "titan_brain",
          user: "titan",
          password: "test_password",
          ssl: false,
        },
        redis: {
          url: "redis://localhost:6379/1",
          keyPrefix: "titan:brain:",
        },
      };

      writeFileSync(
        join(testConfigDir, "titan-brain.config.json"),
        JSON.stringify(serviceConfig, null, 2),
      );

      const loadedConfig = await manager.loadAndWatchServiceConfig(
        "titan-brain",
      );

      expect(loadedConfig).toMatchObject(serviceConfig);
      expect(manager.getCurrentConfig("titan-brain")).toMatchObject(
        serviceConfig,
      );
    });
  });

  describe("Hot-Reload Events", () => {
    it("should emit hot-reload events on configuration changes", async () => {
      // Create initial brain config
      const initialConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000,
        },
      };

      const configPath = join(testConfigDir, "brain.config.json");
      writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));

      await manager.loadAndWatchBrainConfig();

      // Create a promise that resolves when the event is emitted
      const eventPromise = new Promise((resolve) => {
        manager.once("hotReload", (event) => {
          expect(event.type).toBe("config-changed");
          expect(event.configType).toBe("brain");
          expect(event.configKey).toBe("brain");
          expect(event.newValue.maxTotalLeverage).toBe(25); // Updated value
          resolve(event);
        });
      });

      // Update configuration file
      const updatedConfig = { ...initialConfig, maxTotalLeverage: 25 };

      // Wait a bit then update the file
      setTimeout(() => {
        writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
      }, 200);

      // Wait for the event
      await eventPromise;
    }, 10000);
  });

  describe("Configuration Encryption", () => {
    it("should handle encrypted configuration fields", async () => {
      // Create phase config with sensitive data
      const phaseConfig = {
        enabled: true,
        maxLeverage: 20,
        maxDrawdown: 0.07,
        maxPositionSize: 0.5,
        riskPerTrade: 0.02,
        exchanges: {
          bybit: {
            enabled: true,
            executeOn: true,
            apiKey: "secret-api-key",
            apiSecret: "secret-api-secret",
            testnet: false,
            rateLimit: 10,
            timeout: 5000,
          },
        },
      };

      // Save config with encryption
      await manager.saveConfigWithEncryption("phase", "phase1", phaseConfig);

      // Load the saved config
      const loadedConfig = await manager.loadAndWatchPhaseConfig("phase1");

      // Should have decrypted the sensitive fields
      expect(loadedConfig.exchanges.bybit.apiKey).toBe("secret-api-key");
      expect(loadedConfig.exchanges.bybit.apiSecret).toBe("secret-api-secret");
    });
  });

  describe("Configuration Backup and Rollback", () => {
    it("should maintain configuration history", async () => {
      // Create initial config
      const initialConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000,
        },
      };

      writeFileSync(
        join(testConfigDir, "brain.config.json"),
        JSON.stringify(initialConfig, null, 2),
      );

      await manager.loadAndWatchBrainConfig();

      // Check that backup was created
      const history = manager.getConfigHistory("brain", "brain");
      expect(history).toHaveLength(1);
      expect(history[0].data).toMatchObject(initialConfig);
    });

    it("should rollback configuration on request", async () => {
      // Create initial config
      const initialConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000,
        },
      };

      writeFileSync(
        join(testConfigDir, "brain.config.json"),
        JSON.stringify(initialConfig, null, 2),
      );

      await manager.loadAndWatchBrainConfig();

      // Simulate a config change by manually updating current config
      const updatedConfig = { ...initialConfig, maxTotalLeverage: 25 };
      manager["currentConfigs"].set("brain", updatedConfig);
      manager["createBackup"]("brain", "brain", updatedConfig, false);

      // Rollback to previous version
      const rollbackSuccess = manager.rollbackConfig("brain", "brain", 1);

      expect(rollbackSuccess).toBe(true);
      expect((manager.getCurrentConfig("brain") as any).maxTotalLeverage).toBe(
        50,
      ); // Original value
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid configuration changes", async () => {
      // Create valid initial config
      const validConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000,
        },
      };

      const configPath = join(testConfigDir, "brain.config.json");
      writeFileSync(configPath, JSON.stringify(validConfig, null, 2));

      await manager.loadAndWatchBrainConfig();

      // Listen for error event
      let errorReceived = false;
      manager.once("hotReload", (event) => {
        if (event.type === "config-error") {
          errorReceived = true;
        }
      });

      // Update with invalid config
      const invalidConfig = { ...validConfig, maxTotalLeverage: -10 }; // Invalid negative value

      setTimeout(() => {
        writeFileSync(configPath, JSON.stringify(invalidConfig, null, 2));
      }, 200);

      // Wait for error handling
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Config should remain unchanged due to rollback on error
      expect((manager.getCurrentConfig("brain") as any).maxTotalLeverage).toBe(
        50,
      );
    });
  });
});
