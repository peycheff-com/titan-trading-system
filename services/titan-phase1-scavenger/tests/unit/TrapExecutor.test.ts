import { TrapExecutor } from "../../src/engine/components/TrapExecutor";
import { TripwireCalculators } from "../../src/calculators/TripwireCalculators";
import { VelocityCalculator } from "../../src/calculators/VelocityCalculator";
import { CVDCalculator } from "../../src/calculators/CVDCalculator";
import { PositionSizeCalculator } from "../../src/calculators/PositionSizeCalculator";
import { LeadLagDetector } from "../../src/calculators/LeadLagDetector";
import { TrapStateManager } from "../../src/engine/components/TrapStateManager";
import { SignalClient } from "@titan/shared";
import { EventEmitter } from "../../src/events/EventEmitter";
import { Logger } from "../../src/logging/Logger";
import { Tripwire } from "../../src/types";

// Keep jest.mock to avoid side effects of imports, but we will use manual objects for injection
jest.mock("../../src/calculators/TripwireCalculators");
jest.mock("../../src/calculators/VelocityCalculator");
jest.mock("../../src/calculators/CVDCalculator");
jest.mock("../../src/calculators/PositionSizeCalculator");
jest.mock("../../src/calculators/LeadLagDetector");
jest.mock("../../src/engine/components/TrapStateManager");

// Manual mock for @titan/shared
const mockNatsClient = {
    isConnected: jest.fn().mockReturnValue(true),
    subscribe: jest.fn(),
    publish: jest.fn(),
};

jest.mock("@titan/shared", () => {
    const mockSharedLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        fatal: jest.fn(),
    };

    return {
        SignalClient: jest.fn(),
        getNatsClient: jest.fn(() => mockNatsClient),
        TitanSubject: {
            EVT_BUDGET_UPDATE: "EVT_BUDGET_UPDATE",
        },
        PhaseBudget: jest.fn(),
        Logger: {
            getInstance: jest.fn(() => mockSharedLogger),
        },
    };
});

