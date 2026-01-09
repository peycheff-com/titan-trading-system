/**
 * Property-Based Tests for InefficiencyMapper
 * 
 * Tests universal properties that should hold across all valid inputs
 * using fast-check for property generation.
 * 
 * **Feature: titan-phase2-hunter, Property 5: POI Mitigation Consistency**
 * **Validates: Requirements 3.6**
 */

import * as fc from 'fast-check';
import { InefficiencyMapper } from '../../src/engine/InefficiencyMapper';
import { FVG, OrderBlock, LiquidityPool, POI } from '../../src/types';

describe('InefficiencyMapper Property Tests', () => {
  let mapper: InefficiencyMapper;

  beforeEach(() => {
    mapper = new InefficiencyMapper();
  });

  /**
   * Generator for valid FVG (Fair Value Gap) POIs
   */
  const fvgArbitrary = fc.record({
    type: fc.constantFrom('BULLISH' as const, 'BEARISH' as const),
    basePrice: fc.float({ min: Math.fround(10), max: Math.fround(1000), noNaN: true }),
    gapSize: fc.float({ min: Math.fround(0.1), max: Math.fround(5), noNaN: true }), // Gap size as percentage
    barIndex: fc.integer({ min: 2, max: 100 }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    fillPercent: fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true })
  }).map((data): FVG => {
    const basePrice = Math.round(data.basePrice * 100) / 100;
    const gapSize = basePrice * (data.gapSize / 100);
    
    let top: number, bottom: number;
    if (data.type === 'BULLISH') {
      bottom = basePrice;
      top = basePrice + gapSize;
    } else {
      top = basePrice;
      bottom = basePrice - gapSize;
    }
    
    return {
      type: data.type,
      top: Math.round(top * 100) / 100,
      bottom: Math.round(bottom * 100) / 100,
      midpoint: Math.round(((top + bottom) / 2) * 100) / 100,
      barIndex: data.barIndex,
      timestamp: data.timestamp,
      mitigated: false,
      fillPercent: data.fillPercent
    };
  });

  /**
   * Generator for valid Order Block POIs
   */
  const orderBlockArbitrary = fc.record({
    type: fc.constantFrom('BULLISH' as const, 'BEARISH' as const),
    basePrice: fc.float({ min: Math.fround(10), max: Math.fround(1000), noNaN: true }),
    range: fc.float({ min: Math.fround(0.1), max: Math.fround(3), noNaN: true }), // Range as percentage
    barIndex: fc.integer({ min: 0, max: 100 }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    confidence: fc.float({ min: Math.fround(30), max: Math.fround(100), noNaN: true })
  }).map((data): OrderBlock => {
    const basePrice = Math.round(data.basePrice * 100) / 100;
    const range = basePrice * (data.range / 100);
    const low = Math.round((basePrice - range / 2) * 100) / 100;
    const high = Math.round((basePrice + range / 2) * 100) / 100;
    
    return {
      type: data.type,
      high,
      low,
      barIndex: data.barIndex,
      timestamp: data.timestamp,
      mitigated: false,
      confidence: data.confidence
    };
  });

  /**
   * Generator for valid Liquidity Pool POIs
   */
  const liquidityPoolArbitrary = fc.record({
    type: fc.constantFrom('HIGH' as const, 'LOW' as const),
    price: fc.float({ min: Math.fround(10), max: Math.fround(1000), noNaN: true }),
    strength: fc.float({ min: Math.fround(20), max: Math.fround(100), noNaN: true }),
    barIndex: fc.integer({ min: 0, max: 100 }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 })
  }).map((data): LiquidityPool => ({
    type: data.type,
    price: Math.round(data.price * 100) / 100,
    strength: data.strength,
    barIndex: data.barIndex,
    timestamp: data.timestamp,
    swept: false
  }));

  /**
   * Generator for any POI type
   */
  const poiArbitrary = fc.oneof(
    fvgArbitrary,
    orderBlockArbitrary,
    liquidityPoolArbitrary
  );

  /**
   * Generator for price sequences that could affect POI mitigation
   */
  const priceSequenceArbitrary = fc.record({
    basePOI: poiArbitrary,
    priceCount: fc.integer({ min: 1, max: 20 })
  }).chain(({ basePOI, priceCount }) => {
    const poiPrice = getPOIPrice(basePOI);
    
    return fc.record({
      poi: fc.constant(basePOI),
      prices: fc.array(
        fc.float({ 
          min: Math.fround(poiPrice * 0.8), 
          max: Math.fround(poiPrice * 1.2), 
          noNaN: true 
        }).map(p => Math.round(p * 100) / 100),
        { minLength: priceCount, maxLength: priceCount }
      )
    });
  });

  /**
   * Helper function to get representative price of a POI
   */
  function getPOIPrice(poi: POI): number {
    if ('midpoint' in poi) {
      return poi.midpoint; // FVG
    } else if ('high' in poi && 'low' in poi) {
      return (poi.high + poi.low) / 2; // Order Block
    } else {
      return poi.price; // Liquidity Pool
    }
  }

  /**
   * Helper function to create a mitigating price for a POI
   */
  function createMitigatingPrice(poi: POI): number {
    if ('midpoint' in poi) {
      const fvg = poi as FVG;
      // For FVG, mitigation occurs when price fills the gap
      if (fvg.type === 'BULLISH') {
        return fvg.bottom - 0.01; // Below bottom
      } else {
        return fvg.top + 0.01; // Above top
      }
    } else if ('high' in poi && 'low' in poi) {
      const ob = poi as OrderBlock;
      // For Order Block, mitigation occurs when price closes through it
      if (ob.type === 'BULLISH') {
        return ob.low - 0.01; // Below low
      } else {
        return ob.high + 0.01; // Above high
      }
    } else {
      const pool = poi as LiquidityPool;
      // For Liquidity Pool, mitigation occurs when swept
      const sweepThreshold = 0.001; // 0.1%
      if (pool.type === 'HIGH') {
        return pool.price * (1 + sweepThreshold + 0.001); // Above sweep threshold
      } else {
        return pool.price * (1 - sweepThreshold - 0.001); // Below sweep threshold
      }
    }
  }

  /**
   * Property 5: POI Mitigation Consistency
   * 
   * For any POI, once mitigated, it should remain mitigated regardless of subsequent price action.
   * This tests that the validatePOI() function maintains mitigation state consistently.
   * 
   * **Validates: Requirements 3.6**
   */
  it('Property 5: POI mitigation should be consistent and permanent', () => {
    fc.assert(
      fc.property(priceSequenceArbitrary, ({ poi, prices }) => {
        // Create a deep copy of the POI to avoid mutation between tests
        const testPOI = JSON.parse(JSON.stringify(poi)) as POI;
        
        // Track validation results for each price
        const validationResults: boolean[] = [];
        let mitigationOccurred = false;
        let mitigationPrice: number | null = null;
        
        // Test validation with each price in sequence
        for (const price of prices) {
          const isValid = mapper.validatePOI(testPOI, price);
          validationResults.push(isValid);
          
          // Track when mitigation first occurs
          if (!mitigationOccurred && !isValid) {
            mitigationOccurred = true;
            mitigationPrice = price;
          }
          
          // Once mitigated, POI should remain invalid for all subsequent prices
          if (mitigationOccurred) {
            expect(isValid).toBe(false);
          }
        }
        
        // If mitigation occurred, test with additional prices to ensure consistency
        if (mitigationOccurred && mitigationPrice !== null) {
          // Test with various prices after mitigation
          const postMitigationPrices = [
            mitigationPrice,
            mitigationPrice * 0.95,
            mitigationPrice * 1.05,
            getPOIPrice(testPOI) * 0.9,
            getPOIPrice(testPOI) * 1.1
          ];
          
          for (const postPrice of postMitigationPrices) {
            const isValid = mapper.validatePOI(testPOI, postPrice);
            expect(isValid).toBe(false);
          }
        }
      }),
      {
        numRuns: 100, // Run 100 iterations as specified in requirements
        verbose: true,
        seed: 42 // Fixed seed for reproducible tests
      }
    );
  });

  /**
   * Property 6: POI Mitigation Triggers
   * 
   * For any POI, when price reaches the mitigation level, the POI should become invalid.
   * This tests that mitigation triggers work correctly for all POI types.
   */
  it('Property 6: POI mitigation should trigger at correct price levels', () => {
    fc.assert(
      fc.property(poiArbitrary, (poi) => {
        // Create a deep copy to avoid mutation
        const testPOI = JSON.parse(JSON.stringify(poi)) as POI;
        
        // Test that POI is initially valid at its own price level
        const poiPrice = getPOIPrice(testPOI);
        const initiallyValid = mapper.validatePOI(testPOI, poiPrice);
        expect(initiallyValid).toBe(true);
        
        // Create a mitigating price and test that POI becomes invalid
        const mitigatingPrice = createMitigatingPrice(testPOI);
        const mitigatedValid = mapper.validatePOI(testPOI, mitigatingPrice);
        expect(mitigatedValid).toBe(false);
        
        // Test that POI remains invalid after mitigation
        const postMitigationValid = mapper.validatePOI(testPOI, mitigatingPrice);
        expect(postMitigationValid).toBe(false);
      }),
      {
        numRuns: 100,
        verbose: true,
        seed: 42
      }
    );
  });

  /**
   * Property 7: POI Validation Immutability
   * 
   * The validatePOI function should not modify the input POI structure
   * (except for internal state updates like fillPercent, confidence decay).
   */
  it('Property 7: POI structure should remain consistent during validation', () => {
    fc.assert(
      fc.property(
        fc.record({
          poi: poiArbitrary,
          price: fc.float({ min: Math.fround(1), max: Math.fround(2000), noNaN: true })
        }),
        ({ poi, price }) => {
          // Create deep copy to compare
          const originalPOI = JSON.parse(JSON.stringify(poi));
          const testPOI = JSON.parse(JSON.stringify(poi)) as POI;
          
          // Validate POI
          mapper.validatePOI(testPOI, price);
          
          // Core structure should remain the same
          expect(testPOI.barIndex).toBe(originalPOI.barIndex);
          expect(testPOI.timestamp).toBe(originalPOI.timestamp);
          expect(testPOI.type).toBe(originalPOI.type);
          
          // Type-specific structure checks
          if ('midpoint' in testPOI) {
            const fvg = testPOI as FVG;
            const originalFVG = originalPOI as FVG;
            expect(fvg.top).toBe(originalFVG.top);
            expect(fvg.bottom).toBe(originalFVG.bottom);
            expect(fvg.midpoint).toBe(originalFVG.midpoint);
            // fillPercent may change during validation
          } else if ('high' in testPOI && 'low' in testPOI) {
            const ob = testPOI as OrderBlock;
            const originalOB = originalPOI as OrderBlock;
            expect(ob.high).toBe(originalOB.high);
            expect(ob.low).toBe(originalOB.low);
            // confidence may decay during validation
          } else {
            const pool = testPOI as LiquidityPool;
            const originalPool = originalPOI as LiquidityPool;
            expect(pool.price).toBe(originalPool.price);
            // strength may decay during validation
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
   * Property 8: POI Validation Determinism
   * 
   * For the same POI and price, validatePOI should always return the same result.
   */
  it('Property 8: POI validation should be deterministic', () => {
    fc.assert(
      fc.property(
        fc.record({
          poi: poiArbitrary,
          price: fc.float({ min: Math.fround(1), max: Math.fround(2000), noNaN: true })
        }),
        ({ poi, price }) => {
          // Create two identical copies
          const testPOI1 = JSON.parse(JSON.stringify(poi)) as POI;
          const testPOI2 = JSON.parse(JSON.stringify(poi)) as POI;
          
          // Validate both with same price
          const result1 = mapper.validatePOI(testPOI1, price);
          const result2 = mapper.validatePOI(testPOI2, price);
          
          // Results should be identical
          expect(result1).toBe(result2);
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