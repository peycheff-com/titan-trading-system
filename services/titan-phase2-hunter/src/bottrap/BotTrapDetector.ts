/**
 * BotTrapDetector - Main Bot Trap Detection Integration Component
 *
 * Integrates pattern precision analysis, risk adjustment, and adaptive learning
 * into a unified bot trap detection system for Phase 2 signal validation.
 *
 * Requirements: 3.1-3.7 (Bot Trap Pattern Recognition)
 * Requirements: 13.1-13.7 (Adaptive Learning from Bot Trap Patterns)
 */

import { EventEmitter } from 'events';
import { BotTrapAnalysis, FlowValidation, TradeOutcome } from '../types';
import { FVG, LiquidityPool, OrderBlock, POI } from '../types';
import {
  PatternPrecisionAnalyzer,
  PatternPrecisionConfig,
  PrecisionAnalysisResult,
  TechnicalPattern,
} from './PatternPrecisionAnalyzer';
import {
  EntryValidationResult,
  RiskAdjustmentConfig,
  RiskAdjustmentResult,
  SuspectPatternRiskAdjuster,
} from './SuspectPatternRiskAdjuster';
import {
  AdaptiveLearningConfig,
  AdaptiveLearningEngine,
  LearningStatistics,
  ParameterAdjustment,
} from './AdaptiveLearningEngine';

/**
 * Configuration for Bot Trap Detector
 */
export interface BotTrapDetectorConfig {
  /** Enable/disable bot trap detection */
  enabled: boolean;
  /** Pattern precision analysis config */
  precisionConfig: Partial<PatternPrecisionConfig>;
  /** Risk adjustment config */
  riskConfig: Partial<RiskAdjustmentConfig>;
  /** Adaptive learning config */
  learningConfig: Partial<AdaptiveLearningConfig>;
  /** Enable adaptive learning */
  learningEnabled: boolean;
  /** Enable adaptive adjustments to parameters */
  adaptiveAdjustments: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_BOT_TRAP_DETECTOR_CONFIG: BotTrapDetectorConfig = {
  enabled: true,
  precisionConfig: {},
  riskConfig: {},
  learningConfig: {},
  learningEnabled: true,
  adaptiveAdjustments: true,
};

/**
 * Bot trap detection event
 */
export interface BotTrapEvent {
  type: 'BOT_TRAP_DETECTED' | 'TRAP_CONFIRMED' | 'FALSE_POSITIVE' | 'LEARNING_UPDATE';
  symbol: string;
  analysis: BotTrapAnalysis;
  patternType: string;
  precisionScore: number;
  action: string;
  timestamp: Date;
}

/**
 * POI analysis result with trap detection
 */
export interface POITrapAnalysis {
  poi: POI;
  trapAnalysis: PrecisionAnalysisResult;
  entryValidation: EntryValidationResult | null;
  recommendation: 'PROCEED' | 'CAUTION' | 'AVOID';
}

/**
 * BotTrapDetector - Main integration component
 *
 * Requirement 3.7: Log BOT_TRAP_DETECTED with pattern type, precision score, and action
 */
export class BotTrapDetector extends EventEmitter {
  private config: BotTrapDetectorConfig;
  private precisionAnalyzer: PatternPrecisionAnalyzer;
  private riskAdjuster: SuspectPatternRiskAdjuster;
  private learningEngine: AdaptiveLearningEngine;
  private symbol: string;
  private analysisCache: Map<string, PrecisionAnalysisResult>;

  constructor(symbol: string, config: Partial<BotTrapDetectorConfig> = {}) {
    super();
    this.symbol = symbol;
    this.config = { ...DEFAULT_BOT_TRAP_DETECTOR_CONFIG, ...config };

    // Initialize components
    this.precisionAnalyzer = new PatternPrecisionAnalyzer(this.config.precisionConfig);
    this.riskAdjuster = new SuspectPatternRiskAdjuster(this.config.riskConfig);
    this.learningEngine = new AdaptiveLearningEngine(this.config.learningConfig);
    this.analysisCache = new Map();
  }

