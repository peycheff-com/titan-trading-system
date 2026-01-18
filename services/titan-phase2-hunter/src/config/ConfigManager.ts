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

/**
 * Alignment weight configuration
 */
export interface AlignmentWeights {
  daily: number; // 30-60%
  h4: number; // 20-40%
  m15: number; // 10-30%
}

/**
 * Relative Strength configuration
 */
export interface RSConfig {
  threshold: number; // 0-5%
  lookbackPeriod: number; // 2-8 hours
}

/**
 * Risk management configuration
 */
export interface RiskConfig {
  maxLeverage: number; // 3-5x
  stopLossPercent: number; // 1-3%
  targetPercent: number; // 3-6%
}

/**
 * Portfolio management configuration
 */
export interface PortfolioConfig {
  maxConcurrentPositions: number; // 3-8
  maxPortfolioHeat: number; // 10-20%
  correlationThreshold: number; // 0.6-0.9
}

/**
 * Forward test configuration
 */
export interface ForwardTestConfig {
  enabled: boolean; // Paper trading toggle
  duration: number; // Test duration in hours
  logSignalsOnly: boolean; // If true, only log signals without simulating trades
  compareToBacktest: boolean; // If true, compare results to backtest
}

/**
 * Complete Phase 2 configuration
 * Includes fields required by Shared PhaseConfigSchema AND Hunter specific fields
 */
export interface Phase2Config {
  // Shared Schema Requirements
  enabled: boolean;
  maxLeverage: number;
  maxDrawdown: number;
  maxPositionSize: number;
  riskPerTrade: number;
  exchanges: Record<string, {
    enabled: boolean;
    executeOn: boolean;
    testnet: boolean;
    rateLimit: number;
    timeout: number;
    apiKey?: string;
    apiSecret?: string;
  }>;
  parameters?: Record<string, any>;

