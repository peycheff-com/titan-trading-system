/**
 * AuditController Unit Tests
 *
 * Tests for audit log retrieval API endpoints
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuditController } from "../../../src/server/controllers/AuditController.js";

// Mock TitanBrain and Logger
const createMockBrain = (hasEventStore: boolean = true) => ({
    getEventStore: jest.fn().mockReturnValue(
        hasEventStore
            ? {
                getRecentEvents: jest.fn().mockResolvedValue([
                    {
                        id: "1",
                        type: "SIGNAL_RECEIVED",
                        timestamp: Date.now() - 1000,
                    },
                    {
                        id: "2",
                        type: "TRADE_EXECUTED",
                        timestamp: Date.now() - 500,
                    },
                    { id: "3", type: "POSITION_OPENED", timestamp: Date.now() },
                ]),
            }
            : null,
    ),
});

const createMockLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
});

const createMockReply = () => ({
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
});

describe("AuditController", () => {
    let controller: AuditController;
    let mockBrain: ReturnType<typeof createMockBrain>;
    let mockLogger: ReturnType<typeof createMockLogger>;

    beforeEach(() => {
        mockBrain = createMockBrain();
        mockLogger = createMockLogger();
        controller = new AuditController(mockBrain as any, mockLogger as any);
    });

    describe("registerRoutes", () => {
        it("should register the /audit/logs route", () => {
            const mockServer = {
                get: jest.fn(),
            };

            controller.registerRoutes(mockServer as unknown as FastifyInstance);

            expect(mockServer.get).toHaveBeenCalledWith(
                "/audit/logs",
                expect.objectContaining({
                    handler: expect.any(Function),
                    schema: expect.objectContaining({
                        querystring: expect.any(Object),
                    }),
                }),
            );
        });
    });

    describe("getLogs", () => {
        it("should return audit logs with default limit", async () => {
            const reply = createMockReply();
            const request = {
                query: {},
            } as FastifyRequest<
                { Querystring: { limit?: string; type?: string } }
            >;

            // Access private method via bind context
            const server = {
                get: jest.fn((path, config) => {
                    config.handler(request, reply);
                }),
            };
            controller.registerRoutes(server as unknown as FastifyInstance);

            // Wait for async handler
            await new Promise((r) => setTimeout(r, 10));

            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.any(Array),
                    meta: expect.objectContaining({
                        limit: 50, // default
                        count: 3,
                    }),
                }),
            );
        });

        it("should return audit logs with custom limit", async () => {
            const reply = createMockReply();
            const request = {
                query: { limit: "10" },
            } as unknown as FastifyRequest<
                { Querystring: { limit?: string; type?: string } }
            >;

            const server = {
                get: jest.fn((path, config) => {
                    config.handler(request, reply);
                }),
            };
            controller.registerRoutes(server as unknown as FastifyInstance);

            await new Promise((r) => setTimeout(r, 10));

            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    meta: expect.objectContaining({
                        limit: 10,
                    }),
                }),
            );
        });

        it("should filter logs by type", async () => {
            const reply = createMockReply();
            const request = {
                query: { type: "SIGNAL_RECEIVED" },
            } as unknown as FastifyRequest<
                { Querystring: { limit?: string; type?: string } }
            >;

            const server = {
                get: jest.fn((path, config) => {
                    config.handler(request, reply);
                }),
            };
            controller.registerRoutes(server as unknown as FastifyInstance);

            await new Promise((r) => setTimeout(r, 10));

            const eventStore = mockBrain.getEventStore();
            expect(eventStore!.getRecentEvents).toHaveBeenCalledWith(
                50,
                "SIGNAL_RECEIVED",
            );
        });

        it("should return 503 when EventStore is unavailable", async () => {
            // Create controller without event store
            const brainNoStore = createMockBrain(false);
            const controllerNoStore = new AuditController(
                brainNoStore as any,
                mockLogger as any,
            );

            const reply = createMockReply();
            const request = {
                query: {},
            } as FastifyRequest<
                { Querystring: { limit?: string; type?: string } }
            >;

            const server = {
                get: jest.fn((path, config) => {
                    config.handler(request, reply);
                }),
            };
            controllerNoStore.registerRoutes(
                server as unknown as FastifyInstance,
            );

            await new Promise((r) => setTimeout(r, 10));

            expect(reply.status).toHaveBeenCalledWith(503);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: "Audit Store unavailable",
                }),
            );
        });

        it("should handle errors and return 500", async () => {
            // Force error
            const brainWithError = createMockBrain();
            brainWithError.getEventStore().getRecentEvents.mockRejectedValue(
                new Error("Database error"),
            );
            const controllerWithError = new AuditController(
                brainWithError as any,
                mockLogger as any,
            );

            const reply = createMockReply();
            const request = {
                query: {},
            } as FastifyRequest<
                { Querystring: { limit?: string; type?: string } }
            >;

            const server = {
                get: jest.fn((path, config) => {
                    config.handler(request, reply);
                }),
            };
            controllerWithError.registerRoutes(
                server as unknown as FastifyInstance,
            );

            await new Promise((r) => setTimeout(r, 10));

            expect(reply.status).toHaveBeenCalledWith(500);
            expect(reply.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    error: "Internal Server Error",
                }),
            );
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
