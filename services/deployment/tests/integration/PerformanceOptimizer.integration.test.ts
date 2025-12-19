/**
 * Performance Optimizer Integration Tests
 */

import { PerformanceOptimizer } from '../../PerformanceOptimizer';

describe('PerformanceOptimizer Integration', () => {
  let optimizer: PerformanceOptimizer;

  beforeEach(() => {
    optimizer = new PerformanceOptimizer();
  });

  afterEach(async () => {
    try {
      await optimizer.destroy();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('Basic Functionality', () => {
    it('should initialize with default configuration', () => {
      expect(optimizer).toBeDefined();
      expect(optimizer.isSystemOptimized()).toBe(false);
    });

    it('should return configuration', () => {
      const config = optimizer.getConfiguration();
      
      expect(config).toHaveProperty('nodejs');
      expect(config).toHaveProperty('redis');
      expect(config).toHaveProperty('system');
      expect(config).toHaveProperty('dataDir');
      expect(config.dataDir).toBe('/var/lib/titan');
    });

    it('should update configuration', () => {
      const newConfig = {
        dataDir: '/custom/path',
        nodejs: {
          maxOldSpaceSize: 8192
        }
      };

      optimizer.updateConfiguration(newConfig);
      const updatedConfig = optimizer.getConfiguration();

      expect(updatedConfig.dataDir).toBe('/custom/path');
      expect(updatedConfig.nodejs.maxOldSpaceSize).toBe(8192);
    });

    it('should handle custom configuration in constructor', () => {
      const customConfig = {
        dataDir: '/test/path',
        nodejs: {
          maxOldSpaceSize: 4096
        }
      };

      const customOptimizer = new PerformanceOptimizer(customConfig);
      const config = customOptimizer.getConfiguration();

      expect(config.dataDir).toBe('/test/path');
      expect(config.nodejs.maxOldSpaceSize).toBe(4096);

      // Cleanup
      customOptimizer.destroy().catch(() => {});
    });
  });

  describe('Event Handling', () => {
    it('should emit configuration update events', (done) => {
      optimizer.on('configuration-updated', (config) => {
        expect(config).toBeDefined();
        expect(config.dataDir).toBe('/event/test');
        done();
      });

      optimizer.updateConfiguration({
        dataDir: '/event/test'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle destroy gracefully when not initialized', async () => {
      const newOptimizer = new PerformanceOptimizer();
      
      // Should not throw
      await expect(newOptimizer.destroy()).resolves.not.toThrow();
    });
  });
});