/**
 * AdvancedFlowValidator - Main Integration Component
 *
 * Purpose: Integrate all flow analysis components with Phase 2 signal validation.
 * Provides a unified interface for footprint analysis, sweep detection,
 * iceberg detection, and institutional flow classification.
 *
 * Key Features:
 * - Connect footprint analysis to existing POI validation
 * - Enhance CVD confirmation with institutional flow detection
 * - Add flow validation events and logging
 *
 * Requirements: 2.7 (Integration with Phase 2 signal validation)
 */

import { EventEmitter } from "events";
import {
  FlowValidation,
  FootprintData,
  IcebergAnalysis,
  SweepPattern,
} from "../types";
import {
  Absorption,
  CVDTrade,
  Distribution,
  FVG,
  LiquidityPool,
  OHLCV,
  OrderBlock,
  POI,
} from "../types";
import {
  CandleFootprint,
  FootprintAnalysisResult,
  FootprintAnalyzer,
} from "./FootprintAnalyzer";
import { SweepDetectionResult, SweepDetector } from "./SweepDetector";
import { IcebergDetector, OrderBlockLiquidityResult } from "./IcebergDetector";
import { InstitutionalFlowClassifier } from "./InstitutionalFlowClassifier";
import { CVDIntegrationResult, FlowClassificationResult } from "../types";

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Configuration for Advanced Flow Validator
 */
export interface AdvancedFlowValidatorConfig {
  /** Enable/disable the validator */
  enabled: boolean;
  /** Minimum confidence for valid flow signal */
  minConfidence: number;
  /** Minimum institutional probability for enhanced confirmation */
  minInstitutionalProbability: number;
  /** Enable iceberg veto for Long setups */
  enableIcebergVeto: boolean;
  /** Enable sweep confirmation requirement */
  requireSweepConfirmation: boolean;
  /** Time window for flow analysis (ms) */
  analysisWindow: number;
}

/**
 * POI validation result with flow analysis
 */
export interface POIFlowValidation {
  poi: POI;
  flowValidation: FlowValidation;
  footprintAnalysis: FootprintAnalysisResult | null;
  sweepAnalysis: SweepDetectionResult | null;
  icebergAnalysis: IcebergAnalysis | null;
  isValid: boolean;
  confidence: number;
  adjustments: {
    confidenceAdjustment: number;
    positionSizeMultiplier: number;
    stopLossAdjustment: number;
  };
  veto: {
    vetoed: boolean;
    reason: string | null;
    type: "iceberg" | "flow_conflict" | "low_confidence" | null;
  };
  recommendation: string;
}

/**
 * Flow validation event data
 */
export interface FlowValidationEvent {
  symbol: string;
  timestamp: Date;
  flowType: "passive_absorption" | "aggressive_pushing" | "neutral";
  confidence: number;
  institutionalProbability: number;
  sweepCount: number;
  icebergDetected: boolean;
  cvdConfirmed: boolean;
}

/**
 * Advanced Flow Validator state
 */
export interface AdvancedFlowValidatorState {
  enabled: boolean;
  symbolsTracked: number;
  lastValidation: Date | null;
  totalValidations: number;
  vetoCount: number;
  avgConfidence: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: AdvancedFlowValidatorConfig = {
  enabled: true,
  minConfidence: 50,
  minInstitutionalProbability: 40,
  enableIcebergVeto: true,
  requireSweepConfirmation: false,
  analysisWindow: 60000, // 1 minute
};

// ============================================================================
// ADVANCED FLOW VALIDATOR CLASS
// ============================================================================

/**
 * AdvancedFlowValidator - Unified flow analysis for Phase 2
 *
 * Integrates footprint analysis, sweep detection, iceberg detection,
 * and institutional flow classification with existing Phase 2 components.
 */
export class AdvancedFlowValidator extends EventEmitter {
  private config: AdvancedFlowValidatorConfig;
  private footprintAnalyzer: FootprintAnalyzer;
  private sweepDetector: SweepDetector;
  private icebergDetector: IcebergDetector;
  private flowClassifier: InstitutionalFlowClassifier;

