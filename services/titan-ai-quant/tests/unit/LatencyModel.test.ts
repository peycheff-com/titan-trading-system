/**
 * Unit tests for LatencyModel (Bulgaria Tax)
 * 
 * Tests the latency penalty and slippage model for simulated executions.
 * Requirements: 3.6
 */

import { LatencyModel } from '../../src/simulation/LatencyModel';
import { OHLCV } from '../../src/types';

describe('LatencyModel', () => {
  let latencyModel: LatencyModel;

  beforeEach(() => {
    latencyModel = new LatencyModel(200); // 200ms default latency
  });

  describe('constructor', () => {
    it('should create with default 200ms latency', () => {
      const model = new LatencyModel();
      expect(model.getBaseLatency()).toBe(200);
    });

    it('should create with custom latency', () => {
      const model = new LatencyModel(500);
      expect(model.getBaseLatency()).toBe(500);
    });
  });

  describe('getBaseLatency / setBaseLatency', () => {
    it('should get and set latency', () => {
      expect(latencyModel.getBaseLatency()).toBe(200);
      latencyModel.setBaseLatency(300);
      expect(latencyModel.getBaseLatency()).toBe(300);
    });

    it('should throw error for negative latency', () => {
      expect(() => latencyModel.setBaseLatency(-100)).toThrow('Latency cannot be negative');
    });

    it('should allow zero latency', () => {
      latencyModel.setBaseLatency(0);
      expect(latencyModel.getBaseLatency()).toBe(0);
    });
  });

  describe('interpolatePrice', () => {
    const marketData: OHLCV[] = [
      { timestamp: 1000, open: 100, high: 105, low: 98, close: 102, volume: 1000 },
      { timestamp: 2000, open: 102, high: 108, low: 101, close: 106, volume: 1200 },
      { timestamp: 3000, open: 106, high: 110, low: 104, close: 108, volume: 1100 },
    ];

    it('should return null for empty market data', () => {
      expect(latencyModel.interpolatePrice([], 1500)).toBeNull();
    });

    it('should return first open for timestamp before all data', () => {
      expect(latencyModel.interpolatePrice(marketData, 500)).toBe(100);
    });

    it('should return last close for timestamp after all data', () => {
      expect(latencyModel.interpolatePrice(marketData, 4000)).toBe(108);
    });

    it('should return open for exact timestamp match', () => {
      expect(latencyModel.interpolatePrice(marketData, 1000)).toBe(100);
      expect(latencyModel.interpolatePrice(marketData, 2000)).toBe(102);
    });

    it('should interpolate between candles', () => {
      // Timestamp 1500 is halfway between 1000 and 2000
      // Should interpolate between close of first (102) and open of second (102)
      const price = latencyModel.interpolatePrice(marketData, 1500);
      expect(price).toBe(102); // Both are 102, so result is 102
    });

    it('should handle unsorted data', () => {
      const unsortedData: OHLCV[] = [
        { timestamp: 3000, open: 106, high: 110, low: 104, close: 108, volume: 1100 },
        { timestamp: 1000, open: 100, high: 105, low: 98, close: 102, volume: 1000 },
        { timestamp: 2000, open: 102, high: 108, low: 101, close: 106, volume: 1200 },
      ];
      // Should still work correctly
      expect(latencyModel.interpolatePrice(unsortedData, 1000)).toBe(100);
    });

    it('should interpolate linearly between different prices', () => {
      const data: OHLCV[] = [
        { timestamp: 1000, open: 100, high: 105, low: 98, close: 100, volume: 1000 },
        { timestamp: 2000, open: 110, high: 115, low: 108, close: 112, volume: 1200 },
      ];
      // Timestamp 1500 is halfway, should interpolate between 100 (close) and 110 (open)
      const price = latencyModel.interpolatePrice(data, 1500);
      expect(price).toBe(105); // (100 + 110) / 2
    });
  });

  describe('calculateSlippage', () => {
    it('should return 0 for zero ATR', () => {
      expect(latencyModel.calculateSlippage(1000, 0, 1)).toBe(0);
    });

    it('should return 0 for zero order size', () => {
      expect(latencyModel.calculateSlippage(0, 10, 1)).toBe(0);
    });

    it('should return 0 for negative ATR', () => {
      expect(latencyModel.calculateSlippage(1000, -10, 1)).toBe(0);
    });

    it('should calculate base slippage as 10% of ATR', () => {
      // Normal liquidity (1), $1000 order (size multiplier = 1)
      const slippage = latencyModel.calculateSlippage(1000, 10, 1);
      // Base: 10 * 0.1 = 1, liquidity: 1x, size: 1x
      expect(slippage).toBe(1);
    });

    it('should double slippage for low liquidity', () => {
      const normalSlippage = latencyModel.calculateSlippage(1000, 10, 1);
      const lowLiqSlippage = latencyModel.calculateSlippage(1000, 10, 0);
      expect(lowLiqSlippage).toBe(normalSlippage * 2);
    });

    it('should halve slippage for high liquidity', () => {
      const normalSlippage = latencyModel.calculateSlippage(1000, 10, 1);
      const highLiqSlippage = latencyModel.calculateSlippage(1000, 10, 2);
      expect(highLiqSlippage).toBe(normalSlippage * 0.5);
    });

    it('should increase slippage for larger orders', () => {
      const smallOrderSlippage = latencyModel.calculateSlippage(1000, 10, 1);
      const largeOrderSlippage = latencyModel.calculateSlippage(10000, 10, 1);
      expect(largeOrderSlippage).toBeGreaterThan(smallOrderSlippage);
    });

    it('should handle unknown liquidity state as normal', () => {
      const normalSlippage = latencyModel.calculateSlippage(1000, 10, 1);
      const unknownSlippage = latencyModel.calculateSlippage(1000, 10, 99);
      expect(unknownSlippage).toBe(normalSlippage);
    });
  });

  describe('applyLatencyPenalty', () => {
    const marketData: OHLCV[] = [
      { timestamp: 1000, open: 100, high: 105, low: 98, close: 102, volume: 1000 },
      { timestamp: 1200, open: 102, high: 108, low: 101, close: 106, volume: 1200 },
      { timestamp: 1400, open: 106, high: 110, low: 104, close: 108, volume: 1100 },
    ];

    it('should return ideal entry for empty market data', () => {
      expect(latencyModel.applyLatencyPenalty(100, [], 1000)).toBe(100);
    });

    it('should apply latency penalty to find delayed price', () => {
      // Signal at 1000, with 200ms latency, should find price at 1200
      const adjustedPrice = latencyModel.applyLatencyPenalty(100, marketData, 1000);
      // At timestamp 1200, the open price is 102
      expect(adjustedPrice).toBe(102);
    });

    it('should return last close when delayed timestamp exceeds data', () => {
      // Signal at 1300, with 200ms latency = 1500, which is after all data
      const adjustedPrice = latencyModel.applyLatencyPenalty(100, marketData, 1300);
      expect(adjustedPrice).toBe(108); // Last close
    });

    it('should interpolate when delayed timestamp falls between candles', () => {
      // Use 100ms latency for this test
      latencyModel.setBaseLatency(100);
      // Signal at 1000, with 100ms latency = 1100, between 1000 and 1200
      const adjustedPrice = latencyModel.applyLatencyPenalty(100, marketData, 1000);
      // Should interpolate between close of 1000 (102) and open of 1200 (102)
      expect(adjustedPrice).toBe(102);
    });

    it('should work with zero latency', () => {
      latencyModel.setBaseLatency(0);
      const adjustedPrice = latencyModel.applyLatencyPenalty(100, marketData, 1000);
      // With zero latency, should return price at exact timestamp
      expect(adjustedPrice).toBe(100); // Open at 1000
    });
  });
});
