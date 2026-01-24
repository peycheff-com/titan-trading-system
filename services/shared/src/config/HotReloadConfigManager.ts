/**
 * Hot-Reload Configuration Manager for Titan Production Deployment
 *
 * Provides hot-reload capabilities for configuration changes without service downtime,
 * with encryption support for sensitive data and atomic configuration updates.
 *
 * Requirements: 3.2, 3.4 - Configuration encryption and hot-reload without downtime
 */

import { EventEmitter } from 'eventemitter3';
import { existsSync, Stats, statSync, unwatchFile, watchFile, writeFileSync } from 'fs';
import { join } from 'path';
import { ConfigEncryption, getConfigEncryption } from './ConfigEncryption';
import { ConfigHierarchyOptions, HierarchicalConfigLoader } from './HierarchicalConfigLoader';
import {
  BrainConfig,
  ConfigValidator,
  Environment,
  PhaseConfig,
  ValidationResult,
} from './ConfigSchema';

/**
 * Hot-reload event types
 */
export interface HotReloadEvent {
  type: 'config-changed' | 'config-error' | 'encryption-changed';
  configType: 'brain' | 'phase' | 'service';
  configKey: string;
  oldValue?: unknown;
  newValue?: unknown;
  error?: string;
  timestamp: number;
  encrypted?: boolean;
}

/**
 * Configuration change validation result
 */
export interface ChangeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  requiresRestart: boolean;
  affectedServices: string[];
}

/**
 * Hot-reload configuration options
 */
export interface HotReloadOptions extends Partial<ConfigHierarchyOptions> {
  enableEncryption: boolean;
  encryptedFields: {
    brain?: string[];
    phase?: string[];
    service?: Record<string, string[]>;
  };
  watchInterval: number;
  validationTimeout: number;
  rollbackOnError: boolean;
}

/**
 * Configuration backup for rollback
 */
interface ConfigBackup {
  timestamp: number;
  configType: 'brain' | 'phase' | 'service';
  configKey: string;
  data: unknown;
  encrypted: boolean;
}

/**
 * Hot-Reload Configuration Manager
 */
export class HotReloadConfigManager extends EventEmitter {
  private hierarchicalLoader: HierarchicalConfigLoader;
  private configEncryption: ConfigEncryption;
  private options: HotReloadOptions;
  private watchedFiles = new Map<string, { mtime: Date; size: number }>();
  private configBackups = new Map<string, ConfigBackup[]>();
  private currentConfigs = new Map<string, unknown>();
  private reloadInProgress = new Set<string>();

  constructor(options: Partial<HotReloadOptions> = {}) {
    super();

    this.options = {
      configDirectory: './config',
      environment: (process.env.NODE_ENV as Environment) || 'development',
      enableEnvironmentVariables: true,
      enableEnvironmentFiles: true,
      validateSchema: true,
      enableEncryption: true,
      encryptedFields: {
        brain: [],
        phase: ['exchanges.*.apiKey', 'exchanges.*.apiSecret'],
        service: {
          'titan-brain': ['database.password'],
          // titan-execution-rs uses Rust-native configuration
        },
      },
      watchInterval: 1000,
      validationTimeout: 5000,
      rollbackOnError: true,
      ...options,
    };

    // Initialize hierarchical loader
    this.hierarchicalLoader = new HierarchicalConfigLoader({
      configDirectory: this.options.configDirectory,
      environment: this.options.environment,
      enableEnvironmentVariables: this.options.enableEnvironmentVariables,
      enableEnvironmentFiles: this.options.enableEnvironmentFiles,
      validateSchema: this.options.validateSchema,
    });

    // Initialize encryption
    this.configEncryption = getConfigEncryption();
  }

  /**
   * Initialize hot-reload manager with master password
   */
  async initialize(masterPassword?: string): Promise<void> {
    if (this.options.enableEncryption && masterPassword) {
      this.configEncryption.initialize(masterPassword);
    }

    console.log('🔥 Hot-Reload Configuration Manager initialized');
  }

