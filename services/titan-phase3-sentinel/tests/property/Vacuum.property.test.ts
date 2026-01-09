import fc from "fast-check";
import { VacuumMonitor } from "../../src/vacuum/VacuumMonitor";
import { VacuumPositionTracker } from "../../src/vacuum/VacuumPositionTracker";
import { SignalGenerator } from "../../src/engine/StatEngine";

describe("Vacuum Arbitrage Property Tests", () => {
    describe("VacuumMonitor Trigger Logic", () => {
        it("should identify opportunity when high deviation AND recent liquidation exist", async () => {
            await fc.assert(
                fc.asyncProperty(
                    fc.double({ min: 0.1, max: 0.5, noNaN: true }), // large basis deviation
                    fc.integer({ min: 1000, max: 100000 }), // liquidation size
                    fc.boolean(), // isRecent
                    async (basisDev, liqSize, isRecent) => {
                        const signalGen = new SignalGenerator();
                        const monitor = new VacuumMonitor(signalGen);

                        const now = Date.now();
                        const liqTime = isRecent ? now - 1000 : now - 20000;

                        // Inject liquidation
                        monitor.onLiquidation({
                            exchange: "binance",
                            symbol: "BTCUSDT",
                            side: "SELL",
                            size: liqSize,
                            price: 50000,
                            timestamp: liqTime,
                        });

                        // Current Price State
                        const spotPrice = 50000;
                        // If basisDev = 0.1 (10%), implies perp is 10% off.
                        // Vacuum logic checks raw basis.
                        // If SELL liquidation, perp crashes -> Basis negative.
                        const perpPrice = spotPrice * (1 - basisDev);

                        const opp = await monitor.checkForOpportunity(
                            "BTCUSDT",
                            spotPrice,
                            perpPrice,
                        );

                        // Logic:
                        // 1. Min Liq Size = 1000.
                        // 2. Window = 10s.
                        // 3. Basis < -0.005.

                        const isBigEnough = liqSize >= 1000;
                        const isTimeValid = (now - liqTime) < 10000;
                        const isBasisValid = basisDev > 0.005;

                        if (isBigEnough && isTimeValid && isBasisValid) {
                            expect(opp).not.toBeNull();
                            expect(opp?.direction).toBe("LONG");
                            expect(opp?.confidence).toBeGreaterThan(0.6);
                        } else {
                            // If checking only for ANY opportunity:
                            // If basis is extreme but NO liquidation, confidence is low (0.5), so returns null.
                            expect(opp).toBeNull();
                        }
                    },
                ),
            );
        });
    });

    describe("VacuumPositionTracker Lifecycle", () => {
        it("should recommend closing when basis converges to target", () => {
            fc.assert(
                fc.property(
                    fc.double({ min: -0.1, max: -0.01, noNaN: true }), // entry basis (vacuum)
                    fc.double({ min: -0.01, max: 0.01, noNaN: true }), // target basis
                    fc.double({ min: -0.2, max: 0.2, noNaN: true }), // current basis
                    (entryBasis, targetBasis, currentBasis) => {
                        const tracker = new VacuumPositionTracker();
                        const symbol = "BTCUSDT";

                        tracker.addPosition({
                            symbol,
                            entryBasis,
                            spotEntry: 50000,
                            perpEntry: 50000 * (1 + entryBasis),
                            size: 1,
                            entryTime: Date.now(),
                            targetBasis,
                        });

                        const shouldClose = tracker.shouldClose(
                            symbol,
                            currentBasis,
                        );

                        if (entryBasis < 0) {
                            // Long Position: close if current >= target
                            if (currentBasis >= targetBasis) {
                                expect(shouldClose).toBe(true);
                            } else {
                                expect(shouldClose).toBe(false);
                            }
                        } else {
                            // Short Position (positive basis entry): close if current <= target
                            if (currentBasis <= targetBasis) {
                                expect(shouldClose).toBe(true);
                            } else {
                                expect(shouldClose).toBe(false);
                            }
                        }
                    },
                ),
            );
        });
    });
});
