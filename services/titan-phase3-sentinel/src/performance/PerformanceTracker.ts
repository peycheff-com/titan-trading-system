import type { PerformanceMetrics, Trade } from "../types/portfolio.js";
import { RollingStatistics } from "../engine/StatEngine.js"; // Re-use for Sharpe? Or simple calc.

/**
 * Tracks trading performance and calculates metrics.
 */
export class PerformanceTracker {
    private trades: Trade[] = [];
    private initialCapital: number;
    private currentEquity: number;

    // For Drawdown
    private highWaterMark: number;

    // For Sharpe (daily returns)
    private dailyReturns: number[] = [];
    private lastDayTimestamp: number;

    constructor(initialCapital: number) {
        this.initialCapital = initialCapital;
        this.currentEquity = initialCapital;
        this.highWaterMark = initialCapital;
        this.lastDayTimestamp = Date.now();
    }

    recordTrade(trade: Trade): void {
        this.trades.push(trade);

        // Update Equity (Realized)
        this.currentEquity += trade.realizedPnL - trade.fees;

        // Update HWM
        if (this.currentEquity > this.highWaterMark) {
            this.highWaterMark = this.currentEquity;
        }

        // Track daily returns?
        // Simplified: Just push trade return % for Sharpe proxy for now.
        // Sharpe = Mean(Returns) / StdDev(Returns) * Sqrt(N)
        // Return = PnL / Capital
        const returnPct = (trade.realizedPnL - trade.fees) /
            this.initialCapital; // using initial for simple ROI
        this.dailyReturns.push(returnPct);
    }

    getMetrics(): PerformanceMetrics {
        const totalTrades = this.trades.length;
        let winningTrades = 0;
        let totalYield = 0;
        let basisScalpPnL = 0;

        for (const t of this.trades) {
            const netPnL = t.realizedPnL - t.fees;
            if (netPnL > 0) winningTrades++;
            totalYield += netPnL;

            if (t.type === "BASIS_SCALP") {
                basisScalpPnL += netPnL;
            }
        }

        const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;

        // Max Drawdown calculation
        // Note: To do this accurately, we need the equity CURVE.
        // Here we only have current and HWM, which gives *Current* Drawdown.
        // To record true Max Drawdown, we should update maxDD on every trade.
        // Let's iterate trades to reconstruct curve for robustness or store maxDD statefully.
        // Let's calc statefully in recordTrade for efficiency, but here we iterate to be sure if we want.
        // Let's use current state:
        // But wait, HWM is global max. Current DD = (HWM - Current) / HWM.
        // Max Drawdown is the maximum value of this ratio ever seen.

        // Let's re-calculate Max Drawdown by iterating history for property testing correctness
        let tempEquity = this.initialCapital;
        let tempHWM = this.initialCapital;
        let maxDD = 0;

        for (const t of this.trades) {
            tempEquity += t.realizedPnL - t.fees;
            if (tempEquity > tempHWM) tempHWM = tempEquity;
            const dd = (tempHWM - tempEquity) / tempHWM;
            if (dd > maxDD) maxDD = dd;
        }

        // Sharpe Calcs
        // Mean Return
        if (this.dailyReturns.length === 0) {
            return {
                totalDeployed: 0, // dynamic
                avgFundingAPY: 0,
                basisScalpingPnL24h: basisScalpPnL, // Assuming all trades < 24h for now
                totalYield24h: totalYield,
                sharpeRatio: 0,
                maxDrawdown: maxDD,
                winRate,
                totalTrades,
            };
        }

        const meanReturn = this.dailyReturns.reduce((a, b) => a + b, 0) /
            this.dailyReturns.length;
        const variance = this.dailyReturns.reduce(
            (a, b) => a + Math.pow(b - meanReturn, 2),
            0,
        ) / this.dailyReturns.length;
        const stdDev = Math.sqrt(variance);

        // Annualize? Assuming returns are per trade... this is tricky without time.
        // Let's just return raw Sharpe (Mean/StdDev) for "Trade Sharpe"
        const sharpe = stdDev > 0 ? meanReturn / stdDev : 0;

        return {
            totalDeployed: 0, // Placeholder
            avgFundingAPY: 0,
            basisScalpingPnL24h: basisScalpPnL,
            totalYield24h: totalYield,
            sharpeRatio: sharpe,
            maxDrawdown: maxDD,
            winRate,
            totalTrades,
        };
    }

    generateReportJSON(): string {
        const metrics = this.getMetrics();
        const report = {
            timestamp: Date.now(),
            metrics,
            trades: this.trades,
        };
        return JSON.stringify(report, null, 2);
    }
}
