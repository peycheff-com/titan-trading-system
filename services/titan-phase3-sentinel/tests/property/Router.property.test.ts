import fc from "fast-check";
import { PriceMonitor } from "../../src/router/PriceMonitor";
import { CostCalculator } from "../../src/router/CostCalculator";
import { ExchangeRouter } from "../../src/router/ExchangeRouter";
import type { IExchangeGateway } from "../../src/exchanges/interfaces";
import type { Order, OrderResult } from "../../src/types/orders";

class MockGateway implements IExchangeGateway {
    private price: number;
    constructor(price: number) {
        this.price = price;
    }
    async getTicker(
        symbol: string,
    ): Promise<{ price: number; bid: number; ask: number }> {
        return { price: this.price, bid: this.price, ask: this.price };
    }
    get name(): string {
        return "Mock";
    }
    async getPrice(symbol: string): Promise<number> {
        return this.price;
    }
    async getBalance(asset: string): Promise<number> {
        return 1000;
    }
    async initialize(): Promise<void> {}
    async executeOrder(order: Order): Promise<OrderResult> {
        return {
            orderId: "mock",
            status: "FILLED",
            filledSize: order.size,
            avgPrice: this.price,
            fees: 0,
            timestamp: Date.now(),
        };
    }
}

describe("Router Property Tests", () => {
    describe("CostCalculator", () => {
        it("should correctly calculate total cost/proceeds", () => {
            fc.assert(
                fc.property(
                    fc.double({ min: 0.0001, max: 0.01, noNaN: true }),
                    fc.double({ min: 1, max: 10000, noNaN: true }),
                    fc.double({ min: 0.1, max: 100, noNaN: true }),
                    fc.boolean(),
                    (feeRate, price, size, isBuy) => {
                        const calculator = new CostCalculator({
                            "test": feeRate,
                        });
                        const cost = calculator.calculateCost(
                            "test",
                            isBuy ? "BUY" : "SELL",
                            price,
                            size,
                        );

                        const notional = price * size;
                        const expectedFee = notional * feeRate;

                        expect(cost.feeAmount).toBeCloseTo(expectedFee, 8);

                        if (isBuy) {
                            expect(cost.totalCost).toBeCloseTo(
                                notional + expectedFee,
                                8,
                            );
                        } else {
                            expect(cost.totalCost).toBeCloseTo(
                                notional - expectedFee,
                                8,
                            );
                        }
                    },
                ),
            );
        });
    });

    describe("ExchangeRouter Optimal Routing", () => {
        it("should always choose the exchange with best net result", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.record({
                        A: fc.record({
                            price: fc.double({
                                min: 100,
                                max: 200,
                                noNaN: true,
                            }),
                            fee: fc.double({ min: 0, max: 0.01, noNaN: true }),
                        }),
                        B: fc.record({
                            price: fc.double({
                                min: 100,
                                max: 200,
                                noNaN: true,
                            }),
                            fee: fc.double({ min: 0, max: 0.01, noNaN: true }),
                        }),
                    }),
                    fc.boolean(), // isBuy
                    async (marketData, isBuy) => {
                        const gateways: Record<string, IExchangeGateway> = {
                            A: new MockGateway(marketData.A.price),
                            B: new MockGateway(marketData.B.price),
                        };
                        const fees = {
                            A: marketData.A.fee,
                            B: marketData.B.fee,
                        };

                        const router = new ExchangeRouter(gateways, fees);
                        const order: Order = {
                            symbol: "BTC",
                            side: isBuy ? "BUY" : "SELL",
                            type: "MARKET",
                            size: 1,
                        };

                        const decision = await router.findBestRoute(order);
                        expect(decision).not.toBeNull();

                        // Calculate Expected Nets
                        const calcNet = (ex: "A" | "B") => {
                            const notional = marketData[ex].price * 1;
                            const fee = notional * marketData[ex].fee;
                            return isBuy ? notional + fee : notional - fee;
                        };

                        const netA = calcNet("A");
                        const netB = calcNet("B");

                        if (isBuy) {
                            // Should minimize cost
                            if (netA < netB) {
                                expect(decision!.targetExchange).toBe("A");
                            } else if (netB < netA) {
                                expect(decision!.targetExchange).toBe("B");
                            }
                        } else {
                            // Should maximize proceeds
                            if (netA > netB) {
                                expect(decision!.targetExchange).toBe("A");
                            } else if (netB > netA) {
                                expect(decision!.targetExchange).toBe("B");
                            }
                        }
                    },
                ),
            );
        });
    });
});
