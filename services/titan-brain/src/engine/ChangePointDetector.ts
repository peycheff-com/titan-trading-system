import { RegimeState } from '@titan/shared/dist/ipc/index.js';

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
  private readonly WINDOW_SIZE = 100; // Lookback window
  private readonly Z_SCORE_THRESHOLD = 2.5; // Sigma threshold for change point

  private lastPrice: number | null = null;

  constructor() {}

  /**
   * Update the detector with new price data and determine regime
   * @param price Current asset price
   * @param timestamp Time of update
   * @returns CPDResult with detected regime and change score
   */
  update(price: number, timestamp: number): { regime: RegimeState; changeScore: number } {
    if (this.lastPrice !== null && this.lastPrice > 0) {
      const ret = (price - this.lastPrice) / this.lastPrice;
      this.returnsHistory.push(ret);
      if (this.returnsHistory.length > this.WINDOW_SIZE) {
        this.returnsHistory.shift();
      }
    }
    this.lastPrice = price;

    const regime = this.detectRegime(this.returnsHistory);
    return { regime, changeScore: 0 }; // TODO: Implement BOCPD score
  }

  /**
   * Update the detector with new price data and determine regime
   * @param price Current asset price
   * @param timestamp Time of update
   * @returns Current RegimeState
   */
  detectRegime(returns: number[]): RegimeState {
    if (returns.length < 20) {
      return RegimeState.STABLE; // Not enough data
    }

    // 1. Calculate Volatility (StdDev of returns)
    const volatility = this.calculateStdDev(returns);

    // 2. Calculate Recent Trend (Mean of recent returns)
    const recentReturns = returns.slice(-20);
    const trend = recentReturns.reduce((a, b) => a + b, 0) / recentReturns.length;

    // 3. Detect Crash (Extreme Negative Returns)
    const minReturn = Math.min(...recentReturns);
    if (minReturn < -0.02) {
      // -2% candle in recent history
      return RegimeState.CRASH;
    }

    // 4. Classify Regime based on Volatility and Trend
    // Thresholds would ideally be dynamic, but fixed for V1
    const annualizedVol = volatility * Math.sqrt(365 * 24 * 60); // Assuming minute candles

    // Pure heuristic mapping for now, to be replaced by full Probability Mass Function
    if (volatility > 0.005) {
      // High Vol
      if (Math.abs(trend) > 0.0005) {
        return RegimeState.VOLATILE_BREAKOUT;
      } else {
        return RegimeState.MEAN_REVERSION; // High vol but flat trend
      }
    }

    return RegimeState.STABLE;
  }

  private calculateStdDev(data: number[]): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
  }
}