  // State tracking
  private validationCount: number = 0;
  private vetoCount: number = 0;
  private confidenceSum: number = 0;
  private lastValidation: Date | null = null;

  constructor(config: Partial<AdvancedFlowValidatorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Initialize components
    this.footprintAnalyzer = new FootprintAnalyzer();
    this.sweepDetector = new SweepDetector();
    this.icebergDetector = new IcebergDetector();
    this.flowClassifier = new InstitutionalFlowClassifier(
      {},
      this.footprintAnalyzer,
      this.sweepDetector,
      this.icebergDetector,
    );

    // Forward events from components
    this.setupEventForwarding();
  }

  /**
   * Setup event forwarding from sub-components
   */
  private setupEventForwarding(): void {
    this.footprintAnalyzer.on(
      "footprintBuilt",
      (data) => this.emit("footprintBuilt", data),
    );

    this.sweepDetector.on(
      "sweepDetected",
      (data) => this.emit("sweepDetected", data),
    );

    this.icebergDetector.on(
      "icebergWarning",
      (data) => this.emit("icebergWarning", data),
    );

    this.flowClassifier.on(
      "flowClassified",
      (data: any) => this.emit("flowClassified", data),
    );
  }

  // ============================================================================
  // POI VALIDATION INTEGRATION
  // ============================================================================

  /**
   * Validate POI with advanced flow analysis
   * Requirement 2.7: Connect footprint analysis to existing POI validation
   */
  validatePOI(
    symbol: string,
    poi: POI,
    trades: CVDTrade[],
    candle?: OHLCV,
  ): POIFlowValidation {
    if (!this.config.enabled) {
      return this.createDisabledResult(poi);
    }

    // Get POI price level
    const priceLevel = this.getPOIPriceLevel(poi);

    // Build footprint if candle provided
    let footprintAnalysis: FootprintAnalysisResult | null = null;
    if (candle) {
      const footprint = this.footprintAnalyzer.buildFootprint(
        symbol,
        candle,
        trades,
      );
      footprintAnalysis = this.footprintAnalyzer.analyzeFootprint(footprint);
    }

    // Analyze sweeps
    const sweepAnalysis = this.sweepDetector.analyzeSweeps(symbol, trades);

    // Analyze iceberg at POI level
    const icebergAnalysis = this.icebergDetector.calculateIcebergDensity(
      symbol,
      priceLevel,
      trades,
    );

    // Get flow classification
    const flowClassification = this.flowClassifier.classifyFlow(
      symbol,
      trades,
      priceLevel,
    );

    // Build flow validation
    const flowValidation = this.flowClassifier.buildFlowValidationScore(
      symbol,
      trades,
      priceLevel,
    );

    // Calculate adjustments
    const adjustments = this.calculateAdjustments(
      poi,
      flowClassification,
      icebergAnalysis,
      sweepAnalysis,
    );

    // Check for veto conditions
    const veto = this.checkVetoConditions(
      poi,
      flowValidation,
      icebergAnalysis,
      flowClassification,
    );

    // Determine overall validity
    const isValid = !veto.vetoed &&
      flowValidation.confidence >= this.config.minConfidence;

    // Calculate final confidence
    const confidence = veto.vetoed
      ? 0
      : flowValidation.confidence + adjustments.confidenceAdjustment;

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      poi,
      flowClassification,
      veto,
      isValid,
    );

    const result: POIFlowValidation = {
      poi,
      flowValidation,
      footprintAnalysis,
      sweepAnalysis,
      icebergAnalysis,
      isValid,
      confidence: Math.max(0, Math.min(100, confidence)),
      adjustments,
      veto,
      recommendation,
    };

    // Update statistics
    this.updateStats(result);

    // Emit validation event
    this.emitValidationEvent(symbol, result);

    return result;
  }

