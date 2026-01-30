/* Jest globals: describe, it, expect, beforeEach */
import {
    PriceMonitor,
    type PriceQuote,
} from "../../src/router/PriceMonitor.js";
import type { IExchangeGateway } from "../../src/exchanges/interfaces.js";

// Mock Logger
jest.mock("@titan/shared", () => ({
    Logger: {
        getInstance: jest.fn(() => ({
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        })),
    },
}));

describe("PriceMonitor", () => {
    const createMockGateway = (
        name: string,
        price: number = 50000,
    ): IExchangeGateway => ({
        name,
        exchangeName: name,
        getPrice: jest.fn().mockResolvedValue(price),
        getSpotPrice: jest.fn().mockResolvedValue(price),
        getPerpPrice: jest.fn().mockResolvedValue(price + 100),
        getBalance: jest.fn().mockResolvedValue({
            free: 10000,
            used: 5000,
            total: 15000,
        }),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isConnected: jest.fn().mockReturnValue(true),
        initialize: jest.fn().mockResolvedValue(undefined),
    });

    describe("constructor", () => {
        it("should create instance with gateways", () => {
            const gateways = { binance: createMockGateway("binance") };
            const monitor = new PriceMonitor(gateways);
            expect(monitor).toBeDefined();
        });

        it("should accept multiple gateways", () => {
            const gateways = {
                binance: createMockGateway("binance"),
                bybit: createMockGateway("bybit"),
            };
            const monitor = new PriceMonitor(gateways);
            expect(monitor).toBeDefined();
        });
    });

    describe("getAllPrices", () => {
        it("should return prices from all gateways", async () => {
            const binanceGateway = createMockGateway("binance", 50000);
            const bybitGateway = createMockGateway("bybit", 50050);
            const gateways = { binance: binanceGateway, bybit: bybitGateway };
            const monitor = new PriceMonitor(gateways);

            const prices = await monitor.getAllPrices("BTCUSDT");

            expect(prices).toHaveLength(2);
            expect(prices.some((p) => p.exchange === "binance")).toBe(true);
            expect(prices.some((p) => p.exchange === "bybit")).toBe(true);
        });

        it("should include exchange name in quote", async () => {
            const gateways = { binance: createMockGateway("binance") };
            const monitor = new PriceMonitor(gateways);

            const prices = await monitor.getAllPrices("BTCUSDT");

            expect(prices[0].exchange).toBe("binance");
        });

        it("should include symbol in quote", async () => {
            const gateways = { binance: createMockGateway("binance") };
            const monitor = new PriceMonitor(gateways);

            const prices = await monitor.getAllPrices("ETHUSDT");

            expect(prices[0].symbol).toBe("ETHUSDT");
        });

        it("should include timestamp in quote", async () => {
            const gateways = { binance: createMockGateway("binance") };
            const monitor = new PriceMonitor(gateways);

            const before = Date.now();
            const prices = await monitor.getAllPrices("BTCUSDT");
            const after = Date.now();

            expect(prices[0].timestamp).toBeGreaterThanOrEqual(before);
            expect(prices[0].timestamp).toBeLessThanOrEqual(after);
        });

        it("should handle gateway with getTicker method", async () => {
            const gateway = createMockGateway("binance");
            // Add getTicker method
            (gateway as any).getTicker = jest.fn().mockResolvedValue({
                price: 50000,
                bid: 49995,
                ask: 50005,
            });
            const gateways = { binance: gateway };
            const monitor = new PriceMonitor(gateways);

            const prices = await monitor.getAllPrices("BTCUSDT");

            expect(prices[0].price).toBe(50000);
            expect(prices[0].bid).toBe(49995);
            expect(prices[0].ask).toBe(50005);
            expect(prices[0].spread).toBeCloseTo(0.0002, 4);
        });

        it("should filter out failed gateway requests", async () => {
            const binanceGateway = createMockGateway("binance");
            const bybitGateway = createMockGateway("bybit");
            // Make bybit fail
            (bybitGateway.getPrice as jest.Mock).mockRejectedValue(
                new Error("Gateway error"),
            );

            const gateways = { binance: binanceGateway, bybit: bybitGateway };
            const monitor = new PriceMonitor(gateways);

            const prices = await monitor.getAllPrices("BTCUSDT");

            expect(prices).toHaveLength(1);
            expect(prices[0].exchange).toBe("binance");
        });

        it("should return empty array when all gateways fail", async () => {
            const gateway = createMockGateway("binance");
            (gateway.getPrice as jest.Mock).mockRejectedValue(
                new Error("Gateway error"),
            );
            const gateways = { binance: gateway };
            const monitor = new PriceMonitor(gateways);

            const prices = await monitor.getAllPrices("BTCUSDT");

            expect(prices).toHaveLength(0);
        });
    });

    describe("getBestPrice", () => {
        it("should return lowest price for BUY side", async () => {
            const binanceGateway = createMockGateway("binance", 50000);
            const bybitGateway = createMockGateway("bybit", 49900);
            const gateways = { binance: binanceGateway, bybit: bybitGateway };
            const monitor = new PriceMonitor(gateways);

            const bestPrice = await monitor.getBestPrice("BTCUSDT", "BUY");

            expect(bestPrice?.price).toBe(49900);
            expect(bestPrice?.exchange).toBe("bybit");
        });

        it("should return highest price for SELL side", async () => {
            const binanceGateway = createMockGateway("binance", 50100);
            const bybitGateway = createMockGateway("bybit", 49900);
            const gateways = { binance: binanceGateway, bybit: bybitGateway };
            const monitor = new PriceMonitor(gateways);

            const bestPrice = await monitor.getBestPrice("BTCUSDT", "SELL");

            expect(bestPrice?.price).toBe(50100);
            expect(bestPrice?.exchange).toBe("binance");
        });

        it("should return null when no prices available", async () => {
            const gateway = createMockGateway("binance");
            (gateway.getPrice as jest.Mock).mockRejectedValue(
                new Error("Gateway error"),
            );
            const gateways = { binance: gateway };
            const monitor = new PriceMonitor(gateways);

            const bestPrice = await monitor.getBestPrice("BTCUSDT", "BUY");

            expect(bestPrice).toBeNull();
        });

        it("should return single price when only one gateway available", async () => {
            const gateways = { binance: createMockGateway("binance", 50000) };
            const monitor = new PriceMonitor(gateways);

            const bestBuy = await monitor.getBestPrice("BTCUSDT", "BUY");
            const bestSell = await monitor.getBestPrice("BTCUSDT", "SELL");

            expect(bestBuy?.price).toBe(50000);
            expect(bestSell?.price).toBe(50000);
        });

        it("should handle three or more gateways", async () => {
            const gateways = {
                binance: createMockGateway("binance", 50000),
                bybit: createMockGateway("bybit", 49800),
                okx: createMockGateway("okx", 50200),
            };
            const monitor = new PriceMonitor(gateways);

            const bestBuy = await monitor.getBestPrice("BTCUSDT", "BUY");
            const bestSell = await monitor.getBestPrice("BTCUSDT", "SELL");

            expect(bestBuy?.price).toBe(49800);
            expect(bestBuy?.exchange).toBe("bybit");
            expect(bestSell?.price).toBe(50200);
            expect(bestSell?.exchange).toBe("okx");
        });
    });
});
