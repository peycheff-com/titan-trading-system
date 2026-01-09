/**
 * AdaptiveLearningEngine - Pattern Outcome Learning System
 * 
 * Tracks pattern outcomes and adjusts detection parameters based on
 * historical success/failure rates. Implements adaptive learning to
 * reduce false positives and improve trap detection accuracy.
 * 
 * Requirements: 13.1-13.7 (Adaptive Learning from Bot Trap Patterns)
 */

import {
  TradeOutcome,
  PatternPrecision
} from '../types';
import { PrecisionAnalysisResult, TechnicalPattern } from './PatternPrecisionAnalyzer';

/**
 * Configuration for adaptive learning
 */
export interface AdaptiveLearningConfig {
  /** Minimum samples before updating algorithm */
  minSamplesForUpdate: number;
  /** Learning rate for parameter adjustments */
  learningRate: number;
  /** Maximum precision threshold adjustment */
  maxThresholdAdjustment: number;
  /** Decay factor for old samples */
  sampleDecayFactor: number;
  /** Window size for recent samples (hours) */
  recentWindowHours: number;
}

/**
 * Default configuration values
 */
export const DEFAULT_ADAPTIVE_LEARNING_CONFIG: AdaptiveLearningConfig = {
  minSamplesForUpdate: 100, // Requirement 13.5: 100 samples before update
  learningRate: 0.1,
  maxThresholdAdjustment: 0.2, // Max 20% adjustment
  sampleDecayFactor: 0.95, // 5% decay per day
  recentWindowHours: 168 // 1 week
};

/**
 * Pattern outcome record
 */
export interface PatternOutcomeRecord {
  /** Pattern analysis at time of detection */
  analysis: PrecisionAnalysisResult;
  /** Trade outcome (if trade was taken) */
  outcome: TradeOutcome | null;
  /** Whether pattern was flagged as suspect */
  wasFlagged: boolean;
  /** Whether the flag was correct (trap confirmed) */
  flagCorrect: boolean | null;
  /** Timestamp of record */
  timestamp: Date;
}

/**
 * Learning statistics
 */
export interface LearningStatistics {
  /** Total patterns analyzed */
  totalPatterns: number;
  /** Patterns flagged as suspect */
  flaggedPatterns: number;
  /** True positives (correctly flagged traps) */
  truePositives: number;
  /** False positives (incorrectly flagged legitimate patterns) */
  falsePositives: number;
  /** True negatives (correctly allowed legitimate patterns) */
  trueNegatives: number;
  /** False negatives (missed traps) */
  falseNegatives: number;
  /** Precision (TP / (TP + FP)) */
  precision: number;
  /** Recall (TP / (TP + FN)) */
  recall: number;
  /** F1 Score */
  f1Score: number;
  /** Current precision threshold */
  currentPrecisionThreshold: number;
  /** Last update timestamp */
  lastUpdate: Date;
}

/**
 * Parameter adjustment record
 */
export interface ParameterAdjustment {
  /** Parameter name */
  parameter: string;
  /** Previous value */
  previousValue: number;
  /** New value */
  newValue: number;
  /** Reason for adjustment */
  reason: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * AdaptiveLearningEngine - Learns from pattern outcomes
 * 
 * Requirement 13.1: Track subsequent price action for validation
 * Requirement 13.2: Reduce precision threshold for successful SUSPECT_TRAP patterns
 * Requirement 13.3: Reinforce current detection parameters for correct predictions
 * Requirement 13.4: Adjust precision tolerance to reduce false positives
 * Requirement 13.5: Update algorithm after 100 samples
 * Requirement 13.6: Validate changes against historical data before deployment
 * Requirement 13.7: Log learning statistics and parameter adjustments
 */
export class AdaptiveLearningEngine {
  private config: AdaptiveLearningConfig;
  private outcomeRecords: PatternOutcomeRecord[];
  private parameterHistory: ParameterAdjustment[];
  private currentPrecisionThreshold: number;
  private pendingAdjustments: Map<string, number>;

  constructor(
    config: Partial<AdaptiveLearningConfig> = {},
    initialPrecisionThreshold: number = 95
  ) {
    this.config = { ...DEFAULT_ADAPTIVE_LEARNING_CONFIG, ...config };
    this.outcomeRecords = [];
    this.parameterHistory = [];
    this.currentPrecisionThreshold = initialPrecisionThreshold;
    this.pendingAdjustments = new Map();
  }

