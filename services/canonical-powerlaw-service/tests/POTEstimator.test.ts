/**
 * POT Estimator Tests
 */

import { POTEstimator } from "../src/estimators/POTEstimator";

describe("POTEstimator", () => {
    let estimator: POTEstimator;

    beforeEach(() => {
        estimator = new POTEstimator();
    });

    describe("exceedanceProbability", () => {
        it("should return 0 for empty data", () => {
            expect(estimator.exceedanceProbability([], 0.1)).toBe(0);
        });

        it("should compute correct exceedance probability", () => {
            // 10 values, 3 exceed threshold 0.5
            const returns = [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.1, 0.2, 0.3];
            const prob = estimator.exceedanceProbability(returns, 0.5);
            expect(prob).toBe(0.3); // 3 out of 10
        });

        it("should use absolute values", () => {
            const returns = [-0.1, -0.9, 0.1, 0.9];
            const prob = estimator.exceedanceProbability(returns, 0.5);
            expect(prob).toBe(0.5); // 2 out of 4
        });
    });

    describe("autoThreshold", () => {
        it("should compute threshold based on volatility", () => {
            const returns = generateNormalReturns(100, 0.02);
            const threshold = estimator.autoThreshold(returns, 2.5);
            expect(threshold).toBeGreaterThan(0);
            // Should be approximately 2.5 * 0.02 = 0.05 for normal data
            expect(threshold).toBeGreaterThan(0.03);
            expect(threshold).toBeLessThan(0.1);
        });
    });

    describe("estimate", () => {
        it("should return zero fit quality for insufficient exceedances", () => {
            const returns = [0.01, 0.02, 0.03, 0.01, 0.02];
            const result = estimator.estimate(returns, 0.5);
            expect(result.fitQuality).toBe(0);
            expect(result.exceedanceCount).toBeLessThan(5);
        });

        it("should estimate GPD parameters for sufficient data", () => {
            const returns = generateParetoReturns(500, 2.0);
            const threshold = estimator.autoThreshold(returns, 2.0);
            const result = estimator.estimate(returns, threshold);

            expect(result.exceedanceCount).toBeGreaterThan(5);
            expect(result.gpdScale).toBeGreaterThanOrEqual(0);
            expect(result.fitQuality).toBeGreaterThanOrEqual(0);
        });
    });
});

// Helper: Generate normally distributed returns
function generateNormalReturns(n: number, sigma: number = 0.02): number[] {
    const returns: number[] = [];
    for (let i = 0; i < n; i++) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        returns.push(z * sigma);
    }
    return returns;
}

// Helper: Generate Pareto-distributed returns
function generateParetoReturns(n: number, alpha: number): number[] {
    const returns: number[] = [];
    for (let i = 0; i < n; i++) {
        const u = Math.random();
        const x = Math.pow(u, -1 / alpha) * 0.01;
        returns.push(Math.random() > 0.5 ? x : -x);
    }
    return returns;
}
