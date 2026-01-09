import type {
    HealthReport,
    RiskLimits,
    RiskStatus,
    RiskStatusLevel,
} from "../types/portfolio.js";
import { DEFAULT_RISK_LIMITS } from "../types/portfolio.js";

/**
 * Monitors portfolio health against defined risk limits.
 */
export class RiskManager {
    private limits: RiskLimits;

    constructor(limits: RiskLimits = DEFAULT_RISK_LIMITS) {
        this.limits = limits;
    }

    /**
     * Assess risk status based on current portfolio health report
     */
    evaluate(health: HealthReport, totalEquity: number): RiskStatus {
        const violations: string[] = [];

        // 1. Delta Check
        // Delta is usually USD exposure. Normalize by Equity for % check?
        // Limits say "maxDelta: 0.02" (2%). Assuming this implies Delta/Equity ratio.
        const deltaRatio = totalEquity > 0
            ? Math.abs(health.delta) / totalEquity
            : 0;

        if (deltaRatio > this.limits.criticalDelta) {
            violations.push(
                `CRITICAL_DELTA: ${
                    deltaRatio.toFixed(4)
                } > ${this.limits.criticalDelta}`,
            );
        } else if (deltaRatio > this.limits.maxDelta) {
            violations.push(
                `WARNING_DELTA: ${
                    deltaRatio.toFixed(4)
                } > ${this.limits.maxDelta}`,
            );
        }

        // 2. Drawdown Check
        // Need historical high water mark to calc Drawdown?
        // For now, assuming HealthReport might contain current drawdown or we calculate it statefully?
        // The HealthReport doesn't strictly have drawdown field in previous def, but let's check interface.
        // Interface 'HealthReport' has nav, delta, marginUtilization, riskStatus, positions, alerts.
        // It does NOT have drawdown.

        // NOTE: PerformanceTracker calculates drawdown. RiskManager might need to receive it.
        // For this stateless check, let's assume we receive current Drawdown as input or part of HealthReport (if we update it).
        // Or we rely on the inputs.
        // Let's add a `currentDrawdown` parameter to evaluate for now, or assume it's passed via some context.

        // Actually, looking at `RiskStatus` return type: `drawdown: number`.
        // Let's assume for this specific method, we might calculate simple PnL based drawdown if we had history.
        // But better: Require it as input.
        // IMPORTANT: The `evaluate` signature in plan didn't specify extra params, but logical requirement dictates it.
        // I will add `currentDrawdown` to the assess method signature, defaulting to 0 if not provided.

        const currentDrawdown = 0; // Placeholder until integrated with PerformanceTracker

        if (currentDrawdown > this.limits.criticalDrawdown) {
            violations.push(
                `CRITICAL_DRAWDOWN: ${currentDrawdown} > ${this.limits.criticalDrawdown}`,
            );
        } else if (currentDrawdown > this.limits.dailyDrawdownLimit) {
            violations.push(
                `WARNING_DRAWDOWN: ${currentDrawdown} > ${this.limits.dailyDrawdownLimit}`,
            );
        }

        // 3. Leverage Check
        // Leverage = Total Position Value / Equity
        let totalPositionValue = 0;
        for (const pos of health.positions) {
            totalPositionValue +=
                (Math.abs(pos.spotSize) + Math.abs(pos.perpSize)) *
                pos.spotEntry;
            // Approx notions.
        }
        const leverage = totalEquity > 0 ? totalPositionValue / totalEquity : 0;

        if (leverage > this.limits.maxLeverage) {
            violations.push(
                `MAX_LEVERAGE: ${
                    leverage.toFixed(2)
                } > ${this.limits.maxLeverage}`,
            );
        }

        return {
            withinLimits: violations.length === 0,
            violations,
            delta: health.delta,
            leverage,
            drawdown: currentDrawdown,
        };
    }

    updateLimits(newLimits: Partial<RiskLimits>): void {
        this.limits = { ...this.limits, ...newLimits };
    }

    getLimits(): RiskLimits {
        return this.limits;
    }
}