  /**
   * Record a pattern detection for tracking
   * 
   * Requirement 13.1: Track subsequent price action for validation
   */
  recordPatternDetection(
    analysis: PrecisionAnalysisResult,
    wasFlagged: boolean
  ): string {
    const recordId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const record: PatternOutcomeRecord = {
      analysis,
      outcome: null,
      wasFlagged,
      flagCorrect: null,
      timestamp: new Date()
    };
    
    this.outcomeRecords.push(record);
    
    // Clean old records
    this.cleanOldRecords();
    
    return recordId;
  }

  /**
   * Record trade outcome for a pattern
   * 
   * Requirement 13.1: Track subsequent price action for validation
   */
  recordOutcome(
    analysis: PrecisionAnalysisResult,
    outcome: TradeOutcome
  ): void {
    // Find matching record
    const record = this.outcomeRecords.find(
      r => r.analysis.pattern.barIndex === analysis.pattern.barIndex &&
           r.analysis.pattern.type === analysis.pattern.type &&
           r.outcome === null
    );
    
    if (record) {
      record.outcome = outcome;
      
      // Determine if flag was correct
      // A trap is confirmed if the trade resulted in a loss (stop loss hit)
      const wasLoss = outcome.exitReason === 'stop_loss' || outcome.pnl < 0;
      
      if (record.wasFlagged) {
        // Pattern was flagged as suspect
        // Flag is correct if it would have been a loss (trap confirmed)
        record.flagCorrect = wasLoss;
      } else {
        // Pattern was not flagged
        // Flag is correct (not flagging) if it was profitable
        record.flagCorrect = !wasLoss;
      }
      
      // Check if we should update parameters
      this.checkForParameterUpdate();
    }
  }

  /**
   * Record pattern outcome without trade (pattern avoided)
   */
  recordAvoidedPattern(
    analysis: PrecisionAnalysisResult,
    subsequentPriceAction: { wouldHaveLost: boolean }
  ): void {
    const record = this.outcomeRecords.find(
      r => r.analysis.pattern.barIndex === analysis.pattern.barIndex &&
           r.analysis.pattern.type === analysis.pattern.type &&
           r.outcome === null
    );
    
    if (record) {
      // For avoided patterns, we infer the outcome
      record.flagCorrect = subsequentPriceAction.wouldHaveLost;
      
      this.checkForParameterUpdate();
    }
  }

  /**
   * Check if parameter update is needed
   * 
   * Requirement 13.5: Update algorithm after 100 samples
   */
  private checkForParameterUpdate(): void {
    const recentRecords = this.getRecentRecords();
    const recordsWithOutcome = recentRecords.filter(r => r.flagCorrect !== null);
    
    if (recordsWithOutcome.length >= this.config.minSamplesForUpdate) {
      this.updateParameters(recordsWithOutcome);
    }
  }

  /**
   * Update detection parameters based on learning
   * 
   * Requirement 13.2: Reduce precision threshold for successful SUSPECT_TRAP
   * Requirement 13.3: Reinforce current parameters for correct predictions
   * Requirement 13.4: Adjust precision tolerance to reduce false positives
   */
  private updateParameters(records: PatternOutcomeRecord[]): void {
    const stats = this.calculateStatistics(records);
    
    // Calculate adjustment direction and magnitude
    let adjustment = 0;
    let reason = '';
    
    // High false positive rate - need to increase threshold (be more selective)
    if (stats.falsePositives > stats.truePositives * 0.3) {
      // Requirement 13.4: Reduce false positives
      adjustment = this.config.learningRate * 2; // Increase threshold
      reason = `High false positive rate (${(stats.falsePositives / (stats.truePositives + stats.falsePositives) * 100).toFixed(1)}%)`;
    }
    // High false negative rate - need to decrease threshold (catch more traps)
    else if (stats.falseNegatives > stats.trueNegatives * 0.2) {
      adjustment = -this.config.learningRate; // Decrease threshold
      reason = `High false negative rate (${(stats.falseNegatives / (stats.trueNegatives + stats.falseNegatives) * 100).toFixed(1)}%)`;
    }
    // Good performance - reinforce current parameters
    else if (stats.f1Score > 0.7) {
      // Requirement 13.3: Reinforce current parameters
      adjustment = 0;
      reason = 'Good performance - parameters reinforced';
    }
    // Successful SUSPECT_TRAP patterns - can be slightly more aggressive
    else if (stats.truePositives > stats.falsePositives * 2) {
      // Requirement 13.2: Reduce threshold for successful patterns
      adjustment = -this.config.learningRate * 0.5;
      reason = 'High true positive rate - slightly reducing threshold';
    }
    
    // Apply adjustment with limits
    if (adjustment !== 0) {
      const maxAdjustment = this.currentPrecisionThreshold * this.config.maxThresholdAdjustment;
      adjustment = Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustment));
      
