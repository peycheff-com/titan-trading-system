/**
 * Volatility Cluster State Machine
 *
 * Detects volatility clustering via autocorrelation decay of squared returns.
 */

import type { VolClusterState } from '@titan/shared';

export interface VolatilityState {
  state: VolClusterState;
  persistence: number;
  sigma: number;
  acfLag1: number;
  acfLag2: number;
  acfLag3: number;
}

export class VolatilityClusterDetector {
  private readonly LOOKBACK = 100;
  private readonly EXPANDING_THRESHOLD = 0.4;
  private readonly STABLE_THRESHOLD = 0.15;

  /**
   * Detect current volatility clustering state
   */
  getState(returns: number[]): VolatilityState {
    if (returns.length < this.LOOKBACK) {
      return this.unknownState();
    }

    const recent = returns.slice(-this.LOOKBACK);
    const squared = recent.map((r) => r * r);

    // Calculate realized volatility
    const variance = this.mean(squared);
    const sigma = Math.sqrt(variance);

    if (sigma === 0) {
      return this.unknownState();
    }

    // Autocorrelation of squared returns (volatility persistence)
    const acf = this.autocorrelation(squared, 5);
    const acfLag1 = acf[1];
    const acfLag2 = acf[2];
    const acfLag3 = acf[3];

    // Average persistence (lags 1-3)
    const avgPersistence = (acfLag1 + acfLag2 + acfLag3) / 3;

    // State classification
    let state: VolClusterState;
    if (avgPersistence > this.EXPANDING_THRESHOLD) {
      state = 'expanding';
    } else if (avgPersistence > this.STABLE_THRESHOLD) {
      state = 'stable';
    } else if (avgPersistence > 0) {
      state = 'contracting';
    } else {
      state = 'unknown';
    }

    return {
      state,
      persistence: avgPersistence,
      sigma,
      acfLag1,
      acfLag2,
      acfLag3,
    };
  }

  private unknownState(): VolatilityState {
    return {
      state: 'unknown',
      persistence: 0,
      sigma: 0,
      acfLag1: 0,
      acfLag2: 0,
      acfLag3: 0,
    };
  }

  private mean(data: number[]): number {
    return data.reduce((a, b) => a + b, 0) / data.length;
  }

  private autocorrelation(data: number[], lags: number): number[] {
    const n = data.length;
    if (n < 2) return new Array(lags + 1).fill(0);

    const mean = this.mean(data);
    const variance = data.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;

    if (variance === 0) return new Array(lags + 1).fill(0);

    const acf: number[] = [];
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
