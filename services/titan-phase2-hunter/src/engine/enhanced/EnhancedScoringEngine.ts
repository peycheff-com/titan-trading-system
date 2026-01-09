/**
 * EnhancedScoringEngine - Enhanced Holographic Scoring with 2026 Enhancements
 *
 * Implements the enhanced scoring formula that combines classic Phase 2 scoring
 * with Oracle, Flow, BotTrap, and Global CVD enhancement layers.
 *
 * Requirements:
 * - 5.1: Enhanced scoring formula: Daily_Bias × 0.4 + 4H_Location × 0.25 + 15m_Flow × 0.15 + Oracle_Score × 0.2
 * - 5.2: Alignment classification with enhanced criteria
 * - 5.3: Extend existing holographic state with 2026 enhancement data
 */

import { EventEmitter } from "events";
import {
  BotTrapAnalysis,
  EnhancedHolographicState,
  FlowValidation,
  GlobalCVDData,
  OracleScore,
} from "../../types";
import { HologramState, HologramStatus } from "../../types";

/**
 * Scoring weights configuration
 */
export interface ScoringWeights {
  dailyBias: number; // Default: 0.40
  fourHourLocation: number; // Default: 0.25
  fifteenMinFlow: number; // Default: 0.15
  oracleScore: number; // Default: 0.20
}

/**
 * Enhanced scoring configuration
 */
export interface EnhancedScoringConfig {
  weights: ScoringWeights;
  alignmentThresholds: {
    aPlus: number; // Default: 80
    a: number; // Default: 70
    b: number; // Default: 60
    c: number; // Default: 50
  };
  vetoConditions: {
    oracleVetoEnabled: boolean;
    botTrapVetoEnabled: boolean;
    globalCVDVetoEnabled: boolean;
    flowVetoEnabled: boolean;
  };
}

/**
 * Scoring component breakdown
 */
export interface ScoringBreakdown {
  dailyBiasScore: number;
  fourHourLocationScore: number;
  fifteenMinFlowScore: number;
  oracleContribution: number;
  flowContribution: number;
  botTrapPenalty: number;
  globalCVDContribution: number;
  rawScore: number;
  adjustedScore: number;
  reasoning: string[];
}

/**
 * Default configuration
 */
export const DEFAULT_SCORING_CONFIG: EnhancedScoringConfig = {
  weights: {
    dailyBias: 0.40,
    fourHourLocation: 0.25,
    fifteenMinFlow: 0.15,
    oracleScore: 0.20,
  },
  alignmentThresholds: {
    aPlus: 80,
    a: 70,
    b: 60,
    c: 50,
  },
  vetoConditions: {
    oracleVetoEnabled: true,
    botTrapVetoEnabled: true,
    globalCVDVetoEnabled: true,
    flowVetoEnabled: true,
  },
};

/**
 * EnhancedScoringEngine - Calculates enhanced holographic scores
 *
 * Requirement 5.1: Enhanced scoring formula with Oracle, Flow, BotTrap, and Global CVD
 */
export class EnhancedScoringEngine extends EventEmitter {
  private config: EnhancedScoringConfig;

  constructor(config: Partial<EnhancedScoringConfig> = {}) {
    super();
    this.config = {
      ...DEFAULT_SCORING_CONFIG,
      ...config,
      weights: { ...DEFAULT_SCORING_CONFIG.weights, ...config.weights },
      alignmentThresholds: {
        ...DEFAULT_SCORING_CONFIG.alignmentThresholds,
        ...config.alignmentThresholds,
      },
      vetoConditions: {
        ...DEFAULT_SCORING_CONFIG.vetoConditions,
        ...config.vetoConditions,
      },
    };
  }

