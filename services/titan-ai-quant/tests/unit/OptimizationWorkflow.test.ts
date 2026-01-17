/**
 * OptimizationWorkflow Integration Tests
 *
 * Tests the complete optimization workflow including:
 * - Data loading and preprocessing
 * - Insight generation and proposal creation
 * - Backtesting validation
 * - Configuration application and rollback
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { OptimizationWorkflow } from "../../src/ai/OptimizationWorkflow";
import { TitanAnalyst } from "../../src/ai/TitanAnalyst";
import { Backtester, InMemoryDataCache } from "../../src/simulation/Backtester";
import { DataLoader } from "../../src/simulation/DataLoader";
import {
  Config,
  Insight,
  OHLCV,
  OptimizationProposal,
  RegimeSnapshot,
  Trade,
  ValidationReport,
} from "../../src/types";

// Mock implementations for testing
class MockTitanAnalyst extends TitanAnalyst {
  async analyzeFailures(): Promise<Insight[]> {
    return [
      {
        id: 1,
        topic: "Stop Loss Optimization",
        text:
          "OI Wipeout trap shows high false positive rate during low volatility periods",
        confidence: 0.8,
        affectedTraps: ["oi_wipeout"],
      },
    ];
  }

  async proposeOptimization(): Promise<OptimizationProposal> {
    return {
      id: 1,
      createdAt: Date.now(),
      insightId: 1,
      targetKey: "traps.oi_wipeout.stop_loss",
      currentValue: 0.015,
      suggestedValue: 0.02,
      reasoning: "Increase stop loss to reduce false positives",
      expectedImpact: {
        pnlImprovement: 5.0,
        riskChange: 2.0,
        confidenceScore: 0.8,
      },
      status: "pending",
    };
  }

  async validateProposal(): Promise<ValidationReport> {
    return {
      passed: true,
      timestamp: Date.now(),
      backtestPeriod: {
        start: Date.now() - 7 * 24 * 60 * 60 * 1000,
        end: Date.now(),
      },
      baselineMetrics: {
        totalTrades: 50,
        winningTrades: 30,
        losingTrades: 20,
        winRate: 0.6,
        totalPnL: 100,
        avgPnL: 2,
        maxDrawdown: 20,
        maxDrawdownPercent: 0.05,
        sharpeRatio: 1.2,
        avgSlippage: 0.1,
        avgDuration: 30000,
        profitFactor: 1.5,
      },
      proposedMetrics: {
        totalTrades: 45,
        winningTrades: 30,
        losingTrades: 15,
        winRate: 0.67,
        totalPnL: 120,
        avgPnL: 2.67,
        maxDrawdown: 18,
        maxDrawdownPercent: 0.045,
        sharpeRatio: 1.4,
        avgSlippage: 0.1,
        avgDuration: 30000,
        profitFactor: 2.0,
      },
      deltas: {
        pnlDelta: 20,
        pnlDeltaPercent: 20,
        drawdownDelta: -2,
        drawdownDeltaPercent: -10,
        winRateDelta: 0.07,
      },
      confidenceScore: 0.85,
      recommendation: "approve",
    };
  }

  async applyProposal(): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }
}

class MockDataLoader extends DataLoader {
  async loadTradeHistory(): Promise<Trade[]> {
    return Array.from({ length: 50 }, (_, i) => ({
      id: `trade_${i + 1}`,
      timestamp: Date.now() - (50 - i) * 60 * 60 * 1000,
      symbol: "BTCUSDT",
      trapType: "oi_wipeout" as const,
      side: Math.random() > 0.5 ? "long" as const : "short" as const,
      entryPrice: 50000 + Math.random() * 10000,
      exitPrice: 50000 + Math.random() * 10000,
      quantity: 0.1,
      leverage: 10,
      pnl: (Math.random() - 0.4) * 100, // 60% win rate
      pnlPercent: (Math.random() - 0.4) * 2,
      duration: 30 * 60 * 1000,
      slippage: Math.random() * 5,
      fees: 3,
      exitReason: Math.random() > 0.4
        ? "take_profit" as const
        : "stop_loss" as const,
    }));
  }

  async loadOHLCVData(): Promise<OHLCV[]> {
    return Array.from({ length: 100 }, (_, i) => ({
      timestamp: Date.now() - (100 - i) * 5 * 60 * 1000,
      open: 50000 + Math.random() * 1000,
      high: 50500 + Math.random() * 1000,
      low: 49500 + Math.random() * 1000,
      close: 50000 + Math.random() * 1000,
      volume: Math.random() * 1000000,
    }));
  }

  async loadRegimeData(): Promise<RegimeSnapshot[]> {
    return Array.from({ length: 50 }, (_, i) => ({
      timestamp: Date.now() - (50 - i) * 15 * 60 * 1000,
      symbol: "BTCUSDT",
      trendState: Math.floor(Math.random() * 3) - 1 as -1 | 0 | 1,
      volState: Math.floor(Math.random() * 3) as 0 | 1 | 2,
      liquidityState: Math.floor(Math.random() * 3) as 0 | 1 | 2,
      regimeState: Math.floor(Math.random() * 3) - 1 as -1 | 0 | 1,
    }));
  }
}

describe("OptimizationWorkflow", () => {
  let workflow: OptimizationWorkflow;
  let mockAnalyst: MockTitanAnalyst;
  let mockDataLoader: MockDataLoader;
  let backtester: Backtester;

  beforeEach(() => {
    mockAnalyst = new MockTitanAnalyst();

    // Mock private loadCurrentConfig
    jest.spyOn(TitanAnalyst.prototype as any, "loadCurrentConfig")
      .mockResolvedValue({
        traps: {
          oi_wipeout: {
            stop_loss: 0.015,
            take_profit: 0.05,
            enabled: true,
            risk_per_trade: 0.01,
            max_leverage: 10,
            min_confidence: 0.8,
            cooldown_period: 60,
          },
        },
        risk: {
          max_daily_loss: 0.05,
          max_position_size: 0.1,
          max_open_positions: 3,
          emergency_flatten_threshold: 0.1,
        },
        execution: {
          limit_chaser_enabled: true,
          max_fill_time: 1000,
          latency_penalty: 50,
          slippage_model: "conservative",
        },
      });

    mockDataLoader = new MockDataLoader();

    const cache = new InMemoryDataCache();
    backtester = new Backtester(cache);

    workflow = new OptimizationWorkflow(
      mockAnalyst,
      backtester,
      mockDataLoader,
      {
        backtestPeriodDays: 7,
        minTradesForValidation: 20,
        autoApplyThreshold: 0.8,
        maxProposalsPerRun: 3,
      },
    );
  });

  describe("executeWorkflow", () => {
    it("should execute complete optimization workflow successfully", async () => {
      const result = await workflow.executeWorkflow();

      expect(result.success).toBe(true);
      expect(result.insights).toHaveLength(1);
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].applied).toBe(true);
      expect(result.performanceComparison).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("should handle insufficient trade data", async () => {
      // Mock data loader to return insufficient trades
      jest.spyOn(mockDataLoader, "loadTradeHistory").mockResolvedValue([]);

      const result = await workflow.executeWorkflow();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Insufficient trade data");
      expect(result.insights).toHaveLength(0);
      expect(result.proposals).toHaveLength(0);
    });

    it("should handle no insights generated", async () => {
      // Mock analyst to return no insights
      jest.spyOn(mockAnalyst, "analyzeFailures").mockResolvedValue([]);

      const result = await workflow.executeWorkflow();

      expect(result.success).toBe(true);
      expect(result.insights).toHaveLength(0);
      expect(result.proposals).toHaveLength(0);
    });

    it("should handle proposal validation failure", async () => {
      // Mock analyst to return rejection
      jest.spyOn(mockAnalyst, "validateProposal").mockResolvedValue({
        passed: false,
        timestamp: Date.now(),
        backtestPeriod: {
          start: Date.now() - 7 * 24 * 60 * 60 * 1000,
          end: Date.now(),
        },
        baselineMetrics: {} as any,
        proposedMetrics: {} as any,
        deltas: {
          pnlDelta: -10,
          pnlDeltaPercent: -10,
          drawdownDelta: 5,
          drawdownDeltaPercent: 25,
          winRateDelta: -0.1,
        },
        confidenceScore: 0.3,
        rejectionReason: "PnL decreased",
        recommendation: "reject",
      });

      const result = await workflow.executeWorkflow();

      expect(result.success).toBe(true);
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].validation.recommendation).toBe("reject");
      expect(result.proposals[0].applied).toBe(false);
    });

    it("should handle proposal application failure", async () => {
      // Mock analyst to fail application
      jest.spyOn(mockAnalyst, "applyProposal").mockResolvedValue({
        success: false,
        error: "Configuration validation failed",
      });

      const result = await workflow.executeWorkflow();

      expect(result.success).toBe(true);
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].applied).toBe(false);
      expect(result.proposals[0].error).toContain(
        "Configuration validation failed",
      );
    });

    it("should respect auto-apply threshold", async () => {
      // Create workflow with high auto-apply threshold
      const restrictiveWorkflow = new OptimizationWorkflow(
        mockAnalyst,
        backtester,
        mockDataLoader,
        {
          autoApplyThreshold: 0.9, // Higher than mock confidence of 0.85
        },
      );

      const result = await restrictiveWorkflow.executeWorkflow();

      expect(result.success).toBe(true);
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].applied).toBe(false); // Should not auto-apply
    });

    it("should limit proposals per run", async () => {
      // Mock analyst to return multiple insights
      jest.spyOn(mockAnalyst, "analyzeFailures").mockResolvedValue([
        { id: 1, topic: "Insight 1", text: "Text 1", confidence: 0.8 },
        { id: 2, topic: "Insight 2", text: "Text 2", confidence: 0.7 },
        { id: 3, topic: "Insight 3", text: "Text 3", confidence: 0.9 },
        { id: 4, topic: "Insight 4", text: "Text 4", confidence: 0.6 },
      ]);

      // Create workflow with limit of 2 proposals
      const limitedWorkflow = new OptimizationWorkflow(
        mockAnalyst,
        backtester,
        mockDataLoader,
        {
          maxProposalsPerRun: 2,
        },
      );

      const result = await limitedWorkflow.executeWorkflow();

      expect(result.success).toBe(true);
      expect(result.insights).toHaveLength(4);
      expect(result.proposals).toHaveLength(2); // Limited to 2
    });
  });

  describe("getWorkflowStats", () => {
    it("should return workflow statistics", () => {
      const stats = workflow.getWorkflowStats();

      expect(stats.config).toBeDefined();
      expect(stats.config.backtestPeriodDays).toBe(7);
      expect(stats.config.minTradesForValidation).toBe(20);
      expect(stats.config.autoApplyThreshold).toBe(0.8);
      expect(stats.config.maxProposalsPerRun).toBe(3);
      expect(stats.cacheStats).toBeDefined();
    });
  });

  describe("clearCache", () => {
    it("should clear data loader cache", () => {
      const clearCacheSpy = jest.spyOn(mockDataLoader, "clearCache");

      workflow.clearCache();

      expect(clearCacheSpy).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle data loading errors gracefully", async () => {
      // Mock data loader to throw error
      jest.spyOn(mockDataLoader, "loadTradeHistory").mockRejectedValue(
        new Error("Data loading failed"),
      );

      const result = await workflow.executeWorkflow();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to load historical data");
    });

    it("should handle analysis errors gracefully", async () => {
      // Mock analyst to throw error
      jest.spyOn(mockAnalyst, "analyzeFailures").mockRejectedValue(
        new Error("Analysis failed"),
      );

      const result = await workflow.executeWorkflow();

      expect(result.success).toBe(false);
      expect(result.error).toContain("Analysis failed");
    });

    it("should continue with partial failures in proposal processing", async () => {
      // Mock analyst to fail on proposal generation but succeed on analysis
      jest.spyOn(mockAnalyst, "proposeOptimization").mockRejectedValue(
        new Error("Proposal generation failed"),
      );

      const result = await workflow.executeWorkflow();

      expect(result.success).toBe(true);
      expect(result.insights).toHaveLength(1);
      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].error).toContain("Proposal generation failed");
    });
  });
});
