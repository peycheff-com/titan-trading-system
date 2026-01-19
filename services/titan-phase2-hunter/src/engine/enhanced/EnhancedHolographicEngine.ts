/**
 * EnhancedHolographicEngine - Main Integration Component
 *
 * Integrates all 2026 enhancement layers (Oracle, Flow, BotTrap, Global CVD)
 * with the existing Phase 2 Holographic Engine to create a unified
 * institutional-grade trading system.
 *
 * Requirements:
 * - 5.1: Enhanced scoring formula with Oracle, Flow, BotTrap, and Global CVD
 * - 5.2: Alignment classification with enhanced criteria
 * - 5.3: Extend existing holographic state with 2026 enhancement data
 * - 5.4: Integrate all enhancement layers into signal validation
 * - 5.5: Create conflict resolution logic between enhancement layers
 * - 5.6: Add enhanced signal confidence calculation
 * - 5.7: Enhanced logging and event emission
 * - 7.1-7.7: Conviction-based position sizing
 */

import { EventEmitter } from "events";
import {
  BotTrapAnalysis,
  ConvictionSizing,
  EnhancedHolographicState,
  FlowValidation,
  GlobalCVDData,
  OracleScore,
  TechnicalSignal,
} from "../../types";
import { HologramState } from "../../types";
import { HologramEngine } from "../HologramEngine";
import { Oracle } from "../../oracle";
import { AdvancedFlowValidator } from "../../flow";
import { BotTrapDetector } from "../../bottrap";
import { GlobalLiquidityAggregator } from "../../global-liquidity";
import {
  EnhancedScoringEngine,
  ScoringBreakdown,
} from "./EnhancedScoringEngine";
import { ConvictionSizingEngine } from "./ConvictionSizingEngine";
import {
  EnhancedSignalValidator,
  EnhancedValidationResult,
} from "./EnhancedSignalValidator";
import { Logger } from "../../logging/Logger";

/**
 * Enhanced Holographic Engine configuration
 */
export interface EnhancedHolographicEngineConfig {
  enabled: boolean;
  enableOracle: boolean;
  enableFlowValidator: boolean;
  enableBotTrapDetector: boolean;
  enableGlobalCVD: boolean;
  fallbackToClassic: boolean;
  basePositionSize: number;
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Enhanced analysis result
 */
export interface EnhancedAnalysisResult {
  state: EnhancedHolographicState;
  scoring: ScoringBreakdown;
  validation: EnhancedValidationResult | null;
  sizing: ConvictionSizing | null;
  timestamp: Date;
}

/**
 * Default configuration
 */
export const DEFAULT_ENHANCED_ENGINE_CONFIG: EnhancedHolographicEngineConfig = {
  enabled: true,
  enableOracle: true,
  enableFlowValidator: true,
  enableBotTrapDetector: true,
  enableGlobalCVD: true,
  fallbackToClassic: true,
  basePositionSize: 1000,
  logLevel: "info",
};

/**
 * EnhancedHolographicEngine - Unified 2026 Enhancement Integration
 *
 * This is the main integration component that combines:
 * - Classic Phase 2 Holographic Engine
 * - Oracle (Prediction Market Integration)
 * - Advanced Flow Validator
 * - Bot Trap Detector
 * - Global Liquidity Aggregator
 *
 * Into a single, cohesive trading analysis system.
 */
export class EnhancedHolographicEngine extends EventEmitter {
  private config: EnhancedHolographicEngineConfig;
  private logger: Logger;

  // Core components
  private hologramEngine: HologramEngine | null = null;
  private oracle: Oracle | null = null;
  private flowValidator: AdvancedFlowValidator | null = null;
  private botTrapDetector: BotTrapDetector | null = null;
  private globalAggregator: GlobalLiquidityAggregator | null = null;

  // Enhancement engines
  private scoringEngine: EnhancedScoringEngine;
  private sizingEngine: ConvictionSizingEngine;
  private signalValidator: EnhancedSignalValidator;

  // State tracking
  private isInitialized: boolean = false;
  private lastAnalysis: Map<string, EnhancedAnalysisResult> = new Map();

  constructor(
    config: Partial<EnhancedHolographicEngineConfig> = {},
    logger?: Logger,
  ) {
    super();
    this.config = { ...DEFAULT_ENHANCED_ENGINE_CONFIG, ...config };
    this.logger = logger || new Logger({ enableConsoleOutput: true });

    // Initialize enhancement engines
    this.scoringEngine = new EnhancedScoringEngine();
    this.sizingEngine = new ConvictionSizingEngine({
      basePositionSize: this.config.basePositionSize,
    });
    this.signalValidator = new EnhancedSignalValidator();

    this.setupEventForwarding();
  }

