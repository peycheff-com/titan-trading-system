import { AllocationEngine } from "../../src/engine/AllocationEngine.js";
import { AllocationEngineConfig, EquityTier } from "../../src/types/index.js";

describe("Multi-Armed Bandit Allocator", () => {
    let engine: AllocationEngine;

    beforeEach(() => {
        const config: AllocationEngineConfig = {
            transitionPoints: {
                startP2: 1500,
                fullP2: 5000,
                startP3: 25000,
            },
            leverageCaps: {
                [EquityTier.MICRO]: 20,
                [EquityTier.SMALL]: 10,
                [EquityTier.MEDIUM]: 5,
                [EquityTier.LARGE]: 3,
                [EquityTier.INSTITUTIONAL]: 2,
            },
            initialWeights: { w1: 1, w2: 0, w3: 0, timestamp: Date.now() },
        } as any;
        engine = new AllocationEngine(config);
    });

    test("should override adaptive weights with safety defaults when equity is low", () => {
        // Equity < 1500 -> Should be 100% Phase 1 regardless of performance
        const weights = engine.getAdaptiveWeights(1000, [
            { phaseId: "phase1", sharpeRatio: 1.0 },
            { phaseId: "phase2", sharpeRatio: 5.0 }, // Phase 2 doing great
            { phaseId: "phase3", sharpeRatio: 5.0 },
        ]);

        expect(weights.w1).toBe(1.0);
        expect(weights.w2).toBe(0.0);
        expect(weights.w3).toBe(0.0);
    });

    test("should favor high performing phases when equity allows (High Equity)", () => {
        const equity = 30000; // Large tier
        const performances = [
            { phaseId: "phase1", sharpeRatio: 1.0 }, // Moderate
            { phaseId: "phase2", sharpeRatio: -1.0 }, // Losing
            { phaseId: "phase3", sharpeRatio: 3.0 }, // Winning
        ];

        // Base weights at 30k: ~20% P1, ~50% P2, ~30% P3
        const baseWeights = engine.getWeights(equity);

        // Adaptive weights: 70% Base + 30% Performance
        // Performance should shift weight from P2 to P3
        const adaptiveWeights = engine.getAdaptiveWeights(
            equity,
            performances,
            0.7,
        );

        // Verification:
        // P3 should have MORE weight in adaptive than base (Winning)
        expect(adaptiveWeights.w3).toBeGreaterThan(baseWeights.w3);

        // P2 should have LESS weight in adaptive than base (Losing)
        expect(adaptiveWeights.w2).toBeLessThan(baseWeights.w2);

        // P1 might shift slightly but should remain roughly baseline/safe
        // Just checking P3 boost is the key requirement
        console.log({ base: baseWeights, adaptive: adaptiveWeights });
    });

    test("should fallback to base weights if performance data is empty", () => {
        const equity = 30000;
        const weights = engine.getAdaptiveWeights(equity, []);
        const baseWeights = engine.getWeights(equity);

        expect(weights.w1).toBeCloseTo(baseWeights.w1);
        expect(weights.w2).toBeCloseTo(baseWeights.w2);
        expect(weights.w3).toBeCloseTo(baseWeights.w3);
    });
});
