/**
 * SuspectPatternRiskAdjuster - Risk Adjustment for SUSPECT_TRAP Patterns
 * 
 * Implements position size reduction, stop loss tightening, and confirmation
 * threshold adjustments for patterns flagged as potential bot traps.
 * 
 * Requirements: 3.4, 3.5, 3.6 (Bot Trap Pattern Recognition)
 */

import {
  BotTrapAnalysis,
  TrapRecommendation,
  PatternPrecision,
  FlowValidation
} from '../types';
import { PrecisionAnalysisResult } from './PatternPrecisionAnalyzer';

/**
 * Configuration for risk adjustments
 */
export interface RiskAdjustmentConfig {
  /** Position size multiplier for SUSPECT_TRAP (default 0.5 = 50% reduction) */
  suspectTrapSizeMultiplier: number;
  /** Stop loss percentage for SUSPECT_TRAP (default 0.01 = 1%) */
  suspectTrapStopLoss: number;
  /** CVD confirmation threshold increase for textbook patterns (default 1.5 = 50% increase) */
  textbookConfirmationMultiplier: number;
  /** Minimum suspicion score to trigger adjustments */
  minSuspicionThreshold: number;
  /** Maximum position size reduction (floor) */
  maxPositionReduction: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_RISK_ADJUSTMENT_CONFIG: RiskAdjustmentConfig = {
  suspectTrapSizeMultiplier: 0.5, // 50% position size
  suspectTrapStopLoss: 0.01, // 1% stop loss
  textbookConfirmationMultiplier: 1.5, // 50% increase in CVD threshold
  minSuspicionThreshold: 60, // Minimum score to trigger adjustments
  maxPositionReduction: 0.25 // Never reduce below 25% of base size
};

/**
 * Risk adjustment result
 */
export interface RiskAdjustmentResult {
  /** Original position size multiplier */
  originalMultiplier: number;
  /** Adjusted position size multiplier */
  adjustedMultiplier: number;
  /** Original stop loss percentage */
  originalStopLoss: number;
  /** Adjusted stop loss percentage */
  adjustedStopLoss: number;
  /** Original CVD confirmation threshold */
  originalConfirmationThreshold: number;
  /** Adjusted CVD confirmation threshold */
  adjustedConfirmationThreshold: number;
  /** Whether passive absorption is required */
  requiresPassiveAbsorption: boolean;
  /** Reasoning for adjustments */
  reasoning: string[];
}

/**
 * Entry validation result
 */
export interface EntryValidationResult {
  /** Whether entry is allowed */
  allowed: boolean;
  /** Reason for decision */
  reason: string;
  /** Risk adjustments to apply if allowed */
  adjustments: RiskAdjustmentResult | null;
  /** Recommendations for the trade */
  recommendations: TrapRecommendation[];
}

/**
 * SuspectPatternRiskAdjuster - Manages risk for potential trap patterns
 * 
 * Requirement 3.4: Require Passive Absorption signature before entry on SUSPECT_TRAP
 * Requirement 3.5: Reduce position size by 50% and tighten stop loss to 1%
 * Requirement 3.6: Increase required CVD confirmation threshold by 50%
 */
export class SuspectPatternRiskAdjuster {
  private config: RiskAdjustmentConfig;

  constructor(config: Partial<RiskAdjustmentConfig> = {}) {
    this.config = { ...DEFAULT_RISK_ADJUSTMENT_CONFIG, ...config };
  }

