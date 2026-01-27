import fc from "fast-check";
import { SentimentCalculator } from "../../src/oracle/SentimentCalculator";
import {
    EventCategory,
    ImpactLevel,
    PredictionMarketEvent,
} from "../../src/types";
import { Oracle } from "../../src/oracle/Oracle";
import { ConfigManager, OracleConfig } from "../../src/config/ConfigManager";

describe("Oracle Property Tests", () => {
    describe("SentimentCalculator", () => {
        // Arbitrary for PredictionMarketEvent
        const eventArbitrary = fc.record({
            id: fc.uuid(),
            title: fc.string(),
            description: fc.string(),
            category: fc.constantFrom(...Object.values(EventCategory)),
            impact: fc.constantFrom(...Object.values(ImpactLevel)),
            probability: fc.double({ min: 0, max: 100 }),
            volume: fc.double({ min: 0, max: 10000000 }),
            liquidity: fc.double({ min: 0, max: 1000000 }),
            resolution: fc.date(),
            active: fc.boolean(),
            closed: fc.boolean(),
            source: fc.constant("polymarket"),
            url: fc.webUrl(),
        });

        it("should always return sentiment between -100 and +100", () => {
            fc.assert(
                fc.property(fc.array(eventArbitrary), (events) => {
                    const calculator = new SentimentCalculator();
                    const result = calculator.calculateSentiment(
                        events.map((e) => ({
                            ...e,
                            lastUpdate: new Date(),
                        })) as PredictionMarketEvent[],
                        "long",
                    );

                    expect(result.sentiment).toBeGreaterThanOrEqual(-100);
                    expect(result.sentiment).toBeLessThanOrEqual(100);
                }),
            );
        });

        it("should always return confidence between 0 and 100", () => {
            fc.assert(
                fc.property(fc.array(eventArbitrary), (events) => {
                    const calculator = new SentimentCalculator();
                    const result = calculator.calculateSentiment(
                        events.map((e) => ({
                            ...e,
                            lastUpdate: new Date(),
                        })) as PredictionMarketEvent[],
                        "long",
                    );

                    expect(result.confidence).toBeGreaterThanOrEqual(0);
                    expect(result.confidence).toBeLessThanOrEqual(100);
                }),
            );
        });

        it("should give higher or equal weight to closer events (Monotonicity)", () => {
            // Testing calculateTimeDecay logic directly
            const calculator = new SentimentCalculator();
            const now = Date.now();
            const halfLife = 48; // default

            // Check that weight(closer) >= weight(farther)
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 1000 }), // hours closer
                    fc.integer({ min: 1001, max: 10000 }), // hours farther
                    (closerHours, fartherHours) => {
                        const closeDate = new Date(
                            now + closerHours * 3600 * 1000,
                        );
                        const farDate = new Date(
                            now + fartherHours * 3600 * 1000,
                        );

                        const weightClose = calculator.calculateTimeDecay(
                            closeDate,
                        );
                        const weightFar = calculator.calculateTimeDecay(
                            farDate,
                        );

                        // If logic is correct: weightClose >= weightFar
                        expect(weightClose).toBeGreaterThanOrEqual(weightFar);
                    },
                ),
            );
        });

        describe("Oracle Conviction Logic", () => {
            const oracleConfig: OracleConfig = {
                enabled: true,
                polymarketApiKey: "test",
                updateInterval: 60,
                conflictThreshold: 40,
                btcCrashVetoThreshold: 60,
                btcAthBoostThreshold: 70,
                convictionMultiplierMax: 1.5,
            } as OracleConfig;

            // Redefine arbitrary or share it (redefining for simplicity)
            const eventArbitrary = fc.record({
                id: fc.uuid(),
                title: fc.string(),
                description: fc.string(),
                category: fc.constantFrom(...Object.values(EventCategory)),
                impact: fc.constantFrom(...Object.values(ImpactLevel)),
                probability: fc.double({ min: 0, max: 100 }),
                volume: fc.double({ min: 0, max: 10000000 }),
                liquidity: fc.double({ min: 0, max: 1000000 }),
                resolution: fc.date(),
                active: fc.boolean(),
                closed: fc.boolean(),
                source: fc.constant("polymarket"),
                url: fc.webUrl(),
            });

            const signalArbitrary = fc.record({
                id: fc.uuid(),
                symbol: fc.constantFrom("BTC-USD", "ETH-USD", "SOL-USD"),
                type: fc.constantFrom("entry", "exit"),
                direction: fc.constantFrom("LONG", "SHORT"),
                price: fc.double({ min: 1 }),
                timestamp: fc.date(),
                metadata: fc.object(),
            });

            const oracleScoreArbitrary = fc.record({
                sentiment: fc.integer({ min: -100, max: 100 }),
                confidence: fc.integer({ min: 0, max: 100 }),
                events: fc.array(eventArbitrary, { maxLength: 5 }),
                veto: fc.boolean(),
                vetoReason: fc.option(fc.string(), { nil: undefined }),
                convictionMultiplier: fc.constant(1.0),
                timestamp: fc.date(),
            });

            it("should return multiplier between 0.5 and MAX", async () => {
                // Mock PolymarketClient by overriding prototype or just suppressing connection
                // Since we use getConvictionMultiplier(signal, score), it shouldn't use client.
                // Mock ConfigManager
                const mockConfigManager = {
                    getOracleConfig: () => oracleConfig,
                    getConfig: () => ({
                        enhancedRisk: { eventProximityThreshold: 60 },
                    }),
                    on: () => {},
                } as unknown as ConfigManager;

                const oracle = new Oracle(mockConfigManager);

                await fc.assert(
                    fc.asyncProperty(
                        signalArbitrary,
                        oracleScoreArbitrary,
                        async (signal, score) => {
                            const result = await oracle.getConvictionMultiplier(
                                signal as any,
                                score as any,
                            );

                            expect(result.multiplier).toBeGreaterThanOrEqual(
                                0.5,
                            );
                            expect(result.multiplier).toBeLessThanOrEqual(
                                oracleConfig.convictionMultiplierMax,
                            );
                        },
                    ),
                );
            });

            it("should apply boost when strongly aligned (Long + Bullish > 60)", async () => {
                // Mock ConfigManager
                const mockConfigManager = {
                    getOracleConfig: () => oracleConfig,
                    getConfig: () => ({
                        enhancedRisk: { eventProximityThreshold: 60 },
                    }),
                    on: () => {},
                } as unknown as ConfigManager;

                const oracle = new Oracle(mockConfigManager);

                await fc.assert(
                    fc.asyncProperty(
                        signalArbitrary,
                        fc.integer({ min: 60, max: 100 }), // High bullish sentiment
                        async (signal, sentiment) => {
                            const longSignal = { ...signal, direction: "LONG" };
                            const score = {
                                sentiment: sentiment,
                                confidence: 50,
                                events: [],
                                veto: false,
                                vetoReason: null,
                                convictionMultiplier: 1.0,
                                timestamp: new Date(),
                            };

                            const result = await oracle.getConvictionMultiplier(
                                longSignal as any,
                                score as any,
                            );

                            // Expect boost > 1.0
                            expect(result.multiplier).toBeGreaterThan(1.0);
                        },
                    ),
                );
            });
        });
    });
});
