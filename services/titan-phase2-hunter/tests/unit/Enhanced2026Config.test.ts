/**
 * Unit Tests for Enhanced 2026 Configuration Manager
 * 
 * Tests configuration loading, validation, and parameter management
 * for the 2026 modernization enhancements.
 * 
 * **Feature: titan-phase2-2026-modernization**
 * **Validates: Requirements 16.1-16.7**
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  Enhanced2026ConfigManager,
  DEFAULT_ENHANCED_2026_CONFIG,
  Enhanced2026Config,
  OracleConfig,
  FlowValidatorConfig,
  BotTrapConfig,
  GlobalAggregatorConfig,
  ConvictionConfig
} from '../../src/config/Enhanced2026Config';

describe('Enhanced2026ConfigManager', () => {
  const testConfigDir = './test-config-2026';
  const testConfigPath = join(testConfigDir, 'enhanced-2026.config.json');
  
  beforeEach(() => {
    // Clean up test directory before each test
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
    mkdirSync(testConfigDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory after each test
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true, force: true });
    }
  });

  describe('Configuration Loading', () => {
    it('should create default config when no file exists', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      const config = manager.getConfig();
      
      expect(config.oracle.enabled).toBe(true);
      expect(config.flowValidator.enabled).toBe(true);
      expect(config.botTrapDetector.enabled).toBe(true);
      expect(config.globalAggregator.enabled).toBe(true);
      expect(existsSync(testConfigPath)).toBe(true);
      
      manager.destroy();
    });

    it('should load existing valid config', () => {
      // Create a valid config file
      const customConfig: Enhanced2026Config = {
        ...DEFAULT_ENHANCED_2026_CONFIG,
        oracle: {
          ...DEFAULT_ENHANCED_2026_CONFIG.oracle,
          vetoThreshold: 50
        }
      };
      writeFileSync(testConfigPath, JSON.stringify(customConfig, null, 2));
      
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      const config = manager.getConfig();
      
      expect(config.oracle.vetoThreshold).toBe(50);
      
      manager.destroy();
    });

    it('should fall back to defaults on corrupted config', () => {
      // Create an invalid config file
      writeFileSync(testConfigPath, '{ invalid json }');
      
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      const config = manager.getConfig();
      
      // Should have default values
      expect(config.oracle.vetoThreshold).toBe(DEFAULT_ENHANCED_2026_CONFIG.oracle.vetoThreshold);
      
      manager.destroy();
    });
  });


  describe('Oracle Configuration Validation', () => {
    /**
     * Requirement 16.1: Allow adjustment of Prediction Veto threshold (30-70%)
     */
    it('should validate Oracle veto threshold range (30-70%)', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Valid threshold
      expect(() => {
        manager.updateOracleConfig({ vetoThreshold: 50 });
      }).not.toThrow();
      
      // Invalid threshold - too low
      expect(() => {
        manager.updateOracleConfig({ vetoThreshold: 20 });
      }).toThrow(/veto threshold must be 30-70%/i);
      
      // Invalid threshold - too high
      expect(() => {
        manager.updateOracleConfig({ vetoThreshold: 80 });
      }).toThrow(/veto threshold must be 30-70%/i);
      
      manager.destroy();
    });

    it('should validate Oracle conviction multiplier max (1.0-2.0)', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Valid multiplier
      expect(() => {
        manager.updateOracleConfig({ convictionMultiplierMax: 1.5 });
      }).not.toThrow();
      
      // Invalid multiplier - too low
      expect(() => {
        manager.updateOracleConfig({ convictionMultiplierMax: 0.5 });
      }).toThrow(/conviction multiplier max must be 1.0-2.0/i);
      
      // Invalid multiplier - too high
      expect(() => {
        manager.updateOracleConfig({ convictionMultiplierMax: 2.5 });
      }).toThrow(/conviction multiplier max must be 1.0-2.0/i);
      
      manager.destroy();
    });
  });

  describe('Flow Validator Configuration Validation', () => {
    /**
     * Requirement 16.2: Allow adjustment of Sweep Detection threshold (3-10 levels)
     */
    it('should validate sweep threshold range (3-10 levels)', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Valid threshold
      expect(() => {
        manager.updateFlowValidatorConfig({ sweepThreshold: 5 });
      }).not.toThrow();
      
      // Invalid threshold - too low
      expect(() => {
        manager.updateFlowValidatorConfig({ sweepThreshold: 2 });
      }).toThrow(/sweep threshold must be 3-10 levels/i);
      
      // Invalid threshold - too high
      expect(() => {
        manager.updateFlowValidatorConfig({ sweepThreshold: 15 });
      }).toThrow(/sweep threshold must be 3-10 levels/i);
      
      manager.destroy();
    });

    it('should validate iceberg density threshold (0-100)', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Valid threshold
      expect(() => {
        manager.updateFlowValidatorConfig({ icebergDensityThreshold: 70 });
      }).not.toThrow();
      
      // Invalid threshold - negative
      expect(() => {
        manager.updateFlowValidatorConfig({ icebergDensityThreshold: -10 });
      }).toThrow(/iceberg density threshold must be 0-100/i);
      
      // Invalid threshold - too high
      expect(() => {
        manager.updateFlowValidatorConfig({ icebergDensityThreshold: 150 });
      }).toThrow(/iceberg density threshold must be 0-100/i);
      
      manager.destroy();
    });
  });

  describe('Bot Trap Configuration Validation', () => {
    /**
     * Requirement 16.3: Allow adjustment of precision tolerance (0.1-1%)
     */
    it('should validate precision threshold range (0.1-1%)', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Valid threshold
      expect(() => {
        manager.updateBotTrapConfig({ precisionThreshold: 0.5 });
      }).not.toThrow();
      
      // Invalid threshold - too low
      expect(() => {
        manager.updateBotTrapConfig({ precisionThreshold: 0.05 });
      }).toThrow(/precision threshold must be 0.1-1.0%/i);
      
      // Invalid threshold - too high
      expect(() => {
        manager.updateBotTrapConfig({ precisionThreshold: 2.0 });
      }).toThrow(/precision threshold must be 0.1-1.0%/i);
      
      manager.destroy();
    });

    it('should validate position size reduction (0.1-1.0)', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Valid reduction (50%)
      expect(() => {
        manager.updateBotTrapConfig({ positionSizeReduction: 0.5 });
      }).not.toThrow();
      
      // Invalid reduction - too low
      expect(() => {
        manager.updateBotTrapConfig({ positionSizeReduction: 0.05 });
      }).toThrow(/position size reduction must be 0.1-1.0/i);
      
      manager.destroy();
    });
  });


  describe('Global Aggregator Configuration Validation', () => {
    /**
     * Requirement 16.4: Allow weighting adjustment for each exchange (20-50%)
     */
    it('should validate exchange weights range (20-50%)', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Valid weights that sum to 100%
      expect(() => {
        manager.updateGlobalAggregatorConfig({
          exchangeWeights: { binance: 40, coinbase: 35, kraken: 25 }
        });
      }).not.toThrow();
      
      // Invalid weight - too low
      expect(() => {
        manager.updateGlobalAggregatorConfig({
          exchangeWeights: { binance: 10, coinbase: 45, kraken: 45 }
        });
      }).toThrow(/exchange weight.*must be 20-50%/i);
      
      // Invalid weight - too high
      expect(() => {
        manager.updateGlobalAggregatorConfig({
          exchangeWeights: { binance: 60, coinbase: 25, kraken: 15 }
        });
      }).toThrow(/exchange weight.*must be 20-50%/i);
      
      manager.destroy();
    });

    it('should validate exchange weights sum to 100%', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Invalid - doesn't sum to 100%
      expect(() => {
        manager.updateGlobalAggregatorConfig({
          exchangeWeights: { binance: 40, coinbase: 40, kraken: 40 }
        });
      }).toThrow(/exchange weights must sum to 100%/i);
      
      manager.destroy();
    });

    it('should validate consensus threshold (0.5-1.0)', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Valid threshold (2 out of 3 = 0.67)
      expect(() => {
        manager.updateGlobalAggregatorConfig({ consensusThreshold: 0.67 });
      }).not.toThrow();
      
      // Invalid threshold - too low
      expect(() => {
        manager.updateGlobalAggregatorConfig({ consensusThreshold: 0.3 });
      }).toThrow(/consensus threshold must be 0.5-1.0/i);
      
      // Invalid threshold - too high
      expect(() => {
        manager.updateGlobalAggregatorConfig({ consensusThreshold: 1.5 });
      }).toThrow(/consensus threshold must be 0.5-1.0/i);
      
      manager.destroy();
    });
  });

  describe('Conviction Configuration Validation', () => {
    /**
     * Requirement 16.5: Allow range adjustment (1.0x-2.0x maximum)
     */
    it('should validate conviction multiplier range (1.0-2.0x)', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Valid max multiplier
      expect(() => {
        manager.updateConvictionConfig({ maxMultiplier: 1.8 });
      }).not.toThrow();
      
      // Invalid max multiplier - too low
      expect(() => {
        manager.updateConvictionConfig({ maxMultiplier: 0.5 });
      }).toThrow(/max conviction multiplier must be 1.0-2.0/i);
      
      // Invalid max multiplier - too high
      expect(() => {
        manager.updateConvictionConfig({ maxMultiplier: 3.0 });
      }).toThrow(/max conviction multiplier must be 1.0-2.0/i);
      
      manager.destroy();
    });

    it('should validate min multiplier is less than max', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Invalid - min >= max
      expect(() => {
        manager.updateConvictionConfig({ minMultiplier: 1.5, maxMultiplier: 1.5 });
      }).toThrow(/min multiplier.*must be less than max/i);
      
      manager.destroy();
    });
  });

  describe('Configuration Summary', () => {
    it('should generate readable configuration summary', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      const summary = manager.getConfigSummary();
      
      expect(summary).toContain('Oracle');
      expect(summary).toContain('Flow Validator');
      expect(summary).toContain('Bot Trap');
      expect(summary).toContain('Global CVD');
      expect(summary).toContain('Conviction');
      expect(summary).toContain('Emergency');
      
      manager.destroy();
    });

    it('should correctly report enabled enhancements', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // All enabled by default
      expect(manager.areAllEnhancementsEnabled()).toBe(true);
      
      const enabled = manager.getEnabledEnhancements();
      expect(enabled).toContain('Oracle');
      expect(enabled).toContain('FlowValidator');
      expect(enabled).toContain('BotTrapDetector');
      expect(enabled).toContain('GlobalAggregator');
      expect(enabled).toContain('Conviction');
      
      manager.destroy();
    });
  });

  describe('Configuration Reset', () => {
    it('should reset to defaults', () => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      // Modify config
      manager.updateOracleConfig({ vetoThreshold: 60 });
      expect(manager.getConfig().oracle.vetoThreshold).toBe(60);
      
      // Reset to defaults
      manager.resetToDefaults();
      expect(manager.getConfig().oracle.vetoThreshold).toBe(DEFAULT_ENHANCED_2026_CONFIG.oracle.vetoThreshold);
      
      manager.destroy();
    });
  });

  describe('Configuration Events', () => {
    it('should emit configChanged event on update', (done) => {
      const manager = new Enhanced2026ConfigManager(testConfigDir);
      
      manager.on('configChanged', (event) => {
        expect(event.section).toBe('all');
        expect(event.timestamp).toBeDefined();
        manager.destroy();
        done();
      });
      
      manager.updateOracleConfig({ vetoThreshold: 55 });
    });
  });
});
