/* Jest globals: describe, it, expect, beforeEach */
import { RiskManager } from "../../src/risk/RiskManager.js";
import type {
    HealthReport,
    Position,
    RiskLimits,
} from "../../src/types/portfolio.js";

describe("RiskManager", () => {
    const createPosition = (overrides: Partial<Position> = {}): Position => ({
        symbol: "BTC-USDT",
        spotSize: 1.0,
        perpSize: -1.0,
        spotEntry: 50000,
        perpEntry: 50000,
        entryBasis: 0.001,
        currentBasis: 0.001,
        unrealizedPnL: 0,
        type: "CORE",
        ...overrides,
    });

    const createHealthReport = (
        overrides: Partial<HealthReport> = {},
    ): HealthReport => ({
        nav: 100000,
        delta: 0,
        marginUtilization: 0.2,
        riskStatus: "HEALTHY",
        positions: [],
        alerts: [],
        ...overrides,
    });

    describe("constructor", () => {
        it("should use default limits when none provided", () => {
            const manager = new RiskManager();
            const limits = manager.getLimits();

            expect(limits.maxDelta).toBe(0.02);
            expect(limits.criticalDelta).toBe(0.05);
            expect(limits.maxLeverage).toBe(3);
        });

        it("should use custom limits when provided", () => {
            const customLimits: RiskLimits = {
                maxDelta: 0.03,
                criticalDelta: 0.08,
                maxPositionSize: 100000,
                maxLeverage: 5,
                stopLossThreshold: 0.15,
                dailyDrawdownLimit: 0.1,
                criticalDrawdown: 0.2,
            };

            const manager = new RiskManager(customLimits);
            expect(manager.getLimits()).toEqual(customLimits);
        });
    });

    describe("evaluate", () => {
        let manager: RiskManager;

        beforeEach(() => {
            manager = new RiskManager({
                maxDelta: 0.02,
                criticalDelta: 0.05,
                maxPositionSize: 50000,
                maxLeverage: 3,
                stopLossThreshold: 0.1,
                dailyDrawdownLimit: 0.05,
                criticalDrawdown: 0.1,
            });
        });

        describe("delta checks", () => {
            it("should pass when delta is within limits", () => {
                const health = createHealthReport({
                    delta: 1000, // 1% of 100k equity
                    positions: [],
                });

                const result = manager.evaluate(health, 100000);

                expect(result.withinLimits).toBe(true);
                expect(result.violations).toHaveLength(0);
            });

            it("should warn when delta exceeds maxDelta", () => {
                const health = createHealthReport({
                    delta: 3000, // 3% of 100k > 2% maxDelta
                });

                const result = manager.evaluate(health, 100000);

                expect(result.withinLimits).toBe(false);
                expect(result.violations).toHaveLength(1);
                expect(result.violations[0]).toContain("WARNING_DELTA");
            });

            it("should flag critical when delta exceeds criticalDelta", () => {
                const health = createHealthReport({
                    delta: 6000, // 6% of 100k > 5% criticalDelta
                });

                const result = manager.evaluate(health, 100000);

                expect(result.withinLimits).toBe(false);
                expect(result.violations).toHaveLength(1);
                expect(result.violations[0]).toContain("CRITICAL_DELTA");
            });

            it("should handle zero equity gracefully", () => {
                const health = createHealthReport({ delta: 1000 });

                const result = manager.evaluate(health, 0);

                expect(result.withinLimits).toBe(true);
                expect(result.delta).toBe(1000);
            });

            it("should handle negative delta (absolute value)", () => {
                const health = createHealthReport({
                    delta: -3500, // |3.5%| > 2% maxDelta
                });

                const result = manager.evaluate(health, 100000);

                expect(result.withinLimits).toBe(false);
                expect(result.violations[0]).toContain("WARNING_DELTA");
            });
        });

        describe("drawdown checks", () => {
            it("should pass when no drawdown", () => {
                const health = createHealthReport();

                const result = manager.evaluate(health, 100000, 0);

                expect(result.withinLimits).toBe(true);
                expect(result.drawdown).toBe(0);
            });

            it("should warn when drawdown exceeds daily limit", () => {
                const health = createHealthReport();

                const result = manager.evaluate(health, 100000, 0.07); // 7% > 5% daily

                expect(result.withinLimits).toBe(false);
                expect(result.violations).toHaveLength(1);
                expect(result.violations[0]).toContain("WARNING_DRAWDOWN");
            });

            it("should flag critical when drawdown exceeds critical threshold", () => {
                const health = createHealthReport();

                const result = manager.evaluate(health, 100000, 0.15); // 15% > 10% critical

                expect(result.withinLimits).toBe(false);
                expect(result.violations).toHaveLength(1);
                expect(result.violations[0]).toContain("CRITICAL_DRAWDOWN");
            });
        });

        describe("leverage checks", () => {
            it("should pass when leverage is within limits", () => {
                const position = createPosition({
                    spotSize: 1,
                    perpSize: -1,
                    spotEntry: 50000, // $100k position value
                });
                const health = createHealthReport({
                    positions: [position],
                });

                // $100k position / $50k equity = 2x leverage < 3x limit
                const result = manager.evaluate(health, 50000);

                expect(result.withinLimits).toBe(true);
                expect(result.leverage).toBe(2);
            });

            it("should fail when leverage exceeds limit", () => {
                const position = createPosition({
                    spotSize: 2,
                    perpSize: -2,
                    spotEntry: 50000, // $200k position value
                });
                const health = createHealthReport({
                    positions: [position],
                });

                // $200k position / $50k equity = 4x leverage > 3x limit
                const result = manager.evaluate(health, 50000);

                expect(result.withinLimits).toBe(false);
                expect(result.violations).toHaveLength(1);
                expect(result.violations[0]).toContain("MAX_LEVERAGE");
            });

            it("should apply volatility factor when high volatility", () => {
                const position = createPosition({
                    spotSize: 1.5,
                    perpSize: -1.5,
                    spotEntry: 50000, // $150k position value
                });
                const health = createHealthReport({
                    positions: [position],
                });

                // $150k / $50k = 3x leverage
                // With 90% volatility, effective limit = 3 * 0.5 = 1.5x
                const result = manager.evaluate(health, 50000, 0, 90, 100);

                expect(result.withinLimits).toBe(false);
                expect(result.violations[0]).toContain("V:0.5");
            });

            it("should apply liquidity factor when low liquidity", () => {
                const position = createPosition({
                    spotSize: 1.5,
                    perpSize: -1.5,
                    spotEntry: 50000,
                });
                const health = createHealthReport({
                    positions: [position],
                });

                // With 10% liquidity score, effective limit = 3 * 0.5 = 1.5x
                const result = manager.evaluate(health, 50000, 0, 0, 10);

                expect(result.withinLimits).toBe(false);
                expect(result.violations[0]).toContain("L:0.5");
            });

            it("should apply both factors when high vol and low liquidity", () => {
                const position = createPosition({
                    spotSize: 1.0,
                    perpSize: -1.0,
                    spotEntry: 50000,
                });
                const health = createHealthReport({
                    positions: [position],
                });

                // $100k / $50k = 2x leverage
                // Effective limit = 3 * 0.5 * 0.5 = 0.75x
                const result = manager.evaluate(health, 50000, 0, 85, 15);

                expect(result.withinLimits).toBe(false);
                expect(result.violations[0]).toContain("V:0.5");
                expect(result.violations[0]).toContain("L:0.5");
            });
        });

        describe("multiple violations", () => {
            it("should report all violations together", () => {
                const position = createPosition({
                    spotSize: 3,
                    perpSize: -3,
                    spotEntry: 50000,
                });
                const health = createHealthReport({
                    delta: 10000,
                    positions: [position],
                });

                const result = manager.evaluate(health, 50000, 0.15);

                expect(result.withinLimits).toBe(false);
                expect(result.violations.length).toBeGreaterThanOrEqual(3);
                expect(result.violations.some((v) => v.includes("DELTA"))).toBe(
                    true,
                );
                expect(result.violations.some((v) => v.includes("DRAWDOWN")))
                    .toBe(true);
                expect(result.violations.some((v) => v.includes("LEVERAGE")))
                    .toBe(true);
            });
        });

        describe("result properties", () => {
            it("should include delta in result", () => {
                const health = createHealthReport({ delta: 5000 });

                const result = manager.evaluate(health, 100000);

                expect(result.delta).toBe(5000);
            });

            it("should calculate leverage correctly", () => {
                const position = createPosition({
                    spotSize: 1,
                    perpSize: -1,
                    spotEntry: 40000,
                });
                const health = createHealthReport({
                    positions: [position],
                });

                const result = manager.evaluate(health, 40000);

                expect(result.leverage).toBe(2); // $80k / $40k
            });

            it("should pass through drawdown value", () => {
                const health = createHealthReport();

                const result = manager.evaluate(health, 100000, 0.03);

                expect(result.drawdown).toBe(0.03);
            });
        });
    });

    describe("updateLimits", () => {
        it("should update partial limits", () => {
            const manager = new RiskManager();

            manager.updateLimits({ maxDelta: 0.05 });

            const limits = manager.getLimits();
            expect(limits.maxDelta).toBe(0.05);
            expect(limits.maxLeverage).toBe(3); // unchanged
        });

        it("should update multiple limits at once", () => {
            const manager = new RiskManager();

            manager.updateLimits({
                maxDelta: 0.05,
                criticalDelta: 0.1,
                maxLeverage: 5,
            });

            const limits = manager.getLimits();
            expect(limits.maxDelta).toBe(0.05);
            expect(limits.criticalDelta).toBe(0.1);
            expect(limits.maxLeverage).toBe(5);
        });
    });

    describe("getLimits", () => {
        it("should return current limits", () => {
            const customLimits: RiskLimits = {
                maxDelta: 0.01,
                criticalDelta: 0.03,
                maxPositionSize: 25000,
                maxLeverage: 2,
                stopLossThreshold: 0.05,
                dailyDrawdownLimit: 0.02,
                criticalDrawdown: 0.05,
            };

            const manager = new RiskManager(customLimits);

            expect(manager.getLimits()).toEqual(customLimits);
        });
    });
});
