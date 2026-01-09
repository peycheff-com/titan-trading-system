/**
 * Property-Based Tests for FractalMath Engine
 * 
 * Tests universal properties that should hold across all valid inputs
 * using fast-check for property generation.
 * 
 * **Feature: titan-phase2-hunter, Property 1: Fractal Detection Consistency**
 * **Validates: Requirements 5.1-5.7**
 */

import * as fc from 'fast-check';
import { FractalMath } from '../../src/engine/FractalMath';
import { OHLCV } from '../../src/types';

describe('FractalMath Property Tests', () => {
  
  /**
   * Generator for valid OHLCV candles
   * Ensures high >= low and close is within [low, high] range
   * Uses realistic price ranges to avoid floating-point precision issues
   */
  const ohlcvArbitrary = fc.record({
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    basePrice: fc.float({ min: 10, max: 100, noNaN: true }), // Base price for realistic ranges
    openOffset: fc.float({ min: -2, max: 2, noNaN: true }), // ±2% from base
    highOffset: fc.float({ min: 0, max: 3, noNaN: true }), // 0-3% above base
    lowOffset: fc.float({ min: -3, max: 0, noNaN: true }), // 0-3% below base
    closeOffset: fc.float({ min: -2, max: 2, noNaN: true }), // ±2% from base
    volume: fc.float({ min: 1000, max: 100000, noNaN: true })
  }).map((candle): OHLCV => {
    // Calculate prices based on base price and offsets
    const basePrice = Math.round(candle.basePrice * 100) / 100; // Round to 2 decimals
    const open = Math.round((basePrice * (1 + candle.openOffset / 100)) * 100) / 100;
    const high = Math.round((basePrice * (1 + candle.highOffset / 100)) * 100) / 100;
    const low = Math.round((basePrice * (1 + candle.lowOffset / 100)) * 100) / 100;
    const close = Math.round((basePrice * (1 + candle.closeOffset / 100)) * 100) / 100;
    
    // Ensure valid OHLC relationships
    const actualLow = Math.min(open, high, low, close);
    const actualHigh = Math.max(open, high, low, close);
    const actualClose = Math.max(actualLow, Math.min(actualHigh, close));
    
    return {
      timestamp: candle.timestamp,
      open,
      high: actualHigh,
      low: actualLow,
      close: actualClose,
      volume: Math.round(candle.volume)
    };
  });

  /**
   * Generator for arrays of OHLCV candles with minimum length of 5
   * (required for fractal detection)
   */
  const candleArrayArbitrary = fc.array(ohlcvArbitrary, { minLength: 5, maxLength: 100 })
    .map(candles => {
      // Ensure timestamps are in ascending order
      return candles.map((candle, index) => ({
        ...candle,
        timestamp: 1000000000 + (index * 60000) // 1-minute intervals
      }));
    });

  /**
   * Property 1: Fractal Detection Consistency
   * 
   * For any OHLCV array, detecting fractals twice should produce identical results.
   * This tests that the detectFractals() function is deterministic and pure.
   * 
   * **Validates: Requirements 5.1-5.7**
   */
  it('Property 1: Fractal detection should be deterministic and consistent', () => {
    fc.assert(
      fc.property(candleArrayArbitrary, (candles) => {
        // Detect fractals twice with the same input
        const fractals1 = FractalMath.detectFractals(candles);
        const fractals2 = FractalMath.detectFractals(candles);
        
        // Results should be identical
        expect(fractals1).toHaveLength(fractals2.length);
        
        // Compare each fractal in detail
        for (let i = 0; i < fractals1.length; i++) {
          const f1 = fractals1[i];
          const f2 = fractals2[i];
          
          expect(f1.type).toBe(f2.type);
          expect(f1.price).toBe(f2.price);
          expect(f1.barIndex).toBe(f2.barIndex);
          expect(f1.timestamp).toBe(f2.timestamp);
          expect(f1.confirmed).toBe(f2.confirmed);
        }
        
        // Verify that fractals are properly ordered by barIndex
        for (let i = 1; i < fractals1.length; i++) {
          expect(fractals1[i].barIndex).toBeGreaterThanOrEqual(fractals1[i-1].barIndex);
        }
        
        // Verify that all detected fractals have valid bar indices
        fractals1.forEach(fractal => {
          expect(fractal.barIndex).toBeGreaterThanOrEqual(2); // Need 2 bars on each side
          expect(fractal.barIndex).toBeLessThan(candles.length - 2);
        });
        
        // Verify that fractal prices match the actual candle data
        fractals1.forEach(fractal => {
          const candle = candles[fractal.barIndex];
          if (fractal.type === 'HIGH') {
            expect(fractal.price).toBe(candle.high);
          } else {
            expect(fractal.price).toBe(candle.low);
          }
        });
      }),
      {
        numRuns: 100, // Run 100 iterations as specified in requirements
        verbose: true,
        seed: 42 // Fixed seed for reproducible tests
      }
    );
  });

  /**
   * Property 2: Fractal Validation Consistency
   * 
   * For any detected fractal, it should satisfy the Bill Williams definition:
   * - High fractal: middle candle's high > 2 candles on each side
   * - Low fractal: middle candle's low < 2 candles on each side
   */
  it('Property 2: All detected fractals should satisfy Bill Williams definition', () => {
    fc.assert(
      fc.property(candleArrayArbitrary, (candles) => {
        const fractals = FractalMath.detectFractals(candles);
        
        // Verify each fractal satisfies the 5-candle pattern
        fractals.forEach(fractal => {
          const i = fractal.barIndex;
          
          // Ensure we have enough candles on both sides
          expect(i).toBeGreaterThanOrEqual(2);
          expect(i).toBeLessThan(candles.length - 2);
          
          if (fractal.type === 'HIGH') {
            // High fractal: candles[i].high > all 4 neighbors
            expect(candles[i].high).toBeGreaterThan(candles[i-1].high);
            expect(candles[i].high).toBeGreaterThan(candles[i-2].high);
            expect(candles[i].high).toBeGreaterThan(candles[i+1].high);
            expect(candles[i].high).toBeGreaterThan(candles[i+2].high);
          } else {
            // Low fractal: candles[i].low < all 4 neighbors
            expect(candles[i].low).toBeLessThan(candles[i-1].low);
            expect(candles[i].low).toBeLessThan(candles[i-2].low);
            expect(candles[i].low).toBeLessThan(candles[i+1].low);
            expect(candles[i].low).toBeLessThan(candles[i+2].low);
          }
        });
      }),
      {
        numRuns: 100,
        verbose: true,
        seed: 42
      }
    );
  });

  /**
   * Property 3: Fractal Count Bounds
   * 
   * For any OHLCV array of length N, the number of fractals should be bounded:
   * - Minimum: 0 fractals (no valid patterns)
   * - Maximum: N-4 fractals (theoretical max if every eligible candle is a fractal)
   */
  it('Property 3: Fractal count should be within expected bounds', () => {
    fc.assert(
      fc.property(candleArrayArbitrary, (candles) => {
        const fractals = FractalMath.detectFractals(candles);
        
        // Fractal count should be non-negative
        expect(fractals.length).toBeGreaterThanOrEqual(0);
        
        // Fractal count should not exceed theoretical maximum
        // Maximum possible fractals = candles.length - 4 (need 2 on each side)
        const maxPossibleFractals = Math.max(0, candles.length - 4);
        expect(fractals.length).toBeLessThanOrEqual(maxPossibleFractals);
        
        // All fractals should have unique bar indices
        const barIndices = fractals.map(f => f.barIndex);
        const uniqueBarIndices = new Set(barIndices);
        expect(uniqueBarIndices.size).toBe(barIndices.length);
      }),
      {
        numRuns: 100,
        verbose: true,
        seed: 42
      }
    );
  });

  /**
   * Property 4: Empty Input Handling
   * 
   * For arrays with fewer than 5 candles, detectFractals should return empty array
   */
  it('Property 4: Should handle insufficient input gracefully', () => {
    fc.assert(
      fc.property(
        fc.array(ohlcvArbitrary, { minLength: 0, maxLength: 4 }),
        (candles) => {
          const fractals = FractalMath.detectFractals(candles);
          expect(fractals).toHaveLength(0);
        }
      ),
      {
        numRuns: 50,
        verbose: true,
        seed: 42
      }
    );
  });

  /**
   * Property 5: Fractal Immutability
   * 
   * The detectFractals function should not modify the input array
   */
  it('Property 5: Input array should remain unchanged', () => {
    fc.assert(
      fc.property(candleArrayArbitrary, (candles) => {
        // Create deep copy of input
        const originalCandles = JSON.parse(JSON.stringify(candles));
        
        // Call detectFractals
        FractalMath.detectFractals(candles);
        
        // Verify input is unchanged
        expect(candles).toEqual(originalCandles);
      }),
      {
        numRuns: 100,
        verbose: true,
        seed: 42
      }
    );
  });
});