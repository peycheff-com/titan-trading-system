/**
 * DashboardController Unit Tests
 *
 * Tests for all dashboard and monitoring endpoints
 */

import { DashboardController } from "../../../src/server/controllers/DashboardController.js";
import { TitanBrain } from "../../../src/engine/TitanBrain.js";
import { DashboardService } from "../../../src/server/DashboardService.js";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

// Mock TitanBrain
const mockBrain = {
    getDashboardData: jest.fn(),
    exportDashboardJSON: jest.fn(),
    getAllApprovalRates: jest.fn(),
    getRecentDecisions: jest.fn(),
    getTreasuryStatus: jest.fn(),
    getNextSweepTriggerLevel: jest.fn(),
    getTotalSwept: jest.fn(),
    getHighWatermark: jest.fn(),
    getAllocation: jest.fn(),
    getEquity: jest.fn(),
    getCircuitBreakerStatus: jest.fn(),
} as unknown as TitanBrain;

// Mock DashboardService
const mockDashboardService = {
    getDashboardData: jest.fn(),
    exportDashboardJSON: jest.fn(),
} as unknown as DashboardService;

// Mock FastifyReply
const createMockReply = () => {
    const reply = {
        send: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
        header: jest.fn().mockReturnThis(),
    };
    return reply as unknown as FastifyReply;
};

// Mock FastifyRequest
const createMockRequest = (query: Record<string, string> = {}) => {
    return { query } as unknown as FastifyRequest<
        { Querystring: { limit?: string } }
    >;
};

