import { RegimeState } from "@titan/shared/dist/ipc/index.js";

/**
 * Change Point Detector (CPD)
 *
 * Implements a simplified Bayesian Online Change Point Detection (BOCPD) logic.
 * Detects shifts in market volatility and trend regimes to switch RiskManager states.
 *
 * Regimes:
 * - STABLE: Low volatility, mean reverting (Default)
 * - VOLATILE_BREAKOUT: High volatility, directional trending
 * - MEAN_REVERSION: Moderate volatility, oscillating
 * - CRASH: Extreme volatility, correlation breakdown
 */
export class ChangePointDetector {
  private returnsHistory: number[] = [];
  private readonly WINDOW_SIZE = 100;

  // BOCPD State
  private runLengthProbs: number[] = [1.0]; // P(r_t | x_1:t)
  private readonly HAZARD_RATE = 1 / 100; // Expected regime duration ~100 candles
  private readonly PREDICTIVE_MEAN = 0.0;
  private readonly PREDICTIVE_VAR = 0.0001; // Base volatility prior

  private lastPrice: number | null = null;

  constructor() {}

  /**
   * Update the detector with new price data and determine regime via BOCPD
   * @returns CPDResult with regime and change probability score
   */
  update(
    price: number,
    _timestamp: number,
  ): { regime: RegimeState; changeScore: number } {
    if (this.lastPrice === null || this.lastPrice <= 0) {
      this.lastPrice = price;
      return { regime: RegimeState.STABLE, changeScore: 0 };
    }

    const ret = (price - this.lastPrice) / this.lastPrice;
    this.lastPrice = price;
    this.returnsHistory.push(ret);
    if (this.returnsHistory.length > this.WINDOW_SIZE) {
      this.returnsHistory.shift();
    }

    // --- BOCPD Step ---
    // 1. Predictive Probability: P(x_t | r_{t-1}, x_{t-1}^(r))
    // Assume Gaussian: N(0, VAR)
    const probs = this.runLengthProbs.map(() => {
      // Simplified: Fixed variance for now, real implementation would update Normal-Inverse-Gamma params
      const prob = Math.exp(
        (-0.5 * Math.pow(ret - this.PREDICTIVE_MEAN, 2)) / this.PREDICTIVE_VAR,
      ) / Math.sqrt(2 * Math.PI * this.PREDICTIVE_VAR);
      return prob;
    });

    // 2. Growth Probability: P(r_t = r_{t-1} + 1 | ...)
    const growthProbs = probs.map((prob, r) =>
      prob * this.runLengthProbs[r] * (1 - this.HAZARD_RATE)
    );

    // 3. Changepoint Probability: P(r_t = 0 | ...)
    const cpProb = probs.reduce(
      (sum, prob, r) => sum + prob * this.runLengthProbs[r] * this.HAZARD_RATE,
      0,
    );

    // 4. Update and Normalize
    const newRunLengthProbs = [cpProb, ...growthProbs];
    const totalProb = newRunLengthProbs.reduce((a, b) => a + b, 0);
    this.runLengthProbs = newRunLengthProbs.map((p) => p / (totalProb || 1));
    this.runLengthProbs = this.runLengthProbs.slice(0, this.WINDOW_SIZE); // Prune tail

    // 5. Determine State
    const maxRunLength = this.runLengthProbs.indexOf(
      Math.max(...this.runLengthProbs),
    );
    const changeScore = this.runLengthProbs[0]; // Probability of recent change

    // Heuristic mapping of "Regime" based on Volatility + Run Length
    const regime = this.classifyRegime(ret, maxRunLength, changeScore);

    return { regime, changeScore };
  }

  private classifyRegime(
    currentRet: number,
    runLength: number,
    changeScore: number,
  ): RegimeState {
    const vol = this.calculateStdDev(this.returnsHistory.slice(-20));

    // Crash Logic overrides everything
    if (currentRet < -0.02) return RegimeState.CRASH;
    if (vol > 0.02) return RegimeState.CRASH; // Sustained extreme vol

    // New Regime Detected (Short Run Length + High Change Score)
    if (runLength < 5 && changeScore > 0.3) {
      if (Math.abs(currentRet) > 0.005) return RegimeState.VOLATILE_BREAKOUT;
      return RegimeState.MEAN_REVERSION; // Uncertainty
    }

    // Established Regimes
    if (vol > 0.005) {
      // Trending or Mean Reverting?
      const trend = Math.abs(
        this.returnsHistory.slice(-10).reduce((a, b) => a + b, 0),
      );
      if (trend > 0.01) return RegimeState.VOLATILE_BREAKOUT;
      return RegimeState.MEAN_REVERSION;
    }

    return RegimeState.STABLE;
  }

  private calculateStdDev(data: number[]): number {
    if (data.length === 0) return 0;
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance =
      data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }
}
