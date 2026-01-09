/**
 * Unit Tests for Statistical Engine
 * 
 * Tests CircularBuffer, RollingStatistics, BasisCalculator, and SignalGenerator
 */

import { 
  CircularBuffer, 
  RollingStatistics, 
  BasisCalculator, 
  SignalGenerator 
} from '../../src/engine/StatEngine';
import type { OrderBook } from '../../src/types/statistics';

describe('CircularBuffer', () => {
  describe('basic operations', () => {
    it('should add items and retrieve them', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.add(1);
      buffer.add(2);
      buffer.add(3);
      
      expect(buffer.getAll()).toEqual([1, 2, 3]);
      expect(buffer.getCount()).toBe(3);
      expect(buffer.isFull()).toBe(false);
    });

    it('should wrap around when full', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.add(1);
      buffer.add(2);
      buffer.add(3);
      buffer.add(4);
      
      expect(buffer.getAll()).toEqual([2, 3, 4]);
      expect(buffer.isFull()).toBe(true);
    });

    it('should clear the buffer', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.add(1);
      buffer.add(2);
      buffer.clear();
      
      expect(buffer.getAll()).toEqual([]);
      expect(buffer.getCount()).toBe(0);
    });
  });
});

describe('RollingStatistics', () => {
  describe('mean calculation', () => {
    it('should calculate correct mean', () => {
      const stats = new RollingStatistics({ windowSize: 10, minSamples: 2 });
      stats.add(10);
      stats.add(20);
      stats.add(30);
      
      expect(stats.getMean()).toBe(20);
    });

    it('should return 0 for empty buffer', () => {
      const stats = new RollingStatistics({ windowSize: 10, minSamples: 2 });
      expect(stats.getMean()).toBe(0);
    });
  });

  describe('standard deviation calculation', () => {
    it('should calculate correct standard deviation', () => {
      const stats = new RollingStatistics({ windowSize: 10, minSamples: 2 });
      stats.add(2);
      stats.add(4);
      stats.add(4);
      stats.add(4);
      stats.add(5);
      stats.add(5);
      stats.add(7);
      stats.add(9);
      
      // Mean = 5, StdDev ≈ 2.138
      expect(stats.getStdDev()).toBeCloseTo(2.138, 2);
    });

    it('should return 0 for single value', () => {
      const stats = new RollingStatistics({ windowSize: 10, minSamples: 1 });
      stats.add(5);
      expect(stats.getStdDev()).toBe(0);
    });
  });

  describe('Z-Score calculation', () => {
    it('should calculate correct Z-Score', () => {
      const stats = new RollingStatistics({ windowSize: 10, minSamples: 2 });
      // Add values with mean=50, stdDev=10
      [40, 45, 50, 55, 60].forEach(v => stats.add(v));
      
      const zScore = stats.getZScore(70);
      // Z = (70 - 50) / stdDev
      expect(zScore).toBeGreaterThan(2);
    });

    it('should return 0 when stdDev is 0', () => {
      const stats = new RollingStatistics({ windowSize: 10, minSamples: 2 });
      stats.add(5);
      stats.add(5);
      stats.add(5);
      
      expect(stats.getZScore(10)).toBe(0);
    });
  });

  describe('percentile calculation', () => {
    it('should calculate correct percentile', () => {
      const stats = new RollingStatistics({ windowSize: 10, minSamples: 2 });
      [10, 20, 30, 40, 50].forEach(v => stats.add(v));
      
      expect(stats.getPercentile(25)).toBe(40); // 2 values below 25 out of 5
      expect(stats.getPercentile(5)).toBe(0);   // 0 values below 5
      expect(stats.getPercentile(55)).toBe(100); // All values below 55
    });
  });
});

