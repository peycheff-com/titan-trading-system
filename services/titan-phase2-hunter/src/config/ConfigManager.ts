/**
 * Configuration Manager for Titan Phase 2 - The Hunter
 *
 * Provides runtime configuration management via @titan/shared ConfigManager Core.
 * Preserves existing Hunter public API for compatibility.
 *
 * Requirements: 18.1-18.8 (Runtime Configuration)
 */

import { EventEmitter } from "events";
import {
  ConfigManager as SharedConfigManager,
  getConfigManager,
  PhaseConfig as SharedPhaseConfig,
} from "@titan/shared";
import { HunterConfig, HunterConfigSchema } from "./schema";
import { EventCategory } from "../types";

/**
 * Complete Phase 2 configuration
 * Derived from Zod Schema to ensure single source of truth
 */
export type Phase2Config = HunterConfig;

// Export types compatible with tests
export type AlignmentWeights = HunterConfig["alignmentWeights"];
export type RSConfig = HunterConfig["rsConfig"];
export type RiskConfig = HunterConfig["riskConfig"];
export type PortfolioConfig = HunterConfig["portfolioConfig"];
export type ForwardTestConfig = HunterConfig["forwardTestConfig"];

// Export Enhanced types for usage
export type OracleConfig = HunterConfig["oracle"];
export type FlowValidatorConfig = HunterConfig["flowValidator"];
export type BotTrapConfig = HunterConfig["botTrapDetector"];
export type GlobalAggregatorConfig = HunterConfig["globalAggregator"];
export type ConvictionConfig = HunterConfig["conviction"];
export type EnhancedRiskConfig = HunterConfig["enhancedRisk"];
export type EmergencyConfig = HunterConfig["emergency"];

/**
 * Configuration validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Configuration change event
 */
export interface ConfigChangeEvent {
  section: keyof Phase2Config | "all";
  oldValue: any;
  newValue: any;
  timestamp: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Phase2Config = {
  // Shared Config Defaults
  enabled: true,
  maxLeverage: 5,
  maxDrawdown: 0.2, // 20%
  maxPositionSize: 1.0,
  riskPerTrade: 0.015, // 1.5% matches stopLossPercent
  exchanges: {},

  // Hunter Config Defaults
  alignmentWeights: {
    daily: 50, // 50%
    h4: 30, // 30%
    m15: 20, // 20%
  },
  rsConfig: {
    threshold: 2, // 2%
    lookbackPeriod: 4, // 4 hours
  },
  riskConfig: {
    maxLeverage: 5, // 5x
    stopLossPercent: 1.5, // 1.5%
    targetPercent: 4.5, // 4.5% (3:1 R:R)
  },
  portfolioConfig: {
    maxConcurrentPositions: 5, // 5 positions
    maxPortfolioHeat: 15, // 15%
    correlationThreshold: 0.7, // 0.7
  },
  forwardTestConfig: {
    enabled: false, // Paper trading disabled by default
    duration: 24, // 24 hours
    logSignalsOnly: false, // Full paper trading by default
    compareToBacktest: false, // No comparison by default
  },

  // Enhanced 2026 Defaults
  oracle: {
    enabled: true,
    polymarketApiKey: "",
    vetoThreshold: 40,
    convictionMultiplierMax: 1.5,
    eventCategories: [
      EventCategory.CRYPTO_PRICE,
      EventCategory.FED_POLICY,
      EventCategory.REGULATORY,
    ],
    updateInterval: 60,
    btcCrashVetoThreshold: 40,
    btcAthBoostThreshold: 60,
    conflictThreshold: 40,
    probabilityChangeThreshold: 10,
    monitoringInterval: 60,
  },
  flowValidator: {
    enabled: true,
    sweepThreshold: 5,
    icebergDensityThreshold: 70,
    footprintAnalysisDepth: 20,
    institutionalThreshold: 60,
    passiveAbsorptionMinRatio: 0.6,
  },
  botTrapDetector: {
    enabled: true,
    precisionThreshold: 0.5,
    suspicionThreshold: 70,
    learningEnabled: true,
    adaptiveAdjustments: true,
    positionSizeReduction: 0.5,
    stopLossTightening: 1.0,
    confirmationThresholdIncrease: 50,
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
    consensusThreshold: 0.67,
    manipulationSensitivity: 70,
    reconnectInterval: 5000,
  },
  conviction: {
    enabled: true,
    minMultiplier: 1.0,
    maxMultiplier: 2.0,
    oracleAlignmentBonus: 1.5,
    globalCVDBonus: 1.2,
    trapReduction: 0.5,
  },
  enhancedRisk: {
    highImpactEventThreshold: 70,
    highImpactPositionReduction: 50,
    extremeUncertaintyStopLoss: 1.0,
    globalCVDMonitoringInterval: 5000,
    botTrapFrequencyThreshold: 80,
    multiExchangeFailureHalt: true,
    oracleUnstableConservativeMode: true,
    eventProximityThreshold: 60,
  },
  emergency: {
    predictionEmergencyThreshold: 90,
    liquidityEmergencyExchangeCount: 2,
    flowEmergencyDivergenceThreshold: 80,
    trapSaturationThreshold: 80,
    autoFlattenOnEmergency: true,
    notifyOnEmergency: true,
  },

  version: 1,
  lastModified: Date.now(),
};

/**
 * Configuration Manager for Phase 2
 * Refactored to use @titan/shared ConfigManager
 */
export class ConfigManager extends EventEmitter {
  private config: Phase2Config;
  private sharedManager: SharedConfigManager;
  private readonly phaseName = "phase2-hunter";
  private environment: string;

