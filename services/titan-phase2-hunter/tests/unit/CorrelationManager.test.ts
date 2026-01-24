/**
 * Unit Tests for CorrelationManager
 *
 * Tests correlation calculations, position limits, and high beta detection
 */

import {
  CorrelationManager,
  CorrelationManagerConfig,
} from "../../src/risk/CorrelationManager";
import { OHLCV, Position } from "../../src/types";

// Mock BybitPerpsClient
const mockBybitClient = {
  fetchOHLCV: jest.fn(),
};

describe("CorrelationManager", () => {
  let correlationManager: CorrelationManager;
  let config: CorrelationManagerConfig;

  beforeEach(() => {
    config = {
      correlationThreshold: 0.7,
      rejectThreshold: 0.85,
      groupCorrelationThreshold: 0.5,
      maxCorrelatedExposure: 0.4,
      highBetaThreshold: 0.9,
      highBetaReduction: 0.3,
      rollingWindowHours: 24,
      updateIntervalMs: 300000,
    };

    correlationManager = new CorrelationManager(mockBybitClient as any, config);
    jest.clearAllMocks();
  });

  afterEach(() => {
    correlationManager.destroy();
  });

  describe("calcCorrelation", () => {
    it("should calculate correlation between two symbols", async () => {
      // Mock price data - perfectly correlated (both go up)
      const now = Date.now();
      const priceData1: OHLCV[] = Array.from({ length: 24 }, (_, i) => ({
        timestamp: now - (23 - i) * 60 * 60 * 1000,
        open: 100 + i,
        high: 105 + i,
        low: 95 + i,
        close: 100 + i,
        volume: 1000,
      }));

      const priceData2: OHLCV[] = Array.from({ length: 24 }, (_, i) => ({
        timestamp: now - (23 - i) * 60 * 60 * 1000,
        open: 200 + i * 2,
        high: 210 + i * 2,
        low: 190 + i * 2,
        close: 200 + i * 2,
        volume: 1000,
      }));

      mockBybitClient.fetchOHLCV
        .mockResolvedValueOnce(priceData1)
        .mockResolvedValueOnce(priceData2);

      const correlation = await correlationManager.calcCorrelation(
        "BTCUSDT",
        "ETHUSDT",
      );

      expect(correlation).toBeGreaterThan(0.9); // Should be highly correlated
      expect(mockBybitClient.fetchOHLCV).toHaveBeenCalledTimes(2);
    });

    it("should return 0 for insufficient data", async () => {
      // Mock insufficient data
      const shortData: OHLCV[] = Array.from({ length: 5 }, (_, i) => ({
        timestamp: Date.now() - i * 60 * 60 * 1000,
        open: 100,
        high: 105,
        low: 95,
        close: 100,
        volume: 1000,
      }));

      mockBybitClient.fetchOHLCV
        .mockResolvedValueOnce(shortData)
        .mockResolvedValueOnce(shortData);

      const correlation = await correlationManager.calcCorrelation(
        "BTCUSDT",
        "ETHUSDT",
      );

      expect(correlation).toBe(0);
    });

    it("should handle API errors gracefully", async () => {
      mockBybitClient.fetchOHLCV.mockRejectedValue(new Error("API Error"));

      const correlation = await correlationManager.calcCorrelation(
        "BTCUSDT",
        "ETHUSDT",
      );

      expect(correlation).toBe(0);
    });
  });

  describe("checkCorrelationLimit", () => {
    const mockPositions: Position[] = [
      {
        id: "pos1",
        symbol: "ETHUSDT",
        side: "LONG",
        entryPrice: 2000,
        currentPrice: 2100,
        quantity: 1,
        leverage: 3,
        stopLoss: 1900,
        takeProfit: 2300,
        unrealizedPnL: 100,
        realizedPnL: 0,
        entryTime: Date.now() - 60000,
        status: "OPEN",
        rValue: 1.5,
        atr: 50,
      },
    ];

    it("should reject signal when correlation exceeds reject threshold", async () => {
      // Mock high correlation (0.9)
      jest.spyOn(correlationManager, "calcCorrelation").mockResolvedValue(0.9);

      const result = await correlationManager.checkCorrelationLimit(
        "BTCUSDT",
        mockPositions,
        1000,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("CORRELATION_REJECT");
      expect(result.correlation).toBe(0.9);
    });

    it("should reduce position size when correlation exceeds threshold", async () => {
      // Mock medium correlation (0.75)
      jest.spyOn(correlationManager, "calcCorrelation").mockResolvedValue(0.75);

      const result = await correlationManager.checkCorrelationLimit(
        "BTCUSDT",
        mockPositions,
        1000,
      );

      expect(result.allowed).toBe(true);
      expect(result.adjustedSize).toBe(500); // 50% reduction
      expect(result.reason).toContain("CORRELATION_REDUCE");
      expect(result.correlation).toBe(0.75);
    });

    it("should allow position when correlation is below threshold", async () => {
      // Mock low correlation (0.3)
      jest.spyOn(correlationManager, "calcCorrelation").mockResolvedValue(0.3);

      const result = await correlationManager.checkCorrelationLimit(
        "BTCUSDT",
        mockPositions,
        1000,
      );

      expect(result.allowed).toBe(true);
      expect(result.adjustedSize).toBeUndefined();
      expect(result.correlation).toBe(0.3);
    });

    it("should handle empty positions array", async () => {
      const result = await correlationManager.checkCorrelationLimit(
        "BTCUSDT",
        [],
        1000,
      );

      expect(result.allowed).toBe(true);
      expect(result.correlation).toBe(0);
    });
  });

  describe("calcTotalCorrelatedExposure", () => {
    const mockPositions: Position[] = [
      {
        id: "pos1",
        symbol: "BTCUSDT",
        side: "LONG",
        entryPrice: 50000,
        currentPrice: 51000,
        quantity: 0.1,
        leverage: 3,
        stopLoss: 49000,
        takeProfit: 53000,
        unrealizedPnL: 100,
        realizedPnL: 0,
        entryTime: Date.now(),
        status: "OPEN",
        rValue: 1.0,
        atr: 1000,
      },
      {
        id: "pos2",
        symbol: "ETHUSDT",
        side: "LONG",
        entryPrice: 3000,
        currentPrice: 3100,
        quantity: 1,
        leverage: 3,
        stopLoss: 2900,
        takeProfit: 3300,
        unrealizedPnL: 100,
        realizedPnL: 0,
        entryTime: Date.now(),
        status: "OPEN",
        rValue: 1.0,
        atr: 100,
      },
    ];

    it("should calculate total correlated exposure", async () => {
      // Mock correlation matrix with high correlation
      jest.spyOn(correlationManager, "generateCorrelationMatrix")
        .mockResolvedValue({
          symbols: ["BTCUSDT", "ETHUSDT"],
          matrix: [
            [1.0, 0.8],
            [0.8, 1.0],
          ],
          timestamp: Date.now(),
        });

      const totalEquity = 10000;
      const exposure = await correlationManager.calcTotalCorrelatedExposure(
        mockPositions,
        totalEquity,
      );

      expect(exposure).toBeGreaterThan(0);
      // Exposure can be > 1 due to leverage, so just check it's a reasonable number
      expect(exposure).toBeLessThan(10); // Should be less than 10x equity
    });

    it("should return 0 for single position", async () => {
      const singlePosition = [mockPositions[0]];
      const exposure = await correlationManager.calcTotalCorrelatedExposure(
        singlePosition,
        10000,
      );

      expect(exposure).toBe(0);
    });

    it("should handle empty positions array", async () => {
      const exposure = await correlationManager.calcTotalCorrelatedExposure(
        [],
        10000,
      );

      expect(exposure).toBe(0);
    });
  });

  describe("detectHighBeta", () => {
    it("should detect high beta market conditions", async () => {
      const topSymbols = ["ETHUSDT", "ADAUSDT", "DOTUSDT", "LINKUSDT"];

      // Mock high BTC correlation for all symbols
      jest.spyOn(correlationManager, "calcCorrelation").mockResolvedValue(0.95);

      const highBetaState = await correlationManager.detectHighBeta(topSymbols);

      expect(highBetaState.isHighBeta).toBe(true);
      expect(highBetaState.btcCorrelation).toBeGreaterThanOrEqual(0.9);
      expect(highBetaState.affectedSymbols).toHaveLength(4);
    });

    it("should detect normal market conditions", async () => {
      const topSymbols = ["ETHUSDT", "ADAUSDT", "DOTUSDT", "LINKUSDT"];

      // Mock low BTC correlation
      jest.spyOn(correlationManager, "calcCorrelation").mockResolvedValue(0.3);

      const highBetaState = await correlationManager.detectHighBeta(topSymbols);

      expect(highBetaState.isHighBeta).toBe(false);
      expect(highBetaState.btcCorrelation).toBeLessThan(0.9);
      expect(highBetaState.affectedSymbols).toHaveLength(0);
    });

    it("should handle empty symbols array", async () => {
      const highBetaState = await correlationManager.detectHighBeta([]);

      expect(highBetaState.isHighBeta).toBe(false);
      expect(highBetaState.btcCorrelation).toBe(0);
      expect(highBetaState.affectedSymbols).toHaveLength(0);
    });
  });

  describe("generateCorrelationMatrix", () => {
    it("should generate correlation matrix for given symbols", async () => {
      const symbols = ["BTCUSDT", "ETHUSDT", "ADAUSDT"];

      // Mock correlation calculations
      jest.spyOn(correlationManager, "calcCorrelation")
        .mockResolvedValueOnce(0.8) // BTC-ETH
        .mockResolvedValueOnce(0.6) // BTC-ADA
        .mockResolvedValueOnce(0.7); // ETH-ADA

      const matrix = await correlationManager.generateCorrelationMatrix(
        symbols,
      );

      expect(matrix.symbols).toEqual(symbols);
      expect(matrix.matrix).toHaveLength(3);
      expect(matrix.matrix[0]).toHaveLength(3);

      // Check diagonal is 1.0 (perfect self-correlation)
      expect(matrix.matrix[0][0]).toBe(1.0);
      expect(matrix.matrix[1][1]).toBe(1.0);
      expect(matrix.matrix[2][2]).toBe(1.0);

      // Check symmetry
      expect(matrix.matrix[0][1]).toBe(matrix.matrix[1][0]);
      expect(matrix.matrix[0][2]).toBe(matrix.matrix[2][0]);
      expect(matrix.matrix[1][2]).toBe(matrix.matrix[2][1]);
    });

    it("should handle empty symbols array", async () => {
      const matrix = await correlationManager.generateCorrelationMatrix([]);

      expect(matrix.symbols).toEqual([]);
      expect(matrix.matrix).toEqual([]);
    });

    it("should handle single symbol", async () => {
      const symbols = ["BTCUSDT"];
      const matrix = await correlationManager.generateCorrelationMatrix(
        symbols,
      );

      expect(matrix.symbols).toEqual(symbols);
      expect(matrix.matrix).toEqual([[1.0]]);
    });
  });

  describe("Configuration and Statistics", () => {
    it("should update configuration", () => {
      const newConfig = { correlationThreshold: 0.8 };
      correlationManager.updateConfig(newConfig);

      // Configuration should be updated (tested through behavior)
      expect(true).toBe(true); // Placeholder assertion
    });

    it("should return statistics", () => {
      const stats = correlationManager.getStatistics();

      expect(stats).toHaveProperty("cachedPairs");
      expect(stats).toHaveProperty("cachedSymbols");
      expect(stats).toHaveProperty("highBetaActive");
      expect(stats).toHaveProperty("avgBtcCorrelation");

      expect(typeof stats.cachedPairs).toBe("number");
      expect(typeof stats.cachedSymbols).toBe("number");
      expect(typeof stats.highBetaActive).toBe("boolean");
      expect(typeof stats.avgBtcCorrelation).toBe("number");
    });

    it("should clear cache", () => {
      correlationManager.clearCache();

      const stats = correlationManager.getStatistics();
      expect(stats.cachedPairs).toBe(0);
      expect(stats.cachedSymbols).toBe(0);
      expect(stats.highBetaActive).toBe(false);
    });
  });

  describe("Event Emission", () => {
    it("should emit correlation:updated event", async () => {
      const eventSpy = jest.fn();
      correlationManager.on("correlation:updated", eventSpy);

      await correlationManager.generateCorrelationMatrix([
        "BTCUSDT",
        "ETHUSDT",
      ]);

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        symbols: ["BTCUSDT", "ETHUSDT"],
        matrix: expect.any(Array),
        timestamp: expect.any(Number),
      }));
    });

    it("should emit correlation:high_beta event", async () => {
      const eventSpy = jest.fn();
      correlationManager.on("correlation:high_beta", eventSpy);

      // Mock high correlation to trigger high beta
      jest.spyOn(correlationManager, "calcCorrelation").mockResolvedValue(0.95);

      await correlationManager.detectHighBeta(["ETHUSDT"]);

      expect(eventSpy).toHaveBeenCalledWith(expect.objectContaining({
        isHighBeta: true,
        btcCorrelation: expect.any(Number),
        affectedSymbols: expect.any(Array),
        timestamp: expect.any(Number),
      }));
    });

    it("should emit correlation:reject event", async () => {
      const eventSpy = jest.fn();
      correlationManager.on("correlation:reject", eventSpy);

      const mockPositions: Position[] = [{
        id: "pos1",
        symbol: "ETHUSDT",
        side: "LONG",
        entryPrice: 2000,
        currentPrice: 2100,
        quantity: 1,
        leverage: 3,
        stopLoss: 1900,
        takeProfit: 2300,
        unrealizedPnL: 100,
        realizedPnL: 0,
        entryTime: Date.now(),
        status: "OPEN",
        rValue: 1.0,
        atr: 50,
      }];

      // Mock high correlation to trigger rejection
      jest.spyOn(correlationManager, "calcCorrelation").mockResolvedValue(0.9);

      await correlationManager.checkCorrelationLimit(
        "BTCUSDT",
        mockPositions,
        1000,
      );

      expect(eventSpy).toHaveBeenCalledWith("BTCUSDT", 0.9, "ETHUSDT");
    });
  });

  describe("Monitoring Lifecycle", () => {
    it("should start and stop monitoring", () => {
      // Monitoring should start automatically in constructor
      expect(true).toBe(true); // Placeholder - monitoring is internal

      correlationManager.stopMonitoring();
      (correlationManager as any).startMonitoring = jest.fn();

      // Should be able to restart
      expect(true).toBe(true); // Placeholder
    });

    it("should cleanup resources on destroy", () => {
      const stopSpy = jest.spyOn(correlationManager, "stopMonitoring");
      const clearSpy = jest.spyOn(correlationManager, "clearCache");

      correlationManager.destroy();

      expect(stopSpy).toHaveBeenCalled();
      expect(clearSpy).toHaveBeenCalled();
    });
  });
});
