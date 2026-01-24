/**
 * Surprise Metric - Information Geometry Primitives
 *
 * Implements Shannon Entropy and Kullback-Leibler (KL) Divergence
 * to quantify "Market Surprise" (Variational Free Energy).
 */

export class SurpriseMetric {
  /**
   * Calculate Shannon Entropy H(P) of a probability distribution
   * H(P) = - sum(P(x) * log(P(x)))
   * Represents the "intrinsic uncertainty" of the state.
   */
  static calculateEntropy(probabilities: number[]): number {
    return probabilities.reduce((acc, p) => {
      if (p <= 0) return acc;
      return acc - p * Math.log(p);
    }, 0);
  }

  /**
   * Calculate Kullback-Leibler Divergence D_KL(P || Q)
   * Measures the "Surprise" experienced when reality (Q) differs from expectation (P).
   * D_KL = sum(P(x) * log(P(x) / Q(x)))
   *
   * @param expected Distribution P (The Generative Model / Expectation)
   * @param actual Distribution Q (The Reality / Observed Data)
   */
  static calculateKLDivergence(expected: number[], actual: number[]): number {
    if (expected.length !== actual.length) {
      throw new Error('Distributions must have same length');
    }

    return expected.reduce((acc, p, i) => {
      const q = actual[i];
      // Handle numerical stability (epsilon)
      const safeP = Math.max(p, 1e-10);
      const safeQ = Math.max(q, 1e-10);

      return acc + safeP * Math.log(safeP / safeQ);
    }, 0);
  }

  /**
   * Convert a raw numeric series (e.g. price returns) into a probability distribution (histogram)
   */
  static toDistribution(data: number[], bins: number = 10): number[] {
     
    if (data.length === 0) return Array(bins).fill(0);

    const min = Math.min(...data);
    const max = Math.max(...data);
     
    if (min === max) return Array(bins).fill(1 / bins); // Uniform if flat

    const range = max - min;
    const binWidth = range / bins;
     
    const bucketCounts = Array(bins).fill(0);

    data.forEach((val) => {
       
      let binIndex = Math.floor((val - min) / binWidth);
      if (binIndex >= bins) binIndex = bins - 1;
       
      bucketCounts[binIndex]++;
    });

    const total = data.length;
    return bucketCounts.map((count) => count / total);
  }
}