      const previousThreshold = this.currentPrecisionThreshold;
      this.currentPrecisionThreshold = Math.max(70, Math.min(99, 
        this.currentPrecisionThreshold + adjustment
      ));
      
      // Record adjustment
      this.parameterHistory.push({
        parameter: 'precisionThreshold',
        previousValue: previousThreshold,
        newValue: this.currentPrecisionThreshold,
        reason,
        timestamp: new Date()
      });
    }
  }

  /**
   * Get recent records within the configured window
   */
  private getRecentRecords(): PatternOutcomeRecord[] {
    const cutoff = Date.now() - this.config.recentWindowHours * 60 * 60 * 1000;
    return this.outcomeRecords.filter(r => r.timestamp.getTime() > cutoff);
  }

  /**
   * Clean old records beyond retention window
   */
  private cleanOldRecords(): void {
    const cutoff = Date.now() - this.config.recentWindowHours * 2 * 60 * 60 * 1000;
    this.outcomeRecords = this.outcomeRecords.filter(
      r => r.timestamp.getTime() > cutoff
    );
  }

  /**
   * Calculate learning statistics
   * 
   * Requirement 13.7: Log learning statistics
   */
  calculateStatistics(records?: PatternOutcomeRecord[]): LearningStatistics {
    const targetRecords = records || this.getRecentRecords();
    const recordsWithOutcome = targetRecords.filter(r => r.flagCorrect !== null);
    
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;
    
    for (const record of recordsWithOutcome) {
      if (record.wasFlagged) {
        if (record.flagCorrect) {
          truePositives++; // Correctly flagged a trap
        } else {
          falsePositives++; // Incorrectly flagged a legitimate pattern
        }
      } else {
        if (record.flagCorrect) {
          trueNegatives++; // Correctly allowed a legitimate pattern
        } else {
          falseNegatives++; // Missed a trap
        }
      }
    }
    
    const precision = truePositives + falsePositives > 0
      ? truePositives / (truePositives + falsePositives)
      : 0;
    
    const recall = truePositives + falseNegatives > 0
      ? truePositives / (truePositives + falseNegatives)
      : 0;
    
    const f1Score = precision + recall > 0
      ? 2 * (precision * recall) / (precision + recall)
      : 0;
    
    return {
      totalPatterns: targetRecords.length,
      flaggedPatterns: targetRecords.filter(r => r.wasFlagged).length,
      truePositives,
      falsePositives,
      trueNegatives,
      falseNegatives,
      precision,
      recall,
      f1Score,
      currentPrecisionThreshold: this.currentPrecisionThreshold,
      lastUpdate: new Date()
    };
  }

  /**
   * Get current precision threshold
   */
  getCurrentPrecisionThreshold(): number {
    return this.currentPrecisionThreshold;
  }

  /**
   * Get parameter adjustment history
   * 
   * Requirement 13.7: Log parameter adjustments
   */
  getParameterHistory(): ParameterAdjustment[] {
    return [...this.parameterHistory];
  }

  /**
   * Validate proposed changes against historical data
   * 
   * Requirement 13.6: Validate changes against historical data before deployment
   */
  validateProposedThreshold(proposedThreshold: number): {
    valid: boolean;
    projectedStats: LearningStatistics;
    recommendation: string;
  } {
    const records = this.getRecentRecords().filter(r => r.flagCorrect !== null);
    
    if (records.length < 50) {
      return {
        valid: false,
        projectedStats: this.calculateStatistics(),
        recommendation: 'Insufficient data for validation (need at least 50 samples)'
      };
    }
    
    // Simulate what would have happened with proposed threshold
    let projectedTP = 0;
    let projectedFP = 0;
    let projectedTN = 0;
    let projectedFN = 0;
    
    for (const record of records) {
      const wouldFlag = record.analysis.precision.precision >= proposedThreshold;
      const wasActualTrap = record.wasFlagged ? record.flagCorrect : !record.flagCorrect;
      
      if (wouldFlag) {
        if (wasActualTrap) projectedTP++;
        else projectedFP++;
      } else {
        if (wasActualTrap) projectedFN++;
        else projectedTN++;
      }
    }
    
    const projectedPrecision = projectedTP + projectedFP > 0
      ? projectedTP / (projectedTP + projectedFP)
      : 0;
    
    const projectedRecall = projectedTP + projectedFN > 0
      ? projectedTP / (projectedTP + projectedFN)
      : 0;
    
    const projectedF1 = projectedPrecision + projectedRecall > 0
      ? 2 * (projectedPrecision * projectedRecall) / (projectedPrecision + projectedRecall)
      : 0;
    
    const projectedStats: LearningStatistics = {
      totalPatterns: records.length,
      flaggedPatterns: records.filter(r => r.analysis.precision.precision >= proposedThreshold).length,
      truePositives: projectedTP,
      falsePositives: projectedFP,
      trueNegatives: projectedTN,
      falseNegatives: projectedFN,
      precision: projectedPrecision,
      recall: projectedRecall,
      f1Score: projectedF1,
      currentPrecisionThreshold: proposedThreshold,
      lastUpdate: new Date()
    };
    
    const currentStats = this.calculateStatistics();
    
    // Validate: new threshold should improve or maintain F1 score
    const valid = projectedF1 >= currentStats.f1Score * 0.95; // Allow 5% degradation
    
    let recommendation: string;
    if (projectedF1 > currentStats.f1Score) {
      recommendation = `Proposed threshold improves F1 score from ${(currentStats.f1Score * 100).toFixed(1)}% to ${(projectedF1 * 100).toFixed(1)}%`;
    } else if (valid) {
      recommendation = `Proposed threshold maintains acceptable performance (F1: ${(projectedF1 * 100).toFixed(1)}%)`;
    } else {
      recommendation = `Proposed threshold degrades performance significantly (F1: ${(projectedF1 * 100).toFixed(1)}% vs current ${(currentStats.f1Score * 100).toFixed(1)}%)`;
    }
    
    return { valid, projectedStats, recommendation };
  }

  /**
   * Force parameter update (for manual intervention)
   */
  forceParameterUpdate(newThreshold: number, reason: string): void {
    const validation = this.validateProposedThreshold(newThreshold);
    
    const previousThreshold = this.currentPrecisionThreshold;
    this.currentPrecisionThreshold = newThreshold;
    
    this.parameterHistory.push({
      parameter: 'precisionThreshold',
      previousValue: previousThreshold,
      newValue: newThreshold,
      reason: `Manual update: ${reason} (Validation: ${validation.valid ? 'passed' : 'failed'})`,
      timestamp: new Date()
    });
  }

  /**
   * Export learning data for analysis
   */
  exportLearningData(): {
    statistics: LearningStatistics;
    parameterHistory: ParameterAdjustment[];
    recentRecords: PatternOutcomeRecord[];
  } {
    return {
      statistics: this.calculateStatistics(),
      parameterHistory: this.getParameterHistory(),
      recentRecords: this.getRecentRecords()
    };
  }

  /**
   * Import learning data (for persistence)
   */
  importLearningData(data: {
    outcomeRecords?: PatternOutcomeRecord[];
    parameterHistory?: ParameterAdjustment[];
    currentPrecisionThreshold?: number;
  }): void {
    if (data.outcomeRecords) {
      this.outcomeRecords = data.outcomeRecords;
    }
    if (data.parameterHistory) {
      this.parameterHistory = data.parameterHistory;
    }
    if (data.currentPrecisionThreshold !== undefined) {
      this.currentPrecisionThreshold = data.currentPrecisionThreshold;
    }
  }

  /**
   * Reset learning engine (for testing)
   */
  reset(): void {
    this.outcomeRecords = [];
    this.parameterHistory = [];
    this.currentPrecisionThreshold = 95;
    this.pendingAdjustments.clear();
  }
}
