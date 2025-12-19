/**
 * Unit tests for Config Manager
 */

import { ConfigManager, BrainConfig, PhaseConfig } from '../../dist/ConfigManager';
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

describe('ConfigManager Unit Tests', () => {
  let configManager: ConfigManager;
  const testConfigDir = './test-config';

  beforeEach(() => {
    // Clean up any existing test configs
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
    
    // Create test config directory
    mkdirSync(testConfigDir, { recursive: true });
    
    configManager = new ConfigManager(testConfigDir);
  });

  afterEach(() => {
    configManager.shutdown();
    
    // Clean up test configs
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('Basic Functionality', () => {
    it('should initialize correctly', () => {
      expect(configManager).toBeDefined();
      
      const summary = configManager.getConfigSummary();
      expect(summary.brainLoaded).toBe(false);
      expect(summary.phasesLoaded).toHaveLength(0);
      expect(summary.servicesLoaded).toHaveLength(0);
      expect(summary.hasOverrides).toBe(false);
    });

    it('should load brain configuration', async () => {
      const brainConfig: BrainConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        }
      };

      // Write brain config file
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        JSON.stringify(brainConfig, null, 2)
      );

      const loadedConfig = await configManager.loadBrainConfig();
      
      expect(loadedConfig).toEqual(brainConfig);
      expect(configManager.getBrainConfig()).toEqual(brainConfig);
      
      const summary = configManager.getConfigSummary();
      expect(summary.brainLoaded).toBe(true);
    });

    it('should load phase configuration', async () => {
      const phaseConfig: PhaseConfig = {
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
            timeout: 5000
          },
          mexc: { 
            enabled: false, 
            executeOn: false,
            testnet: false,
            rateLimit: 10,
            timeout: 5000
          }
        }
      };

      // Write phase config file
      writeFileSync(
        join(testConfigDir, 'phase1.config.json'),
        JSON.stringify(phaseConfig, null, 2)
      );

      const loadedConfig = await configManager.loadPhaseConfig('phase1');
      
      expect(loadedConfig).toEqual(phaseConfig);
      expect(configManager.getPhaseConfig('phase1')).toEqual(phaseConfig);
      
      const summary = configManager.getConfigSummary();
      expect(summary.phasesLoaded).toContain('phase1');
    });

    it('should load service configuration', async () => {
      const serviceConfig = {
        timeout: 30000,
        retries: 3,
        enableLogging: true
      };

      // Write service config file
      writeFileSync(
        join(testConfigDir, 'websocket.config.json'),
        JSON.stringify(serviceConfig, null, 2)
      );

      const loadedConfig = await configManager.loadServiceConfig('websocket');
      
      expect(loadedConfig).toEqual(serviceConfig);
      expect(configManager.getServiceConfig('websocket')).toEqual(serviceConfig);
      
      const summary = configManager.getConfigSummary();
      expect(summary.servicesLoaded).toContain('websocket');
    });

    it('should handle missing service config gracefully', async () => {
      const loadedConfig = await configManager.loadServiceConfig('nonexistent');
      
      expect(loadedConfig).toEqual({});
      expect(configManager.getServiceConfig('nonexistent')).toEqual({});
    });

    it('should save brain configuration', () => {
      const brainConfig: BrainConfig = {
        maxTotalLeverage: 100,
        maxGlobalDrawdown: 0.2,
        emergencyFlattenThreshold: 0.2,
        phaseTransitionRules: {
          phase1ToPhase2: 10000,
          phase2ToPhase3: 100000
        }
      };

      configManager.saveBrainConfig(brainConfig);
      
      expect(configManager.getBrainConfig()).toEqual(brainConfig);
      
      // Check file was written
      const configFile = join(testConfigDir, 'brain.config.json');
      expect(existsSync(configFile)).toBe(true);
    });

    it('should save phase configuration', () => {
      const phaseConfig: PhaseConfig = {
        enabled: true,
        maxLeverage: 10,
        maxDrawdown: 0.05,
        maxPositionSize: 0.3,
        riskPerTrade: 0.01,
        exchanges: {
          bybit: { 
            enabled: true, 
            executeOn: true,
            testnet: false,
            rateLimit: 10,
            timeout: 5000
          }
        }
      };

      configManager.savePhaseConfig('phase2', phaseConfig);
      
      expect(configManager.getPhaseConfig('phase2')).toEqual(phaseConfig);
      
      // Check file was written
      const configFile = join(testConfigDir, 'phase2.config.json');
      expect(existsSync(configFile)).toBe(true);
    });

    it('should apply brain overrides to phase config', async () => {
      const brainConfig: BrainConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        },
        overrides: {
          phase1: {
            maxLeverage: 15, // Override from default 20
            maxDrawdown: 0.05 // Override from default 0.07
          }
        }
      };

      const phaseConfig: PhaseConfig = {
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
            timeout: 5000
          }
        }
      };

      // Write configs
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        JSON.stringify(brainConfig, null, 2)
      );
      writeFileSync(
        join(testConfigDir, 'phase1.config.json'),
        JSON.stringify(phaseConfig, null, 2)
      );

      // Load brain config first
      await configManager.loadBrainConfig();
      
      // Load phase config (should apply overrides)
      const loadedPhaseConfig = await configManager.loadPhaseConfig('phase1');
      
      expect(loadedPhaseConfig.maxLeverage).toBe(15); // Overridden
      expect(loadedPhaseConfig.maxDrawdown).toBe(0.05); // Overridden
      expect(loadedPhaseConfig.maxPositionSize).toBe(0.5); // Not overridden
      
      expect(configManager.hasBrainOverrides('phase1')).toBe(true);
      expect(configManager.hasBrainOverrides()).toBe(true);
    });

    it('should emit configuration change events', (done) => {
      const brainConfig: BrainConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        }
      };

      configManager.on('configChanged', (event) => {
        expect(event.level).toBe('brain');
        expect(event.key).toBe('brain');
        expect(event.newValue).toEqual(brainConfig);
        expect(event.timestamp).toBeDefined();
        done();
      });

      configManager.saveBrainConfig(brainConfig);
    });
  });

  describe('Validation', () => {
    it('should validate brain configuration', () => {
      const invalidBrainConfig = {
        maxTotalLeverage: -1, // Invalid
        maxGlobalDrawdown: 1.5, // Invalid (> 1)
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        }
      } as BrainConfig;

      expect(() => {
        configManager.saveBrainConfig(invalidBrainConfig);
      }).toThrow();
    });

    it('should validate phase configuration', () => {
      const invalidPhaseConfig = {
        enabled: true,
        maxLeverage: -1, // Invalid
        maxDrawdown: 1.5, // Invalid (> 1)
        maxPositionSize: 0.5,
        riskPerTrade: 0.02,
        exchanges: {
          bybit: { 
            enabled: true, 
            executeOn: true,
            testnet: false,
            rateLimit: 10,
            timeout: 5000
          }
        }
      } as PhaseConfig;

      expect(() => {
        configManager.savePhaseConfig('phase1', invalidPhaseConfig);
      }).toThrow();
    });

    it('should validate phase config against brain limits', () => {
      const brainConfig: BrainConfig = {
        maxTotalLeverage: 30, // Lower limit
        maxGlobalDrawdown: 0.1, // Lower limit
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        }
      };

      const phaseConfig: PhaseConfig = {
        enabled: true,
        maxLeverage: 50, // Exceeds brain limit
        maxDrawdown: 0.15, // Exceeds brain limit
        maxPositionSize: 0.5,
        riskPerTrade: 0.02,
        exchanges: {
          bybit: { 
            enabled: true, 
            executeOn: true,
            testnet: false,
            rateLimit: 10,
            timeout: 5000
          }
        }
      };

      configManager.saveBrainConfig(brainConfig);

      expect(() => {
        configManager.savePhaseConfig('phase1', phaseConfig);
      }).toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing brain config file', async () => {
      await expect(configManager.loadBrainConfig()).rejects.toThrow();
    });

    it('should handle missing phase config file with defaults', async () => {
      const config = await configManager.loadPhaseConfig('nonexistent');
      expect(config).toBeDefined();
      expect(config.enabled).toBe(true); // Default value
    });

    it('should handle invalid JSON in config files', async () => {
      // Write invalid JSON
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        'invalid json content'
      );

      await expect(configManager.loadBrainConfig()).rejects.toThrow();
    });

    it('should handle configuration reload errors gracefully', async () => {
      const brainConfig: BrainConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        }
      };

      // Write valid config first
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        JSON.stringify(brainConfig, null, 2)
      );

      configManager.loadBrainConfig();

      // Listen for error events
      let errorEmitted = false;
      configManager.on('configError', (error) => {
        expect(error.level).toBe('brain');
        expect(error.key).toBe('brain');
        errorEmitted = true;
      });

      // Overwrite with invalid JSON
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        'invalid json'
      );

      // Trigger reload
      await configManager.reloadBrainConfig();

      // Should have emitted error but not crashed
      expect(errorEmitted).toBe(true);
    });
  });

  describe('Hot Reload', () => {
    it('should reload brain configuration', async () => {
      const initialConfig: BrainConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        }
      };

      const updatedConfig: BrainConfig = {
        maxTotalLeverage: 100,
        maxGlobalDrawdown: 0.2,
        emergencyFlattenThreshold: 0.2,
        phaseTransitionRules: {
          phase1ToPhase2: 10000,
          phase2ToPhase3: 100000
        }
      };

      // Write initial config
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        JSON.stringify(initialConfig, null, 2)
      );

      await configManager.loadBrainConfig();
      expect(configManager.getBrainConfig()).toEqual(initialConfig);

      // Update config file
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        JSON.stringify(updatedConfig, null, 2)
      );

      // Reload
      await configManager.reloadBrainConfig();
      expect(configManager.getBrainConfig()).toEqual(updatedConfig);
    });

    it('should reload phase configuration', async () => {
      const initialConfig: PhaseConfig = {
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
            timeout: 5000
          }
        }
      };

      const updatedConfig: PhaseConfig = {
        enabled: true,
        maxLeverage: 15,
        maxDrawdown: 0.05,
        maxPositionSize: 0.3,
        riskPerTrade: 0.015,
        exchanges: {
          bybit: { 
            enabled: true, 
            executeOn: true,
            testnet: false,
            rateLimit: 10,
            timeout: 5000
          },
          mexc: { 
            enabled: true, 
            executeOn: false,
            testnet: false,
            rateLimit: 10,
            timeout: 5000
          }
        }
      };

      // Write initial config
      writeFileSync(
        join(testConfigDir, 'phase1.config.json'),
        JSON.stringify(initialConfig, null, 2)
      );

      await configManager.loadPhaseConfig('phase1');
      const loadedConfig = configManager.getPhaseConfig('phase1');
      expect(loadedConfig?.maxLeverage).toBe(initialConfig.maxLeverage);
      expect(loadedConfig?.maxDrawdown).toBe(initialConfig.maxDrawdown);

      // Update config file
      writeFileSync(
        join(testConfigDir, 'phase1.config.json'),
        JSON.stringify(updatedConfig, null, 2)
      );

      // Reload
      await configManager.reloadPhaseConfig('phase1');
      expect(configManager.getPhaseConfig('phase1')).toEqual(updatedConfig);
    });

    it('should emit reload events', (done) => {
      const config: BrainConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        }
      };

      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        JSON.stringify(config, null, 2)
      );

      configManager.loadBrainConfig();

      configManager.on('configReloaded', (event) => {
        expect(event.level).toBe('brain');
        expect(event.key).toBe('brain');
        expect(event.timestamp).toBeDefined();
        done();
      });

      configManager.reloadBrainConfig();
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      const brainConfig: BrainConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        }
      };

      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        JSON.stringify(brainConfig, null, 2)
      );

      await configManager.loadBrainConfig();
      
      const summary = configManager.getConfigSummary();
      expect(summary.brainLoaded).toBe(true);

      configManager.shutdown();

      // Should still be accessible after shutdown
      expect(configManager).toBeDefined();
    });
  });
});