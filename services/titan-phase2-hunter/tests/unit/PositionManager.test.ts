/**
 * Unit tests for PositionManager
 * Tests position management functionality including breakeven, partial profits, trailing stops
 */

import { PositionManager, PositionManagerConfig } from '../../src/risk/PositionManager';
import { BybitPerpsClient } from '../../src/exchanges/BybitPerpsClient';
import { Position } from '../../src/types';

// Mock BybitPerpsClient
jest.mock('../../src/exchanges/BybitPerpsClient');

describe('PositionManager', () => {
  let positionManager: PositionManager;
  let mockBybitClient: jest.Mocked<BybitPerpsClient>;
  let mockPosition: Position;

  beforeEach(() => {
    // Create mock client
    mockBybitClient = new BybitPerpsClient('test-key', 'test-secret') as jest.Mocked<BybitPerpsClient>;
    
    // Mock client methods
    mockBybitClient.setStopLoss = jest.fn().mockResolvedValue(true);
    mockBybitClient.placeOrderWithRetry = jest.fn().mockResolvedValue({
      orderId: 'test-order-id',
      symbol: 'BTCUSDT',
      side: 'Sell',
      qty: 0.5,
      price: 52000,
      status: 'FILLED',
      timestamp: Date.now()
    });
    mockBybitClient.getCurrentPrice = jest.fn().mockResolvedValue(51000);

    // Create position manager with test config
    const config: Partial<PositionManagerConfig> = {
      breakevenRLevel: 1.5,
      partialProfitRLevel: 2.0,
      partialProfitPercentage: 50,
      trailingStopDistance: 1.0,
      tightenAfterHours: 48,
      tightenedStopDistance: 0.5
    };

    positionManager = new PositionManager(mockBybitClient, config);

    // Create mock position
    mockPosition = {
      id: 'test-position-1',
      symbol: 'BTCUSDT',
      side: 'LONG',
      entryPrice: 50000,
      currentPrice: 51000,
      quantity: 1.0,
      leverage: 5,
      stopLoss: 49250, // 1.5% stop
      takeProfit: 52250, // 4.5% target (3:1 R:R)
      unrealizedPnL: 1000,
      realizedPnL: 0,
      entryTime: Date.now() - (24 * 60 * 60 * 1000), // 24 hours ago
      status: 'OPEN',
      rValue: 1.33, // (1000 / 750) = 1.33R
      atr: 500 // $500 ATR
    };
  });

  afterEach(() => {
    positionManager.destroy();
    jest.clearAllMocks();
  });

  describe('Position Management', () => {
    test('should add and retrieve positions', () => {
      positionManager.addPosition(mockPosition);
      
      const retrievedPosition = positionManager.getPosition(mockPosition.id);
      expect(retrievedPosition).toEqual(mockPosition);
      
      const allPositions = positionManager.getPositions();
      expect(allPositions).toHaveLength(1);
      expect(allPositions[0]).toEqual(mockPosition);
    });

    test('should remove positions', () => {
      positionManager.addPosition(mockPosition);
      expect(positionManager.getPositions()).toHaveLength(1);
      
      positionManager.removePosition(mockPosition.id);
      expect(positionManager.getPositions()).toHaveLength(0);
      expect(positionManager.getPosition(mockPosition.id)).toBeUndefined();
    });

    test('should update position data', () => {
      positionManager.addPosition(mockPosition);
      
      const update = {
        id: mockPosition.id,
        currentPrice: 52000,
        unrealizedPnL: 2000,
        timestamp: Date.now()
      };
      
      positionManager.updatePosition(update);
      
      const updatedPosition = positionManager.getPosition(mockPosition.id);
      expect(updatedPosition?.currentPrice).toBe(52000);
      expect(updatedPosition?.unrealizedPnL).toBe(2000);
      expect(updatedPosition?.rValue).toBeCloseTo(2.67, 1); // 2000 / 750 = 2.67R
    });
  });

  describe('Move Stop to Breakeven', () => {
    test('should move stop to breakeven at 1.5R profit', async () => {
      // Set position to 1.5R profit
      mockPosition.rValue = 1.5;
      mockPosition.unrealizedPnL = 1125; // 1.5 * 750 = 1125
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.moveStopToBreakeven(mockPosition);
      
      expect(result).toBe(true);
      expect(mockBybitClient.setStopLoss).toHaveBeenCalledWith('BTCUSDT', 50000);
      
      const updatedPosition = positionManager.getPosition(mockPosition.id);
      expect(updatedPosition?.stopLoss).toBe(50000); // Entry price
    });

    test('should not move stop to breakeven if not profitable enough', async () => {
      // Set position to 1.0R profit (below 1.5R threshold)
      mockPosition.rValue = 1.0;
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.moveStopToBreakeven(mockPosition);
      
      expect(result).toBe(false);
      expect(mockBybitClient.setStopLoss).not.toHaveBeenCalled();
    });

    test('should not move stop if already at breakeven', async () => {
      // Set stop already at entry price
      mockPosition.stopLoss = mockPosition.entryPrice;
      mockPosition.rValue = 2.0;
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.moveStopToBreakeven(mockPosition);
      
      expect(result).toBe(true);
      expect(mockBybitClient.setStopLoss).not.toHaveBeenCalled();
    });
  });

  describe('Take Partial Profit', () => {
    test('should take partial profit at 2R profit', async () => {
      // Set position to 2R profit
      mockPosition.rValue = 2.0;
      mockPosition.unrealizedPnL = 1500; // 2 * 750 = 1500
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.takePartialProfit(mockPosition);
      
      expect(result).toBe(true);
      expect(mockBybitClient.placeOrderWithRetry).toHaveBeenCalledWith({
        phase: 'phase2',
        symbol: 'BTCUSDT',
        side: 'Sell',
        type: 'MARKET',
        qty: 0.5, // 50% of 1.0
        leverage: 5
      });
      
      const updatedPosition = positionManager.getPosition(mockPosition.id);
      expect(updatedPosition?.quantity).toBe(0.5); // Reduced by 50%
    });

    test('should not take partial profit if not profitable enough', async () => {
      // Set position to 1.5R profit (below 2R threshold)
      mockPosition.rValue = 1.5;
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.takePartialProfit(mockPosition);
      
      expect(result).toBe(false);
      expect(mockBybitClient.placeOrderWithRetry).not.toHaveBeenCalled();
    });
  });

  describe('Trailing Stop', () => {
    test('should update trailing stop for profitable long position', async () => {
      // Set profitable long position
      mockPosition.rValue = 1.0;
      mockPosition.currentPrice = 51000;
      mockPosition.stopLoss = 49250; // Original stop
      mockPosition.atr = 500;
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.updateTrailingStop(mockPosition);
      
      const expectedNewStop = 51000 - (500 * 1.0); // 50500
      expect(result).toBe(true);
      expect(mockBybitClient.setStopLoss).toHaveBeenCalledWith('BTCUSDT', expectedNewStop);
    });

    test('should update trailing stop for profitable short position', async () => {
      // Set profitable short position
      mockPosition.side = 'SHORT';
      mockPosition.rValue = 1.0;
      mockPosition.currentPrice = 49000;
      mockPosition.stopLoss = 50750; // Original stop
      mockPosition.atr = 500;
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.updateTrailingStop(mockPosition);
      
      const expectedNewStop = 49000 + (500 * 1.0); // 49500
      expect(result).toBe(true);
      expect(mockBybitClient.setStopLoss).toHaveBeenCalledWith('BTCUSDT', expectedNewStop);
    });

    test('should not trail stop if not profitable', async () => {
      // Set unprofitable position
      mockPosition.rValue = -0.5;
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.updateTrailingStop(mockPosition);
      
      expect(result).toBe(false);
      expect(mockBybitClient.setStopLoss).not.toHaveBeenCalled();
    });

    test('should not trail stop if new stop is worse than current', async () => {
      // Set position where trailing would make stop worse
      mockPosition.rValue = 1.0;
      mockPosition.currentPrice = 50500; // Close to entry
      mockPosition.stopLoss = 50000; // Better than what trailing would set (50500 - 500 = 50000)
      mockPosition.atr = 500;
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.updateTrailingStop(mockPosition);
      
      expect(result).toBe(false);
      expect(mockBybitClient.setStopLoss).not.toHaveBeenCalled();
    });
  });

  describe('Tighten Stop After 48h', () => {
    test('should tighten stop after 48 hours', async () => {
      // Set position older than 48 hours
      mockPosition.entryTime = Date.now() - (50 * 60 * 60 * 1000); // 50 hours ago
      mockPosition.currentPrice = 51000;
      mockPosition.stopLoss = 49250; // Original stop
      mockPosition.atr = 500;
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.tightenStopAfter48h(mockPosition);
      
      const expectedNewStop = 51000 - (500 * 0.5); // 50750 (0.5 ATR)
      expect(result).toBe(true);
      expect(mockBybitClient.setStopLoss).toHaveBeenCalledWith('BTCUSDT', expectedNewStop);
    });

    test('should not tighten stop if position is too young', async () => {
      // Set position younger than 48 hours
      mockPosition.entryTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
      
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.tightenStopAfter48h(mockPosition);
      
      expect(result).toBe(false);
      expect(mockBybitClient.setStopLoss).not.toHaveBeenCalled();
    });
  });

  describe('Close Position', () => {
    test('should close position for stop hit', async () => {
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.closePosition(mockPosition, 'STOP_HIT');
      
      expect(result).toBe(true);
      expect(mockBybitClient.placeOrderWithRetry).toHaveBeenCalledWith({
        phase: 'phase2',
        symbol: 'BTCUSDT',
        side: 'Sell',
        type: 'MARKET',
        qty: 1.0,
        leverage: 5
      });
      
      // Position should be removed from management
      expect(positionManager.getPosition(mockPosition.id)).toBeUndefined();
    });

    test('should close position for target hit', async () => {
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.closePosition(mockPosition, 'TARGET_HIT');
      
      expect(result).toBe(true);
      expect(mockBybitClient.placeOrderWithRetry).toHaveBeenCalledWith({
        phase: 'phase2',
        symbol: 'BTCUSDT',
        side: 'Sell',
        type: 'MARKET',
        qty: 1.0,
        leverage: 5
      });
    });

    test('should close short position correctly', async () => {
      mockPosition.side = 'SHORT';
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.closePosition(mockPosition, 'MANUAL');
      
      expect(result).toBe(true);
      expect(mockBybitClient.placeOrderWithRetry).toHaveBeenCalledWith({
        phase: 'phase2',
        symbol: 'BTCUSDT',
        side: 'Buy', // Opposite side for short
        type: 'MARKET',
        qty: 1.0,
        leverage: 5
      });
    });
  });

  describe('Statistics', () => {
    test('should calculate position statistics', () => {
      const position1 = { ...mockPosition, id: 'pos1', unrealizedPnL: 1000, realizedPnL: 500, rValue: 1.5 };
      const position2 = { ...mockPosition, id: 'pos2', unrealizedPnL: -500, realizedPnL: 200, rValue: -0.5 };
      
      positionManager.addPosition(position1);
      positionManager.addPosition(position2);
      
      const stats = positionManager.getStatistics();
      
      expect(stats.totalPositions).toBe(2);
      expect(stats.openPositions).toBe(2);
      expect(stats.totalUnrealizedPnL).toBe(500); // 1000 + (-500)
      expect(stats.totalRealizedPnL).toBe(700); // 500 + 200
      expect(stats.averageRValue).toBe(0.5); // (1.5 + (-0.5)) / 2
    });
  });

  describe('Emergency Close', () => {
    test('should emergency close all positions', async () => {
      const position1 = { ...mockPosition, id: 'pos1' };
      const position2 = { ...mockPosition, id: 'pos2' };
      
      positionManager.addPosition(position1);
      positionManager.addPosition(position2);
      
      const result = await positionManager.emergencyCloseAll();
      
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockBybitClient.placeOrderWithRetry).toHaveBeenCalledTimes(2);
      expect(positionManager.getPositions()).toHaveLength(0);
    });
  });

  describe('Configuration', () => {
    test('should update configuration', () => {
      const newConfig = {
        breakevenRLevel: 2.0,
        partialProfitRLevel: 3.0
      };
      
      positionManager.updateConfig(newConfig);
      
      // Test that new config is applied (indirectly through behavior)
      mockPosition.rValue = 1.8; // Between old (1.5) and new (2.0) breakeven level
      positionManager.addPosition(mockPosition);
      
      // Should not move to breakeven with new config
      expect(positionManager.moveStopToBreakeven(mockPosition)).resolves.toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      mockBybitClient.setStopLoss.mockRejectedValue(new Error('API Error'));
      
      mockPosition.rValue = 1.5;
      positionManager.addPosition(mockPosition);
      
      const result = await positionManager.moveStopToBreakeven(mockPosition);
      
      expect(result).toBe(false);
      // Position should still be in management
      expect(positionManager.getPosition(mockPosition.id)).toBeDefined();
    });

    test('should emit error events', (done) => {
      mockBybitClient.setStopLoss.mockRejectedValue(new Error('Test Error'));
      
      positionManager.on('position:error', (position, error) => {
        expect(position.id).toBe(mockPosition.id);
        expect(error.message).toBe('Test Error');
        done();
      });
      
      mockPosition.rValue = 1.5;
      positionManager.addPosition(mockPosition);
      positionManager.moveStopToBreakeven(mockPosition);
    });
  });
});