  /**
   * Get price level from POI
   */
  private getPOIPriceLevel(poi: POI): number {
    if ("midpoint" in poi) {
      // FVG
      return (poi as FVG).midpoint;
    } else if ("high" in poi && "low" in poi) {
      // OrderBlock
      const ob = poi as OrderBlock;
      return (ob.high + ob.low) / 2;
    } else if ("price" in poi) {
      // LiquidityPool
      return (poi as LiquidityPool).price;
    }
    return 0;
  }

  /**
   * Calculate position adjustments based on flow analysis
   */
  private calculateAdjustments(
    poi: POI,
    flowClassification: FlowClassificationResult,
    icebergAnalysis: IcebergAnalysis,
    sweepAnalysis: SweepDetectionResult,
  ): {
    confidenceAdjustment: number;
    positionSizeMultiplier: number;
    stopLossAdjustment: number;
  } {
    let confidenceAdjustment = 0;
    let positionSizeMultiplier = 1.0;
    let stopLossAdjustment = 0;

    // Passive absorption boosts confidence for bullish POIs
    if (flowClassification.signals.passiveAbsorption) {
      const poiType = this.getPOIType(poi);
      if (poiType === "BULLISH") {
        confidenceAdjustment += 20;
        positionSizeMultiplier *= 1.2;
      }
    }

    // Aggressive pushing adjusts based on direction
    if (flowClassification.signals.aggressivePushing) {
      const poiType = this.getPOIType(poi);
      if (poiType === "BEARISH") {
        confidenceAdjustment += 15;
      } else {
        confidenceAdjustment -= 10;
      }
    }

    // Sweep detection adds confidence
    if (sweepAnalysis.sweeps.length > 0) {
      confidenceAdjustment += Math.min(20, sweepAnalysis.sweeps.length * 5);
    }

    // Iceberg detection requires caution
    if (icebergAnalysis.isIceberg) {
      positionSizeMultiplier *= 0.7;
      stopLossAdjustment = -0.5; // Tighter stop
    }

    // High institutional probability boosts confidence
    if (
      flowClassification.institutionalProbability >=
        this.config.minInstitutionalProbability
    ) {
      confidenceAdjustment += 10;
    }

    return {
      confidenceAdjustment,
      positionSizeMultiplier: Math.max(
        0.5,
        Math.min(1.5, positionSizeMultiplier),
      ),
      stopLossAdjustment,
    };
  }

  /**
   * Get POI type (BULLISH/BEARISH)
   */
  private getPOIType(poi: POI): "BULLISH" | "BEARISH" | "NEUTRAL" {
    if ("type" in poi) {
      const type = (poi as FVG | OrderBlock).type;
      return type === "BULLISH" ? "BULLISH" : "BEARISH";
    }
    if ("strength" in poi) {
      // LiquidityPool
      const lp = poi as LiquidityPool;
      return lp.type === "HIGH" ? "BEARISH" : "BULLISH";
    }
    return "NEUTRAL";
  }

