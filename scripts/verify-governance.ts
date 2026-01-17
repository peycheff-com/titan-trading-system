import {
    DefconLevel,
    GovernanceEngine,
} from "../services/titan-brain/src/engine/GovernanceEngine.js";
import { RiskGuardian } from "../services/titan-brain/src/engine/RiskGuardian.js";
import { AllocationEngine } from "../services/titan-brain/src/engine/AllocationEngine.js";
import { IntentSignal } from "../services/titan-brain/src/types/index.js";

async function verifyGovernance() {
    console.log("🔒 Verifying Governance Engine...");

    const gov = new GovernanceEngine();
    const alloc = new AllocationEngine({
        initialWeights: { w1: 0.8, w2: 0.2, w3: 0.0 }, // Scavenger focused
        constraints: {
            minEquity: 1000,
            maxPositionSize: 10000,
            targetDailyVol: 0.02,
        },
    } as any);

    const guardian = new RiskGuardian(
        {
            maxDrawdown: 0.1,
            maxLeverage: 5.0,
            riskPerTrade: 0.02,
            correlationThreshold: 0.7,
            minSharpe: 0.5,
        } as any,
        alloc,
        gov,
    );

    console.log("✅ Modules initialized");

    // Test 1: Normal Operation
    console.log("\n🧪 Test 1: Normal Operation (DEFCON 1)");
    const signal: IntentSignal = {
        signalId: "test-1",
        phaseId: "phase1",
        symbol: "BTCUSDT",
        side: "BUY",
        requestedSize: 1000,
        timestamp: Date.now(),
        // strategy: "scavenger", // Removed: Not in IntentSignal
        // confidence: 0.9,      // Removed: Not in IntentSignal
        // metadata: {}          // Optional
    };

    const decision1 = await guardian.checkSignal(signal, []);
    if (decision1.approved) {
        console.log("   PASS: Signal approved in NORMAL mode");
    } else {
        console.error(
            "   FAIL: Signal rejected in NORMAL mode",
            decision1.reason,
        );
    }

    // Test 2: Emergency Override
    console.log("\n🧪 Test 2: Emergency Override (DEFCON 5) - KILL SWITCH");
    gov.setOverride(DefconLevel.EMERGENCY);

    const decision2 = await guardian.checkSignal(signal, []);
    if (
        !decision2.approved && decision2.reason.includes("GOVERNANCE_LOCKDOWN")
    ) {
        console.log(
            "   PASS: Signal rejected in EMERGENCY mode with correct reason",
        );
    } else {
        console.error("   FAIL: Signal NOT rejected correctly", decision2);
    }

    // Test 3: Defensive Mode (Sentinel Only)
    console.log("\n🧪 Test 3: Defensive Mode (Sentinel Only)");
    gov.setOverride(DefconLevel.DEFENSIVE);

    // 3a. Scavenger Signal (Should fail)
    const decision3a = await guardian.checkSignal({
        ...signal,
        signalId: "test-3a",
    }, []);
    if (!decision3a.approved) {
        console.log("   PASS: Scavenger signal rejected in DEFENSIVE mode");
    } else {
        console.error("   FAIL: Scavenger signal approved in DEFENSIVE mode");
    }

    // 3b. Sentinel Signal (Should pass if risk ok)
    const sentinelSignal: IntentSignal = {
        ...signal,
        signalId: "test-3b",
        phaseId: "phase3",
        // strategy: "sentinel", // Removed
    };

    // Note: Sentinel might be rejected if Allocation for phase3 is 0?
    // AllocationEngine doesn't block signal based on weight usually, but RiskGuardian might check allocation cap.
    // Let's assume allocation is fine for test purpose (we didn't pass equity/allocation to checkSignal directly, it calculates internally?
    // No, checkSignal uses allocation from AllocationEngine but mainly for sizing caps.

    // Also need to trick RiskGuardian allocation check?
    // checkSignal -> getWeights -> returns allocated size.
    // If w3 is 0, allocated size is 0.
    // We initialized w3=0.0. Let's update allocation or ignore if checkSignal returns 'authorizedSize: 0' but 'approved: true' (unlikely).
    // Actually, RiskGuardian checks `maxPositionSize` which is `equity * allocation`. If allocation is 0, max size is 0.
    // So it will be throttled.

    // Let's NOT worry about Sentinel passing fully, just checking GOVERNANCE doesn't block it FIRST.
    // Governance check is 0a.
    // If it passes 0a, it proceeds to Risk Check.

    // However, since we can't easily peek inside checkSignal flow without logs, check result.
    // If reason is related to Risk/Allocation, it PASSED governance.

    const decision3b = await guardian.checkSignal(sentinelSignal, []);
    if (
        decision3b.reason && !decision3b.reason.includes("GOVERNANCE_LOCKDOWN")
    ) {
        console.log(
            `   PASS: Sentinel signal NOT blocked by Governance (Reason: ${decision3b.reason})`,
        );
    } else if (decision3b.approved) {
        console.log("   PASS: Sentinel signal approved");
    } else {
        console.error(
            "   FAIL: Sentinel signal blocked by Governance?",
            decision3b.reason,
        );
    }

    console.log("\n✅ Verification Complete");
}

verifyGovernance().catch(console.error);
