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
 * Requirements: 16.1-16.2 - Migrate calculators to Execution Service
 */

export class PositionSizeCalculator {
  /**
   * Calculate position size using Kelly Criterion
   * @param {Object} params - Position sizing parameters
   * @param {number} params.equity - Current account equity in USD
   * @param {number} params.confidence - Signal confidence (80-95)
   * @param {number} params.leverage - Suggested leverage (10-20)
   * @param {number} params.stopLossPercent - Stop loss as decimal (e.g., 0.01 = 1%)
   * @param {number} params.targetPercent - Target as decimal (e.g., 0.03 = 3%)
   * @param {number} params.maxPositionSizePercent - Max position size as decimal
   * @returns {number} Position size in USD
   */
  static calcPositionSize(params) {
    const {
      equity,
      confidence,
      leverage,
      stopLossPercent,
      targetPercent,
      maxPositionSizePercent,
    } = params;
    
    // Validate inputs
    if (equity <= 0) return 0;
    if (confidence <= 0 || confidence > 100) return 0;
    if (stopLossPercent <= 0 || targetPercent <= 0) return 0;
    if (leverage <= 0) return 0;
    
    // Convert confidence to win probability
    const winProbability = confidence / 100;
    
    // Calculate reward-to-risk ratio
    const rewardToRisk = targetPercent / stopLossPercent;
    if (rewardToRisk === 0) return 0;
    
    // Kelly Criterion: Kelly% = W - ((1-W) / R)
    const kellyPercent = winProbability - ((1 - winProbability) / rewardToRisk);
    
    // Apply 25% safety factor (Quarter-Kelly)
    const safeKellyPercent = kellyPercent * 0.25;
    const finalKellyPercent = Math.max(0, safeKellyPercent);
    
    // Calculate position size in USD
    let positionSize = equity * finalKellyPercent;
    
    // Cap at max position size from config
    const maxPositionSize = equity * maxPositionSizePercent;
    positionSize = Math.min(positionSize, maxPositionSize);
    
    return Math.round(positionSize * 100) / 100;
  }
  
  /**
   * Calculate position size with leverage adjustment
   * @param {Object} params - Position sizing parameters
   * @returns {{marginRequired: number, notionalSize: number}} Position sizes
   */
  static calcPositionSizeWithLeverage(params) {
    const marginRequired = this.calcPositionSize(params);
    const notionalSize = marginRequired * params.leverage;
    
    return { marginRequired, notionalSize };
  }
  
  /**
   * Calculate position size in units (contracts/coins)
   * @param {Object} params - Position sizing parameters
   * @param {number} currentPrice - Current asset price
   * @returns {number} Position size in units
   */
  static calcPositionSizeInUnits(params, currentPrice) {
    if (currentPrice <= 0) return 0;
    
    const { notionalSize } = this.calcPositionSizeWithLeverage(params);
    const units = notionalSize / currentPrice;
    
    return Math.round(units * 100000000) / 100000000;
  }
  
  /**
   * Get Kelly percentage (before safety factor)
   * @param {number} confidence - Signal confidence (80-95)
   * @param {number} stopLossPercent - Stop loss as decimal
   * @param {number} targetPercent - Target as decimal
   * @returns {number} Raw Kelly percentage
   */
  static getKellyPercent(confidence, stopLossPercent, targetPercent) {
    if (confidence <= 0 || confidence > 100) return 0;
    if (stopLossPercent <= 0 || targetPercent <= 0) return 0;
    
    const winProbability = confidence / 100;
    const rewardToRisk = targetPercent / stopLossPercent;
    if (rewardToRisk === 0) return 0;
    
    const kellyPercent = winProbability - ((1 - winProbability) / rewardToRisk);
    return Math.max(0, kellyPercent);
  }
  
  /**
   * Get safe Kelly percentage (after 25% safety factor)
   * @param {number} confidence - Signal confidence (80-95)
   * @param {number} stopLossPercent - Stop loss as decimal
   * @param {number} targetPercent - Target as decimal
   * @returns {number} Safe Kelly percentage
   */
  static getSafeKellyPercent(confidence, stopLossPercent, targetPercent) {
    return this.getKellyPercent(confidence, stopLossPercent, targetPercent) * 0.25;
  }
}

export default PositionSizeCalculator;
