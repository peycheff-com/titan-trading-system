/**
 * TailRiskCalculator - Computes Aggregated Portfolio Tail Risk (APTR)
 *
 * Quantifies the probability of ruinous losses across the portfolio based on
 * the Power Law properties of asset returns (Alpha).
 *
 * Logic:
 * APTR = Sum(Position_Notional * P(|R| > Crash_Size | Alpha))
 *
 * where P(|R| > x) = x^(-Alpha) (Pareto Survival Function)
 */

import { Position } from "../types/index.js";

export class TailRiskCalculator {
    private readonly CRASH_THRESHOLD = 0.20; // 20% drop considered "Crash"
    private DEFAULT_ALPHA = 3.0; // Default to stable if unknown

    /**
     * Calculate Aggregated Portfolio Tail Risk (APTR)
     *
     * @param positions Current open positions
     * @param alphas Map of symbol -> current tail index (alpha)
     * @returns Total Expected Shortfall in USD terms for a 20% crash event adjusted by probability
     */
    calculateAPTR(positions: Position[], alphas: Map<string, number>): number {
        let totalRisk = 0;

        for (const position of positions) {
            const alpha = alphas.get(position.symbol) ?? this.DEFAULT_ALPHA;

            // Probability of a >20% move given Alpha
            // P(X > x) ~ (x / x_min)^(-alpha)
            // Assuming calibrated unit scale or simply relative risk scaling:
            // Risk Weight = (Crash Threshold)^(-Alpha)
            // For Alpha=2 (Wild): 0.2^-2 = 25
            // For Alpha=4 (Stable): 0.2^-4 = 625 (This formula might need normalization or inversion for probability)

            // Let's use the standard Pareto Survival function P(X > x) = x^(-alpha)
            // But x must be > 1 in standard form. For returns < 1, we invert or model differently.
            // Better heuristic: Relative Probability Scaling.
            // Base Probability = 1.0 at Alpha = 3.
            // Multiplier = (Alpha_Base / Alpha_Current) ^ Power?

            // Let's use a simpler heuristic for V1:
            // Tail Risk Exposure = Position Size * (Stability Factor)
            // Stability Factor = 1 / (Alpha - 1) (Mean of Pareto is x_min * (alpha / alpha - 1))
            // Variance is infinite if Alpha < 2.

            let riskMultiplier = 1.0;
            if (alpha <= 1.5) {
                riskMultiplier = 10.0; // Extreme Danger
            } else if (alpha <= 2.0) {
                riskMultiplier = 4.0; // High Risk (Infinite Variance)
            } else if (alpha <= 3.0) {
                riskMultiplier = 1.5; // Moderate
            } else {
                riskMultiplier = 0.5; // Stable
            }

            // Calculate 'Value at Tail' - approximate loss in a crash event weighted by probability multiplier
            const positionNotional = position.size * position.entryPrice; // Approximation if size is qty
            const potentialLoss = positionNotional * this.CRASH_THRESHOLD;

            totalRisk += potentialLoss * riskMultiplier;
        }

        return totalRisk;
    }

    /**
     * Check if APTR usage exceeds safety threshold relative to Equity
     *
     * @param aptr Current Aggregated Portfolio Tail Risk
     * @param equity Current Portfolio Equity
     * @param threshold Max allowed APTR as fraction of Equity (e.g. 0.5 = 50%)
     */
    isRiskCritical(
        aptr: number,
        equity: number,
        threshold: number = 0.5,
    ): boolean {
        if (equity <= 0) return true;
        return (aptr / equity) > threshold;
    }
}
