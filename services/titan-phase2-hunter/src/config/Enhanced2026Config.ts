/**
 * Enhanced Configuration for Titan Phase 2 - 2026 Modernization
 *
 * Provides configuration management for all 2026 enhancement layers:
 * 1. Oracle - Prediction Market Integration
 * 2. Advanced Flow Validator - Footprint & Sweep Detection
 * 3. Bot Trap Pattern Recognition
 * 4. Global Liquidity Aggregator
 *
 * Requirements: 16.1-16.7 (Configuration Management for Enhanced Features)
 */

import { EventEmitter } from "events";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unwatchFile,
  watchFile,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { EventCategory } from "../types";

// ============================================================================
// CONFIGURATION INTERFACES
// ============================================================================

/**
 * Oracle configuration
 * Requirement 16.1: Allow adjustment of Prediction Veto threshold (30-70%)
 */
export interface OracleConfig {
  enabled: boolean;
  polymarketApiKey: string;
  vetoThreshold: number; // 30-70%
  convictionMultiplierMax: number; // 1.0-2.0
  eventCategories: EventCategory[];
  updateInterval: number; // seconds
  btcCrashVetoThreshold: number; // 40% default
  btcAthBoostThreshold: number; // 60% default
  conflictThreshold: number; // 40 points default
  probabilityChangeThreshold: number; // 10% default
  monitoringInterval: number; // seconds (default same as updateInterval)
}

/**
 * Flow Validator configuration
 * Requirement 16.2: Allow adjustment of Sweep Detection threshold (3-10 levels)
 */
export interface FlowValidatorConfig {
  enabled: boolean;
  sweepThreshold: number; // 3-10 levels
  icebergDensityThreshold: number; // 0-100
  footprintAnalysisDepth: number; // price levels
  institutionalThreshold: number; // 0-100
  passiveAbsorptionMinRatio: number; // 0-1
}

/**
 * Bot Trap Detector configuration
 * Requirement 16.3: Allow adjustment of precision tolerance (0.1-1%)
 */
export interface BotTrapConfig {
  enabled: boolean;
  precisionThreshold: number; // 0.1-1.0%
  suspicionThreshold: number; // 0-100
  learningEnabled: boolean;
  adaptiveAdjustments: boolean;
  positionSizeReduction: number; // 0.5 default (50% reduction)
  stopLossTightening: number; // 1.0% default
  confirmationThresholdIncrease: number; // 50% default
}

/**
 * Global Aggregator configuration
 * Requirement 16.4: Allow weighting adjustment for each exchange (20-50%)
 */
export interface GlobalAggregatorConfig {
  enabled: boolean;
  exchanges: ("binance" | "coinbase" | "kraken")[];
  exchangeWeights: {
    binance: number; // 20-50%
    coinbase: number; // 20-50%
    kraken: number; // 20-50%
  };
  weightingMethod: "volume" | "liquidity" | "hybrid";
  consensusThreshold: number; // 0.5-1.0 (2 out of 3 = 0.67)
  manipulationSensitivity: number; // 0-100
  reconnectInterval: number; // milliseconds
}

/**
 * Conviction Multiplier configuration
 * Requirement 16.5: Allow range adjustment (1.0x-2.0x maximum)
 */
export interface ConvictionConfig {
  enabled: boolean;
  minMultiplier: number; // 1.0
  maxMultiplier: number; // 2.0
  oracleAlignmentBonus: number; // 1.5x default
  globalCVDBonus: number; // 1.2x default
  trapReduction: number; // 0.5x default
}

/**
 * Enhanced Risk Management configuration
 * Requirement 8.1-8.7: Enhanced risk management with prediction awareness
 */
