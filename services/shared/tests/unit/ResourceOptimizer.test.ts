/**
 * Unit tests for ResourceOptimizer
 * 
 * Tests memory monitoring, CPU tracking, and performance optimization features.
 */

import { ResourceOptimizer, getResourceOptimizer, resetResourceOptimizer } from '../../dist/ResourceOptimizer';

describe('ResourceOptimizer', () => {
  let resourceOptimizer: ResourceOptimizer;

  beforeEach(() => {
    resetResourceOptimizer();
    resourceOptimizer = getResourceOptimizer();
  });

  afterEach(() => {
    resourceOptimizer.shutdown();
    resetResourceOptimizer();
  });

  describe('Memory Statistics', () => {
    it('should get current memory statistics', () => {
      const memStats = resourceOptimizer.getMemoryStats();
      
      expect(memStats).toBeDefined();
      expect(memStats.heapUsed).toBeGreaterThan(0);
      expect(memStats.heapTotal).toBeGreaterThan(0);
      expect(memStats.heapLimit).toBeGreaterThan(0);
      expect(memStats.rss).toBeGreaterThan(0);
      expect(memStats.heapUsagePercent).toBeGreaterThanOrEqual(0);
      expect(memStats.heapUsagePercent).toBeLessThanOrEqual(100);
    });

    it('should track garbage collection statistics', () => {
      const memStats = resourceOptimizer.getMemoryStats();
      
      expect(memStats.gcCount).toBeGreaterThanOrEqual(0);
      expect(memStats.gcDuration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('CPU Statistics', () => {
    it('should get current CPU statistics', () => {
      const cpuStats = resourceOptimizer.getCPUStats();
      
      expect(cpuStats).toBeDefined();
      expect(cpuStats.user).toBeGreaterThanOrEqual(0);
      expect(cpuStats.system).toBeGreaterThanOrEqual(0);
      expect(cpuStats.total).toBeGreaterThanOrEqual(0);
      expect(cpuStats.loadAverage).toHaveLength(3);
      expect(cpuStats.cpuUsagePercent).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance Benchmarking', () => {
    it('should run performance benchmarks', async () => {
      const testFunction = async () => {
        // Simulate some work
        const arr = new Array(1000).fill(0).map((_, i) => i * 2);
        return arr.reduce((sum, val) => sum + val, 0);
      };

      const result = await resourceOptimizer.benchmark('test-benchmark', testFunction);
      
      expect(result).toBeDefined();
      expect(result.name).toBe('test-benchmark');
      expect(result.duration).toBeGreaterThan(0);
      expect(result.memoryBefore).toBeDefined();
      expect(result.memoryAfter).toBeDefined();
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should track benchmark history', async () => {
      await resourceOptimizer.benchmark('test-1', () => {});
      await resourceOptimizer.benchmark('test-2', () => {});
      
      const benchmarks = resourceOptimizer.getBenchmarks();
      expect(benchmarks).toHaveLength(2);
      expect(benchmarks[0].name).toBe('test-1');
      expect(benchmarks[1].name).toBe('test-2');
    });
  });

  describe('Resource Monitoring', () => {
    it('should start and stop monitoring', () => {
      expect(() => {
        resourceOptimizer.startMonitoring(1000);
        resourceOptimizer.stopMonitoring();
      }).not.toThrow();
    });

    it('should get resource summary', () => {
      const summary = resourceOptimizer.getResourceSummary();
      
      expect(summary).toBeDefined();
      expect(summary.memory).toBeDefined();
      expect(summary.cpu).toBeDefined();
      expect(summary.gc).toBeDefined();
      expect(summary.uptime).toBeGreaterThan(0);
      expect(summary.nodeVersion).toBeDefined();
      expect(summary.v8Version).toBeDefined();
    });
  });

  describe('Threshold Management', () => {
    it('should set and use custom thresholds', () => {
      const customThresholds = {
        memoryWarning: 80,
        memoryCritical: 95,
        cpuWarning: 75,
        cpuCritical: 95
      };

      expect(() => {
        resourceOptimizer.setThresholds(customThresholds);
      }).not.toThrow();
    });
  });

  describe('Memory Optimization', () => {
    it('should optimize memory usage', () => {
      expect(() => {
        resourceOptimizer.optimizeMemory();
      }).not.toThrow();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getResourceOptimizer();
      const instance2 = getResourceOptimizer();
      
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getResourceOptimizer();
      resetResourceOptimizer();
      const instance2 = getResourceOptimizer();
      
      expect(instance1).not.toBe(instance2);
    });
  });
});