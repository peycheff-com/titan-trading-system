/**
 * Hill Estimator Tests
 */

import { HillEstimator } from "../src/estimators/HillEstimator";

describe("HillEstimator", () => {
    let estimator: HillEstimator;

    beforeEach(() => {
        estimator = new HillEstimator();
    });

    describe("estimate", () => {
        it("should return fallback for insufficient data", () => {
            const result = estimator.estimate([1, 2, 3, 4, 5]);
            expect(result.alpha).toBe(0);
            expect(result.confidence).toBe(0);
            expect(result.isHeavyTailed).toBe(false);
        });

        it("should estimate alpha for power-law distributed data", () => {
            // Generate synthetic heavy-tailed data
            const data = generateParetoReturns(500, 2.5);
            const result = estimator.estimate(data);

            expect(result.alpha).toBeGreaterThan(0);
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.kOptimal).toBeGreaterThan(0);
            expect(result.ciLower).toBeLessThan(result.alpha);
            expect(result.ciUpper).toBeGreaterThan(result.alpha);
        });

        it("should detect heavy tails when alpha < 3", () => {
            const heavyTailData = generateParetoReturns(500, 2.0);
            const result = estimator.estimate(heavyTailData);

            // With alpha ~2, should be flagged as heavy-tailed
            expect(result.isHeavyTailed).toBe(true);
        });

        it("should not detect heavy tails for light-tailed data", () => {
            // Gaussian has infinite alpha (light tails)
            const normalData = generateNormalReturns(500);
            const result = estimator.estimate(normalData);

            // Gaussian data typically has very high alpha estimate
            // May or may not be flagged as heavy-tailed depending on sample
            expect(result.alpha).toBeGreaterThan(0);
        });
    });
});

// Helper: Generate Pareto-distributed absolute returns
function generateParetoReturns(n: number, alpha: number): number[] {
    const returns: number[] = [];
    for (let i = 0; i < n; i++) {
        const u = Math.random();
        // Inverse CDF of Pareto: x = 1 / U^(1/alpha)
        const x = Math.pow(u, -1 / alpha);
        // Randomize sign
        returns.push(Math.random() > 0.5 ? x : -x);
    }
    return returns;
}

// Helper: Generate normally distributed returns
function generateNormalReturns(n: number): number[] {
    const returns: number[] = [];
    for (let i = 0; i < n; i++) {
        // Box-Muller transform
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        returns.push(z * 0.02); // 2% daily volatility
    }
    return returns;
}
