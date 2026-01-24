/**
 * Unit Tests for ScoringEngine
 *
 * Tests enhanced scoring formula, alignment classification, and veto logic.
 */

import { ScoringEngine } from "../../src/engine/ScoringEngine";
import {
    BotTrapAnalysis,
    FlowValidation,
    GlobalCVDData,
    HologramState,
    OracleScore,
    TimeframeState,
    TrendState,
} from "../../src/types";

describe("ScoringEngine", () => {
    let scoringEngine: ScoringEngine;

    beforeEach(() => {
        scoringEngine = new ScoringEngine();
    });

    // Helper to create a minimal HologramState for scoring
    const createMockHologram = (
        dailyTrend: TrendState = "BULL",
        h4Trend: TrendState = "BULL",
        h4Location: "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM" = "DISCOUNT",
        m15Trend: TrendState = "BULL",
        m15MSS: boolean = true,
    ): HologramState => ({
        symbol: "BTCUSDT",
        timestamp: Date.now(),
        daily: {
            timeframe: "1D",
            trend: dailyTrend,
            location: "DISCOUNT", // Not used directly by scorer currently, usually
            dealingRange: {} as any,
            fractals: [],
            bos: [],
            mss: null,
            currentPrice: 100,
        } as TimeframeState,
        h4: {
            timeframe: "4H",
            trend: h4Trend,
            location: h4Location,
            dealingRange: {} as any,
            fractals: [],
            bos: [],
            mss: null,
            currentPrice: 100,
        } as TimeframeState,
        m15: {
            timeframe: "15m",
            trend: m15Trend,
            mss: m15MSS
                ? {
                    direction: "BULLISH",
                    price: 100,
                    barIndex: 1,
                    timestamp: 100,
                    significance: 80,
                }
                : null,
            dealingRange: {} as any,
            fractals: [],
            bos: [],
            currentPrice: 100,
            location: "DISCOUNT",
        } as TimeframeState,
        alignmentScore: 0,
        status: "CONFLICT",
        veto: { vetoed: false, reason: null, direction: null },
        rsScore: 0,
        direction: null,
    });

    describe("calculateEnhancedScore", () => {
        it("should return high score for perfect alignment", () => {
            // Daily BULL, 4H DISCOUNT (Aligned), 15m BULL + MSS
            const hologram = createMockHologram(
                "BULL",
                "BULL",
                "DISCOUNT",
                "BULL",
                true,
            );

            const result = scoringEngine.calculateEnhancedScore(
                hologram,
                null,
                null,
                null,
                null,
            );

            // Daily(100)*0.4 + 4H(100)*0.25 + 15m(100)*0.15 + Oracle(50)*0.2
            // 40 + 25 + 15 + 10 = 90
            expect(result.rawScore).toBe(90);
        });

        it("should return lower score for misalignment", () => {
            // Daily BULL, 4H PREMIUM (Misaligned), 15m BEAR
            const hologram = createMockHologram(
                "BULL",
                "BEAR",
                "PREMIUM",
                "BEAR",
                false,
            );

            const result = scoringEngine.calculateEnhancedScore(
                hologram,
                null,
                null,
                null,
                null,
            );

            // Daily(100)*0.4 + 4H(30)*0.25 + 15m(50)*0.15 + Oracle(50)*0.2
            // 40 + 7.5 + 7.5 + 10 = 65
            expect(result.rawScore).toBe(65);
        });
    });

    it("should apply bot trap penalty", () => {
        // Daily BULL, 4H DISCOUNT (Aligned), 15m BULL + MSS
        const hologram = createMockHologram(
            "BULL",
            "BULL",
            "DISCOUNT",
            "BULL",
            true,
        );
        const botTrapClean: BotTrapAnalysis = {
            isSuspect: false,
            suspicionScore: 10,
            patterns: [],
            recommendations: [],
            timestamp: new Date(),
        };
        const botTrapSuspect: BotTrapAnalysis = {
            isSuspect: true,
            suspicionScore: 80,
            patterns: [],
            recommendations: [],
            timestamp: new Date(),
        };

        const cleanResult = scoringEngine.calculateEnhancedScore(
            hologram,
            null,
            null,
            botTrapClean,
            null,
        );
        const suspectResult = scoringEngine.calculateEnhancedScore(
            hologram,
            null,
            null,
            botTrapSuspect,
            null,
        );

        expect(suspectResult.rawScore).toBeLessThan(cleanResult.rawScore);
        expect(suspectResult.reasoning).toContain("Bot trap penalty applied");
    });

    it("should handle null enhancement data gracefully", () => {
        const hologram = createMockHologram(
            "BULL",
            "BULL",
            "DISCOUNT",
            "BULL",
            true,
        );
        const result = scoringEngine.calculateEnhancedScore(
            hologram,
            null,
            null,
            null,
            null,
        );
        expect(result.rawScore).toBeGreaterThan(0);
    });

    describe("determineAlignment", () => {
        it("should return A+ for high score", () => {
            const alignment = scoringEngine.determineAlignment(
                85,
                null,
                null,
                null,
                null,
            );
            expect(alignment).toBe("A+");
        });

        it("should return B for medium score", () => {
            const alignment = scoringEngine.determineAlignment(
                65,
                null,
                null,
                null,
                null,
            );
            expect(alignment).toBe("B");
        });

        it("should veto if score is too low", () => {
            const alignment = scoringEngine.determineAlignment(
                30,
                null,
                null,
                null,
                null,
            );
            expect(alignment).toBe("VETO");
        });

        it("should veto if Oracle vetoes", () => {
            const oracle: OracleScore = {
                sentiment: 0,
                confidence: 0,
                veto: true,
                vetoReason: "Risk",
                timestamp: new Date(),
                events: [],
                convictionMultiplier: 1,
            };
            const alignment = scoringEngine.determineAlignment(
                90,
                oracle,
                null,
                null,
                null,
            );
            expect(alignment).toBe("VETO");
        });
    });
});
