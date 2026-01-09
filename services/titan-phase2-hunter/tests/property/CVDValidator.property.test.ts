/**
 * Property-Based Tests for CVDValidator
 * 
 * Tests universal properties that should hold across all valid inputs
 * using fast-check for property generation.
 * 
 * **Feature: titan-phase2-hunter, Property 4: CVD Absorption Detection**
 * **Validates: Requirements 4.2**
 */

import * as fc from 'fast-check';
import { CVDValidator } from '../../src/engine/CVDValidator';
import { Absorption, Distribution } from '../../src/types';

describe('CVDValidator Property Tests', () => {
  let cvdValidator: CVDValidator;

  beforeEach(() => {
    cvdValidator = new CVDValidator();
  });

  afterEach(() => {
    cvdValidator.removeAllListeners();
  });

  /**
   * Generator for price series that creates Lower Low patterns
   * Ensures p3 < p2 < p1 (descending prices)
   */
  const lowerLowPricesArbitrary = fc.record({
    basePrice: fc.float({ min: 50, max: 200, noNaN: true }),
    drop1: fc.float({ min: 0.5, max: 5, noNaN: true }), // First drop percentage
    drop2: fc.float({ min: 0.5, max: 5, noNaN: true })  // Second drop percentage
  }).map(({ basePrice, drop1, drop2 }) => {
    const p1 = Math.round(basePrice * 100) / 100;
    const p2 = Math.round((p1 * (1 - drop1 / 100)) * 100) / 100;
    const p3 = Math.round((p2 * (1 - drop2 / 100)) * 100) / 100;
    
    // Ensure Lower Low pattern: p3 < p2 < p1
    return [p1, p2, Math.min(p3, p2 - 0.01)];
  });

  /**
   * Generator for CVD series that creates Higher Low patterns
   * Ensures cvd3 > cvd2 and cvd2 < cvd1 (divergence pattern)
   */
  const higherLowCVDArbitrary = fc.record({
    baseCVD: fc.float({ min: -10000, max: 10000, noNaN: true }),
    drop: fc.float({ min: 1000, max: 5000, noNaN: true }), // CVD drops first
    rise: fc.float({ min: 500, max: 3000, noNaN: true })   // Then rises (but not necessarily above cvd1)
  }).map(({ baseCVD, drop, rise }) => {
    const cvd1 = Math.round(baseCVD);
    const cvd2 = Math.round(cvd1 - drop); // CVD drops
    const cvd3 = Math.round(cvd2 + rise); // CVD rises (Higher Low)
    
    // Ensure Higher Low pattern: cvd3 > cvd2 and cvd2 < cvd1
    return [cvd1, cvd2, Math.max(cvd3, cvd2 + 100)];
  });

  /**
   * Generator for price series that creates Higher High patterns
   * Ensures p3 > p2 > p1 (ascending prices)
   */
  const higherHighPricesArbitrary = fc.record({
    basePrice: fc.float({ min: 50, max: 200, noNaN: true }),
    rise1: fc.float({ min: 0.5, max: 5, noNaN: true }), // First rise percentage
    rise2: fc.float({ min: 0.5, max: 5, noNaN: true })  // Second rise percentage
  }).map(({ basePrice, rise1, rise2 }) => {
    const p1 = Math.round(basePrice * 100) / 100;
    const p2 = Math.round((p1 * (1 + rise1 / 100)) * 100) / 100;
    const p3 = Math.round((p2 * (1 + rise2 / 100)) * 100) / 100;
    
    // Ensure Higher High pattern: p3 > p2 > p1
    return [p1, p2, Math.max(p3, p2 + 0.01)];
  });

  /**
   * Generator for CVD series that creates Lower High patterns
   * Ensures cvd3 < cvd2 and cvd2 > cvd1 (distribution pattern)
   */
  const lowerHighCVDArbitrary = fc.record({
    baseCVD: fc.float({ min: -10000, max: 10000, noNaN: true }),
    rise: fc.float({ min: 1000, max: 5000, noNaN: true }), // CVD rises first
    drop: fc.float({ min: 500, max: 3000, noNaN: true })   // Then drops (but not necessarily below cvd1)
  }).map(({ baseCVD, rise, drop }) => {
    const cvd1 = Math.round(baseCVD);
    const cvd2 = Math.round(cvd1 + rise); // CVD rises
    const cvd3 = Math.round(cvd2 - drop); // CVD drops (Lower High)
    
    // Ensure Lower High pattern: cvd3 < cvd2 and cvd2 > cvd1
    return [cvd1, cvd2, Math.min(cvd3, cvd2 - 100)];
  });

  /**
   * Generator for random price arrays (no specific pattern)
   */
  const randomPricesArbitrary = fc.array(
    fc.float({ min: 10, max: 1000, noNaN: true }),
    { minLength: 3, maxLength: 10 }
  );

  /**
   * Generator for random CVD arrays (no specific pattern)
   */
  const randomCVDArbitrary = fc.array(
    fc.float({ min: -50000, max: 50000, noNaN: true }),
    { minLength: 3, maxLength: 10 }
  );

  /**
   * Property 4: CVD Absorption Detection
   * 
   * For any price series with Lower Low and CVD series with Higher Low,
   * absorption should be detected.
   * 
   * **Validates: Requirements 4.2**
   */
  it('Property 4: Should detect absorption when price makes Lower Low and CVD makes Higher Low', () => {
    fc.assert(
      fc.property(
        lowerLowPricesArbitrary,
        higherLowCVDArbitrary,
        (prices, cvdValues) => {
          // Call detectAbsorption with Lower Low prices and Higher Low CVD
          const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
          
          // Absorption should be detected
          expect(absorption).not.toBeNull();
          expect(absorption).toBeDefined();
          
          if (absorption) {
            // Verify absorption properties
            expect(absorption.price).toBe(prices[prices.length - 1]);
            expect(absorption.cvdValue).toBe(cvdValues[cvdValues.length - 1]);
            expect(absorption.confidence).toBeGreaterThan(0);
            expect(absorption.confidence).toBeLessThanOrEqual(100);
            expect(absorption.timestamp).toBeGreaterThan(0);
            
            // Verify the pattern is correct
            const p1 = prices[prices.length - 3];
            const p2 = prices[prices.length - 2];
            const p3 = prices[prices.length - 1];
            
            const cvd1 = cvdValues[cvdValues.length - 3];
            const cvd2 = cvdValues[cvdValues.length - 2];
            const cvd3 = cvdValues[cvdValues.length - 1];
            
            // Verify Lower Low pattern in prices
            expect(p3).toBeLessThan(p2);
            expect(p2).toBeLessThan(p1);
            
            // Verify Higher Low pattern in CVD
            expect(cvd3).toBeGreaterThan(cvd2);
            expect(cvd2).toBeLessThan(cvd1);
          }
        }
      ),
      {
        numRuns: 100,
        verbose: true,
        seed: 42
      }
    );
  });

  /**
   * Property 5: CVD Distribution Detection
   * 
   * For any price series with Higher High and CVD series with Lower High,
   * distribution should be detected.
   */
  it('Property 5: Should detect distribution when price makes Higher High and CVD makes Lower High', () => {
    fc.assert(
      fc.property(
        higherHighPricesArbitrary,
        lowerHighCVDArbitrary,
        (prices, cvdValues) => {
          // Call detectDistribution with Higher High prices and Lower High CVD
          const distribution = cvdValidator.detectDistribution(prices, cvdValues);
          
          // Distribution should be detected
          expect(distribution).not.toBeNull();
          expect(distribution).toBeDefined();
          
          if (distribution) {
            // Verify distribution properties
            expect(distribution.price).toBe(prices[prices.length - 1]);
            expect(distribution.cvdValue).toBe(cvdValues[cvdValues.length - 1]);
            expect(distribution.confidence).toBeGreaterThan(0);
            expect(distribution.confidence).toBeLessThanOrEqual(100);
            expect(distribution.timestamp).toBeGreaterThan(0);
            
            // Verify the pattern is correct
            const p1 = prices[prices.length - 3];
            const p2 = prices[prices.length - 2];
            const p3 = prices[prices.length - 1];
            
            const cvd1 = cvdValues[cvdValues.length - 3];
            const cvd2 = cvdValues[cvdValues.length - 2];
            const cvd3 = cvdValues[cvdValues.length - 1];
            
            // Verify Higher High pattern in prices
            expect(p3).toBeGreaterThan(p2);
            expect(p2).toBeGreaterThan(p1);
            
            // Verify Lower High pattern in CVD
            expect(cvd3).toBeLessThan(cvd2);
            expect(cvd2).toBeGreaterThan(cvd1);
          }
        }
      ),
      {
        numRuns: 100,
        verbose: true,
        seed: 42
      }
    );
  });

  /**
   * Property 6: No False Positives for Random Data
   * 
   * For random price and CVD data without specific patterns,
   * absorption/distribution should not be detected unless the pattern actually exists.
   */
  it('Property 6: Should not detect false positives in random data', () => {
    fc.assert(
      fc.property(
        randomPricesArbitrary,
        randomCVDArbitrary,
        (prices, cvdValues) => {
          // Ensure arrays have same length
          const minLength = Math.min(prices.length, cvdValues.length);
          const trimmedPrices = prices.slice(0, minLength);
          const trimmedCVD = cvdValues.slice(0, minLength);
          
          if (minLength < 3) return; // Skip if insufficient data
          
          const absorption = cvdValidator.detectAbsorption(trimmedPrices, trimmedCVD);
          const distribution = cvdValidator.detectDistribution(trimmedPrices, trimmedCVD);
          
          // If absorption is detected, verify the pattern actually exists
          if (absorption) {
            const p1 = trimmedPrices[trimmedPrices.length - 3];
            const p2 = trimmedPrices[trimmedPrices.length - 2];
            const p3 = trimmedPrices[trimmedPrices.length - 1];
            
            const cvd1 = trimmedCVD[trimmedCVD.length - 3];
            const cvd2 = trimmedCVD[trimmedCVD.length - 2];
            const cvd3 = trimmedCVD[trimmedCVD.length - 1];
            
            // Verify Lower Low + Higher Low pattern
            expect(p3).toBeLessThan(p2);
            expect(p2).toBeLessThan(p1);
            expect(cvd3).toBeGreaterThan(cvd2);
            expect(cvd2).toBeLessThan(cvd1);
          }
          
          // If distribution is detected, verify the pattern actually exists
          if (distribution) {
            const p1 = trimmedPrices[trimmedPrices.length - 3];
            const p2 = trimmedPrices[trimmedPrices.length - 2];
            const p3 = trimmedPrices[trimmedPrices.length - 1];
            
            const cvd1 = trimmedCVD[trimmedCVD.length - 3];
            const cvd2 = trimmedCVD[trimmedCVD.length - 2];
            const cvd3 = trimmedCVD[trimmedCVD.length - 1];
            
            // Verify Higher High + Lower High pattern
            expect(p3).toBeGreaterThan(p2);
            expect(p2).toBeGreaterThan(p1);
            expect(cvd3).toBeLessThan(cvd2);
            expect(cvd2).toBeGreaterThan(cvd1);
          }
        }
      ),
      {
        numRuns: 100,
        verbose: true,
        seed: 42
      }
    );
  });

  /**
   * Property 7: Insufficient Data Handling
   * 
   * For arrays with fewer than 3 elements, detectAbsorption and detectDistribution
   * should return null.
   */
  it('Property 7: Should handle insufficient data gracefully', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: 10, max: 1000, noNaN: true }), { minLength: 0, maxLength: 2 }),
        fc.array(fc.float({ min: -1000, max: 1000, noNaN: true }), { minLength: 0, maxLength: 2 }),
        (prices, cvdValues) => {
          const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
          const distribution = cvdValidator.detectDistribution(prices, cvdValues);
          
          expect(absorption).toBeNull();
          expect(distribution).toBeNull();
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
   * Property 8: Confidence Score Consistency
   * 
   * For any detected absorption or distribution, the confidence score should be
   * consistent and within valid bounds.
   */
  it('Property 8: Confidence scores should be consistent and bounded', () => {
    fc.assert(
      fc.property(
        lowerLowPricesArbitrary,
        higherLowCVDArbitrary,
        (prices, cvdValues) => {
          const absorption = cvdValidator.detectAbsorption(prices, cvdValues);
          
          if (absorption) {
            // Confidence should be within valid range
            expect(absorption.confidence).toBeGreaterThan(0);
            expect(absorption.confidence).toBeLessThanOrEqual(100);
            
            // Confidence should be deterministic for same input
            const absorption2 = cvdValidator.detectAbsorption(prices, cvdValues);
            expect(absorption2?.confidence).toBe(absorption.confidence);
          }
        }
      ),
      {
        numRuns: 100,
        verbose: true,
        seed: 42
      }
    );
  });

  /**
   * Property 9: Event Emission Consistency
   * 
   * When absorption or distribution is detected, appropriate events should be emitted.
   */
  it('Property 9: Should emit events when patterns are detected', () => {
    fc.assert(
      fc.property(
        lowerLowPricesArbitrary,
        higherLowCVDArbitrary,
        (prices, cvdValues) => {
          let absorptionEventEmitted = false;
          let emittedAbsorption: Absorption | null = null;
          
          // Listen for absorption event
          cvdValidator.once('absorption', (absorption: Absorption) => {
            absorptionEventEmitted = true;
            emittedAbsorption = absorption;
          });
          
          const detectedAbsorption = cvdValidator.detectAbsorption(prices, cvdValues);
          
          if (detectedAbsorption) {
            // Event should have been emitted
            expect(absorptionEventEmitted).toBe(true);
            expect(emittedAbsorption).toEqual(detectedAbsorption);
          } else {
            // No event should have been emitted
            expect(absorptionEventEmitted).toBe(false);
            expect(emittedAbsorption).toBeNull();
          }
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
   * Property 10: Input Immutability
   * 
   * The detectAbsorption and detectDistribution functions should not modify
   * the input arrays.
   */
  it('Property 10: Input arrays should remain unchanged', () => {
    fc.assert(
      fc.property(
        randomPricesArbitrary,
        randomCVDArbitrary,
        (prices, cvdValues) => {
          // Create deep copies of inputs
          const originalPrices = [...prices];
          const originalCVD = [...cvdValues];
          
          // Call detection methods
          cvdValidator.detectAbsorption(prices, cvdValues);
          cvdValidator.detectDistribution(prices, cvdValues);
          
          // Verify inputs are unchanged
          expect(prices).toEqual(originalPrices);
          expect(cvdValues).toEqual(originalCVD);
        }
      ),
      {
        numRuns: 100,
        verbose: true,
        seed: 42
      }
    );
  });
});