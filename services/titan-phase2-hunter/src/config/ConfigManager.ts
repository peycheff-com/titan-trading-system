/**
 * Configuration Manager for Titan Phase 2 - The Hunter
 *
 * Provides runtime configuration management with hot-reload support,
 * default values, and validation for Phase 2 specific settings.
 *
 * Requirements: 18.1-18.8 (Runtime Configuration)
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
 * Complete Phase 2 configuration
 */
export interface Phase2Config {
  alignmentWeights: AlignmentWeights;
  rsConfig: RSConfig;
  riskConfig: RiskConfig;
  portfolioConfig: PortfolioConfig;
  version: number;
  lastModified: number;
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
  section: keyof Phase2Config;
  oldValue: any;
  newValue: any;
  timestamp: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Phase2Config = {
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
  version: 1,
  lastModified: Date.now(),
};

/**
 * Configuration Manager for Phase 2
 */
export class ConfigManager extends EventEmitter {
  private config: Phase2Config;
  private configPath: string;
  private isWatching: boolean = false;

  constructor(configDirectory: string = "./config") {
    super();
    this.configPath = join(configDirectory, "phase2.config.json");
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file with defaults
   * Requirement 18.8: Load default configuration if file is corrupted
   */
  loadConfig(): Phase2Config {
    try {
      if (!existsSync(this.configPath)) {
        console.log("📋 No config file found, creating default configuration");
        this.saveConfig(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }

      const fileContent = readFileSync(this.configPath, "utf8");
      const loadedConfig = JSON.parse(fileContent) as Phase2Config;

      // Validate loaded configuration
      const validation = this.validateConfig(loadedConfig);
      if (!validation.isValid) {
        console.error("❌ CONFIG_CORRUPTED: Invalid configuration file");
        console.error("Errors:", validation.errors);
        console.log("📋 Loading default configuration");

        // Backup corrupted config
        const backupPath = `${this.configPath}.corrupted.${Date.now()}`;
        writeFileSync(backupPath, fileContent);
        console.log(`💾 Corrupted config backed up to: ${backupPath}`);

        // Load defaults
        this.saveConfig(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }

      // Merge with defaults to ensure all fields are present
      const mergedConfig = this.mergeWithDefaults(loadedConfig);

      console.log("✅ Configuration loaded successfully");
      if (validation.warnings.length > 0) {
        console.warn("⚠️ Configuration warnings:", validation.warnings);
      }

      return mergedConfig;
    } catch (error) {
      console.error(
        "❌ CONFIG_CORRUPTED: Failed to load configuration:",
        error,
      );
      console.log("📋 Loading default configuration");

      // Save defaults
      this.saveConfig(DEFAULT_CONFIG);
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Save configuration to file with immediate write
   * Requirement 18.6: Write configuration to config.json file and apply changes immediately
   */
  saveConfig(config: Phase2Config): void {
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

      // Write to file immediately
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
      } as unknown as ConfigChangeEvent);

      console.log("💾 Configuration saved successfully");
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
   * Requirement 18.2: Allow adjustment of Daily weight (30-60%), 4H weight (20-40%), 15m weight (10-30%)
   */
  updateAlignmentWeights(weights: Partial<AlignmentWeights>): void {
    const newWeights = { ...this.config.alignmentWeights, ...weights };

    // Validate individual weight ranges first
    if (newWeights.daily < 30 || newWeights.daily > 60) {
      throw new Error(`Daily weight must be 30-60%, got ${newWeights.daily}%`);
    }
    if (newWeights.h4 < 20 || newWeights.h4 > 40) {
      throw new Error(`4H weight must be 20-40%, got ${newWeights.h4}%`);
    }
    if (newWeights.m15 < 10 || newWeights.m15 > 30) {
      throw new Error(`15m weight must be 10-30%, got ${newWeights.m15}%`);
    }

    // Validate weights sum to 100%
    const total = newWeights.daily + newWeights.h4 + newWeights.m15;
    if (Math.abs(total - 100) > 0.1) {
      throw new Error(`Alignment weights must sum to 100%, got ${total}%`);
    }

    const newConfig = {
      ...this.config,
      alignmentWeights: newWeights,
    };

    this.saveConfig(newConfig);
  }

  /**
   * Update RS configuration
   * Requirement 18.3: Allow adjustment of RS threshold (0-5%) and lookback period (2-8 hours)
   */
  updateRSConfig(rsConfig: Partial<RSConfig>): void {
    const newRSConfig = { ...this.config.rsConfig, ...rsConfig };

    const newConfig = {
      ...this.config,
      rsConfig: newRSConfig,
    };

    this.saveConfig(newConfig);
  }

  /**
   * Update risk configuration
   * Requirement 18.4: Allow adjustment of max leverage (3-5x), stop loss (1-3%), target (3-6%)
   */
  updateRiskConfig(riskConfig: Partial<RiskConfig>): void {
    const newRiskConfig = { ...this.config.riskConfig, ...riskConfig };

    const newConfig = {
      ...this.config,
      riskConfig: newRiskConfig,
    };

    this.saveConfig(newConfig);
  }

  /**
   * Update portfolio configuration
   * Requirement 18.5: Allow adjustment of max positions (3-8), max heat (10-20%), correlation (0.6-0.9)
   */
  updatePortfolioConfig(portfolioConfig: Partial<PortfolioConfig>): void {
    const newPortfolioConfig = {
      ...this.config.portfolioConfig,
      ...portfolioConfig,
    };

    const newConfig = {
      ...this.config,
      portfolioConfig: newPortfolioConfig,
    };

    this.saveConfig(newConfig);
  }

  /**
   * Start watching configuration file for changes (hot-reload)
   * Support hot-reload without restart
   */
  startWatching(): void {
    if (this.isWatching) {
      return;
    }

    this.isWatching = true;

    watchFile(this.configPath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        console.log("🔄 Configuration file changed, reloading...");
        try {
          const newConfig = this.loadConfig();
          const oldConfig = { ...this.config };
          this.config = newConfig;

          this.emit("configReloaded", {
            section: "all",
            oldValue: oldConfig,
            newValue: newConfig,
            timestamp: Date.now(),
          } as unknown as ConfigChangeEvent);

          console.log("✅ Configuration reloaded successfully");
        } catch (error) {
          console.error("❌ Failed to reload configuration:", error);
        }
      }
    });

    console.log("👁️ Started watching configuration file for changes");
  }

  /**
   * Stop watching configuration file
   */
  stopWatching(): void {
    if (!this.isWatching) {
      return;
    }

    unwatchFile(this.configPath);
    this.isWatching = false;
    console.log("👁️ Stopped watching configuration file");
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
      alignmentWeights: {
        ...DEFAULT_CONFIG.alignmentWeights,
        ...loadedConfig.alignmentWeights,
      },
      rsConfig: {
        ...DEFAULT_CONFIG.rsConfig,
        ...loadedConfig.rsConfig,
      },
      riskConfig: {
        ...DEFAULT_CONFIG.riskConfig,
        ...loadedConfig.riskConfig,
      },
      portfolioConfig: {
        ...DEFAULT_CONFIG.portfolioConfig,
        ...loadedConfig.portfolioConfig,
      },
      version: loadedConfig.version || DEFAULT_CONFIG.version,
      lastModified: loadedConfig.lastModified || Date.now(),
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
