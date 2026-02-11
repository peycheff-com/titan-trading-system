export interface TailEstimate {
  alpha: number;
  confidence: number;
  isHeavyTailed: boolean;
}

export class HillEstimator {
  /**
   * Estimate tail exponent α from order statistics.
   *
   * @param returns Absolute returns (or other data). Must be positive.
   * @param tailPercentile Percentile to start tail (default 0.95 = top 5%).
   */
  estimate(returns: number[], tailPercentile: number = 0.95): TailEstimate {
    // Filter out zeros and ensure positive
    const absReturns = returns.map(Math.abs).filter((r) => r > 0);

    if (absReturns.length < 20) {
      return { alpha: 0, confidence: 0, isHeavyTailed: false };
    }

    const sorted = [...absReturns].sort((a, b) => b - a); // Descending
    const k = Math.ceil(sorted.length * (1 - tailPercentile));

    if (k < 5 || k >= sorted.length) {
      return { alpha: 0, confidence: 0, isHeavyTailed: false };
    }

    // Hill Estimator Formula: alpha = 1 / ( (1/k) * sum( log(x_i / x_min) ) )
    // where x_min = sorted[k] (the threshold element, effectively x_(k+1) in 0-indexed if we take top k)
    // Actually standard Hill is: alpha = k / sum(log(x_i/x_{k+1})) for i=1..k

    const x_min = sorted[k]; // The threshold value

    const sumLogRatio = sorted.slice(0, k).reduce((sum, val) => sum + Math.log(val / x_min), 0);

    if (sumLogRatio === 0) {
      return { alpha: 0, confidence: 0, isHeavyTailed: false };
    }

    const alpha = k / sumLogRatio;

    // Standard Error approx: alpha / sqrt(k)
    // 95% CI is alpha +/- 1.96 * SE
    const se = alpha / Math.sqrt(k);
    const ciWidth = 1.96 * se;

    // Confidence score: 1 - (CI_width / alpha)
    // If CI is huge relative to alpha, confidence is low.
    const confidence = Math.max(0, 1 - ciWidth / alpha);

    return {
      alpha,
      confidence,
      isHeavyTailed: alpha < 3, // Crypto often < 2.5
    };
  }
}

export class POTEstimator {
  /**
   * Peaks-Over-Threshold: estimate P(|R| > x) directly.
   */
  exceedanceProbability(returns: number[], threshold: number): number {
    if (returns.length === 0) return 0;
    const absReturns = returns.map(Math.abs);
    const exceeds = absReturns.filter((r) => r > threshold).length;
    return exceeds / returns.length;
  }
}
