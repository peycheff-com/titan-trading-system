/**
 * ConfigManager - Hierarchical Configuration Management
 *
 * Handles loading, saving, and hot-reloading of trap parameters and exchange settings.
 * Supports hierarchical configuration with Brain override capabilities.
 * Supports immediate file write and runtime updates without restart.
 *
 * Requirements: 8.4 (Hierarchical Configuration with Brain Override)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { EventEmitter } from "events";

export interface TrapConfig {
  // Pre-Computation Settings
  updateInterval: number; // 60000ms (1 minute)
  topSymbolsCount: number; // 20

  // Tripwire Thresholds
  liquidationConfidence: number; // 95
  dailyLevelConfidence: number; // 85
  bollingerConfidence: number; // 90

  // Volume Validation
  minTradesIn100ms: number; // 50
  volumeWindowMs: number; // 100

  // Execution Settings
  extremeVelocityThreshold: number; // 0.005 (0.5%/s)
  moderateVelocityThreshold: number; // 0.001 (0.1%/s)
  aggressiveLimitMarkup: number; // 0.002 (0.2%)

  // Risk Management
  maxLeverage: number; // 20
  maxPositionSizePercent: number; // 0.5 (50%)
  stopLossPercent: number; // 0.01 (1%)
  targetPercent: number; // 0.03 (3%)

  // Advanced Features
  ghostMode: boolean; // Safe debugging mode (log only)

  // Exchange Settings
  exchanges: {
    binance: {
      enabled: boolean; // Always enabled for signal validation
    };
    bybit: {
      enabled: boolean;
      executeOn: boolean; // Execution target
    };
    mexc: {
      enabled: boolean;
      executeOn: boolean; // Execution target
    };
  };
}

/**
 * Brain override configuration interface
 * These settings can be overridden by the Brain service
 */
export interface BrainOverrideConfig {
  // Global risk limits that Brain can enforce
  maxGlobalLeverage?: number; // Global leverage cap across all phases
  maxGlobalDrawdown?: number; // Global drawdown limit (0-1)
  emergencyFlattenEnabled?: boolean; // Emergency flatten capability

  // Phase-specific overrides
  phase1?: {
    enabled?: boolean; // Phase can be disabled by Brain
    maxLeverage?: number; // Override max leverage
    maxPositionSize?: number; // Override max position size
    riskMultiplier?: number; // Risk adjustment multiplier (0-2)
  };

  // Configuration source metadata
  source: "brain" | "phase" | "default";
  timestamp: number;
  version: string;
}

/**
 * Merged configuration that combines phase config with Brain overrides
 */
export interface MergedConfig extends TrapConfig {
  // Brain override information
  brainOverrides: BrainOverrideConfig;

  // Effective values after Brain overrides applied
  effective: {
    maxLeverage: number;
    maxPositionSizePercent: number;
    enabled: boolean;
    riskMultiplier: number;
  };
}

/**
 * Configuration change event
 */
export interface ConfigChangeEvent {
  type: "phase" | "brain" | "merged";
  source: string;
  changes: Partial<TrapConfig | BrainOverrideConfig>;
  timestamp: number;
}

export class ConfigManager extends EventEmitter {
  private phaseConfig: TrapConfig;
  private brainOverrides: BrainOverrideConfig;
  private mergedConfig: MergedConfig;

  private readonly configDir: string;
  private readonly phaseConfigPath: string;
  private readonly brainConfigPath: string;

  // Hot-reload support
  private configWatcher: fs.FSWatcher | null = null;
  private brainWatcher: fs.FSWatcher | null = null;

  // Environment-based configuration
  private readonly environment: string;

  constructor(environment: string = process.env.NODE_ENV || "development") {
    super();

    this.environment = environment;

    // Use environment-specific config directories
    this.configDir = this.getConfigDirectory();
    this.phaseConfigPath = path.join(this.configDir, "phase1-scavenger.json");
    this.brainConfigPath = path.join(this.configDir, "brain-overrides.json");

    // Ensure config directory exists
    this.ensureConfigDir();

    // Load configurations
    this.phaseConfig = this.loadPhaseConfig();
    this.brainOverrides = this.loadBrainOverrides();
    this.mergedConfig = this.mergeConfigurations();

    // Setup hot-reload watchers
    this.setupHotReload();
  }

