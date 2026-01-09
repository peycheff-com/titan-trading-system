import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ArbitrageMonitor } from "../../src/arbitrage/ArbitrageMonitor";

describe("ArbitrageMonitor Property Tests", () => {
    it("should correctly identify arbitrage opportunities when spread exceeds threshold", () => {
        fc.assert(
            fc.property(
                fc.string(), // Symbol
                fc.array(
                    fc.record({
                        exchange: fc.constantFrom(
                            "binance",
                            "coinbase",
                            "kraken",
                        ),
                        bid: fc.float({ min: 100, max: 200, noNaN: true }),
                        ask: fc.float({ min: 100, max: 200, noNaN: true }),
                    }),
                    { minLength: 2, maxLength: 3 },
                ),
                (symbol, exchangeData) => {
                    // Ensure valid bid/ask spread per exchange (ask >= bid)
                    const validData = exchangeData.map((d) => ({
                        ...d,
                        symbol,
                        timestamp: new Date(),
                        ask: Math.max(d.ask, d.bid + 0.1),
                    }));
                    // Ensure unique exchanges
                    const distinctData = [
                        { ...validData[0], exchange: "binance" },
                        validData[1]
                            ? { ...validData[1], exchange: "coinbase" }
                            : null,
                        validData[2]
                            ? { ...validData[2], exchange: "kraken" }
                            : null,
                    ].filter((x): x is typeof validData[0] => x !== null);

                    const monitor = new ArbitrageMonitor({
                        minSpreadPercentage: 0.5,
                        minLiquidity: 1000,
                        persistenceMs: 0,
                    });

                    let opportunities: any[] = [];
                    distinctData.forEach((d) => {
                        opportunities = monitor.updatePrice(d);
                    });

                    // Check results
                    opportunities.forEach((opp) => {
                        expect(opp.symbol).toBe(symbol);
                        // Profit condition: Bid_B > Ask_A
                        expect(opp.sellPrice).toBeGreaterThan(opp.buyPrice);
                        expect(opp.spreadPercentage).toBeGreaterThanOrEqual(
                            0.5,
                        );
                    });
                },
            ),
        );
    });

    it("should correctly calculate raw spreads between exchanges", () => {
        fc.assert(
            fc.property(
                fc.string(),
                fc.float({ min: 100, max: 200, noNaN: true }), // Price A
                fc.float({ min: 100, max: 200, noNaN: true }), // Price B
                (symbol, priceA, priceB) => {
                    const monitor = new ArbitrageMonitor({
                        minSpreadPercentage: 0.1,
                        minLiquidity: 0,
                        persistenceMs: 0,
                    });

                    monitor.updatePrice({
                        symbol,
                        exchange: "binance",
                        bid: priceA - 0.1,
                        ask: priceA + 0.1,
                        timestamp: new Date(),
                    });
                    monitor.updatePrice({
                        symbol,
                        exchange: "coinbase",
                        bid: priceB - 0.1,
                        ask: priceB + 0.1,
                        timestamp: new Date(),
                    });

                    const spreads = monitor.getSpreads(symbol);
                    if (spreads.length > 0) {
                        const spread = spreads[0];
                        // Mid price spread
                        const expectedSpread = priceA - priceB;
                        expect(spread.spread).toBeCloseTo(expectedSpread, 1);
                    }
                },
            ),
        );
    });
});
