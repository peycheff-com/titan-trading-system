import { TitanTrap } from "../src/engine/TitanTrap.js";
import { EventEmitter } from "events";
// Mock Dependencies
const mockEventEmitter = new EventEmitter();
const mockLogger = console;
const mockConfig = {
    getConfig: () => ({
        minTradesIn100ms: 50,
    }),
};
const mockBinanceClient = {
    subscribeAggTrades: async () => { },
    subscribeOrderBook: async () => { },
};
const mockBybitClient = {
    getEquity: async () => 10000, // $10k Equity
    fetchTopSymbols: async () => [],
    subscribeTicker: () => { },
};
const mockExecutionClient = {
    connect: async () => { },
    disconnect: async () => { },
    on: () => { },
    sendIntent: async (signal) => {
        console.log("MOCK Execution Client received Intent:", JSON.stringify(signal, null, 2));
        GLOBAL_INTENT = signal; // Capture for verification
    },
    getStatus: () => ({ socketPath: "/tmp/titan.sock" }),
};
// Mock Calculators
const mockTripwireCalculators = {};
const mockVelocityCalculator = {
    getAcceleration: () => 0,
    recordPrice: () => { },
};
const mockPositionSizeCalculator = {};
const mockCvdCalculator = {
    calcCVD: async () => -100, // Counter-flow
    recordTrade: () => { },
};
const mockLeadLagDetector = {
    recordPrice: () => { },
};
let GLOBAL_INTENT = null;
async function runSimulation() {
    console.log("--- Simulating Scavenger Execution with Slippage Guards ---");
    const trap = new TitanTrap({
        binanceClient: mockBinanceClient,
        bybitClient: mockBybitClient,
        logger: mockLogger,
        config: mockConfig,
        eventEmitter: mockEventEmitter,
        tripwireCalculators: mockTripwireCalculators,
        velocityCalculator: mockVelocityCalculator,
        positionSizeCalculator: mockPositionSizeCalculator,
    });
    // Inject mocks manually if they weren't passed in ctor correctly or needed overriding
    trap.executionClient = mockExecutionClient;
    trap.cvdCalculator = mockCvdCalculator; // Override with configured mock
    // Initialize
    await trap.start();
    // Test Case 1: Fire Trap
    const tripwire = {
        symbol: "BTCUSDT",
        triggerPrice: 50000,
        direction: "LONG",
        trapType: "LIQUIDATION_CLUSTER",
        confidence: 0.9,
        activated: false,
    };
    console.log("\nTest 1: Firing Trap...");
    // Simulate fire - should trigger ExecutionClient.sendIntent
    // passing burstVolume to potentially verify logic
    await trap.fire(tripwire, 50, 100);
    // Check Intent
    if (!GLOBAL_INTENT) {
        console.error("FAILED: No intent sent");
    }
    else {
        // Verify max_slippage_bps
        if (GLOBAL_INTENT.max_slippage_bps === 50) { // Default 50 bps?
            console.log("SUCCESS: Intent contains max_slippage_bps: 50");
        }
        else {
            console.log(`CHECK: Intent max_slippage_bps is ${GLOBAL_INTENT.max_slippage_bps}`);
            // If undefined, maybe it's not set in Scavenger but defaults in Rust?
            // But user asked to verify "Scavenger with... Slippage Guards".
            // So Scavenger SHOULD send it.
            if (GLOBAL_INTENT.max_slippage_bps === undefined) {
                console.warn("WARNING: max_slippage_bps is undefined in intent!");
            }
        }
    }
    await trap.stop();
}
runSimulation().catch(console.error);
//# sourceMappingURL=simulate_slippage.js.map