  /**
   * Get environment-specific configuration directory
   */
  private getConfigDirectory(): string {
    const baseDir = process.env.TITAN_CONFIG_DIR ||
      path.join(os.homedir(), ".titan");

    switch (this.environment) {
      case "production":
        return path.join(baseDir, "production");
      case "staging":
        return path.join(baseDir, "staging");
      case "test":
        return path.join(baseDir, "test");
      default:
        return path.join(baseDir, "development");
    }
  }

  /**
   * Ensure config directory exists
   */
  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
      console.log(`✅ Created config directory: ${this.configDir}`);
    }
  }

  /**
   * Load phase-specific configuration from file or return defaults
   */
  private loadPhaseConfig(): TrapConfig {
    try {
      if (fs.existsSync(this.phaseConfigPath)) {
        const data = fs.readFileSync(this.phaseConfigPath, "utf-8");
        const loadedConfig = JSON.parse(data);
        console.log(`✅ Phase config loaded from: ${this.phaseConfigPath}`);
        return this.validateAndMergeWithDefaults(loadedConfig);
      }
    } catch (error) {
      console.warn(
        `⚠️ Failed to load phase config: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      console.log("📝 Using default phase configuration");
    }

    // Return default configuration
    return this.getDefaultConfig();
  }

  /**
   * Load Brain override configuration
   */
  private loadBrainOverrides(): BrainOverrideConfig {
    try {
      if (fs.existsSync(this.brainConfigPath)) {
        const data = fs.readFileSync(this.brainConfigPath, "utf-8");
        const loadedOverrides = JSON.parse(data);
        console.log(`✅ Brain overrides loaded from: ${this.brainConfigPath}`);
        return this.validateBrainOverrides(loadedOverrides);
      }
    } catch (error) {
      console.warn(
        `⚠️ Failed to load Brain overrides: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }

    // Return default (no overrides)
    return this.getDefaultBrainOverrides();
  }

  /**
   * Validate and merge loaded config with defaults
   */
  private validateAndMergeWithDefaults(
    loadedConfig: Partial<TrapConfig>,
  ): TrapConfig {
    const defaultConfig = this.getDefaultConfig();

    // Deep merge with defaults
    return {
      ...defaultConfig,
      ...loadedConfig,
      exchanges: {
        ...defaultConfig.exchanges,
        ...(loadedConfig.exchanges || {}),
      },
    };
  }

  /**
   * Validate Brain overrides
   */
  private validateBrainOverrides(
    overrides: Partial<BrainOverrideConfig>,
  ): BrainOverrideConfig {
    const validated: BrainOverrideConfig = {
      source: overrides.source || "brain",
      timestamp: overrides.timestamp || Date.now(),
      version: overrides.version || "1.0.0",
    };

    // Validate global settings
    if (overrides.maxGlobalLeverage !== undefined) {
      if (
        overrides.maxGlobalLeverage >= 1 && overrides.maxGlobalLeverage <= 100
      ) {
        validated.maxGlobalLeverage = overrides.maxGlobalLeverage;
      }
    }

    if (overrides.maxGlobalDrawdown !== undefined) {
      if (
        overrides.maxGlobalDrawdown >= 0.01 &&
        overrides.maxGlobalDrawdown <= 1.0
      ) {
        validated.maxGlobalDrawdown = overrides.maxGlobalDrawdown;
      }
    }

    if (overrides.emergencyFlattenEnabled !== undefined) {
      validated.emergencyFlattenEnabled = overrides.emergencyFlattenEnabled;
    }

    // Validate phase-specific overrides
    if (overrides.phase1) {
      validated.phase1 = {};

      if (overrides.phase1.enabled !== undefined) {
        validated.phase1.enabled = overrides.phase1.enabled;
      }

      if (overrides.phase1.maxLeverage !== undefined) {
        if (
          overrides.phase1.maxLeverage >= 1 &&
          overrides.phase1.maxLeverage <= 100
        ) {
          validated.phase1.maxLeverage = overrides.phase1.maxLeverage;
        }
      }

      if (overrides.phase1.maxPositionSize !== undefined) {
        if (
          overrides.phase1.maxPositionSize >= 0.01 &&
          overrides.phase1.maxPositionSize <= 1.0
        ) {
          validated.phase1.maxPositionSize = overrides.phase1.maxPositionSize;
        }
      }

      if (overrides.phase1.riskMultiplier !== undefined) {
        if (
          overrides.phase1.riskMultiplier >= 0 &&
          overrides.phase1.riskMultiplier <= 2.0
        ) {
          validated.phase1.riskMultiplier = overrides.phase1.riskMultiplier;
        }
      }
    }

    return validated;
  }

  /**
   * Get default Brain overrides (no overrides)
   */
  private getDefaultBrainOverrides(): BrainOverrideConfig {
    return {
      source: "default",
      timestamp: Date.now(),
      version: "1.0.0",
    };
  }

  /**
   * Merge phase configuration with Brain overrides
   */
  private mergeConfigurations(): MergedConfig {
    const merged: MergedConfig = {
      ...this.phaseConfig,
      brainOverrides: this.brainOverrides,
      effective: {
        maxLeverage: this.phaseConfig.maxLeverage,
        maxPositionSizePercent: this.phaseConfig.maxPositionSizePercent,
        enabled: true,
        riskMultiplier: 1.0,
      },
    };

    // Apply Brain overrides
    if (this.brainOverrides.maxGlobalLeverage !== undefined) {
      merged.effective.maxLeverage = Math.min(
        merged.effective.maxLeverage,
        this.brainOverrides.maxGlobalLeverage,
      );
    }

    if (this.brainOverrides.phase1) {
      if (this.brainOverrides.phase1.enabled !== undefined) {
        merged.effective.enabled = this.brainOverrides.phase1.enabled;
      }

      if (this.brainOverrides.phase1.maxLeverage !== undefined) {
        merged.effective.maxLeverage = Math.min(
          merged.effective.maxLeverage,
          this.brainOverrides.phase1.maxLeverage,
        );
      }

      if (this.brainOverrides.phase1.maxPositionSize !== undefined) {
        merged.effective.maxPositionSizePercent = Math.min(
          merged.effective.maxPositionSizePercent,
          this.brainOverrides.phase1.maxPositionSize,
        );
      }

      if (this.brainOverrides.phase1.riskMultiplier !== undefined) {
        merged.effective.riskMultiplier =
          this.brainOverrides.phase1.riskMultiplier;
      }
    }

    return merged;
  }

  /**
   * Get default configuration
   * Requirements: 12.1-12.7
   */
  private getDefaultConfig(): TrapConfig {
    return {
      // Pre-Computation Settings
      updateInterval: 60000, // 1 minute
      topSymbolsCount: 20,

      // Tripwire Thresholds
      liquidationConfidence: 95,
      dailyLevelConfidence: 85,
      bollingerConfidence: 90,

      // Volume Validation
      minTradesIn100ms: 50,
      volumeWindowMs: 100,

      // Execution Settings
      extremeVelocityThreshold: 0.005, // 0.5%/s
      moderateVelocityThreshold: 0.001, // 0.1%/s
      aggressiveLimitMarkup: 0.002, // 0.2%

      // Risk Management
      maxLeverage: 20,
      maxPositionSizePercent: 0.5, // 50%
      stopLossPercent: 0.01, // 1%
      targetPercent: 0.03, // 3%

      // Advanced Features
      ghostMode: true, // Default to true for safety

      // Exchange Settings
      exchanges: {
        binance: {
          enabled: true, // Always enabled for signal validation
        },
        bybit: {
          enabled: true,
          executeOn: true, // Execute on Bybit by default
        },
        mexc: {
          enabled: false,
          executeOn: false, // MEXC disabled by default
        },
      },
    };
  }

  /**
   * Setup hot-reload file watchers
   */
  private setupHotReload(): void {
    try {
      // Watch phase config file
      if (fs.existsSync(this.phaseConfigPath)) {
        this.configWatcher = fs.watch(this.phaseConfigPath, (eventType) => {
          if (eventType === "change") {
            this.handlePhaseConfigChange();
          }
        });
      }

      // Watch Brain overrides file
      if (fs.existsSync(this.brainConfigPath)) {
        this.brainWatcher = fs.watch(this.brainConfigPath, (eventType) => {
          if (eventType === "change") {
            this.handleBrainOverrideChange();
          }
        });
      }

      console.log("✅ Hot-reload watchers setup");
    } catch (error) {
      console.warn(
        `⚠️ Failed to setup hot-reload: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Handle phase configuration file changes
   */
  private handlePhaseConfigChange(): void {
    try {
      console.log("🔄 Phase config file changed, reloading...");

      const oldConfig = { ...this.phaseConfig };
      this.phaseConfig = this.loadPhaseConfig();
      this.mergedConfig = this.mergeConfigurations();

      // Emit change event
      this.emit("configChanged", {
        type: "phase",
        source: this.phaseConfigPath,
        changes: this.getConfigDiff(oldConfig, this.phaseConfig),
        timestamp: Date.now(),
      } as ConfigChangeEvent);

      console.log("✅ Phase config reloaded successfully");
    } catch (error) {
      console.error(
        `❌ Failed to reload phase config: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Handle Brain override file changes
   */
  private handleBrainOverrideChange(): void {
    try {
      console.log("🔄 Brain overrides file changed, reloading...");

      const oldOverrides = { ...this.brainOverrides };
      this.brainOverrides = this.loadBrainOverrides();
      this.mergedConfig = this.mergeConfigurations();

      // Emit change event
      this.emit("configChanged", {
        type: "brain",
        source: this.brainConfigPath,
        changes: this.getConfigDiff(oldOverrides, this.brainOverrides),
        timestamp: Date.now(),
      } as ConfigChangeEvent);

      console.log("✅ Brain overrides reloaded successfully");
    } catch (error) {
      console.error(
        `❌ Failed to reload Brain overrides: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Get configuration differences for change events
   */
  private getConfigDiff(oldConfig: any, newConfig: any): any {
    const diff: any = {};

    for (const key in newConfig) {
      if (JSON.stringify(oldConfig[key]) !== JSON.stringify(newConfig[key])) {
        diff[key] = {
          old: oldConfig[key],
          new: newConfig[key],
        };
      }
    }

    return diff;
  }

  /**
   * Save phase configuration to file with immediate write
   */
  savePhaseConfig(newConfig: TrapConfig): void {
    try {
      // Validate configuration
      const errors = this.validateConfig(newConfig);
      if (errors.length > 0) {
        throw new Error(
          `Configuration validation failed: ${errors.join(", ")}`,
        );
      }

      // Ensure directory exists
      this.ensureConfigDir();

      // Write config with pretty formatting
      fs.writeFileSync(
        this.phaseConfigPath,
        JSON.stringify(newConfig, null, 2),
        "utf-8",
      );

      // Update in-memory config
      const oldConfig = { ...this.phaseConfig };
      this.phaseConfig = newConfig;
      this.mergedConfig = this.mergeConfigurations();

      // Emit change event
      this.emit("configChanged", {
        type: "phase",
        source: "api",
        changes: this.getConfigDiff(oldConfig, newConfig),
        timestamp: Date.now(),
      } as ConfigChangeEvent);

      console.log("✅ Phase config saved and applied");
      console.log(`📁 Location: ${this.phaseConfigPath}`);
    } catch (error) {
      console.error(
        `❌ Failed to save phase config: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      throw error;
    }
  }

  /**
   * Update Brain overrides (typically called by Brain service)
   */
  updateBrainOverrides(overrides: Partial<BrainOverrideConfig>): void {
    try {
      // Merge with existing overrides
      const newOverrides = {
        ...this.brainOverrides,
        ...overrides,
        timestamp: Date.now(),
      };

      // Validate overrides
      const validatedOverrides = this.validateBrainOverrides(newOverrides);

      // Save to file
      fs.writeFileSync(
        this.brainConfigPath,
        JSON.stringify(validatedOverrides, null, 2),
        "utf-8",
      );

      // Update in-memory config
      const oldOverrides = { ...this.brainOverrides };
      this.brainOverrides = validatedOverrides;
      this.mergedConfig = this.mergeConfigurations();

      // Emit change event
      this.emit("configChanged", {
        type: "brain",
        source: "brain-api",
        changes: this.getConfigDiff(oldOverrides, validatedOverrides),
        timestamp: Date.now(),
      } as ConfigChangeEvent);

      console.log("✅ Brain overrides updated and applied");
    } catch (error) {
      console.error(
        `❌ Failed to update Brain overrides: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      throw error;
    }
  }

  /**
   * Get current merged configuration (phase + Brain overrides)
   */
  getConfig(): MergedConfig {
    return this.mergedConfig;
  }

  /**
   * Get phase-specific configuration (without Brain overrides)
   */
  getPhaseConfig(): TrapConfig {
    return this.phaseConfig;
  }

  /**
   * Get Brain overrides
   */
  getBrainOverrides(): BrainOverrideConfig {
    return this.brainOverrides;
  }

  /**
   * Get effective configuration values (after Brain overrides)
   */
  getEffectiveConfig(): TrapConfig & { effective: MergedConfig["effective"] } {
    return {
      ...this.phaseConfig,
      // Override with effective values
      maxLeverage: this.mergedConfig.effective.maxLeverage,
      maxPositionSizePercent:
        this.mergedConfig.effective.maxPositionSizePercent,
      effective: this.mergedConfig.effective,
    };
  }

  /**
   * Update specific phase configuration values
   * Supports hot-reload without restart
   */
  updatePhaseConfig(updates: Partial<TrapConfig>): void {
    // Merge updates with current phase config
    const updatedConfig = {
      ...this.phaseConfig,
      ...updates,
      // Handle nested exchange config
      exchanges: {
        ...this.phaseConfig.exchanges,
        ...(updates.exchanges || {}),
      },
    };

    // Save to file
    this.savePhaseConfig(updatedConfig);
  }

  /**
   * Update regime settings
   */
  updateRegimeSettings(settings: {
    liquidationConfidence?: number;
    dailyLevelConfidence?: number;
    bollingerConfidence?: number;
  }): void {
    this.updatePhaseConfig(settings);
  }

  /**
   * Update flow settings
   */
  updateFlowSettings(settings: {
    minTradesIn100ms?: number;
    volumeWindowMs?: number;
  }): void {
    this.updatePhaseConfig(settings);
  }

  /**
   * Update risk settings
   */
  updateRiskSettings(settings: {
    maxLeverage?: number;
    maxPositionSizePercent?: number;
    stopLossPercent?: number;
    targetPercent?: number;
  }): void {
    this.updatePhaseConfig(settings);
  }

  /**
   * Update exchange settings
   */
  updateExchangeSettings(exchange: "bybit" | "mexc", settings: {
    enabled?: boolean;
    executeOn?: boolean;
  }): void {
    const updatedConfig = { ...this.phaseConfig };
    updatedConfig.exchanges[exchange] = {
      ...updatedConfig.exchanges[exchange],
      ...settings,
    };

    this.savePhaseConfig(updatedConfig);
  }

  /**
   * Reset phase configuration to defaults
   */
  resetToDefaults(): void {
    const defaultConfig = this.getDefaultConfig();
    this.savePhaseConfig(defaultConfig);
    console.log("✅ Phase configuration reset to defaults");
  }

  /**
   * Clear Brain overrides (reset to no overrides)
   */
  clearBrainOverrides(): void {
    const defaultOverrides = this.getDefaultBrainOverrides();
    this.updateBrainOverrides(defaultOverrides);
    console.log("✅ Brain overrides cleared");
  }

  /**
   * Check if Brain has overridden any settings
   */
  hasBrainOverrides(): boolean {
    return this.brainOverrides.source === "brain" && (
      this.brainOverrides.maxGlobalLeverage !== undefined ||
      this.brainOverrides.maxGlobalDrawdown !== undefined ||
      this.brainOverrides.emergencyFlattenEnabled !== undefined ||
      this.brainOverrides.phase1 !== undefined
    );
  }

  /**
   * Get configuration status summary
   */
  getConfigStatus(): {
    environment: string;
    phaseConfigExists: boolean;
    brainOverridesExists: boolean;
    hasBrainOverrides: boolean;
    hotReloadEnabled: boolean;
    lastUpdated: number;
  } {
    return {
      environment: this.environment,
      phaseConfigExists: fs.existsSync(this.phaseConfigPath),
      brainOverridesExists: fs.existsSync(this.brainConfigPath),
      hasBrainOverrides: this.hasBrainOverrides(),
      hotReloadEnabled: this.configWatcher !== null ||
        this.brainWatcher !== null,
      lastUpdated: this.brainOverrides.timestamp,
    };
  }

  /**
   * Validate configuration values
   * Returns array of validation errors, empty if valid
   */
  validateConfig(config: TrapConfig): string[] {
    const errors: string[] = [];

    // Validate numeric ranges
    if (config.updateInterval < 10000 || config.updateInterval > 300000) {
      errors.push("updateInterval must be between 10000ms and 300000ms");
    }

    if (config.topSymbolsCount < 1 || config.topSymbolsCount > 50) {
      errors.push("topSymbolsCount must be between 1 and 50");
    }

    if (
      config.liquidationConfidence < 0 || config.liquidationConfidence > 100
    ) {
      errors.push("liquidationConfidence must be between 0 and 100");
    }

    if (config.dailyLevelConfidence < 0 || config.dailyLevelConfidence > 100) {
      errors.push("dailyLevelConfidence must be between 0 and 100");
    }

    if (config.bollingerConfidence < 0 || config.bollingerConfidence > 100) {
      errors.push("bollingerConfidence must be between 0 and 100");
    }

    if (config.minTradesIn100ms < 1 || config.minTradesIn100ms > 1000) {
      errors.push("minTradesIn100ms must be between 1 and 1000");
    }

    if (config.volumeWindowMs < 10 || config.volumeWindowMs > 1000) {
      errors.push("volumeWindowMs must be between 10ms and 1000ms");
    }

    if (
      config.extremeVelocityThreshold < 0 ||
      config.extremeVelocityThreshold > 0.1
    ) {
      errors.push("extremeVelocityThreshold must be between 0 and 0.1 (10%)");
    }

    if (
      config.moderateVelocityThreshold < 0 ||
      config.moderateVelocityThreshold > 0.05
    ) {
      errors.push("moderateVelocityThreshold must be between 0 and 0.05 (5%)");
    }

    if (
      config.aggressiveLimitMarkup < 0 || config.aggressiveLimitMarkup > 0.01
    ) {
      errors.push("aggressiveLimitMarkup must be between 0 and 0.01 (1%)");
    }

    if (config.maxLeverage < 1 || config.maxLeverage > 100) {
      errors.push("maxLeverage must be between 1 and 100");
    }

    if (
      config.maxPositionSizePercent < 0.1 || config.maxPositionSizePercent > 1.0
    ) {
      errors.push(
        "maxPositionSizePercent must be between 0.1 (10%) and 1.0 (100%)",
      );
    }

    if (config.stopLossPercent < 0.001 || config.stopLossPercent > 0.1) {
      errors.push("stopLossPercent must be between 0.001 (0.1%) and 0.1 (10%)");
    }

    if (config.targetPercent < 0.001 || config.targetPercent > 0.5) {
      errors.push("targetPercent must be between 0.001 (0.1%) and 0.5 (50%)");
    }

    // Validate exchange settings
    if (!config.exchanges.binance.enabled) {
      errors.push("Binance must always be enabled for signal validation");
    }

    if (!config.exchanges.bybit.enabled && !config.exchanges.mexc.enabled) {
      errors.push(
        "At least one execution exchange (Bybit or MEXC) must be enabled",
      );
    }

    return errors;
  }

  /**
   * Get configuration file paths
   */
  getConfigPaths(): {
    phaseConfig: string;
    brainOverrides: string;
    configDir: string;
  } {
    return {
      phaseConfig: this.phaseConfigPath,
      brainOverrides: this.brainConfigPath,
      configDir: this.configDir,
    };
  }

  /**
   * Check if configuration files exist
   */
  configExists(): {
    phaseConfig: boolean;
    brainOverrides: boolean;
  } {
    return {
      phaseConfig: fs.existsSync(this.phaseConfigPath),
      brainOverrides: fs.existsSync(this.brainConfigPath),
    };
  }

  /**
   * Cleanup resources (stop file watchers)
   */
  destroy(): void {
    if (this.configWatcher) {
      this.configWatcher.close();
      this.configWatcher = null;
    }

    if (this.brainWatcher) {
      this.brainWatcher.close();
      this.brainWatcher = null;
    }

    this.removeAllListeners();
    console.log("✅ ConfigManager destroyed");
  }

  /**
   * Force reload all configurations
   */
  reload(): void {
    console.log("🔄 Force reloading all configurations...");

    const oldPhaseConfig = { ...this.phaseConfig };
    const oldBrainOverrides = { ...this.brainOverrides };

    this.phaseConfig = this.loadPhaseConfig();
    this.brainOverrides = this.loadBrainOverrides();
    this.mergedConfig = this.mergeConfigurations();

    // Emit change events
    this.emit("configChanged", {
      type: "phase",
      source: "reload",
      changes: this.getConfigDiff(oldPhaseConfig, this.phaseConfig),
      timestamp: Date.now(),
    } as ConfigChangeEvent);

    this.emit("configChanged", {
      type: "brain",
      source: "reload",
      changes: this.getConfigDiff(oldBrainOverrides, this.brainOverrides),
      timestamp: Date.now(),
    } as ConfigChangeEvent);

    console.log("✅ All configurations reloaded");
  }
}
