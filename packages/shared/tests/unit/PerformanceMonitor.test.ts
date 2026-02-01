/**
 * Unit tests for PerformanceMonitor
 *
 * Tests comprehensive performance monitoring, alerting, and scaling recommendations.
 */

import {
  getPerformanceMonitor,
  PerformanceMonitor,
  resetPerformanceMonitor,
} from "../../src/PerformanceMonitor";

describe("PerformanceMonitor", () => {
  let performanceMonitor: PerformanceMonitor;

  beforeEach(() => {
    resetPerformanceMonitor();
    performanceMonitor = getPerformanceMonitor();
  });

  afterEach(() => {
    performanceMonitor.shutdown();
    resetPerformanceMonitor();
  });

  describe("Initialization", () => {
    it("should initialize with default configuration", () => {
      expect(performanceMonitor).toBeDefined();
    });

    it("should initialize with custom configuration", () => {
      resetPerformanceMonitor();
      const customConfig = {
        monitoringInterval: 10000,
        alertingEnabled: false,
        autoScalingEnabled: true,
      };

      const customMonitor = getPerformanceMonitor(customConfig);
      expect(customMonitor).toBeDefined();
      customMonitor.shutdown();
    });
  });

  describe("Monitoring Control", () => {
    it("should start and stop monitoring", () => {
      expect(() => {
        performanceMonitor.startMonitoring();
        performanceMonitor.stopMonitoring();
      }).not.toThrow();
    });

    it("should handle multiple start/stop calls gracefully", () => {
      expect(() => {
        performanceMonitor.startMonitoring();
        performanceMonitor.startMonitoring(); // Should not throw
        performanceMonitor.stopMonitoring();
        performanceMonitor.stopMonitoring(); // Should not throw
      }).not.toThrow();
    });
  });

  describe("Performance Metrics", () => {
    it("should return null for current metrics when no data collected", () => {
      const metrics = performanceMonitor.getCurrentMetrics();
      expect(metrics).toBeNull();
    });

    it("should return empty array for metrics history when no data collected", () => {
      const history = performanceMonitor.getMetricsHistory();
      expect(history).toEqual([]);
    });
  });

  describe("Alert Management", () => {
    it("should return empty array for active alerts initially", () => {
      const alerts = performanceMonitor.getActiveAlerts();
      expect(alerts).toEqual([]);
    });

    it("should clear alerts", () => {
      const cleared = performanceMonitor.clearAlert("non-existent-alert");
      expect(cleared).toBe(false);
    });
  });

  describe("Scaling Recommendations", () => {
    it("should return empty array for recommendations initially", () => {
      const recommendations = performanceMonitor.getRecommendations();
      expect(recommendations).toEqual([]);
    });
  });

  describe("Performance Summary", () => {
    it("should provide performance summary", () => {
      const summary = performanceMonitor.getPerformanceSummary();

      expect(summary).toBeDefined();
      expect(summary.isHealthy).toBe(true); // No critical alerts initially
      expect(summary.activeAlerts).toBe(0);
      expect(summary.recommendations).toBe(0);
      expect(summary.uptime).toBeGreaterThan(0);
      expect(summary.lastMetricsUpdate).toBe(0); // No metrics collected yet
    });
  });

  describe("Configuration Updates", () => {
    it("should update configuration", () => {
      const newConfig = {
        alertingEnabled: false,
        monitoringInterval: 60000,
      };

      expect(() => {
        performanceMonitor.updateConfig(newConfig);
      }).not.toThrow();
    });
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = getPerformanceMonitor();
      const instance2 = getPerformanceMonitor();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = getPerformanceMonitor();
      resetPerformanceMonitor();
      const instance2 = getPerformanceMonitor();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe("Event Handling", () => {
    it("should handle events without throwing", () => {
      expect(() => {
        performanceMonitor.on("metrics", () => {});
        performanceMonitor.on("alert", () => {});
        performanceMonitor.on("recommendation", () => {});
      }).not.toThrow();
    });
  });
});
