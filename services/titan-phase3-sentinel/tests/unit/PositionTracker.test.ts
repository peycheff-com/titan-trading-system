/* Jest globals: describe, it, expect, beforeEach */
import { PositionTracker } from "../../src/portfolio/PositionTracker.js";
import type { IExchangeGateway } from "../../src/exchanges/interfaces.js";

describe("PositionTracker", () => {
    const createMockGateway = (
        overrides: Partial<IExchangeGateway> = {},
    ): IExchangeGateway => ({
        name: "mock-gateway",
        async getPrice(symbol: string): Promise<number> {
            return symbol.includes("BTC") ? 50000 : 2000;
        },
        async getOrderBook(symbol: string) {
            return { bids: [[50000, 1]], asks: [[50001, 1]] };
        },
        async getFundingRate(symbol: string) {
            return 0.0001;
        },
        async getBalance() {
            return { free: 10000, used: 5000, total: 15000 };
        },
        async placeOrder(order: any) {
            return {
                orderId: "test-123",
                status: "FILLED",
                filledSize: order.size,
                avgPrice: 50000,
                fees: 0.1,
            };
        },
        async cancelOrder(orderId: string) {
            return true;
        },
        ...overrides,
    });

    describe("constructor", () => {
        it("should initialize with empty positions", () => {
            const tracker = new PositionTracker({});
            const report = tracker.getHealthReport();

            expect(report.positions).toHaveLength(0);
            expect(report.nav).toBe(0);
            expect(report.delta).toBe(0);
        });

        it("should store gateways reference", () => {
            const gateways = {
                binance: createMockGateway({ name: "binance" }),
                bybit: createMockGateway({ name: "bybit" }),
            };

            const tracker = new PositionTracker(gateways);
            const report = tracker.getHealthReport();

            expect(report.riskStatus).toBe("HEALTHY");
        });
    });

    describe("updatePosition", () => {
        it("should create new position if not exists", async () => {
            const tracker = new PositionTracker({
                binance: createMockGateway(),
            });

            const position = await tracker.updatePosition("BTCUSDT");

            expect(position.symbol).toBe("BTCUSDT");
            expect(position.type).toBe("CORE");
        });

        it("should update existing position with new basis", async () => {
            const tracker = new PositionTracker({
                binance: createMockGateway(),
            });

            // First update
            await tracker.updatePosition("BTCUSDT");

            // Second update
            const position = await tracker.updatePosition("BTCUSDT");

            expect(position.symbol).toBe("BTCUSDT");
            expect(position.currentBasis).toBeDefined();
        });

        it("should try multiple gateways for price", async () => {
            const failingGateway = createMockGateway({
                name: "failing",
                async getPrice() {
                    throw new Error("Network error");
                },
            });

            const workingGateway = createMockGateway({
                name: "working",
                async getPrice() {
                    return 55000;
                },
            });

            const tracker = new PositionTracker({
                failing: failingGateway,
                working: workingGateway,
            });

            const position = await tracker.updatePosition("BTCUSDT");

            // Should succeed using the working gateway
            expect(position.symbol).toBe("BTCUSDT");
        });

        it("should return zero price when all gateways fail", async () => {
            const failingGateway1 = createMockGateway({
                async getPrice() {
                    throw new Error("Error 1");
                },
            });

            const failingGateway2 = createMockGateway({
                async getPrice() {
                    throw new Error("Error 2");
                },
            });

            const tracker = new PositionTracker({
                gw1: failingGateway1,
                gw2: failingGateway2,
            });

            const position = await tracker.updatePosition("BTCUSDT");

            expect(position.currentBasis).toBe(0);
        });

        it("should skip gateways returning zero price", async () => {
            const zeroGateway = createMockGateway({
                async getPrice() {
                    return 0;
                },
            });

            const validGateway = createMockGateway({
                async getPrice() {
                    return 45000;
                },
            });

            const tracker = new PositionTracker({
                zero: zeroGateway,
                valid: validGateway,
            });

            const position = await tracker.updatePosition("BTCUSDT");

            expect(position.symbol).toBe("BTCUSDT");
        });
    });

    describe("updateSize", () => {
        let tracker: PositionTracker;

        beforeEach(() => {
            tracker = new PositionTracker({
                binance: createMockGateway(),
            });
        });

        it("should create position on first size update", () => {
            tracker.updateSize("BTCUSDT", 1.0, -1.0, 50000);

            const report = tracker.getHealthReport();
            const position = report.positions[0];

            expect(position.symbol).toBe("BTCUSDT");
            expect(position.spotSize).toBe(1.0);
            expect(position.perpSize).toBe(-1.0);
            expect(position.spotEntry).toBe(50000);
            expect(position.perpEntry).toBe(50000);
        });

        it("should accumulate spot position size", () => {
            tracker.updateSize("BTCUSDT", 1.0, 0, 50000);
            tracker.updateSize("BTCUSDT", 0.5, 0, 52000);

            const report = tracker.getHealthReport();
            const position = report.positions[0];

            expect(position.spotSize).toBe(1.5);
            // Weighted average: (1 * 50000 + 0.5 * 52000) / 1.5 = 50666.67
            expect(position.spotEntry).toBeCloseTo(50666.67, 0);
        });

        it("should accumulate perp position size", () => {
            tracker.updateSize("BTCUSDT", 0, -1.0, 50000);
            tracker.updateSize("BTCUSDT", 0, -0.5, 48000);

            const report = tracker.getHealthReport();
            const position = report.positions[0];

            expect(position.perpSize).toBe(-1.5);
            // Weighted average: (-1 * 50000 + -0.5 * 48000) / -1.5 = 49333.33
            expect(position.perpEntry).toBeCloseTo(49333.33, 0);
        });

        it("should handle reducing position to zero", () => {
            tracker.updateSize("BTCUSDT", 1.0, -1.0, 50000);
            tracker.updateSize("BTCUSDT", -1.0, 1.0, 51000);

            const report = tracker.getHealthReport();
            const position = report.positions[0];

            expect(position.spotSize).toBe(0);
            expect(position.perpSize).toBe(0);
            expect(position.spotEntry).toBe(0); // Division by zero handling
            expect(position.perpEntry).toBe(0);
        });

        it("should track multiple symbols independently", () => {
            tracker.updateSize("BTCUSDT", 1.0, -1.0, 50000);
            tracker.updateSize("ETHUSDT", 10.0, -10.0, 2000);

            const report = tracker.getHealthReport();

            expect(report.positions).toHaveLength(2);

            const btc = report.positions.find((p) => p.symbol === "BTCUSDT");
            const eth = report.positions.find((p) => p.symbol === "ETHUSDT");

            expect(btc?.spotSize).toBe(1.0);
            expect(eth?.spotSize).toBe(10.0);
        });
    });

    describe("getHealthReport", () => {
        let tracker: PositionTracker;

        beforeEach(() => {
            tracker = new PositionTracker({
                binance: createMockGateway(),
            });
        });

        it("should return empty report when no positions", () => {
            const report = tracker.getHealthReport();

            expect(report.nav).toBe(0);
            expect(report.delta).toBe(0);
            expect(report.marginUtilization).toBe(0);
            expect(report.riskStatus).toBe("HEALTHY");
            expect(report.positions).toHaveLength(0);
            expect(report.alerts).toHaveLength(0);
        });

        it("should sum unrealized PnL for NAV", async () => {
            // Create positions with known PnL values
            tracker.updateSize("BTCUSDT", 1.0, 0, 50000);
            await tracker.updatePosition("BTCUSDT"); // This calculates unrealized PnL

            const report = tracker.getHealthReport();

            expect(report.nav).toBeDefined();
            expect(typeof report.nav).toBe("number");
        });

        it("should calculate delta from position exposure", () => {
            tracker.updateSize("BTCUSDT", 2.0, -1.0, 50000);

            const report = tracker.getHealthReport();

            // Delta = (spotSize + perpSize) * spotEntry = (2 - 1) * 50000 = 50000
            expect(report.delta).toBe(50000);
        });

        it("should sum delta across multiple positions", () => {
            tracker.updateSize("BTCUSDT", 1.0, -1.0, 50000); // delta = 0
            tracker.updateSize("ETHUSDT", 5.0, -3.0, 2000); // delta = 2 * 2000 = 4000

            const report = tracker.getHealthReport();

            expect(report.delta).toBe(4000);
        });

        it("should handle perfectly hedged positions", () => {
            tracker.updateSize("BTCUSDT", 1.0, -1.0, 50000);

            const report = tracker.getHealthReport();

            expect(report.delta).toBe(0);
        });

        it("should return all positions in report", () => {
            tracker.updateSize("BTCUSDT", 1.0, -1.0, 50000);
            tracker.updateSize("ETHUSDT", 10.0, -10.0, 2000);
            tracker.updateSize("SOLUSDT", 100.0, -100.0, 100);

            const report = tracker.getHealthReport();

            expect(report.positions).toHaveLength(3);
        });
    });
});
