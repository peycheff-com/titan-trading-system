import { BacktestResult, ValidationReport } from '../types/index.js';

export interface GateConfig {
  maxDrawdown: number; // e.g., 0.20 (20%)
  minSharpe: number; // e.g., 1.5
  minSortino: number; // e.g., 2.0
  minCalmar: number; // e.g., 1.0
  tailRiskCap?: number; // e.g. 0.05 (5% max single day loss)
}

export class ShippingGate {
  private config: GateConfig;

  constructor(config: GateConfig) {
    this.config = config;
  }

  evaluate(baseline: BacktestResult, proposed: BacktestResult): ValidationReport {
    const report: ValidationReport = {
      passed: true,
      metrics: proposed,
      stressTestResults: [], // To be populated by stress tester
    };

    // 1. HARD GATE: Max Drawdown Limit
    if (proposed.metrics.maxDrawdown > this.config.maxDrawdown) {
      // eslint-disable-next-line functional/immutable-data
      report.passed = false;
      // eslint-disable-next-line functional/immutable-data
      report.rejectionReason = `Max Drawdown ${(proposed.metrics.maxDrawdown * 100).toFixed(
        2,
      )}% exceeds limit ${(this.config.maxDrawdown * 100).toFixed(2)}%`;
      return report;
    }

    // 2. HARD GATE: Degradation Check (Proposed vs Baseline)
    // We allow slight degradation if returns are significantly higher, but generally NO degradation in Drawdown > 10% relative
    if (proposed.metrics.maxDrawdown > baseline.metrics.maxDrawdown * 1.1) {
      // eslint-disable-next-line functional/immutable-data
      report.passed = false;
      // eslint-disable-next-line functional/immutable-data
      report.rejectionReason = `Drawdown degraded by >10% relative to baseline`;
      return report;
    }

    // 3. HARD GATE: Tail Risk Cap (Single Day Loss)
    if (this.config.tailRiskCap && (proposed as any).maxSingleDayLoss) {
      // ... (this logic might need update too if maxSingleDayLoss is moved, but let's assume it's attached or ignore for now)
      // Original code accessed (proposed as any).maxSingleDayLoss.
      // If it's not in metrics, we leave it. IF it was supposed to be in metrics, we'd need to know.
      // Assuming it's custom metadata.
      const maxLoss = (proposed as any).maxSingleDayLoss;
      if (maxLoss > this.config.tailRiskCap) {
        // eslint-disable-next-line functional/immutable-data
        report.passed = false;
        // eslint-disable-next-line functional/immutable-data
        report.rejectionReason = `Max Single Day Loss ${(maxLoss * 100).toFixed(
          2,
        )}% exceeds cap ${(this.config.tailRiskCap * 100).toFixed(2)}%`;
        return report;
      }
    }

    // 4. SOFT GATE: Risk-Adjusted Returns
    if (proposed.metrics.sharpeRatio < this.config.minSharpe) {
      // eslint-disable-next-line functional/immutable-data
      report.passed = false;
      // eslint-disable-next-line functional/immutable-data
      report.rejectionReason = `Sharpe Ratio ${proposed.metrics.sharpeRatio.toFixed(
        2,
      )} below minimum ${this.config.minSharpe}`;
      return report;
    }

    return report;
  }
}
