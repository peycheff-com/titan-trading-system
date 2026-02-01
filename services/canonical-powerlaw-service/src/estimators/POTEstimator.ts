/**
 * Peaks-Over-Threshold (POT) Estimator
 *
 * Estimates exceedance probabilities and GPD fit quality.
 */

export interface POTEstimate {
  exceedanceProbability: number;
  threshold: number;
  exceedanceCount: number;
  sampleSize: number;
  gpdShape: number; // ξ parameter (shape)
  gpdScale: number; // σ parameter (scale)
  fitQuality: number; // 0-1 quality score
}

export class POTEstimator {
  private readonly MIN_EXCEEDANCES = 5;

  /**
   * Estimate exceedance probability and GPD parameters
   */
  estimate(returns: number[], threshold: number): POTEstimate {
    const absReturns = returns.map(Math.abs);
    const exceedances = absReturns.filter((r) => r > threshold);
    const n = returns.length;
    const k = exceedances.length;

    const exceedanceProbability = n > 0 ? k / n : 0;

    if (k < this.MIN_EXCEEDANCES) {
      return {
        exceedanceProbability,
        threshold,
        exceedanceCount: k,
        sampleSize: n,
        gpdShape: 0,
        gpdScale: 0,
        fitQuality: 0,
      };
    }

    // GPD parameter estimation via Probability-Weighted Moments (PWM)
    const { shape, scale } = this.estimateGPDParams(exceedances, threshold);

    // Compute fit quality via Anderson-Darling-like statistic
    const fitQuality = this.assessFitQuality(exceedances, threshold, shape, scale);

    return {
      exceedanceProbability,
      threshold,
      exceedanceCount: k,
      sampleSize: n,
      gpdShape: shape,
      gpdScale: scale,
      fitQuality,
    };
  }

  /**
   * Simple exceedance probability (legacy compatibility)
   */
  exceedanceProbability(returns: number[], threshold: number): number {
    if (returns.length === 0) return 0;
    const absReturns = returns.map(Math.abs);
    const exceeds = absReturns.filter((r) => r > threshold).length;
    return exceeds / returns.length;
  }

  /**
   * Auto-select threshold based on volatility
   */
  autoThreshold(returns: number[], multiplier: number = 2.5): number {
    if (returns.length === 0) return 0;
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / returns.length;
    return Math.sqrt(variance) * multiplier;
  }

  /**
   * Estimate GPD parameters using Probability-Weighted Moments
   * Returns shape (ξ) and scale (σ) parameters
   */
  private estimateGPDParams(
    exceedances: number[],
    threshold: number,
  ): { shape: number; scale: number } {
    const excess = exceedances.map((x) => x - threshold).filter((x) => x > 0);
    const n = excess.length;

    if (n < 2) {
      return { shape: 0, scale: 0 };
    }

    // Sort for order statistics
    const sorted = [...excess].sort((a, b) => a - b);

    // PWM estimators
    let m0 = 0,
      m1 = 0;
    for (let i = 0; i < n; i++) {
      m0 += sorted[i];
      m1 += sorted[i] * (i / (n - 1));
    }
    m0 /= n;
    m1 /= n;

    // GPD parameters from PWM
    if (m0 === 0) {
      return { shape: 0, scale: 0 };
    }

    const shape = 2 - m0 / (m0 - 2 * m1);
    const scale = (2 * m0 * m1) / (m0 - 2 * m1);

    return {
      shape: isFinite(shape) ? shape : 0,
      scale: isFinite(scale) && scale > 0 ? scale : 0,
    };
  }

  /**
   * Assess GPD fit quality (0-1 score)
   */
  private assessFitQuality(
    exceedances: number[],
    threshold: number,
    shape: number,
    scale: number,
  ): number {
    if (scale <= 0) return 0;

    const excess = exceedances.map((x) => x - threshold).filter((x) => x > 0);
    const n = excess.length;
    if (n < 3) return 0;

    // Sorted excess values
    const sorted = [...excess].sort((a, b) => a - b);

    // Compare empirical vs theoretical quantiles
    let sumSqDiff = 0;
    for (let i = 0; i < n; i++) {
      const empirical = sorted[i];
      const p = (i + 0.5) / n;
      // GPD quantile function
      const theoretical =
        shape !== 0 ? (scale / shape) * (Math.pow(1 - p, -shape) - 1) : -scale * Math.log(1 - p);

      if (isFinite(theoretical) && theoretical > 0) {
        sumSqDiff += Math.pow((empirical - theoretical) / theoretical, 2);
      }
    }

    const rmse = Math.sqrt(sumSqDiff / n);
    // Convert RMSE to 0-1 quality score
    return Math.max(0, Math.min(1, 1 - rmse));
  }
}