  /**
   * Calculate risk adjustments for a suspect pattern
   * 
   * Requirement 3.5: Reduce position size by 50% and tighten stop loss to 1%
   */
  calculateRiskAdjustments(
    analysis: PrecisionAnalysisResult,
    basePositionMultiplier: number = 1.0,
    baseStopLoss: number = 0.015, // 1.5% default
    baseConfirmationThreshold: number = 50
  ): RiskAdjustmentResult {
    const reasoning: string[] = [];
    
    let adjustedMultiplier = basePositionMultiplier;
    let adjustedStopLoss = baseStopLoss;
    let adjustedConfirmationThreshold = baseConfirmationThreshold;
    let requiresPassiveAbsorption = false;
    
    // Check if pattern is suspect
    if (analysis.isSuspect) {
      // Requirement 3.5: Reduce position size by 50%
      adjustedMultiplier = basePositionMultiplier * this.config.suspectTrapSizeMultiplier;
      reasoning.push(`SUSPECT_TRAP detected: Position size reduced to ${this.config.suspectTrapSizeMultiplier * 100}%`);
      
      // Requirement 3.5: Tighten stop loss to 1%
      adjustedStopLoss = Math.min(baseStopLoss, this.config.suspectTrapStopLoss);
      reasoning.push(`SUSPECT_TRAP detected: Stop loss tightened to ${this.config.suspectTrapStopLoss * 100}%`);
      
      // Requirement 3.4: Require passive absorption
      requiresPassiveAbsorption = true;
      reasoning.push('SUSPECT_TRAP detected: Passive absorption signature required');
    }
    
    // Check for textbook pattern
    if (analysis.indicators.textbookPattern) {
      // Requirement 3.6: Increase CVD confirmation threshold by 50%
      adjustedConfirmationThreshold = baseConfirmationThreshold * this.config.textbookConfirmationMultiplier;
      reasoning.push(`Textbook pattern: CVD confirmation threshold increased by ${(this.config.textbookConfirmationMultiplier - 1) * 100}%`);
    }
    
    // Apply additional adjustments based on suspicion level
    if (analysis.precision.suspicionLevel === 'extreme') {
      adjustedMultiplier *= 0.5; // Additional 50% reduction for extreme suspicion
      reasoning.push('Extreme suspicion: Additional 50% position reduction');
    } else if (analysis.precision.suspicionLevel === 'high') {
      adjustedMultiplier *= 0.75; // Additional 25% reduction for high suspicion
      reasoning.push('High suspicion: Additional 25% position reduction');
    }
    
    // Ensure minimum position size
    adjustedMultiplier = Math.max(this.config.maxPositionReduction, adjustedMultiplier);
    
    return {
      originalMultiplier: basePositionMultiplier,
      adjustedMultiplier,
      originalStopLoss: baseStopLoss,
      adjustedStopLoss,
      originalConfirmationThreshold: baseConfirmationThreshold,
      adjustedConfirmationThreshold,
      requiresPassiveAbsorption,
      reasoning
    };
  }

  /**
   * Validate entry based on pattern analysis and flow validation
   * 
   * Requirement 3.4: Require Passive Absorption signature before entry on SUSPECT_TRAP
   */
  validateEntry(
    analysis: PrecisionAnalysisResult,
    flowValidation: FlowValidation | null
  ): EntryValidationResult {
    const recommendations: TrapRecommendation[] = [];
    
    // If not suspect, allow entry with no adjustments
    if (!analysis.isSuspect) {
      return {
        allowed: true,
        reason: 'Pattern not flagged as suspect',
        adjustments: null,
        recommendations: []
      };
    }
    
    // Calculate risk adjustments
    const adjustments = this.calculateRiskAdjustments(analysis);
    
    // Check if passive absorption is required and present
    if (adjustments.requiresPassiveAbsorption) {
      if (!flowValidation) {
        recommendations.push({
          action: 'require_confirmation',
          reasoning: 'Flow validation required for SUSPECT_TRAP pattern',
          adjustments: {
            positionSizeMultiplier: adjustments.adjustedMultiplier,
            stopLossAdjustment: adjustments.adjustedStopLoss,
            confirmationThreshold: adjustments.adjustedConfirmationThreshold
          }
        });
        
        return {
          allowed: false,
          reason: 'SUSPECT_TRAP requires flow validation - no flow data available',
          adjustments,
          recommendations
        };
      }
      
      // Requirement 3.4: Require passive absorption
      if (flowValidation.flowType !== 'passive_absorption') {
        recommendations.push({
          action: 'avoid',
          reasoning: `SUSPECT_TRAP without passive absorption (flow type: ${flowValidation.flowType})`,
          adjustments: {
            positionSizeMultiplier: 0,
            stopLossAdjustment: adjustments.adjustedStopLoss,
            confirmationThreshold: adjustments.adjustedConfirmationThreshold
          }
        });
        
        return {
          allowed: false,
          reason: `SUSPECT_TRAP requires passive absorption, but flow type is ${flowValidation.flowType}`,
          adjustments,
          recommendations
        };
      }
      
      // Passive absorption confirmed - allow with reduced size
      recommendations.push({
        action: 'reduce_size',
        reasoning: 'SUSPECT_TRAP with passive absorption confirmed - proceed with reduced size',
        adjustments: {
          positionSizeMultiplier: adjustments.adjustedMultiplier,
          stopLossAdjustment: adjustments.adjustedStopLoss,
          confirmationThreshold: adjustments.adjustedConfirmationThreshold
        }
      });
      
      return {
        allowed: true,
        reason: 'SUSPECT_TRAP with passive absorption confirmed',
        adjustments,
        recommendations
      };
    }
    
    // Suspect but doesn't require passive absorption (lower suspicion)
    recommendations.push({
      action: 'proceed_cautiously',
      reasoning: 'Pattern shows some suspicious characteristics',
      adjustments: {
        positionSizeMultiplier: adjustments.adjustedMultiplier,
        stopLossAdjustment: adjustments.adjustedStopLoss,
        confirmationThreshold: adjustments.adjustedConfirmationThreshold
      }
    });
    
    return {
      allowed: true,
      reason: 'Pattern flagged as suspect but within acceptable risk parameters',
      adjustments,
      recommendations
    };
  }

