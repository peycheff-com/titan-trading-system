/**
 * UltimateBulgariaProtocol Unit Tests
 *
 * Tests the Ultimate Bulgaria Protocol - Combined Strategy
 * Combines OI Wipeout + Leader-Follower for maximum safety and profit
 */

import {
  Tripwire,
  UltimateBulgariaProtocol,
} from "../../src/detectors/UltimateBulgariaProtocol.js";

// Mock interfaces
interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Mock Bybit client
class MockBybitClient {
  private callCount = 0;
  private mockSymbols: string[] = [];
  private mockOHLCVMap: Map<string, OHLCV[]> = new Map();

  setMockSymbols(symbols: string[]): void {
    this.mockSymbols = symbols;
  }

  setMockOHLCV(symbol: string, ohlcv: OHLCV[]): void {
    this.mockOHLCVMap.set(symbol, ohlcv);
  }

  async fetchTopSymbols(limit: number): Promise<string[]> {
    return this.mockSymbols.slice(0, limit);
  }

  async fetchOHLCV(
    symbol: string,
    interval: string,
    limit: number,
  ): Promise<OHLCV[]> {
    return this.mockOHLCVMap.get(symbol) || [];
  }

  async getTicker(symbol: string): Promise<any> {
    this.callCount++;
    return {
      symbol,
      bid1Price: "100",
      bid1Size: (1000 + this.callCount * 100).toString(),
      ask1Price: "101",
      ask1Size: "100",
    };
  }
}

// Mock Binance client
class MockBinanceClient {
  private mockSpotPrices: Map<string, number> = new Map();

  setMockSpotPrice(symbol: string, price: number): void {
    this.mockSpotPrices.set(symbol, price);
  }

  async getSpotPrice(symbol: string): Promise<number> {
    return this.mockSpotPrices.get(symbol) || 0;
  }
}

// Mock OI Wipeout Detector
class MockOIWipeoutDetector {
  private mockWipeouts: Map<string, Tripwire | null> = new Map();

  setMockWipeout(symbol: string, wipeout: Tripwire | null): void {
    this.mockWipeouts.set(symbol, wipeout);
  }

  async detectWipeout(symbol: string): Promise<Tripwire | null> {
    return this.mockWipeouts.get(symbol) || null;
  }
}

// Mock Logger
class MockLogger {
  info(message: string): void {}
  warn(message: string): void {}
  error(message: string): void {}
}

