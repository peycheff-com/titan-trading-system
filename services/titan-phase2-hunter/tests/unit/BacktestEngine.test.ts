/**
 * Unit Tests for BacktestEngine
 *
 * Tests the backtesting functionality including historical data fetching,
 * trade simulation, fee calculation, and results analysis.
 */

import {
  BacktestConfig,
  BacktestEngine,
  FeeModel,
  SlippageModel,
} from "../../src/backtest/BacktestEngine";
import { BybitPerpsClient } from "../../src/exchanges/BybitPerpsClient";
import { HologramEngine } from "../../src/engine/HologramEngine";
import { SessionProfiler } from "../../src/engine/SessionProfiler";
import { InefficiencyMapper } from "../../src/engine/InefficiencyMapper";
import { CVDValidator } from "../../src/engine/CVDValidator";
import { SignalGenerator } from "../../src/execution/SignalGenerator";
import { OHLCV, SessionType, SignalData } from "../../src/types";

// Mock dependencies
jest.mock("../../src/exchanges/BybitPerpsClient");
jest.mock("../../src/engine/HologramEngine");
jest.mock("../../src/engine/SessionProfiler");
jest.mock("../../src/engine/InefficiencyMapper");
jest.mock("../../src/engine/CVDValidator");
jest.mock("../../src/execution/SignalGenerator");