  // Hunter Specifics
  alignmentWeights: AlignmentWeights;
  rsConfig: RSConfig;
  riskConfig: RiskConfig; // Note: Overlaps conceptually with maxLeverage
  portfolioConfig: PortfolioConfig;
  forwardTestConfig: ForwardTestConfig;
  version: number;
  lastModified: number;
  [key: string]: any;
}

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
    // This will throw if Schema validation fails
    await this.sharedManager.loadPhaseConfig(this.phaseName);

    const phaseConfig = this.sharedManager.getPhaseConfig(this.phaseName);

    if (!phaseConfig || Object.keys(phaseConfig).length === 0) {
      console.log("📋 Initializing default configuration for Hunter...");
      await this.saveConfig(this.config); // Save defaults
    } else {
      this.updateLocalState();

      // Validate merged config against Hunter-specific rules
      const validation = this.validateConfig(this.config);
      if (!validation.isValid) {
        throw new Error(
          `Invalid configuration: ${validation.errors.join(", ")}`,
        );
      }

      console.log("✅ Configuration loaded successfully");
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

    console.log("✅ ConfigManager Adapter initialized via @titan/shared");
  }

  private updateLocalState() {
    const rawConfig = this.sharedManager.getPhaseConfig(
      this.phaseName,
    ) as unknown as Phase2Config;
    if (rawConfig) {
      this.config = this.mergeWithDefaults(rawConfig);
    }
  }

  /**
   * Save configuration
   */
  saveConfig(config: Phase2Config): void {
    try {
      // Update metadata
      config.version = (config.version || 0) + 1;
      config.lastModified = Date.now();

      // Validate
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        throw new Error(
          `Invalid configuration: ${validation.errors.join(", ")}`,
        );
      }

      // Sync specific fields to shared fields
      config.maxLeverage = config.riskConfig.maxLeverage;
      // We could sync others (riskPerTrade etc) but we'll leave them to defaults or manual set

      // Save via Shared Manager
      // Cast to unknown first to avoid partial overlap issues if PhaseConfig definition is stricter or different
      this.sharedManager.savePhaseConfig(
        this.phaseName,
        config as unknown as SharedPhaseConfig,
      );

      // Update local state (optimistic)
      const oldConfig = { ...this.config };
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
  updateAlignmentWeights(weights: Partial<AlignmentWeights>): void {
    const newWeights = { ...this.config.alignmentWeights, ...weights };
    this.updateLocalConfigSection({ alignmentWeights: newWeights });
  }

  /**
   * Update RS configuration
   */
  updateRSConfig(rsConfig: Partial<RSConfig>): void {
    const newRSConfig = { ...this.config.rsConfig, ...rsConfig };
    this.updateLocalConfigSection({ rsConfig: newRSConfig });
  }

  /**
   * Update risk configuration
   */
  updateRiskConfig(riskConfig: Partial<RiskConfig>): void {
    const newRiskConfig = { ...this.config.riskConfig, ...riskConfig };
    this.updateLocalConfigSection({ riskConfig: newRiskConfig });
  }

  /**
   * Update portfolio configuration
   */
  updatePortfolioConfig(portfolioConfig: Partial<PortfolioConfig>): void {
    const newPortfolioConfig = {
      ...this.config.portfolioConfig,
      ...portfolioConfig,
    };
    this.updateLocalConfigSection({ portfolioConfig: newPortfolioConfig });
  }

  /**
   * Update forward test configuration
   */
  updateForwardTestConfig(forwardTestConfig: Partial<ForwardTestConfig>): void {
    const newForwardTestConfig = {
      ...this.config.forwardTestConfig,
      ...forwardTestConfig,
    };
    this.updateLocalConfigSection({ forwardTestConfig: newForwardTestConfig });
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
   * Validate configuration against requirements
   */
  private validateConfig(config: Phase2Config): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate alignment weights
    if (!config.alignmentWeights) {
      errors.push("Missing alignmentWeights");
    } else {
      const { daily, h4, m15 } = config.alignmentWeights;

      if (daily < 30 || daily > 60) {
        errors.push(`Daily weight must be 30-60%, got ${daily}%`);
      }
      if (h4 < 20 || h4 > 40) {
        errors.push(`4H weight must be 20-40%, got ${h4}%`);
      }
      if (m15 < 10 || m15 > 30) {
        errors.push(`15m weight must be 10-30%, got ${m15}%`);
      }

      const total = daily + h4 + m15;
      if (Math.abs(total - 100) > 0.1) {
        errors.push(`Alignment weights must sum to 100%, got ${total}%`);
      }
    }

    // Validate RS config
    if (!config.rsConfig) {
      errors.push("Missing rsConfig");
    } else {
      const { threshold, lookbackPeriod } = config.rsConfig;

      if (threshold < 0 || threshold > 5) {
        errors.push(`RS threshold must be 0-5%, got ${threshold}%`);
      }
      if (lookbackPeriod < 2 || lookbackPeriod > 8) {
        errors.push(
          `RS lookback period must be 2-8 hours, got ${lookbackPeriod} hours`,
        );
      }
    }

    // Validate risk config
    if (!config.riskConfig) {
      errors.push("Missing riskConfig");
    } else {
      const { maxLeverage, stopLossPercent, targetPercent } = config.riskConfig;

      if (maxLeverage < 3 || maxLeverage > 5) {
        errors.push(`Max leverage must be 3-5x, got ${maxLeverage}x`);
      }
      if (stopLossPercent < 1 || stopLossPercent > 3) {
        errors.push(`Stop loss must be 1-3%, got ${stopLossPercent}%`);
      }
      if (targetPercent < 3 || targetPercent > 6) {
        errors.push(`Target must be 3-6%, got ${targetPercent}%`);
      }

      // Check R:R ratio
      const rrRatio = targetPercent / stopLossPercent;
      if (rrRatio < 2.5) {
        warnings.push(
          `R:R ratio is ${
            rrRatio.toFixed(1)
          }:1, consider increasing target or decreasing stop`,
        );
      }
    }

    // Validate portfolio config
    if (!config.portfolioConfig) {
      errors.push("Missing portfolioConfig");
    } else {
      const { maxConcurrentPositions, maxPortfolioHeat, correlationThreshold } =
        config.portfolioConfig;

      if (maxConcurrentPositions < 3 || maxConcurrentPositions > 8) {
        errors.push(
          `Max concurrent positions must be 3-8, got ${maxConcurrentPositions}`,
        );
      }
      if (maxPortfolioHeat < 10 || maxPortfolioHeat > 20) {
        errors.push(
          `Max portfolio heat must be 10-20%, got ${maxPortfolioHeat}%`,
        );
      }
      if (correlationThreshold < 0.6 || correlationThreshold > 0.9) {
        errors.push(
          `Correlation threshold must be 0.6-0.9, got ${correlationThreshold}`,
        );
      }
    }

    // Validate forward test config
    if (!config.forwardTestConfig) {
      errors.push("Missing forwardTestConfig");
    } else {
      const { enabled, duration, logSignalsOnly, compareToBacktest } =
        config.forwardTestConfig;

      if (typeof enabled !== "boolean") {
        errors.push("Forward test enabled must be boolean");
      }
      if (duration < 1 || duration > 168) {
        // 1 hour to 1 week
        errors.push(
          `Forward test duration must be 1-168 hours, got ${duration} hours`,
        );
      }
      if (typeof logSignalsOnly !== "boolean") {
        errors.push("Forward test logSignalsOnly must be boolean");
      }
      if (typeof compareToBacktest !== "boolean") {
        errors.push("Forward test compareToBacktest must be boolean");
      }
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
      version: loadedConfig.version || DEFAULT_CONFIG.version,
      lastModified: loadedConfig.lastModified || Date.now(),
      exchanges: { // Deep merge exchanges if needed, but strict replacement is often safer
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
    ].join("\n");
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopWatching();
    this.removeAllListeners();
  }
}
