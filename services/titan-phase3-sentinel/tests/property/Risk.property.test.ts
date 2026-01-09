import fc from "fast-check";
import { RiskManager } from "../../src/risk/RiskManager";
import {
    DEFAULT_RISK_LIMITS,
    type HealthReport,
} from "../../src/types/portfolio";

describe("Risk Manager Property Tests", () => {
    // Test Delta Thresholds
    it("should correctly identify delta violations", () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 0.1, noNaN: true }), // Delta Ratio
                fc.double({ min: 1000, max: 100000, noNaN: true }), // Equity
                (ratio, equity) => {
                    const manager = new RiskManager(DEFAULT_RISK_LIMITS);

                    // Construct health report
                    // Delta = ratio * equity
                    const delta = ratio * equity;

                    const health: HealthReport = {
                        nav: equity,
                        delta: delta,
                        marginUtilization: 0.1,
                        riskStatus: "HEALTHY",
                        positions: [],
                        alerts: [],
                    };

                    const status = manager.evaluate(health, equity);

                    if (Math.abs(ratio) > DEFAULT_RISK_LIMITS.criticalDelta) {
                        // If extremely close, float precision might allow pass?
                        // Checking string inclusion is robust enough for logic check
                        const isCritical = status.violations.some((v) =>
                            v.includes("CRITICAL_DELTA")
                        );
                        // Account for edge case of exact equality or float precision
                        if (ratio > DEFAULT_RISK_LIMITS.criticalDelta + 1e-9) {
                            expect(isCritical).toBe(true);
                            expect(status.withinLimits).toBe(false);
                        }
                    } else if (Math.abs(ratio) > DEFAULT_RISK_LIMITS.maxDelta) {
                        if (ratio > DEFAULT_RISK_LIMITS.maxDelta + 1e-9) {
                            const isWarning = status.violations.some((v) =>
                                v.includes("WARNING_DELTA")
                            );
                            expect(isWarning).toBe(true);
                            expect(status.withinLimits).toBe(false);
                        }
                    } else {
                        // No delta violation
                        const hasDeltaViolation = status.violations.some((v) =>
                            v.includes("DELTA")
                        );
                        expect(hasDeltaViolation).toBe(false);
                    }
                },
            ),
        );
    });

    // Test Leverage Limits
    it("should correctly identify leverage violations", () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 5, noNaN: true }), // Leverage Ratio
                fc.double({ min: 1000, max: 100000, noNaN: true }), // Equity
                (levRatio, equity) => {
                    const manager = new RiskManager(DEFAULT_RISK_LIMITS);

                    // Construct mock position to hit leverage
                    // Position Value = levRatio * equity
                    const posValue = levRatio * equity;
                    // Assume price = 1, size = posValue

                    const health: HealthReport = {
                        nav: equity,
                        delta: 0, // Hedged for leverage check isolation
                        marginUtilization: 0.1,
                        riskStatus: "HEALTHY",
                        positions: [
                            {
                                symbol: "BTC",
                                spotSize: posValue,
                                perpSize: 0,
                                spotEntry: 1,
                                perpEntry: 1,
                                entryBasis: 0,
                                currentBasis: 0,
                                unrealizedPnL: 0,
                                type: "CORE",
                            },
                        ],
                        alerts: [],
                    };

                    const status = manager.evaluate(health, equity);

                    if (levRatio > DEFAULT_RISK_LIMITS.maxLeverage + 1e-9) {
                        const isLevViolation = status.violations.some((v) =>
                            v.includes("MAX_LEVERAGE")
                        );
                        expect(isLevViolation).toBe(true);
                        expect(status.withinLimits).toBe(false);
                    } else {
                        const isLevViolation = status.violations.some((v) =>
                            v.includes("MAX_LEVERAGE")
                        );
                        expect(isLevViolation).toBe(false);
                    }
                },
            ),
        );
    });
});
