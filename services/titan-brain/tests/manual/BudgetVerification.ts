import { BudgetService } from "../../src/engine/BudgetService";
import { AllocationEngine } from "../../src/features/Allocation/AllocationEngine";
import { RiskGuardian } from "../../src/features/Risk/RiskGuardian";
import { NatsClient, RegimeState } from "@titan/shared";
import { logger } from "../../src/utils/Logger";

// Mock NatsClient
class MockNatsClient {
    async publish(subject: string, data: any): Promise<void> {
        console.log(
            `[MOCK NATS] Published to ${subject}:`,
            JSON.stringify(data, null, 2),
        );
    }
}

// Mock AllocationEngine
class MockAllocationEngine {
    getEquityTier(equity: number) {
        return "TIER_1";
    }
    getMaxLeverage(equity: number) {
        return 10;
    }
    getWeights(equity: number) {
        return { w1: 0.4, w2: 0.3, w3: 0.3 };
    }
}

// Mock RiskGuardian
class MockRiskGuardian {
    private regime: any = "STABLE"; // Use string matching enum if needed

    constructor(regime: any) {
        this.regime = regime;
    }

    getEquity() {
        return 100000;
    }
    getRegimeState() {
        return this.regime;
    }
}

async function runVerification() {
    console.log("Starting BudgetService Verification...");

    // 1. Test Normal Regime
    console.log("\n--- TEST CASE 1: NORMAL REGIME ---");
    const mockNats = new MockNatsClient() as unknown as NatsClient;
    const mockAlloc = new MockAllocationEngine() as unknown as AllocationEngine;
    const mockRisk = new MockRiskGuardian("STABLE") as unknown as RiskGuardian;

    const budgetService = new BudgetService(
        {
            broadcastInterval: 1000,
            budgetTtl: 5000,
            slippageThresholdBps: 20,
            rejectRateThreshold: 0.1,
        },
        mockAlloc,
        mockRisk,
        mockNats,
    );

    // Run one broadcast explicitly (using private method access or just wait if start() used)
    // accessible via private method? No, let's use start() and wait.
    await budgetService.start();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    budgetService.stop();

    // 2. Test CRASH Regime (Expecting RiskPolicy Emergency)
    console.log("\n--- TEST CASE 2: CRASH REGIME ---");
    const mockRiskCrash = new MockRiskGuardian(
        RegimeState.CRASH,
    ) as unknown as RiskGuardian;
    const budgetServiceCrash = new BudgetService(
        {
            broadcastInterval: 1000,
            budgetTtl: 5000,
            slippageThresholdBps: 20,
            rejectRateThreshold: 0.1,
        },
        mockAlloc,
        mockRiskCrash,
        mockNats,
    );

    await budgetServiceCrash.start();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    budgetServiceCrash.stop();

    console.log("\nVerification Complete.");
}

runVerification().catch((err) => console.error(err));
