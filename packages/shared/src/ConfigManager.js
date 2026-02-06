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
import { ConfigValidator, } from './config/ConfigSchema';
import { getConfigVersionHistory, } from './config/ConfigVersionHistory';
// Simple color logging utility
const colors = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
};
/**
 * Configuration file watcher
 */
class ConfigWatcher {
    configManager;
    watchers = new Map();
    constructor(configManager) {
        this.configManager = configManager;
    }
    /**
     * Watch configuration file for changes
     */
    watch(filePath, callback) {
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
    unwatch(filePath) {
        if (this.watchers.has(filePath)) {
            unwatchFile(filePath);
            // eslint-disable-next-line functional/immutable-data
            this.watchers.delete(filePath);
        }
    }
    /**
     * Stop watching all files
     */
    unwatchAll() {
        for (const filePath of this.watchers.keys()) {
            this.unwatch(filePath);
        }
    }
}
/**
 * Hierarchical Configuration Manager
 */
export class ConfigManager extends EventEmitter {
    brainConfig = null;
    phaseConfigs = new Map();
    serviceConfigs = new Map();
    configWatcher;
    configDirectory;
    hierarchicalLoader;
    environment;
    versionHistory;
    constructor(configDirectory = './config', environment) {
        super();
        this.configDirectory = configDirectory;
        this.environment = environment || process.env.NODE_ENV || 'development';
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
        this.versionHistory = getConfigVersionHistory(join(configDirectory, '.history'), 100, // Keep last 100 versions
        false);
        console.log(colors.blue(`🚀 Config Manager initialized for environment: ${this.environment}`));
    }
    /**
     * Load brain configuration using hierarchical loader
     */
    async loadBrainConfig() {
        try {
            const result = await this.hierarchicalLoader.loadBrainConfig();
            if (result.validation.warnings.length > 0) {
                console.warn(colors.yellow('⚠️ Brain config warnings:'), result.validation.warnings);
            }
            // eslint-disable-next-line functional/immutable-data
            this.brainConfig = result.config;
            // Save version to history
            this.versionHistory.saveVersion('brain', 'brain', result.config, 'system', 'Configuration loaded');
            // Watch configuration files for changes
            for (const source of result.sources) {
                if (source.path && source.source !== 'environment') {
                    this.configWatcher.watch(source.path, () => {
                        this.reloadBrainConfig();
                    });
                }
            }
            console.log(colors.green('✅ Brain configuration loaded'));
            console.log(colors.blue(`📋 Configuration sources: ${result.sources.map((s) => s.source).join(', ')}`));
            return result.config;
        }
        catch (error) {
            console.error(colors.red('❌ Failed to load brain configuration:'), error);
            throw error;
        }
    }
    /**
     * Load phase configuration using hierarchical loader with brain overrides
     */
    async loadPhaseConfig(phase) {
        try {
            const result = await this.hierarchicalLoader.loadPhaseConfig(phase);
            // eslint-disable-next-line functional/no-let
            let config = result.config;
            // Apply brain overrides if available
            if (this.brainConfig?.overrides?.[phase]) {
                config = this.mergeConfigs(config, this.brainConfig.overrides[phase]);
                console.log(colors.blue(`🔄 Applied brain overrides for ${phase}`));
                const overrideValidation = ConfigValidator.validatePhaseConfig(config);
                if (!overrideValidation.valid) {
                    throw new Error(`Invalid ${phase} configuration after brain overrides: ${overrideValidation.errors.join(', ')}`);
                }
                if (overrideValidation.warnings.length > 0) {
                    console.warn(colors.yellow(`⚠️ ${phase} override warnings:`), overrideValidation.warnings);
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
            console.log(colors.blue(`📋 Configuration sources: ${result.sources.map((s) => s.source).join(', ')}`));
            return config;
        }
        catch (error) {
            console.error(colors.red(`❌ Failed to load ${phase} configuration:`), error);
            throw error;
        }
    }
    /**
     * Load service configuration using hierarchical loader
     */
    async loadServiceConfig(service) {
        try {
            const result = await this.hierarchicalLoader.loadServiceConfig(service);
            if (result.validation.warnings.length > 0) {
                console.warn(colors.yellow(`⚠️ ${service} config warnings:`), result.validation.warnings);
            }
            // eslint-disable-next-line functional/immutable-data
            this.serviceConfigs.set(service, result.config);
            // Save version to history
            this.versionHistory.saveVersion('service', service, result.config, 'system', 'Configuration loaded');
            // Watch configuration files for changes
            for (const source of result.sources) {
                if (source.path && source.source !== 'environment') {
                    this.configWatcher.watch(source.path, () => {
                        this.reloadServiceConfig(service);
                    });
                }
            }
            console.log(colors.green(`✅ ${service} service configuration loaded`));
            console.log(colors.blue(`📋 Configuration sources: ${result.sources.map((s) => s.source).join(', ')}`));
            return result.config;
        }
        catch (error) {
            console.error(colors.red(`❌ Failed to load ${service} service configuration:`), error);
            throw error;
        }
    }
    /**
     * Save brain configuration
     */
    saveBrainConfig(config) {
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
                level: 'brain',
                key: 'brain',
                oldValue: oldConfig,
                newValue: config,
                timestamp: Date.now(),
            });
            console.log(colors.green('✅ Brain configuration saved'));
        }
        catch (error) {
            console.error(colors.red('❌ Failed to save brain configuration:'), error);
            throw error;
        }
    }
    /**
     * Save phase configuration
     */
    savePhaseConfig(phase, config) {
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
                level: 'phase',
                key: phase,
                oldValue: oldConfig,
                newValue: config,
                timestamp: Date.now(),
            });
            console.log(colors.green(`✅ ${phase} configuration saved`));
        }
        catch (error) {
            console.error(colors.red(`❌ Failed to save ${phase} configuration:`), error);
            throw error;
        }
    }
    /**
     * Get current brain configuration
     */
    getBrainConfig() {
        return this.brainConfig;
    }
    /**
     * Get current phase configuration
     */
    getPhaseConfig(phase) {
        return this.phaseConfigs.get(phase) || null;
    }
    /**
     * Get current service configuration
     */
    getServiceConfig(service) {
        return this.serviceConfigs.get(service) || null;
    }
    /**
     * Check if brain has overrides for phase
     */
    hasBrainOverrides(phase) {
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
    async reloadBrainConfig() {
        try {
            const oldConfig = this.brainConfig;
            await this.loadBrainConfig();
            // Reload all phase configs to apply new overrides
            for (const phase of this.phaseConfigs.keys()) {
                await this.reloadPhaseConfig(phase);
            }
            this.emit('configReloaded', {
                level: 'brain',
                key: 'brain',
                oldValue: oldConfig,
                newValue: this.brainConfig,
                timestamp: Date.now(),
            });
            console.log(colors.green('🔄 Brain configuration reloaded'));
        }
        catch (error) {
            console.error(colors.red('❌ Failed to reload brain configuration:'), error);
            this.emit('configError', { level: 'brain', key: 'brain', error });
        }
    }
    /**
     * Hot-reload phase configuration
     */
    async reloadPhaseConfig(phase) {
        try {
            const oldConfig = this.phaseConfigs.get(phase);
            await this.loadPhaseConfig(phase);
            this.emit('configReloaded', {
                level: 'phase',
                key: phase,
                oldValue: oldConfig,
                newValue: this.phaseConfigs.get(phase),
                timestamp: Date.now(),
            });
            console.log(colors.green(`🔄 ${phase} configuration reloaded`));
        }
        catch (error) {
            console.error(colors.red(`❌ Failed to reload ${phase} configuration:`), error);
            this.emit('configError', { level: 'phase', key: phase, error });
        }
    }
    /**
     * Hot-reload service configuration
     */
    async reloadServiceConfig(service) {
        try {
            const oldConfig = this.serviceConfigs.get(service);
            await this.loadServiceConfig(service);
            this.emit('configReloaded', {
                level: 'service',
                key: service,
                oldValue: oldConfig,
                newValue: this.serviceConfigs.get(service),
                timestamp: Date.now(),
            });
            console.log(colors.green(`🔄 ${service} service configuration reloaded`));
        }
        catch (error) {
            console.error(colors.red(`❌ Failed to reload ${service} service configuration:`), error);
            this.emit('configError', { level: 'service', key: service, error });
        }
    }
    /**
     * Validate phase config against brain limits
     */
    validateAgainstBrainLimits(phase, config) {
        if (!this.brainConfig) {
            return; // No brain config to validate against
        }
        if (config.maxLeverage > this.brainConfig.maxTotalLeverage) {
            throw new Error(`${phase} maxLeverage (${config.maxLeverage}) exceeds brain maxTotalLeverage (${this.brainConfig.maxTotalLeverage})`);
        }
        if (config.maxDrawdown > this.brainConfig.maxGlobalDrawdown) {
            throw new Error(`${phase} maxDrawdown (${config.maxDrawdown}) exceeds brain maxGlobalDrawdown (${this.brainConfig.maxGlobalDrawdown})`);
        }
    }
    /**
     * Merge configurations with override precedence
     */
    mergeConfigs(base, override) {
        const merged = { ...base };
        for (const [key, value] of Object.entries(override)) {
            if (value !== undefined && value !== null) {
                if (typeof value === 'object' &&
                    !Array.isArray(value) &&
                    typeof merged[key] === 'object' &&
                    !Array.isArray(merged[key])) {
                    // eslint-disable-next-line functional/immutable-data
                    merged[key] = this.mergeConfigs(merged[key], value);
                }
                else {
                    // eslint-disable-next-line functional/immutable-data
                    merged[key] = value;
                }
            }
        }
        return merged;
    }
    /**
     * Get configuration summary including hierarchy information
     */
    getConfigSummary() {
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
    getConfigVersionHistory(configType, configKey) {
        return this.versionHistory.getAllVersions(configType, configKey);
    }
    /**
     * Get configuration version history metadata
     */
    getConfigVersionMetadata(configType, configKey) {
        return this.versionHistory.getMetadata(configType, configKey);
    }
    /**
     * Get specific configuration version
     */
    getConfigVersion(configType, configKey, version) {
        return this.versionHistory.getVersion(configType, configKey, version);
    }
    /**
     * Rollback configuration to specific version
     */
    async rollbackToVersion(configType, configKey, version) {
        const rollbackResult = this.versionHistory.rollbackToVersion(configType, configKey, version);
        if (!rollbackResult.success) {
            throw new Error(`Rollback failed: ${rollbackResult.error}`);
        }
        // Apply the rolled back configuration
        if (configType === 'brain' && configKey === 'brain') {
            // eslint-disable-next-line functional/immutable-data
            this.brainConfig = rollbackResult.data;
            this.emit('configChanged', {
                level: 'brain',
                key: 'brain',
                oldValue: null,
                newValue: rollbackResult.data,
                timestamp: Date.now(),
            });
        }
        else if (configType === 'phase') {
            // eslint-disable-next-line functional/immutable-data
            this.phaseConfigs.set(configKey, rollbackResult.data);
            this.emit('configChanged', {
                level: 'phase',
                key: configKey,
                oldValue: null,
                newValue: rollbackResult.data,
                timestamp: Date.now(),
            });
        }
        else if (configType === 'service') {
            // eslint-disable-next-line functional/immutable-data
            this.serviceConfigs.set(configKey, rollbackResult.data);
            this.emit('configChanged', {
                level: 'service',
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
    compareConfigVersions(configType, configKey, fromVersion, toVersion) {
        return this.versionHistory.compareVersions(configType, configKey, fromVersion, toVersion);
    }
    /**
     * Search configuration versions by criteria
     */
    searchConfigVersions(configType, configKey, criteria) {
        return this.versionHistory.searchVersions(configType, configKey, criteria);
    }
    /**
     * Export configuration version history
     */
    exportConfigHistory(configType, configKey, outputPath) {
        this.versionHistory.exportHistory(configType, configKey, outputPath);
    }
    /**
     * Import configuration version history
     */
    importConfigHistory(configType, configKey, inputPath, merge = false) {
        return this.versionHistory.importHistory(configType, configKey, inputPath, merge);
    }
    /**
     * Prune old configuration versions
     */
    pruneConfigHistory(configType, configKey, keepVersions) {
        return this.versionHistory.pruneHistory(configType, configKey, keepVersions);
    }
    /**
     * Clear configuration version history
     */
    clearConfigHistory(configType, configKey) {
        this.versionHistory.clearHistory(configType, configKey);
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
        console.log(colors.blue('🛑 Shutting down Config Manager...'));
        this.configWatcher.unwatchAll();
        this.removeAllListeners();
    }
}
/**
 * Singleton Config Manager instance
 */
// eslint-disable-next-line functional/no-let
let configManagerInstance = null;
/**
 * Get or create the global Config Manager instance
 */
export function getConfigManager(configDirectory, environment) {
    if (!configManagerInstance) {
        configManagerInstance = new ConfigManager(configDirectory, environment);
    }
    return configManagerInstance;
}
/**
 * Reset the global Config Manager instance (for testing)
 */
export function resetConfigManager() {
    if (configManagerInstance) {
        configManagerInstance.shutdown();
    }
    configManagerInstance = null;
}
//# sourceMappingURL=ConfigManager.js.map