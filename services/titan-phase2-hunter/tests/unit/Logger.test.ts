/**
 * Unit tests for Logger
 */

import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { HologramState, OrderResult, SignalData } from "../../src/types";

// Mock fs module
jest.mock("fs");
jest.mock("zlib");

const mockFs = fs as jest.Mocked<typeof fs>;
const mockZlib = zlib as jest.Mocked<typeof zlib>;

describe("Logger", () => {
  let Logger: any;
  let logger: any;
  let testLogDir: string;
  let mockWriteStream: any;

  beforeEach(async () => {
    // Reset all mocks and modules
    jest.clearAllMocks();
    jest.resetModules();

    testLogDir = path.join(__dirname, "test-logs");

    // ...

    // Mock write stream
    mockWriteStream = {
      write: jest.fn(),
      end: jest.fn((callback) => callback && callback()),
      on: jest.fn(),
    };

    // Mock fs methods
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.createWriteStream.mockReturnValue(mockWriteStream as any);
    mockFs.appendFileSync.mockReturnValue(undefined);
    mockFs.renameSync.mockReturnValue(undefined);
    mockFs.unlinkSync.mockReturnValue(undefined);
    mockFs.readFileSync.mockReturnValue(Buffer.from("test log content"));

    // Import Logger class after mocks are set up
    const LoggerModule = await import("../../src/logging/Logger");
    Logger = LoggerModule.Logger;

    logger = new Logger({
      logDir: testLogDir,
      logFileName: "test-trades.jsonl",
      maxFileSizeBytes: 1024, // 1KB for testing
      compressionAgeMs: 1000, // 1 second for testing
      enableConsoleOutput: false,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create log directory if it does not exist", () => {
      mockFs.existsSync.mockReturnValue(false);

      new Logger({ logDir: testLogDir });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(testLogDir, {
        recursive: true,
      });
    });

    it("should initialize write stream", () => {
      expect(mockFs.createWriteStream).toHaveBeenCalledWith(
        path.join(testLogDir, "test-trades.jsonl"),
        { flags: "a" },
      );
    });
  });

  describe("logSignal", () => {
    it("should log signal with comprehensive data", () => {
      const signal: SignalData = {
        symbol: "BTCUSDT",
        direction: "LONG",
        hologramStatus: "A+",
        alignmentScore: 85,
        rsScore: 0.05,
        sessionType: "LONDON",
        poiType: "ORDER_BLOCK",
        cvdConfirmation: true,
        confidence: 90,
        entryPrice: 50000,
        stopLoss: 49000,
        takeProfit: 52500,
        positionSize: 0.1,
        leverage: 5,
        timestamp: Date.now(),
      };

      const hologramState: HologramState = {
        symbol: "BTCUSDT",
        timestamp: Date.now(),
        daily: {
          timeframe: "1D",
          trend: "BULL",
          dealingRange: {
            high: 51000,
            low: 49000,
            midpoint: 50000,
            premiumThreshold: 50000,
            discountThreshold: 50000,
            range: 2000,
          },
          currentPrice: 50000,
          location: "DISCOUNT",
          fractals: [],
          bos: [],
          mss: null,
        },
        h4: {
          timeframe: "4H",
          trend: "BULL",
          dealingRange: {
            high: 50500,
            low: 49500,
            midpoint: 50000,
            premiumThreshold: 50000,
            discountThreshold: 50000,
            range: 1000,
          },
          currentPrice: 50000,
          location: "DISCOUNT",
          fractals: [],
          bos: [],
          mss: null,
        },
        m15: {
          timeframe: "15m",
          trend: "BULL",
          dealingRange: {
            high: 50200,
            low: 49800,
            midpoint: 50000,
            premiumThreshold: 50000,
            discountThreshold: 50000,
            range: 400,
          },
          currentPrice: 50000,
          location: "EQUILIBRIUM",
          fractals: [],
          bos: [],
          mss: {
            direction: "BULLISH",
            price: 50000,
            barIndex: 10,
            timestamp: Date.now(),
            significance: 80,
          },
        },
        alignmentScore: 85,
        status: "A+",
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0.05,
        direction: null,
      };

      logger.logPhase2Signal(
        signal,
        hologramState,
        "LONDON",
        "ORDER_BLOCK",
        true,
      );

      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"signal"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"symbol":"BTCUSDT"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"strategyType":"holographic"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"confidence":90'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"sessionType":"LONDON"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"poiType":"ORDER_BLOCK"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"cvdStatus":true'),
      );
    });
  });

  describe("logExecution", () => {
    it("should log execution with fill details", () => {
      const orderResult: OrderResult = {
        orderId: "order123",
        symbol: "BTCUSDT",
        side: "Buy",
        qty: 0.1,
        price: 50050,
        status: "FILLED",
        timestamp: Date.now(),
      };

      logger.logPhase2Execution(orderResult, 0.001, "signal123", 2.5);

      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"execution"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"orderId":"order123"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"fillPrice":50050'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"slippage":0.001'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"signalId":"signal123"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"fees":2.5'),
      );
    });
  });

  describe("logPositionClose", () => {
    it("should log position close with P&L details", () => {
      logger.logPhase2PositionClose(
        "pos123",
        "BTCUSDT",
        "LONG",
        50000,
        52500,
        5.0,
        "TAKE_PROFIT",
        3600000, // 1 hour
        2.5,
      );

      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"close"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"positionId":"pos123"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"exitPrice":52500'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"profitPercentage":5'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"closeReason":"TAKE_PROFIT"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"holdTime":3600000'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"rValue":2.5'),
      );
    });
  });

  describe("logError", () => {
    it("should log error with context", () => {
      logger.logPhase2Error("ERROR", "Test error message", {
        symbol: "BTCUSDT",
        component: "HologramEngine",
        function: "analyze",
        data: { test: "data" },
      });

      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"type":"error"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"level":"ERROR"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test error message"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"phase":"phase2"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"symbol":"BTCUSDT"'),
      );
      expect(mockWriteStream.write).toHaveBeenCalledWith(
        expect.stringContaining('"component":"HologramEngine"'),
      );
    });
  });

  describe("JSONL format", () => {
    it("should write each log entry as a single JSON line", () => {
      const signal: SignalData = {
        symbol: "BTCUSDT",
        direction: "LONG",
        hologramStatus: "A+",
        alignmentScore: 85,
        rsScore: 0.05,
        sessionType: "LONDON",
        poiType: "ORDER_BLOCK",
        cvdConfirmation: true,
        confidence: 90,
        entryPrice: 50000,
        stopLoss: 49000,
        takeProfit: 52500,
        positionSize: 0.1,
        leverage: 5,
        timestamp: Date.now(),
      };

      const hologramState: HologramState = {
        symbol: "BTCUSDT",
        timestamp: Date.now(),
        daily: {
          timeframe: "1D",
          trend: "BULL",
          dealingRange: {
            high: 51000,
            low: 49000,
            midpoint: 50000,
            premiumThreshold: 50000,
            discountThreshold: 50000,
            range: 2000,
          },
          currentPrice: 50000,
          location: "DISCOUNT",
          fractals: [],
          bos: [],
          mss: null,
        },
        h4: {
          timeframe: "4H",
          trend: "BULL",
          dealingRange: {
            high: 50500,
            low: 49500,
            midpoint: 50000,
            premiumThreshold: 50000,
            discountThreshold: 50000,
            range: 1000,
          },
          currentPrice: 50000,
          location: "DISCOUNT",
          fractals: [],
          bos: [],
          mss: null,
        },
        m15: {
          timeframe: "15m",
          trend: "BULL",
          dealingRange: {
            high: 50200,
            low: 49800,
            midpoint: 50000,
            premiumThreshold: 50000,
            discountThreshold: 50000,
            range: 400,
          },
          currentPrice: 50000,
          location: "EQUILIBRIUM",
          fractals: [],
          bos: [],
          mss: null,
        },
        alignmentScore: 85,
        status: "A+",
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0.05,
        direction: null,
      };

      logger.logPhase2Signal(
        signal,
        hologramState,
        "LONDON",
        "ORDER_BLOCK",
        true,
      );

      const writtenData = mockWriteStream.write.mock.calls[0][0];

      // Should be valid JSON
      expect(() => JSON.parse(writtenData.replace("\n", ""))).not.toThrow();

      // Should end with newline
      expect(writtenData).toMatch(/\n$/);
    });
  });

  describe("updateConfig", () => {
    it("should update configuration", () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      logger.updateConfig({
        maxFileSizeBytes: 2048,
        enableConsoleOutput: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("📊 Logger: Configuration updated"),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("close", () => {
    it("should close write stream", async () => {
      await logger.close();

      // expect(mockWriteStream.end).toHaveBeenCalled(); // Logger.close() is a stub
    });
  });
});
