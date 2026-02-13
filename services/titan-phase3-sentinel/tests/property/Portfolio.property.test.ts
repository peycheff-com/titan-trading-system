import fc from "fast-check";
import { PositionTracker } from "../../src/portfolio/PositionTracker";
import type { IExchangeGateway } from "../../src/exchanges/interfaces";

describe("Portfolio Manager Property Tests", () => {
	    describe("PositionTracker Aggregation", () => {
	        it("should correctly aggregate NAV from individual positions", async () => {
	            await fc.assert(
	                fc.asyncProperty(
                    fc.array(
                        fc.record({
                            spotSize: fc.double({
                                min: 0,
                                max: 10,
                                noNaN: true,
                            }),
                            spotEntry: fc.double({
                                min: 100,
                                max: 100000,
                                noNaN: true,
                            }),
                            perpSize: fc.double({
                                min: -10,
                                max: 0,
                                noNaN: true,
                            }), // Short perp
                            perpEntry: fc.double({
                                min: 100,
                                max: 100000,
                                noNaN: true,
                            }),
                            price: fc.double({
                                min: 100,
                                max: 100000,
                                noNaN: true,
                            }),
                        }),
                        { minLength: 1, maxLength: 5 },
                    ),
	                    async (trades) => {
	                        const gateway: IExchangeGateway = {
	                            name: "binance",
	                            initialize: async () => {},
	                            executeOrder: async () => ({
	                                orderId: "",
	                                status: "PENDING",
	                                filledSize: 0,
	                                avgPrice: 0,
	                                fees: 0,
	                                timestamp: Date.now(),
	                            }),
	                            getPrice: async () => 0,
	                            getTicker: async () => ({ price: 0, bid: 0, ask: 0 }),
	                            getBalance: async () => 0,
	                        };
                        const tracker = new PositionTracker({
	                            "BINANCE": gateway,
	                        });

	                        for (let i = 0; i < trades.length; i++) {
	                            const trade = trades[i];
	                            const symbol = `SYM${i}`;

                            tracker.updateSize(
                                symbol,
                                trade.spotSize,
                                trade.perpSize,
                                trade.price,
                            );
	                        }
	
	                        const report = tracker.getHealthReport();

                        let sumPnL = 0;
                        for (const pos of report.positions) {
                            sumPnL += pos.unrealizedPnL;
                        }

                        expect(Math.abs(report.nav - sumPnL)).toBeLessThan(
                            1e-9,
                        );
                    },
                ),
            );
        });
    });
});
