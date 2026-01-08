/**
 * Unit Tests for LimitOrderExecutor
 * 
 * Tests core functionality including:
 * - Position sizing calculation
 * - Stop and target calculation
 * - ATR calculation
 * - Order monitoring logic
 */

import { LimitOrderExecutor } from '../../src/execution/LimitOrderExecutor';
import { BybitPerpsClient } from '../../src/exchanges/BybitPerpsClient';
import { OHLCV, OrderBlock, SignalData } from '../../src/types';

// Mock BybitPerpsClient
jest.mock('../../src/exchanges/BybitPerpsClient');

describe('LimitOrderExecutor', () => {
  let executor: LimitOrderExecutor;
  let mockBybitClient: jest.Mocked<BybitPerpsClient>;

  beforeEach(() => {
    mockBybitClient = new BybitPerpsClient('test-key', 'test-secret') as jest.Mocked<BybitPerpsClient>;
    executor = new LimitOrderExecutor(mockBybitClient);
  });

  afterEach(() => {
    executor.destroy();
  });

  describe('setStopAndTarget', () => {
    it('should calculate correct stop and target for LONG position', () => {
      const entryPrice = 50000;
      const direction = 'LONG';

      const result = executor.setStopAndTarget(entryPrice, direction);

      // 1.5% stop loss below entry
      expect(result.stopLoss).toBeCloseTo(50000 * (1 - 0.015), 2); // 49250
      
      // 4.5% take profit above entry
      expect(result.takeProfit).toBeCloseTo(50000 * (1 + 0.045), 2); // 52250
      
      // Verify 3:1 risk-reward ratio
      const risk = entryPrice - result.stopLoss;
      const reward = result.takeProfit - entryPrice;
      const riskRewardRatio = reward / risk;
      
      expect(riskRewardRatio).toBeCloseTo(3, 1);
    });

    it('should calculate correct stop and target for SHORT position', () => {
      const entryPrice = 50000;
      const direction = 'SHORT';

      const result = executor.setStopAndTarget(entryPrice, direction);

      // 1.5% stop loss above entry
      expect(result.stopLoss).toBeCloseTo(50000 * (1 + 0.015), 2); // 50750
      
      // 4.5% take profit below entry
      expect(result.takeProfit).toBeCloseTo(50000 * (1 - 0.045), 2); // 47750
      
      // Verify 3:1 risk-reward ratio
      const risk = result.stopLoss - entryPrice;
      const reward = entryPrice - result.takeProfit;
      const riskRewardRatio = reward / risk;
      
      expect(riskRewardRatio).toBeCloseTo(3, 1);
    });
  });

  describe('calcPositionSize', () => {
    beforeEach(() => {
      // Mock OHLCV data for ATR calculation
      const mockCandles: OHLCV[] = [];
      for (let i = 0; i < 20; i++) {
        mockCandles.push({
          timestamp: Date.now() - (i * 3600000), // 1 hour intervals
          open: 50000 + Math.random() * 1000,
          high: 50500 + Math.random() * 1000,
          low: 49500 + Math.random() * 1000,
          close: 50000 + Math.random() * 1000,
          volume: 1000000
        });
      }
      
      mockBybitClient.fetchOHLCV.mockResolvedValue(mockCandles);
    });

    it('should calculate position size based on volatility and risk', async () => {
      const symbol = 'BTCUSDT';
      const entryPrice = 50000;
      const equity = 10000; // $10,000 equity
      const leverage = 3;

      const positionSize = await executor.calcPositionSize(symbol, entryPrice, equity, leverage);

      expect(positionSize).toBeGreaterThan(0);
      expect(positionSize).toBeGreaterThan(0.001); // Minimum position size
      expect(mockBybitClient.fetchOHLCV).toHaveBeenCalledWith(symbol, '1h', 24);
    });

    it('should handle insufficient candle data', async () => {
      const symbol = 'BTCUSDT';
      const entryPrice = 50000;
      const equity = 10000;
      const leverage = 3;

      // Mock insufficient data
      mockBybitClient.fetchOHLCV.mockResolvedValue([]);

      await expect(executor.calcPositionSize(symbol, entryPrice, equity, leverage))
        .rejects.toThrow('Insufficient candle data for ATR calculation');
    });
  });

  describe('cancelIfPriceMoves', () => {
    it('should cancel order when price moves > 0.2%', async () => {
      const orderId = 'test-order-123';
      const symbol = 'BTCUSDT';
      const entryPrice = 50000;
      const orderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 50100,
        low: 49900,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 90
      };

      // Start monitoring the order
      executor['startOrderMonitoring'](orderId, symbol, entryPrice, orderBlock);

      // Mock successful cancellation
      mockBybitClient.cancelOrder.mockResolvedValue(true);

      // Price moves 0.3% away (should trigger cancellation)
      const currentPrice = 50150; // 0.3% above entry
      const result = await executor.cancelIfPriceMoves(orderId, currentPrice);

      expect(result).toBe(true);
      expect(mockBybitClient.cancelOrder).toHaveBeenCalledWith(orderId, symbol);
    });

    it('should not cancel order when price moves < 0.2%', async () => {
      const orderId = 'test-order-123';
      const symbol = 'BTCUSDT';
      const entryPrice = 50000;
      const orderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 50100,
        low: 49900,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 90
      };

      // Start monitoring the order
      executor['startOrderMonitoring'](orderId, symbol, entryPrice, orderBlock);

      // Price moves 0.1% away (should not trigger cancellation)
      const currentPrice = 50050; // 0.1% above entry
      const result = await executor.cancelIfPriceMoves(orderId, currentPrice);

      expect(result).toBe(false);
      expect(mockBybitClient.cancelOrder).not.toHaveBeenCalled();
    });
  });

  describe('cancelIfLevelFails', () => {
    it('should cancel bullish order when price wicks below OB low > 0.5%', async () => {
      const orderId = 'test-order-123';
      const symbol = 'BTCUSDT';
      const entryPrice = 49900;
      const orderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 50100,
        low: 49900,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 90
      };

      // Start monitoring the order
      executor['startOrderMonitoring'](orderId, symbol, entryPrice, orderBlock);

      // Mock successful cancellation
      mockBybitClient.cancelOrder.mockResolvedValue(true);

      // Current candle wicks 0.6% below OB low
      const currentCandle: OHLCV = {
        timestamp: Date.now(),
        open: 49900,
        high: 50000,
        low: 49600, // 0.6% below OB low (49900)
        close: 49800,
        volume: 1000000
      };

      const result = await executor.cancelIfLevelFails(orderId, currentCandle);

      expect(result).toBe(true);
      expect(mockBybitClient.cancelOrder).toHaveBeenCalledWith(orderId, symbol);
    });

    it('should cancel bearish order when price wicks above OB high > 0.5%', async () => {
      const orderId = 'test-order-123';
      const symbol = 'BTCUSDT';
      const entryPrice = 50100;
      const orderBlock: OrderBlock = {
        type: 'BEARISH',
        high: 50100,
        low: 49900,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 90
      };

      // Start monitoring the order
      executor['startOrderMonitoring'](orderId, symbol, entryPrice, orderBlock);

      // Mock successful cancellation
      mockBybitClient.cancelOrder.mockResolvedValue(true);

      // Current candle wicks 0.6% above OB high
      const currentCandle: OHLCV = {
        timestamp: Date.now(),
        open: 50100,
        high: 50400, // 0.6% above OB high (50100)
        low: 50000,
        close: 50200,
        volume: 1000000
      };

      const result = await executor.cancelIfLevelFails(orderId, currentCandle);

      expect(result).toBe(true);
      expect(mockBybitClient.cancelOrder).toHaveBeenCalledWith(orderId, symbol);
    });

    it('should not cancel order when wick is < 0.5%', async () => {
      const orderId = 'test-order-123';
      const symbol = 'BTCUSDT';
      const entryPrice = 49900;
      const orderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 50100,
        low: 49900,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 90
      };

      // Start monitoring the order
      executor['startOrderMonitoring'](orderId, symbol, entryPrice, orderBlock);

      // Current candle wicks 0.3% below OB low (should not cancel)
      const currentCandle: OHLCV = {
        timestamp: Date.now(),
        open: 49900,
        high: 50000,
        low: 49750, // 0.3% below OB low
        close: 49800,
        volume: 1000000
      };

      const result = await executor.cancelIfLevelFails(orderId, currentCandle);

      expect(result).toBe(false);
      expect(mockBybitClient.cancelOrder).not.toHaveBeenCalled();
    });
  });

  describe('placePostOnlyOrder', () => {
    it('should place Post-Only order at Order Block level', async () => {
      const signal: SignalData = {
        symbol: 'BTCUSDT',
        direction: 'LONG',
        hologramStatus: 'A+',
        alignmentScore: 85,
        rsScore: 0.05,
        sessionType: 'LONDON',
        poiType: 'ORDER_BLOCK',
        cvdConfirmation: true,
        confidence: 90,
        entryPrice: 49900,
        stopLoss: 49250,
        takeProfit: 52250,
        positionSize: 0.1,
        leverage: 3,
        timestamp: Date.now()
      };

      const orderBlock: OrderBlock = {
        type: 'BULLISH',
        high: 50100,
        low: 49900,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 90
      };

      const equity = 10000;

      // Mock successful order placement
      mockBybitClient.placeOrderWithRetry.mockResolvedValue({
        orderId: 'test-order-123',
        symbol: 'BTCUSDT',
        side: 'Buy',
        qty: 0.1,
        price: 49900,
        status: 'NEW',
        timestamp: Date.now()
      });

      // Mock OHLCV data for position sizing
      const mockCandles: OHLCV[] = [];
      for (let i = 0; i < 20; i++) {
        mockCandles.push({
          timestamp: Date.now() - (i * 3600000),
          open: 50000,
          high: 50500,
          low: 49500,
          close: 50000,
          volume: 1000000
        });
      }
      mockBybitClient.fetchOHLCV.mockResolvedValue(mockCandles);

      const result = await executor.placePostOnlyOrder(signal, orderBlock, equity);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('test-order-123');
      expect(mockBybitClient.placeOrderWithRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'phase2',
          symbol: 'BTCUSDT',
          side: 'Buy',
          type: 'POST_ONLY',
          price: 49900, // Order Block low for LONG
          leverage: 3
        }),
        2 // maxRetries
      );
    });

    it('should place SHORT order at Order Block high', async () => {
      const signal: SignalData = {
        symbol: 'BTCUSDT',
        direction: 'SHORT',
        hologramStatus: 'A+',
        alignmentScore: 85,
        rsScore: -0.05,
        sessionType: 'NY',
        poiType: 'ORDER_BLOCK',
        cvdConfirmation: true,
        confidence: 90,
        entryPrice: 50100,
        stopLoss: 50750,
        takeProfit: 47750,
        positionSize: 0.1,
        leverage: 3,
        timestamp: Date.now()
      };

      const orderBlock: OrderBlock = {
        type: 'BEARISH',
        high: 50100,
        low: 49900,
        barIndex: 100,
        timestamp: Date.now(),
        mitigated: false,
        confidence: 90
      };

      const equity = 10000;

      // Mock successful order placement
      mockBybitClient.placeOrderWithRetry.mockResolvedValue({
        orderId: 'test-order-456',
        symbol: 'BTCUSDT',
        side: 'Sell',
        qty: 0.1,
        price: 50100,
        status: 'NEW',
        timestamp: Date.now()
      });

      // Mock OHLCV data for position sizing
      const mockCandles: OHLCV[] = [];
      for (let i = 0; i < 20; i++) {
        mockCandles.push({
          timestamp: Date.now() - (i * 3600000),
          open: 50000,
          high: 50500,
          low: 49500,
          close: 50000,
          volume: 1000000
        });
      }
      mockBybitClient.fetchOHLCV.mockResolvedValue(mockCandles);

      const result = await executor.placePostOnlyOrder(signal, orderBlock, equity);

      expect(result.success).toBe(true);
      expect(result.orderId).toBe('test-order-456');
      expect(mockBybitClient.placeOrderWithRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 'phase2',
          symbol: 'BTCUSDT',
          side: 'Sell',
          type: 'POST_ONLY',
          price: 50100, // Order Block high for SHORT
          leverage: 3
        }),
        2 // maxRetries
      );
    });
  });

  describe('ATR calculation', () => {
    it('should calculate ATR correctly', () => {
      // Create test candles with known True Range values
      const candles: OHLCV[] = [
        { timestamp: 1, open: 100, high: 110, low: 95, close: 105, volume: 1000 },
        { timestamp: 2, open: 105, high: 115, low: 100, close: 110, volume: 1000 }, // TR = max(15, 10, 5) = 15
        { timestamp: 3, open: 110, high: 120, low: 105, close: 115, volume: 1000 }, // TR = max(15, 10, 5) = 15
        { timestamp: 4, open: 115, high: 125, low: 110, close: 120, volume: 1000 }, // TR = max(15, 10, 5) = 15
      ];

      // Use private method via bracket notation
      const atr = executor['calculateATR'](candles, 3);

      // ATR should be average of last 3 True Ranges = (15 + 15 + 15) / 3 = 15
      expect(atr).toBe(15);
    });

    it('should throw error for insufficient data', () => {
      const candles: OHLCV[] = [
        { timestamp: 1, open: 100, high: 110, low: 95, close: 105, volume: 1000 }
      ];

      expect(() => {
        executor['calculateATR'](candles, 14);
      }).toThrow('Insufficient data for ATR calculation');
    });
  });
});