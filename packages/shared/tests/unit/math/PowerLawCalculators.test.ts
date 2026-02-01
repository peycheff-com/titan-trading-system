import { PowerLawCalculators } from "../../../src/utils/math/PowerLawCalculators";

describe("PowerLawCalculators", () => {
    describe("calculateSquareRootImpact", () => {
        it("should calculate correct impact bps", () => {
            const size = 100;
            const dailyVol = 10000;
            const volatility = 0.04; // 4%
            const Y = 0.7; // default

            // I = 0.7 * 0.04 * sqrt(100/10000) = 0.7 * 0.04 * 0.1 = 0.0028
            // in bps: 0.0028 * 10000 = 28 bps
            const impact = PowerLawCalculators.calculateSquareRootImpact(
                size,
                dailyVol,
                volatility,
                Y,
            );
            expect(impact).toBeCloseTo(28);
        });

        it("should return Infinity for zero volume", () => {
            expect(PowerLawCalculators.calculateSquareRootImpact(100, 0, 0.04))
                .toBe(Infinity);
        });
    });

    describe("calculateVolatilityZScore", () => {
        it("should calculate correct Z-Score", () => {
            // Price move 2%, Vol 1% -> 2 sigma
            expect(PowerLawCalculators.calculateVolatilityZScore(0.02, 0.01))
                .toBe(2.0);
        });

        it("should handle zero volatility", () => {
            expect(PowerLawCalculators.calculateVolatilityZScore(0.02, 0)).toBe(
                0,
            );
        });
    });

    describe("calculateHillEstimator", () => {
        it("should estimate alpha for a perfect Pareto tail", () => {
            // Generate synthetic Pareto data with alpha = 2.0
            // x = x_min * (1 - u)^(-1/alpha)
            const alpha = 2.0;
            const x_min = 1.0;
            const n = 1000;
            const data: number[] = [];

            for (let i = 0; i < n; i++) {
                const u = Math.random();
                const x = x_min * Math.pow(1 - u, -1 / alpha);
                data.push(x);
            }

            // Estimate using top 10%
            const estimatedAlpha = PowerLawCalculators.calculateHillEstimator(
                data,
                0.10,
            );

            // Should be close to 2.0 (allow some variance due to random sampling)
            expect(estimatedAlpha).toBeGreaterThan(1.5);
            expect(estimatedAlpha).toBeLessThan(2.5);
        });

        it("should return 0 for empty data", () => {
            expect(PowerLawCalculators.calculateHillEstimator([])).toBe(0);
        });

        it("should handle very small datasets gracefully", () => {
            // Not enough points for a tail
            const data = [0.01, 0.02];
            const est = PowerLawCalculators.calculateHillEstimator(data, 0.1);
            // Should theoretically define tail as size 2 (min) or return reasonable value
            expect(est).toBeGreaterThan(0);
        });
    });
});