  /**
   * Generate comprehensive bot trap analysis
   */
  generateBotTrapAnalysis(
    precisionResults: PrecisionAnalysisResult[]
  ): BotTrapAnalysis {
    // Aggregate all patterns
    const patterns: PatternPrecision[] = precisionResults.map(r => r.precision);
    
    // Calculate overall suspicion
    const avgSuspicionScore = precisionResults.length > 0
      ? precisionResults.reduce((sum, r) => sum + r.suspicionScore, 0) / precisionResults.length
      : 0;
    
    // Check if any pattern is suspect
    const isSuspect = precisionResults.some(r => r.isSuspect);
    
    // Generate recommendations
    const recommendations: TrapRecommendation[] = [];
    
    if (isSuspect) {
      const highestSuspicion = precisionResults.reduce(
        (max, r) => r.suspicionScore > max.suspicionScore ? r : max,
        precisionResults[0]
      );
      
      if (highestSuspicion.precision.suspicionLevel === 'extreme') {
        recommendations.push({
          action: 'avoid',
          reasoning: 'Extreme suspicion level detected - likely HFT trap',
          adjustments: {
            positionSizeMultiplier: 0,
            stopLossAdjustment: this.config.suspectTrapStopLoss,
            confirmationThreshold: 100
          }
        });
      } else if (highestSuspicion.precision.suspicionLevel === 'high') {
        recommendations.push({
          action: 'require_confirmation',
          reasoning: 'High suspicion level - require strong flow confirmation',
          adjustments: {
            positionSizeMultiplier: this.config.suspectTrapSizeMultiplier * 0.5,
            stopLossAdjustment: this.config.suspectTrapStopLoss,
            confirmationThreshold: 80
          }
        });
      } else {
        recommendations.push({
          action: 'reduce_size',
          reasoning: 'Moderate suspicion - proceed with reduced exposure',
          adjustments: {
            positionSizeMultiplier: this.config.suspectTrapSizeMultiplier,
            stopLossAdjustment: this.config.suspectTrapStopLoss,
            confirmationThreshold: 60
          }
        });
      }
    }
    
    return {
      isSuspect,
      suspicionScore: avgSuspicionScore,
      patterns,
      recommendations,
      timestamp: new Date()
    };
  }

  /**
   * Apply risk adjustments to position parameters
   */
  applyAdjustments(
    basePositionSize: number,
    baseStopLoss: number,
    adjustments: RiskAdjustmentResult
  ): { positionSize: number; stopLoss: number } {
    return {
      positionSize: basePositionSize * adjustments.adjustedMultiplier,
      stopLoss: adjustments.adjustedStopLoss
    };
  }

  /**
   * Check if CVD confirmation meets adjusted threshold
   */
  validateCVDConfirmation(
    cvdConfidence: number,
    adjustments: RiskAdjustmentResult
  ): boolean {
    return cvdConfidence >= adjustments.adjustedConfirmationThreshold;
  }
}
