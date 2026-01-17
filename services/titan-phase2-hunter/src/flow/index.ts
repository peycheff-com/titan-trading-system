/**
 * Flow Module - Advanced Flow Validator Components
 *
 * This module provides sophisticated order flow analysis for the
 * Titan Phase 2 - 2026 Modernization enhancement layer.
 *
 * Components:
 * - FootprintAnalyzer: Intra-candle volume distribution analysis
 * - SweepDetector: Aggressive sweep pattern detection
 * - IcebergDetector: Hidden liquidity (iceberg order) detection
 * - InstitutionalFlowClassifier: Flow classification engine
 * - AdvancedFlowValidator: Main integration component
 *
 * Requirements: 2.1-2.7 (Advanced Flow Validator - Footprint & Sweep Detection)
 */

// Core Components
export { FootprintAnalyzer } from "./FootprintAnalyzer";
export type {
  CandleFootprint,
  FootprintAnalysisResult,
  FootprintConfig,
} from "./FootprintAnalyzer";

export { SweepDetector } from "./SweepDetector";
export type {
  SweepDetectionResult,
  SweepDetectorConfig,
} from "./SweepDetector";

export { IcebergDetector } from "./IcebergDetector";
export type {
  IcebergDetectorConfig,
  LiquidityConsumption,
  LiquidityLevel,
  LiquidityRefill,
  OrderBlockLiquidityResult,
} from "./IcebergDetector";

export { InstitutionalFlowClassifier } from "./InstitutionalFlowClassifier";
export type {
  CVDIntegrationResult,
  FlowClassificationResult,
  FlowClassifierConfig,
} from "../types";

// Main Integration Component
export { AdvancedFlowValidator } from "./AdvancedFlowValidator";
export type {
  AdvancedFlowValidatorConfig,
  AdvancedFlowValidatorState,
  FlowValidationEvent,
  POIFlowValidation,
} from "./AdvancedFlowValidator";
