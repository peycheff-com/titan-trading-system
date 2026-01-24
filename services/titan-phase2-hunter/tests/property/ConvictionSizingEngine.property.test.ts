import { describe, expect, test } from "@jest/globals";
import * as fc from "fast-check";
import {
    ConvictionSizingConfig,
    ConvictionSizingEngine,
} from "../../src/engine/enhanced/ConvictionSizingEngine";
import {
    ImpactLevel,
    OracleScore,
    PredictionMarketEvent,
} from "../../src/types/index";

describe("ConvictionSizingEngine Properties", () => {
    const engine = new ConvictionSizingEngine({
        eventRiskMaxReduction: 0.5,
        eventProximityMinutes: 60,
    });

    // Arbitrary for PredictionMarketEvent
    const eventArbitrary = fc.record({
        id: fc.uuid(),
        title: fc.string(),
        description: fc.string(),
        category: fc.constantFrom(
            "macro",
            "crypto",
            "geopolitical",
            "regulatory",
        ),
        impact: fc.constantFrom(
            "low",
            "medium",
            "high",
            "extreme",
        ) as fc.Arbitrary<ImpactLevel>,
        probability: fc.float({ min: 0, max: 100 }),
        volume: fc.float({ min: 0 }),
        liquidity: fc.float({ min: 0 }),
        resolution: fc.date({
            min: new Date(),
            max: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }), // Within 24h
        // status: removed

        provider: fc.constant("polymarket"),
        url: fc.webUrl(),
    });

    // Arbitrary for OracleScore
    const oracleScoreArbitrary = fc.record({
        sentiment: fc.constantFrom("bullish", "bearish", "neutral"),
        confidence: fc.float({ min: 0, max: 100 }),
        score: fc.float({ min: 0, max: 100 }),
        convictionMultiplier: fc.float({ min: 0.5, max: 2.0 }),
        events: fc.array(eventArbitrary),
        components: fc.anything(),
        timestamp: fc.date(),
    });

    test("should reduce risk when high/extreme impact events are imminent", () => {
        fc.assert(
            fc.property(oracleScoreArbitrary, (oracleScore) => {
                // Ensure specific conditions for the test logic within property
                // We mock the resolution times to be explicitly within/outside window

                const now = Date.now();
                const hasImminentExtreme = oracleScore.events.some((e) => {
                    const time = e.resolution.getTime() - now;
                    return e.impact === "extreme" && time > 0 &&
                        time <= 60 * 60 * 1000;
                });

                const hasImminentHigh = oracleScore.events.some((e) => {
                    const time = e.resolution.getTime() - now;
                    return e.impact === "high" && time > 0 &&
                        time <= 60 * 60 * 1000;
                });

                const result = engine.calculatePositionSize(
                    1000,
                    oracleScore as any, // Cast due to deep types
                    null,
                    null,
                    null,
                );

                if (hasImminentExtreme) {
                    expect(result.eventRiskMultiplier).toBeLessThanOrEqual(0.5); // 1.0 - 0.5
                } else if (hasImminentHigh) {
                    expect(result.eventRiskMultiplier).toBeLessThanOrEqual(
                        0.75,
                    ); // 1.0 - 0.25
                } else {
                    expect(result.eventRiskMultiplier).toBe(1.0);
                }
            }),
        );
    });

    test("eventRiskMultiplier should never exceed 1.0", () => {
        fc.assert(
            fc.property(oracleScoreArbitrary, (oracleScore) => {
                const result = engine.calculatePositionSize(
                    1000,
                    oracleScore as any,
                    null,
                    null,
                    null,
                );
                expect(result.eventRiskMultiplier).toBeLessThanOrEqual(1.0);
                expect(result.eventRiskMultiplier).toBeGreaterThan(0);
            }),
        );
    });
});
