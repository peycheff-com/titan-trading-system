/**
 * ZScoreDrift Unit Tests
 * 
 * Tests for Z-Score Drift Monitor with Drawdown Velocity Check
 * Requirements: 27.1-27.8
 */

import { jest } from '@jest/globals';
import { ZScoreDrift } from './ZScoreDrift.js';

// Mock ShadowState
const createMockShadowState = () => ({
  closeAllPositions: jest.fn(() => [
    { symbol: 'BTCUSDT', pnl: -100, close_reason: 'FLASH_CRASH_PROTECTION' },
  ]),
  getPosition: jest.fn(),
  getAllPositions: jest.fn(() => new Map()),
});

// Mock BrokerGateway
const createMockBrokerGateway = () => ({
  closeAllPositions: jest.fn(() => Promise.resolve()),
  getPositions: jest.fn(() => Promise.resolve([])),
});

// Mock logger
const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

describe('ZScoreDrift', () => {
  let zScoreDrift;
  let mockShadowState;
  let mockBrokerGateway;
  let mockLogger;
  let mockGetEquity;
  let mockGetPriceForSymbol;
  let mockSendAlert;

  beforeEach(() => {
    mockShadowState = createMockShadowState();
    mockBrokerGateway = createMockBrokerGateway();
    mockLogger = createMockLogger();
    mockGetEquity = jest.fn(() => Promise.resolve(10000));
    mockGetPriceForSymbol = jest.fn(() => 50000);
    mockSendAlert = jest.fn(() => Promise.resolve());

    zScoreDrift = new ZScoreDrift({
      shadowState: mockShadowState,
      brokerGateway: mockBrokerGateway,
      logger: mockLogger,
      windowSize: 30,
      zScoreThreshold: -2.0,
      backtestParams: {
        expected_mean: 100,
        expected_stddev: 50,
      },
      drawdownThresholdPct: 2.0,
      drawdownTimeWindowMs: 300000, // 5 minutes
      equityCheckIntervalMs: 10000,
      getEquity: mockGetEquity,
      getPriceForSymbol: mockGetPriceForSymbol,
      sendAlert: mockSendAlert,
    });
  });

  afterEach(() => {
    zScoreDrift.stop();
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    test('should throw error if shadowState is not provided', () => {
      expect(() => new ZScoreDrift({})).toThrow('shadowState is required');
    });

    test('should initialize with default values', () => {
      const drift = new ZScoreDrift({ shadowState: mockShadowState });
      expect(drift.windowSize).toBe(30);
      expect(drift.zScoreThreshold).toBe(-2.0);
      expect(drift.drawdownThresholdPct).toBe(2.0);
      expect(drift.drawdownTimeWindowMs).toBe(300000);
      drift.stop();
    });

    test('should accept custom configuration', () => {
      expect(zScoreDrift.windowSize).toBe(30);
      expect(zScoreDrift.zScoreThreshold).toBe(-2.0);
      expect(zScoreDrift.backtestParams.expected_mean).toBe(100);
      expect(zScoreDrift.backtestParams.expected_stddev).toBe(50);
    });
  });

  describe('Start/Stop Monitoring', () => {
    test('should start monitoring', () => {
      zScoreDrift.start();
      expect(zScoreDrift.isMonitoring()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          window_size: 30,
          z_score_threshold: -2.0,
        }),
        'ZScoreDrift monitoring started'
      );
    });

    test('should stop monitoring', () => {
      zScoreDrift.start();
      zScoreDrift.stop();
      expect(zScoreDrift.isMonitoring()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith({}, 'ZScoreDrift monitoring stopped');
    });

    test('should warn if already monitoring', () => {
      zScoreDrift.start();
      zScoreDrift.start();
      expect(mockLogger.warn).toHaveBeenCalledWith({}, 'ZScoreDrift monitoring already running');
    });
  });

  describe('Record Trade - Requirement 27.1', () => {
    test('should add PnL to rolling window', () => {
      zScoreDrift.recordTrade(50);
      expect(zScoreDrift.getRecentPnL()).toEqual([50]);
    });

    test('should maintain rolling window of 30 trades', () => {
      // Add 35 trades
      for (let i = 1; i <= 35; i++) {
        zScoreDrift.recordTrade(i);
      }
      
      const recentPnL = zScoreDrift.getRecentPnL();
      expect(recentPnL.length).toBe(30);
      // Should have trades 6-35 (oldest 5 removed)
      expect(recentPnL[0]).toBe(6);
      expect(recentPnL[29]).toBe(35);
    });

    test('should log trade recording', () => {
      zScoreDrift.recordTrade(100);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          pnl: 100,
          window_size: 1,
        }),
        'Trade PnL recorded'
      );
    });
  });

  describe('Z-Score Calculation - Requirement 27.2', () => {
    test('should return insufficient data for less than 5 trades', () => {
      const result = zScoreDrift.recordTrade(50);
      expect(result.reason).toBe('INSUFFICIENT_DATA');
      expect(result.triggered).toBe(false);
    });

    test('should calculate Z-Score correctly', () => {
      // Add 10 trades with mean of 50
      // Expected mean: 100, Expected stddev: 50
      // Z-Score = (50 - 100) / 50 = -1.0
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(50);
      }
      
      expect(zScoreDrift.getCurrentZScore()).toBeCloseTo(-1.0, 2);
    });

    test('should handle zero stddev gracefully', () => {
      const drift = new ZScoreDrift({
        shadowState: mockShadowState,
        logger: mockLogger,
        backtestParams: {
          expected_mean: 100,
          expected_stddev: 0,
        },
      });
      
      for (let i = 0; i < 10; i++) {
        drift.recordTrade(50);
      }
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        {},
        'Expected stddev is zero, cannot calculate Z-Score'
      );
      drift.stop();
    });
  });

  describe('Safety Stop - Requirement 27.3, 27.4, 27.5', () => {
    test('should trigger safety stop when Z-Score < -2.0', async () => {
      const safetyStopHandler = jest.fn();
      zScoreDrift.on('safety_stop', safetyStopHandler);
      
      // Add trades with very negative PnL to trigger Z < -2.0
      // Expected mean: 100, Expected stddev: 50
      // Need mean < 100 - 2*50 = 0 to trigger
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(-100);
      }
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(zScoreDrift.isSafetyStop()).toBe(true);
      expect(zScoreDrift.isAutoExecutionEnabled()).toBe(false);
      expect(safetyStopHandler).toHaveBeenCalled();
    });

    test('should log detailed diagnostics on safety stop', async () => {
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(-100);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          recent_pnl: expect.any(Array),
          expected_mean: 100,
          expected_stddev: 50,
          z_score: expect.any(Number),
          trigger_reason: 'Z_SCORE_BELOW_THRESHOLD',
        }),
        'SAFETY_STOP - Z-Score drift detected, auto-execution disabled'
      );
    });

    test('should send alert on safety stop', async () => {
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(-100);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockSendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'SAFETY_STOP',
          title: 'Titan Z-Score Drift Safety Stop',
        })
      );
    });

    test('should not trigger safety stop multiple times', async () => {
      const safetyStopHandler = jest.fn();
      zScoreDrift.on('safety_stop', safetyStopHandler);
      
      // Trigger safety stop
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(-100);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Add more negative trades
      for (let i = 0; i < 5; i++) {
        zScoreDrift.recordTrade(-200);
      }
      
      // Should only have been called once
      expect(safetyStopHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Drawdown Velocity - Requirement 27.7, 27.8', () => {
    test('should trigger hard kill when equity drops > 2% in < 5 minutes', async () => {
      const hardKillHandler = jest.fn();
      zScoreDrift.on('hard_kill', hardKillHandler);
      
      // Simulate equity drop by setting up getEquity to return decreasing values
      // First call returns peak, subsequent calls return dropped value
      const now = Date.now();
      zScoreDrift.addEquitySnapshot(10000, now - 60000); // 1 minute ago at peak
      
      // Now getEquity returns the dropped value
      mockGetEquity.mockResolvedValue(9700); // 3% drop
      
      await zScoreDrift.forceDrawdownCheck();
      
      expect(zScoreDrift.isHardKill()).toBe(true);
      expect(zScoreDrift.isAutoExecutionEnabled()).toBe(false);
      expect(hardKillHandler).toHaveBeenCalled();
    });

    test('should close all positions on hard kill', async () => {
      const now = Date.now();
      zScoreDrift.addEquitySnapshot(10000, now - 60000);
      mockGetEquity.mockResolvedValue(9700);
      
      await zScoreDrift.forceDrawdownCheck();
      
      expect(mockShadowState.closeAllPositions).toHaveBeenCalledWith(
        mockGetPriceForSymbol,
        'FLASH_CRASH_PROTECTION'
      );
      expect(mockBrokerGateway.closeAllPositions).toHaveBeenCalled();
    });

    test('should log FLASH_CRASH_PROTECTION on hard kill', async () => {
      const now = Date.now();
      zScoreDrift.addEquitySnapshot(10000, now - 60000);
      mockGetEquity.mockResolvedValue(9700);
      
      await zScoreDrift.forceDrawdownCheck();
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_reason: 'FLASH_CRASH_PROTECTION',
          equity_change_pct: expect.any(Number),
          positions_closed: expect.any(Number),
        }),
        'HARD_KILL - Drawdown velocity exceeded threshold, all positions closed'
      );
    });

    test('should send alert on hard kill', async () => {
      const now = Date.now();
      zScoreDrift.addEquitySnapshot(10000, now - 60000);
      mockGetEquity.mockResolvedValue(9700);
      
      await zScoreDrift.forceDrawdownCheck();
      
      expect(mockSendAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'HARD_KILL',
          title: 'Titan Flash Crash Protection - HARD KILL',
        })
      );
    });

    test('should not trigger hard kill if drawdown is within threshold', async () => {
      const hardKillHandler = jest.fn();
      zScoreDrift.on('hard_kill', hardKillHandler);
      
      const now = Date.now();
      zScoreDrift.addEquitySnapshot(10000, now - 60000);
      mockGetEquity.mockResolvedValue(9900); // Only 1% drop
      
      await zScoreDrift.forceDrawdownCheck();
      
      expect(zScoreDrift.isHardKill()).toBe(false);
      expect(hardKillHandler).not.toHaveBeenCalled();
    });

    test('should not trigger hard kill if time window exceeded', async () => {
      const hardKillHandler = jest.fn();
      zScoreDrift.on('hard_kill', hardKillHandler);
      
      const now = Date.now();
      // Peak was 10 minutes ago (outside 5 minute window)
      zScoreDrift.addEquitySnapshot(10000, now - 600000);
      mockGetEquity.mockResolvedValue(9700);
      
      await zScoreDrift.forceDrawdownCheck();
      
      // The old snapshot should be filtered out, so no hard kill
      expect(zScoreDrift.isHardKill()).toBe(false);
    });
  });

  describe('Manual Reset - Requirement 27.6', () => {
    test('should reset after safety stop', async () => {
      // Trigger safety stop
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(-100);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(zScoreDrift.isSafetyStop()).toBe(true);
      
      // Reset
      const result = zScoreDrift.reset();
      
      expect(result).toBe(true);
      expect(zScoreDrift.isSafetyStop()).toBe(false);
      expect(zScoreDrift.isAutoExecutionEnabled()).toBe(true);
      expect(zScoreDrift.getRecentPnL()).toEqual([]);
    });

    test('should reset after hard kill', async () => {
      const now = Date.now();
      zScoreDrift.addEquitySnapshot(10000, now - 60000);
      mockGetEquity.mockResolvedValue(9700);
      
      await zScoreDrift.forceDrawdownCheck();
      expect(zScoreDrift.isHardKill()).toBe(true);
      
      // Reset
      const result = zScoreDrift.reset();
      
      expect(result).toBe(true);
      expect(zScoreDrift.isHardKill()).toBe(false);
      expect(zScoreDrift.isAutoExecutionEnabled()).toBe(true);
    });

    test('should accept new backtest params on reset', async () => {
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(-100);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const newParams = { expected_mean: 200, expected_stddev: 100 };
      zScoreDrift.reset(newParams);
      
      expect(zScoreDrift.backtestParams).toEqual(newParams);
    });

    test('should return false if not in safety stop or hard kill state', () => {
      const result = zScoreDrift.reset();
      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        {},
        'Reset called but not in safety stop or hard kill state'
      );
    });

    test('should emit reset event', async () => {
      const resetHandler = jest.fn();
      zScoreDrift.on('reset', resetHandler);
      
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(-100);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      zScoreDrift.reset();
      
      expect(resetHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(String),
          backtest_params: expect.any(Object),
        })
      );
    });
  });

  describe('Status Methods', () => {
    test('should return correct status', () => {
      zScoreDrift.recordTrade(50);
      zScoreDrift.recordTrade(60);
      
      const status = zScoreDrift.getStatus();
      
      expect(status).toEqual(expect.objectContaining({
        z_score: expect.any(Number),
        recent_pnl_count: 2,
        recent_pnl_mean: 55,
        expected_mean: 100,
        expected_stddev: 50,
        is_safety_stop: false,
        is_hard_kill: false,
        auto_execution_enabled: true,
        is_monitoring: false,
        timestamp: expect.any(String),
      }));
    });

    test('should return drawdown velocity status', () => {
      const now = Date.now();
      zScoreDrift.addEquitySnapshot(10000, now - 60000);
      zScoreDrift.addEquitySnapshot(9900, now);
      
      const status = zScoreDrift.getDrawdownVelocityStatus();
      
      expect(status).toEqual(expect.objectContaining({
        equity_change_pct: expect.any(Number),
        peak_equity: 10000,
        current_equity: 9900,
        time_window_ms: expect.any(Number),
        is_hard_kill: false,
      }));
    });

    test('should return null for drawdown status with insufficient data', () => {
      const status = zScoreDrift.getDrawdownVelocityStatus();
      expect(status).toBeNull();
    });
  });

  describe('Backtest Params', () => {
    test('should update backtest params', () => {
      const newParams = { expected_mean: 150, expected_stddev: 75 };
      zScoreDrift.setBacktestParams(newParams);
      
      expect(zScoreDrift.backtestParams).toEqual(newParams);
      expect(mockLogger.info).toHaveBeenCalledWith(
        { backtest_params: newParams },
        'Backtest parameters updated'
      );
    });
  });

  describe('Edge Cases', () => {
    test('should handle broker gateway failure during hard kill', async () => {
      mockBrokerGateway.closeAllPositions.mockRejectedValue(new Error('Broker error'));
      
      const now = Date.now();
      zScoreDrift.addEquitySnapshot(10000, now - 60000);
      mockGetEquity.mockResolvedValue(9700);
      
      await zScoreDrift.forceDrawdownCheck();
      
      // Should still complete hard kill despite broker error
      expect(zScoreDrift.isHardKill()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: 'Broker error' },
        'Failed to close broker positions during hard kill'
      );
    });

    test('should handle alert failure gracefully', async () => {
      mockSendAlert.mockRejectedValue(new Error('Alert error'));
      
      for (let i = 0; i < 10; i++) {
        zScoreDrift.recordTrade(-100);
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should still be in safety stop despite alert failure
      expect(zScoreDrift.isSafetyStop()).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: 'Alert error' },
        'Failed to send safety stop alert'
      );
    });

    test('should handle null equity gracefully', async () => {
      mockGetEquity.mockResolvedValue(null);
      
      await zScoreDrift.forceDrawdownCheck();
      
      // Should not crash or trigger hard kill
      expect(zScoreDrift.isHardKill()).toBe(false);
    });

    test('should skip drawdown check if already in hard kill', async () => {
      // First trigger hard kill
      const now = Date.now();
      zScoreDrift.addEquitySnapshot(10000, now - 60000);
      mockGetEquity.mockResolvedValue(9700);
      await zScoreDrift.forceDrawdownCheck();
      
      expect(zScoreDrift.isHardKill()).toBe(true);
      
      // Clear mocks
      mockShadowState.closeAllPositions.mockClear();
      
      // Try to trigger again with even lower equity
      mockGetEquity.mockResolvedValue(9400);
      await zScoreDrift.forceDrawdownCheck();
      
      // Should not close positions again
      expect(mockShadowState.closeAllPositions).not.toHaveBeenCalled();
    });
  });
});