  /**
   * Calculate enhanced holographic score
   * Requirement 5.1: Enhanced scoring formula
   */
  calculateEnhancedScore(
    classicHologram: HologramState,
    oracleScore: OracleScore | null,
    flowValidation: FlowValidation | null,
    botTrapAnalysis: BotTrapAnalysis | null,
    globalCVD: GlobalCVDData | null,
  ): ScoringBreakdown {
    const reasoning: string[] = [];

    // Calculate classic component scores (0-100 scale)
    const dailyBiasScore = this.calculateDailyBiasScore(classicHologram);
    const fourHourLocationScore = this.calculateFourHourLocationScore(
      classicHologram,
    );
    const fifteenMinFlowScore = this.calculateFifteenMinFlowScore(
      classicHologram,
    );

    // Calculate Oracle contribution (0-100 scale, can be negative for conflicts)
    const oracleContribution = this.calculateOracleContribution(oracleScore);

    // Calculate Flow contribution (0-100 scale)
    const flowContribution = this.calculateFlowContribution(flowValidation);

    // Calculate Bot Trap penalty (0-50 scale, reduces score)
    const botTrapPenalty = this.calculateBotTrapPenalty(botTrapAnalysis);

    // Calculate Global CVD contribution (0-100 scale)
    const globalCVDContribution = this.calculateGlobalCVDContribution(
      globalCVD,
    );

    // Apply weighted formula (Requirement 5.1)
    // Enhanced Score = Daily_Bias × 0.4 + 4H_Location × 0.25 + 15m_Flow × 0.15 + Oracle_Score × 0.2
    const { weights } = this.config;

    let rawScore = dailyBiasScore * weights.dailyBias +
      fourHourLocationScore * weights.fourHourLocation +
      fifteenMinFlowScore * weights.fifteenMinFlow +
      oracleContribution * weights.oracleScore;

    reasoning.push(
      `Base score: ${rawScore.toFixed(1)} (Daily: ${
        dailyBiasScore.toFixed(0)
      }, 4H: ${fourHourLocationScore.toFixed(0)}, 15m: ${
        fifteenMinFlowScore.toFixed(0)
      }, Oracle: ${oracleContribution.toFixed(0)})`,
    );

    // Apply enhancement adjustments
    let adjustedScore = rawScore;

    // Flow validation bonus/penalty
    if (flowValidation) {
      const flowAdjustment = (flowContribution - 50) * 0.1; // ±5 points max
      adjustedScore += flowAdjustment;
      if (flowAdjustment !== 0) {
        reasoning.push(
          `Flow adjustment: ${flowAdjustment > 0 ? "+" : ""}${
            flowAdjustment.toFixed(1)
          } (${flowValidation.flowType})`,
        );
      }
    }

    // Bot trap penalty
    if (botTrapPenalty > 0) {
      adjustedScore -= botTrapPenalty;
      reasoning.push(`Bot trap penalty: -${botTrapPenalty.toFixed(1)}`);
    }

    // Global CVD bonus/penalty
    if (globalCVD) {
      const cvdAdjustment = (globalCVDContribution - 50) * 0.1; // ±5 points max
      adjustedScore += cvdAdjustment;
      if (cvdAdjustment !== 0) {
        reasoning.push(
          `Global CVD adjustment: ${cvdAdjustment > 0 ? "+" : ""}${
            cvdAdjustment.toFixed(1)
          } (${globalCVD.consensus})`,
        );
      }
    }

    // Clamp to 0-100 range
    adjustedScore = Math.max(0, Math.min(100, adjustedScore));

    return {
      dailyBiasScore,
      fourHourLocationScore,
      fifteenMinFlowScore,
      oracleContribution,
      flowContribution,
      botTrapPenalty,
      globalCVDContribution,
      rawScore,
      adjustedScore,
      reasoning,
    };
  }

  /**
   * Calculate daily bias score (0-100)
   */
  private calculateDailyBiasScore(hologram: HologramState): number {
    const { daily } = hologram;

    // Strong trend = 100, Range = 50
    if (daily.trend === "BULL" || daily.trend === "BEAR") {
      return 100;
    }
    return 50; // RANGE
  }

  /**
   * Calculate 4H location score (0-100)
   */
  private calculateFourHourLocationScore(hologram: HologramState): number {
    const { h4, daily } = hologram;

    // Score based on alignment with daily bias
    if (daily.trend === "BULL") {
      // For bullish bias, DISCOUNT is best (100), EQUILIBRIUM is okay (70), PREMIUM is bad (30)
      if (h4.location === "DISCOUNT") return 100;
      if (h4.location === "EQUILIBRIUM") return 70;
      return 30; // PREMIUM
    } else if (daily.trend === "BEAR") {
      // For bearish bias, PREMIUM is best (100), EQUILIBRIUM is okay (70), DISCOUNT is bad (30)
      if (h4.location === "PREMIUM") return 100;
      if (h4.location === "EQUILIBRIUM") return 70;
      return 30; // DISCOUNT
    }

    // RANGE - equilibrium is best
    if (h4.location === "EQUILIBRIUM") return 80;
    return 50;
  }

