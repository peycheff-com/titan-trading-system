import { BudgetService } from "../dist/src/engine/BudgetService.js";
import { logger } from "../dist/src/utils/Logger.js";

// Mock Logger
logger.info = (msg) => console.log(`[INFO] ${msg}`);
logger.warn = (msg) => console.log(`[WARN] ${msg}`);
logger.error = (msg, err) => console.error(`[ERROR] ${msg}`, err);
logger.debug = () => {}; // silence debug

console.log("🔒 Starting Global Budget Verification...");

let currentDailyPnL = 0;
let lastBroadcasts = [];

// Mocks
const mockAllocationEngine = {
  getEquityTier: () => "TIER_1",
  getMaxLeverage: () => 10,
  getWeights: () => ({ w1: 0.3, w2: 0.3, w3: 0.4 }),
};

const mockRiskGuardian = {
  getEquity: () => 100000,
  getRegimeState: () => "Normal",
};

const mockNatsClient = {
  publish: (subject, payload) => {
    // console.log(`[NATS] Published to ${subject}`);
    lastBroadcasts.push({ ...payload, _subject: subject });
    return Promise.resolve();
  },
};

const mockPerformanceTracker = {
  getCurrentDailyPnL: () => currentDailyPnL,
};

// Init Service
const service = new BudgetService(
  {
    broadcastInterval: 999999,
    budgetTtl: 10000,
    slippageThresholdBps: 50,
    rejectRateThreshold: 0.1,
  },
  mockAllocationEngine,
  mockRiskGuardian,
  mockPerformanceTracker,
  mockNatsClient
);

async function runTest() {
    // ---------------------------------------------------------
    // Test 1: Normal Operation
    // ---------------------------------------------------------
    console.log("\n🧪 Test 1: Normal PnL (-100)");
    currentDailyPnL = -100;
    lastBroadcasts = [];

    // Call private method
    await service.broadcastBudgets();

    let closeOnlyCount = lastBroadcasts.filter(b => b.state === 'CLOSE_ONLY').length;
    let activeCount = lastBroadcasts.filter(b => b.state === 'ACTIVE').length;

    if (activeCount > 0 && closeOnlyCount === 0) {
        console.log("✅ Budgets are ACTIVE. (Correct)");
    } else {
        console.error("❌ Budgets should be ACTIVE.");
        console.log(lastBroadcasts);
        process.exit(1);
    }

    // ---------------------------------------------------------
    // Test 2: Max Daily Loss Exceeded
    // ---------------------------------------------------------
    console.log("\n🧪 Test 2: Breached PnL (-2000) vs MaxLoss (~1000)");
    // default policy maxDailyLoss is usually 1000 if not configured
    currentDailyPnL = -2000; 
    lastBroadcasts = [];

    await service.broadcastBudgets();

    closeOnlyCount = lastBroadcasts.filter(b => b.state === 'CLOSE_ONLY').length;
    let reasonCheck = lastBroadcasts.some(b => b.reason && b.reason.includes("Max Daily Loss Exceeded"));

    if (closeOnlyCount > 0 && reasonCheck) {
        console.log("✅ Budgets HALTED due to Daily Loss. Reason:", lastBroadcasts[0].reason);
    } else {
        console.error("❌ Failed to HALT on Daily Loss.");
        console.log("States:", lastBroadcasts.map(b => b.state));
        console.log("Reasons:", lastBroadcasts.map(b => b.reason));
        process.exit(1);
    }

    console.log("\n✅ Global Budget Verification Complete.");
}

runTest().catch((err) => {
    console.error("Test Failed:", err);
    process.exit(1);
});
