/**
 * Backtester Unit Tests
 * 
 * Tests the core backtesting functionality including:
 * - Historical data processing
 * - Trade simulation with market impact
 * - Performance metrics calculation
 * - Validation report generation
 */

import { Backtester, InMemoryDataCache } from '../../src/simulation/Backtester';
import { LatencyModel } from '../../src/simulation/LatencyModel';
import { Trade, OHLCV, RegimeSnapshot, Config } from '../../src/types';

describe('Backtester', () => {
  let backtester: Backtester;
  let cache: InMemoryDataCache;
  let latencyModel: LatencyModel;

  beforeEach(() => {
    cache = new InMemoryDataCache();
    latencyModel = new LatencyModel(100); // 100ms latency for testing
    backtester = new Backtester(cache, latencyModel);
  });

  describe('loadHistoricalData', () => {
    it('should load OHLCV and regime data for multiple symbols', async () => {
      // Setup test data
      const ohlcvData: OHLCV[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
        { timestamp: 2000, open: 102, high: 108, low: 100, close: 106, volume: 1200 },
      ];
      const regimeData: RegimeSnapshot[] = [
        {
          timestamp: 1000,
          symbol: 'BTCUSDT',
          trendState: 1,
          volState: 1,
          liquidityState: 1,
          regimeState: 1,
        },
      ];

      cache.setOHLCV('BTCUSDT', ohlcvData);
      cache.setRegimeSnapshots('BTCUSDT', regimeData);

      const result = await backtester.loadHistoricalData(['BTCUSDT'], 500, 2500);

      expect(result.ohlcvData.get('BTCUSDT')).toEqual(ohlcvData);
      expect(result.regimeData.get('BTCUSDT')).toEqual(regimeData);
    });

    it('should handle missing data gracefully', async () => {
      const result = await backtester.loadHistoricalData(['NONEXISTENT'], 1000, 2000);

      expect(result.ohlcvData.get('NONEXISTENT')).toEqual([]);
      expect(result.regimeData.get('NONEXISTENT')).toEqual([]);
    });
  });

  describe('processTradesWithMarketImpact', () => {
    it('should apply latency and slippage to trades', async () => {
      const trades: Trade[] = [
        {
          id: 'test1',
          timestamp: 1000,
          symbol: 'BTCUSDT',
          trapType: 'oi_wipeout',
          side: 'long',
          entryPrice: 100,
          exitPrice: 105,
          quantity: 1,
          leverage: 10,
          pnl: 50,
          pnlPercent: 5,
          duration: 60000,
          slippage: 0.1,
          fees: 0.06,
          exitReason: 'take_profit',
        },
      ];

      const ohlcvData: OHLCV[] = [
        { timestamp: 1000, open: 100, high: 105, low: 95, close: 102, volume: 1000 },
        { timestamp: 1100, open: 102, high: 108, low: 100, close: 106, volume: 1200 },
      ];

      const regimeData: RegimeSnapshot[] = [
        {
          timestamp: 1000,
          symbol: 'BTCUSDT',
          trendState: 1,
          volState: 1,
          liquidityState: 1,
          regimeState: 1,
        },
      ];

      const config: Config = {
        traps: {
          oi_wipeout: {
            enabled: true,
            stop_loss: 0.02,
            take_profit: 0.05,
            risk_per_trade: 0.01,
            max_leverage: 10,
            min_confidence: 0.7,
            cooldown_period: 300,
          },
        },
        risk: {
          max_daily_loss: 0.05,
          max_position_size: 0.5,
          max_open_positions: 3,
          emergency_flatten_threshold: 0.1,
        },
        execution: {
          latency_penalty: 100,
          slippage_model: 'realistic',
          limit_chaser_enabled: true,
          max_fill_time: 1000,
        },
      };

      const result = await backtester.processTradesWithMarketImpact(
        trades,
        ohlcvData,
        regimeData,
        config
      );

      expect(result).toHaveLength(1);
      expect(result[0].originalTrade).toEqual(trades[0]);
      expect(result[0].adjustedEntry).toBeGreaterThan(100); // Should have latency penalty
      expect(result[0].slippage).toBeGreaterThan(0);
    });

    it('should skip disabled traps', async () => {
      const trades: Trade[] = [
        {
          id: 'test1',
          timestamp: 1000,
          symbol: 'BTCUSDT',
          trapType: 'oi_wipeout',
          side: 'long',
          entryPrice: 100,
          exitPrice: 105,
          quantity: 1,
          leverage: 10,
          pnl: 50,
          pnlPercent: 5,
          duration: 60000,
          slippage: 0.1,
          fees: 0.06,
          exitReason: 'take_profit',
        },
      ];

      const config: Config = {
        traps: {
          oi_wipeout: {
            enabled: false, // Disabled trap
            stop_loss: 0.02,
            take_profit: 0.05,
            risk_per_trade: 0.01,
            max_leverage: 10,
            min_confidence: 0.7,
            cooldown_period: 300,
          },
        },
        risk: {
          max_daily_loss: 0.05,
          max_position_size: 0.5,
          max_open_positions: 3,
          emergency_flatten_threshold: 0.1,
        },
        execution: {
          latency_penalty: 100,
          slippage_model: 'realistic',
          limit_chaser_enabled: true,
          max_fill_time: 1000,
        },
      };

      const result = await backtester.processTradesWithMarketImpact(
        trades,
        [],
        [],
        config
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('generatePerformanceMetrics', () => {
    it('should calculate comprehensive performance metrics', () => {
      const simulatedTrades = [
        {
          originalTrade: {} as Trade,
          adjustedEntry: 100,
          exitPrice: 105,
          exitReason: 'take_profit' as const,
          pnl: 50,
          slippage: 0.1,
          duration: 60000,
        },
        {
          originalTrade: {} as Trade,
          adjustedEntry: 110,
          exitPrice: 108,
          exitReason: 'stop_loss' as const,
          pnl: -20,
          slippage: 0.2,
          duration: 30000,
        },
      ];

      const result = backtester.generatePerformanceMetrics(simulatedTrades, 10000, 0.05);

      expect(result.totalTrades).toBe(2);
      expect(result.winningTrades).toBe(1);
      expect(result.losingTrades).toBe(1);
      expect(result.winRate).toBe(0.5);
      expect(result.totalPnL).toBe(30);
      expect(result.avgPnL).toBe(15);
      expect(result.avgSlippage).toBeCloseTo(0.15, 10);
      expect(result.avgDuration).toBe(45000);
      expect(result.profitFactor).toBe(2.5); // 50 / 20
      expect(result.maxConsecutiveLosses).toBe(1);
      expect(result.avgWinningTrade).toBe(50);
      expect(result.avgLosingTrade).toBe(-20);
    });

    it('should handle empty trade array', () => {
      const result = backtester.generatePerformanceMetrics([], 10000, 0.05);

      expect(result.totalTrades).toBe(0);
      expect(result.winRate).toBe(0);
      expect(result.totalPnL).toBe(0);
      expect(result.profitFactor).toBe(0);
    });

    it('should calculate correct consecutive losses', () => {
      const simulatedTrades = [
        { originalTrade: {} as Trade, adjustedEntry: 100, exitPrice: 105, exitReason: 'take_profit' as const, pnl: 50, slippage: 0.1, duration: 60000 },
        { originalTrade: {} as Trade, adjustedEntry: 110, exitPrice: 108, exitReason: 'stop_loss' as const, pnl: -20, slippage: 0.2, duration: 30000 },
        { originalTrade: {} as Trade, adjustedEntry: 108, exitPrice: 106, exitReason: 'stop_loss' as const, pnl: -15, slippage: 0.15, duration: 25000 },
        { originalTrade: {} as Trade, adjustedEntry: 106, exitPrice: 104, exitReason: 'stop_loss' as const, pnl: -10, slippage: 0.1, duration: 20000 },
        { originalTrade: {} as Trade, adjustedEntry: 104, exitPrice: 108, exitReason: 'take_profit' as const, pnl: 40, slippage: 0.05, duration: 45000 },
      ];

      const result = backtester.generatePerformanceMetrics(simulatedTrades, 10000, 0.05);

      expect(result.maxConsecutiveLosses).toBe(3);
    });
  });

  describe('createValidationReport', () => {
    it('should create validation report with approval recommendation', () => {
      const baselineResult = {
        totalTrades: 10,
        winningTrades: 6,
        losingTrades: 4,
        winRate: 0.6,
        totalPnL: 100,
        avgPnL: 10,
        maxDrawdown: 50,
        maxDrawdownPercent: 0.05,
        sharpeRatio: 1.2,
        avgSlippage: 0.1,
        avgDuration: 30000,
        profitFactor: 1.5,
      };

      const proposedResult = {
        totalTrades: 10,
        winningTrades: 7,
        losingTrades: 3,
        winRate: 0.7,
        totalPnL: 150, // Better PnL
        avgPnL: 15,
        maxDrawdown: 45, // Better drawdown
        maxDrawdownPercent: 0.045,
        sharpeRatio: 1.5,
        avgSlippage: 0.1,
        avgDuration: 30000,
        profitFactor: 2.0,
      };

      const backtestPeriod = { start: 1000, end: 2000 };

      const report = backtester.createValidationReport(
        baselineResult,
        proposedResult,
        backtestPeriod
      );

      expect(report.passed).toBe(true);
      expect(['approve', 'review']).toContain(report.recommendation); // Can be either based on confidence
      expect(report.deltas.pnlDelta).toBe(50);
      expect(report.deltas.pnlDeltaPercent).toBe(50);
      expect(report.deltas.drawdownDelta).toBe(-5);
      expect(report.deltas.winRateDelta).toBeCloseTo(0.1, 10);
      expect(report.rejectionReason).toBeUndefined();
    });

    it('should reject when PnL does not improve', () => {
      const baselineResult = {
        totalTrades: 10,
        winningTrades: 6,
        losingTrades: 4,
        winRate: 0.6,
        totalPnL: 100,
        avgPnL: 10,
        maxDrawdown: 50,
        maxDrawdownPercent: 0.05,
        sharpeRatio: 1.2,
        avgSlippage: 0.1,
        avgDuration: 30000,
        profitFactor: 1.5,
      };

      const proposedResult = {
        ...baselineResult,
        totalPnL: 90, // Worse PnL
      };

      const backtestPeriod = { start: 1000, end: 2000 };

      const report = backtester.createValidationReport(
        baselineResult,
        proposedResult,
        backtestPeriod
      );

      expect(report.passed).toBe(false);
      expect(report.recommendation).toBe('reject');
      expect(report.rejectionReason).toContain('New PnL');
    });

    it('should reject when drawdown increases by more than 10%', () => {
      const baselineResult = {
        totalTrades: 10,
        winningTrades: 6,
        losingTrades: 4,
        winRate: 0.6,
        totalPnL: 100,
        avgPnL: 10,
        maxDrawdown: 50,
        maxDrawdownPercent: 0.05,
        sharpeRatio: 1.2,
        avgSlippage: 0.1,
        avgDuration: 30000,
        profitFactor: 1.5,
      };

      const proposedResult = {
        ...baselineResult,
        totalPnL: 120, // Better PnL
        maxDrawdown: 60, // 20% worse drawdown (exceeds 10% threshold)
      };

      const backtestPeriod = { start: 1000, end: 2000 };

      const report = backtester.createValidationReport(
        baselineResult,
        proposedResult,
        backtestPeriod
      );

      expect(report.passed).toBe(false);
      expect(report.recommendation).toBe('reject');
      expect(report.rejectionReason).toContain('drawdown');
    });
  });

  describe('replay', () => {
    it('should handle empty trades array', async () => {
      const result = await backtester.replay([], {} as Config, [], []);

      expect(result.totalTrades).toBe(0);
      expect(result.warnings).toEqual([]);
      expect(result.skippedTrades).toBe(0);
    });

    it('should skip trades outside time range', async () => {
      const trades: Trade[] = [
        {
          id: 'test1',
          timestamp: 500, // Before start time
          symbol: 'BTCUSDT',
          trapType: 'oi_wipeout',
          side: 'long',
          entryPrice: 100,
          exitPrice: 105,
          quantity: 1,
          leverage: 10,
          pnl: 50,
          pnlPercent: 5,
          duration: 60000,
          slippage: 0.1,
          fees: 0.06,
          exitReason: 'take_profit',
        },
        {
          id: 'test2',
          timestamp: 2500, // After end time
          symbol: 'BTCUSDT',
          trapType: 'oi_wipeout',
          side: 'long',
          entryPrice: 100,
          exitPrice: 105,
          quantity: 1,
          leverage: 10,
          pnl: 50,
          pnlPercent: 5,
          duration: 60000,
          slippage: 0.1,
          fees: 0.06,
          exitReason: 'take_profit',
        },
      ];

      const config: Config = {
        traps: {
          oi_wipeout: {
            enabled: true,
            stop_loss: 0.02,
            take_profit: 0.05,
            risk_per_trade: 0.01,
            max_leverage: 10,
            min_confidence: 0.7,
            cooldown_period: 300,
          },
        },
        risk: {
          max_daily_loss: 0.05,
          max_position_size: 0.5,
          max_open_positions: 3,
          emergency_flatten_threshold: 0.1,
        },
        execution: {
          latency_penalty: 100,
          slippage_model: 'realistic',
          limit_chaser_enabled: true,
          max_fill_time: 1000,
        },
      };

      const result = await backtester.replay(
        trades,
        config,
        [],
        [],
        { startTime: 1000, endTime: 2000 }
      );

      expect(result.totalTrades).toBe(0);
    });

    it('should add warnings for missing data', async () => {
      const trades: Trade[] = [
        {
          id: 'test1',
          timestamp: 1000,
          symbol: 'BTCUSDT',
          trapType: 'oi_wipeout',
          side: 'long',
          entryPrice: 100,
          exitPrice: 105,
          quantity: 1,
          leverage: 10,
          pnl: 50,
          pnlPercent: 5,
          duration: 60000,
          slippage: 0.1,
          fees: 0.06,
          exitReason: 'take_profit',
        },
      ];

      const config: Config = {
        traps: {
          oi_wipeout: {
            enabled: true,
            stop_loss: 0.02,
            take_profit: 0.05,
            risk_per_trade: 0.01,
            max_leverage: 10,
            min_confidence: 0.7,
            cooldown_period: 300,
          },
        },
        risk: {
          max_daily_loss: 0.05,
          max_position_size: 0.5,
          max_open_positions: 3,
          emergency_flatten_threshold: 0.1,
        },
        execution: {
          latency_penalty: 100,
          slippage_model: 'realistic',
          limit_chaser_enabled: true,
          max_fill_time: 1000,
        },
      };

      const result = await backtester.replay(
        trades,
        config,
        [], // No OHLCV data
        [], // No regime data
        { skipMissingData: true }
      );

      expect(result.warnings).toHaveLength(2);
      expect(result.warnings[0].code).toBe('MISSING_OHLCV_DATA');
      expect(result.warnings[1].code).toBe('INCOMPLETE_REGIME_DATA');
    });
  });
});