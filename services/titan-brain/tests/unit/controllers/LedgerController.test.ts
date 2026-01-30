/**
 * LedgerController Unit Tests
 *
 * Tests for ledger transaction and balance endpoints
 */

import { LedgerController } from "../../../src/server/controllers/LedgerController.js";
import { LedgerRepository } from "../../../src/db/repositories/LedgerRepository.js";
import { Logger } from "../../../src/logging/Logger.js";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

// Mock LedgerRepository
const mockLedgerRepository = {
    getRecentTransactions: jest.fn(),
    getTransactionById: jest.fn(),
    getBalances: jest.fn(),
} as unknown as LedgerRepository;

// Mock Logger
const mockLogger = {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
} as unknown as Logger;

// Mock createCorrelationLogger
jest.mock("../../../src/middleware/CorrelationMiddleware.js", () => ({
    createCorrelationLogger: jest.fn(() => mockLogger),
}));

// Mock FastifyReply
const createMockReply = () => {
    const reply = {
        send: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
    };
    return reply as unknown as FastifyReply;
};

describe("LedgerController", () => {
    let controller: LedgerController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new LedgerController(mockLedgerRepository, mockLogger);
    });

    describe("registerRoutes", () => {
        it("should register all ledger routes", () => {
            const mockServer = {
                get: jest.fn(),
            } as unknown as FastifyInstance;

            controller.registerRoutes(mockServer);

            expect(mockServer.get).toHaveBeenCalledTimes(3);
            expect(mockServer.get).toHaveBeenCalledWith(
                "/ledger/transactions",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/ledger/transactions/:id",
                expect.any(Function),
            );
            expect(mockServer.get).toHaveBeenCalledWith(
                "/ledger/balances",
                expect.any(Function),
            );
        });
    });

    describe("getTransactions", () => {
        const createRequest = (query: Record<string, number | string> = {}) =>
            ({
                query,
            }) as unknown as FastifyRequest<{
                Querystring: {
                    limit?: number;
                    offset?: number;
                    account?: string;
                };
            }>;

        it("should return transactions with default pagination", async () => {
            const mockTransactions = [
                { id: "1", amount: 100, type: "credit" },
                { id: "2", amount: 50, type: "debit" },
            ];
            (mockLedgerRepository.getRecentTransactions as jest.Mock)
                .mockResolvedValue(mockTransactions);
            const reply = createMockReply();

            await controller.getTransactions(createRequest(), reply);

            expect(mockLedgerRepository.getRecentTransactions)
                .toHaveBeenCalledWith(50, 0);
            expect(reply.send).toHaveBeenCalledWith({
                data: mockTransactions,
                meta: {
                    limit: 50,
                    offset: 0,
                    count: 2,
                },
            });
        });

        it("should respect custom limit and offset", async () => {
            const mockTransactions = [{ id: "1", amount: 100 }];
            (mockLedgerRepository.getRecentTransactions as jest.Mock)
                .mockResolvedValue(mockTransactions);
            const reply = createMockReply();

            await controller.getTransactions(
                createRequest({ limit: 10, offset: 20 }),
                reply,
            );

            expect(mockLedgerRepository.getRecentTransactions)
                .toHaveBeenCalledWith(10, 20);
            expect(reply.send).toHaveBeenCalledWith({
                data: mockTransactions,
                meta: {
                    limit: 10,
                    offset: 20,
                    count: 1,
                },
            });
        });

        it("should return 500 on error", async () => {
            (mockLedgerRepository.getRecentTransactions as jest.Mock)
                .mockRejectedValue(
                    new Error("DB error"),
                );
            const reply = createMockReply();

            await controller.getTransactions(createRequest(), reply);

            expect(reply.status).toHaveBeenCalledWith(500);
            expect(reply.send).toHaveBeenCalledWith({
                error: "Failed to fetch transactions",
            });
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });

    describe("getTransactionById", () => {
        const createRequest = (id: string) =>
            ({
                params: { id },
            }) as unknown as FastifyRequest<{ Params: { id: string } }>;

        it("should return transaction when found", async () => {
            const mockTransaction = {
                id: "tx-123",
                amount: 100,
                type: "credit",
            };
            (mockLedgerRepository.getTransactionById as jest.Mock)
                .mockResolvedValue(mockTransaction);
            const reply = createMockReply();

            await controller.getTransactionById(createRequest("tx-123"), reply);

            expect(mockLedgerRepository.getTransactionById)
                .toHaveBeenCalledWith("tx-123");
            expect(reply.send).toHaveBeenCalledWith(mockTransaction);
        });

        it("should return 404 when transaction not found", async () => {
            (mockLedgerRepository.getTransactionById as jest.Mock)
                .mockResolvedValue(null);
            const reply = createMockReply();

            await controller.getTransactionById(createRequest("tx-999"), reply);

            expect(reply.status).toHaveBeenCalledWith(404);
            expect(reply.send).toHaveBeenCalledWith({
                error: "Transaction not found",
            });
        });

        it("should return 500 on error", async () => {
            (mockLedgerRepository.getTransactionById as jest.Mock)
                .mockRejectedValue(
                    new Error("DB error"),
                );
            const reply = createMockReply();

            await controller.getTransactionById(createRequest("tx-123"), reply);

            expect(reply.status).toHaveBeenCalledWith(500);
            expect(reply.send).toHaveBeenCalledWith({
                error: "Failed to fetch transaction",
            });
        });
    });

    describe("getBalances", () => {
        const createRequest = () => ({}) as unknown as FastifyRequest;

        it("should return all balances", async () => {
            const mockBalances = [
                { account: "phase1", balance: 10000 },
                { account: "phase2", balance: 5000 },
                { account: "phase3", balance: 3000 },
            ];
            (mockLedgerRepository.getBalances as jest.Mock).mockResolvedValue(
                mockBalances,
            );
            const reply = createMockReply();

            await controller.getBalances(createRequest(), reply);

            expect(mockLedgerRepository.getBalances).toHaveBeenCalled();
            expect(reply.send).toHaveBeenCalledWith({ data: mockBalances });
        });

        it("should return 500 on error", async () => {
            (mockLedgerRepository.getBalances as jest.Mock).mockRejectedValue(
                new Error("DB error"),
            );
            const reply = createMockReply();

            await controller.getBalances(createRequest(), reply);

            expect(reply.status).toHaveBeenCalledWith(500);
            expect(reply.send).toHaveBeenCalledWith({
                error: "Failed to fetch balances",
            });
        });
    });
});
