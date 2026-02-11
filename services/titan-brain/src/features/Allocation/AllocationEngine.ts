/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
/**
 * AllocationEngine - Calculates base allocation weights for each phase
 * Uses sigmoid transition functions for smooth phase transitions
 *
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 3.4
 */

import {
  AllocationEngineConfig,
  AllocationVector,
  EquityTier,
  LeverageCaps,
  TransitionPoints,
} from '../../types/index.js';

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
  private hasEnteredPhase2: boolean = false;
  private hasEnteredPhase3: boolean = false;
  private readonly HYSTERESIS_BUFFER = 0.9; // 10% buffer to downgrade

  /**
   * Calculate allocation weights for each phase based on current equity
   *
   * Transition logic (with Hysteresis):
   * - Below $1,500 (or $1,350 if previously active): 100% Phase 1
   * - Transition Zone: Sigmoid blend
   * - Buffer prevents rapid oscillation at boundaries
   *
   * @param equity - Current account equity in USD
   * @returns AllocationVector with weights summing to 1.0
   */
  getWeights(equity: number): AllocationVector {
    const { startP2, fullP2, startP3 } = this.transitionPoints;
    const timestamp = Date.now();

    // Ensure equity is non-negative
    const safeEquity = Math.max(0, equity);

    // Determines effective thresholds based on state
    const effectiveStartP2 = this.hasEnteredPhase2 ? startP2 * this.HYSTERESIS_BUFFER : startP2;
    const effectiveStartP3 = this.hasEnteredPhase3 ? startP3 * this.HYSTERESIS_BUFFER : startP3;

    // State Updates

    if (safeEquity >= startP2) this.hasEnteredPhase2 = true;

    if (safeEquity < effectiveStartP2) this.hasEnteredPhase2 = false;

    if (safeEquity >= startP3) this.hasEnteredPhase3 = true;

    if (safeEquity < effectiveStartP3) this.hasEnteredPhase3 = false;

    // Phase 1 Only (MICRO tier)
    if (safeEquity < effectiveStartP2) {
      return { w1: 1.0, w2: 0.0, w3: 0.0, timestamp };
    }

    // Transition zone: Phase 1 → Phase 2
    if (safeEquity < fullP2) {
      // Sigmoid transition from 100% P1 to 20% P1 / 80% P2
      const transitionMidpoint = (startP2 + fullP2) / 2;
      const progress = this.sigmoid(safeEquity, transitionMidpoint, 0.003);

      // w1 goes from 1.0 to 0.2, w2 goes from 0.0 to 0.8
      const w1 = 1.0 - 0.8 * progress;
      const w2 = 0.8 * progress;
      const w3 = 0.0;

      return this.normalizeWeights({ w1, w2, w3, timestamp });
    }

    // Stable zone: 20% P1, 80% P2
    if (safeEquity < effectiveStartP3) {
      return { w1: 0.2, w2: 0.8, w3: 0.0, timestamp };
    }

    // Transition to Phase 3 (above $25,000)
    // P3 gradually takes from P2, P1 stays at 20%
    const p3TransitionMidpoint = startP3 + 12500; // $37,500 midpoint
    const p3Progress = this.sigmoid(safeEquity, p3TransitionMidpoint, 0.0002);

    // w1 stays at 0.2
    // w3 goes from 0 to 0.5 (max 50% to P3)
    // w2 goes from 0.8 to 0.3
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

  /**
   * Calculate allocation weights adjusted for Market Regime
   *
   * @param equity - Current equity
   * @param regime - Current market regime (STABLE, CRASH, etc.)
   */
  getRegimeAdjustedWeights(equity: number, regime: string): AllocationVector {
    const baseWeights = this.getWeights(equity);
    const timestamp = Date.now();

    // 1. CRASH Regime: Heavy defense
    // Force 100% Phase 1 (Scavenger) to capital preservation / snipe only
    if (regime === 'CRASH') {
      return { w1: 1.0, w2: 0.0, w3: 0.0, timestamp };
    }

    // 2. VOLATILE_BREAKOUT: Trend Following (Hunter) favored
    // Boost Phase 2 weight by 20% relative to others
    if (regime === 'VOLATILE_BREAKOUT') {
      // If we are in Phase 2 territory (meaning w2 > 0)
      if (baseWeights.w2 > 0) {
        const w2 = Math.min(0.9, baseWeights.w2 * 1.2); // +20% boost, cap at 90%
        const remainder = 1.0 - w2;
        // Distribute remainder between w1 and w3 proportionally
        const otherSum = baseWeights.w1 + baseWeights.w3;
        const w1 = otherSum > 0 ? (baseWeights.w1 / otherSum) * remainder : remainder; // Fallback to w1
        const w3 = otherSum > 0 ? (baseWeights.w3 / otherSum) * remainder : 0;

        return this.normalizeWeights({ w1, w2, w3, timestamp });
      }
    }

    // 3. MEAN_REVERSION: Mean Reversion (Sentinel) favored
    // Boost Phase 3 weight by 20% if active
    if (regime === 'MEAN_REVERSION') {
      if (baseWeights.w3 > 0) {
        const w3 = Math.min(0.8, baseWeights.w3 * 1.2);
        const remainder = 1.0 - w3;
        const otherSum = baseWeights.w1 + baseWeights.w2;
        const w1 = otherSum > 0 ? (baseWeights.w1 / otherSum) * remainder : remainder;
        const w2 = otherSum > 0 ? (baseWeights.w2 / otherSum) * remainder : 0;

        return this.normalizeWeights({ w1, w2, w3, timestamp });
      }
    }

    // 4. STABLE: Standard allocation
    return baseWeights;
  }

  /**
   * Calculate adaptive weights using Multi-Armed Bandit logic (Softmax)
   * Blends base Sigmoid weights (Safety) with Performance weights (Exploitation)
   *
   * @param equity - Current equity
   * @param performances - Array of performance metrics for each phase
   * @param explorationWeight - Weight given to base safety curve (0.0 to 1.0). Default 0.7 (70% Safety)
   */
  getAdaptiveWeights(
    equity: number,
    performances: { phaseId: string; sharpeRatio: number }[],
    explorationWeight: number = 0.7,
  ): AllocationVector {
    const baseWeights = this.getWeights(equity);
    const timestamp = Date.now();

    // If equity is low (Phase 1 only), force base weights to protect capital
    if (baseWeights.w1 === 1.0) {
      return baseWeights;
    }

    // If no performance data, fallback to base weights (Safety)
    if (!performances || performances.length === 0) {
      return baseWeights;
    }

    // 1. Calculate Softmax of Sharpe Ratios for Performance Weights
    // Filter for phases 1, 2, 3 in order
    const phases = ['phase1', 'phase2', 'phase3'];
    const sharpes = phases.map((id) => {
      const p = performances.find((p) => p.phaseId === id);
      return p ? Math.max(0, p.sharpeRatio) : 0; // Floor at 0 for softmax
    });

    // Temperature for Softmax (higher = more uniform, lower = more winner-takes-all)
    const temperature = 1.0;
    const expSharpes = sharpes.map((s) => Math.exp(s / temperature));
    const sumExp = expSharpes.reduce((a, b) => a + b, 0);

    // If sum is 0 or invalid, fallback to base weights
    if (sumExp === 0 || !isFinite(sumExp)) {
      return baseWeights;
    }

    const perfW1 = expSharpes[0] / sumExp;
    const perfW2 = expSharpes[1] / sumExp;
    const perfW3 = expSharpes[2] / sumExp;

    // 2. Blend Base Weights with Performance Weights
    // Final = (Base * Exploration) + (Perf * Exploitation)
    const exploitationWeight = 1.0 - explorationWeight;

    const w1 = baseWeights.w1 * explorationWeight + perfW1 * exploitationWeight;
    const w2 = baseWeights.w2 * explorationWeight + perfW2 * exploitationWeight;
    const w3 = baseWeights.w3 * explorationWeight + perfW3 * exploitationWeight;

    return this.normalizeWeights({ w1, w2, w3, timestamp });
  }

  /**
   * Calculate Risk-Constrained Fractional Kelly Multiplier
   * Adapts the Kelly Fraction based on the tail index (Alpha) of the market.
   *
   * Logic:
   * - Alpha < 2.0 (Wild/Infinite Variance): 0.2x Kelly (Survival Mode)
   * - Alpha 2.0-3.0 (Transition): Linear blend 0.2x -> 0.5x
   * - Alpha > 3.0 (Stable): 0.5x Kelly (Aggressive)
   * - Max Cap: 0.8x Kelly (Never Full Kelly in Crypto)
   */
  getKellyFraction(alpha: number): number {
    if (alpha <= 1.5) return 0.1; // Extreme
    if (alpha < 2.0) return 0.2; // Wild

    // Linear interpolation between 2.0 and 3.0
    // 2.0 -> 0.2
    // 3.0 -> 0.5
    if (alpha <= 3.0) {
      const t = alpha - 2.0; // 0 to 1
      return 0.2 + t * 0.3; // 0.2 to 0.5
    }

    // Alpha > 3.0
    // Cap at 0.5 normally, maybe up to 0.8 if extremely stable (>4.5)
    if (alpha > 4.5) return 0.8;
    return 0.5;
  }
}
