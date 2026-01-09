/**
 * EnhancedSignalValidator - Enhanced Signal Validation Pipeline
 *
 * Integrates all enhancement layers into a unified signal validation
 * pipeline with conflict resolution and enhanced confidence calculation.
 *
 * Requirements:
 * - 5.4: Integrate all enhancement layers into signal validation
 * - 5.5: Create conflict resolution logic between enhancement layers
 * - 5.6: Add enhanced signal confidence calculation
 */

import { EventEmitter } from "events";
import {
  BotTrapAnalysis,
  EnhancedHolographicState,
  FlowValidation,
  GlobalCVDData,
  OracleScore,
  TechnicalSignal,
} from "../../types";
import { HologramState } from "../../types";

/**
 * Signal validation configuration
 */
export interface SignalValidatorConfig {
  requireOracleConfirmation: boolean;
  requireFlowConfirmation: boolean;
  requireGlobalCVDConfirmation: boolean;
  botTrapVetoEnabled: boolean;
  minConfidenceThreshold: number;
  conflictResolutionStrategy: "conservative" | "weighted" | "majority";
}

/**
 * Validation result for a single layer
 */
export interface LayerValidation {
  layer: "oracle" | "flow" | "botTrap" | "globalCVD";
  isValid: boolean;
  confidence: number;
  reasoning: string;
  recommendation: "proceed" | "caution" | "veto";
}

/**
 * Conflict analysis result
 */
export interface ConflictAnalysis {
  hasConflict: boolean;
  conflictingLayers: string[];
  resolution: "proceed" | "reduce" | "veto";
  reasoning: string;
}

/**
 * Enhanced signal validation result
 */
export interface EnhancedValidationResult {
  isValid: boolean;
  originalConfidence: number;
  adjustedConfidence: number;
  layerValidations: LayerValidation[];
  conflictAnalysis: ConflictAnalysis;
  recommendation: "proceed" | "proceed_cautiously" | "reduce_size" | "veto";
  reasoning: string[];
  timestamp: Date;
}

/**
 * Default configuration
 */
export const DEFAULT_SIGNAL_VALIDATOR_CONFIG: SignalValidatorConfig = {
  requireOracleConfirmation: false,
  requireFlowConfirmation: false,
  requireGlobalCVDConfirmation: true,
  botTrapVetoEnabled: true,
  minConfidenceThreshold: 50,
  conflictResolutionStrategy: "conservative",
};

/**
 * EnhancedSignalValidator - Unified signal validation pipeline
 *
 * Requirements 5.4-5.6: Enhanced signal validation with conflict resolution
 */
export class EnhancedSignalValidator extends EventEmitter {
  private config: SignalValidatorConfig;

