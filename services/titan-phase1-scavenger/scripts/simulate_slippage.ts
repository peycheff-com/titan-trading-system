import { TitanTrap } from "../src/engine/TitanTrap.js";
import { EventEmitter } from "events";
import { Tripwire } from "../src/types/index.js";

// Mock Dependencies
const mockEventEmitter = new EventEmitter();
const mockLogger = console;
const mockConfig = {
    getConfig: () => ({
        minTradesIn100ms: 50,
    }),
};

const mockBinanceClient = {
    subscribeAggTrades: async () => {},
    subscribeOrderBook: async () => {},
};

const mockBybitClient = {
    getEquity: async () => 10000,
    fetchTopSymbols: async () => [],
    subscribeTicker: () => {},
};

const mockSignalClient = {
    connect: async () => {},
    disconnect: async () => {},
    sendPrepare: async () => ({ prepared: true, signal_id: "mock-sig" }),
    sendConfirm: async (signalId: string) => {
        console.log(
            "MOCK Signal Client Confirmed:",
            signalId,
        );
        return { executed: true, fill_price: 50000 };
    },
    sendAbort: async () => ({ aborted: true }),
    getStatus: () => ({ socketPath: "/tmp/titan-mock.sock" }),
};

// Mock Calculators
const mockTripwireCalculators = {};
const mockVelocityCalculator = {
    getAcceleration: () => 0,
    recordPrice: () => {},
    calcVelocity: () => 0.006, // Trigger aggressive or market
    getLastPrice: () => 50000,
};
const mockPositionSizeCalculator = {
    calcPositionSize: () => 0.1,
};
const mockCvdCalculator = {
    calcCVD: async () => -100, // Counter-flow
    recordTrade: () => {},
};
const mockLeadLagDetector = {
    recordPrice: () => {},
    getLeader: () => "BINANCE",
};
const mockTrapStateManager = {
    getLastActivationTime: () => 0,
    setLastActivationTime: () => {},
    getVolumeCounter: () => ({ startTime: Date.now() }), // Valid
    incrementFailedAttempts: () => 0,
    resetFailedAttempts: () => {},
    blacklistSymbol: () => {},
};

let GLOBAL_INTENT: any = null;

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
        cvdCalculator: mockCvdCalculator,
        leadLagDetector: mockLeadLagDetector,
        stateManager: mockTrapStateManager,
    } as any);

    // Inject mocks
    (trap as any).signalClient = mockSignalClient;
    // (trap as any).dependencies.signalClient = mockSignalClient; // If accessed via deps

    // Initialize
    await trap.start();

    // Test Case 1: Fire Trap
    const tripwire: Tripwire = {
        symbol: "BTCUSDT",
        triggerPrice: 50000,
        direction: "LONG",
        trapType: "LIQUIDATION_CLUSTER",
        confidence: 0.9,
        activated: false,
    };

    console.log("\nTest 1: Firing Trap...");
    try {
        await trap.fire(tripwire, 50, 100);
        console.log("SUCCESS: Trap fired and routed to SignalClient");
    } catch (e) {
        console.error("FAILED to fire trap:", e);
    }

    await trap.stop();
}

runSimulation().catch(console.error);
