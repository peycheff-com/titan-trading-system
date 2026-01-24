/**
 * Unit Tests for ConvictionSizingEngine
 *
 * Tests position sizing logic based on conviction levels and enhancement factors.
 */

import {
    ConvictionSizingEngine,
} from "../../src/engine/ConvictionSizingEngine";
import {
    BotTrapAnalysis,
    FlowValidation,
    GlobalCVDData,
    OracleScore,
} from "../../src/types";

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createMockOracleScore(
    sentiment: number = 60,
    confidence: number = 80,
    veto: boolean = false,
): OracleScore {
    return {
        sentiment,
        confidence,
        events: [],
        veto,
        vetoReason: veto ? "Test veto" : null,
        convictionMultiplier: sentiment >= 60 ? 1.5 : 1.0,
        timestamp: new Date(),
    };
}

function createMockFlowValidation(
    isValid: boolean = true,
    flowType: "passive_absorption" | "aggressive_pushing" | "neutral" =
        "passive_absorption",
    institutionalProbability: number = 75,
): FlowValidation {
    return {
        isValid,
        confidence: 80,
        flowType,
        sweepCount: 2,
        icebergDensity: 60,
        institutionalProbability,
        timestamp: new Date(),
    };
}

function createMockBotTrapAnalysis(
    isSuspect: boolean = false,
    suspicionScore: number = 20,
): BotTrapAnalysis {
    return {
        isSuspect,
        suspicionScore,
        patterns: [],
        recommendations: isSuspect
            ? [{
                action: "reduce_size",
                reasoning: "Suspect pattern detected",
                adjustments: {
                    positionSizeMultiplier: 0.5,
                    stopLossAdjustment: 0.01,
                    confirmationThreshold: 1.5,
                },
            }]
            : [],
        timestamp: new Date(),
    };
}

function createMockGlobalCVD(
    consensus: "bullish" | "bearish" | "neutral" | "conflicted" = "bullish",
    confidence: number = 80,
    manipulationDetected: boolean = false,
): GlobalCVDData {
    return {
        aggregatedCVD: consensus === "bullish"
            ? 1000
            : consensus === "bearish"
            ? -1000
            : 0,
        exchangeFlows: [],
        consensus,
        confidence,
        manipulation: {
            detected: manipulationDetected,
            suspectExchange: manipulationDetected ? "binance" : null,
            divergenceScore: manipulationDetected ? 85 : 10,
            pattern: manipulationDetected ? "single_exchange_outlier" : "none",
        },
        timestamp: new Date(),
    };
}

describe("ConvictionSizingEngine", () => {
    let sizingEngine: ConvictionSizingEngine;

    beforeEach(() => {
        sizingEngine = new ConvictionSizingEngine();
    });

    describe("calculatePositionSize", () => {
        test("should calculate position size with all factors", () => {
            const result = sizingEngine.calculatePositionSize(
                1000,
                createMockOracleScore(60, 80),
                createMockFlowValidation(true, "passive_absorption", 75),
                createMockBotTrapAnalysis(false, 10),
                createMockGlobalCVD("bullish", 80),
            );

            expect(result.baseSize).toBe(1000);
            expect(result.finalSize).toBeGreaterThan(0);
            expect(result.cappedAt).toBe(2.0);
        });

        test("should cap multiplier at 2.0x (Requirement 7.5)", () => {
            // Create very bullish conditions
            const result = sizingEngine.calculatePositionSize(
                1000,
                createMockOracleScore(100, 100), // Max bullish
                createMockFlowValidation(true, "passive_absorption", 100),
                createMockBotTrapAnalysis(false, 0),
                createMockGlobalCVD("bullish", 100),
            );

            expect(result.finalSize).toBeLessThanOrEqual(1000 * 2.0);
        });

        test("should reduce size for bot trap (Requirement 3.5)", () => {
            const cleanResult = sizingEngine.calculatePositionSize(
                1000,
                createMockOracleScore(60, 80),
                createMockFlowValidation(true),
                createMockBotTrapAnalysis(false, 10),
                createMockGlobalCVD("bullish", 80),
            );

            const trapResult = sizingEngine.calculatePositionSize(
                1000,
                createMockOracleScore(60, 80),
                createMockFlowValidation(true),
                createMockBotTrapAnalysis(true, 80), // Suspect trap
                createMockGlobalCVD("bullish", 80),
            );

            expect(trapResult.finalSize).toBeLessThan(cleanResult.finalSize);
            expect(trapResult.trapReduction).toBeLessThan(1.0);
        });

        test("should use conservative multiplier on conflicts (Requirement 7.6)", () => {
            const engine = new ConvictionSizingEngine({
                useConservativeSelection: true,
            });

            const result = engine.calculatePositionSize(
                1000,
                createMockOracleScore(-40, 80), // Bearish Oracle
                createMockFlowValidation(true, "passive_absorption", 75), // Bullish Flow
                createMockBotTrapAnalysis(false, 10),
                createMockGlobalCVD("bullish", 80), // Bullish CVD
            );

            // Should use conservative (lower) multiplier
            expect(result.reasoning).toContain(
                "Using conservative multiplier selection",
            );
        });

        test("should handle null enhancement data", () => {
            const result = sizingEngine.calculatePositionSize(
                1000,
                null,
                null,
                null,
                null,
            );

            expect(result.baseSize).toBe(1000);
            expect(result.oracleMultiplier).toBe(1.0);
            expect(result.flowMultiplier).toBe(1.0);
            expect(result.trapReduction).toBe(1.0);
            expect(result.globalCVDMultiplier).toBe(1.0);
        });
    });
});
