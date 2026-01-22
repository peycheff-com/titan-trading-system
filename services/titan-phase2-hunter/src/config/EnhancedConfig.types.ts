import { EventCategory } from "../../types";

/**
 * Oracle configuration
 * Requirement 16.1: Allow adjustment of Prediction Veto threshold (30-70%)
 */
export interface OracleConfig {
    readonly enabled: boolean;
    readonly polymarketApiKey: string;
    readonly vetoThreshold: number; // 30-70%
    readonly convictionMultiplierMax: number; // 1.0-2.0
    readonly eventCategories: readonly EventCategory[];
    readonly updateInterval: number; // seconds
    readonly btcCrashVetoThreshold: number; // 40% default
    readonly btcAthBoostThreshold: number; // 60% default
    readonly conflictThreshold: number; // 40 points default
    readonly probabilityChangeThreshold: number; // 10% default
    readonly monitoringInterval: number; // seconds (default same as updateInterval)
}

/**
 * Flow Validator configuration
 * Requirement 16.2: Allow adjustment of Sweep Detection threshold (3-10 levels)
 */
export interface FlowValidatorConfig {
    readonly enabled: boolean;
    readonly sweepThreshold: number; // 3-10 levels
    readonly icebergDensityThreshold: number; // 0-100
    readonly footprintAnalysisDepth: number; // price levels
    readonly institutionalThreshold: number; // 0-100
    readonly passiveAbsorptionMinRatio: number; // 0-1
}

/**
 * Bot Trap Detector configuration
 * Requirement 16.3: Allow adjustment of precision tolerance (0.1-1%)
 */
export interface BotTrapConfig {
    readonly enabled: boolean;
    readonly precisionThreshold: number; // 0.1-1.0%
    readonly suspicionThreshold: number; // 0-100
    readonly learningEnabled: boolean;
    readonly adaptiveAdjustments: boolean;
    readonly positionSizeReduction: number; // 0.5 default (50% reduction)
    readonly stopLossTightening: number; // 1.0% default
    readonly confirmationThresholdIncrease: number; // 50% default
}

/**
 * Global Aggregator configuration
 * Requirement 16.4: Allow weighting adjustment for each exchange (20-50%)
 */
export interface GlobalAggregatorConfig {
    readonly enabled: boolean;
    readonly exchanges: readonly ("binance" | "coinbase" | "kraken")[];
    readonly exchangeWeights: {
        readonly binance: number; // 20-50%
        readonly coinbase: number; // 20-50%
        readonly kraken: number; // 20-50%
    };
    readonly weightingMethod: "volume" | "liquidity" | "hybrid";
    readonly consensusThreshold: number; // 0.5-1.0 (2 out of 3 = 0.67)
    readonly manipulationSensitivity: number; // 0-100
    readonly reconnectInterval: number; // milliseconds
}

/**
 * Conviction Multiplier configuration
 * Requirement 16.5: Allow range adjustment (1.0x-2.0x maximum)
 */
export interface ConvictionConfig {
    readonly enabled: boolean;
    readonly minMultiplier: number; // 1.0
    readonly maxMultiplier: number; // 2.0
    readonly oracleAlignmentBonus: number; // 1.5x default
    readonly globalCVDBonus: number; // 1.2x default
    readonly trapReduction: number; // 0.5x default
}

/**
 * Enhanced Risk Management configuration
 * Requirement 8.1-8.7: Enhanced risk management with prediction awareness
 */
export interface EnhancedRiskConfig {
    readonly highImpactEventThreshold: number; // 70% default
    readonly highImpactPositionReduction: number; // 50% default
    readonly extremeUncertaintyStopLoss: number; // 1.0% default
    readonly globalCVDMonitoringInterval: number; // 5 seconds default
    readonly botTrapFrequencyThreshold: number; // 80% default
    readonly multiExchangeFailureHalt: boolean;
    readonly oracleUnstableConservativeMode: boolean;
    readonly eventProximityThreshold: number; // 60 minutes default
}

/**
 * Emergency Protocol configuration
 * Requirement 14.1-14.7: Emergency protocols for enhanced system
 */
export interface EmergencyConfig {
    readonly predictionEmergencyThreshold: number; // 90% default
    readonly liquidityEmergencyExchangeCount: number; // 2 default
    readonly flowEmergencyDivergenceThreshold: number; // 0-100
    readonly trapSaturationThreshold: number; // 80% default
    readonly autoFlattenOnEmergency: boolean;
    readonly notifyOnEmergency: boolean;
}

/**
 * Complete Enhanced 2026 Configuration
 */
export interface Enhanced2026Config {
    readonly oracle: OracleConfig;
    readonly flowValidator: FlowValidatorConfig;
    readonly botTrapDetector: BotTrapConfig;
    readonly globalAggregator: GlobalAggregatorConfig;
    readonly conviction: ConvictionConfig;
    readonly enhancedRisk: EnhancedRiskConfig;
    readonly emergency: EmergencyConfig;
    readonly version: number;
    readonly lastModified: number;
}

/**
 * Configuration validation result
 */
export interface Enhanced2026ValidationResult {
    readonly isValid: boolean;
    readonly errors: readonly string[];
    readonly warnings: readonly string[];
}

/**
 * Configuration change event
 */
export interface Enhanced2026ConfigChangeEvent {
    readonly section: keyof Enhanced2026Config | "all";
    readonly oldValue: unknown;
    readonly newValue: unknown;
    readonly timestamp: number;
}
