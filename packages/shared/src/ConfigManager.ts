/**
 * Hierarchical Config Manager for Titan Trading System
 *
 * Provides centralized configuration management with Brain override capabilities,
 * hot-reload support, schema validation, and environment-specific loading.
 *
 * Requirements: 3.1, 3.3 - Hierarchical configuration and environment-specific loading
 */

import { EventEmitter } from 'eventemitter3';
import { unwatchFile, watchFile, writeFileSync } from 'fs';
import { join } from 'path';
import { HierarchicalConfigLoader } from './config/HierarchicalConfigLoader';
import {
  BrainConfig as SchemaBrainConfig,
  ConfigValidator,
  Environment,
  PhaseConfig as SchemaPhaseConfig,
} from './config/ConfigSchema';
import {
  type ConfigVersion,
  ConfigVersionHistory,
  getConfigVersionHistory,
} from './config/ConfigVersionHistory';

// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
};

/**
 * Configuration hierarchy levels
 */
export type ConfigLevel = 'brain' | 'phase' | 'service';

/**
 * Re-export types from schema for backward compatibility
 */
export type PhaseConfig = SchemaPhaseConfig;
export type BrainConfig = SchemaBrainConfig;

/**
 * Service configuration
 */
export interface ServiceConfig {
  [key: string]: unknown;
}

/**
 * Configuration change event
 */
export interface ConfigChangeEvent {
  level: ConfigLevel;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
  sources?: Array<{
    source: string;
    path?: string;
    keys: string[];
  }>;
}

/**
 * Configuration file watcher
 */
class ConfigWatcher {
  private watchers = new Map<string, boolean>();

  constructor(private configManager: ConfigManager) {}

  /**
   * Watch configuration file for changes
   */
  watch(filePath: string, callback: () => void): void {
    if (this.watchers.has(filePath)) {
      return;
    }

    // eslint-disable-next-line functional/immutable-data
    this.watchers.set(filePath, true);

    watchFile(filePath, { interval: 1000 }, (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        console.log(colors.blue(`🔄 Configuration file changed: ${filePath}`));
        callback();
      }
    });
  }

  /**
   * Stop watching configuration file
   */
  unwatch(filePath: string): void {
    if (this.watchers.has(filePath)) {
      unwatchFile(filePath);
      // eslint-disable-next-line functional/immutable-data
      this.watchers.delete(filePath);
    }
  }

  /**
   * Stop watching all files
   */
  unwatchAll(): void {
    for (const filePath of this.watchers.keys()) {
      this.unwatch(filePath);
    }
  }
}

/**
 * Hierarchical Configuration Manager
 */
export class ConfigManager extends EventEmitter {
  private brainConfig: BrainConfig | null = null;
  private phaseConfigs = new Map<string, PhaseConfig>();
  private serviceConfigs = new Map<string, ServiceConfig>();
  private configWatcher: ConfigWatcher;
  private configDirectory: string;
  private hierarchicalLoader: HierarchicalConfigLoader;
  private environment: Environment;
  private versionHistory: ConfigVersionHistory;

  constructor(configDirectory: string = './config', environment?: Environment) {
    super();
    this.configDirectory = configDirectory;
    this.environment = environment || (process.env.NODE_ENV as Environment) || 'development';
    this.configWatcher = new ConfigWatcher(this);

    // Initialize hierarchical loader
    this.hierarchicalLoader = new HierarchicalConfigLoader({
      configDirectory,
      environment: this.environment,
      enableEnvironmentVariables: true,
      enableEnvironmentFiles: true,
      validateSchema: true,
    });

    // Initialize version history
    this.versionHistory = getConfigVersionHistory(
      join(configDirectory, '.history'),
      100, // Keep last 100 versions
      false, // No compression for now
    );

    console.log(colors.blue(`🚀 Config Manager initialized for environment: ${this.environment}`));
  }

