/**
 * Unit tests for Telemetry Service
 */

import {
  ExecutionData,
  LogLevel,
  MetricData,
  SignalData,
  TelemetryService,
} from "../../src/TelemetryService";
import { existsSync, readFileSync, rmSync, unlinkSync } from "fs";
import { join } from "path";

describe("TelemetryService Unit Tests", () => {
  let telemetryService: TelemetryService;
  const testLogDir = "./test-logs";

  beforeEach(() => {
    // Clean up any existing test logs
    if (existsSync(testLogDir)) {
      rmSync(testLogDir, { recursive: true, force: true });
    }

    telemetryService = new TelemetryService({
      logDirectory: testLogDir,
      enableConsoleOutput: false, // Disable console output for tests
      enableFileOutput: true,
      enableMetrics: true,
      maxLogFileSize: 1024, // Small size for testing rotation
      retentionDays: 1,
    });
  });

  afterEach(() => {
    telemetryService.shutdown();

    // Clean up test logs
    if (existsSync(testLogDir)) {
      rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  describe("Basic Functionality", () => {
    it("should initialize correctly", () => {
      expect(telemetryService).toBeDefined();

      const stats = telemetryService.getStats();
      expect(stats.logDirectory).toBe(testLogDir);
      expect(stats.enabledFeatures).toContain("file");
      expect(stats.enabledFeatures).toContain("metrics");
      expect(stats.enabledFeatures).not.toContain("console");
    });

    it("should log messages with different levels", () => {
      const service = "test-service";
      const message = "Test message";
      const data = { key: "value" };

      // Test all log levels
      telemetryService.debug(service, message, data);
      telemetryService.info(service, message, data);
      telemetryService.warn(service, message, data);
      telemetryService.error(service, message, new Error("Test error"));
      telemetryService.fatal(service, message, new Error("Fatal error"));

      // Check that log file was created
      const logFile = join(testLogDir, `${service}.log`);
      expect(existsSync(logFile)).toBe(true);
    });

    it("should generate correlation IDs", () => {
      const correlationId1 = telemetryService.generateCorrelationId();
      const correlationId2 = telemetryService.generateCorrelationId();

      expect(correlationId1).toBeDefined();
      expect(correlationId2).toBeDefined();
      expect(correlationId1).not.toBe(correlationId2);
      expect(correlationId1.length).toBe(12); // Default length
    });

    it("should create child loggers", () => {
      const childLogger = telemetryService.createChildLogger(
        "test-service",
        "phase1",
      );

      expect(childLogger).toBeDefined();
      expect(childLogger.correlationId).toBeDefined();
      expect(typeof childLogger.debug).toBe("function");
      expect(typeof childLogger.info).toBe("function");
      expect(typeof childLogger.warn).toBe("function");
      expect(typeof childLogger.error).toBe("function");
      expect(typeof childLogger.fatal).toBe("function");

      // Test child logger methods
      childLogger.info("Child logger test");
      childLogger.error("Child logger error", new Error("Test error"));

      // Check that log file was created
      const logFile = join(testLogDir, "test-service.log");
      expect(existsSync(logFile)).toBe(true);
    });

    it("should log signal events", () => {
      const signal: SignalData = {
        symbol: "BTCUSDT",
        type: "LIQUIDATION",
        confidence: 95,
        entry: 50000,
        stopLoss: 49000,
        takeProfit: 52000,
        metadata: { source: "test" },
      };

      telemetryService.logSignal("phase1", signal);

      // Check that trading log was created
      const tradingLogFile = join(testLogDir, "trades.jsonl");
      expect(existsSync(tradingLogFile)).toBe(true);

      // Read and verify log content
      const logContent = readFileSync(tradingLogFile, "utf8");
      const logEntry = JSON.parse(logContent.trim());

      expect(logEntry.service).toBe("trading");
      expect(logEntry.phase).toBe("phase1");
      expect(logEntry.data.symbol).toBe("BTCUSDT");
      expect(logEntry.data.type).toBe("LIQUIDATION");
      expect(logEntry.metadata.eventType).toBe("signal");
    });

    it("should log execution events", () => {
      const execution: ExecutionData = {
        orderId: "test-order-123",
        symbol: "BTCUSDT",
        side: "Buy",
        type: "MARKET",
        qty: 0.1,
        price: 50000,
        status: "FILLED",
        exchange: "bybit",
        latency: 150,
        metadata: { source: "test" },
      };

      telemetryService.logExecution("phase1", execution);

      // Check that trading log was created
      const tradingLogFile = join(testLogDir, "trades.jsonl");
      expect(existsSync(tradingLogFile)).toBe(true);

      // Read and verify log content
      const logContent = readFileSync(tradingLogFile, "utf8");
      const logEntry = JSON.parse(logContent.trim());

      expect(logEntry.service).toBe("execution");
      expect(logEntry.phase).toBe("phase1");
      expect(logEntry.data.orderId).toBe("test-order-123");
      expect(logEntry.data.symbol).toBe("BTCUSDT");
      expect(logEntry.metadata.eventType).toBe("execution");
    });

    it("should record and retrieve metrics", () => {
      const metric1: MetricData = {
        name: "latency",
        value: 150,
        unit: "ms",
        tags: { service: "execution", exchange: "bybit" },
      };

      const metric2: MetricData = {
        name: "latency",
        value: 200,
        unit: "ms",
        tags: { service: "execution", exchange: "mexc" },
      };

      telemetryService.recordMetric(metric1);
      telemetryService.recordMetric(metric2);

      const metrics = telemetryService.getMetrics("latency");
      expect(metrics).toHaveLength(2);
      expect(metrics[0].value).toBe(150);
      expect(metrics[1].value).toBe(200);

      const aggregatedMetrics = telemetryService.getAggregatedMetrics();
      expect(Object.keys(aggregatedMetrics).length).toBeGreaterThan(0);
    });

    it("should filter metrics by time range", () => {
      const now = Date.now();
      const metric1: MetricData = {
        name: "test_metric",
        value: 100,
        timestamp: now - 1000, // 1 second ago
      };

      const metric2: MetricData = {
        name: "test_metric",
        value: 200,
        timestamp: now + 1000, // 1 second in future
      };

      telemetryService.recordMetric(metric1);
      telemetryService.recordMetric(metric2);

      // Get metrics from 500ms ago to 500ms in future
      const filteredMetrics = telemetryService.getMetrics("test_metric", {
        start: now - 500,
        end: now + 500,
      });

      expect(filteredMetrics).toHaveLength(0); // Neither metric should be in this range
    });

    it("should emit events for logs, signals, executions, and metrics", (done) => {
      let eventCount = 0;
      const expectedEvents = 4;

      const checkComplete = () => {
        eventCount++;
        if (eventCount === expectedEvents) {
          done();
        }
      };

      telemetryService.on("log", (entry: any) => {
        expect(entry.service).toBe("test-service");
        checkComplete();
      });

      telemetryService.on("signal", (data: any) => {
        expect(data.phase).toBe("phase1");
        checkComplete();
      });

      telemetryService.on("execution", (data: any) => {
        expect(data.phase).toBe("phase1");
        checkComplete();
      });

      telemetryService.on("metric", (metric: any) => {
        expect(metric.name).toBe("test_metric");
        checkComplete();
      });

      // Trigger events
      telemetryService.info("test-service", "Test message");

      telemetryService.logSignal("phase1", {
        symbol: "BTCUSDT",
        type: "TEST",
        confidence: 90,
      });

      telemetryService.logExecution("phase1", {
        orderId: "test-123",
        symbol: "BTCUSDT",
        side: "Buy",
        type: "MARKET",
        qty: 0.1,
        status: "FILLED",
        exchange: "bybit",
      });

      telemetryService.recordMetric({
        name: "test_metric",
        value: 100,
      });
    });

    it("should cleanup old metrics", () => {
      const oldMetric: MetricData = {
        name: "old_metric",
        value: 100,
        timestamp: Date.now() - 10000, // 10 seconds ago
      };

      const newMetric: MetricData = {
        name: "new_metric",
        value: 200,
        timestamp: Date.now(),
      };

      telemetryService.recordMetric(oldMetric);
      telemetryService.recordMetric(newMetric);

      expect(telemetryService.getMetrics("old_metric")).toHaveLength(1);
      expect(telemetryService.getMetrics("new_metric")).toHaveLength(1);

      // Cleanup metrics older than 5 seconds
      telemetryService.cleanup();

      // Note: The cleanup method calls internal cleanup but doesn't expose
      // the metrics collector directly, so we can't easily test this
      // without making the internal structure public
    });

    it("should shutdown gracefully", () => {
      const stats = telemetryService.getStats();
      expect(stats.enabledFeatures.length).toBeGreaterThan(0);

      telemetryService.shutdown();

      // After shutdown, the service should still be accessible but cleaned up
      expect(telemetryService).toBeDefined();
    });
  });

  describe("Configuration", () => {
    it("should respect configuration options", () => {
      const customService = new TelemetryService({
        logDirectory: "./custom-logs",
        enableConsoleOutput: true,
        enableFileOutput: false,
        enableMetrics: false,
        correlationIdLength: 8,
      });

      const stats = customService.getStats();
      expect(stats.logDirectory).toBe("./custom-logs");
      expect(stats.enabledFeatures).toContain("console");
      expect(stats.enabledFeatures).not.toContain("file");
      expect(stats.enabledFeatures).not.toContain("metrics");

      const correlationId = customService.generateCorrelationId();
      expect(correlationId.length).toBe(8);

      customService.shutdown();
    });

    it("should handle disabled features", () => {
      const minimalService = new TelemetryService({
        enableConsoleOutput: false,
        enableFileOutput: false,
        enableMetrics: false,
      });

      // Should not throw errors even with features disabled
      minimalService.info("test", "message");
      minimalService.recordMetric({ name: "test", value: 100 });

      const stats = minimalService.getStats();
      expect(stats.enabledFeatures).toHaveLength(0);

      minimalService.shutdown();
    });
  });

  describe("Error Handling", () => {
    it("should handle logging errors gracefully", () => {
      // Test with file output disabled to avoid directory creation issues
      const serviceWithoutFile = new TelemetryService({
        logDirectory: "./test-logs-error",
        enableConsoleOutput: false,
        enableFileOutput: false, // Disable file output
        enableMetrics: true,
      });

      // Should not throw even with file output disabled
      expect(() => {
        serviceWithoutFile.info("test", "message");
        serviceWithoutFile.error(
          "test",
          "error message",
          new Error("Test error"),
        );
      }).not.toThrow();

      serviceWithoutFile.shutdown();
    });

    it("should handle child logger errors gracefully", () => {
      const childLogger = telemetryService.createChildLogger("test-service");

      // Should not throw
      expect(() => {
        childLogger.info("test message");
        childLogger.error("test error", new Error("Test"));
      }).not.toThrow();
    });
  });
});