describe("UltimateBulgariaProtocol", () => {
  let protocol: UltimateBulgariaProtocol;
  let mockBybitClient: MockBybitClient;
  let mockBinanceClient: MockBinanceClient;
  let mockOIDetector: MockOIWipeoutDetector;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockBybitClient = new MockBybitClient();
    mockBinanceClient = new MockBinanceClient();
    mockOIDetector = new MockOIWipeoutDetector();
    mockLogger = new MockLogger();
    protocol = new UltimateBulgariaProtocol(
      mockBybitClient as any,
      mockBinanceClient as any,
      mockOIDetector as any,
      mockLogger as any,
    );
  });

  describe("scan", () => {
    it("should return null when no crashes detected", async () => {
      // Setup: No symbols crashing
      mockBybitClient.setMockSymbols(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);

      // BTC is flat
      mockBybitClient.setMockOHLCV("BTCUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50050,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 50050,
          high: 50150,
          low: 49950,
          close: 50100,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 50100,
          high: 50200,
          low: 50000,
          close: 50150,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 50150,
          high: 50250,
          low: 50050,
          close: 50200,
          volume: 1000,
        },
      ]);

      // ETH is also flat
      mockBybitClient.setMockOHLCV("ETHUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 3000,
          high: 3010,
          low: 2990,
          close: 3000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 3000,
          high: 3010,
          low: 2990,
          close: 3005,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 3005,
          high: 3015,
          low: 2995,
          close: 3010,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 3010,
          high: 3020,
          low: 3000,
          close: 3015,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 3015,
          high: 3025,
          low: 3005,
          close: 3020,
          volume: 1000,
        },
      ]);

      const result = await protocol.scan();
      expect(result).toBeNull();
    });

    it("should return null when crash is market-wide (BTC also dropped)", async () => {
      // Setup: Both BTC and altcoin dropped (market-wide crash)
      mockBybitClient.setMockSymbols(["BTCUSDT", "SOLUSDT"]);

      // BTC dropped 4%
      mockBybitClient.setMockOHLCV("BTCUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 50000,
          high: 50000,
          low: 48000,
          close: 50000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 50000,
          high: 50000,
          low: 48000,
          close: 49000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 49000,
          high: 49000,
          low: 48000,
          close: 48500,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 48500,
          high: 48500,
          low: 48000,
          close: 48200,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 48200,
          high: 48200,
          low: 48000,
          close: 48000,
          volume: 1000,
        },
      ]);

      // SOL also dropped 4% (market-wide, not idiosyncratic)
      mockBybitClient.setMockOHLCV("SOLUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 100,
          high: 100,
          low: 96,
          close: 100,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 100,
          high: 100,
          low: 96,
          close: 98,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 98,
          high: 98,
          low: 96,
          close: 97,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 97,
          high: 97,
          low: 96,
          close: 96.5,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 96.5,
          high: 96.5,
          low: 96,
          close: 96,
          volume: 1000,
        },
      ]);

      const result = await protocol.scan();
      expect(result).toBeNull();
    });

    it("should detect idiosyncratic crash when altcoin drops but BTC is flat", async () => {
      // Setup: SOL crashed 4%, but BTC is flat (< 0.5%)
      mockBybitClient.setMockSymbols(["BTCUSDT", "SOLUSDT"]);

      // BTC is flat (0.2% drop)
      mockBybitClient.setMockOHLCV("BTCUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 49980,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 49980,
          high: 50080,
          low: 49880,
          close: 49960,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 49960,
          high: 50060,
          low: 49860,
          close: 49940,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 49940,
          high: 50040,
          low: 49840,
          close: 49900,
          volume: 1000,
        },
      ]);

      // SOL crashed 4% (idiosyncratic)
      mockBybitClient.setMockOHLCV("SOLUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 100,
          high: 100,
          low: 96,
          close: 100,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 100,
          high: 100,
          low: 96,
          close: 98,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 98,
          high: 98,
          low: 96,
          close: 97,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 97,
          high: 97,
          low: 96,
          close: 96.5,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 96.5,
          high: 96.5,
          low: 96,
          close: 96,
          volume: 1000,
        },
      ]);

      // Mock OI wipeout detected for SOL
      const mockWipeout: Tripwire = {
        symbol: "SOLUSDT",
        triggerPrice: 96,
        direction: "LONG",
        trapType: "OI_WIPEOUT",
        confidence: 95,
        leverage: 20,
        estimatedCascadeSize: 0.05,
        activated: false,
        targetPrice: 98,
        stopLoss: 94.08,
      };
      mockOIDetector.setMockWipeout("SOLUSDT", mockWipeout);

      // Mock Binance spot price
      mockBinanceClient.setMockSpotPrice("SOLUSDT", 96);

      const result = await protocol.scan();

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe("SOLUSDT");
      expect(result!.trapType).toBe("ULTIMATE_BULGARIA");
      expect(result!.confidence).toBe(98); // Highest confidence
      expect(result!.binanceTrigger).toBeCloseTo(96.96, 2); // 96 * 1.01 = +1% recovery
    });

    it("should return null when crash detected but no OI wipeout", async () => {
      // Setup: SOL crashed but OI didn't wipeout
      mockBybitClient.setMockSymbols(["BTCUSDT", "SOLUSDT"]);

      // BTC is flat
      mockBybitClient.setMockOHLCV("BTCUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 49980,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 49980,
          high: 50080,
          low: 49880,
          close: 49960,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 49960,
          high: 50060,
          low: 49860,
          close: 49940,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 49940,
          high: 50040,
          low: 49840,
          close: 49900,
          volume: 1000,
        },
      ]);

      // SOL crashed 4%
      mockBybitClient.setMockOHLCV("SOLUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 100,
          high: 100,
          low: 96,
          close: 100,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 100,
          high: 100,
          low: 96,
          close: 98,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 98,
          high: 98,
          low: 96,
          close: 97,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 97,
          high: 97,
          low: 96,
          close: 96.5,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 96.5,
          high: 96.5,
          low: 96,
          close: 96,
          volume: 1000,
        },
      ]);

      // No OI wipeout detected
      mockOIDetector.setMockWipeout("SOLUSDT", null);

      const result = await protocol.scan();
      expect(result).toBeNull();
    });

    it("should preserve all OI wipeout properties in result", async () => {
      // Setup: Valid idiosyncratic crash with OI wipeout
      mockBybitClient.setMockSymbols(["BTCUSDT", "ETHUSDT"]);

      // BTC is flat
      mockBybitClient.setMockOHLCV("BTCUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 49980,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 49980,
          high: 50080,
          low: 49880,
          close: 49960,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 49960,
          high: 50060,
          low: 49860,
          close: 49940,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 49940,
          high: 50040,
          low: 49840,
          close: 49900,
          volume: 1000,
        },
      ]);

      // ETH crashed 5%
      mockBybitClient.setMockOHLCV("ETHUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 3000,
          high: 3000,
          low: 2850,
          close: 3000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 3000,
          high: 3000,
          low: 2850,
          close: 2950,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 2950,
          high: 2950,
          low: 2850,
          close: 2900,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 2900,
          high: 2900,
          low: 2850,
          close: 2870,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 2870,
          high: 2870,
          low: 2850,
          close: 2850,
          volume: 1000,
        },
      ]);

      // Mock OI wipeout with all properties
      const mockWipeout: Tripwire = {
        symbol: "ETHUSDT",
        triggerPrice: 2850,
        direction: "LONG",
        trapType: "OI_WIPEOUT",
        confidence: 95,
        leverage: 20,
        estimatedCascadeSize: 0.05,
        activated: false,
        targetPrice: 2925,
        stopLoss: 2793,
      };
      mockOIDetector.setMockWipeout("ETHUSDT", mockWipeout);

      // Mock Binance spot price
      mockBinanceClient.setMockSpotPrice("ETHUSDT", 2850);

      const result = await protocol.scan();

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe("ETHUSDT");
      expect(result!.triggerPrice).toBe(2850);
      expect(result!.direction).toBe("LONG");
      expect(result!.trapType).toBe("ULTIMATE_BULGARIA"); // Upgraded from OI_WIPEOUT
      expect(result!.confidence).toBe(98); // Upgraded from 95
      expect(result!.leverage).toBe(20);
      expect(result!.estimatedCascadeSize).toBe(0.05);
      expect(result!.activated).toBe(false);
      expect(result!.targetPrice).toBe(2925);
      expect(result!.stopLoss).toBe(2793);
      expect(result!.binanceTrigger).toBe(2878.5); // 2850 * 1.01
    });

    it("should handle multiple crashes and return first valid trap", async () => {
      // Setup: Multiple crashes, but only one has OI wipeout
      mockBybitClient.setMockSymbols([
        "BTCUSDT",
        "ETHUSDT",
        "SOLUSDT",
        "AVAXUSDT",
      ]);

      // BTC is flat
      mockBybitClient.setMockOHLCV("BTCUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 49980,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 49980,
          high: 50080,
          low: 49880,
          close: 49960,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 49960,
          high: 50060,
          low: 49860,
          close: 49940,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 49940,
          high: 50040,
          low: 49840,
          close: 49900,
          volume: 1000,
        },
      ]);

      // ETH crashed 4% (no OI wipeout)
      mockBybitClient.setMockOHLCV("ETHUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 3000,
          high: 3000,
          low: 2880,
          close: 3000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 3000,
          high: 3000,
          low: 2880,
          close: 2950,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 2950,
          high: 2950,
          low: 2880,
          close: 2920,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 2920,
          high: 2920,
          low: 2880,
          close: 2900,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 2900,
          high: 2900,
          low: 2880,
          close: 2880,
          volume: 1000,
        },
      ]);

      // SOL crashed 5% (HAS OI wipeout)
      mockBybitClient.setMockOHLCV("SOLUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 100,
          high: 100,
          low: 95,
          close: 100,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 100,
          high: 100,
          low: 95,
          close: 98,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 98,
          high: 98,
          low: 95,
          close: 96,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 96,
          high: 96,
          low: 95,
          close: 95.5,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 95.5,
          high: 95.5,
          low: 95,
          close: 95,
          volume: 1000,
        },
      ]);

      // AVAX crashed 3.5% (no OI wipeout)
      mockBybitClient.setMockOHLCV("AVAXUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 40,
          high: 40,
          low: 38.6,
          close: 40,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 40,
          high: 40,
          low: 38.6,
          close: 39.2,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 39.2,
          high: 39.2,
          low: 38.6,
          close: 38.9,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 38.9,
          high: 38.9,
          low: 38.6,
          close: 38.7,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 38.7,
          high: 38.7,
          low: 38.6,
          close: 38.6,
          volume: 1000,
        },
      ]);

      // Only SOL has OI wipeout
      mockOIDetector.setMockWipeout("ETHUSDT", null);
      mockOIDetector.setMockWipeout("SOLUSDT", {
        symbol: "SOLUSDT",
        triggerPrice: 95,
        direction: "LONG",
        trapType: "OI_WIPEOUT",
        confidence: 95,
        leverage: 20,
        estimatedCascadeSize: 0.05,
        activated: false,
        targetPrice: 97.5,
        stopLoss: 93.1,
      });
      mockOIDetector.setMockWipeout("AVAXUSDT", null);

      mockBinanceClient.setMockSpotPrice("SOLUSDT", 95);

      const result = await protocol.scan();

      expect(result).not.toBeNull();
      expect(result!.symbol).toBe("SOLUSDT");
      expect(result!.trapType).toBe("ULTIMATE_BULGARIA");
    });

    it("should handle errors gracefully when fetching OHLCV fails", async () => {
      // Setup: Symbol list but OHLCV fetch fails
      mockBybitClient.setMockSymbols(["BTCUSDT", "BADUSDT"]);

      // BTC is fine
      mockBybitClient.setMockOHLCV("BTCUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 49980,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 49980,
          high: 50080,
          low: 49880,
          close: 49960,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 49960,
          high: 50060,
          low: 49860,
          close: 49940,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 49940,
          high: 50040,
          low: 49840,
          close: 49900,
          volume: 1000,
        },
      ]);

      // BADUSDT has no data (empty array)
      mockBybitClient.setMockOHLCV("BADUSDT", []);

      const result = await protocol.scan();
      expect(result).toBeNull(); // Should not crash, just return null
    });

    it("should calculate correct Binance trigger at +1% recovery", async () => {
      mockBybitClient.setMockSymbols(["BTCUSDT", "SOLUSDT"]);

      // BTC is flat
      mockBybitClient.setMockOHLCV("BTCUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 50000,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 50000,
          high: 50100,
          low: 49900,
          close: 49980,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 49980,
          high: 50080,
          low: 49880,
          close: 49960,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 49960,
          high: 50060,
          low: 49860,
          close: 49940,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 49940,
          high: 50040,
          low: 49840,
          close: 49900,
          volume: 1000,
        },
      ]);

      // SOL crashed
      mockBybitClient.setMockOHLCV("SOLUSDT", [
        {
          timestamp: Date.now() - 300000,
          open: 100,
          high: 100,
          low: 96,
          close: 100,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 240000,
          open: 100,
          high: 100,
          low: 96,
          close: 98,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 180000,
          open: 98,
          high: 98,
          low: 96,
          close: 97,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 120000,
          open: 97,
          high: 97,
          low: 96,
          close: 96.5,
          volume: 1000,
        },
        {
          timestamp: Date.now() - 60000,
          open: 96.5,
          high: 96.5,
          low: 96,
          close: 96,
          volume: 1000,
        },
      ]);

      mockOIDetector.setMockWipeout("SOLUSDT", {
        symbol: "SOLUSDT",
        triggerPrice: 96,
        direction: "LONG",
        trapType: "OI_WIPEOUT",
        confidence: 95,
        leverage: 20,
        estimatedCascadeSize: 0.05,
        activated: false,
      });

      // Binance spot price is 100
      mockBinanceClient.setMockSpotPrice("SOLUSDT", 100);

      const result = await protocol.scan();

      // Binance trigger should be 100 * 1.01 = 101
      expect(result!.binanceTrigger).toBe(101);
    });
  });
});
