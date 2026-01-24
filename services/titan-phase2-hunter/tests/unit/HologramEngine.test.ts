/**
 * Unit Tests for HologramEngine
 *
 * Tests multi-timeframe analysis, alignment scoring, veto logic,
 * and relative strength calculations.
 */

import { HologramEngine } from "../../src/engine/HologramEngine";
import { BybitPerpsClient } from "../../src/exchanges/BybitPerpsClient";
import {
  HologramState,
  OHLCV,
  TimeframeState,
  VetoResult,
} from "../../src/types";

// Mock node-fetch
jest.mock("node-fetch", () => jest.fn());

// Mock BybitPerpsClient
jest.mock("../../src/exchanges/BybitPerpsClient");

describe("HologramEngine", () => {
  let hologramEngine: HologramEngine;
  let mockBybitClient: jest.Mocked<BybitPerpsClient>;

  beforeEach(() => {
    mockBybitClient = new BybitPerpsClient(
      "test-key",
      "test-secret",
    ) as jest.Mocked<BybitPerpsClient>;

    const mockFlowClassifier = {
      getLatestClassification: jest.fn().mockReturnValue(null),
      classifyFlow: jest.fn(),
    };

    hologramEngine = new HologramEngine(
      mockBybitClient,
      mockFlowClassifier as any,
    );
  });

  // Helper function to create test OHLCV data
  const createCandle = (
    timestamp: number,
    open: number,
    high: number,
    low: number,
    close: number,
    volume: number = 1000,
  ): OHLCV => ({
    timestamp,
    open,
    high,
    low,
    close,
    volume,
  });

  // Helper function to create test candles with fractal patterns
  const createFractalCandles = (): OHLCV[] => [
    createCandle(1, 100, 105, 95, 102),
    createCandle(2, 102, 108, 98, 106),
    createCandle(3, 106, 115, 104, 112), // Swing High at 115
    createCandle(4, 112, 110, 105, 108),
    createCandle(5, 108, 109, 103, 107),
    createCandle(6, 107, 110, 85, 88), // Swing Low at 85
    createCandle(7, 88, 95, 87, 92),
    createCandle(8, 92, 96, 90, 94),
  ];

  describe("analyze", () => {
    beforeEach(() => {
      hologramEngine.clearCache();
    });

    it("should analyze symbol and return complete hologram state", async () => {
      const testCandles = createFractalCandles();

      // Mock all OHLCV calls
      mockBybitClient.fetchOHLCV.mockResolvedValue(testCandles);

      const hologram = await hologramEngine.analyze("ETHUSDT");

      expect(hologram.symbol).toBe("ETHUSDT");
      expect(hologram.timestamp).toBeGreaterThan(0);
      expect(hologram.daily.timeframe).toBe("1D");
      expect(hologram.h4.timeframe).toBe("4H");
      expect(hologram.m15.timeframe).toBe("15m");
      expect(hologram.alignmentScore).toBeGreaterThanOrEqual(0);
      expect(hologram.alignmentScore).toBeLessThanOrEqual(100);
      expect(["A+", "A", "B", "CONFLICT", "NO_PLAY"]).toContain(
        hologram.status,
      );
      expect(typeof hologram.rsScore).toBe("number");
      // Check enhanced fields existence
      expect(hologram.enhancedScore).toBeDefined();
    });

    it("should throw error on invalid candle data", async () => {
      const invalidCandles: OHLCV[] = [
        createCandle(1, 100, 95, 105, 102), // Invalid: high < low
      ];

      mockBybitClient.fetchOHLCV.mockResolvedValue(invalidCandles);

      await expect(hologramEngine.analyze("ETHUSDT")).rejects.toThrow();
    });

    it("should throw error on API failure", async () => {
      mockBybitClient.fetchOHLCV.mockRejectedValue(new Error("API Error"));

      await expect(hologramEngine.analyze("ETHUSDT")).rejects.toThrow(
        "Failed to analyze hologram for ETHUSDT",
      );
    });
  });

  describe("calcRelativeStrength", () => {
    beforeEach(() => {
      // Clear cache before each test
      hologramEngine.clearCache();
    });

    it("should return 0 for BTCUSDT symbol", async () => {
      const rsScore = await hologramEngine.calcRelativeStrength("BTCUSDT");
      expect(rsScore).toBe(0);
    });

    it("should calculate positive RS when asset outperforms BTC", async () => {
      // Mock OHLCV data - asset up 5%, BTC up 2%
      const assetCandles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 100), // Previous candle
        createCandle(2, 100, 110, 98, 105), // Current candle (+5%)
      ];

      const btcCandles: OHLCV[] = [
        createCandle(1, 50000, 52000, 48000, 50000), // Previous candle
        createCandle(2, 50000, 52000, 49000, 51000), // Current candle (+2%)
      ];

      mockBybitClient.fetchOHLCV
        .mockResolvedValueOnce(assetCandles) // First call for ETHUSDT
        .mockResolvedValueOnce(btcCandles); // Second call for BTCUSDT

      const rsScore = await hologramEngine.calcRelativeStrength("ETHUSDT");

      // Asset: +5%, BTC: +2%, RS = 5% - 2% = 3%
      expect(rsScore).toBeCloseTo(0.03, 2);
    });

    it("should calculate negative RS when asset underperforms BTC", async () => {
      // Mock OHLCV data - asset up 1%, BTC up 3%
      const assetCandles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 100), // Previous candle
        createCandle(2, 100, 105, 98, 101), // Current candle (+1%)
      ];

      const btcCandles: OHLCV[] = [
        createCandle(1, 50000, 52000, 48000, 50000), // Previous candle
        createCandle(2, 50000, 53000, 49000, 51500), // Current candle (+3%)
      ];

      mockBybitClient.fetchOHLCV
        .mockResolvedValueOnce(assetCandles) // First call for ETHUSDT
        .mockResolvedValueOnce(btcCandles); // Second call for BTCUSDT

      const rsScore = await hologramEngine.calcRelativeStrength("ETHUSDT");

      // Asset: +1%, BTC: +3%, RS = 1% - 3% = -2%
      expect(rsScore).toBeCloseTo(-0.02, 2);
    });

    it("should return 0 on insufficient data", async () => {
      // Mock insufficient data
      const insufficientCandles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 100), // Only 1 candle
      ];

      mockBybitClient.fetchOHLCV
        .mockResolvedValueOnce(insufficientCandles)
        .mockResolvedValueOnce(insufficientCandles);

      const rsScore = await hologramEngine.calcRelativeStrength("ETHUSDT");
      expect(rsScore).toBe(0);
    });

    it("should return 0 on API error", async () => {
      mockBybitClient.fetchOHLCV.mockRejectedValue(new Error("API Error"));

      const rsScore = await hologramEngine.calcRelativeStrength("ETHUSDT");
      expect(rsScore).toBe(0);
    });

    it("should clamp extreme RS values to [-1, 1] range", async () => {
      // Mock extreme data - asset up 200%, BTC down 50%
      const assetCandles: OHLCV[] = [
        createCandle(1, 100, 105, 95, 100), // Previous candle
        createCandle(2, 100, 350, 98, 300), // Current candle (+200%)
      ];

      const btcCandles: OHLCV[] = [
        createCandle(1, 50000, 52000, 48000, 50000), // Previous candle
        createCandle(2, 50000, 30000, 20000, 25000), // Current candle (-50%)
      ];

      mockBybitClient.fetchOHLCV
        .mockResolvedValueOnce(assetCandles)
        .mockResolvedValueOnce(btcCandles);

      const rsScore = await hologramEngine.calcRelativeStrength("ETHUSDT");

      // Should be clamped to 1.0
      expect(rsScore).toBe(1);
    });
  });

  describe("analyze", () => {
    beforeEach(() => {
      hologramEngine.clearCache();
    });

    it("should analyze symbol and return complete hologram state", async () => {
      const testCandles = createFractalCandles();

      // Mock all OHLCV calls
      mockBybitClient.fetchOHLCV
        .mockResolvedValueOnce(testCandles) // Daily
        .mockResolvedValueOnce(testCandles) // 4H
        .mockResolvedValueOnce(testCandles) // 15m
        .mockResolvedValueOnce(testCandles) // Asset for RS
        .mockResolvedValueOnce(testCandles); // BTC for RS

      const hologram = await hologramEngine.analyze("ETHUSDT");

      expect(hologram.symbol).toBe("ETHUSDT");
      expect(hologram.timestamp).toBeGreaterThan(0);
      expect(hologram.daily.timeframe).toBe("1D");
      expect(hologram.h4.timeframe).toBe("4H");
      expect(hologram.m15.timeframe).toBe("15m");
      expect(hologram.alignmentScore).toBeGreaterThanOrEqual(0);
      expect(hologram.alignmentScore).toBeLessThanOrEqual(100);
      expect(["A+", "B", "CONFLICT", "NO_PLAY"]).toContain(hologram.status);
      expect(typeof hologram.rsScore).toBe("number");
    });

    it("should throw error on invalid candle data", async () => {
      const invalidCandles: OHLCV[] = [
        createCandle(1, 100, 95, 105, 102), // Invalid: high < low
      ];

      mockBybitClient.fetchOHLCV.mockResolvedValue(invalidCandles);

      await expect(hologramEngine.analyze("ETHUSDT")).rejects.toThrow();
    });

    it("should throw error on API failure", async () => {
      mockBybitClient.fetchOHLCV.mockRejectedValue(new Error("API Error"));

      await expect(hologramEngine.analyze("ETHUSDT")).rejects.toThrow(
        "Failed to analyze hologram for ETHUSDT",
      );
    });
  });

  describe("validateHologramState", () => {
    it("should validate correct hologram state", () => {
      const validHologram: HologramState = {
        symbol: "ETHUSDT",
        timestamp: Date.now(),
        daily: {
          timeframe: "1D",
          trend: "BULL",
          dealingRange: {
            high: 120,
            low: 80,
            midpoint: 100,
            premiumThreshold: 100,
            discountThreshold: 100,
            range: 40,
          },
          currentPrice: 110,
          location: "PREMIUM",
          fractals: [],
          bos: [],
          mss: null,
        },
        h4: {
          timeframe: "4H",
          trend: "BULL",
          dealingRange: {
            high: 115,
            low: 85,
            midpoint: 100,
            premiumThreshold: 100,
            discountThreshold: 100,
            range: 30,
          },
          currentPrice: 110,
          location: "PREMIUM",
          fractals: [],
          bos: [],
          mss: null,
        },
        m15: {
          timeframe: "15m",
          trend: "BULL",
          dealingRange: {
            high: 112,
            low: 88,
            midpoint: 100,
            premiumThreshold: 100,
            discountThreshold: 100,
            range: 24,
          },
          currentPrice: 110,
          location: "PREMIUM",
          fractals: [],
          bos: [],
          mss: null,
        },
        alignmentScore: 80,
        status: "A+",
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0.05,
        direction: "LONG",
      };

      expect(() => HologramEngine.validateHologramState(validHologram)).not
        .toThrow();
    });

    it("should throw error for invalid alignment score", () => {
      const invalidHologram = {
        symbol: "ETHUSDT",
        timestamp: Date.now(),
        alignmentScore: 150, // Invalid: > 100
        status: "A+" as const,
        daily: {
          fractals: [],
          bos: [],
          trend: "BULL" as const,
          location: "PREMIUM" as const,
          timeframe: "1D" as const,
        },
        h4: {
          fractals: [],
          bos: [],
          trend: "BULL" as const,
          location: "PREMIUM" as const,
          timeframe: "4H" as const,
        },
        m15: {
          fractals: [],
          bos: [],
          trend: "BULL" as const,
          location: "PREMIUM" as const,
          timeframe: "15m" as const,
        },
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0.05,
        direction: null,
      } as any;

      expect(() => HologramEngine.validateHologramState(invalidHologram))
        .toThrow("alignment score must be 0-100");
    });

    it("should throw error for invalid status", () => {
      const invalidHologram = {
        symbol: "ETHUSDT",
        timestamp: Date.now(),
        alignmentScore: 80,
        status: "INVALID", // Invalid status
        daily: {
          fractals: [],
          bos: [],
          trend: "BULL" as const,
          location: "PREMIUM" as const,
          timeframe: "1D" as const,
        },
        h4: {
          fractals: [],
          bos: [],
          trend: "BULL" as const,
          location: "PREMIUM" as const,
          timeframe: "4H" as const,
        },
        m15: {
          fractals: [],
          bos: [],
          trend: "BULL" as const,
          location: "PREMIUM" as const,
          timeframe: "15m" as const,
        },
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0.05,
        direction: null,
      } as any;

      expect(() => HologramEngine.validateHologramState(invalidHologram))
        .toThrow("invalid status");
    });
  });

  describe("getHologramSummary", () => {
    it("should generate readable hologram summary", () => {
      const hologram: HologramState = {
        symbol: "ETHUSDT",
        timestamp: Date.now(),
        daily: {
          timeframe: "1D",
          trend: "BULL",
          dealingRange: {
            high: 120,
            low: 80,
            midpoint: 100,
            premiumThreshold: 100,
            discountThreshold: 100,
            range: 40,
          },
          currentPrice: 110,
          location: "PREMIUM",
          fractals: [],
          bos: [],
          mss: null,
        },
        h4: {
          timeframe: "4H",
          trend: "BULL",
          dealingRange: {
            high: 115,
            low: 85,
            midpoint: 100,
            premiumThreshold: 100,
            discountThreshold: 100,
            range: 30,
          },
          currentPrice: 110,
          location: "DISCOUNT",
          fractals: [],
          bos: [],
          mss: null,
        },
        m15: {
          timeframe: "15m",
          trend: "BULL",
          dealingRange: {
            high: 112,
            low: 88,
            midpoint: 100,
            premiumThreshold: 100,
            discountThreshold: 100,
            range: 24,
          },
          currentPrice: 110,
          location: "PREMIUM",
          fractals: [],
          bos: [],
          mss: {
            direction: "BULLISH",
            price: 110,
            barIndex: 5,
            timestamp: 1000,
            significance: 80,
          },
        },
        alignmentScore: 85,
        status: "A+",
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0.03,
        direction: "LONG",
      };

      const summary = HologramEngine.getHologramSummary(hologram);

      expect(summary).toContain("🟢"); // A+ status emoji
      expect(summary).toContain("ETHUSDT");
      expect(summary).toContain("Score: 85");
      expect(summary).toContain("RS: 3.0%");
      expect(summary).toContain("📈"); // Positive RS emoji
      expect(summary).toContain("Daily: BULL/PREMIUM");
      expect(summary).toContain("4H: BULL/DISCOUNT");
      expect(summary).toContain("15m: BULL/MSS");
    });
  });

  describe("cache management", () => {
    it("should clear cache", () => {
      hologramEngine.clearCache();
      const stats = hologramEngine.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.keys).toHaveLength(0);
    });

    it("should provide cache statistics", () => {
      const stats = hologramEngine.getCacheStats();
      expect(typeof stats.size).toBe("number");
      expect(Array.isArray(stats.keys)).toBe(true);
    });
  });
});