export interface EnhancedRiskConfig {
  highImpactEventThreshold: number; // 70% default
  highImpactPositionReduction: number; // 50% default
  extremeUncertaintyStopLoss: number; // 1.0% default
  globalCVDMonitoringInterval: number; // 5 seconds default
  botTrapFrequencyThreshold: number; // 80% default
  multiExchangeFailureHalt: boolean;
  oracleUnstableConservativeMode: boolean;
  eventProximityThreshold: number; // 60 minutes default
}

/**
 * Emergency Protocol configuration
 * Requirement 14.1-14.7: Emergency protocols for enhanced system
 */
export interface EmergencyConfig {
  predictionEmergencyThreshold: number; // 90% default
  liquidityEmergencyExchangeCount: number; // 2 default
  flowEmergencyDivergenceThreshold: number; // 0-100
  trapSaturationThreshold: number; // 80% default
  autoFlattenOnEmergency: boolean;
  notifyOnEmergency: boolean;
}

/**
 * Complete Enhanced 2026 Configuration
 */
export interface Enhanced2026Config {
  oracle: OracleConfig;
  flowValidator: FlowValidatorConfig;
  botTrapDetector: BotTrapConfig;
  globalAggregator: GlobalAggregatorConfig;
  conviction: ConvictionConfig;
  enhancedRisk: EnhancedRiskConfig;
  emergency: EmergencyConfig;
  version: number;
  lastModified: number;
}

/**
 * Configuration validation result
 */
export interface Enhanced2026ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Configuration change event
 */
export interface Enhanced2026ConfigChangeEvent {
  section: keyof Enhanced2026Config | "all";
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

/**
 * Default configuration values for 2026 enhancements
 */
export const DEFAULT_ENHANCED_2026_CONFIG: Enhanced2026Config = {
  oracle: {
    enabled: true,
    polymarketApiKey: "",
    vetoThreshold: 40, // 40% conflict threshold for veto
    convictionMultiplierMax: 1.5,
    eventCategories: [
      EventCategory.CRYPTO_PRICE,
      EventCategory.FED_POLICY,
      EventCategory.REGULATORY,
    ],
    updateInterval: 60, // 60 seconds
    btcCrashVetoThreshold: 40, // Requirement 1.6
    btcAthBoostThreshold: 60, // Requirement 1.7
    conflictThreshold: 40, // Requirement 1.5
    probabilityChangeThreshold: 10, // Requirement 11.1
    monitoringInterval: 60,
  },
  flowValidator: {
    enabled: true,
    sweepThreshold: 5, // Requirement 2.2: 5+ levels
    icebergDensityThreshold: 70,
    footprintAnalysisDepth: 20,
    institutionalThreshold: 60,
    passiveAbsorptionMinRatio: 0.6,
  },
  botTrapDetector: {
    enabled: true,
    precisionThreshold: 0.5, // 0.5%
    suspicionThreshold: 70,
    learningEnabled: true,
    adaptiveAdjustments: true,
    positionSizeReduction: 0.5, // Requirement 3.5: 50% reduction
    stopLossTightening: 1.0, // Requirement 3.5: 1% stop loss
    confirmationThresholdIncrease: 50, // Requirement 3.6: 50% increase
  },
  globalAggregator: {
    enabled: true,
    exchanges: ["binance", "coinbase", "kraken"],
    exchangeWeights: {
      binance: 40,
      coinbase: 35,
      kraken: 25,
    },
    weightingMethod: "volume",
    consensusThreshold: 0.67, // Requirement 4.4: 2 out of 3
    manipulationSensitivity: 70,
    reconnectInterval: 5000,
  },
  conviction: {
    enabled: true,
    minMultiplier: 1.0,
    maxMultiplier: 2.0, // Requirement 7.5: cap at 2.0x
    oracleAlignmentBonus: 1.5, // Requirement 1.3, 1.4
    globalCVDBonus: 1.2, // Requirement 7.3
    trapReduction: 0.5, // Requirement 7.4
  },
  enhancedRisk: {
    highImpactEventThreshold: 70, // Requirement 8.1
    highImpactPositionReduction: 50, // Requirement 8.1
    extremeUncertaintyStopLoss: 1.0, // Requirement 8.2
    globalCVDMonitoringInterval: 5000, // Requirement 8.3
    botTrapFrequencyThreshold: 80, // Requirement 8.4
    multiExchangeFailureHalt: true, // Requirement 8.6
    oracleUnstableConservativeMode: true, // Requirement 8.5
    eventProximityThreshold: 60, // Requirement 11.3
  },
  emergency: {
    predictionEmergencyThreshold: 90, // Requirement 14.1
    liquidityEmergencyExchangeCount: 2, // Requirement 14.2
    flowEmergencyDivergenceThreshold: 80, // Requirement 14.4
    trapSaturationThreshold: 80, // Requirement 14.5
    autoFlattenOnEmergency: true,
    notifyOnEmergency: true,
  },
  version: 1,
  lastModified: Date.now(),
};

// ============================================================================
// ENHANCED 2026 CONFIG MANAGER
// ============================================================================

/**
 * Configuration Manager for 2026 Enhancements
 *
 * Extends the existing Phase 2 configuration system with 2026-specific
 * parameters for Oracle, Flow Validator, Bot Trap, and Global Aggregator.
 *
 * Requirements: 16.1-16.7
 */
export class Enhanced2026ConfigManager extends EventEmitter {
  private config: Enhanced2026Config;
  private configPath: string;
  private isWatching: boolean = false;

