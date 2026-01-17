import { AllocationEngine } from "./engine/AllocationEngine.js";
import {
    AllocationEngineConfig,
    EquityTier,
    LeverageCaps,
    TransitionPoints,
} from "./types/index.js";

async function verifyBandit() {
    console.log("🎲 Verifying Multi-Armed Bandit Allocator...");

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
        initialWeights: { w1: 1, w2: 0, w3: 0, timestamp: Date.now() }, // Satisfy type
    } as any;

    const engine = new AllocationEngine(config);

    // Test Case 1: Low Equity (Safety First)
    // Equity < 1500 -> Should be 100% Phase 1 regardless of performance
    const weights1 = engine.getAdaptiveWeights(1000, [
        { phaseId: "phase1", sharpeRatio: 1.0 },
        { phaseId: "phase2", sharpeRatio: 5.0 }, // High performance
        { phaseId: "phase3", sharpeRatio: 5.0 },
    ]);
    console.log("\n1. Low Equity ($1000):");
    console.log("   Expected: w1=1.0 (Safety Override)");
    console.log("   Actual:  ", weights1);

    if (weights1.w1 !== 1.0) {
        throw new Error("Safety override failed for low equity");
    }

    // Test Case 2: High Equity (Adaptive)
    // Equity = 30000 -> Base: ~20% P1, ~50% P2, ~30% P3 (approx)
    // Performance: P2 sucks (-1.0), P3 is godlike (3.0)
    const equity = 30000;
    const performances = [
        { phaseId: "phase1", sharpeRatio: 1.0 },
        { phaseId: "phase2", sharpeRatio: -1.0 },
        { phaseId: "phase3", sharpeRatio: 3.0 },
    ];

    const weights2 = engine.getAdaptiveWeights(equity, performances, 0.7); // 70% Base, 30% Perf
    console.log(`\n2. High Equity ($${equity}) with Skewed Performance:`);
    console.log("   Performance: P1(1.0), P2(-1.0), P3(3.0)");
    console.log("   Weights: ", weights2);

    // Check if P3 got a boost
    const baseWeights = engine.getWeights(equity);
    console.log("   Base Weights:", baseWeights);

    if (weights2.w3 <= baseWeights.w3) {
        console.warn(
            "⚠️  P3 did not increase despite high Sharpe! Check Logic.",
        );
    } else {
        console.log("✅ P3 weight increased due to performance.");
    }

    console.log("\n✅ Bandit Verification Completed");
}

verifyBandit().catch(console.error);