describe("BacktestEngine", () => {
  let backtestEngine: BacktestEngine;
  let mockBybitClient: jest.Mocked<BybitPerpsClient>;
  let mockHologramEngine: jest.Mocked<HologramEngine>;
  let mockSessionProfiler: jest.Mocked<SessionProfiler>;
  let mockInefficiencyMapper: jest.Mocked<InefficiencyMapper>;
  let mockCVDValidator: jest.Mocked<CVDValidator>;
  let mockSignalGenerator: jest.Mocked<SignalGenerator>;

  beforeEach(() => {
    // Create mocked instances
    mockBybitClient = new BybitPerpsClient() as jest.Mocked<BybitPerpsClient>;
    mockHologramEngine = new HologramEngine(
      mockBybitClient,
      {} as any,
    ) as jest.Mocked<HologramEngine>;
    mockSessionProfiler = new SessionProfiler() as jest.Mocked<SessionProfiler>;
    mockInefficiencyMapper = new InefficiencyMapper() as jest.Mocked<
      InefficiencyMapper
    >;
    mockCVDValidator = new CVDValidator() as jest.Mocked<CVDValidator>;
    mockSignalGenerator = new SignalGenerator(
      mockHologramEngine,
      mockSessionProfiler,
      mockInefficiencyMapper,
      mockCVDValidator,
    ) as jest.Mocked<SignalGenerator>;

    // Create BacktestEngine instance
    backtestEngine = new BacktestEngine(
      mockBybitClient,
      mockHologramEngine,
      mockSessionProfiler,
      mockInefficiencyMapper,
      mockCVDValidator,
      mockSignalGenerator,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchHistoricalData", () => {
    it("should fetch historical data for multiple symbols", async () => {
      // Arrange
      const symbols = ["BTCUSDT", "ETHUSDT"];
      const timeframe = "15m";
      const startDate = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
      const endDate = Date.now();

      const mockCandles: OHLCV[] = [
        {
          timestamp: startDate,
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 1000,
        },
        {
          timestamp: startDate + 15 * 60 * 1000,
          open: 50500,
          high: 51500,
          low: 50000,
          close: 51000,
          volume: 1200,
        },
      ];

      mockBybitClient.fetchOHLCV.mockResolvedValue(mockCandles);

      // Act
      const result = await backtestEngine.fetchHistoricalData(
        symbols,
        timeframe,
        startDate,
        endDate,
      );

      // Assert
      expect(result.size).toBe(2);
      expect(result.has("BTCUSDT")).toBe(true);
      expect(result.has("ETHUSDT")).toBe(true);
      expect(mockBybitClient.fetchOHLCV).toHaveBeenCalledTimes(2);
      expect(mockBybitClient.fetchOHLCV).toHaveBeenCalledWith(
        "BTCUSDT",
        timeframe,
        expect.any(Number),
      );
      expect(mockBybitClient.fetchOHLCV).toHaveBeenCalledWith(
        "ETHUSDT",
        timeframe,
        expect.any(Number),
      );
    });

    it("should handle API errors gracefully", async () => {
      // Arrange
      const symbols = ["BTCUSDT"];
      const timeframe = "15m";
      const startDate = Date.now() - (24 * 60 * 60 * 1000);
      const endDate = Date.now();

      mockBybitClient.fetchOHLCV.mockRejectedValue(new Error("API Error"));

      // Act
      const result = await backtestEngine.fetchHistoricalData(
        symbols,
        timeframe,
        startDate,
        endDate,
      );

      // Assert
      expect(result.size).toBe(0);
      expect(mockBybitClient.fetchOHLCV).toHaveBeenCalledTimes(1);
    });

    it("should filter candles within date range", async () => {
      // Arrange
      const symbols = ["BTCUSDT"];
      const timeframe = "15m";
      const startDate = Date.now() - (2 * 24 * 60 * 60 * 1000); // 2 days ago
      const endDate = Date.now() - (1 * 24 * 60 * 60 * 1000); // 1 day ago

      const mockCandles: OHLCV[] = [
        {
          timestamp: startDate - 60 * 60 * 1000, // Before range
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 1000,
        },
        {
          timestamp: startDate + 60 * 60 * 1000, // Within range
          open: 50500,
          high: 51500,
          low: 50000,
          close: 51000,
          volume: 1200,
        },
        {
          timestamp: endDate + 60 * 60 * 1000, // After range
          open: 51000,
          high: 52000,
          low: 50500,
          close: 51500,
          volume: 1100,
        },
      ];

      mockBybitClient.fetchOHLCV.mockResolvedValue(mockCandles);

      // Act
      const result = await backtestEngine.fetchHistoricalData(
        symbols,
        timeframe,
        startDate,
        endDate,
      );

      // Assert
      const btcCandles = result.get("BTCUSDT");
      expect(btcCandles).toBeDefined();
      expect(btcCandles!.length).toBe(1);
      expect(btcCandles![0].timestamp).toBe(startDate + 60 * 60 * 1000);
    });
  });

  describe("simulateTrade", () => {
    it("should apply correct slippage for POST_ONLY orders", () => {
      // Arrange
      const signal: SignalData = {
        symbol: "BTCUSDT",
        direction: "LONG",
        hologramStatus: "A+",
        alignmentScore: 85,
        rsScore: 0.03,
        sessionType: "LONDON",
        poiType: "ORDER_BLOCK",
        cvdConfirmation: true,
        confidence: 90,
        entryPrice: 50000,
        stopLoss: 49250,
        takeProfit: 52250,
        positionSize: 0.1,
        leverage: 3,
        timestamp: Date.now(),
      };

      const currentPrice = 50000;

      // Act
      const result = backtestEngine.simulateTrade(
        signal,
        "POST_ONLY",
        currentPrice,
      );

      // Assert
      expect(result.filled).toBe(true);
      expect(result.fillPrice).toBeGreaterThan(currentPrice); // Long order should have positive slippage
      expect(result.slippage).toBeGreaterThan(0);
      expect(result.slippage).toBe(currentPrice * 0.001); // 0.1% slippage
    });

    it("should apply correct slippage for IOC orders", () => {
      // Arrange
      const signal: SignalData = {
        symbol: "BTCUSDT",
        direction: "SHORT",
        hologramStatus: "B",
        alignmentScore: 70,
        rsScore: -0.02,
        sessionType: "NY",
        poiType: "FVG",
        cvdConfirmation: true,
        confidence: 75,
        entryPrice: 50000,
        stopLoss: 50750,
        takeProfit: 47750,
        positionSize: 0.1,
        leverage: 3,
        timestamp: Date.now(),
      };

      const currentPrice = 50000;

      // Act
      const result = backtestEngine.simulateTrade(signal, "IOC", currentPrice);

      // Assert
      expect(result.filled).toBe(true);
      expect(result.fillPrice).toBeLessThan(currentPrice); // Short order should have negative slippage
      expect(result.slippage).toBeGreaterThan(0);
      expect(result.slippage).toBe(currentPrice * 0.002); // 0.2% slippage
    });

    it("should apply correct slippage for MARKET orders", () => {
      // Arrange
      const signal: SignalData = {
        symbol: "BTCUSDT",
        direction: "LONG",
        hologramStatus: "A+",
        alignmentScore: 85,
        rsScore: 0.03,
        sessionType: "LONDON",
        poiType: "ORDER_BLOCK",
        cvdConfirmation: true,
        confidence: 90,
        entryPrice: 50000,
        stopLoss: 49250,
        takeProfit: 52250,
        positionSize: 0.1,
        leverage: 3,
        timestamp: Date.now(),
      };

      const currentPrice = 50000;

      // Act
      const result = backtestEngine.simulateTrade(
        signal,
        "MARKET",
        currentPrice,
      );

      // Assert
      expect(result.filled).toBe(true);
      expect(result.fillPrice).toBeGreaterThan(currentPrice); // Long order should have positive slippage
      expect(result.slippage).toBeGreaterThan(0);
      expect(result.slippage).toBe(currentPrice * 0.003); // 0.3% slippage
    });

    it("should handle POST_ONLY orders that do not fill", () => {
      // Arrange
      const signal: SignalData = {
        symbol: "BTCUSDT",
        direction: "LONG",
        hologramStatus: "A+",
        alignmentScore: 85,
        rsScore: 0.03,
        sessionType: "LONDON",
        poiType: "ORDER_BLOCK",
        cvdConfirmation: true,
        confidence: 90,
        entryPrice: 50000,
        stopLoss: 49250,
        takeProfit: 52250,
        positionSize: 0.1,
        leverage: 3,
        timestamp: Date.now(),
      };

      const currentPrice = 50000;

      // Mock Math.random to return a value that triggers no fill
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.05); // 5% < 10% threshold

      // Act
      const result = backtestEngine.simulateTrade(
        signal,
        "POST_ONLY",
        currentPrice,
      );

      // Assert
      expect(result.filled).toBe(false);
      expect(result.fillPrice).toBe(0);
      expect(result.slippage).toBe(0);

      // Restore Math.random
      Math.random = originalRandom;
    });
  });

  describe("applyFees", () => {
    it("should apply maker rebate for POST_ONLY orders", () => {
      // Arrange
      const notionalValue = 10000; // $10,000 position
      const orderType = "POST_ONLY";

      // Act
      const fees = backtestEngine.applyFees(notionalValue, orderType);

      // Assert
      expect(fees).toBe(notionalValue * -0.0001); // -0.01% rebate
      expect(fees).toBeLessThan(0); // Should be negative (rebate)
    });

    it("should apply taker fee for IOC orders", () => {
      // Arrange
      const notionalValue = 10000; // $10,000 position
      const orderType = "IOC";

      // Act
      const fees = backtestEngine.applyFees(notionalValue, orderType);

      // Assert
      expect(fees).toBe(notionalValue * 0.0005); // 0.05% fee
      expect(fees).toBeGreaterThan(0); // Should be positive (fee)
    });

    it("should apply taker fee for MARKET orders", () => {
      // Arrange
      const notionalValue = 5000; // $5,000 position
      const orderType = "MARKET";

      // Act
      const fees = backtestEngine.applyFees(notionalValue, orderType);

      // Assert
      expect(fees).toBe(notionalValue * 0.0005); // 0.05% fee
      expect(fees).toBeGreaterThan(0); // Should be positive (fee)
    });
  });

  describe("calcBacktestResults", () => {
    it("should calculate correct metrics for profitable trades", () => {
      // Arrange
      const config: BacktestConfig = {
        startDate: Date.now() - (30 * 24 * 60 * 60 * 1000),
        endDate: Date.now(),
        symbols: ["BTCUSDT"],
        initialEquity: 10000,
        riskPerTrade: 0.02,
        maxLeverage: 3,
        maxConcurrentPositions: 3,
        slippageModel: {
          postOnlySlippage: 0.001,
          iocSlippage: 0.002,
          marketSlippage: 0.003,
        },
        feeModel: { makerFee: -0.0001, takerFee: 0.0005 },
        timeframe: "15m",
      };

      const trades = [
        {
          id: "trade1",
          symbol: "BTCUSDT",
          direction: "LONG" as const,
          entryTime: Date.now() - 1000000,
          exitTime: Date.now() - 500000,
          entryPrice: 50000,
          exitPrice: 52000,
          quantity: 0.1,
          leverage: 3,
          pnl: 600, // 4% gain * 3x leverage * $5000 position = $600
          pnlPercent: 0.12, // 12%
          fees: -1, // Maker rebate
          slippage: 5,
          holdTime: 500000,
          exitReason: "TAKE_PROFIT" as const,
          signal: {} as SignalData,
          rValue: 3,
        },
        {
          id: "trade2",
          symbol: "BTCUSDT",
          direction: "SHORT" as const,
          entryTime: Date.now() - 800000,
          exitTime: Date.now() - 300000,
          entryPrice: 51000,
          exitPrice: 50000,
          quantity: 0.1,
          leverage: 3,
          pnl: 300, // 2% gain * 3x leverage * $5100 position = $306
          pnlPercent: 0.06, // 6%
          fees: 2.5, // Taker fee
          slippage: 10,
          holdTime: 500000,
          exitReason: "TAKE_PROFIT" as const,
          signal: {} as SignalData,
          rValue: 1.5,
        },
      ];

      // Act
      const metrics = backtestEngine.calcBacktestResults(trades, config);

      // Assert
      expect(metrics.totalTrades).toBe(2);
      expect(metrics.winRate).toBe(1.0); // 100% win rate
      expect(metrics.totalReturn).toBeCloseTo(0.09); // 9% total return
      expect(metrics.profitFactor).toBeGreaterThan(1);
      expect(metrics.maxDrawdown).toBe(0); // No losing trades
      expect(metrics.averageWin).toBeCloseTo(450); // Average of 600 and 300
      expect(metrics.averageLoss).toBe(0); // No losing trades
      expect(metrics.totalFees).toBeCloseTo(1.5); // -1 + 2.5
      expect(metrics.totalSlippage).toBe(15); // 5 + 10
    });

    it("should calculate correct metrics for mixed trades", () => {
      // Arrange
      const config: BacktestConfig = {
        startDate: Date.now() - (30 * 24 * 60 * 60 * 1000),
        endDate: Date.now(),
        symbols: ["BTCUSDT"],
        initialEquity: 10000,
        riskPerTrade: 0.02,
        maxLeverage: 3,
        maxConcurrentPositions: 3,
        slippageModel: {
          postOnlySlippage: 0.001,
          iocSlippage: 0.002,
          marketSlippage: 0.003,
        },
        feeModel: { makerFee: -0.0001, takerFee: 0.0005 },
        timeframe: "15m",
      };

      const trades = [
        {
          id: "trade1",
          symbol: "BTCUSDT",
          direction: "LONG" as const,
          entryTime: Date.now() - 1000000,
          exitTime: Date.now() - 500000,
          entryPrice: 50000,
          exitPrice: 52000,
          quantity: 0.1,
          leverage: 3,
          pnl: 600,
          pnlPercent: 0.12,
          fees: -1,
          slippage: 5,
          holdTime: 500000,
          exitReason: "TAKE_PROFIT" as const,
          signal: {} as SignalData,
          rValue: 3,
        },
        {
          id: "trade2",
          symbol: "BTCUSDT",
          direction: "LONG" as const,
          entryTime: Date.now() - 800000,
          exitTime: Date.now() - 300000,
          entryPrice: 51000,
          exitPrice: 49500,
          quantity: 0.1,
          leverage: 3,
          pnl: -450, // Loss
          pnlPercent: -0.09,
          fees: 2.5,
          slippage: 10,
          holdTime: 500000,
          exitReason: "STOP_LOSS" as const,
          signal: {} as SignalData,
          rValue: -1.5,
        },
      ];

      // Act
      const metrics = backtestEngine.calcBacktestResults(trades, config);

      // Assert
      expect(metrics.totalTrades).toBe(2);
      expect(metrics.winRate).toBe(0.5); // 50% win rate
      expect(metrics.totalReturn).toBeCloseTo(0.015); // 1.5% total return
      expect(metrics.profitFactor).toBeCloseTo(600 / 450); // Gross profit / gross loss
      expect(metrics.averageWin).toBe(600);
      expect(metrics.averageLoss).toBe(-450);
      expect(metrics.largestWin).toBe(600);
      expect(metrics.largestLoss).toBe(-450);
    });

    it("should handle empty trade list", () => {
      // Arrange
      const config: BacktestConfig = {
        startDate: Date.now() - (30 * 24 * 60 * 60 * 1000),
        endDate: Date.now(),
        symbols: ["BTCUSDT"],
        initialEquity: 10000,
        riskPerTrade: 0.02,
        maxLeverage: 3,
        maxConcurrentPositions: 3,
        slippageModel: {
          postOnlySlippage: 0.001,
          iocSlippage: 0.002,
          marketSlippage: 0.003,
        },
        feeModel: { makerFee: -0.0001, takerFee: 0.0005 },
        timeframe: "15m",
      };

      const trades: any[] = [];

      // Act
      const metrics = backtestEngine.calcBacktestResults(trades, config);

      // Assert
      expect(metrics.totalTrades).toBe(0);
      expect(metrics.winRate).toBe(0);
      expect(metrics.totalReturn).toBe(0);
      expect(metrics.profitFactor).toBe(0);
      expect(metrics.maxDrawdown).toBe(0);
      expect(metrics.finalEquity).toBe(config.initialEquity);
    });
  });

  describe("generateEquityCurve", () => {
    it("should generate correct equity curve points", () => {
      // Arrange
      const initialEquity = 10000;
      const trades = [
        {
          id: "trade1",
          symbol: "BTCUSDT",
          direction: "LONG" as const,
          entryTime: 1000,
          exitTime: 2000,
          entryPrice: 50000,
          exitPrice: 52000,
          quantity: 0.1,
          leverage: 3,
          pnl: 600,
          pnlPercent: 0.12,
          fees: -1,
          slippage: 5,
          holdTime: 1000,
          exitReason: "TAKE_PROFIT" as const,
          signal: {} as SignalData,
          rValue: 3,
        },
        {
          id: "trade2",
          symbol: "BTCUSDT",
          direction: "LONG" as const,
          entryTime: 3000,
          exitTime: 4000,
          entryPrice: 51000,
          exitPrice: 49500,
          quantity: 0.1,
          leverage: 3,
          pnl: -300,
          pnlPercent: -0.06,
          fees: 2.5,
          slippage: 10,
          holdTime: 1000,
          exitReason: "STOP_LOSS" as const,
          signal: {} as SignalData,
          rValue: -1,
        },
      ];

      // Act
      const equityCurve = backtestEngine.generateEquityCurve(
        trades,
        initialEquity,
      );

      // Assert
      expect(equityCurve.length).toBe(5); // Start + 2 entries + 2 exits
      expect(equityCurve[0].equity).toBe(initialEquity);
      expect(equityCurve[0].openPositions).toBe(0);
      expect(equityCurve[1].timestamp).toBe(1000); // First entry
      expect(equityCurve[1].openPositions).toBe(1);
      expect(equityCurve[2].timestamp).toBe(2000); // First exit
      expect(equityCurve[2].equity).toBe(initialEquity + 600); // After first trade
      expect(equityCurve[2].openPositions).toBe(0);
      expect(equityCurve[4].equity).toBe(initialEquity + 600 - 300); // After second trade
    });

    it("should calculate drawdown correctly", () => {
      // Arrange
      const initialEquity = 10000;
      const trades = [
        {
          id: "trade1",
          symbol: "BTCUSDT",
          direction: "LONG" as const,
          entryTime: 1000,
          exitTime: 2000,
          entryPrice: 50000,
          exitPrice: 49000,
          quantity: 0.1,
          leverage: 3,
          pnl: -600, // Loss
          pnlPercent: -0.06,
          fees: 2.5,
          slippage: 10,
          holdTime: 1000,
          exitReason: "STOP_LOSS" as const,
          signal: {} as SignalData,
          rValue: -2,
        },
      ];

      // Act
      const equityCurve = backtestEngine.generateEquityCurve(
        trades,
        initialEquity,
      );

      // Assert
      const finalPoint = equityCurve[equityCurve.length - 1];
      expect(finalPoint.equity).toBe(initialEquity - 600);
      expect(finalPoint.drawdown).toBeCloseTo(0.06); // 6% drawdown
    });
  });

  describe("configuration management", () => {
    it("should update configuration correctly", () => {
      // Arrange
      const newConfig = {
        initialEquity: 20000,
        maxLeverage: 5,
        riskPerTrade: 0.03,
      };

      // Act
      backtestEngine.updateConfig(newConfig);
      const updatedConfig = backtestEngine.getConfig();

      // Assert
      expect(updatedConfig.initialEquity).toBe(20000);
      expect(updatedConfig.maxLeverage).toBe(5);
      expect(updatedConfig.riskPerTrade).toBe(0.03);
      expect(updatedConfig.symbols).toEqual(["BTCUSDT", "ETHUSDT"]); // Should preserve other values
    });

    it("should return current configuration", () => {
      // Act
      const config = backtestEngine.getConfig();

      // Assert
      expect(config).toBeDefined();
      expect(config.initialEquity).toBe(10000);
      expect(config.maxLeverage).toBe(3);
      expect(config.riskPerTrade).toBe(0.02);
      expect(config.symbols).toEqual(["BTCUSDT", "ETHUSDT"]);
    });

    it("should track running state correctly", () => {
      // Act & Assert
      expect(backtestEngine.isBacktestRunning()).toBe(false);

      // Note: Testing the running state during actual backtest execution
      // would require more complex async testing setup
    });
  });
});
