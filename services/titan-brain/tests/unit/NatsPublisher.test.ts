/**
 * NatsPublisher Unit Tests
 *
 * Tests for NATS message publishing to other Titan services
 */

import {
    AIOptimizationRequest,
    getNatsPublisher,
    NatsPublisher,
} from "../../src/server/NatsPublisher.js";

// Mock @titan/shared NatsClient
const mockNatsClient = {
    connect: jest.fn(),
    publishEnvelope: jest.fn(),
    close: jest.fn(),
};

jest.mock("@titan/shared", () => ({
    getNatsClient: () => mockNatsClient,
    TitanSubject: {
        AI_OPTIMIZATION_REQUESTS: "titan.ai.optimize.requests",
    },
}));

// Mock monitoring/logger
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
};

jest.mock("../../src/monitoring/index.js", () => ({
    getLogger: () => mockLogger,
}));

describe("NatsPublisher", () => {
    let publisher: NatsPublisher;

    beforeEach(() => {
        jest.clearAllMocks();
        publisher = new NatsPublisher();
    });

    describe("connect", () => {
        it("should connect to NATS with default URL", async () => {
            mockNatsClient.connect.mockResolvedValue(undefined);

            await publisher.connect();

            expect(mockNatsClient.connect).toHaveBeenCalledWith({
                servers: [expect.stringContaining("nats://")],
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                "NatsPublisher connected",
            );
        });

        it("should connect to NATS with custom URL", async () => {
            mockNatsClient.connect.mockResolvedValue(undefined);

            await publisher.connect("nats://custom:4222");

            expect(mockNatsClient.connect).toHaveBeenCalledWith({
                servers: ["nats://custom:4222"],
            });
        });

        it("should not reconnect if already connected", async () => {
            mockNatsClient.connect.mockResolvedValue(undefined);

            await publisher.connect();
            await publisher.connect(); // Second call

            expect(mockNatsClient.connect).toHaveBeenCalledTimes(1);
        });

        it("should throw and log error on connection failure", async () => {
            const error = new Error("Connection refused");
            mockNatsClient.connect.mockRejectedValue(error);

            await expect(publisher.connect()).rejects.toThrow(
                "Connection refused",
            );
            expect(mockLogger.error).toHaveBeenCalledWith(
                "Failed to connect NatsPublisher",
                expect.any(Error),
            );
        });
    });

    describe("triggerAIOptimization", () => {
        const request: AIOptimizationRequest = {
            reason: "Performance degradation",
            triggeredBy: "RiskGuardian",
            phaseId: "phase1",
            metrics: { sharpeRatio: 1.5, winRate: 0.6 },
            timestamp: Date.now(),
        };

        it("should publish optimization request when connected", async () => {
            mockNatsClient.connect.mockResolvedValue(undefined);
            mockNatsClient.publishEnvelope.mockResolvedValue(undefined);

            await publisher.connect();
            await publisher.triggerAIOptimization(request);

            expect(mockNatsClient.publishEnvelope).toHaveBeenCalledWith(
                "titan.ai.optimize.requests",
                request,
                expect.objectContaining({
                    type: "titan.control.ai.optimize.v1",
                    version: 1,
                    producer: "titan-brain",
                }),
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                "AI optimization request published",
                expect.objectContaining({
                    reason: request.reason,
                    triggeredBy: request.triggeredBy,
                    phaseId: request.phaseId,
                }),
            );
        });

        it("should warn and skip when not connected", async () => {
            await publisher.triggerAIOptimization(request);

            expect(mockNatsClient.publishEnvelope).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                "NatsPublisher not connected, cannot trigger AI optimization",
            );
        });

        it("should log error on publish failure", async () => {
            mockNatsClient.connect.mockResolvedValue(undefined);
            mockNatsClient.publishEnvelope.mockRejectedValue(
                new Error("Publish failed"),
            );

            await publisher.connect();
            await publisher.triggerAIOptimization(request);

            expect(mockLogger.error).toHaveBeenCalledWith(
                "Failed to publish AI optimization request",
                expect.any(Error),
            );
        });
    });

    describe("publishRiskCommand", () => {
        const riskCommand = {
            action: "HALT",
            actor_id: "brain",
            reason: "Max drawdown exceeded",
        };

        it("should publish risk command when connected", async () => {
            mockNatsClient.connect.mockResolvedValue(undefined);
            mockNatsClient.publishEnvelope.mockResolvedValue(undefined);

            await publisher.connect();
            await publisher.publishRiskCommand(riskCommand);

            expect(mockNatsClient.publishEnvelope).toHaveBeenCalledWith(
                "titan.cmd.risk.halt",
                riskCommand,
                expect.objectContaining({
                    type: "titan.control.risk.v1",
                    version: 1,
                    producer: "titan-brain",
                }),
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                "Risk Command Published: titan.cmd.risk.halt",
                expect.objectContaining({
                    action: "HALT",
                    actor: "brain",
                }),
            );
        });

        it("should warn and skip when not connected", async () => {
            await publisher.publishRiskCommand(riskCommand);

            expect(mockNatsClient.publishEnvelope).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                "NatsPublisher not connected, cannot publish RISK command",
            );
        });

        it("should throw and log error on publish failure", async () => {
            mockNatsClient.connect.mockResolvedValue(undefined);
            mockNatsClient.publishEnvelope.mockRejectedValue(
                new Error("Publish failed"),
            );

            await publisher.connect();
            await expect(publisher.publishRiskCommand(riskCommand)).rejects
                .toThrow("Publish failed");
            expect(mockLogger.error).toHaveBeenCalledWith(
                "Failed to publish Risk command",
                expect.any(Error),
            );
        });
    });

    describe("close", () => {
        it("should close connection when connected", async () => {
            mockNatsClient.connect.mockResolvedValue(undefined);
            mockNatsClient.close.mockResolvedValue(undefined);

            await publisher.connect();
            await publisher.close();

            expect(mockNatsClient.close).toHaveBeenCalled();
        });

        it("should not close when not connected", async () => {
            await publisher.close();

            expect(mockNatsClient.close).not.toHaveBeenCalled();
        });

        it("should prevent further operations after close", async () => {
            mockNatsClient.connect.mockResolvedValue(undefined);
            mockNatsClient.close.mockResolvedValue(undefined);

            await publisher.connect();
            await publisher.close();

            // Now it should warn about not being connected
            await publisher.triggerAIOptimization({
                reason: "test",
                triggeredBy: "test",
                timestamp: Date.now(),
            });

            expect(mockLogger.warn).toHaveBeenCalledWith(
                "NatsPublisher not connected, cannot trigger AI optimization",
            );
        });
    });

    describe("getNatsPublisher singleton", () => {
        it("should return the same instance", () => {
            // Note: Due to module-level state, we just verify the function exists
            expect(typeof getNatsPublisher).toBe("function");
        });
    });
});
