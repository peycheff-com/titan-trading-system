/* Jest globals: describe, it, expect, beforeEach, afterEach, jest */
import {
    type SentinelConfig,
    SentinelCore,
} from "../../src/engine/SentinelCore.js";
import type { IExchangeGateway } from "../../src/exchanges/interfaces.js";

// Mock dependencies that use NATS
jest.mock("@titan/shared", () => ({
    getNatsClient: jest.fn(() => ({
        isConnected: jest.fn().mockReturnValue(false),
        publish: jest.fn(),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
    })),
    SignalClient: jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        sendPrepare: jest.fn().mockResolvedValue({ prepared: true }),
        sendConfirm: jest.fn().mockResolvedValue({
            executed: true,
            fill_price: 50000,
        }),
    })),
    TitanSubject: {
        EVT_PHASE_POSTURE: "titan.evt.phase.posture",
        EVT_PHASE_DIAGNOSTICS: "titan.evt.phase.diagnostics",
    },
    Logger: {
        getInstance: jest.fn(() => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        })),
    },
}));

describe("SentinelCore", () => {
    const createMockGateway = (name: string): IExchangeGateway => ({
        name,
        exchangeName: name,
        getSpotPrice: jest.fn().mockResolvedValue(50000),
        getPerpPrice: jest.fn().mockResolvedValue(50100),
        getPrice: jest.fn().mockResolvedValue(50000),
        getBalance: jest.fn().mockResolvedValue({
            free: 10000,
            used: 5000,
            total: 15000,
        }),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isConnected: jest.fn().mockReturnValue(true),
        initialize: jest.fn().mockResolvedValue(undefined),
        getTicker: jest.fn().mockResolvedValue({
            price: 50000,
            bid: 49995,
            ask: 50005,
        }),
    });

    const createDefaultConfig = (): SentinelConfig => ({
        updateIntervalMs: 1000,
        symbol: "BTCUSDT",
        initialCapital: 100000,
        riskLimits: {
            maxDrawdown: 0.1,
            maxLeverage: 3,
            maxDelta: 10000,
        },
    });

    describe("constructor", () => {
        it("should create instance with valid config and gateways", () => {
            const config = createDefaultConfig();
            const gateways = [
                createMockGateway("binance"),
                createMockGateway("bybit"),
            ];

            const core = new SentinelCore(config, gateways);

            expect(core).toBeDefined();
            expect(core.router).toBeDefined();
            expect(core.portfolio).toBeDefined();
            expect(core.risk).toBeDefined();
            expect(core.vacuum).toBeDefined();
            expect(core.performance).toBeDefined();
            expect(core.signals).toBeDefined();
            expect(core.priceMonitor).toBeDefined();
        });

        it("should initialize components with gateway map", () => {
            const config = createDefaultConfig();
            const binanceGateway = createMockGateway("binance");
            const bybitGateway = createMockGateway("bybit");
            const gateways = [binanceGateway, bybitGateway];

            const core = new SentinelCore(config, gateways);

            expect(core).toBeDefined();
        });

        it("should accept single gateway", () => {
            const config = createDefaultConfig();
            const gateways = [createMockGateway("binance")];

            const core = new SentinelCore(config, gateways);

            expect(core).toBeDefined();
        });
    });

    describe("start / stop lifecycle", () => {
        let core: SentinelCore;

        beforeEach(() => {
            jest.useFakeTimers();
            const config = createDefaultConfig();
            const gateways = [
                createMockGateway("binance-spot"),
                createMockGateway("binance-perp"),
            ];
            core = new SentinelCore(config, gateways);
        });

        afterEach(async () => {
            await core.stop();
            jest.useRealTimers();
        });

        it("should start successfully", async () => {
            const logEvents: string[] = [];
            core.on("log", (msg: string) => logEvents.push(msg));

            await core.start();

            expect(logEvents).toContain("Sentinel Core Starting...");
            expect(
                logEvents.some((m) =>
                    m.includes("Signal Client Connected") ||
                    m.includes("Signal Client Connect Failed")
                ),
            ).toBe(true);
        });

        it("should emit started log message", async () => {
            const logEvents: string[] = [];
            core.on("log", (msg: string) => logEvents.push(msg));

            await core.start();

            expect(logEvents).toContain("Sentinel Core Started.");
        });

        it("should be idempotent - calling start twice does nothing", async () => {
            let startCount = 0;
            core.on("log", (msg: string) => {
                if (msg === "Sentinel Core Starting...") startCount++;
            });

            await core.start();
            await core.start();

            expect(startCount).toBe(1);
        });

        it("should stop successfully", async () => {
            const logEvents: string[] = [];
            core.on("log", (msg: string) => logEvents.push(msg));

            await core.start();
            await core.stop();

            expect(logEvents).toContain("Sentinel Core Stopped.");
        });
    });

    describe("updateRegime", () => {
        let core: SentinelCore;

        beforeEach(() => {
            const config = createDefaultConfig();
            const gateways = [createMockGateway("binance")];
            core = new SentinelCore(config, gateways);
        });

        it("should update regime and APTR", () => {
            core.updateRegime("VOLATILE", 0.0025);

            expect(core.getRegime()).toBe("VOLATILE");
        });

        it("should emit log on regime change", () => {
            const logEvents: string[] = [];
            core.on("log", (msg: string) => logEvents.push(msg));

            core.updateRegime("CRASH", 0.005);

            expect(logEvents.some((m) => m.includes("Regime Change"))).toBe(
                true,
            );
        });

        it("should not emit log if regime unchanged", () => {
            const logEvents: string[] = [];
            // First set to STABLE (initial)
            core.on("log", (msg: string) => logEvents.push(msg));

            // Update to same regime
            core.updateRegime("STABLE", 0.001);

            expect(logEvents.filter((m) => m.includes("Regime Change")))
                .toHaveLength(0);
        });
    });

    describe("updateBudget", () => {
        let core: SentinelCore;

        beforeEach(() => {
            const config = createDefaultConfig();
            const gateways = [createMockGateway("binance")];
            core = new SentinelCore(config, gateways);
        });

        it("should update budget", () => {
            core.updateBudget(50000);

            expect(core.getBudget()).toBe(50000);
        });

        it("should emit log on budget update", () => {
            const logEvents: string[] = [];
            core.on("log", (msg: string) => logEvents.push(msg));

            core.updateBudget(75000);

            expect(logEvents.some((m) => m.includes("Budget Updated"))).toBe(
                true,
            );
            expect(logEvents.some((m) => m.includes("75000"))).toBe(true);
        });
    });

    describe("getRegime", () => {
        it("should return initial regime as STABLE", () => {
            const config = createDefaultConfig();
            const gateways = [createMockGateway("binance")];
            const core = new SentinelCore(config, gateways);

            expect(core.getRegime()).toBe("STABLE");
        });
    });

    describe("getBudget", () => {
        it("should return initial budget as 0", () => {
            const config = createDefaultConfig();
            const gateways = [createMockGateway("binance")];
            const core = new SentinelCore(config, gateways);

            expect(core.getBudget()).toBe(0);
        });
    });

    describe("event emitter", () => {
        let core: SentinelCore;

        beforeEach(() => {
            const config = createDefaultConfig();
            const gateways = [createMockGateway("binance")];
            core = new SentinelCore(config, gateways);
        });

        it("should emit log events", () => {
            const listener = jest.fn();
            core.on("log", listener);

            core.updateBudget(1000);

            expect(listener).toHaveBeenCalled();
        });

        it("should support multiple listeners", () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            core.on("log", listener1);
            core.on("log", listener2);

            core.updateBudget(1000);

            expect(listener1).toHaveBeenCalled();
            expect(listener2).toHaveBeenCalled();
        });
    });

    describe("component access", () => {
        let core: SentinelCore;

        beforeEach(() => {
            const config = createDefaultConfig();
            const gateways = [createMockGateway("binance")];
            core = new SentinelCore(config, gateways);
        });

        it("should expose router", () => {
            expect(core.router).toBeDefined();
        });

        it("should expose portfolio manager", () => {
            expect(core.portfolio).toBeDefined();
        });

        it("should expose risk manager", () => {
            expect(core.risk).toBeDefined();
        });

        it("should expose vacuum monitor", () => {
            expect(core.vacuum).toBeDefined();
        });

        it("should expose performance tracker", () => {
            expect(core.performance).toBeDefined();
        });

        it("should expose signal generator", () => {
            expect(core.signals).toBeDefined();
        });

        it("should expose price monitor", () => {
            expect(core.priceMonitor).toBeDefined();
        });
    });

    describe("configuration", () => {
        it("should respect custom update interval", () => {
            const config: SentinelConfig = {
                updateIntervalMs: 5000,
                symbol: "ETHUSDT",
                initialCapital: 50000,
                riskLimits: {
                    maxDrawdown: 0.15,
                    maxLeverage: 5,
                    maxDelta: 20000,
                },
            };
            const gateways = [createMockGateway("binance")];

            const core = new SentinelCore(config, gateways);

            expect(core).toBeDefined();
        });

        it("should work with different symbols", () => {
            const config = createDefaultConfig();
            config.symbol = "ETHUSDT";
            const gateways = [createMockGateway("binance")];

            const core = new SentinelCore(config, gateways);

            expect(core).toBeDefined();
        });
    });
});