  /**
   * Set the classic Hologram Engine
   */
  setHologramEngine(engine: HologramEngine): void {
    this.hologramEngine = engine;
  }

  // Regime tracking
  private currentRegime: string = "STABLE";
  private currentAlpha: number = 3.0;

  /**
   * Update market regime from Power Law Lab
   */
  updateMarketRegime(regime: string, alpha: number): void {
    const changed = this.currentRegime !== regime ||
      Math.abs(this.currentAlpha - alpha) > 0.1;
    this.currentRegime = regime;
    this.currentAlpha = alpha;

    if (changed) {
      this.logInfo(
        `Market Regime Updated: ${regime} (Alpha: ${alpha.toFixed(2)})`,
      );
      this.emit("regimeUpdated", { regime, alpha });
    }
  }

  /**
   * Set the Oracle component
   */
  setOracle(oracle: Oracle): void {
    this.oracle = oracle;
    this.setupOracleEvents();
  }

  /**
   * Set the Advanced Flow Validator
   */
  setFlowValidator(validator: AdvancedFlowValidator): void {
    this.flowValidator = validator;
    this.setupFlowValidatorEvents();
  }

  /**
   * Set the Bot Trap Detector
   */
  setBotTrapDetector(detector: BotTrapDetector): void {
    this.botTrapDetector = detector;
    this.setupBotTrapEvents();
  }

  /**
   * Set the Global Liquidity Aggregator
   */
  setGlobalAggregator(aggregator: GlobalLiquidityAggregator): void {
    this.globalAggregator = aggregator;
    this.setupGlobalAggregatorEvents();
  }

  /**
   * Initialize the Enhanced Holographic Engine
   */
  async initialize(): Promise<boolean> {
    if (!this.config.enabled) {
      this.logInfo("Enhanced Holographic Engine is disabled");
      return false;
    }

    this.logInfo("Initializing Enhanced Holographic Engine...");

    try {
      // Initialize Oracle if enabled
      if (this.config.enableOracle && this.oracle) {
        await this.oracle.initialize();
        this.logInfo("Oracle initialized");
      }

      // Initialize Global Aggregator if enabled
      if (this.config.enableGlobalCVD && this.globalAggregator) {
        await this.globalAggregator.initialize();
        this.logInfo("Global Liquidity Aggregator initialized");
      }

      this.isInitialized = true;
      this.emit("initialized");
      this.logInfo("Enhanced Holographic Engine initialized successfully");
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      this.logError(
        "Failed to initialize Enhanced Holographic Engine",
        errorMsg,
      );

      if (this.config.fallbackToClassic) {
        this.logInfo("Falling back to classic Phase 2 mode");
        this.isInitialized = true;
        return true;
      }

      return false;
    }
  }

  /**
   * Calculate Enhanced Holographic State for a symbol
   * Requirement 5.3: Extend existing holographic state with 2026 enhancement data
   */
  async calculateEnhancedState(
    symbol: string,
  ): Promise<EnhancedHolographicState> {
    // Get classic hologram state
    let classicHologram: HologramState | null = null;
    if (this.hologramEngine) {
      try {
        classicHologram = await this.hologramEngine.analyze(symbol);
      } catch (error) {
        this.logError(
          "Failed to get classic hologram",
          (error as Error).message,
        );
      }
    }

    // Get enhancement data
    const oracleScore = await this.getOracleScore(symbol);
    const flowValidation = await this.getFlowValidation(symbol);
    const botTrapAnalysis = await this.getBotTrapAnalysis(symbol);
    const globalCVD = await this.getGlobalCVD(symbol);

    // Calculate enhanced scoring
    const scoring = this.scoringEngine.calculateEnhancedScore(
      classicHologram!,
      oracleScore,
      flowValidation,
      botTrapAnalysis,
      globalCVD,
      this.currentRegime,
      this.currentAlpha,
    );

    // Determine alignment and conviction
    const alignment = this.scoringEngine.determineAlignment(
      scoring.adjustedScore,
      oracleScore,
      botTrapAnalysis,
      globalCVD,
      flowValidation,
      this.currentRegime,
      this.currentAlpha,
    );

    const convictionLevel = this.scoringEngine.determineConvictionLevel(
      scoring.adjustedScore,
      oracleScore,
      globalCVD,
    );

    // Build enhanced state
    const enhancedState: EnhancedHolographicState = {
      classicState: classicHologram,
      symbol,
      dailyBias: this.mapTrendToBias(classicHologram?.daily.trend || "RANGE"),
      fourHourLocation: this.mapLocation(
        classicHologram?.h4.location || "EQUILIBRIUM",
      ),
      fifteenMinTrigger: this.mapTrendToTrigger(
        classicHologram?.m15.trend || "RANGE",
      ),
      oracleScore,
      flowValidation,
      botTrapAnalysis,
      globalCVD,
      classicScore: classicHologram?.alignmentScore || 0,
      enhancedScore: scoring.adjustedScore,
      convictionLevel,
      alignment,
      rsScore: classicHologram?.rsScore || 0,
      timestamp: new Date(),
      enhancementsActive: this.areEnhancementsActive(),
      regime: this.currentRegime,
      alpha: this.currentAlpha,
    };

    // Log enhanced state
    this.logEnhancedState(enhancedState, scoring);

    // Emit event
    this.emit("enhancedStateCalculated", enhancedState);

    return enhancedState;
  }

