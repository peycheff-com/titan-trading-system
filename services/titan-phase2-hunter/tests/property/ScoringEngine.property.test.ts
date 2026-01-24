/**
 * Property-Based Tests for ScoringEngine
 *
 * Validates the enhanced scoring logic (Requirement 5.1) and alignment criteria (Requirement 5.2).
 */

import * as fc from "fast-check";
import { ScoringEngine } from "../../src/engine/ScoringEngine";
import {
  BotTrapAnalysis,
  FlowValidation,
  GlobalCVDData,
  HologramState,
  HologramStatus,
  OracleScore,
  TimeframeState,
  TrendState,
  VetoResult,
} from "../../src/types";

describe("ScoringEngine Property Tests", () => {
  // --- Arbitraries ---

  // Basic Fractal/Price Arbitraries (Simplified for Scoring)
  const timeframeStateArbitrary = fc.record({
    timeframe: fc.constantFrom("1D" as const, "4H" as const, "15m" as const),
    trend: fc.constantFrom("BULL" as const, "BEAR" as const, "RANGE" as const),
    location: fc.constantFrom(
      "PREMIUM" as const,
      "DISCOUNT" as const,
      "EQUILIBRIUM" as const,
    ),
    dealingRange: fc.constant({} as any),
    currentPrice: fc.float(),
    fractals: fc.constant([]),
    bos: fc.constant([]),
    mss: fc.option(fc.constant({} as any)),
  });

  const hologramStateArbitrary = fc.record({
    symbol: fc.constant("BTCUSDT"),
    timestamp: fc.integer(),
    daily: timeframeStateArbitrary,
    h4: timeframeStateArbitrary,
    m15: timeframeStateArbitrary,
    alignmentScore: fc.constant(0),
    status: fc.constant("CONFLICT" as HologramStatus),
    veto: fc.constant(
      { vetoed: false, reason: null, direction: null } as VetoResult,
    ),
    rsScore: fc.float({ min: -1, max: 1 }),
    direction: fc.constant(null),
    flowScore: fc.float({ min: 0, max: 100 }),
  });

  // Enhancement Arbitraries
  const oracleScoreArbitrary = fc.option(fc.record({
    sentiment: fc.integer({ min: -100, max: 100 }),
    confidence: fc.integer({ min: 0, max: 100 }),
    timestamp: fc.date(),
    events: fc.constant([]),
    convictionMultiplier: fc.float({ min: 1, max: 3 }),
    veto: fc.boolean(),
    vetoReason: fc.oneof(fc.constant(null), fc.string()),
  }));

  // --- Tests ---

  it("Property: Enhanced Score must always be within [0, 100]", () => {
    fc.assert(
      fc.property(
        hologramStateArbitrary,
        oracleScoreArbitrary,
        (hologram, oracle) => {
          const engine = new ScoringEngine();
          const result = engine.calculateEnhancedScore(
            hologram as any,
            oracle as any,
            null,
            null,
            null,
          );

          expect(result.adjustedScore).toBeGreaterThanOrEqual(0);
          expect(result.adjustedScore).toBeLessThanOrEqual(100);
          expect(result.rawScore).toBeGreaterThanOrEqual(0);
          expect(result.rawScore).toBeLessThanOrEqual(100);
        },
      ),
    );
  });

  it("Property: Score increases when Daily Trend aligns", () => {
    fc.assert(
      fc.property(
        hologramStateArbitrary,
        (hologram) => {
          const engine = new ScoringEngine();

          const stateRange = {
            ...hologram,
            daily: { ...hologram.daily, trend: "RANGE" as const },
          };

          const stateBull = {
            ...hologram,
            daily: { ...hologram.daily, trend: "BULL" as const },
          };

          const scoreRange =
            engine.calculateEnhancedScore(
              stateRange as any,
              null,
              null,
              null,
              null,
            ).adjustedScore;
          const scoreBull =
            engine.calculateEnhancedScore(
              stateBull as any,
              null,
              null,
              null,
              null,
            ).adjustedScore;

          expect(scoreBull).toBeGreaterThanOrEqual(scoreRange);
        },
      ),
    );
  });

  it("Property: Higher Oracle Sentiment leads to higher score", () => {
    fc.assert(
      fc.property(
        hologramStateArbitrary,
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: -100, max: -1 }),
        (hologram, sentimentPos, sentimentNeg) => {
          const engine = new ScoringEngine();

          const oraclePos = {
            sentiment: sentimentPos,
            confidence: 80,
            veto: false,
            vetoReason: null,
            convictionMultiplier: 1.0,
            timestamp: new Date(),
            events: [],
          };
          const oracleNeg = {
            sentiment: sentimentNeg,
            confidence: 80,
            veto: false,
            vetoReason: null,
            convictionMultiplier: 1.0,
            timestamp: new Date(),
            events: [],
          };

          const scorePos =
            engine.calculateEnhancedScore(
              hologram as any,
              oraclePos,
              null,
              null,
              null,
            ).adjustedScore;
          const scoreNeg =
            engine.calculateEnhancedScore(
              hologram as any,
              oracleNeg,
              null,
              null,
              null,
            ).adjustedScore;

          expect(scorePos).toBeGreaterThan(scoreNeg);
        },
      ),
    );
  });
});
