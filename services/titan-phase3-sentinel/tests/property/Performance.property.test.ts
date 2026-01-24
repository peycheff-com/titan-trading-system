import fc from "fast-check";
import { PerformanceTracker } from "../../src/performance/PerformanceTracker";
import type { Trade } from "../../src/types/portfolio";

describe("Performance Tracker Property Tests", () => {
    it("should correctly calculate total yield and win rate", () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.record({
                        realizedPnL: fc.double({
                            min: -100,
                            max: 100,
                            noNaN: true,
                        }),
                        fees: fc.double({ min: 0, max: 10, noNaN: true }),
                    }),
                    { minLength: 1, maxLength: 100 },
                ),
                (tradesData) => {
                    const tracker = new PerformanceTracker(10000);

                    let expectedYield = 0;
                    let wins = 0;

                    tradesData.forEach((t, i) => {
                        const trade: Trade = {
                            id: `t-${i}`,
                            symbol: "BTC",
                            type: "BASIS_SCALP",
                            entryTime: 100,
                            exitTime: 0, // Open initially
                            entryPrice: 50000,
                            entryBasis: 0,
                            exitBasis: 0,
                            size: 1,
                            realizedPnL: 0, // Initially 0
                            fees: t.fees,
                        };

                        tracker.recordTrade(trade);

                        // Close trade to realize PnL
                        // Formula: (entryBasis - exitBasis) * size = PnL
                        // (0 - exitBasis) * 1 = PnL => exitBasis = -PnL
                        tracker.closeTrade(
                            trade.id,
                            0, // exitPrice 0 to minimize fee impact/complexity
                            Date.now(),
                            -(t.realizedPnL), // This ensures grossPnL equals t.realizedPnL
                        );

                        // Manually correct fees if needed, but closeTrade adds exit fees (0 here since price 0)
                        // And recordTrade deducted trade.fees (t.fees).
                        // So net result: Equity -= t.fees; Equity += t.realizedPnL - 0.
                        // expectedYield = t.realizedPnL - t.fees. match.

                        expectedYield += t.realizedPnL - t.fees;
                        if ((t.realizedPnL - t.fees) > 0) wins++;
                    });

                    const metrics = tracker.getMetrics();

                    expect(Math.abs(metrics.totalYield24h - expectedYield))
                        .toBeLessThan(1e-6);
                    expect(
                        Math.abs(metrics.winRate - (wins / tradesData.length)),
                    ).toBeLessThan(1e-6);
                    expect(metrics.totalTrades).toBe(tradesData.length);
                },
            ),
        );
    });

    it("should correctly calculate max drawdown", () => {
        fc.assert(
            fc.property(
                fc.array(fc.double({ min: -100, max: 100, noNaN: true }), {
                    minLength: 10,
                    maxLength: 50,
                }), // PnL sequence
                (pnls) => {
                    const initialCap = 10000;
                    const tracker = new PerformanceTracker(initialCap);

                    let equity = initialCap;
                    let hwm = initialCap;
                    let expectedMaxDD = 0;

                    pnls.forEach((pnl, i) => {
                        const trade: Trade = {
                            id: `t-${i}`,
                            symbol: "BTC",
                            type: "BASIS_SCALP",
                            entryTime: 0,
                            exitTime: 0,
                            entryPrice: 50000,
                            entryBasis: 0,
                            exitBasis: 0,
                            size: 1,
                            realizedPnL: 0,
                            fees: 0,
                        };
                        tracker.recordTrade(trade);
                        tracker.closeTrade(
                            trade.id,
                            0,
                            100,
                            -pnl,
                        );

                        equity += pnl;
                        if (equity > hwm) hwm = equity;
                        const dd = (hwm - equity) / hwm;
                        if (dd > expectedMaxDD) expectedMaxDD = dd;
                    });

                    const metrics = tracker.getMetrics();
                    expect(Math.abs(metrics.maxDrawdown - expectedMaxDD))
                        .toBeLessThan(1e-5);
                },
            ),
        );
    });

    it("should generate valid JSON reports", () => {
        const tracker = new PerformanceTracker(10000);
        // Add dummy trade
        tracker.recordTrade({
            id: "test",
            symbol: "BTC",
            type: "BASIS_SCALP",
            entryTime: 100,
            exitTime: 200,
            entryPrice: 50000,
            entryBasis: 0,
            exitBasis: 0,
            size: 1,
            realizedPnL: 50,
            fees: 1,
        });

        const json = tracker.generateReportJSON();
        const parsed = JSON.parse(json);

        expect(parsed).toHaveProperty("timestamp");
        expect(parsed).toHaveProperty("metrics");
        expect(parsed.metrics).toHaveProperty("totalYield24h");
        // 50 - 1 = 49
        expect(parsed.metrics.totalYield24h).toBe(49);
        expect(parsed.trades).toHaveLength(1);
    });
});
