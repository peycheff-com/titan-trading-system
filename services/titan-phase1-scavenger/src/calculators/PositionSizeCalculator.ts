/**
 * PositionSizeCalculator - Kelly Criterion Position Sizing
 *
 * Calculates optimal position size using Kelly Criterion with safety factor.
 * Formula: Kelly% = (confidence/100) - ((1 - confidence/100) / R:R)
 *
 * Safety measures:
 * - 25% safety factor (Quarter-Kelly)
 * - Cap at max position size from config
 * - Returns position size in USD
 *
 * Requirements: 4.6 (Position Sizing)
 */

export interface PositionSizeParams {
  equity: number; // Current account equity in USD
  confidence: number; // Signal confidence (80-95)
  leverage: number; // Suggested leverage (10-20)
  stopLossPercent: number; // Stop loss as decimal (e.g., 0.01 = 1%)
  targetPercent: number; // Target as decimal (e.g., 0.03 = 3%)
  maxPositionSizePercent: number; // Max position size as decimal (e.g., 0.5 = 50%)
}

export class PositionSizeCalculator {
  /**
   * Calculate position size using Kelly Criterion
   *
   * @param params - Position sizing parameters
   * @returns Position size in USD
   *
   * Kelly Formula:
   * Kelly% = W - ((1-W) / R)
   * Where:
   * - W = Win probability (confidence / 100)
   * - R = Reward-to-Risk ratio (targetPercent / stopLossPercent)
   *
   * Safety Factor:
   * - Apply 25% safety factor (Quarter-Kelly)
   * - This reduces risk of ruin while maintaining growth
   *
   * Example:
   * - Equity: $1000
   * - Confidence: 90% (0.90 win rate)
   * - Stop: 1% (0.01)
   * - Target: 3% (0.03)
   * - R:R = 3:1
   * - Kelly% = 0.90 - ((1-0.90) / 3) = 0.90 - 0.0333 = 0.8667 (86.67%)
   * - Quarter-Kelly = 0.8667 * 0.25 = 0.2167 (21.67%)
   * - Position Size = $1000 * 0.2167 = $216.70
   */
  static calcPositionSize(params: PositionSizeParams): number {
    const { equity, confidence, leverage, stopLossPercent, targetPercent, maxPositionSizePercent } =
      params;

    // Validate inputs
    if (equity <= 0) {
      return 0;
    }

    if (confidence <= 0 || confidence > 100) {
      return 0;
    }

    if (stopLossPercent <= 0 || targetPercent <= 0) {
      return 0;
    }

    if (leverage <= 0) {
      return 0;
    }

    // Convert confidence to win probability
    const winProbability = confidence / 100;

    // Calculate reward-to-risk ratio
    const rewardToRisk = targetPercent / stopLossPercent;

    // Avoid division by zero
    if (rewardToRisk === 0) {
      return 0;
    }

    // Kelly Criterion: Kelly% = W - ((1-W) / R)
    const kellyPercent = winProbability - (1 - winProbability) / rewardToRisk;

    // Apply 25% safety factor (Quarter-Kelly)
    const safeKellyPercent = kellyPercent * 0.25;

    // Ensure non-negative
    const finalKellyPercent = Math.max(0, safeKellyPercent);

    // Calculate position size in USD
    // eslint-disable-next-line functional/no-let
    let positionSize = equity * finalKellyPercent;

    // Cap at max position size from config
    const maxPositionSize = equity * maxPositionSizePercent;
    positionSize = Math.min(positionSize, maxPositionSize);

    // Round to 2 decimal places
    return Math.round(positionSize * 100) / 100;
  }

  /**
   * Calculate position size with leverage adjustment
   *
   * This method accounts for leverage when calculating position size.
   * With leverage, you can control a larger position with less capital.
   *
   * @param params - Position sizing parameters
   * @returns Position size in USD (notional value)
   *
   * Example:
   * - Base position size: $200
   * - Leverage: 10x
   * - Notional position: $200 * 10 = $2000
   * - Margin required: $200
   */
  static calcPositionSizeWithLeverage(params: PositionSizeParams): {
    marginRequired: number;
    notionalSize: number;
  } {
    // Calculate base position size (margin required)
    const marginRequired = this.calcPositionSize(params);

    // Calculate notional position size with leverage
    const notionalSize = marginRequired * params.leverage;

    return {
      marginRequired,
      notionalSize,
    };
  }

  /**
   * Calculate position size in units (contracts/coins)
   *
   * @param params - Position sizing parameters
   * @param currentPrice - Current asset price
   * @returns Position size in units
   *
   * Example:
   * - Position size: $2000
   * - BTC price: $50,000
   * - Units: $2000 / $50,000 = 0.04 BTC
   */
  static calcPositionSizeInUnits(params: PositionSizeParams, currentPrice: number): number {
    if (currentPrice <= 0) {
      return 0;
    }

    const { notionalSize } = this.calcPositionSizeWithLeverage(params);
    const units = notionalSize / currentPrice;

    // Round to 8 decimal places (crypto standard)
    return Math.round(units * 100000000) / 100000000;
  }

  /**
   * Get Kelly percentage (before safety factor)
   * Useful for debugging and analysis
   *
   * @param confidence - Signal confidence (80-95)
   * @param stopLossPercent - Stop loss as decimal
   * @param targetPercent - Target as decimal
   * @returns Raw Kelly percentage (before safety factor)
   */
  static getKellyPercent(
    confidence: number,
    stopLossPercent: number,
    targetPercent: number,
  ): number {
    if (confidence <= 0 || confidence > 100) {
      return 0;
    }

    if (stopLossPercent <= 0 || targetPercent <= 0) {
      return 0;
    }

    const winProbability = confidence / 100;
    const rewardToRisk = targetPercent / stopLossPercent;

    if (rewardToRisk === 0) {
      return 0;
    }

    const kellyPercent = winProbability - (1 - winProbability) / rewardToRisk;

    return Math.max(0, kellyPercent);
  }

  /**
   * Get safe Kelly percentage (after 25% safety factor)
   *
   * @param confidence - Signal confidence (80-95)
   * @param stopLossPercent - Stop loss as decimal
   * @param targetPercent - Target as decimal
   * @returns Safe Kelly percentage (Quarter-Kelly)
   */
  static getSafeKellyPercent(
    confidence: number,
    stopLossPercent: number,
    targetPercent: number,
  ): number {
    const kellyPercent = this.getKellyPercent(confidence, stopLossPercent, targetPercent);
    return kellyPercent * 0.25;
  }
}