  /**
   * Load brain configuration using hierarchical loader
   */
  async loadBrainConfig(): Promise<BrainConfig> {
    try {
      const result = await this.hierarchicalLoader.loadBrainConfig();

      if (result.validation.warnings.length > 0) {
        console.warn(colors.yellow('⚠️ Brain config warnings:'), result.validation.warnings);
      }

      // eslint-disable-next-line functional/immutable-data
      this.brainConfig = result.config;

      // Save version to history
      this.versionHistory.saveVersion(
        'brain',
        'brain',
        result.config,
        'system',
        'Configuration loaded',
      );

      // Watch configuration files for changes
      for (const source of result.sources) {
        if (source.path && source.source !== 'environment') {
          this.configWatcher.watch(source.path, () => {
            this.reloadBrainConfig();
          });
        }
      }

      console.log(colors.green('✅ Brain configuration loaded'));
      console.log(
        colors.blue(`📋 Configuration sources: ${result.sources.map((s) => s.source).join(', ')}`),
      );

      return result.config;
    } catch (error) {
      console.error(colors.red('❌ Failed to load brain configuration:'), error);
      throw error;
    }
  }

  /**
   * Load phase configuration using hierarchical loader with brain overrides
   */
  async loadPhaseConfig(phase: string): Promise<PhaseConfig> {
    try {
      const result = await this.hierarchicalLoader.loadPhaseConfig(phase);
      // eslint-disable-next-line functional/no-let
      let config = result.config;

      // Apply brain overrides if available
      if (this.brainConfig?.overrides?.[phase]) {
        config = this.mergeConfigs(
          config,
          this.brainConfig.overrides[phase] as Partial<PhaseConfig>,
        );
        console.log(colors.blue(`🔄 Applied brain overrides for ${phase}`));

        const overrideValidation = ConfigValidator.validatePhaseConfig(config);
        if (!overrideValidation.valid) {
          throw new Error(
            `Invalid ${phase} configuration after brain overrides: ${overrideValidation.errors.join(
              ', ',
            )}`,
          );
        }

        if (overrideValidation.warnings.length > 0) {
          console.warn(
            colors.yellow(`⚠️ ${phase} override warnings:`),
            overrideValidation.warnings,
          );
        }

        config = overrideValidation.data || config;
      }

      if (result.validation.warnings.length > 0) {
        console.warn(colors.yellow(`⚠️ ${phase} config warnings:`), result.validation.warnings);
      }

      // Validate against brain limits
      this.validateAgainstBrainLimits(phase, config);

      // eslint-disable-next-line functional/immutable-data
      this.phaseConfigs.set(phase, config);

      // Save version to history
      this.versionHistory.saveVersion('phase', phase, config, 'system', 'Configuration loaded');

      // Watch configuration files for changes
      for (const source of result.sources) {
        if (source.path && source.source !== 'environment') {
          this.configWatcher.watch(source.path, () => {
            this.reloadPhaseConfig(phase);
          });
        }
      }

      console.log(colors.green(`✅ ${phase} configuration loaded`));
      console.log(
        colors.blue(`📋 Configuration sources: ${result.sources.map((s) => s.source).join(', ')}`),
      );

      return config;
    } catch (error) {
      console.error(colors.red(`❌ Failed to load ${phase} configuration:`), error);
      throw error;
    }
  }

  /**
   * Load service configuration using hierarchical loader
   */
  async loadServiceConfig(service: string): Promise<ServiceConfig> {
    try {
      const result = await this.hierarchicalLoader.loadServiceConfig(service);

      if (result.validation.warnings.length > 0) {
        console.warn(colors.yellow(`⚠️ ${service} config warnings:`), result.validation.warnings);
      }

      // eslint-disable-next-line functional/immutable-data
      this.serviceConfigs.set(service, result.config as ServiceConfig);

      // Save version to history
      this.versionHistory.saveVersion(
        'service',
        service,
        result.config,
        'system',
        'Configuration loaded',
      );

      // Watch configuration files for changes
      for (const source of result.sources) {
        if (source.path && source.source !== 'environment') {
          this.configWatcher.watch(source.path, () => {
            this.reloadServiceConfig(service);
          });
        }
      }

      console.log(colors.green(`✅ ${service} service configuration loaded`));
      console.log(
        colors.blue(`📋 Configuration sources: ${result.sources.map((s) => s.source).join(', ')}`),
      );

      return result.config as ServiceConfig;
    } catch (error) {
      console.error(colors.red(`❌ Failed to load ${service} service configuration:`), error);
      throw error;
    }
  }

