/**
 * Bot Trap Module - Bot Trap Pattern Recognition Components
 *
 * This module provides sophisticated bot trap detection for the
 * Titan Phase 2 - 2026 Modernization enhancement layer.
 *
 * Components:
 * - PatternPrecisionAnalyzer: Tick-level precision analysis
 * - SuspectPatternRiskAdjuster: Risk adjustment for suspect patterns
 * - AdaptiveLearningEngine: Pattern outcome learning system
 * - BotTrapDetector: Main integration component
 *
 * Requirements: 3.1-3.7 (Bot Trap Pattern Recognition)
 * Requirements: 13.1-13.7 (Adaptive Learning from Bot Trap Patterns)
 */

// Pattern Precision Analysis
export { PatternPrecisionAnalyzer } from './PatternPrecisionAnalyzer';
export type {
  PatternPrecisionConfig,
  TechnicalPattern,
  PrecisionAnalysisResult,
} from './PatternPrecisionAnalyzer';
export { DEFAULT_PATTERN_PRECISION_CONFIG } from './PatternPrecisionAnalyzer';

// Risk Adjustment
export { SuspectPatternRiskAdjuster } from './SuspectPatternRiskAdjuster';
export type {
  RiskAdjustmentConfig,
  RiskAdjustmentResult,
  EntryValidationResult,
} from './SuspectPatternRiskAdjuster';
export { DEFAULT_RISK_ADJUSTMENT_CONFIG } from './SuspectPatternRiskAdjuster';

// Adaptive Learning
export { AdaptiveLearningEngine } from './AdaptiveLearningEngine';
export type {
  AdaptiveLearningConfig,
  PatternOutcomeRecord,
  LearningStatistics,
  ParameterAdjustment,
} from './AdaptiveLearningEngine';
export { DEFAULT_ADAPTIVE_LEARNING_CONFIG } from './AdaptiveLearningEngine';

// Main Integration Component
export { BotTrapDetector } from './BotTrapDetector';
export type { BotTrapDetectorConfig, BotTrapEvent, POITrapAnalysis } from './BotTrapDetector';
export { DEFAULT_BOT_TRAP_DETECTOR_CONFIG } from './BotTrapDetector';
