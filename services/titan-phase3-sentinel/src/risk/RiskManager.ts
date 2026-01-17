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
    const violations: string[] = [];

    // 1. Delta Check
    const deltaRatio = totalEquity > 0 ? Math.abs(health.delta) / totalEquity : 0;

    if (deltaRatio > this.limits.criticalDelta) {
      violations.push(`CRITICAL_DELTA: ${deltaRatio.toFixed(4)} > ${this.limits.criticalDelta}`);
    } else if (deltaRatio > this.limits.maxDelta) {
      violations.push(`WARNING_DELTA: ${deltaRatio.toFixed(4)} > ${this.limits.maxDelta}`);
    }

    // 2. Drawdown Check
    if (currentDrawdown > this.limits.criticalDrawdown) {
      violations.push(`CRITICAL_DRAWDOWN: ${currentDrawdown} > ${this.limits.criticalDrawdown}`);
    } else if (currentDrawdown > this.limits.dailyDrawdownLimit) {
      violations.push(`WARNING_DRAWDOWN: ${currentDrawdown} > ${this.limits.dailyDrawdownLimit}`);
    }

    // 3. Leverage Check with Dynamic Limits
    let totalPositionValue = 0;
    for (const pos of health.positions) {
      totalPositionValue += (Math.abs(pos.spotSize) + Math.abs(pos.perpSize)) * pos.spotEntry;
    }
    const leverage = totalEquity > 0 ? totalPositionValue / totalEquity : 0;

    // Dynamic Limit Calculation
    // Volatility Factor: 0-100. If > 80 (Extreme), factor drops to 0.5. Low/Normal vol -> 1.0.
    // Liquidity Factor: 0-100. If < 20 (Illiquid), factor drops to 0.5. Normal/High val -> 1.0.

    const volFactor = volatility > 80 ? 0.5 : 1.0;
    const liqFactor = liquidityScore < 20 ? 0.5 : 1.0;

    const effectiveMaxLeverage = this.limits.maxLeverage * volFactor * liqFactor;

    if (leverage > effectiveMaxLeverage) {
      violations.push(
        `MAX_LEVERAGE: ${leverage.toFixed(2)} > ${effectiveMaxLeverage.toFixed(
          2,
        )} (Base: ${this.limits.maxLeverage} * V:${volFactor} * L:${liqFactor})`,
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
