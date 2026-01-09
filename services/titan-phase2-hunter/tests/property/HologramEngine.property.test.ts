/**
 * Property-Based Tests for HologramEngine
 * 
 * Tests universal properties that should hold across all valid inputs
 * using fast-check for property generation.
 * 
 * **Feature: titan-phase2-hunter, Property 2: Alignment Score Monotonicity**
 * **Validates: Requirements 2.2**
 */

import * as fc from 'fast-check';
import { HologramEngine } from '../../src/engine/HologramEngine';
import { TimeframeState, TrendState, DealingRange, Fractal, BOS, MSS } from '../../src/types';

describe('HologramEngine Property Tests', () => {

  /**
   * Generator for valid DealingRange
   */
  const dealingRangeArbitrary = fc.record({
    basePrice: fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }),
    rangePercent: fc.float({ min: Math.fround(0.01), max: Math.fround(0.1), noNaN: true }) // 1-10% range
  }).map((data): DealingRange => {
    const low = Math.round(data.basePrice * 100) / 100;
    const high = Math.round((data.basePrice * (1 + data.rangePercent)) * 100) / 100;
    const midpoint = (high + low) / 2;
    
    return {
      high,
      low,
      midpoint,
      premiumThreshold: midpoint,
      discountThreshold: midpoint,
      range: high - low
    };
  });

  /**
   * Generator for valid Fractal
   */
  const fractalArbitrary = fc.record({
    type: fc.constantFrom('HIGH' as const, 'LOW' as const),
    price: fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }),
    barIndex: fc.integer({ min: 2, max: 100 }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    confirmed: fc.boolean()
  });

  /**
   * Generator for valid BOS
   */
  const bosArbitrary = fc.record({
    direction: fc.constantFrom('BULLISH' as const, 'BEARISH' as const),
    price: fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }),
    barIndex: fc.integer({ min: 0, max: 100 }),
    timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
    fractalsBreached: fc.array(fractalArbitrary, { minLength: 0, maxLength: 3 })
  });

  /**
   * Generator for valid MSS (can be null)
   */
  const mssArbitrary = fc.oneof(
    fc.constant(null),
    fc.record({
      direction: fc.constantFrom('BULLISH' as const, 'BEARISH' as const),
      price: fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }),
      barIndex: fc.integer({ min: 0, max: 100 }),
      timestamp: fc.integer({ min: 1000000000, max: 2000000000 }),
      significance: fc.integer({ min: 0, max: 100 })
    })
  );

  /**
   * Generator for valid TimeframeState
   */
  const timeframeStateArbitrary = fc.record({
    timeframe: fc.constantFrom('1D' as const, '4H' as const, '15m' as const),
    trend: fc.constantFrom('BULL' as const, 'BEAR' as const, 'RANGE' as const),
    dealingRange: dealingRangeArbitrary,
    currentPrice: fc.float({ min: Math.fround(10), max: Math.fround(100), noNaN: true }),
    location: fc.constantFrom('PREMIUM' as const, 'DISCOUNT' as const, 'EQUILIBRIUM' as const),
    fractals: fc.array(fractalArbitrary, { minLength: 0, maxLength: 10 }),
    bos: fc.array(bosArbitrary, { minLength: 0, maxLength: 5 }),
    mss: mssArbitrary
  });

  /**
   * Generator for pairs of TimeframeStates where ONLY Daily-4H agreement changes
   * This creates scenarios where we can test the isolated effect of Daily-4H agreement
   */
  const agreementChangeArbitrary = fc.tuple(
    timeframeStateArbitrary, // base daily
    timeframeStateArbitrary, // base h4
    timeframeStateArbitrary, // base m15
    fc.constantFrom('BULL' as const, 'BEAR' as const) // agreed trend (non-RANGE only)
  ).map(([baseDaily, baseH4, baseM15, agreedTrend]) => {
    // Create a disagreement trend (opposite of agreed trend)
    const disagreeTrend = agreedTrend === 'BULL' ? 'BEAR' : 'BULL';
    
    // Create scenario 1: Daily and 4H DISAGREE (different non-RANGE trends)
    const daily1 = { ...baseDaily, trend: agreedTrend as TrendState };
    const h4_1 = { ...baseH4, trend: disagreeTrend as TrendState };
    
    // Create scenario 2: Daily and 4H AGREE (same non-RANGE trend)
    const daily2 = { ...baseDaily, trend: agreedTrend as TrendState };
    const h4_2 = { ...baseH4, trend: agreedTrend as TrendState };
    
    // CRITICAL: Ensure 4H-15m agreement is IDENTICAL in both scenarios
    // We need to control whether 4H-15m agree or disagree, but keep it consistent
    // across both scenarios to isolate the Daily-4H effect
    
    // Option 1: Make 4H-15m DISAGREE in both scenarios (most isolated test)
    // This ensures only Daily-4H agreement changes, no other factors
    const m15_controlled = { 
      ...baseM15, 
      trend: 'RANGE' as TrendState, // RANGE never agrees with BULL/BEAR
      mss: null // Remove MSS to avoid +20 points
    };
    
    return {
      scenario1: {
        daily: daily1,
        h4: h4_1,
        m15: m15_controlled
      },
      scenario2: {
        daily: daily2,
        h4: h4_2,
        m15: m15_controlled // Exactly the same m15 in both scenarios
      },
      agreementIncreased: true // Always true since we ensure disagreement -> agreement
    };
  });

  /**
   * Property 2: Alignment Score Monotonicity
   * 
   * For any hologram state, if Daily-4H agreement increases while all other factors
   * remain constant, alignment score should increase by exactly 50 points.
   * This tests the isolated contribution of Daily-4H agreement to the alignment score.
   * 
   * **Validates: Requirements 2.2**
   */
  it('Property 2: Alignment score should increase by exactly 50 when Daily-4H agreement increases', () => {
    fc.assert(
      fc.property(agreementChangeArbitrary, (data) => {
        const { scenario1, scenario2 } = data;
        
        // Create a mock HologramEngine instance for testing
        // We don't need the actual BybitPerpsClient for this pure function test
        const engine = new HologramEngine({} as any);
        
        // Calculate alignment scores for both scenarios
        const score1 = engine.calcAlignmentScore(scenario1.daily, scenario1.h4, scenario1.m15);
        const score2 = engine.calcAlignmentScore(scenario2.daily, scenario2.h4, scenario2.m15);
        
        // Verify scores are within valid range
        expect(score1).toBeGreaterThanOrEqual(0);
        expect(score1).toBeLessThanOrEqual(100);
        expect(score2).toBeGreaterThanOrEqual(0);
        expect(score2).toBeLessThanOrEqual(100);
        
        // Main property: When Daily-4H agreement increases with all other factors constant,
        // score should increase by exactly 50 points (the Daily-4H agreement contribution)
        // 
        // Scenario1: Daily and 4H disagree (different non-RANGE trends), M15=RANGE, no MSS
        // Scenario2: Daily and 4H agree (same non-RANGE trend), M15=RANGE, no MSS
        // Expected: score2 = score1 + 50
        const scoreDifference = score2 - score1;
        expect(scoreDifference).toBe(50);
        
        // Additional verification: Ensure monotonicity (score should not decrease)
        expect(score2).toBeGreaterThanOrEqual(score1);
        
        // Debug logging for failed cases
        if (scoreDifference !== 50) {
          console.log('DEBUG: Score difference not exactly 50');
          console.log('Scenario 1 - Daily:', scenario1.daily.trend, 'H4:', scenario1.h4.trend, 'M15:', scenario1.m15.trend, 'Score:', score1);
          console.log('Scenario 2 - Daily:', scenario2.daily.trend, 'H4:', scenario2.h4.trend, 'M15:', scenario2.m15.trend, 'Score:', score2);
          console.log('M15 MSS:', scenario1.m15.mss);
          console.log('Score difference:', scoreDifference);
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
   * Property 3: Alignment Score Components
   * 
   * Verify that each component of the alignment score contributes correctly:
   * - Daily-4H agreement: 50 points
   * - 4H-15m agreement: 30 points  
   * - 15m MSS confirmation: 20 points
   */
  it('Property 3: Alignment score components should contribute correct values', () => {
    fc.assert(
      fc.property(
        timeframeStateArbitrary,
        timeframeStateArbitrary,
        timeframeStateArbitrary,
        (daily, h4, m15) => {
          const engine = new HologramEngine({} as any);
          
          // Test base case: no agreements
          const dailyDisagree = { ...daily, trend: 'BULL' as TrendState };
          const h4Disagree = { ...h4, trend: 'BEAR' as TrendState };
          const m15NoMSS = { ...m15, trend: 'RANGE' as TrendState, mss: null };
          
          const baseScore = engine.calcAlignmentScore(dailyDisagree, h4Disagree, m15NoMSS);
          expect(baseScore).toBe(0);
          
          // Test Daily-4H agreement adds 50 points
          const h4Agree = { ...h4Disagree, trend: 'BULL' as TrendState };
          const dailyH4Score = engine.calcAlignmentScore(dailyDisagree, h4Agree, m15NoMSS);
          expect(dailyH4Score).toBe(50);
          
          // Test 4H-15m agreement adds 30 points
          const m15Agree = { ...m15NoMSS, trend: 'BULL' as TrendState };
          const h4M15Score = engine.calcAlignmentScore(dailyDisagree, h4Agree, m15Agree);
          expect(h4M15Score).toBe(80); // 50 + 30
          
          // Test MSS confirmation adds 20 points
          const m15WithMSS = { 
            ...m15Agree, 
            mss: {
              direction: 'BULLISH' as const,
              price: 50,
              barIndex: 10,
              timestamp: Date.now(),
              significance: 80
            }
          };
          const fullScore = engine.calcAlignmentScore(dailyDisagree, h4Agree, m15WithMSS);
          expect(fullScore).toBe(100); // 50 + 30 + 20
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
   * Property 4: Alignment Score Bounds
   * 
   * Verify that alignment scores are always within the valid range [0, 100]
   */
  it('Property 4: Alignment score should always be within bounds [0, 100]', () => {
    fc.assert(
      fc.property(
        timeframeStateArbitrary,
        timeframeStateArbitrary,
        timeframeStateArbitrary,
        (daily, h4, m15) => {
          const engine = new HologramEngine({} as any);
          const score = engine.calcAlignmentScore(daily, h4, m15);
          
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
          expect(Number.isInteger(score)).toBe(true); // Should be integer
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
   * Property 5: RANGE Trend Handling
   * 
   * Verify that RANGE trends are handled correctly (no agreement points awarded)
   */
  it('Property 5: RANGE trends should not contribute to agreement scores', () => {
    fc.assert(
      fc.property(
        timeframeStateArbitrary,
        timeframeStateArbitrary,
        timeframeStateArbitrary,
        (daily, h4, m15) => {
          const engine = new HologramEngine({} as any);
          
          // Set all trends to RANGE
          const dailyRange = { ...daily, trend: 'RANGE' as TrendState };
          const h4Range = { ...h4, trend: 'RANGE' as TrendState };
          const m15Range = { ...m15, trend: 'RANGE' as TrendState, mss: null };
          
          const score = engine.calcAlignmentScore(dailyRange, h4Range, m15Range);
          
          // Should be 0 since RANGE trends don't count as agreement
          expect(score).toBe(0);
          
          // Test mixed scenarios with RANGE
          const dailyBull = { ...daily, trend: 'BULL' as TrendState };
          const mixedScore = engine.calcAlignmentScore(dailyBull, h4Range, m15Range);
          expect(mixedScore).toBe(0); // No agreement with RANGE
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
   * Property 6: Veto Logic Correctness
   * 
   * For any hologram state where Daily is BULLISH and 4H is PREMIUM, veto should block Long signals.
   * For any hologram state where Daily is BEARISH and 4H is DISCOUNT, veto should block Short signals.
   * This tests the core veto logic that prevents buying expensive and selling cheap.
   * 
   * **Validates: Requirements 1.3, 1.4**
   */
  it('Property 6: Veto logic should correctly block inappropriate signals', () => {
    fc.assert(
      fc.property(
        timeframeStateArbitrary,
        timeframeStateArbitrary,
        (daily, h4) => {
          const engine = new HologramEngine({} as any);
          
          // Test Case 1: Daily BULLISH + 4H PREMIUM should veto LONG
          const dailyBullish = { ...daily, trend: 'BULL' as TrendState };
          const h4Premium = { ...h4, location: 'PREMIUM' as const };
          
          const vetoResult1 = engine.applyVetoLogic(dailyBullish, h4Premium);
          
          expect(vetoResult1.vetoed).toBe(true);
          expect(vetoResult1.direction).toBe('LONG');
          expect(vetoResult1.reason).toContain('PREMIUM');
          expect(vetoResult1.reason).toContain('too expensive');
          
          // Test Case 2: Daily BEARISH + 4H DISCOUNT should veto SHORT
          const dailyBearish = { ...daily, trend: 'BEAR' as TrendState };
          const h4Discount = { ...h4, location: 'DISCOUNT' as const };
          
          const vetoResult2 = engine.applyVetoLogic(dailyBearish, h4Discount);
          
          expect(vetoResult2.vetoed).toBe(true);
          expect(vetoResult2.direction).toBe('SHORT');
          expect(vetoResult2.reason).toContain('DISCOUNT');
          expect(vetoResult2.reason).toContain('too cheap');
          
          // Test Case 3: Valid combinations should NOT be vetoed
          // Daily BULLISH + 4H DISCOUNT = Valid LONG setup
          const h4DiscountValid = { ...h4, location: 'DISCOUNT' as const };
          const vetoResult3 = engine.applyVetoLogic(dailyBullish, h4DiscountValid);
          
          expect(vetoResult3.vetoed).toBe(false);
          expect(vetoResult3.direction).toBe(null);
          expect(vetoResult3.reason).toBe(null);
          
          // Daily BEARISH + 4H PREMIUM = Valid SHORT setup
          const h4PremiumValid = { ...h4, location: 'PREMIUM' as const };
          const vetoResult4 = engine.applyVetoLogic(dailyBearish, h4PremiumValid);
          
          expect(vetoResult4.vetoed).toBe(false);
          expect(vetoResult4.direction).toBe(null);
          expect(vetoResult4.reason).toBe(null);
          
          // Test Case 4: RANGE trend should not trigger veto
          const dailyRange = { ...daily, trend: 'RANGE' as TrendState };
          const vetoResult5 = engine.applyVetoLogic(dailyRange, h4Premium);
          
          expect(vetoResult5.vetoed).toBe(false);
          
          // Test Case 5: EQUILIBRIUM location should not trigger veto
          const h4Equilibrium = { ...h4, location: 'EQUILIBRIUM' as const };
          const vetoResult6 = engine.applyVetoLogic(dailyBullish, h4Equilibrium);
          
          expect(vetoResult6.vetoed).toBe(false);
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