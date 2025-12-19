/**
 * Performance Optimizer Unit Tests
 */

import { PerformanceOptimizer, DEFAULT_PERFORMANCE_CONFIG } from '../../PerformanceOptimizer';

describe('PerformanceOptimizer', () => {
  let optimizer: PerformanceOptimizer;

  beforeEach(() => {
    optimizer = new PerformanceOptimizer();
  });

  afterEach(async () => {
    await optimizer.destroy();
  });

  describe('constructor', () => {
    it('should create optimizer with default configuration', () => {
      expect(optimizer).toBeDefined();
      expect(optimizer.isSystemOptimized()).toBe(false);
    });

    it('should create optimizer with custom configuration', () => {
      const customConfig = {
        nodejs: { maxOldSpaceSize: 8192 },
        dataDir: '/custom/path'
      };

      const customOptimizer = new PerformanceOptimizer(customConfig);
      expect(customOptimizer).toBeDefined();
      expect(customOptimizer.getConfiguration().dataDir).toBe('/custom/path');
    });
  });

  describe('configuration management', () => {
    it('should return current configuration', () => {
      const config = optimizer.getConfiguration();

      expect(config).toHaveProperty('nodejs');
      expect(config).toHaveProperty('redis');
      expect(config).toHaveProperty('system');
      expect(config).toHaveProperty('dataDir');
    });

    it('should update configuration', () => {
      const newConfig = {
        nodejs: { maxOldSpaceSize: 8192 },
        dataDir: '/new/path'
      };

      optimizer.updateConfiguration(newConfig);
      const config = optimizer.getConfiguration();

      expect(config.nodejs.maxOldSpaceSize).toBe(8192);
      expect(config.dataDir).toBe('/new/path');
    });
  });

  describe('system state management', () => {
    it('should track optimization status', () => {
      expect(optimizer.isSystemOptimized()).toBe(false);
    });

    it('should handle configuration updates', () => {
      const initialConfig = optimizer.getConfiguration();
      expect(initialConfig.dataDir).toBe('/var/lib/titan');

      optimizer.updateConfiguration({
        dataDir: '/custom/data'
      });

      const updatedConfig = optimizer.getConfiguration();
      expect(updatedConfig.dataDir).toBe('/custom/data');
    });
  });

  describe('default configuration', () => {
    it('should use default performance configuration', () => {
      const config = optimizer.getConfiguration();
      
      expect(config.nodejs).toBeDefined();
      expect(config.redis).toBeDefined();
      expect(config.system).toBeDefined();
      expect(config.dataDir).toBe('/var/lib/titan');
    });

    it('should have reasonable default values', () => {
      const config = optimizer.getConfiguration();
      
      expect(config.nodejs.maxOldSpaceSize).toBeGreaterThan(0);
      expect(config.redis.maxMemory).toBeDefined();
      expect(config.system.logRotation).toBeDefined();
    });
  });
});