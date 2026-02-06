import { HillEstimator, POTEstimator } from "../src/tail-estimators";

function createDeterministicRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe("HillEstimator", () => {
    const hill = new HillEstimator();

    test("should detect heavy tails (Pareto distribution)", () => {
        const random = createDeterministicRng(42);

        // Generate Pareto distributed data (alpha = 2)
        // Inverse transform sampling: x = x_min * (1 - u)^(-1/alpha)
        const alpha = 2.0;
        const x_min = 1.0;
        const data: number[] = [];
        for (let i = 0; i < 2000; i++) {
            const u = random();
            const val = x_min * Math.pow(1 - u, -1 / alpha);
            data.push(val); // Already positive
        }

        const estimate = hill.estimate(data, 0.90); // Top 10%

        // Alpha should be close to 2.0
        expect(estimate.alpha).toBeGreaterThan(1.7);
        expect(estimate.alpha).toBeLessThan(2.4);
        expect(estimate.isHeavyTailed).toBe(true);
    });

    test("should detect thin tails (Gaussian/Normal distribution)", () => {
        const random = createDeterministicRng(4242);

        // Generate Gaussian distributed data
        const data: number[] = [];
        for (let i = 0; i < 2000; i++) {
            const u1 = Math.max(random(), Number.EPSILON);
            const u2 = random();
            const z = Math.sqrt(-2.0 * Math.log(u1)) *
                Math.cos(2.0 * Math.PI * u2);
            data.push(Math.abs(z)); // Use absolute returns
        }

        const estimate = hill.estimate(data, 0.95); // Top 5%

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
