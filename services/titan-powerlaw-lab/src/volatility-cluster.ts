import * as numeric from 'numeric';

export type VolClusterState = 'expanding' | 'mean_revert' | 'quiet';

export interface VolatilityState {
  state: VolClusterState;
  persistence: number;
  sigma: number;
}

export class VolatilityClusterDetector {
  /**
   * Detect volatility clustering via autocorrelation decay of squared returns.
   * States: 'expanding' (vol cluster ON) | 'mean_revert' | 'quiet'
   */
  getState(returns: number[], lookback: number = 100): VolatilityState {
    if (returns.length < lookback) {
      return { state: 'quiet', persistence: 0, sigma: 0 };
    }

    // Take recent window
    const recent = returns.slice(-lookback);
    const squared = recent.map((r) => r * r);

    // Calculate simple volatility (sigma)
    const variance = this.mean(squared); // Approx, assuming mean return is 0 for short windows
    const sigma = Math.sqrt(variance);

    if (sigma === 0) {
      return { state: 'quiet', persistence: 0, sigma: 0 };
    }

    // Autocorrelation of squared returns (Volatility Clustering check)
    // A high ACF at lag 1-5 indicates clustering/persistence
    const acf = this.autocorrelation(squared, 5);

    // Average persistence of lags 1-3
    const avgPersistence = (acf[1] + acf[2] + acf[3]) / 3;

    let state: VolClusterState = 'mean_revert';

    // Heuristics tuned for crypto
    if (avgPersistence > 0.4) {
      state = 'expanding';
    } else if (avgPersistence > 0.1) {
      state = 'quiet';
    } else {
      state = 'mean_revert';
    }

    return {
      state,
      persistence: avgPersistence,
      sigma,
    };
  }

  private mean(data: number[]): number {
    return data.reduce((a, b) => a + b, 0) / data.length;
  }

  private autocorrelation(data: number[], lags: number): number[] {
    const n = data.length;
    if (n < 2) return new Array(lags).fill(0);

    const mean = this.mean(data);
    const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;

    if (variance === 0) return new Array(lags).fill(0);

    const acf = [];

    for (let lag = 0; lag <= lags; lag++) {
      let sum = 0;

      for (let i = 0; i < n - lag; i++) {
        sum += (data[i] - mean) * (data[i + lag] - mean);
      }

      acf.push(sum / n / variance);
    }
    return acf;
  }
}
