/**
 * Enhanced Hologram Module - 2026 Enhancement Integration
 * 
 * This module provides the Enhanced Holographic Engine that integrates
 * all 2026 enhancement layers (Oracle, Flow, BotTrap, Global CVD) with
 * the existing Phase 2 Holographic Engine.
 * 
 * Components:
 * - EnhancedScoringEngine: Enhanced scoring formula with all enhancement layers
 * - ConvictionSizingEngine: Conviction-based position sizing
 * - EnhancedSignalValidator: Unified signal validation pipeline
 * - EnhancedHolographicEngine: Main integration component
 * 
 * Requirements: 5.1-5.7 (Enhanced Holographic Engine Integration)
 * Requirements: 7.1-7.7 (Conviction-Based Position Sizing)
 */

// Enhanced Scoring Engine
export { EnhancedScoringEngine } from './EnhancedScoringEngine';
export type {
  ScoringWeights,
  EnhancedScoringConfig,
  ScoringBreakdown
} from './EnhancedScoringEngine';
export { DEFAULT_SCORING_CONFIG } from './EnhancedScoringEngine';

// Conviction Sizing Engine
export { ConvictionSizingEngine } from './ConvictionSizingEngine';
export type {
  ConvictionSizingConfig,
  MultiplierResult
} from './ConvictionSizingEngine';
export { DEFAULT_CONVICTION_SIZING_CONFIG } from './ConvictionSizingEngine';

// Enhanced Signal Validator
export { EnhancedSignalValidator } from './EnhancedSignalValidator';
export type {
  SignalValidatorConfig,
  LayerValidation,
  ConflictAnalysis,
  EnhancedValidationResult
} from './EnhancedSignalValidator';
export { DEFAULT_SIGNAL_VALIDATOR_CONFIG } from './EnhancedSignalValidator';

// Main Integration Component
export { EnhancedHolographicEngine } from './EnhancedHolographicEngine';
export type {
  EnhancedHolographicEngineConfig,
  EnhancedAnalysisResult
} from './EnhancedHolographicEngine';
export { DEFAULT_ENHANCED_ENGINE_CONFIG } from './EnhancedHolographicEngine';