  constructor(config: Partial<SignalValidatorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_SIGNAL_VALIDATOR_CONFIG, ...config };
  }

  /**
   * Validate a trading signal with all enhancement layers
   * Requirement 5.4: Integrate all enhancement layers into signal validation
   */
  validateSignal(
    signal: TechnicalSignal,
    oracleScore: OracleScore | null,
    flowValidation: FlowValidation | null,
    botTrapAnalysis: BotTrapAnalysis | null,
    globalCVD: GlobalCVDData | null,
  ): EnhancedValidationResult {
    const reasoning: string[] = [];
    const layerValidations: LayerValidation[] = [];

    // Validate each layer
    const oracleValidation = this.validateOracleLayer(signal, oracleScore);
    layerValidations.push(oracleValidation);

    const flowLayerValidation = this.validateFlowLayer(signal, flowValidation);
    layerValidations.push(flowLayerValidation);

    const botTrapValidation = this.validateBotTrapLayer(botTrapAnalysis);
    layerValidations.push(botTrapValidation);

    const globalCVDValidation = this.validateGlobalCVDLayer(signal, globalCVD);
    layerValidations.push(globalCVDValidation);

    // Analyze conflicts
    const conflictAnalysis = this.analyzeConflicts(layerValidations);
    if (conflictAnalysis.hasConflict) {
      reasoning.push(`Conflict detected: ${conflictAnalysis.reasoning}`);
    }

    // Calculate adjusted confidence
    const adjustedConfidence = this.calculateAdjustedConfidence(
      signal.confidence,
      layerValidations,
      conflictAnalysis,
    );

    // Determine final recommendation
    const recommendation = this.determineRecommendation(
      layerValidations,
      conflictAnalysis,
      adjustedConfidence,
    );

    // Build reasoning
    for (const validation of layerValidations) {
      if (validation.recommendation !== "proceed") {
        reasoning.push(`${validation.layer}: ${validation.reasoning}`);
      }
    }

    // Determine overall validity
    const isValid = recommendation !== "veto" &&
      adjustedConfidence >= this.config.minConfidenceThreshold;

    const result: EnhancedValidationResult = {
      isValid,
      originalConfidence: signal.confidence,
      adjustedConfidence,
      layerValidations,
      conflictAnalysis,
      recommendation,
      reasoning,
      timestamp: new Date(),
    };

    this.emit("signalValidated", result);
    return result;
  }

  /**
   * Validate Oracle layer
   */
  private validateOracleLayer(
    signal: TechnicalSignal,
    oracleScore: OracleScore | null,
  ): LayerValidation {
    if (!oracleScore) {
      return {
        layer: "oracle",
        isValid: !this.config.requireOracleConfirmation,
        confidence: 0,
        reasoning: "No Oracle data available",
        recommendation: this.config.requireOracleConfirmation
          ? "caution"
          : "proceed",
      };
    }

    // Check for veto
    if (oracleScore.veto) {
      return {
        layer: "oracle",
        isValid: false,
        confidence: oracleScore.confidence,
        reasoning: oracleScore.vetoReason || "Oracle veto triggered",
        recommendation: "veto",
      };
    }

    // Check alignment
    const isAligned = this.isOracleAligned(
      signal.direction,
      oracleScore.sentiment,
    );

    if (isAligned && oracleScore.sentiment >= 40) {
      return {
        layer: "oracle",
        isValid: true,
        confidence: oracleScore.confidence,
        reasoning: `Oracle aligned (sentiment: ${oracleScore.sentiment})`,
        recommendation: "proceed",
      };
    } else if (!isAligned && Math.abs(oracleScore.sentiment) >= 40) {
      return {
        layer: "oracle",
        isValid: false,
        confidence: oracleScore.confidence,
        reasoning: `Oracle conflicts (sentiment: ${oracleScore.sentiment})`,
        recommendation: "caution",
      };
    }

    return {
      layer: "oracle",
      isValid: true,
      confidence: oracleScore.confidence,
      reasoning: "Oracle neutral",
      recommendation: "proceed",
    };
  }

  /**
   * Validate Flow layer
   */
  private validateFlowLayer(
    signal: TechnicalSignal,
    flowValidation: FlowValidation | null,
  ): LayerValidation {
    if (!flowValidation) {
      return {
        layer: "flow",
        isValid: !this.config.requireFlowConfirmation,
        confidence: 0,
        reasoning: "No Flow validation data available",
        recommendation: this.config.requireFlowConfirmation
          ? "caution"
          : "proceed",
      };
    }

    if (!flowValidation.isValid) {
      return {
        layer: "flow",
        isValid: false,
        confidence: flowValidation.confidence,
        reasoning: `Flow validation failed (${flowValidation.flowType})`,
        recommendation: "caution",
      };
    }

    // Check for institutional flow alignment
    if (
      flowValidation.flowType === "passive_absorption" &&
      flowValidation.institutionalProbability >= 70
    ) {
      return {
        layer: "flow",
        isValid: true,
        confidence: flowValidation.confidence,
        reasoning: `Institutional absorption detected (${
          flowValidation.institutionalProbability.toFixed(0)
        }%)`,
        recommendation: "proceed",
      };
    }

    if (flowValidation.flowType === "aggressive_pushing") {
      return {
        layer: "flow",
        isValid: true,
        confidence: flowValidation.confidence,
        reasoning: "Aggressive pushing detected - proceed with caution",
        recommendation: "caution",
      };
    }

    return {
      layer: "flow",
      isValid: true,
      confidence: flowValidation.confidence,
      reasoning: `Flow validated (${flowValidation.flowType})`,
      recommendation: "proceed",
    };
  }

  /**
   * Validate Bot Trap layer
   */
  private validateBotTrapLayer(
    botTrapAnalysis: BotTrapAnalysis | null,
  ): LayerValidation {
    if (!botTrapAnalysis) {
      return {
        layer: "botTrap",
        isValid: true,
        confidence: 0,
        reasoning: "No Bot Trap analysis available",
        recommendation: "proceed",
      };
    }

    if (!botTrapAnalysis.isSuspect) {
      return {
        layer: "botTrap",
        isValid: true,
        confidence: 100 - botTrapAnalysis.suspicionScore,
        reasoning: "No bot trap detected",
        recommendation: "proceed",
      };
    }

    // Check suspicion level
    if (
      botTrapAnalysis.suspicionScore >= 80 && this.config.botTrapVetoEnabled
    ) {
      return {
        layer: "botTrap",
        isValid: false,
        confidence: 100 - botTrapAnalysis.suspicionScore,
        reasoning:
          `High bot trap suspicion (${botTrapAnalysis.suspicionScore}%)`,
        recommendation: "veto",
      };
    }

    if (botTrapAnalysis.suspicionScore >= 50) {
      return {
        layer: "botTrap",
        isValid: true,
        confidence: 100 - botTrapAnalysis.suspicionScore,
        reasoning:
          `Moderate bot trap suspicion (${botTrapAnalysis.suspicionScore}%)`,
        recommendation: "caution",
      };
    }

    return {
      layer: "botTrap",
      isValid: true,
      confidence: 100 - botTrapAnalysis.suspicionScore,
      reasoning: `Low bot trap suspicion (${botTrapAnalysis.suspicionScore}%)`,
      recommendation: "proceed",
    };
  }

  /**
   * Validate Global CVD layer
   */
  private validateGlobalCVDLayer(
    signal: TechnicalSignal,
    globalCVD: GlobalCVDData | null,
  ): LayerValidation {
    if (!globalCVD) {
      return {
        layer: "globalCVD",
        isValid: !this.config.requireGlobalCVDConfirmation,
        confidence: 0,
        reasoning: "No Global CVD data available",
        recommendation: this.config.requireGlobalCVDConfirmation
          ? "caution"
          : "proceed",
      };
    }

    // Check for manipulation
    if (globalCVD.manipulation.detected) {
      return {
        layer: "globalCVD",
        isValid: false,
        confidence: globalCVD.confidence,
        reasoning:
          `Manipulation detected on ${globalCVD.manipulation.suspectExchange}`,
        recommendation: "veto",
      };
    }

    // Check consensus alignment
    const isAligned = this.isGlobalCVDAligned(
      signal.direction,
      globalCVD.consensus,
    );

    if (globalCVD.consensus === "conflicted") {
      return {
        layer: "globalCVD",
        isValid: true,
        confidence: globalCVD.confidence,
        reasoning: "Conflicting signals across exchanges",
        recommendation: "caution",
      };
    }

    if (isAligned) {
      return {
        layer: "globalCVD",
        isValid: true,
        confidence: globalCVD.confidence,
        reasoning: `Global CVD aligned (${globalCVD.consensus})`,
        recommendation: "proceed",
      };
    }

    if (!isAligned && globalCVD.consensus !== "neutral") {
      return {
        layer: "globalCVD",
        isValid: false,
        confidence: globalCVD.confidence,
        reasoning: `Global CVD conflicts (${globalCVD.consensus})`,
        recommendation: "caution",
      };
    }

    return {
      layer: "globalCVD",
      isValid: true,
      confidence: globalCVD.confidence,
      reasoning: "Global CVD neutral",
      recommendation: "proceed",
    };
  }

  /**
   * Analyze conflicts between layers
   * Requirement 5.5: Create conflict resolution logic between enhancement layers
   */
  private analyzeConflicts(validations: LayerValidation[]): ConflictAnalysis {
    const conflictingLayers: string[] = [];
    const recommendations = validations.map((v) => v.recommendation);

    // Check for veto recommendations
    const vetoLayers = validations.filter((v) => v.recommendation === "veto");
    if (vetoLayers.length > 0) {
      return {
        hasConflict: true,
        conflictingLayers: vetoLayers.map((v) => v.layer),
        resolution: "veto",
        reasoning: `Veto from: ${vetoLayers.map((v) => v.layer).join(", ")}`,
      };
    }

    // Check for caution recommendations
    const cautionLayers = validations.filter((v) =>
      v.recommendation === "caution"
    );
    const proceedLayers = validations.filter((v) =>
      v.recommendation === "proceed"
    );

    if (cautionLayers.length > 0 && proceedLayers.length > 0) {
      conflictingLayers.push(...cautionLayers.map((v) => v.layer));

      // Apply conflict resolution strategy
      switch (this.config.conflictResolutionStrategy) {
        case "conservative":
          return {
            hasConflict: true,
            conflictingLayers,
            resolution: cautionLayers.length >= 2 ? "veto" : "reduce",
            reasoning:
              `Conservative: ${cautionLayers.length} layers recommend caution`,
          };

        case "weighted":
          // Weight by confidence
          const cautionWeight = cautionLayers.reduce(
            (sum, v) => sum + v.confidence,
            0,
          );
          const proceedWeight = proceedLayers.reduce(
            (sum, v) => sum + v.confidence,
            0,
          );

          return {
            hasConflict: true,
            conflictingLayers,
            resolution: cautionWeight > proceedWeight ? "reduce" : "proceed",
            reasoning: `Weighted: caution=${
              cautionWeight.toFixed(0)
            }, proceed=${proceedWeight.toFixed(0)}`,
          };

        case "majority":
          return {
            hasConflict: true,
            conflictingLayers,
            resolution: cautionLayers.length > proceedLayers.length
              ? "reduce"
              : "proceed",
            reasoning:
              `Majority: ${cautionLayers.length} caution vs ${proceedLayers.length} proceed`,
          };
      }
    }

    return {
      hasConflict: false,
      conflictingLayers: [],
      resolution: "proceed",
      reasoning: "No conflicts detected",
    };
  }

  /**
   * Calculate adjusted confidence
   * Requirement 5.6: Add enhanced signal confidence calculation
   */
  private calculateAdjustedConfidence(
    originalConfidence: number,
    validations: LayerValidation[],
    conflictAnalysis: ConflictAnalysis,
  ): number {
    let adjustedConfidence = originalConfidence;

    // Apply layer confidence adjustments
    for (const validation of validations) {
      if (validation.confidence > 0) {
        switch (validation.recommendation) {
          case "proceed":
            // Boost confidence slightly for aligned layers
            adjustedConfidence += (validation.confidence - 50) * 0.05;
            break;
          case "caution":
            // Reduce confidence for cautionary layers
            adjustedConfidence -= validation.confidence * 0.1;
            break;
          case "veto":
            // Significant reduction for veto layers
            adjustedConfidence -= validation.confidence * 0.3;
            break;
        }
      }
    }

    // Apply conflict penalty
    if (conflictAnalysis.hasConflict) {
      const conflictPenalty = conflictAnalysis.conflictingLayers.length * 5;
      adjustedConfidence -= conflictPenalty;
    }

    // Clamp to 0-100 range
    return Math.max(0, Math.min(100, adjustedConfidence));
  }

  /**
   * Determine final recommendation
   */
  private determineRecommendation(
    validations: LayerValidation[],
    conflictAnalysis: ConflictAnalysis,
    adjustedConfidence: number,
  ): "proceed" | "proceed_cautiously" | "reduce_size" | "veto" {
    // Check for veto conditions
    if (conflictAnalysis.resolution === "veto") {
      return "veto";
    }

    if (adjustedConfidence < this.config.minConfidenceThreshold) {
      return "veto";
    }

    // Check for reduce conditions
    if (conflictAnalysis.resolution === "reduce") {
      return "reduce_size";
    }

    // Check for caution conditions
    const cautionCount =
      validations.filter((v) => v.recommendation === "caution").length;
    if (cautionCount > 0) {
      return "proceed_cautiously";
    }

    return "proceed";
  }

  /**
   * Check if Oracle sentiment aligns with signal direction
   */
  private isOracleAligned(
    direction: "LONG" | "SHORT",
    sentiment: number,
  ): boolean {
    if (direction === "LONG") {
      return sentiment > 0;
    }
    return sentiment < 0;
  }

  /**
   * Check if Global CVD consensus aligns with signal direction
   */
  private isGlobalCVDAligned(
    direction: "LONG" | "SHORT",
    consensus: "bullish" | "bearish" | "neutral" | "conflicted",
  ): boolean {
    if (direction === "LONG") {
      return consensus === "bullish";
    }
    return consensus === "bearish";
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SignalValidatorConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit("configUpdated", this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): SignalValidatorConfig {
    return { ...this.config };
  }
}
