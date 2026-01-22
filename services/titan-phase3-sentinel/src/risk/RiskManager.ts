import type { HealthReport, RiskLimits, RiskStatus } from '../types/portfolio.js';
import { DEFAULT_RISK_LIMITS } from '../types/portfolio.js';

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
   * @param health Portfolio health report
   * @param totalEquity Current Total Equity
   * @param currentDrawdown Current Drawdown (positive number, e.g. 0.05 for 5%)
   * @param volatility Market Volatility (0-100)
   * @param liquidityScore Market Liquidity Score (0-100)
   */
  evaluate(
    health: HealthReport,
    totalEquity: number,
    currentDrawdown: number = 0,
    volatility: number = 0,
    liquidityScore: number = 100,
  ): RiskStatus {
    // 1. Delta Check
    const deltaRatio = totalEquity > 0 ? Math.abs(health.delta) / totalEquity : 0;

    const deltaViolations = [
      ...(deltaRatio > this.limits.criticalDelta
        ? [`CRITICAL_DELTA: ${deltaRatio.toFixed(4)} > ${this.limits.criticalDelta}`]
        : deltaRatio > this.limits.maxDelta
          ? [`WARNING_DELTA: ${deltaRatio.toFixed(4)} > ${this.limits.maxDelta}`]
          : []),
    ];

    // 2. Drawdown Check
    const drawdownViolations = [
      ...(currentDrawdown > this.limits.criticalDrawdown
        ? [`CRITICAL_DRAWDOWN: ${currentDrawdown} > ${this.limits.criticalDrawdown}`]
        : currentDrawdown > this.limits.dailyDrawdownLimit
          ? [`WARNING_DRAWDOWN: ${currentDrawdown} > ${this.limits.dailyDrawdownLimit}`]
          : []),
    ];

    // 3. Leverage Check with Dynamic Limits
    const totalPositionValue = health.positions.reduce(
      (sum, pos) => sum + (Math.abs(pos.spotSize) + Math.abs(pos.perpSize)) * pos.spotEntry,
      0,
    );

    const leverage = totalEquity > 0 ? totalPositionValue / totalEquity : 0;

    // Dynamic Limit Calculation
    const volFactor = volatility > 80 ? 0.5 : 1.0;
    const liqFactor = liquidityScore < 20 ? 0.5 : 1.0;

    const effectiveMaxLeverage = this.limits.maxLeverage * volFactor * liqFactor;

    const leverageViolations = [
      ...(leverage > effectiveMaxLeverage
        ? [
            `MAX_LEVERAGE: ${leverage.toFixed(2)} > ${effectiveMaxLeverage.toFixed(
              2,
            )} (Base: ${this.limits.maxLeverage} * V:${volFactor} * L:${liqFactor})`,
          ]
        : []),
    ];

    const allViolations = [...deltaViolations, ...drawdownViolations, ...leverageViolations];

    return {
      withinLimits: allViolations.length === 0,
      violations: allViolations,
      delta: health.delta,
      leverage,
      drawdown: currentDrawdown,
    };
  }

  updateLimits(newLimits: Partial<RiskLimits>): void {
    // eslint-disable-next-line functional/immutable-data
    this.limits = { ...this.limits, ...newLimits };
  }

  getLimits(): RiskLimits {
    return this.limits;
  }
}
