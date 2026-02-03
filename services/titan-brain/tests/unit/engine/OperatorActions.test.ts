import { SignalProcessor } from "../../../src/engine/SignalProcessor";
import { BrainStateManager } from "../../../src/engine/BrainStateManager";
import { RiskGuardian } from "../../../src/features/Risk/RiskGuardian";
import { AllocationEngine } from "../../../src/features/Allocation/AllocationEngine";
import { PerformanceTracker } from "../../../src/engine/PerformanceTracker";
import { CircuitBreaker } from "../../../src/engine/CircuitBreaker";
import { IntentSignal } from "../../../src/types";
// import { Logger } from "../../../src/utils/Logger";

// Verify paths:
// tests/unit/engine/OperatorActions.test.ts
// ../../../src/engine/SignalProcessor.ts -> services/titan-brain/src/engine/SignalProcessor.ts (Correct)

jest.mock("@titan/shared", () => ({
    getNatsClient: () => ({
        isConnected: () => true,
        publish: jest.fn(),
        subscribe: jest.fn(),
    }),
    createIntentMessage: (p: any) => p,
    TitanSubject: { SIGNAL_SUBMIT: "titan.signal.submit.v1" },
    TITAN_SUBJECTS: {
        CMD: {
            EXECUTION: {
                PLACE: (venue: string, account: string, symbol: string) =>
                    `titan.cmd.execution.place.v1.${venue}.${account}.${symbol}`,
                PREFIX: "titan.cmd.execution.place.v1",
                ALL: "titan.cmd.execution.place.v1.>",
            },
        },
        DLQ: {
            BRAIN: "titan.dlq.brain.processing",
        },
    },
    getCanonicalRiskPolicy: () => ({ policy: {}, hash: "mock-hash" }),
    Logger: class {
        constructor(config: any) {}
        static getInstance() {
            return {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            };
        }
    },
    SharedLogLevel: {
        INFO: "INFO",
        ERROR: "ERROR",
        WARN: "WARN",
        DEBUG: "DEBUG",
    },
}));

// Mock Logger
jest.mock("../../../src/utils/Logger", () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    },
}));

describe("operator_actions_enforcement", () => {
    // Mocks
    const mockRiskGuardian = {
        checkSignal: jest.fn(),
        getRiskMetrics: jest.fn(),
        getRegimeState: jest.fn().mockReturnValue("STABLE"),
    } as unknown as RiskGuardian;

    const mockAllocationEngine = {
        getWeights: jest.fn().mockReturnValue({ w1: 0, w2: 0, w3: 0 }),
        getRegimeAdjustedWeights: jest.fn().mockReturnValue({
            p1: 0.3,
            p2: 0.3,
            p3: 0.4,
        }),
    } as unknown as AllocationEngine;

    const mockPerformanceTracker = {
        getPhasePerformance: jest.fn().mockResolvedValue({}),
    } as unknown as PerformanceTracker;

    const mockCircuitBreaker = {
        checkContext: jest.fn().mockReturnValue({ ALLOWED: true }),
        isActive: jest.fn().mockReturnValue(false),
        getStatus: jest.fn().mockReturnValue("HEALTHY"),
    } as unknown as CircuitBreaker;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should default to DISARMED state", () => {
        const stateManager = new BrainStateManager();
        expect(stateManager.isArmed()).toBe(false);
    });

    it("should reject signals when DISARMED", async () => {
        const stateManager = new BrainStateManager();
        stateManager.setArmed(false); // Explicitly ensure disarmed

        const processor = new SignalProcessor(
            mockRiskGuardian,
            mockAllocationEngine,
            mockPerformanceTracker,
            stateManager,
            mockCircuitBreaker,
        );

        const signal: IntentSignal = {
            signalId: "sig-123",
            symbol: "BTC/USD",
            side: "BUY",
            type: "SETUP",
            confidence: 1.0,
            phaseId: "phase1",
            timestamp: Date.now(),
        } as any;

        const result = await processor.processSignal(signal);

        expect(result.approved).toBe(false);
        expect(result.reason).toContain("System Disarmed");
    });

    it("should allow processing when ARMED", async () => {
        const stateManager = new BrainStateManager();
        stateManager.setArmed(true);

        (mockRiskGuardian.checkSignal as jest.Mock).mockReturnValue({
            approved: true,
            adjustedSize: 1.0,
            riskMetrics: {} as any,
        });
        (mockRiskGuardian.getRiskMetrics as jest.Mock).mockReturnValue({});

        const processor = new SignalProcessor(
            mockRiskGuardian,
            mockAllocationEngine,
            mockPerformanceTracker,
            stateManager,
            mockCircuitBreaker,
        );

        const signal: IntentSignal = {
            signalId: "sig-123",
            symbol: "BTC/USD",
            side: "BUY",
            type: "SETUP",
            confidence: 1.0,
            phaseId: "phase1",
            timestamp: Date.now(),
        } as any;

        const result = await processor.processSignal(signal);

        // Should pass the Armed check and hit the Risk check (which we mocked to approve)
        expect(result.approved).toBe(true);
        expect(result.reason).not.toContain("System Disarmed");
    });
});
