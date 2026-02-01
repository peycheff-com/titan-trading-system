/**
 * PowerLawCalculators.ts
 *
 * Mathematical primitives for Power Law analysis in financial markets.
 * Includes:
 * 1. Square Root Impact Model (Market Impact)
 * 2. Volatility Z-Score (Scale-Invariant Trigger)
 * 3. Tail Index Estimator (Hill Estimator)
 */

export class PowerLawCalculators {
  /**
   * Calculates expected market impact (slippage) in basis points using the Square Root Law.
   *
   * Formula: I = Y * sigma * sqrt(Q / V)
   * Where:
   * I = Impact (in bps or absolute, depending on sigma units)
   * Y = constant (typically 0.5 to 1.0)
   * sigma = daily volatility (std dev of returns)
   * Q = Order Size
   * V = Daily Volume
   *
   * @param orderSize Size of the order (base units)
   * @param dailyVolume Average daily volume (base units)
   * @param dailyVolatility Daily volatility (e.g., 0.04 for 4%)
   * @param Y Scaling constant (default 0.7)
   * @returns Expected impact in Basis Points (bps)
   */
  static calculateSquareRootImpact(
    orderSize: number,
    dailyVolume: number,
    dailyVolatility: number,
    Y: number = 0.7,
  ): number {
    if (dailyVolume <= 0) return Infinity;

    // Impact = Y * sigma * sqrt(Q/V)
    // Result is in decimal percentage (e.g., 0.005 for 0.5%)
    const impactDecimal = Y * dailyVolatility * Math.sqrt(orderSize / dailyVolume);

    // Convert to basis points (x 10000)
    return impactDecimal * 10000;
  }

  /**
   * Calculates the Z-Score of a price move normalized by volatility.
   * This allows for scale-invariant triggers (e.g., "4-sigma move" instead of "2% move").
   *
   * @param priceMovePct Magnitude of price move as a decimal (e.g. 0.02 for 2%)
   * @param currentVolatility Current volatility estimate (e.g. ATR percent or realized vol)
   * @returns Z-Score (number of standard deviations)
   */
  static calculateVolatilityZScore(priceMovePct: number, currentVolatility: number): number {
    if (currentVolatility <= 0) return 0;
    return Math.abs(priceMovePct) / currentVolatility;
  }

  /**
   * Estimates the Tail Index (alpha) using the Hill Estimator.
   *
   * The Hill Estimator operates on the upper tail of the distribution.
   * alpha = 1 / ( (1/k) * sum( ln(x_i / x_min) ) )
   *
   * @param absoluteReturns Array of absolute return values (e.g., [0.01, 0.05, 0.02...])
   * @param tailPercentile Percentile to define the tail (e.g., 0.05 for top 5%). Default 0.05.
   * @returns Tail Index (alpha). Lower value = Fatter tails.
   *          Normal Dist alpha -> Infinity (theoretically), practically high (>5).
   *          Crypto Power Law alpha -> typically 2.0 - 3.0.
   */
  static calculateHillEstimator(absoluteReturns: number[], tailPercentile: number = 0.05): number {
    if (absoluteReturns.length === 0) return 0;

    // 1. Sort descending
    const sortedReturns = [...absoluteReturns].sort((a, b) => b - a);

    // 2. Determine k (number of items in the tail)
    // k must be at least 2 to have a comparison
    const k = Math.max(2, Math.floor(sortedReturns.length * tailPercentile));

    // 3. Define x_min (the threshold value for the tail)
    // In Hill estimator, x_min is often taken as the k+1-th order statistic,
    // or we just take the k-th item as the cutoff boundary.
    // The strict formula uses x_i for i=1..k and x_min = x_{k+1} (or x_k depending on variant).
    // Let's use x_k (the smallest value IN the tail).
    const x_min = sortedReturns[k - 1];

    if (x_min <= 0) return 0; // Prevent division by zero or log of non-positive

    // 4. Sum of log differences
    // eslint-disable-next-line functional/no-let
    let sumLogDiff = 0;
    // eslint-disable-next-line functional/no-let
    for (let i = 0; i < k; i++) {
      // x_i depends on 0-based index, sorted descending
      // sorted[0] is max
      const x_i = sortedReturns[i];
      sumLogDiff += Math.log(x_i / x_min);
    }

    // 5. Calculate Alpha
    // alpha = 1 / mean(log_diffs)
    const meanLogDiff = sumLogDiff / k;

    if (meanLogDiff === 0) return 0;

    return 1 / meanLogDiff;
  }
}