  /**
   * Validate a trading signal with all enhancement layers
   * Requirement 5.4: Integrate all enhancement layers into signal validation
   */
  async validateSignal(
    signal: TechnicalSignal,
  ): Promise<EnhancedValidationResult> {
    // Get enhancement data
    const oracleScore = await this.getOracleScore(signal.symbol);
    const flowValidation = await this.getFlowValidation(signal.symbol);
    const botTrapAnalysis = await this.getBotTrapAnalysis(signal.symbol);
    const globalCVD = await this.getGlobalCVD(signal.symbol);

    // Validate signal
    const validation = this.signalValidator.validateSignal(
      signal,
      oracleScore,
      flowValidation,
      botTrapAnalysis,
      globalCVD,
    );

    // Log validation result
    this.logValidationResult(signal, validation);

    // Emit event
    this.emit("signalValidated", { signal, validation });

    return validation;
  }

  /**
   * Calculate conviction-based position sizing
   * Requirements 7.1-7.7: Conviction-based position sizing
   */
  async calculatePositionSize(
    baseSize: number,
    symbol: string,
  ): Promise<ConvictionSizing> {
    // Get enhancement data
    const oracleScore = await this.getOracleScore(symbol);
    const flowValidation = await this.getFlowValidation(symbol);
    const botTrapAnalysis = await this.getBotTrapAnalysis(symbol);
    const globalCVD = await this.getGlobalCVD(symbol);

    // Calculate position size
    const sizing = this.sizingEngine.calculatePositionSize(
      baseSize,
      oracleScore,
      flowValidation,
      botTrapAnalysis,
      globalCVD,
    );

    // Log to JSONL file (Requirement 7.7)
    this.logger.logConvictionSizing(symbol, sizing);

    // Emit event
    this.emit("positionSizeCalculated", { symbol, sizing });

    return sizing;
  }

