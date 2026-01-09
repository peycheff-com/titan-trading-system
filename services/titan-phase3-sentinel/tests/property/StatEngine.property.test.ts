import fc from "fast-check";
import {
    BasisCalculator,
    RollingStatistics,
    SignalGenerator,
} from "../../src/engine/StatEngine";
import type { OrderBook } from "../../src/types/statistics";

describe("StatEngine Property Tests", () => {
    describe("RollingStatistics Z-Score", () => {
        it("should match manual calculation for any sequence of numbers", () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.double({ min: -1000, max: 1000, noNaN: true }),
                        {
                            minLength: 2,
                            maxLength: 50,
                        },
                    ),
                    (values) => {
                        const stats = new RollingStatistics({
                            windowSize: 100,
                            minSamples: 1,
                        });

                        // Add all values
                        values.forEach((v) => stats.add(v));

                        // Manual calculation
                        const mean = values.reduce((a, b) => a + b, 0) /
                            values.length;
                        const variance = values.reduce(
                            (acc, v) => acc + Math.pow(v - mean, 2),
                            0,
                        ) /
                            (values.length - 1);
                        const stdDev = Math.sqrt(variance);

                        const lastValue = values[values.length - 1];
                        const manualZ = stdDev === 0
                            ? 0
                            : (lastValue - mean) / stdDev;

                        const engineZ = stats.getZScore(lastValue);

                        // Skip check for extremely small stdDev or values where precision loss is expected
                        if (stdDev < 1e-12) return;

                        // Allow small floating point error due to Welford vs Naive difference
                        if (stdDev === 0) {
                            expect(engineZ).toBe(0);
                        } else {
                            expect(Math.abs(engineZ - manualZ)).toBeLessThan(
                                1e-10,
                            );
                        }
                    },
                ),
            );
        });

        it("should generally stay within reasonable bounds for normal-ish distribution", () => {
            fc.assert(
                fc.property(
                    fc.array(fc.double({ min: 0, max: 100, noNaN: true }), {
                        minLength: 10,
                        maxLength: 100,
                    }),
                    (values) => {
                        const stats = new RollingStatistics({
                            windowSize: 200,
                            minSamples: 5,
                        });
                        values.forEach((v) => stats.add(v));

                        if (stats.getStdDev() > 0) {
                            const z = stats.getZScore(
                                values[values.length - 1],
                            );
                            // It's possible to have high Z-scores, but mostly they should be finite
                            expect(Number.isFinite(z)).toBe(true);
                        }
                    },
                ),
            );
        });
    });

    describe("BasisCalculator Depth-Weighted Basis", () => {
        it("should be consistent with simple basis direction", () => {
            // Generate two prices, one for spot, one for perp
            fc.assert(
                fc.property(
                    fc.double({ min: 100, max: 10000, noNaN: true }), // Spot Price
                    fc.double({ min: 100, max: 10000, noNaN: true }), // Perp Price
                    (spotPrice, perpPrice) => {
                        const calculator = new BasisCalculator();

                        // Construct artificial order books centered around these prices
                        const spotBook: OrderBook = {
                            bids: [[spotPrice - 0.1, 1], [spotPrice - 0.2, 5]],
                            asks: [[spotPrice + 0.1, 1], [spotPrice + 0.2, 5]],
                            timestamp: Date.now(),
                        };

                        const perpBook: OrderBook = {
                            bids: [[perpPrice - 0.1, 1], [perpPrice - 0.2, 5]],
                            asks: [[perpPrice + 0.1, 1], [perpPrice + 0.2, 5]],
                            timestamp: Date.now(),
                        };

                        const basis = calculator.calculateDepthWeightedBasis(
                            spotBook,
                            perpBook,
                            1,
                        );
                        const simpleDiff = perpPrice - spotPrice;

                        if (simpleDiff > 1) { // Large positive difference
                            expect(basis).toBeGreaterThan(0);
                        } else if (simpleDiff < -1) { // Large negative difference
                            expect(basis).toBeLessThan(0);
                        }
                    },
                ),
            );
        });
    });

    describe("SignalGenerator Classification", () => {
        it("should classify EXPAND only when Z-Score > threshold", () => {
            fc.assert(
                fc.property(
                    fc.array(fc.double({ min: 0, max: 10, noNaN: true })),
                    fc.double({ min: 11, max: 20, noNaN: true }),
                    (history, outlier) => {
                        const generator = new SignalGenerator({
                            expandZScore: 2.0,
                            contractZScore: -2.0,
                            minConfidence: 0, // Disable confidence check for this test
                            vacuumBasis: -0.5,
                        });

                        // Feed history
                        history.forEach((v) =>
                            generator.updateBasis("TEST", v)
                        );
                        // Feed outlier
                        generator.updateBasis("TEST", outlier);

                        const signal = generator.getSignal("TEST");

                        if (signal.zScore >= 2.0) {
                            expect(signal.action).toBe("EXPAND");
                        } else if (signal.zScore <= -2.0) {
                            expect(signal.action).toBe("CONTRACT");
                        } else {
                            expect(signal.action).toBe("HOLD");
                        }
                    },
                ),
            );
        });
    });

    describe("Statistical Model Isolation", () => {
        it("should not let updates to one symbol affect another", () => {
            fc.assert(
                fc.property(
                    fc.string(),
                    fc.string(),
                    fc.array(fc.double({ noNaN: true, noInfinity: true })),
                    fc.array(fc.double({ noNaN: true, noInfinity: true })),
                    (sym1, sym2, vals1, vals2) => {
                        fc.pre(sym1 !== sym2);

                        const generator = new SignalGenerator();

                        // Interleave updates? Or just fill one then the other.
                        // Let's fill sym1
                        vals1.forEach((v) => generator.updateBasis(sym1, v));
                        const stats1Before = generator.getBasisStats(sym1);

                        // Fill sym2
                        vals2.forEach((v) => generator.updateBasis(sym2, v));

                        // Check sym1 stats unchanged
                        const stats1After = generator.getBasisStats(sym1);

                        if (stats1Before === null) {
                            expect(stats1After).toBeNull();
                        } else {
                            expect(stats1After).not.toBeNull();
                            expect(stats1After!.mean).toBe(stats1Before!.mean);
                            expect(stats1After!.stdDev).toBe(
                                stats1Before!.stdDev,
                            );
                        }
                    },
                ),
            );
        });
    });
});
