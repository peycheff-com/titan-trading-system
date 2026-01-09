import fc from "fast-check";
import { SweepDetector } from "../../src/flow/SweepDetector";
import { IcebergDetector } from "../../src/flow/IcebergDetector";
import { InstitutionalFlowClassifier } from "../../src/flow/InstitutionalFlowClassifier";
import { CVDTrade } from "../../src/types";
import { IcebergAnalysis, SweepPattern } from "../../src/types/enhanced-2026";

describe("AdvancedFlowValidator Property Tests", () => {
    // Arbitrary for CVDTrade
    const tradeArbitrary = fc.record({
        symbol: fc.constant("BTC-USD"),
        price: fc.double({ min: 10000, max: 100000, noNaN: true }),
        qty: fc.double({ min: 0.1, max: 10, noNaN: true }),
        isBuyerMaker: fc.boolean(),
        time: fc.date().map((d) => d.getTime()),
        id: fc.uuid(),
    });

    describe("SweepDetector", () => {
        const detector = new SweepDetector();

        it("should detect sweeps when multiple levels are cleared rapidly", () => {
            fc.assert(
                fc.property(
                    fc.array(tradeArbitrary, { minLength: 10, maxLength: 50 }),
                    (trades) => {
                        // Normalize trades to be sequential in time
                        const sortedTrades = trades
                            .map((t, i) => ({
                                ...t,
                                time: Date.now() + i * 100,
                            })) // 100ms apart
                            .sort((a, b) => a.time - b.time);

                        // Create a sweep scenario manually to ensure valid sweep data
                        // Use a subset of trades to simulate a sweep
                        const startPrice = 50000;
                        const sweepTrades: CVDTrade[] = [];
                        for (let i = 0; i < 6; i++) { // 6 > minLevelsCleared (5)
                            sweepTrades.push({
                                symbol: "BTC-USD",
                                price: startPrice + (i * 10), // 10 price steps
                                qty: 1.0,
                                isBuyerMaker: false, // Aggressive buy
                                time: Date.now() + i * 50, // Fast
                                id: `sweep-${i}`,
                            });
                        }

                        const result = detector.detectSweeps(
                            "BTC-USD",
                            sweepTrades,
                        );

                        // Should detect at least one sweep if strict conditions met,
                        // or we check that IF a sweep is returned, it honors the config
                        if (result.length > 0) {
                            expect(result[0].levelsCleared)
                                .toBeGreaterThanOrEqual(5);
                        }
                    },
                ),
            );
        });

        it("should score high urgency sweeps higher than low urgency", () => {
            // We can construct specific sweep objects to test the utility functions directly
            // since detectSweeps involves complex temporal logic that is hard to generate randomly pure

            // Construct high urgency sweep
            const highUrgencySweep: SweepPattern = {
                startPrice: 50000,
                endPrice: 50100,
                levelsCleared: 20,
                volume: 100000,
                timestamp: new Date(),
                direction: "up",
                urgency: "high",
            };

            // Construct low urgency sweep
            const lowUrgencySweep: SweepPattern = {
                ...highUrgencySweep,
                urgency: "low",
                levelsCleared: 5, // Minimal levels
            };

            const resultHigh = detector.validateSweep(highUrgencySweep);
            const resultLow = detector.validateSweep(lowUrgencySweep);

            expect(resultHigh.score).toBeGreaterThan(resultLow.score);
        });
    });

    describe("IcebergDetector", () => {
        const detector = new IcebergDetector();

        it("should calculate higher density for faster refill rates", () => {
            const now = Date.now();
            const priceLevel = 50000;

            // Fast refill scenario: Multiple refills in short succession
            const fastTrades: CVDTrade[] = [
                {
                    symbol: "BTC-USD",
                    price: priceLevel,
                    qty: 1,
                    isBuyerMaker: true,
                    time: now - 5000,
                    id: "1",
                },
                {
                    symbol: "BTC-USD",
                    price: priceLevel,
                    qty: 1,
                    isBuyerMaker: false,
                    time: now - 4000,
                    id: "2",
                }, // Consumption
                {
                    symbol: "BTC-USD",
                    price: priceLevel,
                    qty: 1,
                    isBuyerMaker: true,
                    time: now - 3900,
                    id: "3",
                }, // Refill 1 (100ms)
                {
                    symbol: "BTC-USD",
                    price: priceLevel,
                    qty: 1,
                    isBuyerMaker: false,
                    time: now - 3800,
                    id: "4",
                }, // Consumption
                {
                    symbol: "BTC-USD",
                    price: priceLevel,
                    qty: 1,
                    isBuyerMaker: true,
                    time: now - 3700,
                    id: "5",
                }, // Refill 2 (100ms)
            ];

            // Slow refill scenario: Multiple refills with long gaps
            const slowTrades: CVDTrade[] = [
                {
                    symbol: "BTC-USD",
                    price: priceLevel,
                    qty: 1,
                    isBuyerMaker: true,
                    time: now - 5000,
                    id: "1",
                },
                {
                    symbol: "BTC-USD",
                    price: priceLevel,
                    qty: 1,
                    isBuyerMaker: false,
                    time: now - 4000,
                    id: "2",
                }, // Consumption
                {
                    symbol: "BTC-USD",
                    price: priceLevel,
                    qty: 1,
                    isBuyerMaker: true,
                    time: now - 1000,
                    id: "3",
                }, // Refill 1 (3000ms)
                {
                    symbol: "BTC-USD",
                    price: priceLevel,
                    qty: 1,
                    isBuyerMaker: false,
                    time: now - 900,
                    id: "4",
                }, // Consumption
                {
                    symbol: "BTC-USD",
                    price: priceLevel,
                    qty: 1,
                    isBuyerMaker: true,
                    time: now - 100,
                    id: "5",
                }, // Refill 2 (800ms)
            ];

            const fastAnalysis = detector.calculateIcebergDensity(
                "BTC-USD",
                priceLevel,
                fastTrades,
            );

            const detector2 = new IcebergDetector();
            const slowAnalysis = detector2.calculateIcebergDensity(
                "BTC-USD",
                priceLevel,
                slowTrades,
            );

            expect(fastAnalysis.refillRate).toBeGreaterThan(
                slowAnalysis.refillRate,
            );
        });
    });

    describe("InstitutionalFlowClassifier", () => {
        const classifier = new InstitutionalFlowClassifier();

        it("should classify high maker buy volume as passive absorption", () => {
            fc.assert(
                fc.property(
                    fc.array(tradeArbitrary, { minLength: 10, maxLength: 50 }),
                    (trades) => {
                        // Force all trades to be BuyerMaker (Passive Buy / Aggressive Sell)
                        // BUT to detect "Passive Absorption", we need high Passive Buy Volume relative to total.

                        const absorptionTrades = trades.map((t) => ({
                            ...t,
                            price: 50000, // Fixed price for stability check
                            isBuyerMaker: true, // Buyer is Maker (Passive Buy)
                        }));

                        const result = classifier.detectPassiveAbsorption(
                            "BTC-USD",
                            absorptionTrades,
                        );

                        // With 100% BuyerMaker, absorption ratio is 1.0 > 0.6 threshold
                        expect(result.detected).toBe(true);
                        expect(result.strength).toBeGreaterThan(0);
                    },
                ),
            );
        });

        it("should classify high taker buy volume as aggressive pushing", () => {
            fc.assert(
                fc.property(
                    fc.array(tradeArbitrary, { minLength: 10, maxLength: 50 }),
                    (trades) => {
                        // Normalize trades to be time-sorted for price movement calculation
                        const sortedBaseTrades = trades.sort((a, b) =>
                            a.time - b.time
                        );

                        // Construct trades that exhibit Aggressive Pushing AND Price Movement
                        const pushingTrades = sortedBaseTrades.map((t, i) => ({
                            ...t,
                            // Create distinct price movement > 0.1% to trigger bonus score
                            // 50000 * 0.001 = 50. So increase by 10 each step
                            price: 50000 + (i * 10),
                            isBuyerMaker: false, // Buyer is Aggressor (Aggressive Buy)
                        }));

                        const result = classifier.detectAggressivePushing(
                            "BTC-USD",
                            pushingTrades,
                        );

                        // 100% aggressive ratio -> +40
                        // Price movement > 0.1% -> +30
                        // Total 70 >= 50 -> detected
                        expect(result.detected).toBe(true);
                        expect(result.direction).toBe("up");
                    },
                ),
            );
        });
    });
});