  /**
   * Perform complete enhanced analysis
   */
  async analyzeComplete(
    symbol: string,
    signal?: TechnicalSignal,
  ): Promise<EnhancedAnalysisResult> {
    // Calculate enhanced state
    const state = await this.calculateEnhancedState(symbol);

    // Get scoring breakdown
    const oracleScore = state.oracleScore;
    const flowValidation = state.flowValidation;
    const botTrapAnalysis = state.botTrapAnalysis;
    const globalCVD = state.globalCVD;

    // Get classic hologram for scoring
    let classicHologram: HologramState | null = null;
    if (this.hologramEngine) {
      try {
        classicHologram = await this.hologramEngine.analyze(symbol);
      } catch (error) {
        // Ignore error, use null
      }
    }

    const scoring = this.scoringEngine.calculateEnhancedScore(
      classicHologram!,
      oracleScore,
      flowValidation,
      botTrapAnalysis,
      globalCVD,
    );

    // Validate signal if provided
    let validation: EnhancedValidationResult | null = null;
    if (signal) {
      validation = await this.validateSignal(signal);
    }

    // Calculate position sizing
    const sizing = await this.calculatePositionSize(
      this.config.basePositionSize,
      symbol,
    );

    const result: EnhancedAnalysisResult = {
      state,
      scoring,
      validation,
      sizing,
      timestamp: new Date(),
    };

    // Cache result
    this.lastAnalysis.set(symbol, result);

    // Emit comprehensive event
    this.emit("analysisComplete", result);

    return result;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get Oracle score for a symbol
   */
  private async getOracleScore(symbol: string): Promise<OracleScore | null> {
    if (!this.config.enableOracle || !this.oracle) {
      return null;
    }

    try {
      // Create a dummy signal for Oracle evaluation
      const dummySignal: TechnicalSignal = {
        symbol,
        direction: "LONG", // Will be evaluated for both directions
        confidence: 50,
        entryPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        timestamp: new Date(),
        source: "hologram",
      };

      return await this.oracle.evaluateSignal(dummySignal);
    } catch (error) {
      this.logError("Failed to get Oracle score", (error as Error).message);
      return null;
    }
  }

  /**
   * Get Flow validation for a symbol
   */
  private async getFlowValidation(
    _symbol: string,
  ): Promise<FlowValidation | null> {
    if (!this.config.enableFlowValidator || !this.flowValidator) {
      return null;
    }

    try {
      const state = this.flowValidator.getState();
      // Build a FlowValidation from the validator state
      if (state.lastValidation) {
        return {
          isValid: true,
          confidence: state.avgConfidence,
          flowType: "neutral",
          sweepCount: 0,
          icebergDensity: 0,
          institutionalProbability: 0,
          timestamp: state.lastValidation,
        };
      }
      return null;
    } catch (error) {
      this.logError("Failed to get Flow validation", (error as Error).message);
      return null;
    }
  }

  /**
   * Get Bot Trap analysis for a symbol
   */
  private async getBotTrapAnalysis(
    _symbol: string,
  ): Promise<BotTrapAnalysis | null> {
    if (!this.config.enableBotTrapDetector || !this.botTrapDetector) {
      return null;
    }

    try {
      // Get learning statistics to build analysis
      const stats = this.botTrapDetector.getLearningStatistics();
      const detectionRate = this.botTrapDetector.getTrapDetectionRate();

      return {
        isSuspect: detectionRate > 0.5,
        suspicionScore: detectionRate * 100,
        patterns: [],
        recommendations: [],
        timestamp: new Date(),
      };
    } catch (error) {
      this.logError(
        "Failed to get Bot Trap analysis",
        (error as Error).message,
      );
      return null;
    }
  }

  /**
   * Get Global CVD for a symbol
   */
  private async getGlobalCVD(symbol: string): Promise<GlobalCVDData | null> {
    if (!this.config.enableGlobalCVD || !this.globalAggregator) {
      return null;
    }

    try {
      return this.globalAggregator.getGlobalCVD(symbol);
    } catch (error) {
      this.logError("Failed to get Global CVD", (error as Error).message);
      return null;
    }
  }

  /**
   * Check if enhancements are active
   */
  private areEnhancementsActive(): boolean {
    return (
      (this.config.enableOracle && this.oracle !== null) ||
      (this.config.enableFlowValidator && this.flowValidator !== null) ||
      (this.config.enableBotTrapDetector && this.botTrapDetector !== null) ||
      (this.config.enableGlobalCVD && this.globalAggregator !== null)
    );
  }

  /**
   * Map trend to bias
   */
  private mapTrendToBias(trend: string): "BULL" | "BEAR" | "RANGE" {
    if (trend === "BULL") return "BULL";
    if (trend === "BEAR") return "BEAR";
    return "RANGE";
  }

  /**
   * Map location
   */
  private mapLocation(
    location: string,
  ): "PREMIUM" | "DISCOUNT" | "EQUILIBRIUM" {
    if (location === "PREMIUM") return "PREMIUM";
    if (location === "DISCOUNT") return "DISCOUNT";
    return "EQUILIBRIUM";
  }

  /**
   * Map trend to trigger
   */
  private mapTrendToTrigger(trend: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
    if (trend === "BULL") return "BULLISH";
    if (trend === "BEAR") return "BEARISH";
    return "NEUTRAL";
  }

  // ============================================================================
  // EVENT SETUP
  // ============================================================================

  private setupEventForwarding(): void {
    this.scoringEngine.on("configUpdated", (config) => {
      this.emit("scoringConfigUpdated", config);
    });

    this.sizingEngine.on("sizingCalculated", (sizing) => {
      this.emit("sizingCalculated", sizing);
    });

    this.signalValidator.on("signalValidated", (result) => {
      this.emit("validationComplete", result);
    });
  }

  private setupOracleEvents(): void {
    if (!this.oracle) return;

    this.oracle.on(
      "signalEvaluated",
      (data: { signal: TechnicalSignal; score: OracleScore }) => {
        this.emit("oracleEvaluation", data);
      },
    );

    this.oracle.on("connectionError", (error: Error) => {
      this.logError("Oracle connection error", error.message);
    });
  }

  private setupFlowValidatorEvents(): void {
    if (!this.flowValidator) return;

    this.flowValidator.on("flowValidated", (data: FlowValidation) => {
      this.emit("flowValidation", data);
    });
  }

  private setupBotTrapEvents(): void {
    if (!this.botTrapDetector) return;

    this.botTrapDetector.on("trapDetected", (data: BotTrapAnalysis) => {
      this.emit("botTrapDetected", data);
    });
  }

  private setupGlobalAggregatorEvents(): void {
    if (!this.globalAggregator) return;

    this.globalAggregator.on("globalCVDUpdate", (data: GlobalCVDData) => {
      this.emit("globalCVDUpdate", data);
    });

    this.globalAggregator.on(
      "manipulationDetected",
      (data: { symbol: string; analysis: GlobalCVDData["manipulation"] }) => {
        this.emit("manipulationDetected", data);
      },
    );
  }

  // ============================================================================
  // LOGGING
  // ============================================================================

  /**
   * Log enhanced state
   * Requirement 5.7: Enhanced logging and event emission
   */
  private logEnhancedState(
    state: EnhancedHolographicState,
    scoring: ScoringBreakdown,
  ): void {
    // Log to JSONL file
    this.logger.logEnhancedHologram(state.symbol, {
      classicScore: state.classicScore,
      enhancedScore: state.enhancedScore,
      alignment: state.alignment,
      convictionLevel: state.convictionLevel,
      oracleScore: state.oracleScore,
      flowValidation: state.flowValidation
        ? {
          flowType: state.flowValidation.flowType,
          confidence: state.flowValidation.confidence,
          institutionalProbability:
            state.flowValidation.institutionalProbability,
        }
        : null,
      botTrapAnalysis: state.botTrapAnalysis
        ? {
          isSuspect: state.botTrapAnalysis.isSuspect,
          suspicionScore: state.botTrapAnalysis.suspicionScore,
        }
        : null,
      globalCVD: state.globalCVD
        ? {
          consensus: state.globalCVD.consensus,
          confidence: state.globalCVD.confidence,
          manipulation: state.globalCVD.manipulation,
        }
        : null,
      enhancementsActive: state.enhancementsActive,
    });

    // Logging handled by this.logger.logEnhancedHologram above
    if (this.config.logLevel === "debug") {
      this.logInfo(`Enhanced State Calculated for ${state.symbol}`);
    }
  }

  /**
   * Log validation result
   */
  private logValidationResult(
    signal: TechnicalSignal,
    validation: EnhancedValidationResult,
  ): void {
    if (this.config.logLevel === "error") return;

    // Log validation result through logger
    this.logger.info(
      `✅ Signal Validation: ${signal.symbol} ${signal.direction} (${
        validation.isValid ? "VALID" : "INVALID"
      })`,
      {
        validation,
      },
    );
  }

  private logInfo(message: string): void {
    if (this.config.logLevel === "error" || this.config.logLevel === "warn") {
      return;
    }
    this.logger.info(message, { component: "EnhancedHolographicEngine" });
  }

  private logError(message: string, details: string): void {
    this.logger.error(message, new Error(details), undefined, {
      component: "EnhancedHolographicEngine",
    });
  }

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EnhancedHolographicEngineConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.basePositionSize !== undefined) {
      this.sizingEngine.updateConfig({
        basePositionSize: config.basePositionSize,
      });
    }

    this.emit("configUpdated", this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): EnhancedHolographicEngineConfig {
    return { ...this.config };
  }

  /**
   * Get last analysis for a symbol
   */
  getLastAnalysis(symbol: string): EnhancedAnalysisResult | null {
    return this.lastAnalysis.get(symbol) || null;
  }

  /**
   * Check if engine is ready
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Shutdown the engine
   */
  async shutdown(): Promise<void> {
    this.logInfo("Shutting down Enhanced Holographic Engine...");

    if (this.oracle) {
      this.oracle.stopPeriodicUpdates();
    }

    if (this.globalAggregator) {
      await this.globalAggregator.shutdown();
    }

    this.isInitialized = false;
    this.emit("shutdown");
  }
}
