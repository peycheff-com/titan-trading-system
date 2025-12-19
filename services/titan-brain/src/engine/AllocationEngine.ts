/**
 * AllocationEngine - Calculates base allocation weights for each phase
 * Uses sigmoid transition functions for smooth phase transitions
 * 
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 3.4
 */

import {
  AllocationVector,
  AllocationEngineConfig,
  EquityTier,
  LeverageCaps,
  TransitionPoints,
} from '../types/index.js';

/**
 * AllocationEngine calculates capital allocation across Titan phases
 * based on current equity using sigmoid transition functions.
 */
export class AllocationEngine {
  private readonly transitionPoints: TransitionPoints;
  private readonly leverageCaps: LeverageCaps;

  constructor(config: AllocationEngineConfig) {
    this.transitionPoints = config.transitionPoints;
    this.leverageCaps = config.leverageCaps;
  }

  /**
   * Sigmoid function for smooth transitions
   * Returns value between 0 and 1
   * @param x - Input value
   * @param midpoint - Center of transition
   * @param steepness - How sharp the transition is (higher = sharper)
   */
  private sigmoid(x: number, midpoint: number, steepness: number = 0.002): number {
    return 1 / (1 + Math.exp(-steepness * (x - midpoint)));
  }

  /**
   * Calculate allocation weights for each phase based on current equity
   * 
   * Transition logic:
   * - Below $1,500: 100% Phase 1
   * - $1,500 - $5,000: Sigmoid transition from Phase 1 to Phase 2
   * - $5,000 - $25,000: 20% Phase 1, 80% Phase 2
   * - Above $25,000: Begin transition to Phase 3
   * 
   * @param equity - Current account equity in USD
   * @returns AllocationVector with weights summing to 1.0
   */
  getWeights(equity: number): AllocationVector {
    const { startP2, fullP2, startP3 } = this.transitionPoints;
    const timestamp = Date.now();

    // Ensure equity is non-negative
    const safeEquity = Math.max(0, equity);

    // Phase 1 only (MICRO tier)
    if (safeEquity < startP2) {
      return { w1: 1.0, w2: 0.0, w3: 0.0, timestamp };
    }

    // Transition zone: Phase 1 → Phase 2
    if (safeEquity < fullP2) {
      // Sigmoid transition from 100% P1 to 20% P1 / 80% P2
      const transitionMidpoint = (startP2 + fullP2) / 2;
      const progress = this.sigmoid(safeEquity, transitionMidpoint, 0.003);
      
      // w1 goes from 1.0 to 0.2, w2 goes from 0.0 to 0.8
      const w1 = 1.0 - (0.8 * progress);
      const w2 = 0.8 * progress;
      const w3 = 0.0;

      return this.normalizeWeights({ w1, w2, w3, timestamp });
    }

    // Stable zone: 20% P1, 80% P2 (before P3 transition)
    if (safeEquity < startP3) {
      return { w1: 0.2, w2: 0.8, w3: 0.0, timestamp };
    }

    // Transition to Phase 3 (above $25,000)
    // P3 gradually takes from P2, P1 stays at 20%
    const p3TransitionMidpoint = startP3 + 12500; // $37,500 midpoint
    const p3Progress = this.sigmoid(safeEquity, p3TransitionMidpoint, 0.0002);

    // w3 goes from 0 to 0.5 (max 50% to P3)
    // w2 goes from 0.8 to 0.3
    // w1 stays at 0.2
    const w1 = 0.2;
    const w3 = 0.5 * p3Progress;
    const w2 = 0.8 - w3;

    return this.normalizeWeights({ w1, w2, w3, timestamp });
  }

  /**
   * Normalize weights to ensure they sum to exactly 1.0
   * Handles floating point precision issues
   */
  private normalizeWeights(vector: AllocationVector): AllocationVector {
    const sum = vector.w1 + vector.w2 + vector.w3;
    
    if (sum === 0) {
      // Fallback to Phase 1 only if all weights are 0
      return { w1: 1.0, w2: 0.0, w3: 0.0, timestamp: vector.timestamp };
    }

    return {
      w1: vector.w1 / sum,
      w2: vector.w2 / sum,
      w3: vector.w3 / sum,
      timestamp: vector.timestamp,
    };
  }

  /**
   * Determine the equity tier based on current equity
   * 
   * Tier boundaries:
   * - MICRO: < $1,500
   * - SMALL: $1,500 - $5,000
   * - MEDIUM: $5,000 - $25,000
   * - LARGE: $25,000 - $50,000
   * - INSTITUTIONAL: > $50,000
   * 
   * @param equity - Current account equity in USD
   * @returns EquityTier classification
   */
  getEquityTier(equity: number): EquityTier {
    const safeEquity = Math.max(0, equity);

    if (safeEquity < 1500) {
      return EquityTier.MICRO;
    }
    if (safeEquity < 5000) {
      return EquityTier.SMALL;
    }
    if (safeEquity < 25000) {
      return EquityTier.MEDIUM;
    }
    if (safeEquity < 50000) {
      return EquityTier.LARGE;
    }
    return EquityTier.INSTITUTIONAL;
  }

  /**
   * Get maximum allowed leverage for the current equity tier
   * 
   * Leverage caps by tier:
   * - MICRO: 20x
   * - SMALL: 10x
   * - MEDIUM: 5x
   * - LARGE: 3x
   * - INSTITUTIONAL: 2x
   * 
   * @param equity - Current account equity in USD
   * @returns Maximum leverage multiplier
   */
  getMaxLeverage(equity: number): number {
    const tier = this.getEquityTier(equity);
    return this.leverageCaps[tier];
  }

  /**
   * Get the transition points configuration
   */
  getTransitionPoints(): TransitionPoints {
    return { ...this.transitionPoints };
  }

  /**
   * Get the leverage caps configuration
   */
  getLeverageCaps(): LeverageCaps {
    return { ...this.leverageCaps };
  }
}
