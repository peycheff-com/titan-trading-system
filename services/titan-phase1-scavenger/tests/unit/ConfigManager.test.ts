/**
 * ConfigManager Unit Tests
 * 
 * Tests for hierarchical configuration management with Brain override support
 */

import { ConfigManager, TrapConfig, BrainOverrideConfig, MergedConfig } from '../../src/config/ConfigManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let tempDir: string;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup temp directory
    tempDir = path.join(os.tmpdir(), 'titan-test-config');
    
    // Mock environment
    process.env.NODE_ENV = 'test';
    process.env.TITAN_CONFIG_DIR = tempDir;
    
    // Mock fs.existsSync to return false initially
    mockFs.existsSync.mockReturnValue(false);
    
    // Mock fs.mkdirSync
    mockFs.mkdirSync.mockImplementation(() => undefined);
    
    // Mock fs.watch
    mockFs.watch.mockReturnValue({
      close: jest.fn(),
    } as any);
  });

  afterEach(() => {
    if (configManager) {
      configManager.destroy();
    }
    
    // Clean up environment
    delete process.env.TITAN_CONFIG_DIR;
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with default configuration', () => {
      configManager = new ConfigManager('test');
      
      const config = configManager.getConfig();
      expect(config).toBeDefined();
      expect(config.maxLeverage).toBe(20);
      expect(config.effective.enabled).toBe(true);
    });

    it('should use environment-specific config directory', () => {
      configManager = new ConfigManager('production');
      
      const paths = configManager.getConfigPaths();
      expect(paths.configDir).toContain('production');
    });

    it('should create config directory if it does not exist', () => {
      configManager = new ConfigManager('test');
      
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('test'),
        { recursive: true }
      );
    });
  });

  describe('Phase Configuration Management', () => {
    beforeEach(() => {
      configManager = new ConfigManager('test');
    });

    it('should load phase configuration from file', () => {
      const mockConfig: TrapConfig = {
        updateInterval: 30000,
        topSymbolsCount: 15,
        liquidationConfidence: 90,
        dailyLevelConfidence: 80,
        bollingerConfidence: 85,
        minTradesIn100ms: 40,
        volumeWindowMs: 150,
        extremeVelocityThreshold: 0.004,
        moderateVelocityThreshold: 0.0008,
        aggressiveLimitMarkup: 0.0015,
        maxLeverage: 15,
        maxPositionSizePercent: 0.4,
        stopLossPercent: 0.015,
        targetPercent: 0.025,
        exchanges: {
          binance: { enabled: true },
          bybit: { enabled: true, executeOn: true },
          mexc: { enabled: false, executeOn: false },
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      configManager = new ConfigManager('test');
      const phaseConfig = configManager.getPhaseConfig();

      expect(phaseConfig.maxLeverage).toBe(15);
      expect(phaseConfig.updateInterval).toBe(30000);
    });

    it('should save phase configuration to file', () => {
      const newConfig: Partial<TrapConfig> = {
        maxLeverage: 25,
        stopLossPercent: 0.02,
      };

      configManager.updatePhaseConfig(newConfig);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('phase1-scavenger.json'),
        expect.stringContaining('"maxLeverage": 25'),
        'utf-8'
      );
    });

    it('should validate configuration before saving', () => {
      const invalidConfig: Partial<TrapConfig> = {
        maxLeverage: 150, // Invalid: exceeds maximum
      };

      expect(() => {
        configManager.updatePhaseConfig(invalidConfig);
      }).toThrow('Configuration validation failed');
    });

    it('should emit configChanged event on phase config update', (done) => {
      configManager.on('configChanged', (event) => {
        expect(event.type).toBe('phase');
        expect(event.source).toBe('api');
        expect(event.changes).toBeDefined();
        done();
      });

      configManager.updatePhaseConfig({ maxLeverage: 18 });
    });
  });

  describe('Brain Override Management', () => {
    beforeEach(() => {
      configManager = new ConfigManager('test');
    });

    it('should apply Brain overrides to phase configuration', () => {
      const brainOverrides: Partial<BrainOverrideConfig> = {
        maxGlobalLeverage: 10,
        phase1: {
          enabled: true,
          maxLeverage: 8,
          riskMultiplier: 0.5,
        },
      };

      configManager.updateBrainOverrides(brainOverrides);
      const mergedConfig = configManager.getConfig();

      expect(mergedConfig.effective.maxLeverage).toBe(8); // Brain override applied
      expect(mergedConfig.effective.riskMultiplier).toBe(0.5);
    });

    it('should enforce global leverage cap', () => {
      // Phase config has 20x leverage
      const brainOverrides: Partial<BrainOverrideConfig> = {
        maxGlobalLeverage: 15, // Global cap at 15x
      };

      configManager.updateBrainOverrides(brainOverrides);
      const mergedConfig = configManager.getConfig();

      expect(mergedConfig.effective.maxLeverage).toBe(15); // Capped by Brain
    });

    it('should disable phase when Brain sets enabled to false', () => {
      const brainOverrides: Partial<BrainOverrideConfig> = {
        phase1: {
          enabled: false,
        },
      };

      configManager.updateBrainOverrides(brainOverrides);
      const mergedConfig = configManager.getConfig();

      expect(mergedConfig.effective.enabled).toBe(false);
    });

    it('should validate Brain overrides', () => {
      const invalidOverrides: Partial<BrainOverrideConfig> = {
        maxGlobalLeverage: 150, // Invalid: exceeds maximum
      };

      configManager.updateBrainOverrides(invalidOverrides);
      const brainOverrides = configManager.getBrainOverrides();

      expect(brainOverrides.maxGlobalLeverage).toBeUndefined(); // Should be filtered out
    });

    it('should emit configChanged event on Brain override update', (done) => {
      configManager.on('configChanged', (event) => {
        expect(event.type).toBe('brain');
        expect(event.source).toBe('brain-api');
        done();
      });

      configManager.updateBrainOverrides({ maxGlobalLeverage: 12 });
    });
  });

  describe('Configuration Validation', () => {
    beforeEach(() => {
      configManager = new ConfigManager('test');
    });

    it('should validate numeric ranges', () => {
      const config = configManager.getPhaseConfig();
      const errors = configManager.validateConfig({
        ...config,
        maxLeverage: 150, // Invalid
        updateInterval: 5000, // Invalid (too low)
      });

      expect(errors).toContain('maxLeverage must be between 1 and 100');
      expect(errors).toContain('updateInterval must be between 10000ms and 300000ms');
    });

    it('should validate exchange settings', () => {
      const config = configManager.getPhaseConfig();
      const errors = configManager.validateConfig({
        ...config,
        exchanges: {
          binance: { enabled: false }, // Invalid: Binance must be enabled
          bybit: { enabled: false, executeOn: false },
          mexc: { enabled: false, executeOn: false },
        },
      });

      expect(errors).toContain('Binance must always be enabled for signal validation');
      expect(errors).toContain('At least one execution exchange (Bybit or MEXC) must be enabled');
    });

    it('should validate percentage values', () => {
      const config = configManager.getPhaseConfig();
      const errors = configManager.validateConfig({
        ...config,
        stopLossPercent: 0.15, // Invalid (too high)
        targetPercent: 0.6, // Invalid (too high)
      });

      expect(errors).toContain('stopLossPercent must be between 0.001 (0.1%) and 0.1 (10%)');
      expect(errors).toContain('targetPercent must be between 0.001 (0.1%) and 0.5 (50%)');
    });
  });

  describe('Hot-Reload Functionality', () => {
    beforeEach(() => {
      configManager = new ConfigManager('test');
    });

    it('should setup file watchers for hot-reload', () => {
      mockFs.existsSync.mockReturnValue(true);
      configManager = new ConfigManager('test');

      expect(mockFs.watch).toHaveBeenCalledTimes(2); // Phase config + Brain overrides
    });

    it('should reload configuration on file change', () => {
      const mockWatcher = {
        close: jest.fn(),
      };
      
      let watchCallback: ((eventType: string, filename?: string) => void) | undefined;
      mockFs.watch.mockImplementation((path: any, callback?: any) => {
        watchCallback = callback;
        return mockWatcher as any;
      });

      // Create new config manager to trigger watch setup
      configManager.destroy();
      mockFs.existsSync.mockReturnValue(true);
      configManager = new ConfigManager('test');

      // Simulate file change
      if (watchCallback) {
        watchCallback('change');
        // Should attempt to reload (would call readFileSync in real scenario)
        expect(mockFs.readFileSync).toHaveBeenCalled();
      }
    });

    it('should force reload all configurations', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{}');

      configManager.reload();

      expect(mockFs.readFileSync).toHaveBeenCalledTimes(2); // Phase + Brain configs
    });
  });

  describe('Configuration Status and Utilities', () => {
    beforeEach(() => {
      configManager = new ConfigManager('test');
    });

    it('should return configuration status', () => {
      const status = configManager.getConfigStatus();

      expect(status.environment).toBe('test');
      expect(status.phaseConfigExists).toBe(false);
      expect(status.brainOverridesExists).toBe(false);
      expect(status.hasBrainOverrides).toBe(false);
    });

    it('should detect Brain overrides', () => {
      configManager.updateBrainOverrides({ 
        maxGlobalLeverage: 15,
        source: 'brain',
        timestamp: Date.now(),
        version: '1.0.0',
      });

      expect(configManager.hasBrainOverrides()).toBe(true);
    });

    it('should clear Brain overrides', () => {
      configManager.updateBrainOverrides({ 
        maxGlobalLeverage: 15,
        source: 'brain',
        timestamp: Date.now(),
        version: '1.0.0',
      });
      expect(configManager.hasBrainOverrides()).toBe(true);
      
      configManager.clearBrainOverrides();
      expect(configManager.hasBrainOverrides()).toBe(false);
    });

    it('should reset to default configuration', () => {
      configManager.updatePhaseConfig({ maxLeverage: 25 });
      configManager.resetToDefaults();

      const config = configManager.getPhaseConfig();
      expect(config.maxLeverage).toBe(20); // Default value
    });

    it('should return effective configuration', () => {
      configManager.updateBrainOverrides({
        phase1: { maxLeverage: 10 },
      });

      const effectiveConfig = configManager.getEffectiveConfig();
      expect(effectiveConfig.maxLeverage).toBe(10); // Brain override applied
      expect(effectiveConfig.effective).toBeDefined();
    });
  });

  describe('Resource Cleanup', () => {
    beforeEach(() => {
      configManager = new ConfigManager('test');
    });

    it('should cleanup resources on destroy', () => {
      const mockWatcher = {
        close: jest.fn(),
      };
      
      // Mock fs.existsSync to return true so watchers are created
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('{}');
      mockFs.watch.mockReturnValue(mockWatcher as any);

      configManager = new ConfigManager('test');
      configManager.destroy();

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('should remove all event listeners on destroy', () => {
      const removeAllListenersSpy = jest.spyOn(configManager, 'removeAllListeners');
      
      configManager.destroy();

      expect(removeAllListenersSpy).toHaveBeenCalled();
    });
  });
});