  /**
   * Save brain configuration
   */
  saveBrainConfig(config: BrainConfig): void {
    const validation = ConfigValidator.validateBrainConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid brain configuration: ${validation.errors.join(', ')}`);
    }

    const configPath = join(this.configDirectory, 'brain.config.json');

    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

      const oldConfig = this.brainConfig;
      // eslint-disable-next-line functional/immutable-data
      this.brainConfig = config;

      // Save version to history
      this.versionHistory.saveVersion('brain', 'brain', config, 'user', 'Configuration updated');

      this.emit('configChanged', {
        level: 'brain' as ConfigLevel,
        key: 'brain',
        oldValue: oldConfig,
        newValue: config,
        timestamp: Date.now(),
      });

      console.log(colors.green('✅ Brain configuration saved'));
    } catch (error) {
      console.error(colors.red('❌ Failed to save brain configuration:'), error);
      throw error;
    }
  }

  /**
   * Save phase configuration
   */
  savePhaseConfig(phase: string, config: PhaseConfig): void {
    const validation = ConfigValidator.validatePhaseConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid ${phase} configuration: ${validation.errors.join(', ')}`);
    }

    // Validate against brain limits
    this.validateAgainstBrainLimits(phase, config);

    const configPath = join(this.configDirectory, `${phase}.config.json`);

    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

      const oldConfig = this.phaseConfigs.get(phase);
      // eslint-disable-next-line functional/immutable-data
      this.phaseConfigs.set(phase, config);

      // Save version to history
      this.versionHistory.saveVersion('phase', phase, config, 'user', 'Configuration updated');

      this.emit('configChanged', {
        level: 'phase' as ConfigLevel,
        key: phase,
        oldValue: oldConfig,
        newValue: config,
        timestamp: Date.now(),
      });

      console.log(colors.green(`✅ ${phase} configuration saved`));
    } catch (error) {
      console.error(colors.red(`❌ Failed to save ${phase} configuration:`), error);
      throw error;
    }
  }

  /**
   * Get current brain configuration
   */
  getBrainConfig(): BrainConfig | null {
    return this.brainConfig;
  }

  /**
   * Get current phase configuration
   */
  getPhaseConfig(phase: string): PhaseConfig | null {
    return this.phaseConfigs.get(phase) || null;
  }

  /**
   * Get current service configuration
   */
  getServiceConfig(service: string): ServiceConfig | null {
    return this.serviceConfigs.get(service) || null;
  }

  /**
   * Check if brain has overrides for phase
   */
  hasBrainOverrides(phase?: string): boolean {
    if (!this.brainConfig?.overrides) {
      return false;
    }

    if (phase) {
      return !!this.brainConfig.overrides[phase];
    }

    return Object.keys(this.brainConfig.overrides).length > 0;
  }

  /**
   * Hot-reload brain configuration
   */
  async reloadBrainConfig(): Promise<void> {
    try {
      const oldConfig = this.brainConfig;
      await this.loadBrainConfig();

      // Reload all phase configs to apply new overrides
      for (const phase of this.phaseConfigs.keys()) {
        await this.reloadPhaseConfig(phase);
      }

      this.emit('configReloaded', {
        level: 'brain' as ConfigLevel,
        key: 'brain',
        oldValue: oldConfig,
        newValue: this.brainConfig,
        timestamp: Date.now(),
      });

      console.log(colors.green('🔄 Brain configuration reloaded'));
    } catch (error) {
      console.error(colors.red('❌ Failed to reload brain configuration:'), error);
      this.emit('configError', { level: 'brain', key: 'brain', error });
    }
  }

  /**
   * Hot-reload phase configuration
   */
  async reloadPhaseConfig(phase: string): Promise<void> {
    try {
      const oldConfig = this.phaseConfigs.get(phase);
      await this.loadPhaseConfig(phase);

      this.emit('configReloaded', {
        level: 'phase' as ConfigLevel,
        key: phase,
        oldValue: oldConfig,
        newValue: this.phaseConfigs.get(phase),
        timestamp: Date.now(),
      });

      console.log(colors.green(`🔄 ${phase} configuration reloaded`));
    } catch (error) {
      console.error(colors.red(`❌ Failed to reload ${phase} configuration:`), error);
      this.emit('configError', { level: 'phase', key: phase, error });
    }
  }

  /**
   * Hot-reload service configuration
   */
  async reloadServiceConfig(service: string): Promise<void> {
    try {
      const oldConfig = this.serviceConfigs.get(service);
      await this.loadServiceConfig(service);

      this.emit('configReloaded', {
        level: 'service' as ConfigLevel,
        key: service,
        oldValue: oldConfig,
        newValue: this.serviceConfigs.get(service),
        timestamp: Date.now(),
      });

      console.log(colors.green(`🔄 ${service} service configuration reloaded`));
    } catch (error) {
      console.error(colors.red(`❌ Failed to reload ${service} service configuration:`), error);
      this.emit('configError', { level: 'service', key: service, error });
    }
  }

  /**
   * Validate phase config against brain limits
   */
  private validateAgainstBrainLimits(phase: string, config: PhaseConfig): void {
    if (!this.brainConfig) {
      return; // No brain config to validate against
    }

    if (config.maxLeverage > this.brainConfig.maxTotalLeverage) {
      throw new Error(
        `${phase} maxLeverage (${config.maxLeverage}) exceeds brain maxTotalLeverage (${this.brainConfig.maxTotalLeverage})`,
      );
    }

    if (config.maxDrawdown > this.brainConfig.maxGlobalDrawdown) {
      throw new Error(
        `${phase} maxDrawdown (${config.maxDrawdown}) exceeds brain maxGlobalDrawdown (${this.brainConfig.maxGlobalDrawdown})`,
      );
    }
  }

  /**
   * Merge configurations with override precedence
   */
  private mergeConfigs<T>(base: T, override: Partial<T>): T {
    const merged = { ...base } as T;

    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined && value !== null) {
        if (
          typeof value === 'object' &&
          !Array.isArray(value) &&
          typeof (merged as Record<string, unknown>)[key] === 'object' &&
          !Array.isArray((merged as Record<string, unknown>)[key])
        ) {
          // eslint-disable-next-line functional/immutable-data
          (merged as Record<string, unknown>)[key] = this.mergeConfigs(
            (merged as Record<string, unknown>)[key],
            value,
          );
        } else {
          // eslint-disable-next-line functional/immutable-data
          (merged as Record<string, unknown>)[key] = value;
        }
      }
    }

    return merged;
  }

  /**
   * Get configuration summary including hierarchy information
   */
  getConfigSummary(): {
    brainLoaded: boolean;
    phasesLoaded: string[];
    servicesLoaded: string[];
    hasOverrides: boolean;
    environment: Environment;
    hierarchySummary: unknown;
  } {
    return {
      brainLoaded: !!this.brainConfig,
      phasesLoaded: Array.from(this.phaseConfigs.keys()),
      servicesLoaded: Array.from(this.serviceConfigs.keys()),
      hasOverrides: this.hasBrainOverrides(),
      environment: this.environment,
      hierarchySummary: this.hierarchicalLoader.getHierarchySummary(),
    };
  }

  /**
   * Get configuration version history
   */
  getConfigVersionHistory(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
  ): ConfigVersion[] {
    return this.versionHistory.getAllVersions(configType, configKey);
  }

  /**
   * Get configuration version history metadata
   */
  getConfigVersionMetadata(configType: 'brain' | 'phase' | 'service', configKey: string): unknown {
    return this.versionHistory.getMetadata(configType, configKey);
  }

  /**
   * Get specific configuration version
   */
  getConfigVersion(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    version: number,
  ): ConfigVersion | null {
    return this.versionHistory.getVersion(configType, configKey, version);
  }

  /**
   * Rollback configuration to specific version
   */
  async rollbackToVersion(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    version: number,
  ): Promise<unknown> {
    const rollbackResult = this.versionHistory.rollbackToVersion(configType, configKey, version);

    if (!rollbackResult.success) {
      throw new Error(`Rollback failed: ${rollbackResult.error}`);
    }

    // Apply the rolled back configuration
    if (configType === 'brain' && configKey === 'brain') {
      // eslint-disable-next-line functional/immutable-data
      this.brainConfig = rollbackResult.data;
      this.emit('configChanged', {
        level: 'brain' as ConfigLevel,
        key: 'brain',
        oldValue: null,
        newValue: rollbackResult.data,
        timestamp: Date.now(),
      });
    } else if (configType === 'phase') {
      // eslint-disable-next-line functional/immutable-data
      this.phaseConfigs.set(configKey, rollbackResult.data);
      this.emit('configChanged', {
        level: 'phase' as ConfigLevel,
        key: configKey,
        oldValue: null,
        newValue: rollbackResult.data,
        timestamp: Date.now(),
      });
    } else if (configType === 'service') {
      // eslint-disable-next-line functional/immutable-data
      this.serviceConfigs.set(configKey, rollbackResult.data);
      this.emit('configChanged', {
        level: 'service' as ConfigLevel,
        key: configKey,
        oldValue: null,
        newValue: rollbackResult.data,
        timestamp: Date.now(),
      });
    }

    console.log(colors.green(`✅ Rolled back ${configKey} to version ${version}`));

    return rollbackResult.data;
  }

  /**
   * Compare configuration versions
   */
  compareConfigVersions(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    fromVersion: number,
    toVersion: number,
  ): unknown {
    return this.versionHistory.compareVersions(configType, configKey, fromVersion, toVersion);
  }

  /**
   * Search configuration versions by criteria
   */
  searchConfigVersions(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    criteria: {
      author?: string;
      tags?: string[];
      fromDate?: number;
      toDate?: number;
      comment?: string;
    },
  ): ConfigVersion[] {
    return this.versionHistory.searchVersions(configType, configKey, criteria);
  }

  /**
   * Export configuration version history
   */
  exportConfigHistory(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    outputPath: string,
  ): void {
    this.versionHistory.exportHistory(configType, configKey, outputPath);
  }

  /**
   * Import configuration version history
   */
  importConfigHistory(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    inputPath: string,
    merge: boolean = false,
  ): number {
    return this.versionHistory.importHistory(configType, configKey, inputPath, merge);
  }

  /**
   * Prune old configuration versions
   */
  pruneConfigHistory(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    keepVersions: number,
  ): number {
    return this.versionHistory.pruneHistory(configType, configKey, keepVersions);
  }

  /**
   * Clear configuration version history
   */
  clearConfigHistory(configType: 'brain' | 'phase' | 'service', configKey: string): void {
    this.versionHistory.clearHistory(configType, configKey);
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down Config Manager...'));
    this.configWatcher.unwatchAll();
    this.removeAllListeners();
  }
}

/**
 * Singleton Config Manager instance
 */
// eslint-disable-next-line functional/no-let
let configManagerInstance: ConfigManager | null = null;

/**
 * Get or create the global Config Manager instance
 */
export function getConfigManager(
  configDirectory?: string,
  environment?: Environment,
): ConfigManager {
  if (!configManagerInstance) {
    configManagerInstance = new ConfigManager(configDirectory, environment);
  }
  return configManagerInstance;
}

/**
 * Reset the global Config Manager instance (for testing)
 */
export function resetConfigManager(): void {
  if (configManagerInstance) {
    configManagerInstance.shutdown();
  }
  configManagerInstance = null;
}
