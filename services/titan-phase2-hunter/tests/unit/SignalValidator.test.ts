/**
 * Unit Tests for SignalValidator
 *
 * Tests signal validation logic including enhancement integration.
 */

import { SignalValidator } from "../../src/engine/SignalValidator";
import {
    BotTrapAnalysis,
    FlowValidation,
    GlobalCVDData,
    OracleScore,
    TechnicalSignal,
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

function createMockTechnicalSignal(
    direction: "LONG" | "SHORT" = "LONG",
    confidence: number = 75,
): TechnicalSignal {
    return {
        symbol: "BTCUSDT",
        direction,
        confidence,
        entryPrice: 48000,
        stopLoss: 47000,
        takeProfit: 50000,
        timestamp: new Date(),
        source: "hologram",
    };
}

describe("SignalValidator", () => {
    let validator: SignalValidator;

    beforeEach(() => {
        validator = new SignalValidator();
    });

    describe("validateSignal", () => {
        test("should validate signal with all layers", () => {
            const signal = createMockTechnicalSignal("LONG", 75);

            const result = validator.validateSignal(
                signal,
                createMockOracleScore(60, 80),
                createMockFlowValidation(true),
                createMockBotTrapAnalysis(false, 10),
                createMockGlobalCVD("bullish", 80),
            );

            expect(result.isValid).toBe(true);
            expect(result.layerValidations.length).toBe(4);
            expect(result.recommendation).toBe("proceed");
        });

        test("should veto when Oracle vetoes", () => {
            const signal = createMockTechnicalSignal("LONG", 75);

            const result = validator.validateSignal(
                signal,
                createMockOracleScore(60, 80, true), // Veto
                createMockFlowValidation(true),
                createMockBotTrapAnalysis(false, 10),
                createMockGlobalCVD("bullish", 80),
            );

            expect(result.isValid).toBe(false);
            expect(result.recommendation).toBe("veto");
        });

        test("should veto when manipulation detected", () => {
            const signal = createMockTechnicalSignal("LONG", 75);

            const result = validator.validateSignal(
                signal,
                createMockOracleScore(60, 80),
                createMockFlowValidation(true),
                createMockBotTrapAnalysis(false, 10),
                createMockGlobalCVD("bullish", 80, true), // Manipulation
            );

            expect(result.isValid).toBe(false);
            expect(result.recommendation).toBe("veto");
        });

        test("should recommend caution for conflicting signals", () => {
            const signal = createMockTechnicalSignal("LONG", 75);

            const result = validator.validateSignal(
                signal,
                createMockOracleScore(-50, 80), // Bearish Oracle
                createMockFlowValidation(true, "passive_absorption", 75), // Bullish Flow
                createMockBotTrapAnalysis(false, 10),
                createMockGlobalCVD("bullish", 80), // Bullish CVD
            );

            expect(result.conflictAnalysis.hasConflict).toBe(true);
        });

        test("should adjust confidence based on layer validations", () => {
            const signal = createMockTechnicalSignal("LONG", 75);

            const goodResult = validator.validateSignal(
                signal,
                createMockOracleScore(60, 80),
                createMockFlowValidation(true),
                createMockBotTrapAnalysis(false, 10),
                createMockGlobalCVD("bullish", 80),
            );

            const badResult = validator.validateSignal(
                signal,
                createMockOracleScore(-40, 80), // Conflicting
                createMockFlowValidation(false), // Invalid
                createMockBotTrapAnalysis(true, 60), // Suspect
                createMockGlobalCVD("conflicted", 50), // Conflicted
            );

            expect(badResult.adjustedConfidence).toBeLessThan(
                goodResult.adjustedConfidence,
            );
        });
    });

    describe("conflict resolution", () => {
        test("should use conservative strategy by default", () => {
            const config = validator.getConfig();
            expect(config.conflictResolutionStrategy).toBe("conservative");
        });

        test("should detect conflicts between layers", () => {
            const signal = createMockTechnicalSignal("LONG", 75);

            const result = validator.validateSignal(
                signal,
                createMockOracleScore(-60, 80), // Strong bearish
                createMockFlowValidation(true, "passive_absorption", 80), // Bullish
                createMockBotTrapAnalysis(false, 10),
                createMockGlobalCVD("bullish", 80), // Bullish
            );

            expect(result.conflictAnalysis.hasConflict).toBe(true);
            expect(result.conflictAnalysis.conflictingLayers.length)
                .toBeGreaterThan(
                    0,
                );
        });
    });
});
