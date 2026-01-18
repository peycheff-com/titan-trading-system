import { HillEstimator, POTEstimator } from "../src/tail-estimators";

describe("HillEstimator", () => {
    const hill = new HillEstimator();

    test("should detect heavy tails (Pareto distribution)", () => {
        // Generate Pareto distributed data (alpha = 2)
        // Inverse transform sampling: x = x_min * (1 - u)^(-1/alpha)
        const alpha = 2.0;
        const x_min = 1.0;
        const data: number[] = [];
        for (let i = 0; i < 2000; i++) {
            const u = Math.random();
            const val = x_min * Math.pow(1 - u, -1 / alpha);
            data.push(val); // Already positive
        }

        const estimate = hill.estimate(data, 0.90); // Top 10%
        console.log("Pareto Estimate:", estimate);

        // Alpha should be close to 2.0
        expect(estimate.alpha).toBeGreaterThan(1.8);
        expect(estimate.alpha).toBeLessThan(2.4);
        expect(estimate.isHeavyTailed).toBe(true);
    });

    test("should detect thin tails (Gaussian/Normal distribution)", () => {
        // Generate Gaussian distributed data
        const data: number[] = [];
        for (let i = 0; i < 2000; i++) {
            const u1 = Math.random();
            const u2 = Math.random();
            const z = Math.sqrt(-2.0 * Math.log(u1)) *
                Math.cos(2.0 * Math.PI * u2);
            data.push(Math.abs(z)); // Use absolute returns
        }

        const estimate = hill.estimate(data, 0.95); // Top 5%
        console.log("Gaussian Estimate:", estimate);

        // For Gaussian, effective tail index is high (decay is faster than power law)
        // Usually alpha > 3 or 4
        expect(estimate.alpha).toBeGreaterThan(3.0);
        expect(estimate.isHeavyTailed).toBe(false);
    });
});

describe("POTEstimator", () => {
    const pot = new POTEstimator();

    test("should calculate correct exceedance probability", () => {
        const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const prob = pot.exceedanceProbability(data, 7);
        // 8, 9, 10 exceed 7 -> 3/10 = 0.3
        expect(prob).toBe(0.3);
    });
});