describe("TrapExecutor Logic", () => {
    let executor: TrapExecutor;
    let mockBybitClient: any;
    let mockLogger: any;
    let mockConfig: any;
    let mockEventEmitter: EventEmitter;
    let mockVelocityCalculator: any;
    let mockPositionSizeCalculator: any;
    let mockCvdCalculator: any;
    let mockLeadLagDetector: any;
    let mockStateManager: any;
    let mockSignalClient: any;

    beforeEach(() => {
        // Manual Mocks
        mockBybitClient = {
            getCurrentPrice: jest.fn().mockResolvedValue(50000),
        };
        mockLogger = {
            log: jest.fn(), // Silence logs for clean pass
            info: jest.fn(),
            warn: jest.fn((msg) => console.warn(msg)), // Keep warns for debug if needed
            error: jest.fn((msg, err) => console.error(msg, err)),
        };
        mockConfig = {
            getConfig: jest.fn().mockReturnValue({
                ghostMode: false,
                stopLossPercent: 0.01,
                targetPercent: 0.03,
                extremeVelocityThreshold: 0.005,
                moderateVelocityThreshold: 0.001,
                aggressiveLimitMarkup: 0.002,
            }),
        };
        mockEventEmitter = new EventEmitter();

        mockVelocityCalculator = {
            calcVelocity: jest.fn(),
            getAcceleration: jest.fn().mockReturnValue(-0.0001),
            getLastPrice: jest.fn().mockReturnValue(50000),
        };

        mockPositionSizeCalculator = {
            calcPositionSize: jest.fn().mockReturnValue(0.1),
        };

        mockCvdCalculator = {
            calcCVD: jest.fn().mockResolvedValue({
                cvd: -100,
                delta: 0,
                ratio: 0,
            }),
        };

        mockLeadLagDetector = {
            detect: jest.fn().mockResolvedValue({
                condition: "NORMAL",
                leadExchange: "BINANCE",
                lag: 0,
            }),
            getLeader: jest.fn().mockResolvedValue("BINANCE"),
        };

        mockStateManager = {
            getTrapMap: jest.fn(),
            get: jest.fn(),
            getAllSymbols: jest.fn(),
            updateTrap: jest.fn(),
            getLastActivationTime: jest.fn().mockReturnValue(0),
            setLastActivationTime: jest.fn(),
            getVolumeCounter: jest.fn().mockReturnValue({
                startTime: Date.now(),
            }),
            incrementFailedAttempts: jest.fn(),
            resetFailedAttempts: jest.fn(), // FIX: Added resetFailedAttempts
        };

        // Mock SignalClient
        mockSignalClient = {
            connect: jest.fn().mockResolvedValue(undefined),
            sendPrepare: jest.fn().mockResolvedValue({ prepared: true }),
            sendConfirm: jest.fn().mockResolvedValue({
                executed: true,
                fill_price: 50000,
            }),
        };

        executor = new TrapExecutor({
            logger: mockLogger,
            config: mockConfig,
            eventEmitter: mockEventEmitter,
            bybitClient: mockBybitClient,
            stateManager: mockStateManager,
            signalClient: mockSignalClient,
            positionSizeCalculator: mockPositionSizeCalculator,
            velocityCalculator: mockVelocityCalculator,
            cvdCalculator: mockCvdCalculator,
            leadLagDetector: mockLeadLagDetector,
        });

        // Spy on private methods by casting to any
        // Override checkCooldowns: return TRUE to proceed
        jest.spyOn(executor as any, "checkCooldowns").mockReturnValue(true);
        (executor as any).isTrapStillValid = jest.fn().mockReturnValue(true);

        const mockTrapMap = new Map();
        mockStateManager.getTrapMap.mockReturnValue(mockTrapMap);
    });

    const createMockTrap = (overrides: any = {}): Tripwire => ({
        symbol: "BTCUSDT",
        triggerPrice: 50000,
        direction: "LONG",
        type: "LIQUIDATION", // mapped to TrapType
        confidence: 90,
        attempts: 0,
        activated: true,
        activatedAt: Date.now(),
        cooldownUntil: 0,
        volatilityMetrics: {
            atr: 100,
            regime: "NORMAL",
            stopLossMultiplier: 1,
            positionSizeMultiplier: 1,
            meanVolume: 1000,
        },
        ...overrides,
    } as Tripwire);

    test("BASELINE: Should fire when all conditions are safe", async () => {
        const testTrap = createMockTrap();
        mockStateManager.getTrapMap.mockReturnValue(
            new Map([["BTCUSDT", [testTrap]]]),
        );

        await executor.fire(testTrap);

        expect(mockCvdCalculator.calcCVD).toHaveBeenCalled();
        expect(mockVelocityCalculator.getAcceleration).toHaveBeenCalled();
        expect(mockSignalClient.sendPrepare).toHaveBeenCalled(); // Should fire IPC
    });

    test("GHOST MODE: Should Log Only and skip IPC", async () => {
        mockConfig.getConfig.mockReturnValue({ ghostMode: true });
        const testTrap = createMockTrap();
        mockStateManager.getTrapMap.mockReturnValue(
            new Map([["BTCUSDT", [testTrap]]]),
        );

        const infoSpy = mockLogger.info;

        await executor.fire(testTrap);

        expect(infoSpy).toHaveBeenCalledWith(
            expect.stringContaining("👻 GHOST MODE ACTIVE"),
        );
        expect(mockSignalClient.sendPrepare).not.toHaveBeenCalled(); // Should NOT fire IPC
    });

    test("ACCELERATION VETO: Should abort if Price is Accelerating (Falling Knife)", async () => {
        // Simulate "Falling Knife"
        mockVelocityCalculator.getAcceleration.mockReturnValue(0.005); // Positive acceleration
        const testTrap = createMockTrap();
        mockStateManager.getTrapMap.mockReturnValue(
            new Map([["BTCUSDT", [testTrap]]]),
        );

        const warnSpy = mockLogger.warn;

        await executor.fire(testTrap);

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("🛑 KNIFE-CATCH VETO"),
        );
        expect(mockSignalClient.sendPrepare).not.toHaveBeenCalled();
    });

    test("TREND VETO: Should abort if Strong Trend exists against the trade", async () => {
        const testTrap = createMockTrap({
            adx: 40,
            trend: "DOWN",
            direction: "LONG",
        });
        mockStateManager.getTrapMap.mockReturnValue(
            new Map([["BTCUSDT", [testTrap]]]),
        );

        const warnSpy = mockLogger.warn;

        await executor.fire(testTrap);

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("🛑 TREND VETO"),
        );
        expect(mockSignalClient.sendPrepare).not.toHaveBeenCalled();
    });

    test("TREND ALLOW: Should allow trade if Strong Trend is WITH the trade", async () => {
        const testTrap = createMockTrap({
            adx: 40,
            trend: "UP",
            direction: "LONG",
        });
        mockStateManager.getTrapMap.mockReturnValue(
            new Map([["BTCUSDT", [testTrap]]]),
        );

        await executor.fire(testTrap);

        expect(mockSignalClient.sendPrepare).toHaveBeenCalled();
    });
});
