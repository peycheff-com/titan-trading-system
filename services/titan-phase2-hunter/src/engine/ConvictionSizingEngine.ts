/**
 * ConvictionSizingEngine - Conviction-Based Position Sizing
 *
 * Implements multi-factor position sizing based on conviction from
 * Oracle, Flow, BotTrap, and Global CVD enhancement layers.
 *
 * Requirements:
 * - 7.1: Multi-factor position size calculation
 * - 7.2: Conviction multiplier application logic
 * - 7.3: Position size capping
 * - 7.4: Conservative selection when factors conflict
 * - 7.5: Maximum multiplier cap of 2.0x
 * - 7.6: Use most conservative multiplier on conflicts
 * - 7.7: Position sizing calculation logging
 */

import { EventEmitter } from "events";
import {
  BotTrapAnalysis,
  ConvictionSizing,
  FlowValidation,
  GlobalCVDData,
  OracleScore,
  TrapRecommendation,
} from "../types";

/**
 * Position sizing configuration
 */
export interface ConvictionSizingConfig {
  basePositionSize: number; // Base position size in USD
  maxMultiplier: number; // Maximum total multiplier (default: 2.0)
  minMultiplier: number; // Minimum multiplier floor (default: 0.25)
  oracleWeight: number; // Oracle multiplier weight (default: 1.0)
  flowWeight: number; // Flow multiplier weight (default: 1.0)
  globalCVDWeight: number; // Global CVD multiplier weight (default: 1.0)
  eventRiskMaxReduction: number; // Max reduction for high-impact events (default: 0.5)
  eventProximityMinutes: number; // Minutes window for event risk (default: 60)
  useConservativeSelection: boolean; // Use most conservative on conflicts
  enableLogging: boolean; // Enable detailed logging
}

/**
 * Multiplier calculation result
 */
export interface MultiplierResult {
  multiplier: number;
  source: string;
  confidence: number;
  reasoning: string;
}

/**
 * Default configuration
 */
export const DEFAULT_CONVICTION_SIZING_CONFIG: ConvictionSizingConfig = {
  basePositionSize: 1000,
  maxMultiplier: 2.0,
  minMultiplier: 0.25,
  oracleWeight: 1.0,
  flowWeight: 1.0,
  globalCVDWeight: 1.0,
  eventRiskMaxReduction: 0.5,
  eventProximityMinutes: 60,
  useConservativeSelection: true,
  enableLogging: true,
};

/**
 * ConvictionSizingEngine - Multi-factor position sizing
 *
 * Requirements 7.1-7.7: Conviction-based position sizing with multiplier capping
 */
export class ConvictionSizingEngine extends EventEmitter {
  private config: ConvictionSizingConfig;