  /**
   * Analyze a POI for bot trap characteristics
   */
  analyzePOI(poi: POI): POITrapAnalysis {
    if (!this.config.enabled) {
      return {
        poi,
        trapAnalysis: this.createNullAnalysis(poi),
        entryValidation: null,
        recommendation: 'PROCEED',
      };
    }

    // eslint-disable-next-line functional/no-let
    let trapAnalysis: PrecisionAnalysisResult;

    // Analyze based on POI type
    if ('midpoint' in poi) {
      // FVG
      trapAnalysis = this.precisionAnalyzer.analyzeFVG(poi as FVG);
    } else if ('high' in poi && 'low' in poi && !('strength' in poi)) {
      // Order Block
      trapAnalysis = this.precisionAnalyzer.analyzeOrderBlock(poi as OrderBlock);
    } else if ('strength' in poi) {
      // Liquidity Pool
      trapAnalysis = this.precisionAnalyzer.analyzeLiquidityPool(poi as LiquidityPool);
    } else {
      return {
        poi,
        trapAnalysis: this.createNullAnalysis(poi),
        entryValidation: null,
        recommendation: 'PROCEED',
      };
    }

    // Cache analysis
    const cacheKey = this.getPOICacheKey(poi);
    // eslint-disable-next-line functional/immutable-data
    this.analysisCache.set(cacheKey, trapAnalysis);

    // Record for learning
    if (this.config.learningEnabled) {
      this.learningEngine.recordPatternDetection(trapAnalysis, trapAnalysis.isSuspect);
    }

    // Emit event if trap detected
    if (trapAnalysis.isSuspect) {
      this.emitBotTrapEvent('BOT_TRAP_DETECTED', trapAnalysis, 'FLAGGED');
    }

    // Determine recommendation
    const recommendation = this.getRecommendation(trapAnalysis);

    return {
      poi,
      trapAnalysis,
      entryValidation: null, // Will be set when validateEntry is called
      recommendation,
    };
  }

  /**
   * Analyze multiple POIs for bot trap characteristics
   */
  analyzePOIs(pois: POI[]): POITrapAnalysis[] {
    return pois.map(poi => this.analyzePOI(poi));
  }

  /**
   * Validate entry for a POI with flow validation
   *
   * Requirement 3.4: Require Passive Absorption signature before entry on SUSPECT_TRAP
   */
  validateEntry(poi: POI, flowValidation: FlowValidation | null): EntryValidationResult {
    const cacheKey = this.getPOICacheKey(poi);
    // eslint-disable-next-line functional/no-let
    let trapAnalysis = this.analysisCache.get(cacheKey);

    // Analyze if not cached
    if (!trapAnalysis) {
      const poiAnalysis = this.analyzePOI(poi);
      trapAnalysis = poiAnalysis.trapAnalysis;
    }

    // Validate entry
    const validation = this.riskAdjuster.validateEntry(trapAnalysis, flowValidation);

    // Log the validation
    if (trapAnalysis.isSuspect) {
      const action = validation.allowed ? 'ENTRY_ALLOWED_WITH_ADJUSTMENTS' : 'ENTRY_BLOCKED';
      this.emitBotTrapEvent('BOT_TRAP_DETECTED', trapAnalysis, action);
    }

    return validation;
  }

  /**
   * Generate comprehensive bot trap analysis for signal validation
   */
  generateAnalysis(pois: POI[]): BotTrapAnalysis {
    const analyses = pois.map(poi => {
      const cacheKey = this.getPOICacheKey(poi);
      // eslint-disable-next-line functional/no-let
      let analysis = this.analysisCache.get(cacheKey);

      if (!analysis) {
        const poiAnalysis = this.analyzePOI(poi);
        analysis = poiAnalysis.trapAnalysis;
      }

      return analysis;
    });

    return this.riskAdjuster.generateBotTrapAnalysis(analyses);
  }

  /**
   * Record trade outcome for learning
   *
   * Requirement 13.1: Track subsequent price action for validation
   */
  recordTradeOutcome(poi: POI, outcome: TradeOutcome): void {
    if (!this.config.learningEnabled) return;

    const cacheKey = this.getPOICacheKey(poi);
    const analysis = this.analysisCache.get(cacheKey);

    if (analysis) {
      this.learningEngine.recordOutcome(analysis, outcome);

      // Emit learning event
      const wasCorrect = analysis.isSuspect
        ? outcome.exitReason === 'stop_loss' || outcome.pnl < 0
        : outcome.exitReason !== 'stop_loss' && outcome.pnl >= 0;

      if (wasCorrect) {
        if (analysis.isSuspect) {
          this.emitBotTrapEvent('TRAP_CONFIRMED', analysis, 'TRAP_VALIDATED');
        }
      } else {
        if (analysis.isSuspect) {
          this.emitBotTrapEvent('FALSE_POSITIVE', analysis, 'LEGITIMATE_PATTERN');
        }
      }
    }
  }

  /**
   * Record avoided pattern outcome
   */
  recordAvoidedPattern(poi: POI, wouldHaveLost: boolean): void {
    if (!this.config.learningEnabled) return;

    const cacheKey = this.getPOICacheKey(poi);
    const analysis = this.analysisCache.get(cacheKey);

    if (analysis) {
      this.learningEngine.recordAvoidedPattern(analysis, { wouldHaveLost });
    }
  }

  /**
   * Get learning statistics
   *
   * Requirement 13.7: Log learning statistics
   */
  getLearningStatistics(): LearningStatistics {
    return this.learningEngine.calculateStatistics();
  }

  /**
   * Get parameter adjustment history
   *
   * Requirement 13.7: Log parameter adjustments
   */
  getParameterHistory(): ParameterAdjustment[] {
    return this.learningEngine.getParameterHistory();
  }

  /**
   * Update session levels for round number detection
   */
  updateSessionLevels(levels: number[]): void {
    this.precisionAnalyzer.updateSessionLevels(levels);
  }