  constructor(configDirectory: string = "./config") {
    super();
    this.configPath = join(configDirectory, "enhanced-2026.config.json");
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file with defaults
   * Requirement 16.7: Load enhanced configuration and apply to all modules
   */
  loadConfig(): Enhanced2026Config {
    try {
      if (!existsSync(this.configPath)) {
        console.log(
          "📋 No enhanced 2026 config found, creating default configuration",
        );
        this.saveConfig(DEFAULT_ENHANCED_2026_CONFIG);
        return { ...DEFAULT_ENHANCED_2026_CONFIG };
      }

      const fileContent = readFileSync(this.configPath, "utf8");
      const loadedConfig = JSON.parse(fileContent) as Enhanced2026Config;

      // Validate loaded configuration
      const validation = this.validateConfig(loadedConfig);
      if (!validation.isValid) {
        console.error(
          "❌ ENHANCED_CONFIG_CORRUPTED: Invalid configuration file",
        );
        console.error("Errors:", validation.errors);
        console.log("📋 Loading default enhanced configuration");

        // Backup corrupted config
        const backupPath = `${this.configPath}.corrupted.${Date.now()}`;
        writeFileSync(backupPath, fileContent);
        console.log(`💾 Corrupted config backed up to: ${backupPath}`);

        this.saveConfig(DEFAULT_ENHANCED_2026_CONFIG);
        return { ...DEFAULT_ENHANCED_2026_CONFIG };
      }

      // Merge with defaults to ensure all fields are present
      const mergedConfig = this.mergeWithDefaults(loadedConfig);

      console.log("✅ Enhanced 2026 configuration loaded successfully");
      if (validation.warnings.length > 0) {
        console.warn("⚠️ Configuration warnings:", validation.warnings);
      }

      return mergedConfig;
    } catch (error) {
      console.error(
        "❌ ENHANCED_CONFIG_CORRUPTED: Failed to load configuration:",
        error,
      );
      console.log("📋 Loading default enhanced configuration");
      this.saveConfig(DEFAULT_ENHANCED_2026_CONFIG);
      return { ...DEFAULT_ENHANCED_2026_CONFIG };
    }
  }

  /**
   * Save configuration to file
   * Requirement 16.6: Validate parameter ranges and dependencies
   */
  saveConfig(config: Enhanced2026Config): void {
    try {
      // Update version and timestamp
      config.version = (config.version || 0) + 1;
      config.lastModified = Date.now();

      // Validate before saving
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        throw new Error(
          `Invalid configuration: ${validation.errors.join(", ")}`,
        );
      }

      // Ensure directory exists
      const configDir = dirname(this.configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // Write to file
      writeFileSync(this.configPath, JSON.stringify(config, null, 2), "utf8");

      // Update internal config
      const oldConfig = { ...this.config };
      this.config = { ...config };

      // Emit change event
      this.emit("configChanged", {
        section: "all",
        oldValue: oldConfig,
        newValue: config,
        timestamp: Date.now(),
      } as Enhanced2026ConfigChangeEvent);

      console.log("💾 Enhanced 2026 configuration saved successfully");
    } catch (error) {
      console.error("❌ Failed to save enhanced configuration:", error);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Enhanced2026Config {
    return { ...this.config };
  }

  /**
   * Get Oracle configuration
   */
  getOracleConfig(): OracleConfig {
    return { ...this.config.oracle };
  }

  /**
   * Get Flow Validator configuration
   */
  getFlowValidatorConfig(): FlowValidatorConfig {
    return { ...this.config.flowValidator };
  }

  /**
   * Get Bot Trap configuration
   */
  getBotTrapConfig(): BotTrapConfig {
    return { ...this.config.botTrapDetector };
  }

  /**
   * Get Global Aggregator configuration
   */
  getGlobalAggregatorConfig(): GlobalAggregatorConfig {
    return { ...this.config.globalAggregator };
  }

  /**
   * Update Oracle configuration
   * Requirement 16.1: Allow adjustment of Prediction Veto threshold (30-70%)
   */
  updateOracleConfig(oracleConfig: Partial<OracleConfig>): void {
    const newOracleConfig = { ...this.config.oracle, ...oracleConfig };
    const newConfig = { ...this.config, oracle: newOracleConfig };
    this.saveConfig(newConfig);
  }

  /**
   * Update Flow Validator configuration
   * Requirement 16.2: Allow adjustment of Sweep Detection threshold (3-10 levels)
   */
  updateFlowValidatorConfig(flowConfig: Partial<FlowValidatorConfig>): void {
    const newFlowConfig = { ...this.config.flowValidator, ...flowConfig };
    const newConfig = { ...this.config, flowValidator: newFlowConfig };
    this.saveConfig(newConfig);
  }

  /**
   * Update Bot Trap configuration
   * Requirement 16.3: Allow adjustment of precision tolerance (0.1-1%)
   */
  updateBotTrapConfig(botTrapConfig: Partial<BotTrapConfig>): void {
    const newBotTrapConfig = {
      ...this.config.botTrapDetector,
      ...botTrapConfig,
    };
    const newConfig = { ...this.config, botTrapDetector: newBotTrapConfig };
    this.saveConfig(newConfig);
  }

  /**
   * Update Global Aggregator configuration
   * Requirement 16.4: Allow weighting adjustment for each exchange (20-50%)
   */
  updateGlobalAggregatorConfig(
    aggregatorConfig: Partial<GlobalAggregatorConfig>,
  ): void {
    const newAggregatorConfig = {
      ...this.config.globalAggregator,
      ...aggregatorConfig,
    };
    const newConfig = { ...this.config, globalAggregator: newAggregatorConfig };
    this.saveConfig(newConfig);
  }

  /**
   * Update Conviction configuration
   * Requirement 16.5: Allow range adjustment (1.0x-2.0x maximum)
   */
  updateConvictionConfig(convictionConfig: Partial<ConvictionConfig>): void {
    const newConvictionConfig = {
      ...this.config.conviction,
      ...convictionConfig,
    };
    const newConfig = { ...this.config, conviction: newConvictionConfig };
    this.saveConfig(newConfig);
  }

  /**
   * Start watching configuration file for changes (hot-reload)
   */
  startWatching(): void {
    if (this.isWatching) return;
    this.isWatching = true;

    watchFile(this.configPath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        console.log(
          "🔄 Enhanced 2026 configuration file changed, reloading...",
        );
        try {
          const newConfig = this.loadConfig();
          const oldConfig = { ...this.config };
          this.config = newConfig;

          this.emit("configReloaded", {
            section: "all",
            oldValue: oldConfig,
            newValue: newConfig,
            timestamp: Date.now(),
          } as Enhanced2026ConfigChangeEvent);

          console.log("✅ Enhanced 2026 configuration reloaded successfully");
        } catch (error) {
          console.error("❌ Failed to reload enhanced configuration:", error);
        }
      }
    });

    console.log("👁️ Started watching enhanced 2026 configuration file");
  }

  /**
   * Stop watching configuration file
   */
  stopWatching(): void {
    if (!this.isWatching) return;
    unwatchFile(this.configPath);
    this.isWatching = false;
    console.log("👁️ Stopped watching enhanced 2026 configuration file");
  }

  /**
   * Validate configuration against requirements
   * Requirement 16.6: Validate parameter ranges and dependencies
   */
  validateConfig(config: Enhanced2026Config): Enhanced2026ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate Oracle config
    if (config.oracle) {
      const { vetoThreshold, convictionMultiplierMax, updateInterval } =
        config.oracle;

      // Requirement 16.1: Veto threshold 30-70%
      if (isNaN(vetoThreshold) || vetoThreshold < 30 || vetoThreshold > 70) {
        errors.push(
          `Oracle veto threshold must be 30-70%, got ${vetoThreshold}%`,
        );
      }

      if (
        isNaN(convictionMultiplierMax) || convictionMultiplierMax < 1.0 ||
        convictionMultiplierMax > 2.0
      ) {
        errors.push(
          `Oracle conviction multiplier max must be 1.0-2.0, got ${convictionMultiplierMax}`,
        );
      }

      if (updateInterval < 10 || updateInterval > 300) {
        warnings.push(
          `Oracle update interval ${updateInterval}s may be suboptimal (recommended: 10-300s)`,
        );
      }
    } else {
      errors.push("Missing oracle configuration");
    }

    // Validate Flow Validator config
    if (config.flowValidator) {
      const {
        sweepThreshold,
        icebergDensityThreshold,
        institutionalThreshold,
      } = config.flowValidator;

      // Requirement 16.2: Sweep threshold 3-10 levels
      if (isNaN(sweepThreshold) || sweepThreshold < 3 || sweepThreshold > 10) {
        errors.push(
          `Flow validator sweep threshold must be 3-10 levels, got ${sweepThreshold}`,
        );
      }

      if (
        isNaN(icebergDensityThreshold) || icebergDensityThreshold < 0 ||
        icebergDensityThreshold > 100
      ) {
        errors.push(
          `Iceberg density threshold must be 0-100, got ${icebergDensityThreshold}`,
        );
      }

      if (
        isNaN(institutionalThreshold) || institutionalThreshold < 0 ||
        institutionalThreshold > 100
      ) {
        errors.push(
          `Institutional threshold must be 0-100, got ${institutionalThreshold}`,
        );
      }
    } else {
      errors.push("Missing flowValidator configuration");
    }

    // Validate Bot Trap config
    if (config.botTrapDetector) {
      const { precisionThreshold, suspicionThreshold, positionSizeReduction } =
        config.botTrapDetector;

      // Requirement 16.3: Precision tolerance 0.1-1%
      if (
        isNaN(precisionThreshold) || precisionThreshold < 0.1 ||
        precisionThreshold > 1.0
      ) {
        errors.push(
          `Bot trap precision threshold must be 0.1-1.0%, got ${precisionThreshold}%`,
        );
      }

      if (
        isNaN(suspicionThreshold) || suspicionThreshold < 0 ||
        suspicionThreshold > 100
      ) {
        errors.push(
          `Suspicion threshold must be 0-100, got ${suspicionThreshold}`,
        );
      }

      if (
        isNaN(positionSizeReduction) || positionSizeReduction < 0.1 ||
        positionSizeReduction > 1.0
      ) {
        errors.push(
          `Position size reduction must be 0.1-1.0, got ${positionSizeReduction}`,
        );
      }
    } else {
      errors.push("Missing botTrapDetector configuration");
    }

    // Validate Global Aggregator config
    if (config.globalAggregator) {
      const { exchangeWeights, consensusThreshold } = config.globalAggregator;

      // Requirement 16.4: Exchange weights 20-50%
      for (const [exchange, weight] of Object.entries(exchangeWeights)) {
        if (weight < 20 || weight > 50) {
          errors.push(
            `Exchange weight for ${exchange} must be 20-50%, got ${weight}%`,
          );
        }
      }

      // Validate weights sum to 100%
      const totalWeight = Object.values(exchangeWeights).reduce(
        (sum, w) => sum + w,
        0,
      );
      if (Math.abs(totalWeight - 100) > 0.1) {
        errors.push(`Exchange weights must sum to 100%, got ${totalWeight}%`);
      }

      if (consensusThreshold < 0.5 || consensusThreshold > 1.0) {
        errors.push(
          `Consensus threshold must be 0.5-1.0, got ${consensusThreshold}`,
        );
      }
    } else {
      errors.push("Missing globalAggregator configuration");
    }

    // Validate Conviction config
    if (config.conviction) {
      const { minMultiplier, maxMultiplier } = config.conviction;

      // Requirement 16.5: Range 1.0x-2.0x
      if (isNaN(minMultiplier) || minMultiplier < 0.5 || minMultiplier > 1.5) {
        errors.push(
          `Min conviction multiplier must be 0.5-1.5, got ${minMultiplier}`,
        );
      }

      if (isNaN(maxMultiplier) || maxMultiplier < 1.0 || maxMultiplier > 2.0) {
        errors.push(
          `Max conviction multiplier must be 1.0-2.0, got ${maxMultiplier}`,
        );
      }

      if (minMultiplier >= maxMultiplier) {
        errors.push(
          `Min multiplier (${minMultiplier}) must be less than max (${maxMultiplier})`,
        );
      }
    } else {
      errors.push("Missing conviction configuration");
    }

    // Validate Enhanced Risk config
    if (config.enhancedRisk) {
      const { highImpactEventThreshold, highImpactPositionReduction } =
        config.enhancedRisk;

      if (highImpactEventThreshold < 50 || highImpactEventThreshold > 95) {
        warnings.push(
          `High impact event threshold ${highImpactEventThreshold}% may be suboptimal`,
        );
      }

      if (
        highImpactPositionReduction < 20 || highImpactPositionReduction > 80
      ) {
        warnings.push(
          `Position reduction ${highImpactPositionReduction}% may be too aggressive or too lenient`,
        );
      }
    } else {
      errors.push("Missing enhancedRisk configuration");
    }

    // Validate Emergency config
    if (config.emergency) {
      const { predictionEmergencyThreshold, trapSaturationThreshold } =
        config.emergency;

      if (
        predictionEmergencyThreshold < 80 || predictionEmergencyThreshold > 99
      ) {
        warnings.push(
          `Prediction emergency threshold ${predictionEmergencyThreshold}% may trigger too often or too rarely`,
        );
      }

      if (trapSaturationThreshold < 60 || trapSaturationThreshold > 95) {
        warnings.push(
          `Trap saturation threshold ${trapSaturationThreshold}% may be suboptimal`,
        );
      }
    } else {
      errors.push("Missing emergency configuration");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Merge loaded config with defaults to ensure all fields are present
   */
  private mergeWithDefaults(
    loadedConfig: Partial<Enhanced2026Config>,
  ): Enhanced2026Config {
    return {
      oracle: {
        ...DEFAULT_ENHANCED_2026_CONFIG.oracle,
        ...loadedConfig.oracle,
      },
      flowValidator: {
        ...DEFAULT_ENHANCED_2026_CONFIG.flowValidator,
        ...loadedConfig.flowValidator,
      },
      botTrapDetector: {
        ...DEFAULT_ENHANCED_2026_CONFIG.botTrapDetector,
        ...loadedConfig.botTrapDetector,
      },
      globalAggregator: {
        ...DEFAULT_ENHANCED_2026_CONFIG.globalAggregator,
        ...loadedConfig.globalAggregator,
        exchangeWeights: {
          ...DEFAULT_ENHANCED_2026_CONFIG.globalAggregator.exchangeWeights,
          ...loadedConfig.globalAggregator?.exchangeWeights,
        },
      },
      conviction: {
        ...DEFAULT_ENHANCED_2026_CONFIG.conviction,
        ...loadedConfig.conviction,
      },
      enhancedRisk: {
        ...DEFAULT_ENHANCED_2026_CONFIG.enhancedRisk,
        ...loadedConfig.enhancedRisk,
      },
      emergency: {
        ...DEFAULT_ENHANCED_2026_CONFIG.emergency,
        ...loadedConfig.emergency,
      },
      version: loadedConfig.version || DEFAULT_ENHANCED_2026_CONFIG.version,
      lastModified: loadedConfig.lastModified || Date.now(),
    };
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    console.log("🔄 Resetting enhanced 2026 configuration to defaults");
    this.saveConfig({ ...DEFAULT_ENHANCED_2026_CONFIG });
  }

  /**
   * Get configuration summary for display
   */
  getConfigSummary(): string {
    const config = this.config;
    return [
      `🔮 Oracle: ${
        config.oracle.enabled ? "Enabled" : "Disabled"
      }, Veto: ${config.oracle.vetoThreshold}%`,
      `📊 Flow Validator: ${
        config.flowValidator.enabled ? "Enabled" : "Disabled"
      }, Sweep: ${config.flowValidator.sweepThreshold} levels`,
      `🤖 Bot Trap: ${
        config.botTrapDetector.enabled ? "Enabled" : "Disabled"
      }, Precision: ${config.botTrapDetector.precisionThreshold}%`,
      `🌐 Global CVD: ${
        config.globalAggregator.enabled ? "Enabled" : "Disabled"
      }, Consensus: ${
        (config.globalAggregator.consensusThreshold * 100).toFixed(0)
      }%`,
      `💪 Conviction: ${
        config.conviction.enabled ? "Enabled" : "Disabled"
      }, Max: ${config.conviction.maxMultiplier}x`,
      `⚠️ Emergency: Prediction ${config.emergency.predictionEmergencyThreshold}%, Trap ${config.emergency.trapSaturationThreshold}%`,
    ].join("\n");
  }

  /**
   * Check if all enhancement layers are enabled
   */
  areAllEnhancementsEnabled(): boolean {
    return (
      this.config.oracle.enabled &&
      this.config.flowValidator.enabled &&
      this.config.botTrapDetector.enabled &&
      this.config.globalAggregator.enabled &&
      this.config.conviction.enabled
    );
  }

  /**
   * Get list of enabled enhancements
   */
  getEnabledEnhancements(): string[] {
    const enabled: string[] = [];
    if (this.config.oracle.enabled) enabled.push("Oracle");
    if (this.config.flowValidator.enabled) enabled.push("FlowValidator");
    if (this.config.botTrapDetector.enabled) enabled.push("BotTrapDetector");
    if (this.config.globalAggregator.enabled) enabled.push("GlobalAggregator");
    if (this.config.conviction.enabled) enabled.push("Conviction");
    return enabled;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopWatching();
    this.removeAllListeners();
  }
}
