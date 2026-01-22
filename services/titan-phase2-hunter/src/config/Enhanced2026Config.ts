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
import { DEFAULT_ENHANCED_2026_CONFIG } from "./EnhancedConfig.defaults";
import {
  BotTrapConfig,
  ConvictionConfig,
  Enhanced2026Config,
  Enhanced2026ConfigChangeEvent,
  Enhanced2026ValidationResult,
  FlowValidatorConfig,
  GlobalAggregatorConfig,
  OracleConfig,
} from "./EnhancedConfig.types";
import { EnhancedConfigValidator } from "./EnhancedConfig.validator";

// Export types and defaults for consumers
export * from "./EnhancedConfig.defaults";
export * from "./EnhancedConfig.types";
export * from "./EnhancedConfig.validator";

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
      const validation = EnhancedConfigValidator.validate(loadedConfig);
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
      // Create copy to modify
      const newConfig = { ...config };

      // Update version and timestamp
      // eslint-disable-next-line functional/immutable-data
      (newConfig as any).version = (newConfig.version || 0) + 1;
      // eslint-disable-next-line functional/immutable-data
      (newConfig as any).lastModified = Date.now();

      // Validate before saving
      const validation = EnhancedConfigValidator.validate(newConfig);
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
      writeFileSync(
        this.configPath,
        JSON.stringify(newConfig, null, 2),
        "utf8",
      );

      // Update internal config
      const oldConfig = { ...this.config };
      // eslint-disable-next-line functional/immutable-data
      this.config = newConfig;

      // Emit change event
      this.emit("configChanged", {
        section: "all",
        oldValue: oldConfig,
        newValue: newConfig,
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
    // eslint-disable-next-line functional/immutable-data
    this.isWatching = true;

    watchFile(this.configPath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        console.log(
          "🔄 Enhanced 2026 configuration file changed, reloading...",
        );
        try {
          const newConfig = this.loadConfig();
          const oldConfig = { ...this.config };
          // eslint-disable-next-line functional/immutable-data
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
    // eslint-disable-next-line functional/immutable-data
    this.isWatching = false;
    console.log("👁️ Stopped watching enhanced 2026 configuration file");
  }

  /**
   * Validate configuration against requirements
   * Requirement 16.6: Validate parameter ranges and dependencies
   */
  validateConfig(config: Enhanced2026Config): Enhanced2026ValidationResult {
    return EnhancedConfigValidator.validate(config);
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
        (
          config.globalAggregator.consensusThreshold * 100
        ).toFixed(0)
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
    // eslint-disable-next-line functional/immutable-data
    if (this.config.oracle.enabled) enabled.push("Oracle");
    // eslint-disable-next-line functional/immutable-data
    if (this.config.flowValidator.enabled) enabled.push("FlowValidator");
    // eslint-disable-next-line functional/immutable-data
    if (this.config.botTrapDetector.enabled) enabled.push("BotTrapDetector");
    // eslint-disable-next-line functional/immutable-data
    if (this.config.globalAggregator.enabled) enabled.push("GlobalAggregator");
    // eslint-disable-next-line functional/immutable-data
    if (this.config.conviction.enabled) enabled.push("Conviction");
    return enabled;
  }
}
