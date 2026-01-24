import { describe, expect, it, jest } from "@jest/globals";
import fc from "fast-check";
import { GlobalCVDAggregator } from "../../src/global-liquidity/GlobalCVDAggregator";
import { ConsensusValidator } from "../../src/global-liquidity/ConsensusValidator";
import { ConnectionStatus, ExchangeFlow, GlobalCVDData } from "../../src/types";

describe("Global Liquidity Aggregator Property Tests", () => {
    describe("GlobalCVDAggregator", () => {
        it("should correctly calculate weighted average CVD", () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            exchange: fc.constantFrom(
                                "binance",
                                "coinbase",
                                "kraken",
                            ),
                            cvd: fc.float({ min: -1000000, max: 1000000 }),
                            volume: fc.float({ min: 0, max: 10000000 }),
                            trades: fc.integer({ min: 1, max: 1000 }),
                            status: fc.constant(ConnectionStatus.CONNECTED),
                        }),
                        { minLength: 3, maxLength: 3 },
                    ),
                    (inputs) => {
                        // Ensure unique exchanges for the test
                        const distinctInputs = [
                            { ...inputs[0], exchange: "binance" as const },
                            { ...inputs[1], exchange: "coinbase" as const },
                            { ...inputs[2], exchange: "kraken" as const },
                        ];

                        const aggregator = new GlobalCVDAggregator({
                            weightingMethod: "volume",
                        });

                        // Inject data via internal map (since processTrade takes granular trades)
                        // verifying the calculation logic directly
                        const totalVolume = distinctInputs.reduce(
                            (sum, i) => sum + i.volume,
                            0,
                        );

                        // Mock the getGlobalCVD logic or use a helper if possible.
                        // Since calculateGlobalCVD relies on internal state built from trades,
                        // we can simulate trades that result in this state, or better:
                        // Test the mathematical property that if we had these flows, the result matches.

                        // Let's use public API: processTrade
                        // We need to feed trades such that they sum up to 'cvd' and 'volume'.
                        // For a simplified property test, we can assume:
                        // trade1: buy, price 1, qty = (volume + cvd)/2
                        // trade2: sell, price 1, qty = (volume - cvd)/2
                        // This math holds: buyVol + sellVol = volume, buyVol - sellVol = cvd.
                        // Constraint: volume >= abs(cvd)

                        distinctInputs.forEach((input) => {
                            // Enforce volume >= abs(cvd) for valid trade construction
                            const safeVolume = Math.max(
                                Math.abs(input.cvd),
                                input.volume,
                            );

                            const buyVol = (safeVolume + input.cvd) / 2;
                            const sellVol = (safeVolume - input.cvd) / 2;

                            if (buyVol > 0) {
                                aggregator.processTrade({
                                    exchange: input.exchange,
                                    symbol: "BTC-USD",
                                    price: 1,
                                    quantity: buyVol,
                                    side: "buy",
                                    tradeId: "test-buy",
                                    timestamp: Date.now(),
                                });
                            }
                            if (sellVol > 0) {
                                aggregator.processTrade({
                                    exchange: input.exchange,
                                    symbol: "BTC-USD",
                                    price: 1,
                                    quantity: sellVol,
                                    side: "sell",
                                    tradeId: "test-sell",
                                    timestamp: Date.now(),
                                });
                            }
                        });

                        const globalCVD = aggregator.calculateGlobalCVD(
                            "BTC-USD",
                        );

                        // Expected calculation
                        let weightedSum = 0;
                        let totalWeight = 0;
                        let actualTotalVolume = 0;

                        globalCVD.exchangeFlows.forEach((flow) => {
                            actualTotalVolume += flow.volume;
                        });

                        globalCVD.exchangeFlows.forEach((flow) => {
                            const weight = actualTotalVolume > 0
                                ? flow.volume / actualTotalVolume
                                : 0;
                            weightedSum += flow.cvd * weight;
                            totalWeight += weight;
                        });

                        // If total volume is 0, result is 0
                        const expectedAgg = totalWeight > 0
                            ? weightedSum / totalWeight
                            : 0;

                        expect(globalCVD.aggregatedCVD).toBeCloseTo(
                            expectedAgg,
                            2,
                        );
                    },
                ),
            );
        });

        it("should detect manipulation when one exchange deviates significantly", () => {
            // Property: if 2 exchanges are close and 1 is far, manipulation detected is true/false depending on threshold
            const aggregator = new GlobalCVDAggregator();

            // Binance/Coinbase neutral/bullish, Kraken huge bearish
            aggregator.processTrade({
                exchange: "binance",
                symbol: "BTC",
                price: 100,
                quantity: 10,
                side: "buy",
                tradeId: "t1",
                timestamp: Date.now(),
            }); // +1000
            aggregator.processTrade({
                exchange: "coinbase",
                symbol: "BTC",
                price: 100,
                quantity: 10,
                side: "buy",
                tradeId: "t2",
                timestamp: Date.now(),
            }); // +1000
            aggregator.processTrade({
                exchange: "kraken",
                symbol: "BTC",
                price: 100,
                quantity: 50,
                side: "sell",
                tradeId: "t3",
                timestamp: Date.now(),
            }); // -5000 (Outlier)

            const result = aggregator.calculateGlobalCVD("BTC");
            expect(result.manipulation.detected).toBe(true);
            expect(result.manipulation.suspectExchange).toBe("kraken");
        });
    });

    describe("ConsensusValidator", () => {
        it("should only reach consensus when agreement ratio meets threshold", () => {
            fc.assert(
                fc.property(
                    fc.array(
                        fc.record({
                            exchange: fc.constantFrom(
                                "binance",
                                "coinbase",
                                "kraken",
                            ),
                            cvd: fc.float({ min: -10000, max: 10000 }),
                            trades: fc.integer({ min: 1, max: 100 }),
                            status: fc.constant(ConnectionStatus.CONNECTED),
                        }),
                        { minLength: 3, maxLength: 3 },
                    ),
                    (inputs) => {
                        // Distinct exchanges
                        const flows: ExchangeFlow[] = [
                            {
                                ...inputs[0],
                                exchange: "binance" as const,
                                volume: 1000,
                                weight: 0.33,
                                timestamp: new Date(),
                            },
                            {
                                ...inputs[1],
                                exchange: "coinbase" as const,
                                volume: 1000,
                                weight: 0.33,
                                timestamp: new Date(),
                            },
                            {
                                ...inputs[2],
                                exchange: "kraken" as const,
                                volume: 1000,
                                weight: 0.33,
                                timestamp: new Date(),
                            },
                        ];

                        const validator = new ConsensusValidator({
                            consensusThreshold: 0.66,
                            cvdDirectionThreshold: 100, // Low threshold for test stability
                        });

                        const result = validator.validateConsensus(flows);

                        // Calculate expected
                        let bullish = 0, bearish = 0, neutral = 0;
                        flows.forEach((f) => {
                            if (f.cvd > 100) bullish++;
                            else if (f.cvd < -100) bearish++;
                            else neutral++;
                        });

                        const maxAgree = Math.max(bullish, bearish, neutral);
                        const ratio = maxAgree / 3;
                        const expectedConsensus = ratio >= 0.66;

                        expect(result.hasConsensus).toBe(expectedConsensus);
                    },
                ),
            );
        });
    });
});
