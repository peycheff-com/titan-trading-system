import { PerformanceTracker } from "../../src/performance/PerformanceTracker";
import { Trade } from "../../src/types/portfolio";

describe("PerformanceTracker", () => {
    let tracker: PerformanceTracker;

    beforeEach(() => {
        tracker = new PerformanceTracker(10000); // $10k initial
    });

    describe("Basics", () => {
        it("should initialize with starting equity", () => {
            const metrics = tracker.getMetrics();
            expect(metrics.totalTrades).toBe(0);
            expect(metrics.maxDrawdown).toBe(0);
        });

        it("should track open positions correctly", () => {
            const trade: Trade = {
                id: "1",
                symbol: "BTC/USD",
                type: "BASIS_SCALP",
                entryTime: Date.now(),
                exitTime: 0,
                entryPrice: 50000,
                entryBasis: 100, // $100 spread
                exitBasis: 0,
                size: 1, // 1 BTC
                realizedPnL: 0,
                fees: 5, // $5 entry fee
            };

            tracker.recordTrade(trade);
            const open = tracker.getOpenPositions();
            expect(open.length).toBe(1);
            expect(open[0].id).toBe("1");
        });
    });

    describe("PnL and Metrics", () => {
        it("should calculate Basis Scalp profit correctly", () => {
            // Entry: Basis 100.
            // Exit: Basis 20.
            // Profit: (100 - 20) * 1 = 80.
            const trade: Trade = {
                id: "basis-1",
                symbol: "BTC/USD",
                type: "BASIS_SCALP",
                entryTime: Date.now(),
                exitTime: 0,
                entryPrice: 50000,
                entryBasis: 100,
                exitBasis: 0,
                size: 1,
                realizedPnL: 0,
                fees: 5,
            };

            tracker.recordTrade(trade);

            // Close Trade
            // Exit fees: 50000 * 0.0005 = 25
            // Gross PnL: 80
            // Net PnL: 80 - 5 (entry) - 25 (exit) = 50
            tracker.closeTrade("basis-1", 50000, Date.now() + 1000, 20);

            const metrics = tracker.getMetrics();
            expect(metrics.totalTrades).toBe(1);
            expect(metrics.basisScalpingPnL24h).toBe(80 - 5 - 25); // 50
            expect(metrics.totalYield24h).toBe(50);
        });

        it("should update max drawdown", () => {
            // Losing trade
            const trade: Trade = {
                id: "loss-1",
                symbol: "ETH/USD",
                type: "BASIS_SCALP",
                entryTime: Date.now(),
                exitTime: 0,
                entryPrice: 3000,
                entryBasis: 10,
                exitBasis: 0,
                size: 10, // 10 ETH
                realizedPnL: 0,
                fees: 10,
            };

            tracker.recordTrade(trade);

            // Basis expands to 20 (Loss of 10 per unit)
            // Loss: (10 - 20) * 10 = -100
            // Fees: 10 (entry) + 15 (exit roughly)
            tracker.closeTrade("loss-1", 3000, Date.now() + 1000, 20);

            const metrics = tracker.getMetrics();
            expect(metrics.maxDrawdown).toBeGreaterThan(0);
        });

        it("should calculate Sharpe Ratio", () => {
            const trade1: Trade = {
                id: "win-1",
                symbol: "A",
                type: "BASIS_SCALP",
                entryTime: 1,
                exitTime: 0,
                entryPrice: 100,
                entryBasis: 10,
                exitBasis: 0,
                size: 1,
                realizedPnL: 0,
                fees: 0,
            };
            const trade2: Trade = {
                id: "win-2",
                symbol: "B",
                type: "BASIS_SCALP",
                entryTime: 1,
                exitTime: 0,
                entryPrice: 100,
                entryBasis: 10,
                exitBasis: 0,
                size: 1,
                realizedPnL: 0,
                fees: 0,
            };

            tracker.recordTrade(trade1);
            tracker.closeTrade("win-1", 100, 2, 0); // Profit 10

            tracker.recordTrade(trade2);
            tracker.closeTrade("win-2", 100, 2, 0); // Profit 10

            const metrics = tracker.getMetrics();
            // Variance should be 0, so stdDev 0, Sharpe 0
            expect(metrics.sharpeRatio).toBe(0);
        });
    });
});
