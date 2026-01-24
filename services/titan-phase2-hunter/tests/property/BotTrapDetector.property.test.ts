import fc from "fast-check";
import {
    DEFAULT_PATTERN_PRECISION_CONFIG,
    PatternPrecisionAnalyzer,
    TechnicalPattern,
} from "../../src/bottrap/PatternPrecisionAnalyzer";

describe("PatternPrecisionAnalyzer Property Tests", () => {
    // Arbitrary for valid technical patterns
    const technicalPatternArbitrary = fc.record({
        type: fc.constantFrom(
            "equal_highs",
            "equal_lows",
            "fvg",
            "order_block",
            "liquidity_pool",
        ),
        levels: fc.array(fc.double({ min: 1000, max: 100000 }), {
            minLength: 2,
            maxLength: 5,
        }),
        timestamp: fc.date(),
        barIndex: fc.integer({ min: 0 }),
        volume: fc.option(fc.double({ min: 0 }), { nil: undefined }),
    });

    // Helper to round numbers to varying degrees
    const roundTo = (num: number, precision: number) =>
        Math.round(num / precision) * precision;

    describe("Precision Scoring", () => {
        const analyzer = new PatternPrecisionAnalyzer();

        it("should flag patterns with exact tick precision as suspect", () => {
            fc.assert(
                fc.property(technicalPatternArbitrary, (basePattern) => {
                    // Create a pattern with EXACTLY equal levels (highest precision)
                    const exactLevel = 50000.00;
                    const exactLevels = basePattern.levels.map(() =>
                        exactLevel
                    );

                    const pattern: TechnicalPattern = {
                        ...basePattern,
                        levels: exactLevels,
                    };

                    const result = analyzer.analyzePatternPrecision(pattern);

                    // Should have 100 precision (or extremely high due to bonuses)
                    // And should be flagged as suspect because exact tick precision is a HUGE red flag
                    expect(result.characteristics.precision)
                        .toBeGreaterThanOrEqual(90);
                    expect(result.isSuspect).toBe(true);
                }),
            );
        });

        it("should give higher precision scores to more precise patterns", () => {
            fc.assert(
                fc.property(technicalPatternArbitrary, (basePattern) => {
                    // Normalize to at least 2 levels
                    const levels = basePattern.levels.slice(0, 2);
                    if (levels.length < 2) return;

                    const basePrice = 50000;

                    // Pattern 1: Tight precision (0.01% difference)
                    const tightLevels = [basePrice, basePrice * 1.00005]; // 0.005% diff

                    // Pattern 2: Loose precision (1% difference)
                    const looseLevels = [basePrice, basePrice * 1.01]; // 1% diff

                    const tightScore = analyzer.calculatePrecisionScore(
                        tightLevels,
                    );
                    const looseScore = analyzer.calculatePrecisionScore(
                        looseLevels,
                    );

                    expect(tightScore).toBeGreaterThan(looseScore);
                }),
            );
        });
    });

    describe("Timing Perfection", () => {
        const analyzer = new PatternPrecisionAnalyzer();

        // London Open: 08:00 UTC, NY Open: 13:00 UTC, Asia Open: 21:00 UTC
        const sessionHours = [8, 13, 21];

        it("should score session open times higher than random times", () => {
            fc.assert(
                fc.property(
                    technicalPatternArbitrary,
                    fc.integer({ min: 0, max: 23 }),
                    (pattern, randomHour) => {
                        // Filter out random hours that happen to be session hours
                        fc.pre(!sessionHours.includes(randomHour));

                        // Construct Dates
                        const baseDate = new Date("2025-01-01T00:00:00Z");

                        const sessionDate = new Date(baseDate);
                        sessionDate.setUTCHours(8, 0, 0, 0); // London Open exactly

                        const randomDate = new Date(baseDate);
                        randomDate.setUTCHours(randomHour, 37, 12, 0); // Random hour, random minute/second

                        const sessionPattern: TechnicalPattern = {
                            ...pattern,
                            timestamp: sessionDate,
                        };
                        const randomPattern: TechnicalPattern = {
                            ...pattern,
                            timestamp: randomDate,
                        };

                        const sessionResult = analyzer.analyzePatternPrecision(
                            sessionPattern,
                        );
                        const randomResult = analyzer.analyzePatternPrecision(
                            randomPattern,
                        );

                        expect(sessionResult.characteristics.timing)
                            .toBeGreaterThan(
                                randomResult.characteristics.timing,
                            );
                    },
                ),
            );
        });

        it('should score "perfect" minutes (:00, :15, :30, :45) higher', () => {
            fc.assert(
                fc.property(technicalPatternArbitrary, (pattern) => {
                    const baseDate = new Date("2025-01-01T10:00:00Z"); // Non-session hour

                    const perfectMinuteDate = new Date(baseDate);
                    perfectMinuteDate.setMinutes(15); // :15

                    const randomMinuteDate = new Date(baseDate);
                    randomMinuteDate.setMinutes(13); // :13

                    const perfectPattern: TechnicalPattern = {
                        ...pattern,
                        timestamp: perfectMinuteDate,
                    };
                    const randomPattern: TechnicalPattern = {
                        ...pattern,
                        timestamp: randomMinuteDate,
                    };

                    const perfectResult = analyzer.analyzePatternPrecision(
                        perfectPattern,
                    );
                    const randomResult = analyzer.analyzePatternPrecision(
                        randomPattern,
                    );

                    expect(perfectResult.characteristics.timing)
                        .toBeGreaterThan(randomResult.characteristics.timing);
                }),
            );
        });
    });

    describe("Round Number Bias", () => {
        const analyzer = new PatternPrecisionAnalyzer();

        it("should flag ROUND_NUMBER_ALIGNMENT for round number patterns", () => {
            fc.assert(
                fc.property(technicalPatternArbitrary, (basePattern) => {
                    // Create levels near a Major Round Number (e.g., 50000)
                    const roundLevel = 50000;
                    const roundLevels = [roundLevel, roundLevel]; // Exactly on it

                    const roundPattern: TechnicalPattern = {
                        ...basePattern,
                        levels: roundLevels,
                    };

                    const result = analyzer.analyzePatternPrecision(
                        roundPattern,
                    );

                    // Should usually include 'ROUND_NUMBER_ALIGNMENT' in characteristics
                    expect(result.precision.characteristics).toContain(
                        "ROUND_NUMBER_ALIGNMENT",
                    );
                }),
            );
        });
    });
});
