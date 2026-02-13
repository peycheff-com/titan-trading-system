/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
import { SurpriseMetric } from './SurpriseMetric.js';
import { ActiveInferenceConfig } from '../types/index.js';
import { Logger } from '@titan/shared';

const logger = Logger.getInstance('brain:ActiveInferenceEngine');

export interface MarketState {
  price: number;
  volume: number;
  timestamp: number;
}

/**
 * Active Inference Engine
 *
 * The "Amygdala" of the system.
 * Monitors the "Surprise" (Variational Free Energy) of the market.
 * If the market behaves in a way that allows high confidence (Low Surprise), allow Aggression.
 * If the market behaves in a way that is highly surprising (High Divergence from Model), trigger Cortisol/Freeze.
 */
export class ActiveInferenceEngine {
  private readonly config: ActiveInferenceConfig;
  private historyWindow: number[] = [];
  private expectedDistribution: number[] = [];
  private cortisolLevel: number = 0; // 0.0 (Calm) to 1.0 (Panic)
  private lastSurprise: number = 0;

  constructor(config: ActiveInferenceConfig) {
    this.config = config;
    // Initialize with a "Normal" Gaussian-ish expectation for returns
    // In reality, this should be learned/updated by the Brain
    this.expectedDistribution = this.generateGaussian(config.distributionBins);
  }

  /**
   * Process a new market update
   * returns current Cortisol Level
   */
  public processUpdate(state: MarketState): number {
    this.historyWindow.push(state.price);
    if (this.historyWindow.length > this.config.windowSize) {
      this.historyWindow.shift();
    }

    if (this.historyWindow.length < this.config.minHistory) return 0; // Not enough data

    try {
      // Calculate Returns: (P_t - P_t-1) / P_t-1
      const returns = [];

      for (let i = 1; i < this.historyWindow.length; i++) {
        returns.push(
          (this.historyWindow[i] - this.historyWindow[i - 1]) / this.historyWindow[i - 1],
        );
      }

      // Convert recent returns to probability distribution
      const currentDistribution = SurpriseMetric.toDistribution(
        returns,
        this.config.distributionBins,
      );

      // Calculate KL Divergence (Surprise)
      const surprise = SurpriseMetric.calculateKLDivergence(
        this.expectedDistribution,
        currentDistribution,
      );

      this.lastSurprise = surprise;

      // Map Surprise to Cortisol (Sigmoid activation)
      // Sigmoid: 1 / (1 + exp(-k * (x - x0)))
      // x = surprise
      // x0 = 0.5 (default offset) or config.surpriseOffset
      // k = 5 (default sensitivity) or config.sensitivity
      const k = this.config.sensitivity;
      const x0 = this.config.surpriseOffset;

      this.cortisolLevel = this.sigmoid((surprise - x0) * k);

      return this.cortisolLevel;
    } catch (error) {
      logger.error('Active Inference Failed', {
        error,
      });
      return 1.0; // Fail safe to high anxiety
    }
  }

  public getCortisol(): number {
    return this.cortisolLevel;
  }

  public getState() {
    return {
      cortisol: this.cortisolLevel,
      surprise: this.lastSurprise,
      historySize: this.historyWindow.length,
    };
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  private generateGaussian(bins: number): number[] {
    // Simplified Bell curve logic
    const dist = [];

    for (let i = 0; i < bins; i++) {
      const x = (i - bins / 2) / (bins / 4); // Normalize

      dist.push(Math.exp(-0.5 * x * x));
    }
    // Normalize to sum 1
    const sum = dist.reduce((a, b) => a + b, 0);
    return dist.map((v) => v / sum);
  }
}