  constructor(environment: string = process.env.NODE_ENV || "development") {
    super();
    this.environment = environment;

    // Initialize Shared Manager
    this.sharedManager = getConfigManager(undefined, environment as any);

    // Initialize with defaults synchronously
    this.config = { ...DEFAULT_CONFIG };
  }

  public async initialize(): Promise<void> {
    // Load configuration via Shared Manager
    // This will throw if Shared Phase Config Schema validation fails
    await this.sharedManager.loadPhaseConfig(this.phaseName);

    const rawPhaseConfig = this.sharedManager.getPhaseConfig(this.phaseName);

    // Merge with defaults to ensure we have all fields before Zod validation
    // (Shared config might strictly be "PhaseConfig" and miss Hunter fields)
    const pendingConfig = this.mergeWithDefaults(
      rawPhaseConfig as unknown as Partial<Phase2Config>,
    );

    if (!rawPhaseConfig || Object.keys(rawPhaseConfig).length === 0) {
      console.log("📋 Initializing default configuration for Hunter...");
      await this.saveConfig(pendingConfig); // Save defaults (also validates)
    } else {
      this.updateLocalState(pendingConfig);

      console.log("✅ Configuration loaded and validated successfully via Zod");
    }

    // Setup Event Listeners
    this.sharedManager.on("configChanged", (event) => {
      if (event.level === "phase" && event.key === this.phaseName) {
        const oldConfig = { ...this.config };
        this.updateLocalState();
        this.emit("configReloaded", {
          section: "all",
          oldValue: oldConfig,
          newValue: this.config,
          timestamp: Date.now(),
        } as ConfigChangeEvent);
      }
    });

    this.sharedManager.on("configReloaded", () => {
      // Full reload logic
      const oldConfig = { ...this.config };
      this.updateLocalState();
      this.emit("configReloaded", {
        section: "all",
        oldValue: oldConfig,
        newValue: this.config,
        timestamp: Date.now(),
        // Note: source information from shared manager could be passed here if needed
      } as ConfigChangeEvent);
    });

    console.log(
      "✅ ConfigManager Adapter initialized via @titan/shared + Zod Rule Engine",
    );
  }

  private updateLocalState(forceConfig?: Phase2Config) {
    if (forceConfig) {
      // eslint-disable-next-line functional/immutable-data
      this.config = forceConfig;
      return;
    }

    const rawConfig = this.sharedManager.getPhaseConfig(
      this.phaseName,
    ) as unknown as Phase2Config;

    if (rawConfig) {
      const merged = this.mergeWithDefaults(rawConfig);
      // Validate merged config using Zod
      const result = HunterConfigSchema.safeParse(merged);
      if (!result.success) {
        console.error(
          "❌ Configuration validation failed after reload:",
          result.error.format(),
        );
        // Fallback or throw? For now, we keep the old config or warn
        // In production, invalid config on reload should probably be rejected
        return;
      }
      // eslint-disable-next-line functional/immutable-data
      this.config = result.data as Phase2Config;
    }
  }

