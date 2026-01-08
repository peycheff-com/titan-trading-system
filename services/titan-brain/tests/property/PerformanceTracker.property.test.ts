/**
 * Property-Based Tests for PerformanceTracker
 * 
 * Tests universal properties that should hold across all inputs
 */

import * as fc from 'fast-check';
import { PerformanceTracker } from '../../src/engine/PerformanceTracker';
import { PerformanceTrackerConfig } from '../../src/types/index';

// Test configuration
const testConfig: PerformanceTrackerConfig = {
  windowDays: 7,
  minTradeCount: 10,
  malusThreshold: 0,
  bonusThreshold: 2.0,
  malusMultiplier: 0.5,
  bonusMultiplier: 1.2
};

describe('PerformanceTracker Property Tests', () => {
  let tracker: PerformanceTracker;

  beforeEach(() => {
    tracker = new PerformanceTracker(testConfig);
  });

  describe('Property 3: Performance Modifier Bounds', () => {
    /**
     * **Validates: Requirements 2.3, 2.4**
     * 
     * For any Sharpe ratio value, the performance modifier should always be within bounds:
     * - Minimum: malusMultiplier (0.5)
     * - Maximum: bonusMultiplier (1.2)
     * - Never outside the range [0.5, 1.2]
     */
    it('should always return modifier within bounds [0.5, 1.2]', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(-10), max: Math.fround(10), noNaN: true }),
          (sharpeRatio) => {
            const modifier = tracker.calculateModifier(sharpeRatio);
            
            // Property: Modifier must be within bounds
            expect(modifier).toBeGreaterThanOrEqual(testConfig.malusMultiplier);
            expect(modifier).toBeLessThanOrEqual(testConfig.bonusMultiplier);
            
            // Property: Modifier must be one of three values
            const validModifiers = [
              testConfig.malusMultiplier,  // 0.5
              1.0,                         // Normal
              testConfig.bonusMultiplier   // 1.2
            ];
            expect(validModifiers).toContain(modifier);
          }
        ),
        { numRuns: 1000 }
      );
    });

    /**
     * **Validates: Requirements 2.3**
     * 
     * For any Sharpe ratio below the malus threshold (0), 
     * the modifier should always be the malus multiplier (0.5)
     */
    it('should apply malus multiplier for all negative Sharpe ratios', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(-100), max: Math.fround(-0.001), noNaN: true }),
          (negativeSharpe) => {
            const modifier = tracker.calculateModifier(negativeSharpe);
            
            // Property: All negative Sharpe ratios get malus penalty
            expect(modifier).toBe(testConfig.malusMultiplier);
          }
        ),
        { numRuns: 500 }
      );
    });

    /**
     * **Validates: Requirements 2.4**
     * 
     * For any Sharpe ratio above the bonus threshold (2.0),
     * the modifier should always be the bonus multiplier (1.2)
     */
    it('should apply bonus multiplier for all high Sharpe ratios', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(2.001), max: Math.fround(100), noNaN: true }),
          (highSharpe) => {
            const modifier = tracker.calculateModifier(highSharpe);
            
            // Property: All high Sharpe ratios get bonus multiplier
            expect(modifier).toBe(testConfig.bonusMultiplier);
          }
        ),
        { numRuns: 500 }
      );
    });

    /**
     * **Validates: Requirements 2.3, 2.4**
     * 
     * For any Sharpe ratio in the normal range [0, 2.0],
     * the modifier should always be 1.0 (no modification)
     */
    it('should return 1.0 for normal Sharpe ratios', () => {
      fc.assert(
        fc.property(
          fc.float({ min: Math.fround(0), max: Math.fround(2.0), noNaN: true }),
          (normalSharpe) => {
            const modifier = tracker.calculateModifier(normalSharpe);
            
            // Property: Normal Sharpe ratios get no modification
            expect(modifier).toBe(1.0);
          }
        ),
        { numRuns: 500 }
      );
    });

    /**
     * **Validates: Requirements 2.3, 2.4**
     * 
     * The modifier function should be monotonic in the sense that:
     * - All values below threshold get same (minimum) modifier
     * - All values above threshold get same (maximum) modifier
     * - All values in between get same (normal) modifier
     */
    it('should be piecewise constant with correct thresholds', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.float({ min: Math.fround(-10), max: Math.fround(10), noNaN: true }),
            fc.float({ min: Math.fround(-10), max: Math.fround(10), noNaN: true })
          ),
          ([sharpe1, sharpe2]) => {
            const modifier1 = tracker.calculateModifier(sharpe1);
            const modifier2 = tracker.calculateModifier(sharpe2);
            
            // Property: Same category should give same modifier
            const category1 = sharpe1 < 0 ? 'malus' : sharpe1 > 2.0 ? 'bonus' : 'normal';
            const category2 = sharpe2 < 0 ? 'malus' : sharpe2 > 2.0 ? 'bonus' : 'normal';
            
            if (category1 === category2) {
              expect(modifier1).toBe(modifier2);
            }
          }
        ),
        { numRuns: 1000 }
      );
    });

    /**
     * **Validates: Requirements 2.3, 2.4**
     * 
     * Test boundary conditions at exactly the threshold values
     */
    it('should handle boundary conditions correctly', () => {
      // Exactly at malus threshold (0)
      expect(tracker.calculateModifier(0)).toBe(1.0);
      expect(tracker.calculateModifier(-0.0)).toBe(1.0);
      
      // Just below malus threshold
      expect(tracker.calculateModifier(-0.000001)).toBe(testConfig.malusMultiplier);
      
      // Exactly at bonus threshold (2.0)
      expect(tracker.calculateModifier(2.0)).toBe(1.0);
      
      // Just above bonus threshold
      expect(tracker.calculateModifier(2.000001)).toBe(testConfig.bonusMultiplier);
    });

    /**
     * **Validates: Requirements 2.3, 2.4**
     * 
     * Test extreme values to ensure no overflow or underflow
     */
    it('should handle extreme Sharpe ratio values', () => {
      const extremeValues = [
        -Infinity, -1000, -100, -10,
        10, 100, 1000, Infinity
      ];
      
      extremeValues.forEach(sharpe => {
        if (isFinite(sharpe)) {
          const modifier = tracker.calculateModifier(sharpe);
          
          // Should still be within bounds
          expect(modifier).toBeGreaterThanOrEqual(testConfig.malusMultiplier);
          expect(modifier).toBeLessThanOrEqual(testConfig.bonusMultiplier);
          expect(isFinite(modifier)).toBe(true);
        }
      });
    });
  });

  describe('Sharpe Ratio Calculation Properties', () => {
    /**
     * Property: Sharpe ratio should be 0 for insufficient data
     */
    it('should return 0 for insufficient PnL data', () => {
      fc.assert(
        fc.property(
          fc.array(fc.float({ min: Math.fround(-1000), max: Math.fround(1000), noNaN: true }), { maxLength: 1 }),
          (pnlValues) => {
            const sharpe = tracker.calculateSharpeRatio(pnlValues);
            expect(sharpe).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Sharpe ratio should be finite for valid data
     */
    it('should return finite Sharpe ratio for valid PnL data', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.float({ min: Math.fround(-1000), max: Math.fround(1000), noNaN: true }),
            { minLength: 2, maxLength: 100 }
          ),
          (pnlValues) => {
            // Ensure we have some variation to avoid zero std dev
            if (pnlValues.length >= 2) {
              pnlValues[0] = 100;  // Force some variation
              pnlValues[1] = -50;
            }
            
            const sharpe = tracker.calculateSharpeRatio(pnlValues);
            expect(isFinite(sharpe)).toBe(true);
          }
        ),
        { numRuns: 500 }
      );
    });

    /**
     * Property: Sharpe ratio should handle zero standard deviation
     */
    it('should handle zero standard deviation correctly', () => {
      // All positive returns
      const allPositive = [100, 100, 100, 100];
      const sharpePositive = tracker.calculateSharpeRatio(allPositive);
      expect(sharpePositive).toBe(3.0);
      
      // All negative returns
      const allNegative = [-100, -100, -100, -100];
      const sharpeNegative = tracker.calculateSharpeRatio(allNegative);
      expect(sharpeNegative).toBe(-3.0);
      
      // All zero returns
      const allZero = [0, 0, 0, 0];
      const sharpeZero = tracker.calculateSharpeRatio(allZero);
      expect(sharpeZero).toBe(0);
    });
  });

  describe('Configuration Validation Properties', () => {
    /**
     * Property: Configuration values should be used correctly
     */
    it('should use configuration values correctly', () => {
      const customConfig: PerformanceTrackerConfig = {
        windowDays: 14,
        minTradeCount: 20,
        malusThreshold: -0.5,
        bonusThreshold: 1.5,
        malusMultiplier: 0.3,
        bonusMultiplier: 1.5
      };
      
      const customTracker = new PerformanceTracker(customConfig);
      
      // Test custom thresholds
      expect(customTracker.calculateModifier(-0.6)).toBe(0.3);  // Below custom malus threshold
      expect(customTracker.calculateModifier(-0.4)).toBe(1.0);  // Above custom malus threshold
      expect(customTracker.calculateModifier(1.4)).toBe(1.0);   // Below custom bonus threshold
      expect(customTracker.calculateModifier(1.6)).toBe(1.5);   // Above custom bonus threshold
    });
  });
});