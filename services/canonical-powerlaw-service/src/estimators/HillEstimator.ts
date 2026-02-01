/**
 * Hill Estimator with k-stability heuristic
 *
 * Estimates tail exponent α from order statistics.
 * Enhanced with k-stability to find optimal threshold.
 */

export interface HillEstimate {
  alpha: number;
  standardError: number;
  confidence: number;
  kOptimal: number;
  ciLower: number;
  ciUpper: number;
  isHeavyTailed: boolean;
}

export class HillEstimator {
  private readonly MIN_SAMPLES = 20;
  private readonly HEAVY_TAIL_THRESHOLD = 3.0;

  /**
   * Estimate tail exponent α with k-stability heuristic
   *
   * The k-stability heuristic finds the optimal k by minimizing
   * the variance of alpha estimates across different k values.
   */
  estimate(returns: number[]): HillEstimate {
    const absReturns = returns.map(Math.abs).filter((r) => r > 0);

    if (absReturns.length < this.MIN_SAMPLES) {
      return this.fallbackEstimate();
    }

    const sorted = [...absReturns].sort((a, b) => b - a);
    const n = sorted.length;

    // k-stability: try k from 5% to 25% of samples
    const kMin = Math.max(5, Math.floor(n * 0.05));
    const kMax = Math.min(Math.floor(n * 0.25), n - 1);

    if (kMin >= kMax) {
      return this.fallbackEstimate();
    }

    // Calculate alpha for each k
    const estimates: { k: number; alpha: number }[] = [];
    for (let k = kMin; k <= kMax; k++) {
      const alpha = this.computeAlpha(sorted, k);
      if (alpha > 0 && isFinite(alpha)) {
        estimates.push({ k, alpha });
      }
    }

    if (estimates.length < 3) {
      return this.fallbackEstimate();
    }

    // k-stability: Find k with minimal local variance
    const kOptimal = this.findStableK(estimates);
    const optimalEst = estimates.find((e) => e.k === kOptimal);

    if (!optimalEst) {
      return this.fallbackEstimate();
    }

    const alpha = optimalEst.alpha;
    const se = alpha / Math.sqrt(kOptimal);
    const ciWidth = 1.96 * se;

    return {
      alpha,
      standardError: se,
      confidence: Math.max(0, Math.min(1, 1 - ciWidth / alpha)),
      kOptimal,
      ciLower: Math.max(0, alpha - ciWidth),
      ciUpper: alpha + ciWidth,
      isHeavyTailed: alpha < this.HEAVY_TAIL_THRESHOLD,
    };
  }

  private computeAlpha(sorted: number[], k: number): number {
    const xMin = sorted[k];
    if (xMin <= 0) return 0;

    let sumLogRatio = 0;
    for (let i = 0; i < k; i++) {
      sumLogRatio += Math.log(sorted[i] / xMin);
    }

    return sumLogRatio > 0 ? k / sumLogRatio : 0;
  }

  private findStableK(estimates: { k: number; alpha: number }[]): number {
    // Use rolling variance to find stable region
    const windowSize = Math.max(3, Math.floor(estimates.length / 5));
    let minVariance = Infinity;
    let stableK = estimates[0].k;

    for (let i = 0; i <= estimates.length - windowSize; i++) {
      const window = estimates.slice(i, i + windowSize);
      const alphas = window.map((e) => e.alpha);
      const mean = alphas.reduce((a, b) => a + b, 0) / alphas.length;
      const variance = alphas.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / alphas.length;

      if (variance < minVariance) {
        minVariance = variance;
        // Take middle of stable window
        stableK = window[Math.floor(windowSize / 2)].k;
      }
    }

    return stableK;
  }

  private fallbackEstimate(): HillEstimate {
    return {
      alpha: 0,
      standardError: 0,
      confidence: 0,
      kOptimal: 0,
      ciLower: 0,
      ciUpper: 0,
      isHeavyTailed: false,
    };
  }
}