describe('BasisCalculator', () => {
  let calculator: BasisCalculator;

  beforeEach(() => {
    calculator = new BasisCalculator();
  });

  describe('simple basis calculation', () => {
    it('should calculate positive basis (contango)', () => {
      const basis = calculator.calculateBasis(50000, 50500);
      expect(basis).toBeCloseTo(0.01, 4); // 1%
    });

    it('should calculate negative basis (backwardation)', () => {
      const basis = calculator.calculateBasis(50000, 49500);
      expect(basis).toBeCloseTo(-0.01, 4); // -1%
    });

    it('should return 0 for zero spot price', () => {
      const basis = calculator.calculateBasis(0, 50000);
      expect(basis).toBe(0);
    });
  });

  describe('depth-weighted basis calculation', () => {
    it('should calculate basis using order book depth', () => {
      const spotOrderBook: OrderBook = {
        bids: [[49900, 1], [49800, 2]],
        asks: [[50100, 1], [50200, 2]],
        timestamp: Date.now(),
      };
      
      const perpOrderBook: OrderBook = {
        bids: [[50500, 1], [50400, 2]],
        asks: [[50600, 1], [50700, 2]],
        timestamp: Date.now(),
      };

      const basis = calculator.calculateDepthWeightedBasis(
        spotOrderBook,
        perpOrderBook,
        0.5
      );
      
      // Should be positive (perp > spot)
      expect(basis).toBeGreaterThan(0);
    });
  });

  describe('impact cost calculation', () => {
    it('should calculate execution impact cost', () => {
      const orderBook: OrderBook = {
        bids: [[49900, 1], [49800, 2]],
        asks: [[50100, 0.5], [50200, 1], [50300, 2]],
        timestamp: Date.now(),
      };

      const impactCost = calculator.calculateImpactCost(orderBook, 1);
      
      // Impact should be positive (buying pushes price up)
      expect(impactCost).toBeGreaterThan(0);
    });
  });
});

describe('SignalGenerator', () => {
  let generator: SignalGenerator;

  beforeEach(() => {
    generator = new SignalGenerator({
      expandZScore: 2.0,
      contractZScore: 0.0,
      vacuumBasis: -0.005,
      minConfidence: 0.5,
    });
  });

  describe('signal generation', () => {
    it('should return HOLD when not enough samples', () => {
      generator.updateBasis('BTCUSDT', 0.01);
      const signal = generator.getSignal('BTCUSDT');
      
      expect(signal.action).toBe('HOLD');
      expect(signal.symbol).toBe('BTCUSDT');
    });

    it('should generate EXPAND signal for high Z-Score', () => {
      // Add baseline values
      for (let i = 0; i < 20; i++) {
        generator.updateBasis('BTCUSDT', 0.005);
      }
      // Add high value
      generator.updateBasis('BTCUSDT', 0.02);
      
      const signal = generator.getSignal('BTCUSDT');
      expect(signal.zScore).toBeGreaterThan(2);
      expect(signal.action).toBe('EXPAND');
    });

    it('should generate CONTRACT signal for low Z-Score', () => {
      // Add baseline values with higher mean
      for (let i = 0; i < 20; i++) {
        generator.updateBasis('BTCUSDT', 0.01);
      }
      // Add low value
      generator.updateBasis('BTCUSDT', 0.001);
      
      const signal = generator.getSignal('BTCUSDT');
      expect(signal.zScore).toBeLessThan(0);
      expect(signal.action).toBe('CONTRACT');
    });
  });

  describe('shouldExpand and shouldContract', () => {
    it('should return true for shouldExpand when conditions met', () => {
      for (let i = 0; i < 20; i++) {
        generator.updateBasis('BTCUSDT', 0.005);
      }
      generator.updateBasis('BTCUSDT', 0.025);
      
      expect(generator.shouldExpand('BTCUSDT')).toBe(true);
      expect(generator.shouldContract('BTCUSDT')).toBe(false);
    });
  });

  describe('basis stats', () => {
    it('should return null for unknown symbol', () => {
      expect(generator.getBasisStats('UNKNOWN')).toBeNull();
    });

    it('should return stats for known symbol', () => {
      generator.updateBasis('BTCUSDT', 0.01);
      generator.updateBasis('BTCUSDT', 0.02);
      
      const stats = generator.getBasisStats('BTCUSDT');
      expect(stats).not.toBeNull();
      expect(stats!.symbol).toBe('BTCUSDT');
      expect(stats!.history.length).toBe(2);
    });
  });

  describe('isolation between symbols', () => {
    it('should maintain separate statistics per symbol', () => {
      // Add different values for different symbols
      for (let i = 0; i < 15; i++) {
        generator.updateBasis('BTCUSDT', 0.01);
        generator.updateBasis('ETHUSDT', 0.02);
      }

      const btcStats = generator.getBasisStats('BTCUSDT');
      const ethStats = generator.getBasisStats('ETHUSDT');

      expect(btcStats!.mean).toBeCloseTo(0.01, 4);
      expect(ethStats!.mean).toBeCloseTo(0.02, 4);
    });
  });
});
