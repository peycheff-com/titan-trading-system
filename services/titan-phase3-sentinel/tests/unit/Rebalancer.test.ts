/* Jest globals: describe, it, expect */
import { Rebalancer } from "../../src/portfolio/Rebalancer.js";
import {
    DEFAULT_MARGIN_THRESHOLDS,
    type MarginThresholds,
} from "../../src/types/portfolio.js";

describe("Rebalancer", () => {
    describe("constructor", () => {
        it("should accept custom thresholds", () => {
            const thresholds: MarginThresholds = {
                tier1Trigger: 0.4,
                tier2Trigger: 0.5,
                compoundTrigger: 0.1,
                criticalLevel: 0.6,
            };

            const rebalancer = new Rebalancer(thresholds);

            expect(rebalancer).toBeDefined();
        });

        it("should work with default thresholds", () => {
            const rebalancer = new Rebalancer(DEFAULT_MARGIN_THRESHOLDS);

            expect(rebalancer).toBeDefined();
        });
    });

    describe("evaluate", () => {
        let rebalancer: Rebalancer;

        beforeEach(() => {
            rebalancer = new Rebalancer({
                tier1Trigger: 0.3,
                tier2Trigger: 0.3,
                compoundTrigger: 0.05,
                criticalLevel: 0.5,
            });
        });

        describe("when margin utilization is healthy", () => {
            it("should return null for low utilization", () => {
                const result = rebalancer.evaluate("BTCUSDT", 0.2, 0, 10000);

                expect(result).toBeNull();
            });

            it("should return null at exactly tier1 threshold", () => {
                const result = rebalancer.evaluate("BTCUSDT", 0.3, 0, 10000);

                expect(result).toBeNull();
            });

            it("should return null for zero utilization", () => {
                const result = rebalancer.evaluate("BTCUSDT", 0, 0, 10000);

                expect(result).toBeNull();
            });
        });

        describe("when margin utilization exceeds tier1", () => {
            it("should return TIER1 action above threshold", () => {
                const result = rebalancer.evaluate("BTCUSDT", 0.35, 0, 10000);

                expect(result).not.toBeNull();
                expect(result?.action).toBe("TIER1");
                expect(result?.symbol).toBe("BTCUSDT");
            });

            it("should specify amount to transfer", () => {
                const result = rebalancer.evaluate("BTCUSDT", 0.4, 0, 10000);

                expect(result?.amountTransferred).toBe(1000); // Placeholder value
            });

            it("should set success to false initially", () => {
                const result = rebalancer.evaluate("BTCUSDT", 0.5, 0, 10000);

                expect(result?.success).toBe(false);
            });

            it("should calculate target margin utilization", () => {
                const result = rebalancer.evaluate("BTCUSDT", 0.45, 0, 10000);

                expect(result?.newMarginUtilization).toBe(0.25);
            });
        });

        describe("edge cases", () => {
            it("should handle utilization at 100%", () => {
                const result = rebalancer.evaluate("BTCUSDT", 1.0, 1000, 10000);

                expect(result).not.toBeNull();
                expect(result?.action).toBe("TIER1");
            });

            it("should handle negative unrealized PnL", () => {
                const result = rebalancer.evaluate(
                    "BTCUSDT",
                    0.25,
                    -500,
                    10000,
                );

                expect(result).toBeNull();
            });

            it("should handle zero collateral", () => {
                const result = rebalancer.evaluate("BTCUSDT", 0.35, 0, 0);

                expect(result).not.toBeNull();
                expect(result?.action).toBe("TIER1");
            });

            it("should work with different symbols", () => {
                const btcResult = rebalancer.evaluate(
                    "BTCUSDT",
                    0.35,
                    0,
                    10000,
                );
                const ethResult = rebalancer.evaluate(
                    "ETHUSDT",
                    0.35,
                    0,
                    10000,
                );

                expect(btcResult?.symbol).toBe("BTCUSDT");
                expect(ethResult?.symbol).toBe("ETHUSDT");
            });
        });

        describe("with different threshold configurations", () => {
            it("should respect custom tier1 trigger", () => {
                const strictRebalancer = new Rebalancer({
                    tier1Trigger: 0.2,
                    tier2Trigger: 0.3,
                    compoundTrigger: 0.05,
                    criticalLevel: 0.5,
                });

                // 25% > 20% should trigger
                const result = strictRebalancer.evaluate(
                    "BTCUSDT",
                    0.25,
                    0,
                    10000,
                );

                expect(result).not.toBeNull();
                expect(result?.action).toBe("TIER1");
            });

            it("should respect lenient tier1 trigger", () => {
                const lenientRebalancer = new Rebalancer({
                    tier1Trigger: 0.5,
                    tier2Trigger: 0.6,
                    compoundTrigger: 0.1,
                    criticalLevel: 0.7,
                });

                // 35% < 50% should not trigger
                const result = lenientRebalancer.evaluate(
                    "BTCUSDT",
                    0.35,
                    0,
                    10000,
                );

                expect(result).toBeNull();
            });
        });
    });
});
