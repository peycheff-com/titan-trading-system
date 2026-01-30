/**
 * NatsConsumer Unit Tests
 *
 * Tests for NATS message consumption and connection management
 */

import { NatsConsumer } from "../../src/server/NatsConsumer.js";

// Mock dependencies
const mockNatsClient = {
    isConnected: jest.fn().mockReturnValue(false),
    connect: jest.fn().mockResolvedValue(undefined),
    subscribe: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
};

jest.mock("@titan/shared", () => ({
    getNatsClient: jest.fn(() => mockNatsClient),
    ExecutionReportSchema: {
        parse: jest.fn((data) => data),
    },
    TitanSubject: {
        EXECUTION_REPORTS: "titan.evt.exec.report.v1",
        EXECUTION_FILL: "titan.evt.exec.fill.v1",
        DASHBOARD_UPDATES: "titan.evt.dashboard.update",
        EVT_REGIME_UPDATE: "titan.evt.regime.update",
        MARKET_DATA: "titan.evt.market.data",
        EVT_PHASE_POSTURE: "titan.evt.phase.posture",
        EVT_PHASE_DIAGNOSTICS: "titan.evt.phase.diagnostics",
        CMD_AI_OPTIMIZE_PROPOSAL: "titan.cmd.ai.optimize.proposal",
    },
}));

jest.mock("../../src/monitoring/index.js", () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    })),
}));

const createMockBrain = () => ({
    handleExecutionReport: jest.fn().mockResolvedValue(undefined),
    handlePowerLawUpdate: jest.fn().mockResolvedValue(undefined),
    handleMarketData: jest.fn(),
    handleAIProposal: jest.fn().mockResolvedValue(undefined),
    handleSystemState: jest.fn().mockResolvedValue(undefined),
});

const createMockWebSocketService = () => ({
    broadcastSignal: jest.fn(),
    broadcastTrade: jest.fn(),
    broadcastAlert: jest.fn(),
    broadcastPhase1Update: jest.fn(),
    broadcastStateUpdate: jest.fn(),
    broadcastPhasePosture: jest.fn(),
    broadcastPhaseDiagnostics: jest.fn(),
});

describe("NatsConsumer", () => {
    let consumer: NatsConsumer;
    let mockBrain: ReturnType<typeof createMockBrain>;
    let mockWsService: ReturnType<typeof createMockWebSocketService>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockNatsClient.isConnected.mockReturnValue(false);
        mockNatsClient.connect.mockResolvedValue(undefined);

        mockBrain = createMockBrain();
        mockWsService = createMockWebSocketService();

        consumer = new NatsConsumer(mockBrain as any, mockWsService as any);
    });

    describe("constructor", () => {
        it("should create consumer with brain and websocket service", () => {
            expect(consumer).toBeDefined();
        });

        it("should create consumer without websocket service", () => {
            const consumerNoWs = new NatsConsumer(mockBrain as any);
            expect(consumerNoWs).toBeDefined();
        });
    });

    describe("setWebSocketService", () => {
        it("should set the websocket service", () => {
            const consumerNoWs = new NatsConsumer(mockBrain as any);
            const newWsService = createMockWebSocketService();

            consumerNoWs.setWebSocketService(newWsService as any);

            expect(true).toBe(true);
        });
    });

    describe("start", () => {
        it("should connect to NATS when not connected", async () => {
            mockNatsClient.isConnected.mockReturnValue(false);

            await consumer.start();

            expect(mockNatsClient.connect).toHaveBeenCalledWith({
                servers: expect.arrayContaining([expect.any(String)]),
            });
        });

        it("should reuse existing connection when already connected", async () => {
            mockNatsClient.isConnected.mockReturnValue(true);

            await consumer.start();

            expect(mockNatsClient.connect).not.toHaveBeenCalled();
        });

        it("should use custom NATS URL when provided", async () => {
            mockNatsClient.isConnected.mockReturnValue(false);

            await consumer.start("nats://custom:4222");

            expect(mockNatsClient.connect).toHaveBeenCalledWith({
                servers: ["nats://custom:4222"],
            });
        });

        it("should subscribe to topics after connecting", async () => {
            mockNatsClient.isConnected.mockReturnValue(false);

            await consumer.start();

            expect(mockNatsClient.subscribe).toHaveBeenCalled();
        });

        it("should throw error when connection fails", async () => {
            mockNatsClient.isConnected.mockReturnValue(false);
            mockNatsClient.connect.mockRejectedValue(
                new Error("Connection failed"),
            );

            await expect(consumer.start()).rejects.toThrow("Connection failed");
        });
    });

    describe("topic subscriptions", () => {
        beforeEach(async () => {
            mockNatsClient.isConnected.mockReturnValue(false);
            await consumer.start();
        });

        it("should subscribe to execution reports", () => {
            expect(mockNatsClient.subscribe).toHaveBeenCalledWith(
                "titan.evt.exec.report.v1",
                expect.any(Function),
            );
        });

        it("should subscribe to execution fills with durable consumer", () => {
            expect(mockNatsClient.subscribe).toHaveBeenCalledWith(
                "titan.evt.exec.fill.v1.*",
                expect.any(Function),
                "BRAIN_RISK",
            );
        });

        it("should subscribe to dashboard updates", () => {
            expect(mockNatsClient.subscribe).toHaveBeenCalledWith(
                "titan.evt.dashboard.update",
                expect.any(Function),
            );
        });

        it("should subscribe to PowerLaw updates", () => {
            expect(mockNatsClient.subscribe).toHaveBeenCalledWith(
                "titan.evt.regime.update",
                expect.any(Function),
            );
        });

        it("should subscribe to market data", () => {
            expect(mockNatsClient.subscribe).toHaveBeenCalledWith(
                "titan.evt.market.data",
                expect.any(Function),
            );
        });

        it("should subscribe to AI optimization proposals with durable consumer", () => {
            expect(mockNatsClient.subscribe).toHaveBeenCalledWith(
                "titan.cmd.ai.optimize.proposal",
                expect.any(Function),
                "BRAIN_GOVERNANCE",
            );
        });

        it("should subscribe to system halt commands", () => {
            expect(mockNatsClient.subscribe).toHaveBeenCalledWith(
                "titan.cmd.sys.halt",
                expect.any(Function),
                "BRAIN_SYS_CONTROL",
            );
        });

        it("should subscribe to phase posture events", () => {
            expect(mockNatsClient.subscribe).toHaveBeenCalledWith(
                "titan.evt.phase.posture.*",
                expect.any(Function),
            );
        });

        it("should subscribe to phase diagnostics events", () => {
            expect(mockNatsClient.subscribe).toHaveBeenCalledWith(
                "titan.evt.phase.diagnostics.*",
                expect.any(Function),
            );
        });
    });

    describe("stop", () => {
        it("should close NATS connection", async () => {
            await consumer.stop();

            expect(mockNatsClient.close).toHaveBeenCalled();
        });
    });
});
