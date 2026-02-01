/**
 * Real-Time Optimizer Unit Tests
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { RealTimeOptimizer } from "../../src/ai/RealTimeOptimizer";
import { TitanAnalyst } from "../../src/ai/TitanAnalyst";
import { RegimeSnapshot, Trade } from "../../src/types";

// Mock dependencies
jest.mock("@titan/shared", () => ({
  __esModule: true,
  getWebSocketManager: jest.fn(() => ({
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  getTelemetryService: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  loadSecretsFromFiles: jest.fn(),
  getConfigManager: jest.fn(() => ({
    get: jest.fn(),
  })),
}));

describe("RealTimeOptimizer", () => {
  let optimizer: RealTimeOptimizer;
  let mockAnalyst: jest.Mocked<TitanAnalyst>;

  beforeEach(() => {
    mockAnalyst = {
      analyzeFailures: jest.fn(),
      proposeOptimization: jest.fn(),
      validateProposal: jest.fn(),
      applyProposal: jest.fn(),
      canMakeRequest: jest.fn(() => true),
    } as any;

    optimizer = new RealTimeOptimizer(mockAnalyst, {
      optimizationInterval: 1000, // 1 second for testing
      minTradesForOptimization: 5,
      autoApplyThreshold: 0.8,
    });
  });

  afterEach(() => {
    optimizer.shutdown();
  });

  describe("initialization", () => {
    it("should initialize with default configuration", () => {
      const defaultOptimizer = new RealTimeOptimizer();
      expect(defaultOptimizer).toBeDefined();
      defaultOptimizer.shutdown();
    });

    it("should initialize with custom configuration", () => {
      const customOptimizer = new RealTimeOptimizer(mockAnalyst, {
        optimizationInterval: 5000,
        minTradesForOptimization: 20,
        autoApplyThreshold: 0.9,
      });

      expect(customOptimizer).toBeDefined();
      customOptimizer.shutdown();
    });
  });

  describe("lifecycle management", () => {
    it("should start and stop optimization", () => {
      expect(optimizer.getStats().isRunning).toBe(false);

      optimizer.start();
      expect(optimizer.getStats().isRunning).toBe(true);

      optimizer.stop();
      expect(optimizer.getStats().isRunning).toBe(false);
    });

    it("should not start if already running", () => {
      optimizer.start();
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation(
        () => {},
      );

      optimizer.start(); // Should warn about already running

      consoleSpy.mockRestore();
      optimizer.stop();
    });
  });

  describe("data handling", () => {
    it("should handle signal events", () => {
      const signalEvent = {
        phase: "phase1",
        signal: {
          symbol: "BTCUSDT",
          type: "oi_wipeout",
          confidence: 0.8,
        },
      };

      // Simulate signal event
      optimizer["handleSignalEvent"](signalEvent);

      expect(optimizer.getStats().dataStreamStats.lastUpdate).toBeGreaterThan(
        0,
      );
    });

    it("should handle execution events", () => {
      const executionEvent = {
        phase: "phase1",
        execution: {
          orderId: "test-order-1",
          symbol: "BTCUSDT",
          side: "Buy",
          qty: 0.1,
          price: 50000,
          status: "filled",
        },
      };

      optimizer["handleExecutionEvent"](executionEvent);

      expect(optimizer.getStats().dataStreamStats.trades).toBe(1);
    });

    it("should handle metric events", () => {
      const metricEvent = {
        name: "pnl",
        value: 100,
        timestamp: Date.now(),
      };

      optimizer["handleMetricEvent"](metricEvent);

      expect(optimizer.getStats().dataStreamStats.performanceMetrics).toBe(1);
    });
  });

  describe("optimization cycle", () => {
    it("should skip optimization with insufficient trades", async () => {
      // Don't add enough trades
      await optimizer["runOptimizationCycle"]();

      expect(mockAnalyst.analyzeFailures).not.toHaveBeenCalled();
    });

    it("should run optimization with sufficient trades", async () => {
      // Add sufficient trades
      for (let i = 0; i < 10; i++) {
        const trade: Trade = {
          id: `trade-${i}`,
          timestamp: Date.now() - i * 1000,
          symbol: "BTCUSDT",
          trapType: "oi_wipeout",
          side: "long",
          entryPrice: 50000,
          exitPrice: 50100,
          quantity: 0.1,
          leverage: 10,
          pnl: 10,
          pnlPercent: 0.002,
          duration: 300,
          slippage: 0.001,
          fees: 5,
          exitReason: "take_profit",
        };

        optimizer["liveDataStream"].trades.push(trade);
      }

      mockAnalyst.analyzeFailures.mockResolvedValue([{
        topic: "test insight",
        text: "Test insight text",
        confidence: 0.8,
      }]);

      mockAnalyst.proposeOptimization.mockResolvedValue({
        targetKey: "traps.oi_wipeout.stop_loss",
        currentValue: 0.01,
        suggestedValue: 0.015,
        reasoning: "Test reasoning",
        expectedImpact: {
          pnlImprovement: 5,
          riskChange: 2,
          confidenceScore: 0.8,
        },
      });

      mockAnalyst.validateProposal.mockResolvedValue({
        passed: true,
        timestamp: Date.now(),
        backtestPeriod: { start: Date.now() - 86400000, end: Date.now() },
        baselineMetrics: {} as any,
        proposedMetrics: {} as any,
        deltas: {
          pnlDelta: 5,
          pnlDeltaPercent: 2,
          drawdownDelta: -1,
          drawdownDeltaPercent: -5,
          winRateDelta: 0.02,
        },
        confidenceScore: 0.8,
        recommendation: "approve",
      });

      await optimizer["runOptimizationCycle"]();

      expect(mockAnalyst.analyzeFailures).toHaveBeenCalled();
      expect(mockAnalyst.proposeOptimization).toHaveBeenCalled();
      expect(mockAnalyst.validateProposal).toHaveBeenCalled();
    });
  });

  describe("performance analysis", () => {
    it("should analyze recent performance", () => {
      // Add trades with poor performance (below baseline)
      const trades: Trade[] = [];
      for (let i = 0; i < 20; i++) {
        trades.push({
          id: `trade-${i}`,
          timestamp: Date.now() - i * 1000,
          symbol: "BTCUSDT",
          trapType: "oi_wipeout",
          side: "long",
          entryPrice: 50000,
          exitPrice: i % 3 === 0 ? 50100 : 49900, // 33% win rate (below baseline)
          quantity: 0.1,
          leverage: 10,
          pnl: i % 3 === 0 ? 10 : -10,
          pnlPercent: i % 3 === 0 ? 0.002 : -0.002,
          duration: 300,
          slippage: 0.001,
          fees: 5,
          exitReason: i % 3 === 0 ? "take_profit" : "stop_loss",
        });
      }

      optimizer["liveDataStream"].trades = trades;

      const feedback = optimizer["analyzeRecentPerformance"]();

      // Should generate feedback for poor performance (win rate < 60% baseline)
      expect(feedback.length).toBeGreaterThan(0);
    });
  });

  describe("A/B testing", () => {
    it("should start A/B test for approved proposals", async () => {
      const proposal = {
        targetKey: "traps.oi_wipeout.stop_loss",
        currentValue: 0.01,
        suggestedValue: 0.015,
        reasoning: "Test reasoning",
        expectedImpact: {
          pnlImprovement: 5,
          riskChange: 2,
          confidenceScore: 0.8,
        },
      };

      const validation = {
        passed: true,
        timestamp: Date.now(),
        backtestPeriod: { start: Date.now() - 86400000, end: Date.now() },
        baselineMetrics: {} as any,
        proposedMetrics: {} as any,
        deltas: {
          pnlDelta: 5,
          pnlDeltaPercent: 2,
          drawdownDelta: -1,
          drawdownDeltaPercent: -5,
          winRateDelta: 0.02,
        },
        confidenceScore: 0.8,
        recommendation: "approve" as const,
      };

      await optimizer["startABTest"](proposal, validation);

      expect(optimizer.getStats().activeABTests).toBe(1);
      expect(optimizer.getActiveABTests().length).toBe(1);
    });
  });

  describe("rate limiting", () => {
    it("should respect optimization rate limits", () => {
      // Set up rate limiting scenario
      optimizer["optimizationCount"] = 10; // Exceed limit

      const canRun = optimizer["canRunOptimization"]();
      expect(canRun).toBe(false);
    });

    it("should allow optimization within rate limits", () => {
      optimizer["optimizationCount"] = 1;
      optimizer["lastOptimizationTime"] = Date.now() - 10000; // 10 seconds ago

      const canRun = optimizer["canRunOptimization"]();
      expect(canRun).toBe(true);
    });
  });

  describe("statistics", () => {
    it("should provide accurate statistics", () => {
      const stats = optimizer.getStats();

      expect(stats).toHaveProperty("isRunning");
      expect(stats).toHaveProperty("optimizationCount");
      expect(stats).toHaveProperty("activeABTests");
      expect(stats).toHaveProperty("dataStreamStats");
      expect(stats).toHaveProperty("performanceHistory");

      expect(typeof stats.isRunning).toBe("boolean");
      expect(typeof stats.optimizationCount).toBe("number");
      expect(typeof stats.activeABTests).toBe("number");
    });
  });

  describe("error handling", () => {
    it("should handle optimization cycle errors gracefully", async () => {
      mockAnalyst.analyzeFailures.mockRejectedValue(new Error("Test error"));

      // Add sufficient trades to trigger optimization
      for (let i = 0; i < 10; i++) {
        optimizer["liveDataStream"].trades.push({
          id: `trade-${i}`,
          timestamp: Date.now(),
          symbol: "BTCUSDT",
          trapType: "oi_wipeout",
          side: "long",
          entryPrice: 50000,
          exitPrice: 50100,
          quantity: 0.1,
          leverage: 10,
          pnl: 10,
          pnlPercent: 0.002,
          duration: 300,
          slippage: 0.001,
          fees: 5,
          exitReason: "take_profit",
        });
      }

      // Should not throw error
      await expect(optimizer["runOptimizationCycle"]()).resolves.not.toThrow();
    });

    it("should handle proposal processing errors", async () => {
      const proposal = {
        targetKey: "traps.oi_wipeout.stop_loss",
        currentValue: 0.01,
        suggestedValue: 0.015,
        reasoning: "Test reasoning",
        expectedImpact: {
          pnlImprovement: 5,
          riskChange: 2,
          confidenceScore: 0.8,
        },
      };

      mockAnalyst.validateProposal.mockRejectedValue(
        new Error("Validation error"),
      );

      // Should not throw error
      await expect(optimizer["processOptimizationProposal"](proposal, []))
        .resolves.not.toThrow();
    });
  });
});