  /**
   * Get current precision threshold (may be adjusted by learning)
   */
  getCurrentPrecisionThreshold(): number {
    if (this.config.adaptiveAdjustments) {
      return this.learningEngine.getCurrentPrecisionThreshold();
    }
    return 95; // Default threshold
  }

  /**
   * Calculate risk adjustments for a suspect pattern
   */
  calculateRiskAdjustments(
    poi: POI,
    basePositionMultiplier: number = 1.0,
    baseStopLoss: number = 0.015,
    baseConfirmationThreshold: number = 50
  ): RiskAdjustmentResult | null {
    const cacheKey = this.getPOICacheKey(poi);
    const analysis = this.analysisCache.get(cacheKey);

    if (!analysis) {
      return null;
    }

    return this.riskAdjuster.calculateRiskAdjustments(
      analysis,
      basePositionMultiplier,
      baseStopLoss,
      baseConfirmationThreshold
    );
  }

  /**
   * Check if bot trap detection rate is too high (saturation)
   *
   * Used for emergency protocol activation
   */
  getTrapDetectionRate(): number {
    const stats = this.getLearningStatistics();
    if (stats.totalPatterns === 0) return 0;
    return stats.flaggedPatterns / stats.totalPatterns;
  }

  /**
   * Check if trap saturation emergency should be triggered
   *
   * Requirement 14.5: Trigger TRAP_SATURATION_EMERGENCY if detection rate > 80%
   */
  isTrapSaturationEmergency(): boolean {
    return this.getTrapDetectionRate() > 0.8;
  }

  /**
   * Export learning data for persistence
   */
  exportLearningData(): ReturnType<AdaptiveLearningEngine['exportLearningData']> {
    return this.learningEngine.exportLearningData();
  }

  /**
   * Import learning data from persistence
   */
  importLearningData(data: Parameters<AdaptiveLearningEngine['importLearningData']>[0]): void {
    this.learningEngine.importLearningData(data);
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    // eslint-disable-next-line functional/immutable-data
    this.analysisCache.clear();
  }

  /**
   * Reset detector (for testing)
   */
  reset(): void {
    // eslint-disable-next-line functional/immutable-data
    this.analysisCache.clear();
    this.precisionAnalyzer.clearHistory();
    this.learningEngine.reset();
  }

  /**
   * Create null analysis for disabled detection
   */
  private createNullAnalysis(poi: POI): PrecisionAnalysisResult {
    const pattern: TechnicalPattern = {
      type: 'order_block',
      levels: [],
      timestamp: new Date(),
      barIndex: 0,
    };

    return {
      pattern,
      precision: {
        type: 'order_block',
        precision: 0,
        suspicionLevel: 'low',
        characteristics: [],
      },
      characteristics: {
        precision: 0,
        timing: 0,
        volume: 0,
        complexity: 0,
        frequency: 0,
      },
      indicators: {
        exactTickPrecision: false,
        perfectTiming: false,
        unusualVolume: false,
        textbookPattern: false,
        suspiciousFrequency: false,
      },
      isSuspect: false,
      suspicionScore: 0,
    };
  }

  /**
   * Get cache key for POI
   */
  private getPOICacheKey(poi: POI): string {
    if ('midpoint' in poi) {
      const fvg = poi as FVG;
      return `fvg_${fvg.barIndex}_${fvg.midpoint}`;
    } else if ('high' in poi && 'low' in poi && !('strength' in poi)) {
      const ob = poi as OrderBlock;
      return `ob_${ob.barIndex}_${ob.high}_${ob.low}`;
    } else if ('strength' in poi) {
      const pool = poi as LiquidityPool;
      return `pool_${pool.barIndex}_${pool.price}`;
    }
    return `unknown_${Date.now()}`;
  }

  /**
   * Get recommendation based on analysis
   */
  private getRecommendation(analysis: PrecisionAnalysisResult): 'PROCEED' | 'CAUTION' | 'AVOID' {
    if (!analysis.isSuspect) {
      return 'PROCEED';
    }

    if (analysis.precision.suspicionLevel === 'extreme') {
      return 'AVOID';
    }

    if (analysis.precision.suspicionLevel === 'high') {
      return 'CAUTION';
    }

    return 'CAUTION';
  }

  /**
   * Emit bot trap event
   *
   * Requirement 3.7: Log BOT_TRAP_DETECTED with pattern type, precision score, and action
   */
  private emitBotTrapEvent(
    type: BotTrapEvent['type'],
    analysis: PrecisionAnalysisResult,
    action: string
  ): void {
    const event: BotTrapEvent = {
      type,
      symbol: this.symbol,
      analysis: {
        isSuspect: analysis.isSuspect,
        suspicionScore: analysis.suspicionScore,
        patterns: [analysis.precision],
        recommendations: [],
        timestamp: new Date(),
      },
      patternType: analysis.pattern.type,
      precisionScore: analysis.precision.precision,
      action,
      timestamp: new Date(),
    };

    this.emit('botTrap', event);
    this.emit(type.toLowerCase(), event);
  }
}