describe("DashboardController", () => {
    let controller: DashboardController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new DashboardController(mockBrain, mockDashboardService);
    });

    describe("registerRoutes", () => {
        it("should register all routes on the server", () => {
            const mockServer = {
                get: jest.fn(),
            } as unknown as FastifyInstance;

            controller.registerRoutes(mockServer);

            expect(mockServer.get).toHaveBeenCalledTimes(10);
            expect(mockServer.get).toHaveBeenCalledWith(
                "/dashboard",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/dashboard/extended",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/dashboard/export",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/dashboard/export/extended",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/phases/approval-rates",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/phases/status",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/decisions",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/treasury",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/allocation",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/breaker",
                expect.any(Function),
            );
        });
    });

    describe("handleDashboard", () => {
        it("should return dashboard data on success", async () => {
            const mockData = { equity: 10000, regime: "Normal" };
            (mockBrain.getDashboardData as jest.Mock).mockResolvedValue(
                mockData,
            );
            const reply = createMockReply();

            await controller.handleDashboard(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(mockBrain.getDashboardData).toHaveBeenCalled();
            expect(reply.send).toHaveBeenCalledWith(mockData);
        });

        it("should return 500 on error", async () => {
            (mockBrain.getDashboardData as jest.Mock).mockRejectedValue(
                new Error("DB failure"),
            );
            const reply = createMockReply();

            await controller.handleDashboard(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.status).toHaveBeenCalledWith(500);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: "DB failure",
                    timestamp: expect.any(Number),
                }),
            );
        });

        it("should handle unknown error types", async () => {
            (mockBrain.getDashboardData as jest.Mock).mockRejectedValue(
                "string error",
            );
            const reply = createMockReply();

            await controller.handleDashboard(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.status).toHaveBeenCalledWith(500);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({ error: "Unknown error" }),
            );
        });
    });

    describe("handleExtendedDashboard", () => {
        it("should return extended dashboard data on success", async () => {
            const mockData = { extended: true, phases: [] };
            (mockDashboardService.getDashboardData as jest.Mock)
                .mockResolvedValue(mockData);
            const reply = createMockReply();

            await controller.handleExtendedDashboard(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(mockDashboardService.getDashboardData).toHaveBeenCalled();
            expect(reply.send).toHaveBeenCalledWith(mockData);
        });

        it("should return 500 on error", async () => {
            (mockDashboardService.getDashboardData as jest.Mock)
                .mockRejectedValue(new Error("Service error"));
            const reply = createMockReply();

            await controller.handleExtendedDashboard(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.status).toHaveBeenCalledWith(500);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({ error: "Service error" }),
            );
        });
    });

    describe("handleDashboardExport", () => {
        it("should export dashboard JSON with proper headers", async () => {
            const mockJson = { version: "1.0", data: {} };
            (mockBrain.exportDashboardJSON as jest.Mock).mockResolvedValue(
                mockJson,
            );
            const reply = createMockReply();

            await controller.handleDashboardExport(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.header).toHaveBeenCalledWith(
                "Content-Type",
                "application/json",
            );
            expect(reply.header).toHaveBeenCalledWith(
                "Content-Disposition",
                expect.stringContaining(
                    'attachment; filename="titan-brain-dashboard-',
                ),
            );
            expect(reply.send).toHaveBeenCalledWith(mockJson);
        });

        it("should return 500 on error", async () => {
            (mockBrain.exportDashboardJSON as jest.Mock).mockRejectedValue(
                new Error("Export failed"),
            );
            const reply = createMockReply();

            await controller.handleDashboardExport(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.status).toHaveBeenCalledWith(500);
        });
    });

    describe("handleExtendedDashboardExport", () => {
        it("should export extended dashboard JSON with proper headers", async () => {
            const mockJson = { extended: true };
            (mockDashboardService.exportDashboardJSON as jest.Mock)
                .mockResolvedValue(mockJson);
            const reply = createMockReply();

            await controller.handleExtendedDashboardExport(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.header).toHaveBeenCalledWith(
                "Content-Type",
                "application/json",
            );
            expect(reply.header).toHaveBeenCalledWith(
                "Content-Disposition",
                expect.stringContaining("titan-brain-extended-dashboard-"),
            );
            expect(reply.send).toHaveBeenCalledWith(mockJson);
        });

        it("should return 500 on error", async () => {
            (mockDashboardService.exportDashboardJSON as jest.Mock)
                .mockRejectedValue(new Error("Export failed"));
            const reply = createMockReply();

            await controller.handleExtendedDashboardExport(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.status).toHaveBeenCalledWith(500);
        });
    });

    describe("handleApprovalRates", () => {
        it("should return approval rates with timestamp", async () => {
            const mockRates = { phase1: 0.85, phase2: 0.92, phase3: 0.78 };
            (mockBrain.getAllApprovalRates as jest.Mock).mockReturnValue(
                mockRates,
            );
            const reply = createMockReply();

            await controller.handleApprovalRates(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.send).toHaveBeenCalledWith({
                approvalRates: mockRates,
                timestamp: expect.any(Number),
            });
        });

        it("should return 500 on error", async () => {
            (mockBrain.getAllApprovalRates as jest.Mock).mockImplementation(
                () => {
                    throw new Error("Rate calc failed");
                },
            );
            const reply = createMockReply();

            await controller.handleApprovalRates(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.status).toHaveBeenCalledWith(500);
        });
    });

    describe("handleRecentDecisions", () => {
        it("should return recent decisions with default limit", async () => {
            const mockDecisions = [{ decision: "approved" }, {
                decision: "rejected",
            }];
            (mockBrain.getRecentDecisions as jest.Mock).mockReturnValue(
                mockDecisions,
            );
            const reply = createMockReply();

            await controller.handleRecentDecisions(createMockRequest(), reply);

            expect(mockBrain.getRecentDecisions).toHaveBeenCalledWith(20);
            expect(reply.send).toHaveBeenCalledWith({
                decisions: mockDecisions,
                count: 2,
                timestamp: expect.any(Number),
            });
        });

        it("should respect custom limit from query", async () => {
            const mockDecisions = Array(50).fill({ decision: "approved" });
            (mockBrain.getRecentDecisions as jest.Mock).mockReturnValue(
                mockDecisions,
            );
            const reply = createMockReply();

            await controller.handleRecentDecisions(
                createMockRequest({ limit: "50" }),
                reply,
            );

            expect(mockBrain.getRecentDecisions).toHaveBeenCalledWith(50);
        });

        it("should cap limit at 100", async () => {
            (mockBrain.getRecentDecisions as jest.Mock).mockReturnValue([]);
            const reply = createMockReply();

            await controller.handleRecentDecisions(
                createMockRequest({ limit: "200" }),
                reply,
            );

            expect(mockBrain.getRecentDecisions).toHaveBeenCalledWith(100);
        });

        it("should return 500 on error", async () => {
            (mockBrain.getRecentDecisions as jest.Mock).mockImplementation(
                () => {
                    throw new Error("Decision error");
                },
            );
            const reply = createMockReply();

            await controller.handleRecentDecisions(createMockRequest(), reply);

            expect(reply.status).toHaveBeenCalledWith(500);
        });
    });

    describe("handleTreasuryStatus", () => {
        it("should return full treasury status", async () => {
            const mockTreasury = { balance: 50000, allocated: 45000 };
            (mockBrain.getTreasuryStatus as jest.Mock).mockResolvedValue(
                mockTreasury,
            );
            (mockBrain.getNextSweepTriggerLevel as jest.Mock).mockReturnValue(
                60000,
            );
            (mockBrain.getTotalSwept as jest.Mock).mockReturnValue(5000);
            (mockBrain.getHighWatermark as jest.Mock).mockReturnValue(55000);
            const reply = createMockReply();

            await controller.handleTreasuryStatus(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.send).toHaveBeenCalledWith({
                ...mockTreasury,
                nextSweepTriggerLevel: 60000,
                totalSwept: 5000,
                highWatermark: 55000,
                timestamp: expect.any(Number),
            });
        });

        it("should return 500 on error", async () => {
            (mockBrain.getTreasuryStatus as jest.Mock).mockRejectedValue(
                new Error("Treasury error"),
            );
            const reply = createMockReply();

            await controller.handleTreasuryStatus(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.status).toHaveBeenCalledWith(500);
        });
    });

    describe("handleAllocation", () => {
        it("should return allocation with calculated phase equity", async () => {
            const mockAllocation = { w1: 0.33, w2: 0.33, w3: 0.34 };
            (mockBrain.getAllocation as jest.Mock).mockReturnValue(
                mockAllocation,
            );
            (mockBrain.getEquity as jest.Mock).mockReturnValue(30000);
            const reply = createMockReply();

            await controller.handleAllocation(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.send).toHaveBeenCalledWith({
                allocation: mockAllocation,
                equity: 30000,
                phaseEquity: {
                    phase1: 30000 * 0.33,
                    phase2: 30000 * 0.33,
                    phase3: 30000 * 0.34,
                },
                timestamp: expect.any(Number),
            });
        });

        it("should return 500 on error", async () => {
            (mockBrain.getAllocation as jest.Mock).mockImplementation(() => {
                throw new Error("Allocation error");
            });
            const reply = createMockReply();

            await controller.handleAllocation(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.status).toHaveBeenCalledWith(500);
        });
    });

    describe("handleBreakerStatus", () => {
        it("should return circuit breaker status", async () => {
            const mockStatus = { tripped: false, tripCount: 0 };
            (mockBrain.getCircuitBreakerStatus as jest.Mock).mockReturnValue(
                mockStatus,
            );
            const reply = createMockReply();

            await controller.handleBreakerStatus(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.send).toHaveBeenCalledWith(mockStatus);
        });

        it("should return 500 on error", async () => {
            (mockBrain.getCircuitBreakerStatus as jest.Mock).mockImplementation(
                () => {
                    throw new Error("Breaker error");
                },
            );
            const reply = createMockReply();

            await controller.handleBreakerStatus(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.status).toHaveBeenCalledWith(500);
        });
    });

    describe("handlePhasesStatus", () => {
        it("should return full phase status with calculated values", async () => {
            const mockRates = { phase1: 0.85, phase2: 0.92, phase3: 0.78 };
            const mockAllocation = { w1: 0.4, w2: 0.35, w3: 0.25 };
            (mockBrain.getAllApprovalRates as jest.Mock).mockReturnValue(
                mockRates,
            );
            (mockBrain.getAllocation as jest.Mock).mockReturnValue(
                mockAllocation,
            );
            (mockBrain.getEquity as jest.Mock).mockReturnValue(100000);
            const reply = createMockReply();

            await controller.handlePhasesStatus(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.send).toHaveBeenCalledWith({
                phases: {
                    phase1: {
                        name: "Scavenger",
                        allocation: 0.4,
                        equity: 40000,
                        approvalRate: 0.85,
                        status: "active",
                    },
                    phase2: {
                        name: "Hunter",
                        allocation: 0.35,
                        equity: 35000,
                        approvalRate: 0.92,
                        status: "active",
                    },
                    phase3: {
                        name: "Sentinel",
                        allocation: 0.25,
                        equity: 25000,
                        approvalRate: 0.78,
                        status: "active",
                    },
                },
                totalEquity: 100000,
                timestamp: expect.any(Number),
            });
        });

        it("should mark phases as inactive when allocation is 0", async () => {
            const mockRates = { phase1: 0.85, phase2: 0, phase3: 0.78 };
            const mockAllocation = { w1: 0.5, w2: 0, w3: 0.5 };
            (mockBrain.getAllApprovalRates as jest.Mock).mockReturnValue(
                mockRates,
            );
            (mockBrain.getAllocation as jest.Mock).mockReturnValue(
                mockAllocation,
            );
            (mockBrain.getEquity as jest.Mock).mockReturnValue(100000);
            const reply = createMockReply();

            await controller.handlePhasesStatus(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            const response = (reply.send as jest.Mock).mock.calls[0][0];
            expect(response.phases.phase2.status).toBe("inactive");
            expect(response.phases.phase2.equity).toBe(0);
        });

        it("should return 500 on error", async () => {
            (mockBrain.getAllApprovalRates as jest.Mock).mockImplementation(
                () => {
                    throw new Error("Phases error");
                },
            );
            const reply = createMockReply();

            await controller.handlePhasesStatus(
                createMockRequest() as unknown as FastifyRequest,
                reply,
            );

            expect(reply.status).toHaveBeenCalledWith(500);
        });
    });
});
