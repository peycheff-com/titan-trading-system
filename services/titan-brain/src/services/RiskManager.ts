/**
 * RiskManager.ts
 *
 * Controls system-wide risk parameters using Power Law concepts.
 *
 * Core Responsibility:
 * - Adjust leverage and position sizes based on the "Tail Index" (alpha).
 * - Enforce capital preservation limits when the market enters "Fat Tail" regimes.
 *
 * Usage:
 * - Low Alpha (< 2.0) -> High probability of extreme events -> Slash Leverage.
 * - High Volatility Regime -> Cap Position Sizes.
 */

import { BrainConfig } from '../config/BrainConfig.js';

export interface RiskState {
  tailIndex: number; // Current estimated tail index (alpha)
  volatilityRegime: string; // LOW, NORMAL, HIGH, EXTREME
  maxImpactBps: number; // Maximum allowed impact per trade
}

export class RiskManager {
  private config: BrainConfig;

  // Default Risk State (assume normal/safe conditions initially)
  private state: RiskState = {
    tailIndex: 3.0, // ~3.0 is typical for healthy crypto markets (Cubic Law)
    volatilityRegime: 'NORMAL',
    maxImpactBps: 10, // 10 basis points max impact
  };

  constructor(config: BrainConfig) {
    this.config = config;
  }

  /**
   * Update the current market risk state.
   * This would typically be called by a 'MarketState' update event from the "Tail Lab"
   */
  public updateRiskState(newState: Partial<RiskState>) {
    // eslint-disable-next-line functional/immutable-data
    this.state = { ...this.state, ...newState };
  }

  /**
   * Calculates the maximum safe leverage for a given signal.
   * Applies Power Law logic:
   * - If alpha < tailIndexThreshold (Fat Tails), reduce leverage.
   * - If alpha < 2.0 (Infinite Variance potential), strict safety mode.
   */
  public getSafeLeverage(baseLeverage: number): number {
    const riskConfig = this.config.risk;
    // eslint-disable-next-line functional/no-let
    let safeLeverage = Math.min(baseLeverage, riskConfig.maxLeverage);
    const { tailIndex } = this.state;

    // 1. Tail Index Adjustment
    // Alpha ~3.0: Inverse Cubic Law (Standard "Fat Tail" financial market)
    // Alpha < 2.0: Levy Stable distribution (Infinite Variance) -> EXTREME DANGER

    if (tailIndex < 2.0) {
      // Extreme Danger: Cap leverage at 1x or 2x max (hard cap)
      safeLeverage = Math.min(safeLeverage, 2.0);
    } else if (tailIndex < riskConfig.tailIndexThreshold) {
      // Heavy Tails: Penalize leverage by fatTailBuffer percentage
      safeLeverage = safeLeverage * (1.0 - riskConfig.fatTailBuffer);
    } else if (tailIndex > 3.5) {
      // Thinner Tails: Potentially allow slightly higher usage of base leverage
      // (But usually we just stick to base as safe maximum)
      // No action needed
    }

    // 2. Global Safety Cap based on Config/Env

    return Math.floor(safeLeverage * 100) / 100;
  }

  /**
   * Calculates the Position Size Multiplier (0.0 to 1.0).
   * Used to scale down order sizes in high volatility or heavy tail regimes.
   */
  public getPositionSizeMultiplier(): number {
    const { volatilityRegime, tailIndex } = this.state;
    // eslint-disable-next-line functional/no-let
    let multiplier = 1.0;

    // 1. Volatility Regime Penalty
    switch (volatilityRegime) {
      case 'EXTREME':
        multiplier = 0.25; // Quarter size
        break;
      case 'HIGH':
        multiplier = 0.5; // Half size
        break;
      case 'LOW':
        // In low vol, we might actually want to size UP (if strategy allows),
        // but for safety we stick to 1.0 logic here or let strategy handle it.
        multiplier = 1.0;
        break;
      case 'NORMAL':
      default:
        multiplier = 1.0;
    }

    // 2. Tail Index Penalty (Cumulative)
    if (tailIndex < 2.2) {
      multiplier *= 0.5; // Additional 50% cut if tails are super fat
    }

    return multiplier;
  }

  /**
   * Checks if a proposed order size violates the Impact Budget.
   * @param estimatedImpactBps Impact estimated by SquareRootLaw
   */
  public isImpactAllowed(estimatedImpactBps: number): boolean {
    // Use either the state override (if we had one) or the config default
    // For now, let's strictly use config for the budget
    const riskConfig = this.config.risk;
    return estimatedImpactBps <= riskConfig.maxImpactBps;
  }

  public getCurrentState(): RiskState {
    return { ...this.state };
  }
}
