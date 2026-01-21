/**
 * PrometheusMetrics Tests
 *
 * Tests for Prometheus metrics collection and export functionality
 */

import {
  getMetrics,
  PrometheusMetrics,
  resetMetrics,
} from "../../src/monitoring/PrometheusMetrics.js";

describe("PrometheusMetrics", () => {
  let metrics: PrometheusMetrics;

  beforeEach(() => {
    resetMetrics();
    metrics = getMetrics("test_titan_brain_");
  });

  afterEach(() => {
    resetMetrics();
  });

  describe("Signal Processing Metrics", () => {
    it("should record signal processing latency", async () => {
      // Record some signal processing metrics
      metrics.recordSignalLatency("phase1", 50, true);
      metrics.recordSignalLatency("phase1", 75, false);
      metrics.recordSignalLatency("phase2", 25, true);

      const exported = await metrics.export();

      // Check that metrics are exported
      expect(exported).toContain(
        "test_titan_brain_signal_processing_latency_ms",
      );
      expect(exported).toContain("test_titan_brain_decisions_total");
      expect(exported).toContain('phase_id="phase1"');
      expect(exported).toContain('phase_id="phase2"');
      expect(exported).toContain('approved="true"');
      expect(exported).toContain('approved="false"');
    });

    it("should calculate average signal latency correctly", () => {
      metrics.recordSignalLatency("phase1", 100, true);
      metrics.recordSignalLatency("phase1", 200, true);

      const avgLatency = metrics.getAverageSignalLatency("phase1");
      expect(avgLatency).toBe(150);
    });

    it("should calculate approval rate correctly", () => {
      // Record 3 approved and 2 rejected signals
      metrics.recordSignalLatency("phase1", 50, true);
      metrics.recordSignalLatency("phase1", 60, true);
      metrics.recordSignalLatency("phase1", 70, true);
      metrics.recordSignalLatency("phase1", 80, false);
      metrics.recordSignalLatency("phase1", 90, false);

      const approvalRate = metrics.getApprovalRate("phase1");
      expect(approvalRate).toBe(0.6); // 3/5 = 0.6
    });
  });

  describe("System Metrics", () => {
    it("should update equity and allocation metrics", async () => {
      metrics.updateEquity(10000);
      metrics.updateAllocation(0.5, 0.3, 0.2);

      const exported = await metrics.export();

      expect(exported).toContain("test_titan_brain_current_equity 10000");
      expect(exported).toContain('phase_id="phase1"} 0.5');
      expect(exported).toContain('phase_id="phase2"} 0.3');
      expect(exported).toContain('phase_id="phase3"} 0.2');
    });

    it("should update circuit breaker status", async () => {
      metrics.updateCircuitBreakerStatus(true);

      const exported = await metrics.export();
      expect(exported).toContain("test_titan_brain_circuit_breaker_active 1");

      metrics.updateCircuitBreakerStatus(false);

      const exported2 = await metrics.export();
      expect(exported2).toContain("test_titan_brain_circuit_breaker_active 0");
    });

    it("should update performance metrics", async () => {
      metrics.updatePhasePerformance("phase1", 1.5, 1.2);
      metrics.updatePhasePerformance("phase2", 0.8, 0.9);

      const exported = await metrics.export();

      expect(exported).toContain(
        'test_titan_brain_sharpe_ratio{phase_id="phase1"} 1.5',
      );
      expect(exported).toContain(
        'test_titan_brain_performance_modifier{phase_id="phase1"} 1.2',
      );
      expect(exported).toContain(
        'test_titan_brain_sharpe_ratio{phase_id="phase2"} 0.8',
      );
      expect(exported).toContain(
        'test_titan_brain_performance_modifier{phase_id="phase2"} 0.9',
      );
    });
  });

  describe("Database Metrics", () => {
    it("should record database query metrics", async () => {
      metrics.recordDatabaseQuery("SELECT", "brain_decisions", 25);
      metrics.recordDatabaseQuery("INSERT", "brain_decisions", 15);
      metrics.recordDatabaseQuery("UPDATE", "allocation_history", 30);

      const exported = await metrics.export();

      expect(exported).toContain("test_titan_brain_database_query_duration_ms");
      expect(exported).toContain('operation="SELECT"');
      expect(exported).toContain('operation="INSERT"');
      expect(exported).toContain('operation="UPDATE"');
      expect(exported).toContain('table="brain_decisions"');
      expect(exported).toContain('table="allocation_history"');
    });
  });

  describe("Cache Metrics", () => {
    it("should record cache access metrics", async () => {
      // Record cache hits and misses
      metrics.recordCacheAccess("dashboard", true);
      metrics.recordCacheAccess("dashboard", true);
      metrics.recordCacheAccess("dashboard", false);
      metrics.recordCacheAccess("allocation", true);

      const exported = await metrics.export();

      expect(exported).toContain("test_titan_brain_cache_requests_total");
      expect(exported).toContain('cache_name="dashboard"');
      expect(exported).toContain('cache_name="allocation"');
      expect(exported).toContain('result="hit"');
      expect(exported).toContain('result="miss"');
    });

    it("should calculate cache hit rate correctly", () => {
      // Record 3 hits and 1 miss for dashboard cache
      metrics.recordCacheAccess("dashboard", true);
      metrics.recordCacheAccess("dashboard", true);
      metrics.recordCacheAccess("dashboard", true);
      metrics.recordCacheAccess("dashboard", false);

      const hitRate = metrics.getCacheHitRate("dashboard");
      expect(hitRate).toBe(0.75); // 3/4 = 0.75
    });
  });

  describe("Export Functionality", () => {
    it("should export metrics in Prometheus format", async () => {
      metrics.updateEquity(5000);
      metrics.recordSignalLatency("phase1", 100, true);

      const exported = await metrics.export();

      // Check Prometheus format
      expect(exported).toContain("# HELP");
      expect(exported).toContain("# TYPE");
      expect(exported).toContain("test_titan_brain_");

      // Check that it's valid text format
      expect(typeof exported).toBe("string");
      expect(exported.length).toBeGreaterThan(0);
    });

    it("should export metrics as JSON", async () => {
      metrics.updateEquity(5000);
      metrics.recordSignalLatency("phase1", 100, true);

      const jsonList = await metrics.toJSON() as any[];

      expect(Array.isArray(jsonList)).toBe(true);
      const equity = jsonList.find((m: any) =>
        m.name.includes("current_equity")
      );
      expect(equity).toBeDefined();
      expect(equity.values[0].value).toBe(5000);
    });
  });

  describe("Reset Functionality", () => {
    it("should reset all metrics", async () => {
      metrics.updateEquity(5000);
      metrics.recordSignalLatency("phase1", 100, true);

      let exported = await metrics.export();
      expect(exported).toContain("test_titan_brain_current_equity 5000");

      metrics.reset();

      exported = await metrics.export();
      expect(exported).not.toContain("test_titan_brain_current_equity 5000");
    });
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const metrics1 = getMetrics();
      const metrics2 = getMetrics();

      expect(metrics1).toBe(metrics2);
    });

    it("should create new instance after reset", () => {
      const metrics1 = getMetrics();
      resetMetrics();
      const metrics2 = getMetrics();

      expect(metrics1).not.toBe(metrics2);
    });
  });
});