  /**
   * Load and watch brain configuration
   */
  async loadAndWatchBrainConfig(): Promise<BrainConfig> {
    const result = await this.hierarchicalLoader.loadBrainConfig();
    // eslint-disable-next-line functional/no-let
    let config = result.config;

    // Decrypt encrypted fields if present
    if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(config)) {
      config = this.configEncryption.decryptFields(config);
    }

    // Store current config and backup
    // eslint-disable-next-line functional/immutable-data
    this.currentConfigs.set('brain', config);
    this.createBackup('brain', 'brain', config, false);

    // Watch configuration files
    for (const source of result.sources) {
      if (source.path && source.source !== 'environment') {
        this.watchConfigFile(source.path, () => this.reloadBrainConfig());
      }
    }

    return config;
  }

  /**
   * Load and watch phase configuration
   */
  async loadAndWatchPhaseConfig(phase: string): Promise<PhaseConfig> {
    const result = await this.hierarchicalLoader.loadPhaseConfig(phase);
    // eslint-disable-next-line functional/no-let
    let config = result.config;

    // Decrypt encrypted fields if present
    if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(config)) {
      config = this.configEncryption.decryptFields(config);
    }

    // Store current config and backup
    // eslint-disable-next-line functional/immutable-data
    this.currentConfigs.set(phase, config);
    this.createBackup('phase', phase, config, false);

    // Watch configuration files
    for (const source of result.sources) {
      if (source.path && source.source !== 'environment') {
        this.watchConfigFile(source.path, () => this.reloadPhaseConfig(phase));
      }
    }

    return config;
  }

  /**
   * Load and watch service configuration
   */
  async loadAndWatchServiceConfig(service: string): Promise<unknown> {
    const result = await this.hierarchicalLoader.loadServiceConfig(service);
    // eslint-disable-next-line functional/no-let
    let config = result.config;

    // Decrypt encrypted fields if present
    if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(config)) {
      config = this.configEncryption.decryptFields(config);
    }

    // Store current config and backup
    // eslint-disable-next-line functional/immutable-data
    this.currentConfigs.set(service, config);
    this.createBackup('service', service, config, false);

    // Watch configuration files
    for (const source of result.sources) {
      if (source.path && source.source !== 'environment') {
        this.watchConfigFile(source.path, () => this.reloadServiceConfig(service));
      }
    }

    return config;
  }

  /**
   * Hot-reload brain configuration
   */
  async reloadBrainConfig(): Promise<void> {
    if (this.reloadInProgress.has('brain')) {
      return; // Reload already in progress
    }

    // eslint-disable-next-line functional/immutable-data
    this.reloadInProgress.add('brain');

    try {
      const oldConfig = this.currentConfigs.get('brain');
      const result = await this.hierarchicalLoader.loadBrainConfig();
      // eslint-disable-next-line functional/no-let
      let newConfig = result.config;

      // Decrypt encrypted fields if present
      if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(newConfig)) {
        newConfig = this.configEncryption.decryptFields(newConfig);
      }

      // Validate configuration change
      const changeValidation = this.validateConfigChange(
        'brain',
        'brain',
        oldConfig as Record<string, unknown>,
        newConfig as Record<string, unknown>,
      );

      if (!changeValidation.valid) {
        if (this.options.rollbackOnError) {
          console.warn('⚠️ Invalid brain config change, rolling back:', changeValidation.errors);
          return;
        } else {
          throw new Error(`Invalid brain configuration: ${changeValidation.errors.join(', ')}`);
        }
      }

      // Update current config and create backup
      // eslint-disable-next-line functional/immutable-data
      this.currentConfigs.set('brain', newConfig);
      this.createBackup('brain', 'brain', newConfig, false);

      // Emit hot-reload event
      this.emit('hotReload', {
        type: 'config-changed',
        configType: 'brain',
        configKey: 'brain',
        oldValue: oldConfig,
        newValue: newConfig,
        timestamp: Date.now(),
        encrypted: this.configEncryption.hasEncryptedFields(result.config),
      } as HotReloadEvent);

      console.log('🔥 Brain configuration hot-reloaded successfully');

      if (changeValidation.warnings.length > 0) {
        console.warn('⚠️ Configuration warnings:', changeValidation.warnings);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.emit('hotReload', {
        type: 'config-error',
        configType: 'brain',
        configKey: 'brain',
        error: errorMessage,
        timestamp: Date.now(),
      } as HotReloadEvent);

      console.error('❌ Failed to hot-reload brain configuration:', errorMessage);
    } finally {
      // eslint-disable-next-line functional/immutable-data
      this.reloadInProgress.delete('brain');
    }
  }

  /**
   * Hot-reload phase configuration
   */
  async reloadPhaseConfig(phase: string): Promise<void> {
    if (this.reloadInProgress.has(phase)) {
      return; // Reload already in progress
    }

    // eslint-disable-next-line functional/immutable-data
    this.reloadInProgress.add(phase);

    try {
      const oldConfig = this.currentConfigs.get(phase);
      const result = await this.hierarchicalLoader.loadPhaseConfig(phase);
      // eslint-disable-next-line functional/no-let
      let newConfig = result.config;

      // Decrypt encrypted fields if present
      if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(newConfig)) {
        newConfig = this.configEncryption.decryptFields(newConfig);
      }

      // Validate configuration change
      const changeValidation = this.validateConfigChange(
        'phase',
        phase,
        oldConfig as Record<string, unknown>,
        newConfig as Record<string, unknown>,
      );

      if (!changeValidation.valid) {
        if (this.options.rollbackOnError) {
          console.warn(`⚠️ Invalid ${phase} config change, rolling back:`, changeValidation.errors);
          return;
        } else {
          throw new Error(`Invalid ${phase} configuration: ${changeValidation.errors.join(', ')}`);
        }
      }

      // Update current config and create backup
      // eslint-disable-next-line functional/immutable-data
      this.currentConfigs.set(phase, newConfig);
      this.createBackup('phase', phase, newConfig, false);

      // Emit hot-reload event
      this.emit('hotReload', {
        type: 'config-changed',
        configType: 'phase',
        configKey: phase,
        oldValue: oldConfig,
        newValue: newConfig,
        timestamp: Date.now(),
        encrypted: this.configEncryption.hasEncryptedFields(result.config),
      } as HotReloadEvent);

      console.log(`🔥 ${phase} configuration hot-reloaded successfully`);

      if (changeValidation.warnings.length > 0) {
        console.warn('⚠️ Configuration warnings:', changeValidation.warnings);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.emit('hotReload', {
        type: 'config-error',
        configType: 'phase',
        configKey: phase,
        error: errorMessage,
        timestamp: Date.now(),
      } as HotReloadEvent);

      console.error(`❌ Failed to hot-reload ${phase} configuration:`, errorMessage);
    } finally {
      // eslint-disable-next-line functional/immutable-data
      this.reloadInProgress.delete(phase);
    }
  }

  /**
   * Hot-reload service configuration
   */
  async reloadServiceConfig(service: string): Promise<void> {
    if (this.reloadInProgress.has(service)) {
      return; // Reload already in progress
    }

    // eslint-disable-next-line functional/immutable-data
    this.reloadInProgress.add(service);

    try {
      const oldConfig = this.currentConfigs.get(service);
      const result = await this.hierarchicalLoader.loadServiceConfig(service);
      // eslint-disable-next-line functional/no-let
      let newConfig = result.config;

      // Decrypt encrypted fields if present
      if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(newConfig)) {
        newConfig = this.configEncryption.decryptFields(newConfig);
      }

      // Validate configuration change
      const changeValidation = this.validateConfigChange(
        'service',
        service,
        oldConfig as Record<string, unknown>,
        newConfig as Record<string, unknown>,
      );

      if (!changeValidation.valid) {
        if (this.options.rollbackOnError) {
          console.warn(
            `⚠️ Invalid ${service} config change, rolling back:`,
            changeValidation.errors,
          );
          return;
        } else {
          throw new Error(
            `Invalid ${service} configuration: ${changeValidation.errors.join(', ')}`,
          );
        }
      }

      // Update current config and create backup
      // eslint-disable-next-line functional/immutable-data
      this.currentConfigs.set(service, newConfig);
      this.createBackup('service', service, newConfig, false);

      // Emit hot-reload event
      this.emit('hotReload', {
        type: 'config-changed',
        configType: 'service',
        configKey: service,
        oldValue: oldConfig,
        newValue: newConfig,
        timestamp: Date.now(),
        encrypted: this.configEncryption.hasEncryptedFields(result.config),
      } as HotReloadEvent);

      console.log(`🔥 ${service} configuration hot-reloaded successfully`);

      if (changeValidation.warnings.length > 0) {
        console.warn('⚠️ Configuration warnings:', changeValidation.warnings);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.emit('hotReload', {
        type: 'config-error',
        configType: 'service',
        configKey: service,
        error: errorMessage,
        timestamp: Date.now(),
      } as HotReloadEvent);

      console.error(`❌ Failed to hot-reload ${service} configuration:`, errorMessage);
    } finally {
      // eslint-disable-next-line functional/immutable-data
      this.reloadInProgress.delete(service);
    }
  }

  /**
   * Save configuration with encryption
   */
  async saveConfigWithEncryption(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    // eslint-disable-next-line functional/no-let
    let configToSave = { ...config };

    // Encrypt sensitive fields if encryption is enabled
    if (this.options.enableEncryption) {
      const fieldsToEncrypt = this.getFieldsToEncrypt(configType, configKey);
      if (fieldsToEncrypt.length > 0) {
        configToSave = this.configEncryption.encryptFields(configToSave, fieldsToEncrypt);
      }
    }

    // Determine config file path
    const configPath = this.getConfigFilePath(configType, configKey);

    // Write configuration file
    writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf8');

    console.log(`💾 ${configType} configuration saved with encryption: ${configKey}`);
  }

  /**
   * Rollback configuration to previous version
   */
  rollbackConfig(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    steps: number = 1,
  ): boolean {
    const backupKey = `${configType}:${configKey}`;
    const backups = this.configBackups.get(backupKey);

    if (!backups || backups.length < steps) {
      console.warn(`⚠️ Not enough backups to rollback ${steps} steps for ${configKey}`);
      return false;
    }

    // Get backup to restore (steps back from current)
    const backupToRestore = backups[backups.length - steps - 1];

    // Restore configuration
    // eslint-disable-next-line functional/immutable-data
    this.currentConfigs.set(configKey, backupToRestore.data);

    // Emit rollback event
    this.emit('hotReload', {
      type: 'config-changed',
      configType,
      configKey,
      oldValue: this.currentConfigs.get(configKey),
      newValue: backupToRestore.data,
      timestamp: Date.now(),
    } as HotReloadEvent);

    console.log(`🔄 Rolled back ${configKey} configuration ${steps} steps`);
    return true;
  }

  /**
   * Get current configuration
   */
  getCurrentConfig(configKey: string): unknown {
    return this.currentConfigs.get(configKey);
  }

  /**
   * Get configuration backup history
   */
  getConfigHistory(configType: 'brain' | 'phase' | 'service', configKey: string): ConfigBackup[] {
    const backupKey = `${configType}:${configKey}`;
    return this.configBackups.get(backupKey) || [];
  }

  /**
   * Watch configuration file for changes
   */
  private watchConfigFile(filePath: string, callback: () => void): void {
    if (this.watchedFiles.has(filePath)) {
      return; // Already watching
    }

    if (!existsSync(filePath)) {
      return; // File doesn't exist
    }

    const stats = statSync(filePath);
    // eslint-disable-next-line functional/immutable-data
    this.watchedFiles.set(filePath, {
      mtime: stats.mtime,
      size: stats.size,
    });

    watchFile(filePath, { interval: this.options.watchInterval }, (curr: Stats, prev: Stats) => {
      if (curr.mtime !== prev.mtime || curr.size !== prev.size) {
        console.log(`📁 Configuration file changed: ${filePath}`);

        // Debounce rapid changes
        setTimeout(() => {
          callback();
        }, 100);
      }
    });
  }

  /**
   * Validate configuration change
   */
  private validateConfigChange(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    oldConfig: Record<string, unknown> | undefined,
    newConfig: Record<string, unknown>,
  ): ChangeValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    // eslint-disable-next-line functional/no-let
    let requiresRestart = false;
    const affectedServices: string[] = [];

    // Schema validation
    // eslint-disable-next-line functional/no-let
    let validation: ValidationResult;
    if (configType === 'brain') {
      validation = ConfigValidator.validateBrainConfig(newConfig);
    } else if (configType === 'phase') {
      validation = ConfigValidator.validatePhaseConfig(newConfig);
    } else {
      validation = ConfigValidator.validateServiceConfig(configKey, newConfig);
    }

    if (!validation.valid) {
      // eslint-disable-next-line functional/immutable-data
      errors.push(...validation.errors);
    }

    // eslint-disable-next-line functional/immutable-data
    warnings.push(...validation.warnings);

    // Check for changes that require restart
    if (configType === 'service') {
      const criticalFields = ['port', 'database', 'redis'];
      for (const field of criticalFields) {
        if (oldConfig?.[field] !== newConfig?.[field]) {
          requiresRestart = true;
          // eslint-disable-next-line functional/immutable-data
          affectedServices.push(configKey);
          // eslint-disable-next-line functional/immutable-data
          warnings.push(`Change to ${field} requires service restart`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      requiresRestart,
      affectedServices,
    };
  }

  /**
   * Create configuration backup
   */
  private createBackup(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
    data: unknown,
    encrypted: boolean,
  ): void {
    const backupKey = `${configType}:${configKey}`;

    if (!this.configBackups.has(backupKey)) {
      // eslint-disable-next-line functional/immutable-data
      this.configBackups.set(backupKey, []);
    }

    const backups = this.configBackups.get(backupKey)!;

    // Add new backup
    // eslint-disable-next-line functional/immutable-data
    backups.push({
      timestamp: Date.now(),
      configType,
      configKey,
      data: JSON.parse(JSON.stringify(data)), // Deep copy
      encrypted,
    });

    // Keep only last 10 backups
    if (backups.length > 10) {
      // eslint-disable-next-line functional/immutable-data
      backups.shift();
    }
  }

  /**
   * Get fields to encrypt for configuration type
   */
  private getFieldsToEncrypt(
    configType: 'brain' | 'phase' | 'service',
    configKey: string,
  ): string[] {
    if (configType === 'brain') {
      return this.options.encryptedFields.brain || [];
    } else if (configType === 'phase') {
      return this.options.encryptedFields.phase || [];
    } else {
      return this.options.encryptedFields.service?.[configKey] || [];
    }
  }

  /**
   * Get configuration file path
   */
  private getConfigFilePath(configType: 'brain' | 'phase' | 'service', configKey: string): string {
    return join(this.options.configDirectory!, `${configKey}.config.json`);
  }

  /**
   * Stop watching all files and cleanup
   */
  destroy(): void {
    // Stop watching all files
    for (const filePath of this.watchedFiles.keys()) {
      unwatchFile(filePath);
    }

    // eslint-disable-next-line functional/immutable-data
    this.watchedFiles.clear();
    // eslint-disable-next-line functional/immutable-data
    this.configBackups.clear();
    // eslint-disable-next-line functional/immutable-data
    this.currentConfigs.clear();
    // eslint-disable-next-line functional/immutable-data
    this.reloadInProgress.clear();
    this.removeAllListeners();

    console.log('🛑 Hot-Reload Configuration Manager destroyed');
  }
}

/**
 * Create hot-reload config manager with default options
 */
export function createHotReloadConfigManager(
  options?: Partial<HotReloadOptions>,
): HotReloadConfigManager {
  return new HotReloadConfigManager(options);
}
