/**
 * Unit Tests for PerformanceTracker
 * 
 * Tests Sharpe ratio calculation, malus/bonus logic, and trade history handling.
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.8
 */

import { PerformanceTracker } from '../../src/engine/PerformanceTracker.js';
import { PerformanceTrackerConfig } from '../../src/types/index.js';
import { defaultConfig } from '../../src/config/defaults.js';

describe('PerformanceTracker', () => {
  let tracker: PerformanceTracker;
  const config: PerformanceTrackerConfig = defaultConfig.performanceTracker;

  beforeEach(() => {
    // Create tracker without database for pure function testing
    tracker = new PerformanceTracker(config);
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      const trackerConfig = tracker.getConfig();
      expect(trackerConfig.windowDays).toBe(7);
      expect(trackerConfig.minTradeCount).toBe(10);
      expect(trackerConfig.malusMultiplier).toBe(0.5);
      expect(trackerConfig.bonusMultiplier).toBe(1.2);
      expect(trackerConfig.malusThreshold).toBe(0);
      expect(trackerConfig.bonusThreshold).toBe(2.0);
    });

    it('should accept custom configuration', () => {
      const customConfig: PerformanceTrackerConfig = {
        windowDays: 14,
        minTradeCount: 20,
        malusMultiplier: 0.3,
        bonusMultiplier: 1.5,
        malusThreshold: -0.5,
        bonusThreshold: 3.0,
      };
      const customTracker = new PerformanceTracker(customConfig);
      const result = customTracker.getConfig();

      expect(result.windowDays).toBe(14);
      expect(result.minTradeCount).toBe(20);
      expect(result.malusMultiplier).toBe(0.3);
      expect(result.bonusMultiplier).toBe(1.5);
    });
  });

  describe('calculateSharpeRatio', () => {
    describe('basic calculations', () => {
      it('should return 0 for empty array', () => {
        const sharpe = tracker.calculateSharpeRatio([]);
        expect(sharpe).toBe(0);
      });

      it('should return 0 for single value', () => {
        const sharpe = tracker.calculateSharpeRatio([100]);
        expect(sharpe).toBe(0);
      });

      it('should calculate positive Sharpe for consistent gains', () => {
        // Consistent positive returns should yield positive Sharpe
        const pnl = [100, 110, 105, 115, 120, 108, 112];
        const sharpe = tracker.calculateSharpeRatio(pnl);
        expect(sharpe).toBeGreaterThan(0);
      });

      it('should calculate negative Sharpe for consistent losses', () => {
        // Consistent negative returns should yield negative Sharpe
        const pnl = [-100, -110, -105, -115, -120, -108, -112];
        const sharpe = tracker.calculateSharpeRatio(pnl);
        expect(sharpe).toBeLessThan(0);
      });

      it('should return high Sharpe for all identical positive values', () => {
        // All same positive values = zero std dev, should return capped positive
        const pnl = [100, 100, 100, 100, 100];
        const sharpe = tracker.calculateSharpeRatio(pnl);
        expect(sharpe).toBe(3.0);
      });

      it('should return low Sharpe for all identical negative values', () => {
        // All same negative values = zero std dev, should return capped negative
        const pnl = [-100, -100, -100, -100, -100];
        const sharpe = tracker.calculateSharpeRatio(pnl);
        expect(sharpe).toBe(-3.0);
      });

      it('should return 0 for all zero values', () => {
        const pnl = [0, 0, 0, 0, 0];
        const sharpe = tracker.calculateSharpeRatio(pnl);
        expect(sharpe).toBe(0);
      });
    });

    describe('known value tests', () => {
      it('should calculate correct Sharpe for known data', () => {
        // Test with known values
        // Mean = 10, StdDev ≈ 7.07, Daily Sharpe ≈ 1.41
        // Annualized ≈ 1.41 * sqrt(365) ≈ 27
        const pnl = [5, 15, 5, 15, 10];
        const sharpe = tracker.calculateSharpeRatio(pnl);
        
        // Mean = 10
        // Variance = ((5-10)^2 + (15-10)^2 + (5-10)^2 + (15-10)^2 + (10-10)^2) / 4 = 100/4 = 25
        // StdDev = 5
        // Daily Sharpe = 10/5 = 2
        // Annualized = 2 * sqrt(365) ≈ 38.2
        expect(sharpe).toBeCloseTo(2 * Math.sqrt(365), 1);
      });

      it('should handle mixed positive and negative returns', () => {
        const pnl = [100, -50, 75, -25, 50, -10, 30];
        const sharpe = tracker.calculateSharpeRatio(pnl);
        // Should be positive since net is positive
        expect(sharpe).toBeGreaterThan(0);
      });
    });

    describe('edge cases', () => {
      it('should handle very small values', () => {
        const pnl = [0.001, 0.002, 0.001, 0.003, 0.002];
        const sharpe = tracker.calculateSharpeRatio(pnl);
        expect(Number.isFinite(sharpe)).toBe(true);
      });

      it('should handle very large values', () => {
        const pnl = [1000000, 1100000, 1050000, 1150000, 1200000];
        const sharpe = tracker.calculateSharpeRatio(pnl);
        expect(Number.isFinite(sharpe)).toBe(true);
        expect(sharpe).toBeGreaterThan(0);
      });
    });
  });


  describe('calculateModifier', () => {
    describe('malus penalty (Sharpe < 0)', () => {
      it('should return malusMultiplier for negative Sharpe', () => {
        const modifier = tracker.calculateModifier(-1.0);
        expect(modifier).toBe(0.5);
      });

      it('should return malusMultiplier for Sharpe at threshold', () => {
        // malusThreshold is 0, so exactly 0 should NOT trigger malus
        const modifier = tracker.calculateModifier(0);
        expect(modifier).toBe(1.0);
      });

      it('should return malusMultiplier for very negative Sharpe', () => {
        const modifier = tracker.calculateModifier(-10.0);
        expect(modifier).toBe(0.5);
      });
    });

    describe('bonus multiplier (Sharpe > 2.0)', () => {
      it('should return bonusMultiplier for high Sharpe', () => {
        const modifier = tracker.calculateModifier(2.5);
        expect(modifier).toBe(1.2);
      });

      it('should return 1.0 for Sharpe at bonus threshold', () => {
        // bonusThreshold is 2.0, so exactly 2.0 should NOT trigger bonus
        const modifier = tracker.calculateModifier(2.0);
        expect(modifier).toBe(1.0);
      });

      it('should return bonusMultiplier for very high Sharpe', () => {
        const modifier = tracker.calculateModifier(10.0);
        expect(modifier).toBe(1.2);
      });
    });

    describe('normal performance (0 <= Sharpe <= 2.0)', () => {
      it('should return 1.0 for Sharpe of 0', () => {
        const modifier = tracker.calculateModifier(0);
        expect(modifier).toBe(1.0);
      });

      it('should return 1.0 for Sharpe of 1.0', () => {
        const modifier = tracker.calculateModifier(1.0);
        expect(modifier).toBe(1.0);
      });

      it('should return 1.0 for Sharpe of 2.0', () => {
        const modifier = tracker.calculateModifier(2.0);
        expect(modifier).toBe(1.0);
      });

      it('should return 1.0 for Sharpe of 0.5', () => {
        const modifier = tracker.calculateModifier(0.5);
        expect(modifier).toBe(1.0);
      });
    });

    describe('modifier bounds', () => {
      it('should never return less than malusMultiplier', () => {
        const testValues = [-100, -10, -5, -1, -0.5, -0.1];
        for (const sharpe of testValues) {
          const modifier = tracker.calculateModifier(sharpe);
          expect(modifier).toBeGreaterThanOrEqual(0.5);
        }
      });

      it('should never return more than bonusMultiplier', () => {
        const testValues = [2.1, 3, 5, 10, 100];
        for (const sharpe of testValues) {
          const modifier = tracker.calculateModifier(sharpe);
          expect(modifier).toBeLessThanOrEqual(1.2);
        }
      });
    });
  });

  describe('custom thresholds', () => {
    it('should respect custom malusThreshold', () => {
      const customConfig: PerformanceTrackerConfig = {
        ...config,
        malusThreshold: -0.5,
      };
      const customTracker = new PerformanceTracker(customConfig);

      // Sharpe of -0.3 should NOT trigger malus with threshold of -0.5
      expect(customTracker.calculateModifier(-0.3)).toBe(1.0);
      // Sharpe of -0.6 should trigger malus
      expect(customTracker.calculateModifier(-0.6)).toBe(0.5);
    });

    it('should respect custom bonusThreshold', () => {
      const customConfig: PerformanceTrackerConfig = {
        ...config,
        bonusThreshold: 3.0,
      };
      const customTracker = new PerformanceTracker(customConfig);

      // Sharpe of 2.5 should NOT trigger bonus with threshold of 3.0
      expect(customTracker.calculateModifier(2.5)).toBe(1.0);
      // Sharpe of 3.5 should trigger bonus
      expect(customTracker.calculateModifier(3.5)).toBe(1.2);
    });

    it('should respect custom multipliers', () => {
      const customConfig: PerformanceTrackerConfig = {
        ...config,
        malusMultiplier: 0.3,
        bonusMultiplier: 1.5,
      };
      const customTracker = new PerformanceTracker(customConfig);

      expect(customTracker.calculateModifier(-1.0)).toBe(0.3);
      expect(customTracker.calculateModifier(3.0)).toBe(1.5);
    });
  });

  describe('database operations without database', () => {
    it('should throw error when recording trade without database', async () => {
      await expect(
        tracker.recordTrade('phase1', 100, Date.now())
      ).rejects.toThrow('Database not configured');
    });

    it('should return empty array for getTradesInWindow without database', async () => {
      const trades = await tracker.getTradesInWindow('phase1', 7);
      expect(trades).toEqual([]);
    });

    it('should return 0 for getTradeCount without database', async () => {
      const count = await tracker.getTradeCount('phase1', 7);
      expect(count).toBe(0);
    });

    it('should return 0 for getSharpeRatio without database', async () => {
      const sharpe = await tracker.getSharpeRatio('phase1');
      expect(sharpe).toBe(0);
    });

    it('should return 1.0 for getPerformanceModifier without database', async () => {
      // No trades = insufficient history = 1.0 modifier
      const modifier = await tracker.getPerformanceModifier('phase1');
      expect(modifier).toBe(1.0);
    });
  });

  describe('getPhasePerformance without database', () => {
    it('should return default performance metrics', async () => {
      const performance = await tracker.getPhasePerformance('phase1');

      expect(performance.phaseId).toBe('phase1');
      expect(performance.sharpeRatio).toBe(0);
      expect(performance.totalPnL).toBe(0);
      expect(performance.tradeCount).toBe(0);
      expect(performance.winRate).toBe(0);
      expect(performance.avgWin).toBe(0);
      expect(performance.avgLoss).toBe(0);
      expect(performance.modifier).toBe(1.0);
    });
  });

  describe('getAllPhasePerformance', () => {
    it('should return performance for all three phases', async () => {
      const performances = await tracker.getAllPhasePerformance();

      expect(performances).toHaveLength(3);
      expect(performances.map(p => p.phaseId)).toEqual(['phase1', 'phase2', 'phase3']);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of configuration', () => {
      const config1 = tracker.getConfig();
      const config2 = tracker.getConfig();

      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Should be different objects
    });
  });
});