  /**
   * Calculate 15m flow score (0-100)
   */
  private calculateFifteenMinFlowScore(hologram: HologramState): number {
    const { m15, daily } = hologram;

    // MSS confirmation is key
    let score = 50; // Base score

    // MSS confirmation adds 30 points
    if (m15.mss !== null) {
      score += 30;
    }

    // Trend alignment adds 20 points
    if (m15.trend === daily.trend && daily.trend !== "RANGE") {
      score += 20;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate Oracle contribution (0-100, centered at 50)
   */
  private calculateOracleContribution(oracleScore: OracleScore | null): number {
    if (!oracleScore) return 50; // Neutral if no Oracle data

    // Convert sentiment (-100 to +100) to score (0 to 100)
    // Sentiment 0 = Score 50
    // Sentiment +100 = Score 100
    // Sentiment -100 = Score 0
    const score = 50 + (oracleScore.sentiment / 2);

    // Weight by confidence
    const confidenceWeight = oracleScore.confidence / 100;
    const weightedScore = 50 + (score - 50) * confidenceWeight;

    return Math.max(0, Math.min(100, weightedScore));
  }

  /**
   * Calculate Flow contribution (0-100)
   */
  private calculateFlowContribution(
    flowValidation: FlowValidation | null,
  ): number {
    if (!flowValidation) return 50; // Neutral if no flow data

    let score = 50;

    // Flow type contribution
    if (flowValidation.flowType === "passive_absorption") {
      score += 25; // Bullish institutional flow
    } else if (flowValidation.flowType === "aggressive_pushing") {
      score -= 15; // Potentially bearish
    }

    // Institutional probability contribution
    score += (flowValidation.institutionalProbability - 50) * 0.3;

    // Confidence weighting
    const confidenceWeight = flowValidation.confidence / 100;
    score = 50 + (score - 50) * confidenceWeight;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate Bot Trap penalty (0-50)
   */
  private calculateBotTrapPenalty(
    botTrapAnalysis: BotTrapAnalysis | null,
  ): number {
    if (!botTrapAnalysis || !botTrapAnalysis.isSuspect) return 0;

    // Penalty based on suspicion score
    // Max penalty of 50 points for 100% suspicion
    return (botTrapAnalysis.suspicionScore / 100) * 50;
  }

  /**
   * Calculate Global CVD contribution (0-100)
   */
  private calculateGlobalCVDContribution(
    globalCVD: GlobalCVDData | null,
  ): number {
    if (!globalCVD) return 50; // Neutral if no Global CVD data

    let score = 50;

    // Consensus contribution
    switch (globalCVD.consensus) {
      case "bullish":
        score += 25;
        break;
      case "bearish":
        score -= 25;
        break;
      case "conflicted":
        score -= 10; // Slight penalty for conflicting signals
        break;
        // 'neutral' stays at 50
    }

    // Manipulation detection penalty
    if (globalCVD.manipulation.detected) {
      score -= 20;
    }

    // Confidence weighting
    const confidenceWeight = globalCVD.confidence / 100;
    score = 50 + (score - 50) * confidenceWeight;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Determine alignment classification
   * Requirement 5.2: Alignment classification with enhanced criteria
   */
  determineAlignment(
    score: number,
    oracleScore: OracleScore | null,
    botTrapAnalysis: BotTrapAnalysis | null,
    globalCVD: GlobalCVDData | null,
    flowValidation: FlowValidation | null,
  ): "A+" | "A" | "B" | "C" | "VETO" {
    const { alignmentThresholds, vetoConditions } = this.config;

    // Check veto conditions first
    if (vetoConditions.oracleVetoEnabled && oracleScore?.veto) {
      return "VETO";
    }

    if (
      vetoConditions.botTrapVetoEnabled && botTrapAnalysis?.isSuspect &&
      botTrapAnalysis.suspicionScore >= 80
    ) {
      return "VETO";
    }

    if (
      vetoConditions.globalCVDVetoEnabled && globalCVD?.manipulation.detected &&
      globalCVD.manipulation.divergenceScore >= 80
    ) {
      return "VETO";
    }

    if (
      vetoConditions.flowVetoEnabled && flowValidation &&
      !flowValidation.isValid && flowValidation.confidence >= 80
    ) {
      return "VETO";
    }

    // Determine alignment based on score
    if (score >= alignmentThresholds.aPlus) return "A+";
    if (score >= alignmentThresholds.a) return "A";
    if (score >= alignmentThresholds.b) return "B";
    if (score >= alignmentThresholds.c) return "C";

    return "VETO"; // Score too low
  }

  /**
   * Determine conviction level based on score and enhancements
   */
  determineConvictionLevel(
    score: number,
    oracleScore: OracleScore | null,
    globalCVD: GlobalCVDData | null,
  ): "low" | "medium" | "high" | "extreme" {
    // Base conviction from score
    let convictionPoints = 0;

    if (score >= 90) convictionPoints += 3;
    else if (score >= 80) convictionPoints += 2;
    else if (score >= 70) convictionPoints += 1;

    // Oracle alignment bonus
    if (
      oracleScore && Math.abs(oracleScore.sentiment) >= 60 &&
      oracleScore.confidence >= 70
    ) {
      convictionPoints += 1;
    }

    // Global CVD consensus bonus
    if (
      globalCVD &&
      (globalCVD.consensus === "bullish" ||
        globalCVD.consensus === "bearish") &&
      globalCVD.confidence >= 70
    ) {
      convictionPoints += 1;
    }

    // Map points to conviction level
    if (convictionPoints >= 4) return "extreme";
    if (convictionPoints >= 3) return "high";
    if (convictionPoints >= 2) return "medium";
    return "low";
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EnhancedScoringConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      weights: { ...this.config.weights, ...config.weights },
      alignmentThresholds: {
        ...this.config.alignmentThresholds,
        ...config.alignmentThresholds,
      },
      vetoConditions: {
        ...this.config.vetoConditions,
        ...config.vetoConditions,
      },
    };
    this.emit("configUpdated", this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): EnhancedScoringConfig {
    return { ...this.config };
  }
}
