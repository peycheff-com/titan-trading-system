/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
/**
 * BayesianCalibrator - Estimates realized probability of success using Beta-Binomial model
 *
 * Replaces hardcoded "Confidence Tables" with evidential shrinkage.
 *
 * Mathematical Model:
 * Posterior ~ Beta(alpha + wins, beta + trials - wins)
 * Mean Probability = (alpha + wins) / (alpha + beta + trials)
 *
 * We use a Jeffreys Prior (alpha=0.5, beta=0.5) as the uninformative starting point.
 */

import Redis from 'ioredis';
import { Logger } from '../../logging/Logger.js';

export interface CalibrationStats {
  alpha: number;
  beta: number;
  wins: number; // Number of profitable trades
  trials: number; // Total number of trades
}

export interface TrapTypeStats {
  trapType: string;
  stats: CalibrationStats;
}

export class BayesianCalibrator {
  private statsCache: Map<string, CalibrationStats> = new Map();
  private redis: Redis | null = null;
  private logger = Logger.getInstance('bayesian-calibrator');

  // Jeffreys Prior
  private readonly PRIOR_ALPHA = 0.5;
  private readonly PRIOR_BETA = 0.5;

  constructor(initialStats?: TrapTypeStats[]) {
    if (initialStats) {
      initialStats.forEach((s) => this.statsCache.set(s.trapType, s.stats));
    }

    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL);
      this.loadStats().catch((err) => {
        this.logger.error('Failed to load Bayesian stats from Redis', err as Error);
      });
    }
  }

  private async loadStats() {
    if (!this.redis) return;
    try {
      const data = await this.redis.hgetall('bayesian:stats');
      for (const [trapType, json] of Object.entries(data)) {
        try {
          const stats = JSON.parse(json);
          this.statsCache.set(trapType, stats);
        } catch (e) {
          this.logger.warn(`Failed to parse stats for ${trapType}`, undefined, {
            error: e,
          });
        }
      }
      this.logger.info(`Loaded Bayesian stats for ${Object.keys(data).length} trap types`);
    } catch (error) {
      this.logger.error('Redis load failed', error as Error);
    }
  }

  /**
   * Get the calibrated probability of success for a specific trap type.
   *
   * @param trapType - The implementation type (e.g., 'LIQUIDATION_CLUSTER', 'V_SHAPE')
   * @param rawConfidence - The heuristic confidence from the strategy (0-100), used as a 'weight' or for cold starts
   * @returns Calibrated probability (0.0 - 1.0)
   */
  public getCalibratedProbability(trapType: string, rawConfidence: number): number {
    const stats = this.statsCache.get(trapType) || {
      alpha: this.PRIOR_ALPHA,
      beta: this.PRIOR_BETA,
      wins: 0,
      trials: 0,
    };

    // Posterior parameters
    const alphaPost = stats.alpha + stats.wins;
    const betaPost = stats.beta + (stats.trials - stats.wins);

    // Posterior Mean
    // P = (alpha + wins) / (alpha + beta + trials)
    const calibratedProb = alphaPost / (alphaPost + betaPost);

    // Heuristic Blending:
    // If we have very few trials (< 10), we blend the calibrated probability with the raw confidence
    // to avoid "wild" swings from the first few random outcomes.
    // Blend Weight = min(1, trials / 10)
    const rawProb = rawConfidence / 100;
    const blendWeight = Math.min(1.0, stats.trials / 20);

    return calibratedProb * blendWeight + rawProb * (1 - blendWeight);
  }

  /**
   * Update stats with a new realized outcome
   */
  public updateOutcome(trapType: string, profitable: boolean): void {
    const current = this.statsCache.get(trapType) || {
      alpha: this.PRIOR_ALPHA,
      beta: this.PRIOR_BETA,
      wins: 0,
      trials: 0,
    };

    const newStats = {
      ...current,
      wins: current.wins + (profitable ? 1 : 0),
      trials: current.trials + 1,
    };

    this.statsCache.set(trapType, newStats);

    // Persist to Redis
    if (this.redis) {
      this.redis.hset('bayesian:stats', trapType, JSON.stringify(newStats)).catch((err) => {
        this.logger.error('Failed to persist stats to Redis', err as Error);
      });
    }
  }

  /**
   * Get shrinkage description for logging
   */
  public getShrinkageReport(trapType: string, rawConfidence: number): string {
    const cal = this.getCalibratedProbability(trapType, rawConfidence);
    const stats = this.statsCache.get(trapType) || { wins: 0, trials: 0 };
    return `Trap: ${trapType} | Stats: ${stats.wins}/${stats.trials} | Raw: ${rawConfidence}% -> Calibrated: ${(
      cal * 100
    ).toFixed(2)}%`;
  }
}