  /**
   * Check veto conditions
   * Requirement 2.4: Flag as ICEBERG_SELL and cancel Long setup
   */
  private checkVetoConditions(
    poi: POI,
    flowValidation: FlowValidation,
    icebergAnalysis: IcebergAnalysis,
    flowClassification: FlowClassificationResult,
  ): {
    vetoed: boolean;
    reason: string | null;
    type: "iceberg" | "flow_conflict" | "low_confidence" | null;
  } {
    const poiType = this.getPOIType(poi);

    // Iceberg veto for Long setups
    if (
      this.config.enableIcebergVeto && icebergAnalysis.isIceberg &&
      poiType === "BULLISH"
    ) {
      return {
        vetoed: true,
        reason: `ICEBERG_SELL detected at POI level (density: ${
          icebergAnalysis.density.toFixed(1)
        }%). Long setup cancelled.`,
        type: "iceberg",
      };
    }

    // Flow conflict veto
    if (
      flowClassification.flowType === "aggressive_pushing" &&
      poiType === "BULLISH"
    ) {
      if (flowClassification.confidence >= 70) {
        return {
          vetoed: true,
          reason: `Aggressive selling detected (confidence: ${
            flowClassification.confidence.toFixed(1)
          }%). Conflicts with bullish POI.`,
          type: "flow_conflict",
        };
      }
    }

    if (
      flowClassification.flowType === "passive_absorption" &&
      poiType === "BEARISH"
    ) {
      if (flowClassification.confidence >= 70) {
        return {
          vetoed: true,
          reason: `Passive absorption detected (confidence: ${
            flowClassification.confidence.toFixed(1)
          }%). Conflicts with bearish POI.`,
          type: "flow_conflict",
        };
      }
    }

    // Low confidence veto
    if (flowValidation.confidence < this.config.minConfidence) {
      return {
        vetoed: true,
        reason: `Flow confidence too low (${
          flowValidation.confidence.toFixed(1)
        }% < ${this.config.minConfidence}%)`,
        type: "low_confidence",
      };
    }

    return {
      vetoed: false,
      reason: null,
      type: null,
    };
  }

  /**
   * Generate recommendation string
   */
  private generateRecommendation(
    poi: POI,
    flowClassification: FlowClassificationResult,
    veto: { vetoed: boolean; reason: string | null },
    isValid: boolean,
  ): string {
    if (veto.vetoed) {
      return `VETO: ${veto.reason}`;
    }

    if (!isValid) {
      return "INVALID: Flow analysis does not confirm POI validity";
    }

    const poiType = this.getPOIType(poi);
    const flowType = flowClassification.flowType;

    if (flowType === "passive_absorption" && poiType === "BULLISH") {
      return `STRONG CONFIRMATION: Passive absorption supports bullish POI (${
        flowClassification.confidence.toFixed(1)
      }% confidence)`;
    }

    if (flowType === "aggressive_pushing" && poiType === "BEARISH") {
      return `STRONG CONFIRMATION: Aggressive selling supports bearish POI (${
        flowClassification.confidence.toFixed(1)
      }% confidence)`;
    }

    if (flowClassification.signals.sweepDetected) {
      return `CONFIRMED: Sweep pattern detected, institutional activity likely`;
    }

    return `VALID: Flow analysis confirms POI (${
      flowClassification.confidence.toFixed(1)
    }% confidence)`;
  }

  // ============================================================================
  // CVD INTEGRATION
  // ============================================================================

  /**
   * Enhance CVD confirmation with institutional flow detection
   * Requirement 2.7: Enhance CVD confirmation with institutional flow detection
   */
  enhanceCVDConfirmation(
    symbol: string,
    trades: CVDTrade[],
    cvdValue: number,
    absorption?: Absorption | null,
    distribution?: Distribution | null,
  ): CVDIntegrationResult {
    return this.flowClassifier.integrateWithCVD(
      symbol,
      trades,
      cvdValue,
      absorption,
      distribution,
    );
  }

  // ============================================================================
  // TRADE PROCESSING
  // ============================================================================

  /**
   * Process incoming trade for all analyzers
   */
  processTrade(trade: CVDTrade): void {
    this.footprintAnalyzer.addTrade(trade);
    this.sweepDetector.addTrade(trade);
  }

  /**
   * Process multiple trades
   */
  processTrades(trades: CVDTrade[]): void {
    for (const trade of trades) {
      this.processTrade(trade);
    }
  }

  // ============================================================================
  // EVENT EMISSION
  // ============================================================================