  constructor(config: Partial<ConvictionSizingConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONVICTION_SIZING_CONFIG, ...config };
  }

  /**
   * Calculate conviction-based position size
   * Requirement 7.1: Multi-factor position size calculation
   */
  calculatePositionSize(
    baseSize: number,
    oracleScore: OracleScore | null,
    flowValidation: FlowValidation | null,
    botTrapAnalysis: BotTrapAnalysis | null,
    globalCVD: GlobalCVDData | null,
  ): ConvictionSizing {
    const reasoning: string[] = [];
    const multipliers: MultiplierResult[] = [];

    // Calculate Oracle multiplier
    const oracleMultiplier = this.calculateOracleMultiplier(oracleScore);
    // eslint-disable-next-line functional/immutable-data
    multipliers.push(oracleMultiplier);
    if (oracleMultiplier.multiplier !== 1.0) {
      // eslint-disable-next-line functional/immutable-data
      reasoning.push(oracleMultiplier.reasoning);
    }

    // Calculate Flow multiplier
    const flowMultiplier = this.calculateFlowMultiplier(flowValidation);
    // eslint-disable-next-line functional/immutable-data
    multipliers.push(flowMultiplier);
    if (flowMultiplier.multiplier !== 1.0) {
      // eslint-disable-next-line functional/immutable-data
      reasoning.push(flowMultiplier.reasoning);
    }

    // Calculate Bot Trap reduction
    const trapReduction = this.calculateTrapReduction(botTrapAnalysis);
    if (trapReduction < 1.0) {
      // eslint-disable-next-line functional/immutable-data
      reasoning.push(
        `Bot trap reduction: ${((1 - trapReduction) * 100).toFixed(0)}%`,
      );
    }

    // Calculate Global CVD multiplier
    const globalCVDMultiplier = this.calculateGlobalCVDMultiplier(globalCVD);
    // eslint-disable-next-line functional/immutable-data
    multipliers.push(globalCVDMultiplier);
    if (globalCVDMultiplier.multiplier !== 1.0) {
      // eslint-disable-next-line functional/immutable-data
      reasoning.push(globalCVDMultiplier.reasoning);
    }

    // Calculate Event Risk Multiplier (Task 11.3)
    const eventRiskMultiplier = this.calculateEventRiskMultiplier(oracleScore);
    // eslint-disable-next-line functional/immutable-data
    multipliers.push(eventRiskMultiplier); // It acts as a multiplier < 1.0
    if (eventRiskMultiplier.multiplier !== 1.0) {
      // eslint-disable-next-line functional/immutable-data
      reasoning.push(eventRiskMultiplier.reasoning);
    }

    // Combine multipliers based on configuration
    // eslint-disable-next-line functional/no-let
    let combinedMultiplier: number;

    if (this.config.useConservativeSelection) {
      // Requirement 7.6: Use most conservative multiplier on conflicts
      combinedMultiplier = this.selectConservativeMultiplier(
        multipliers,
        trapReduction,
      );
      // eslint-disable-next-line functional/immutable-data
      reasoning.push("Using conservative multiplier selection");
    } else {
      // Average the multipliers
      combinedMultiplier = this.averageMultipliers(multipliers, trapReduction);
    }

    // Requirement 7.5: Cap at maximum multiplier (2.0x)
    const cappedMultiplier = Math.min(
      combinedMultiplier,
      this.config.maxMultiplier,
    );
    if (combinedMultiplier > this.config.maxMultiplier) {
      // eslint-disable-next-line functional/immutable-data
      reasoning.push(
        `Multiplier capped from ${
          combinedMultiplier.toFixed(2)
        }x to ${this.config.maxMultiplier}x`,
      );
    }

    // Apply minimum floor
    const finalMultiplier = Math.max(
      cappedMultiplier,
      this.config.minMultiplier,
    );
    if (cappedMultiplier < this.config.minMultiplier) {
      // eslint-disable-next-line functional/immutable-data
      reasoning.push(
        `Multiplier floored from ${
          cappedMultiplier.toFixed(2)
        }x to ${this.config.minMultiplier}x`,
      );
    }

    // Calculate final size
    const finalSize = baseSize * finalMultiplier;

    const result: ConvictionSizing = {
      baseSize,
      oracleMultiplier: oracleMultiplier.multiplier,
      flowMultiplier: flowMultiplier.multiplier,
      trapReduction,
      globalCVDMultiplier: globalCVDMultiplier.multiplier,
      eventRiskMultiplier: eventRiskMultiplier.multiplier,
      finalSize: Math.round(finalSize * 100) / 100,
      cappedAt: this.config.maxMultiplier,
      reasoning,
    };

    // Requirement 7.7: Log position sizing calculation
    if (this.config.enableLogging) {
      this.logSizingCalculation(result);
    }

    this.emit("sizingCalculated", result);
    return result;
  }

  /**
   * Calculate Oracle multiplier
   * Requirements 7.2: Conviction multiplier application logic
   */
  private calculateOracleMultiplier(
    oracleScore: OracleScore | null,
  ): MultiplierResult {
    if (!oracleScore) {
      return {
        multiplier: 1.0,
        source: "oracle",
        confidence: 0,
        reasoning: "No Oracle data available",
      };
    }

    // Use Oracle's conviction multiplier directly
    const multiplier = oracleScore.convictionMultiplier;

    return {
      multiplier: multiplier * this.config.oracleWeight,
      source: "oracle",
      confidence: oracleScore.confidence,
      reasoning: `Oracle conviction: ${
        multiplier.toFixed(
          2,
        )
      }x (sentiment: ${oracleScore.sentiment})`,
    };
  }

  /**
   * Calculate Flow multiplier
   */
  private calculateFlowMultiplier(
    flowValidation: FlowValidation | null,
  ): MultiplierResult {
    if (!flowValidation) {
      return {
        multiplier: 1.0,
        source: "flow",
        confidence: 0,
        reasoning: "No Flow validation data available",
      };
    }

    // eslint-disable-next-line functional/no-let
    let multiplier = 1.0;
    // eslint-disable-next-line functional/no-let
    let reasoning = "";

    // Institutional flow detection boosts confidence
    if (
      flowValidation.flowType === "passive_absorption" &&
      flowValidation.institutionalProbability >= 70
    ) {
      multiplier = 1.3;
      reasoning = `Institutional absorption detected (${
        flowValidation.institutionalProbability.toFixed(
          0,
        )
      }% probability)`;
    } else if (flowValidation.flowType === "aggressive_pushing") {
      multiplier = 0.8;
      reasoning = `Aggressive pushing detected - reducing size`;
    } else if (!flowValidation.isValid) {
      multiplier = 0.7;
      reasoning = `Flow validation failed - reducing size`;
    } else {
      reasoning = `Flow neutral (${flowValidation.flowType})`;
    }

    // Weight by confidence
    const confidenceWeight = flowValidation.confidence / 100;
    const weightedMultiplier = 1.0 + (multiplier - 1.0) * confidenceWeight;

    return {
      multiplier: weightedMultiplier * this.config.flowWeight,
      source: "flow",
      confidence: flowValidation.confidence,
      reasoning,
    };
  }

  /**
   * Calculate Bot Trap reduction
   * Requirement 3.5: Reduce position size by 50% for SUSPECT_TRAP
   */
  private calculateTrapReduction(
    botTrapAnalysis: BotTrapAnalysis | null,
  ): number {
    if (!botTrapAnalysis || !botTrapAnalysis.isSuspect) {
      return 1.0; // No reduction
    }

    // Get the most restrictive recommendation
    // eslint-disable-next-line functional/no-let
    let minMultiplier = 1.0;

    for (const recommendation of botTrapAnalysis.recommendations) {
      if (recommendation.adjustments.positionSizeMultiplier < minMultiplier) {
        minMultiplier = recommendation.adjustments.positionSizeMultiplier;
      }
    }

    // Scale by suspicion score
    const suspicionWeight = botTrapAnalysis.suspicionScore / 100;
    const reduction = 1.0 - (1.0 - minMultiplier) * suspicionWeight;

    return Math.max(0.25, reduction); // Floor at 25%
  }

  /**
   * Calculate Global CVD multiplier
   */
  private calculateGlobalCVDMultiplier(
    globalCVD: GlobalCVDData | null,
  ): MultiplierResult {
    if (!globalCVD) {
      return {
        multiplier: 1.0,
        source: "globalCVD",
        confidence: 0,
        reasoning: "No Global CVD data available",
      };
    }

    // eslint-disable-next-line functional/no-let
    let multiplier = 1.0;
    // eslint-disable-next-line functional/no-let
    let reasoning = "";

    // Consensus-based multiplier
    switch (globalCVD.consensus) {
      case "bullish":
      case "bearish":
        multiplier = 1.2;
        reasoning = `Strong ${globalCVD.consensus} consensus across exchanges`;
        break;
      case "conflicted":
        multiplier = 0.7;
        reasoning = "Conflicting signals across exchanges - reducing size";
        break;
      default:
        reasoning = "Neutral Global CVD consensus";
    }

    // Manipulation detection penalty
    if (globalCVD.manipulation.detected) {
      multiplier *= 0.6;
      reasoning +=
        ` (manipulation detected on ${globalCVD.manipulation.suspectExchange})`;
    }

    // Weight by confidence
    const confidenceWeight = globalCVD.confidence / 100;
    const weightedMultiplier = 1.0 + (multiplier - 1.0) * confidenceWeight;

    return {
      multiplier: weightedMultiplier * this.config.globalCVDWeight,
      source: "globalCVD",
      confidence: globalCVD.confidence,
      reasoning,
    };
  }

  /**
   * Calculate Event Risk Multiplier (Task 11.3)
   * Reduces position size if high-impact events are concluding soon.
   */
  private calculateEventRiskMultiplier(
    oracleScore: OracleScore | null,
  ): MultiplierResult {
    if (
      !oracleScore || !oracleScore.events || oracleScore.events.length === 0
    ) {
      return {
        multiplier: 1.0,
        source: "eventRisk",
        confidence: 0,
        reasoning: "No event risk data available",
      };
    }

    const now = Date.now();
    const proximityMs = this.config.eventProximityMinutes * 60 * 1000;
    // eslint-disable-next-line functional/no-let
    let minMultiplier = 1.0;
    const riskDescriptions: string[] = [];

    for (const event of oracleScore.events) {
      const timeToResolution = new Date(event.resolution).getTime() - now;

      // Only care about events resolving in the future within the window
      if (timeToResolution > 0 && timeToResolution <= proximityMs) {
        // eslint-disable-next-line functional/no-let
        let impactReduction = 0;

        if (event.impact === "extreme") {
          impactReduction = this.config.eventRiskMaxReduction; // 0.5 reduction (50%)
        } else if (event.impact === "high") {
          impactReduction = this.config.eventRiskMaxReduction * 0.5; // 0.25 reduction (25%)
        }

        if (impactReduction > 0) {
          const currentMult = 1.0 - impactReduction;
          if (currentMult < minMultiplier) {
            minMultiplier = currentMult;
          }
          // eslint-disable-next-line functional/immutable-data
          riskDescriptions.push(
            `${event.impact.toUpperCase()} impact event "${
              event.title.substring(
                0,
                20,
              )
            }..." resolving in ${(timeToResolution / 60000).toFixed(0)}m`,
          );
        }
      }
    }

    if (minMultiplier < 1.0) {
      return {
        multiplier: minMultiplier,
        source: "eventRisk",
        confidence: 100, // High confidence in the schedule
        reasoning: `Risk reduction due to imminent events: ${
          riskDescriptions.join(", ")
        }`,
      };
    }

    return {
      multiplier: 1.0,
      source: "eventRisk",
      confidence: 0,
      reasoning: "No imminent high-impact events",
    };
  }

  /**
   * Select most conservative multiplier
   * Requirement 7.6: Use most conservative multiplier on conflicts
   */
  private selectConservativeMultiplier(
    multipliers: MultiplierResult[],
    trapReduction: number,
  ): number {
    // Start with trap reduction as baseline
    // eslint-disable-next-line functional/no-let
    let minMultiplier = trapReduction;

    // Find the most conservative (lowest) multiplier
    for (const result of multipliers) {
      if (result.multiplier < minMultiplier && result.confidence >= 50) {
        minMultiplier = result.multiplier;
      }
    }

    // If all multipliers are above 1.0, use the lowest boost
    // If any multiplier is below 1.0, use the lowest reduction
    const boostMultipliers = multipliers.filter((m) =>
      m.multiplier > 1.0 && m.confidence >= 50
    );
    const reductionMultipliers = multipliers.filter((m) =>
      m.multiplier < 1.0 && m.confidence >= 50
    );

    if (reductionMultipliers.length > 0) {
      // Use the most conservative reduction
      return Math.min(
        minMultiplier,
        ...reductionMultipliers.map((m) => m.multiplier),
      );
    } else if (boostMultipliers.length > 0) {
      // Use the most conservative boost (lowest boost)
      return Math.min(...boostMultipliers.map((m) => m.multiplier)) *
        trapReduction;
    }

    return trapReduction;
  }

  /**
   * Average multipliers (alternative to conservative selection)
   */
  private averageMultipliers(
    multipliers: MultiplierResult[],
    trapReduction: number,
  ): number {
    const validMultipliers = multipliers.filter((m) => m.confidence >= 30);

    if (validMultipliers.length === 0) {
      return trapReduction;
    }

    // Weighted average by confidence
    // eslint-disable-next-line functional/no-let
    let totalWeight = 0;
    // eslint-disable-next-line functional/no-let
    let weightedSum = 0;

    for (const result of validMultipliers) {
      const weight = result.confidence / 100;
      weightedSum += result.multiplier * weight;
      totalWeight += weight;
    }

    const averageMultiplier = totalWeight > 0 ? weightedSum / totalWeight : 1.0;

    // Apply trap reduction
    return averageMultiplier * trapReduction;
  }

  /**
   * Log position sizing calculation
   * Requirement 7.7: Position sizing calculation logging
   */
  private logSizingCalculation(sizing: ConvictionSizing): void {
    console.log("📊 Position Sizing Calculation:");
    console.log(`   Base Size: $${sizing.baseSize.toFixed(2)}`);
    console.log(`   Oracle Multiplier: ${sizing.oracleMultiplier.toFixed(2)}x`);
    console.log(`   Flow Multiplier: ${sizing.flowMultiplier.toFixed(2)}x`);
    console.log(`   Trap Reduction: ${sizing.trapReduction.toFixed(2)}x`);
    console.log(
      `   Global CVD Multiplier: ${sizing.globalCVDMultiplier.toFixed(2)}x`,
    );
    console.log(
      `   Event Risk Multiplier: ${sizing.eventRiskMultiplier.toFixed(2)}x`,
    );
    console.log(`   Final Size: $${sizing.finalSize.toFixed(2)}`);
    console.log(`   Capped At: ${sizing.cappedAt}x`);

    if (sizing.reasoning.length > 0) {
      console.log("   Reasoning:");
      for (const reason of sizing.reasoning) {
        console.log(`     - ${reason}`);
      }
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ConvictionSizingConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...config };
    this.emit("configUpdated", this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): ConvictionSizingConfig {
    return { ...this.config };
  }
}
