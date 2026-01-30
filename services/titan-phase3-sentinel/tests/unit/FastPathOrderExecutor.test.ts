/* Jest globals: describe, it, expect, beforeEach, afterEach, jest */
import {
    type FastPathExecutorConfig,
    FastPathOrderExecutor,
} from "../../src/execution/FastPathOrderExecutor.js";
import type { Order } from "../../src/types/orders.js";

// Mock FastPathClient
jest.mock("@titan/shared", () => {
    const mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isConnected: jest.fn().mockReturnValue(true),
        sendPrepare: jest.fn().mockResolvedValue({ prepared: true }),
        sendConfirm: jest.fn().mockResolvedValue({
            executed: true,
            fill_price: 50000,
        }),
        sendAbort: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn().mockReturnValue({ connected: true }),
        getMetrics: jest.fn().mockReturnValue({ requests: 0 }),
        on: jest.fn(),
    };
    return {
        FastPathClient: jest.fn().mockImplementation(() => mockClient),
        __mockClient: mockClient,
    };
});

describe("FastPathOrderExecutor", () => {
    let executor: FastPathOrderExecutor;
    let mockClient: any;

    beforeEach(() => {
        const shared = require("@titan/shared");
        mockClient = shared.__mockClient;

        // Reset all mocks
        Object.values(mockClient).forEach((fn: any) => {
            if (typeof fn.mockClear === "function") fn.mockClear();
        });

        mockClient.isConnected.mockReturnValue(true);
        mockClient.sendPrepare.mockResolvedValue({ prepared: true });
        mockClient.sendConfirm.mockResolvedValue({
            executed: true,
            fill_price: 50000,
        });

        executor = new FastPathOrderExecutor();
    });

    describe("constructor", () => {
        it("should create instance with default config", () => {
            const exec = new FastPathOrderExecutor();
            expect(exec).toBeDefined();
        });

        it("should create instance with custom config", () => {
            const config: FastPathExecutorConfig = {
                socketPath: "/custom/socket.sock",
                hmacSecret: "custom-secret",
            };
            const exec = new FastPathOrderExecutor(config);
            expect(exec).toBeDefined();
        });

        it("should register error handler on client", () => {
            new FastPathOrderExecutor();
            expect(mockClient.on).toHaveBeenCalledWith(
                "error",
                expect.any(Function),
            );
        });

        it("should register maxReconnectAttemptsReached handler", () => {
            new FastPathOrderExecutor();
            expect(mockClient.on).toHaveBeenCalledWith(
                "maxReconnectAttemptsReached",
                expect.any(Function),
            );
        });
    });

    describe("connect", () => {
        it("should call client connect", async () => {
            await executor.connect();
            expect(mockClient.connect).toHaveBeenCalled();
        });
    });

    describe("disconnect", () => {
        it("should call client disconnect", async () => {
            await executor.disconnect();
            expect(mockClient.disconnect).toHaveBeenCalled();
        });
    });

    describe("isConnected", () => {
        it("should return true when connected", () => {
            mockClient.isConnected.mockReturnValue(true);
            expect(executor.isConnected()).toBe(true);
        });

        it("should return false when disconnected", () => {
            mockClient.isConnected.mockReturnValue(false);
            expect(executor.isConnected()).toBe(false);
        });
    });

    describe("executeOrder", () => {
        const createTestOrder = (overrides: Partial<Order> = {}): Order => ({
            symbol: "BTCUSDT",
            side: "BUY",
            type: "MARKET",
            size: 0.1,
            ...overrides,
        });

        it("should return FAILED status when not connected", async () => {
            mockClient.isConnected.mockReturnValue(false);

            const result = await executor.executeOrder(createTestOrder());

            expect(result.status).toBe("FAILED");
            expect(result.filledSize).toBe(0);
        });

        it("should execute BUY order successfully", async () => {
            const order = createTestOrder({
                side: "BUY",
                size: 0.5,
                price: 50000,
            });

            const result = await executor.executeOrder(order);

            expect(result.status).toBe("FILLED");
            expect(result.filledSize).toBe(0.5);
        });

        it("should execute SELL order successfully", async () => {
            const order = createTestOrder({ side: "SELL", size: 0.3 });

            const result = await executor.executeOrder(order);

            expect(result.status).toBe("FILLED");
            expect(result.filledSize).toBe(0.3);
        });

        it("should return FAILED when prepare is rejected", async () => {
            mockClient.sendPrepare.mockResolvedValue({ prepared: false });

            const result = await executor.executeOrder(createTestOrder());

            expect(result.status).toBe("FAILED");
        });

        it("should return FAILED when confirm fails", async () => {
            mockClient.sendConfirm.mockResolvedValue({ executed: false });

            const result = await executor.executeOrder(createTestOrder());

            expect(result.status).toBe("FAILED");
        });

        it("should return avgPrice from confirm result", async () => {
            mockClient.sendConfirm.mockResolvedValue({
                executed: true,
                fill_price: 51000,
            });

            const result = await executor.executeOrder(createTestOrder());

            expect(result.avgPrice).toBe(51000);
        });

        it("should use order price if fill_price not provided", async () => {
            mockClient.sendConfirm.mockResolvedValue({ executed: true });
            const order = createTestOrder({ price: 49000 });

            const result = await executor.executeOrder(order);

            expect(result.avgPrice).toBe(49000);
        });

        it("should abort on error and return FAILED", async () => {
            mockClient.sendPrepare.mockRejectedValue(new Error("IPC error"));

            const result = await executor.executeOrder(createTestOrder());

            expect(result.status).toBe("FAILED");
            expect(mockClient.sendAbort).toHaveBeenCalled();
        });

        it("should handle abort error gracefully", async () => {
            mockClient.sendPrepare.mockRejectedValue(new Error("IPC error"));
            mockClient.sendAbort.mockRejectedValue(new Error("Abort failed"));

            const result = await executor.executeOrder(createTestOrder());

            expect(result.status).toBe("FAILED");
        });

        it("should include timestamp in result", async () => {
            const before = Date.now();
            const result = await executor.executeOrder(createTestOrder());
            const after = Date.now();

            expect(result.timestamp).toBeGreaterThanOrEqual(before);
            expect(result.timestamp).toBeLessThanOrEqual(after);
        });

        it("should generate unique orderId", async () => {
            const result1 = await executor.executeOrder(createTestOrder());
            const result2 = await executor.executeOrder(createTestOrder());

            expect(result1.orderId).not.toBe(result2.orderId);
        });
    });

    describe("getPrice", () => {
        it("should return 0 when cache is empty", async () => {
            const price = await executor.getPrice("BTCUSDT");
            expect(price).toBe(0);
        });

        it("should return cached price when fresh", async () => {
            executor.updatePriceCache("BTCUSDT", 50000);

            const price = await executor.getPrice("BTCUSDT");

            expect(price).toBe(50000);
        });

        it("should return 0 when cache is stale", async () => {
            executor.updatePriceCache("BTCUSDT", 50000);

            // Mock Date.now to simulate time passing
            const originalNow = Date.now;
            jest.spyOn(Date, "now").mockReturnValue(originalNow() + 2000);

            const price = await executor.getPrice("BTCUSDT");

            expect(price).toBe(0);
            (Date.now as jest.Mock).mockRestore();
        });
    });

    describe("updatePriceCache", () => {
        it("should update price cache", () => {
            executor.updatePriceCache("ETHUSDT", 3000);

            // We can verify by getting the price
            expect(executor.getPrice("ETHUSDT")).resolves.toBe(3000);
        });

        it("should overwrite existing cache entry", async () => {
            executor.updatePriceCache("BTCUSDT", 50000);
            executor.updatePriceCache("BTCUSDT", 51000);

            const price = await executor.getPrice("BTCUSDT");
            expect(price).toBe(51000);
        });
    });

    describe("getStatus", () => {
        it("should return client status", () => {
            mockClient.getStatus.mockReturnValue({
                connected: true,
                pending: 0,
            });

            const status = executor.getStatus();

            expect(status).toEqual({ connected: true, pending: 0 });
        });
    });

    describe("getMetrics", () => {
        it("should return client metrics", () => {
            mockClient.getMetrics.mockReturnValue({ requests: 100, errors: 2 });

            const metrics = executor.getMetrics();

            expect(metrics).toEqual({ requests: 100, errors: 2 });
        });
    });
});
