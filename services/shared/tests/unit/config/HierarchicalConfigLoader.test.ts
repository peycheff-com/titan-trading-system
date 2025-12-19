/**
 * Unit tests for HierarchicalConfigLoader
 * 
 * Tests the hierarchical configuration loading with environment-specific overrides,
 * schema validation, and proper precedence handling.
 */

import { HierarchicalConfigLoader } from '../../../src/config/HierarchicalConfigLoader';
import { ConfigValidator } from '../../../src/config/ConfigSchema';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('HierarchicalConfigLoader', () => {
  const testConfigDir = './test-config';
  let loader: HierarchicalConfigLoader;
  
  beforeEach(() => {
    // Create test config directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
    mkdirSync(testConfigDir, { recursive: true });
    
    // Initialize loader
    loader = new HierarchicalConfigLoader({
      configDirectory: testConfigDir,
      environment: 'development',
      enableEnvironmentVariables: false, // Disable for predictable tests
      enableEnvironmentFiles: true,
      validateSchema: true
    });
  });
  
  afterEach(() => {
    // Clean up test config directory
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
  });
  
  describe('Brain Configuration Loading', () => {
    it('should load base brain configuration', async () => {
      // Create base config
      const baseConfig = {
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
        JSON.stringify(baseConfig, null, 2)
      );
      
      const result = await loader.loadBrainConfig();
      
      expect(result.config).toMatchObject(baseConfig);
      expect(result.validation.valid).toBe(true);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].source).toBe('base-file');
    });
    
    it('should apply environment-specific overrides', async () => {
      // Create base config with environment overrides
      const baseConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        },
        environments: {
          development: {
            maxTotalLeverage: 10,
            maxGlobalDrawdown: 0.05
          }
        }
      };
      
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        JSON.stringify(baseConfig, null, 2)
      );
      
      const result = await loader.loadBrainConfig();
      
      expect(result.config.maxTotalLeverage).toBe(10); // Overridden
      expect(result.config.maxGlobalDrawdown).toBe(0.05); // Overridden
      expect(result.config.emergencyFlattenThreshold).toBe(0.15); // Not overridden
      expect(result.sources).toHaveLength(2); // Base file + environment override
    });
    
    it('should load environment-specific config file', async () => {
      // Create base config
      const baseConfig = {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        }
      };
      
      // Create environment-specific config
      const devConfig = {
        maxTotalLeverage: 5,
        maxGlobalDrawdown: 0.03
      };
      
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        JSON.stringify(baseConfig, null, 2)
      );
      
      writeFileSync(
        join(testConfigDir, 'brain.development.config.json'),
        JSON.stringify(devConfig, null, 2)
      );
      
      const result = await loader.loadBrainConfig();
      
      expect(result.config.maxTotalLeverage).toBe(5); // From dev config
      expect(result.config.maxGlobalDrawdown).toBe(0.03); // From dev config
      expect(result.config.emergencyFlattenThreshold).toBe(0.15); // From base config
      expect(result.sources).toHaveLength(2);
    });
    
    it('should validate brain configuration schema', async () => {
      // Create invalid config
      const invalidConfig = {
        maxTotalLeverage: -10, // Invalid: negative
        maxGlobalDrawdown: 1.5, // Invalid: > 1
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
          phase1ToPhase2: 5000,
          phase2ToPhase3: 50000
        }
      };
      
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        JSON.stringify(invalidConfig, null, 2)
      );
      
      await expect(loader.loadBrainConfig()).rejects.toThrow('Invalid brain configuration');
    });
  });
  
  describe('Phase Configuration Loading', () => {
    it('should load base phase configuration', async () => {
      // Create base config
      const baseConfig = {
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
      
      writeFileSync(
        join(testConfigDir, 'phase1.config.json'),
        JSON.stringify(baseConfig, null, 2)
      );
      
      const result = await loader.loadPhaseConfig('phase1');
      
      expect(result.config).toMatchObject(baseConfig);
      expect(result.validation.valid).toBe(true);
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0].source).toBe('base-file');
    });
    
    it('should apply environment-specific overrides for phases', async () => {
      // Create base config with environment overrides
      const baseConfig = {
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
        },
        environments: {
          development: {
            maxLeverage: 5,
            exchanges: {
              bybit: {
                testnet: true
              }
            }
          }
        }
      };
      
      writeFileSync(
        join(testConfigDir, 'phase1.config.json'),
        JSON.stringify(baseConfig, null, 2)
      );
      
      const result = await loader.loadPhaseConfig('phase1');
      
      expect(result.config.maxLeverage).toBe(5); // Overridden
      expect(result.config.exchanges.bybit.testnet).toBe(true); // Overridden
      expect(result.config.maxDrawdown).toBe(0.07); // Not overridden
      expect(result.sources).toHaveLength(2); // Base file + environment override
    });
    
    it('should merge with default phase configuration', async () => {
      // Create minimal config (should merge with defaults)
      const minimalConfig = {
        maxLeverage: 15,
        exchanges: {
          bybit: {
            enabled: true,
            executeOn: true
          }
        }
      };
      
      writeFileSync(
        join(testConfigDir, 'phase1.config.json'),
        JSON.stringify(minimalConfig, null, 2)
      );
      
      const result = await loader.loadPhaseConfig('phase1');
      
      expect(result.config.maxLeverage).toBe(15); // From config
      expect(result.config.enabled).toBe(true); // From defaults
      expect(result.config.maxDrawdown).toBe(0.07); // From defaults
      expect(result.config.exchanges.bybit.testnet).toBe(false); // From defaults
    });
  });
  
  describe('Service Configuration Loading', () => {
    it('should load service configuration with schema validation', async () => {
      // Create titan-brain service config
      const serviceConfig = {
        port: 3100,
        logLevel: 'info',
        database: {
          host: 'localhost',
          port: 5432,
          name: 'titan_brain',
          user: 'titan',
          password: 'test_password',
          ssl: false
        },
        redis: {
          url: 'redis://localhost:6379/1',
          keyPrefix: 'titan:brain:'
        }
      };
      
      writeFileSync(
        join(testConfigDir, 'titan-brain.config.json'),
        JSON.stringify(serviceConfig, null, 2)
      );
      
      const result = await loader.loadServiceConfig('titan-brain');
      
      expect(result.config).toMatchObject(serviceConfig);
      expect(result.validation.valid).toBe(true);
      expect(result.sources).toHaveLength(1);
    });
    
    it('should handle unknown service configurations gracefully', async () => {
      // Create config for unknown service
      const unknownConfig = {
        someProperty: 'someValue',
        anotherProperty: 123
      };
      
      writeFileSync(
        join(testConfigDir, 'unknown-service.config.json'),
        JSON.stringify(unknownConfig, null, 2)
      );
      
      const result = await loader.loadServiceConfig('unknown-service');
      
      expect(result.config).toMatchObject(unknownConfig);
      expect(result.validation.valid).toBe(false); // No schema defined
      expect(result.validation.errors[0]).toContain('No schema defined');
    });
  });
  
  describe('Configuration Hierarchy', () => {
    it('should provide hierarchy summary', () => {
      const summary = loader.getHierarchySummary();
      
      expect(summary.environment).toBe('development');
      expect(summary.configDirectory).toContain('test-config');
      expect(summary.enabledSources).toContain('base-file');
      expect(summary.enabledSources).toContain('env-file');
      expect(summary.availableConfigs).toContain('brain');
      expect(summary.availableConfigs).toContain('phase1');
    });
  });
  
  describe('Error Handling', () => {
    it('should throw error for missing required configuration', async () => {
      // No config file exists
      await expect(loader.loadBrainConfig()).rejects.toThrow('Failed to load configuration file');
    });
    
    it('should throw error for invalid JSON', async () => {
      // Create invalid JSON file
      writeFileSync(
        join(testConfigDir, 'brain.config.json'),
        '{ invalid json }'
      );
      
      await expect(loader.loadBrainConfig()).rejects.toThrow('Failed to load configuration file');
    });
  });
});