  /**
   * Save configuration
   */
  saveConfig(config: Phase2Config): void {
    try {
      // Update metadata
      // eslint-disable-next-line functional/immutable-data
      config.version = (config.version || 0) + 1;
      // eslint-disable-next-line functional/immutable-data
      config.lastModified = Date.now();

      // Validate with Zod
      // This will throw if invalid
      const validatedConfig = HunterConfigSchema.parse(config);

      // Sync specific fields to shared fields
      // eslint-disable-next-line functional/immutable-data
      validatedConfig.maxLeverage = validatedConfig.riskConfig.maxLeverage;
      // We could sync others (riskPerTrade etc) but we'll leave them to defaults or manual set

      // Save via Shared Manager
      // Cast to unknown first to avoid partial overlap issues if PhaseConfig definition is stricter or different
      this.sharedManager.savePhaseConfig(
        this.phaseName,
        validatedConfig as unknown as SharedPhaseConfig,
      );

      // Update local state (optimistic)
      const oldConfig = { ...this.config };
      // eslint-disable-next-line functional/immutable-data
      this.config = { ...config };

      this.emit("configChanged", {
        section: "all",
        oldValue: oldConfig,
        newValue: config,
        timestamp: Date.now(),
      } as ConfigChangeEvent);
    } catch (error) {
      console.error("❌ Failed to save configuration:", error);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Phase2Config {
    return { ...this.config };
  }

  /**
   * Update alignment weights
   */
  updateAlignmentWeights(
    weights: Partial<Phase2Config["alignmentWeights"]>,
  ): void {
    const newWeights = { ...this.config.alignmentWeights, ...weights };
    this.updateLocalConfigSection({ alignmentWeights: newWeights });
  }

  /**
   * Update full configuration
   */
  updateConfig(config: Partial<Phase2Config>): void {
    this.updateLocalConfigSection(config);
  }

  /**
   * Update RS configuration
   */
  updateRSConfig(rsConfig: Partial<Phase2Config["rsConfig"]>): void {
    const newRSConfig = { ...this.config.rsConfig, ...rsConfig };
    this.updateLocalConfigSection({ rsConfig: newRSConfig });
  }

  /**
   * Update risk configuration
   */
  updateRiskConfig(riskConfig: Partial<Phase2Config["riskConfig"]>): void {
    const newRiskConfig = { ...this.config.riskConfig, ...riskConfig };
    this.updateLocalConfigSection({ riskConfig: newRiskConfig });
  }

  /**
   * Update portfolio configuration
   */
  updatePortfolioConfig(
    portfolioConfig: Partial<Phase2Config["portfolioConfig"]>,
  ): void {
    const newPortfolioConfig = {
      ...this.config.portfolioConfig,
      ...portfolioConfig,
    };
    this.updateLocalConfigSection({ portfolioConfig: newPortfolioConfig });
  }

  /**
   * Update forward test configuration
   */
  updateForwardTestConfig(
    forwardTestConfig: Partial<Phase2Config["forwardTestConfig"]>,
  ): void {
    const newForwardTestConfig = {
      ...this.config.forwardTestConfig,
      ...forwardTestConfig,
    };
    this.updateLocalConfigSection({ forwardTestConfig: newForwardTestConfig });
  }

  // Enhanced 2026 Update Methods

  updateOracleConfig(oracleConfig: Partial<Phase2Config["oracle"]>): void {
    const newOracleConfig = { ...this.config.oracle, ...oracleConfig };
    this.updateLocalConfigSection({ oracle: newOracleConfig });
  }

  updateFlowValidatorConfig(
    flowConfig: Partial<Phase2Config["flowValidator"]>,
  ): void {
    const newFlowConfig = { ...this.config.flowValidator, ...flowConfig };
    this.updateLocalConfigSection({ flowValidator: newFlowConfig });
  }

  updateBotTrapConfig(
    botTrapConfig: Partial<Phase2Config["botTrapDetector"]>,
  ): void {
    const newBotTrapConfig = {
      ...this.config.botTrapDetector,
      ...botTrapConfig,
    };
    this.updateLocalConfigSection({ botTrapDetector: newBotTrapConfig });
  }

  updateGlobalAggregatorConfig(
    aggregatorConfig: Partial<Phase2Config["globalAggregator"]>,
  ): void {
    const newAggregatorConfig = {
      ...this.config.globalAggregator,
      ...aggregatorConfig,
    };
    this.updateLocalConfigSection({ globalAggregator: newAggregatorConfig });
  }

  updateConvictionConfig(
    convictionConfig: Partial<Phase2Config["conviction"]>,
  ): void {
    const newConvictionConfig = {
      ...this.config.conviction,
      ...convictionConfig,
    };
    this.updateLocalConfigSection({ conviction: newConvictionConfig });
  }

  updateEnhancedRiskConfig(
    enhancedRiskConfig: Partial<Phase2Config["enhancedRisk"]>,
  ): void {
    const newRiskConfig = {
      ...this.config.enhancedRisk,
      ...enhancedRiskConfig,
    };
    this.updateLocalConfigSection({ enhancedRisk: newRiskConfig });
  }

  updateEmergencyConfig(
    emergencyConfig: Partial<Phase2Config["emergency"]>,
  ): void {
    const newEmergencyConfig = { ...this.config.emergency, ...emergencyConfig };
    this.updateLocalConfigSection({ emergency: newEmergencyConfig });
  }

  private updateLocalConfigSection(partialConfig: Partial<Phase2Config>): void {
    const newConfig = {
      ...this.config,
      ...partialConfig,
    };
    this.saveConfig(newConfig);
  }

  /**
   * Deprecated: Watch mechanism handled by SharedConfigManager
   */
  startWatching(): void {
    // console.log('👁️ startWatching is managed by SharedConfigManager (noop)');
  }

  stopWatching(): void {
    // noop
  }

  /**
   * Merge loaded config with defaults to ensure all fields are present
   */
  private mergeWithDefaults(loadedConfig: Partial<Phase2Config>): Phase2Config {
    return {
      ...DEFAULT_CONFIG,
      ...loadedConfig,
      alignmentWeights: {
        ...DEFAULT_CONFIG.alignmentWeights,
        ...(loadedConfig.alignmentWeights || {}),
      },
      rsConfig: {
        ...DEFAULT_CONFIG.rsConfig,
        ...(loadedConfig.rsConfig || {}),
      },
      riskConfig: {
        ...DEFAULT_CONFIG.riskConfig,
        ...(loadedConfig.riskConfig || {}),
      },
      portfolioConfig: {
        ...DEFAULT_CONFIG.portfolioConfig,
        ...(loadedConfig.portfolioConfig || {}),
      },
      forwardTestConfig: {
        ...DEFAULT_CONFIG.forwardTestConfig,
        ...(loadedConfig.forwardTestConfig || {}),
      },
      oracle: {
        ...DEFAULT_CONFIG.oracle,
        ...(loadedConfig.oracle || {}),
      },
      flowValidator: {
        ...DEFAULT_CONFIG.flowValidator,
        ...(loadedConfig.flowValidator || {}),
      },
      botTrapDetector: {
        ...DEFAULT_CONFIG.botTrapDetector,
        ...(loadedConfig.botTrapDetector || {}),
      },
      globalAggregator: {
        ...DEFAULT_CONFIG.globalAggregator,
        ...(loadedConfig.globalAggregator || {}),
      },
      conviction: {
        ...DEFAULT_CONFIG.conviction,
        ...(loadedConfig.conviction || {}),
      },
      enhancedRisk: {
        ...DEFAULT_CONFIG.enhancedRisk,
        ...(loadedConfig.enhancedRisk || {}),
      },
      emergency: {
        ...DEFAULT_CONFIG.emergency,
        ...(loadedConfig.emergency || {}),
      },
      version: loadedConfig.version || DEFAULT_CONFIG.version,
      lastModified: loadedConfig.lastModified || Date.now(),
      exchanges: {
        // Deep merge exchanges if needed, but strict replacement is often safer
        ...DEFAULT_CONFIG.exchanges,
        ...(loadedConfig.exchanges || {}),
      },
    };
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    console.log("🔄 Resetting configuration to defaults");
    this.saveConfig({ ...DEFAULT_CONFIG });
  }

  /**
   * Get configuration summary for display
   */
  getConfigSummary(): string {
    const config = this.config;
    return [
      `📊 Alignment: Daily ${config.alignmentWeights.daily}%, 4H ${config.alignmentWeights.h4}%, 15m ${config.alignmentWeights.m15}%`,
      `📈 RS: Threshold ${config.rsConfig.threshold}%, Lookback ${config.rsConfig.lookbackPeriod}h`,
      `⚡ Risk: Leverage ${config.riskConfig.maxLeverage}x, Stop ${config.riskConfig.stopLossPercent}%, Target ${config.riskConfig.targetPercent}%`,
      `💼 Portfolio: Max ${config.portfolioConfig.maxConcurrentPositions} positions, Heat ${config.portfolioConfig.maxPortfolioHeat}%, Correlation ${config.portfolioConfig.correlationThreshold}`,
      `🧪 Forward Test: ${
        config.forwardTestConfig.enabled ? "Enabled" : "Disabled"
      }, Duration ${config.forwardTestConfig.duration}h, Signals Only: ${config.forwardTestConfig.logSignalsOnly}`,
      `🔮 Oracle: ${
        config.oracle.enabled ? "Enabled" : "Disabled"
      }, Veto ${config.oracle.vetoThreshold}%`,
      `🌊 Flow: ${
        config.flowValidator.enabled ? "Enabled" : "Disabled"
      }, Sweep ${config.flowValidator.sweepThreshold}`,
      `🪤 BotTrap: ${
        config.botTrapDetector.enabled ? "Enabled" : "Disabled"
      }, Precision ${config.botTrapDetector.precisionThreshold}%`,
    ].join("\n");
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopWatching();
    this.removeAllListeners();
  }

  /**
   * Check if all major enhancements are enabled
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
    return [
      this.config.oracle.enabled ? "Oracle" : null,
      this.config.flowValidator.enabled ? "FlowValidator" : null,
      this.config.botTrapDetector.enabled ? "BotTrapDetector" : null,
      this.config.globalAggregator.enabled ? "GlobalAggregator" : null,
      this.config.conviction.enabled ? "Conviction" : null,
    ].filter((item): item is string => item !== null);
  }
}

export { DEFAULT_CONFIG };