  /**
   * Emit flow validation event
   * Requirement 2.7: Add flow validation events and logging
   */
  private emitValidationEvent(symbol: string, result: POIFlowValidation): void {
    const event: FlowValidationEvent = {
      symbol,
      timestamp: new Date(),
      flowType: result.flowValidation.flowType,
      confidence: result.confidence,
      institutionalProbability: result.flowValidation.institutionalProbability,
      sweepCount: result.flowValidation.sweepCount,
      icebergDetected: result.icebergAnalysis?.isIceberg || false,
      cvdConfirmed: result.flowValidation.isValid,
    };

    this.emit("flowValidated", event);

    // Log validation
    console.log(
      `🔍 Flow Validation [${symbol}]: ${result.flowValidation.flowType} ` +
        `(${result.confidence.toFixed(1)}% confidence, ` +
        `${
          result.flowValidation.institutionalProbability.toFixed(1)
        }% institutional)`,
    );

    if (result.veto.vetoed) {
      console.log(`⛔ VETO: ${result.veto.reason}`);
      this.emit("flowVeto", {
        symbol,
        reason: result.veto.reason,
        type: result.veto.type,
      });
    }
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  /**
   * Update internal statistics
   */
  private updateStats(result: POIFlowValidation): void {
    this.validationCount++;
    this.confidenceSum += result.confidence;
    this.lastValidation = new Date();

    if (result.veto.vetoed) {
      this.vetoCount++;
    }
  }

  /**
   * Get validator state
   */
  getState(): AdvancedFlowValidatorState {
    return {
      enabled: this.config.enabled,
      symbolsTracked: this.footprintAnalyzer.getStats().symbolsTracked,
      lastValidation: this.lastValidation,
      totalValidations: this.validationCount,
      vetoCount: this.vetoCount,
      avgConfidence: this.validationCount > 0
        ? this.confidenceSum / this.validationCount
        : 0,
    };
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): {
    state: AdvancedFlowValidatorState;
    footprint: ReturnType<FootprintAnalyzer["getStats"]>;
    sweep: ReturnType<SweepDetector["getStats"]>;
    iceberg: ReturnType<IcebergDetector["getStats"]>;
    classifier: ReturnType<InstitutionalFlowClassifier["getStats"]>;
  } {
    return {
      state: this.getState(),
      footprint: this.footprintAnalyzer.getStats(),
      sweep: this.sweepDetector.getStats(),
      iceberg: this.icebergDetector.getStats(),
      classifier: this.flowClassifier.getStats(),
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Create disabled result
   */
  private createDisabledResult(poi: POI): POIFlowValidation {
    return {
      poi,
      flowValidation: {
        isValid: true,
        confidence: 100,
        flowType: "neutral",
        sweepCount: 0,
        icebergDensity: 0,
        institutionalProbability: 0,
        timestamp: new Date(),
      },
      footprintAnalysis: null,
      sweepAnalysis: null,
      icebergAnalysis: null,
      isValid: true,
      confidence: 100,
      adjustments: {
        confidenceAdjustment: 0,
        positionSizeMultiplier: 1.0,
        stopLossAdjustment: 0,
      },
      veto: {
        vetoed: false,
        reason: null,
        type: null,
      },
      recommendation:
        "Advanced Flow Validator disabled - using default validation",
    };
  }

  /**
   * Check if validator is healthy
   */
  isHealthy(): boolean {
    if (!this.config.enabled) return true;

    // Check if we have recent validations
    if (this.lastValidation) {
      const staleness = Date.now() - this.lastValidation.getTime();
      if (staleness > 300000) {
        // 5 minutes
        return false;
      }
    }

    return true;
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AdvancedFlowValidatorConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit("configUpdated", this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): AdvancedFlowValidatorConfig {
    return { ...this.config };
  }

  /**
   * Get component analyzers
   */
  getAnalyzers(): {
    footprint: FootprintAnalyzer;
    sweep: SweepDetector;
    iceberg: IcebergDetector;
    classifier: InstitutionalFlowClassifier;
  } {
    return {
      footprint: this.footprintAnalyzer,
      sweep: this.sweepDetector,
      iceberg: this.icebergDetector,
      classifier: this.flowClassifier,
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.footprintAnalyzer.destroy();
    this.sweepDetector.destroy();
    this.icebergDetector.destroy();
    this.flowClassifier.destroy();
    this.removeAllListeners();
  }
}
