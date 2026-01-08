"use strict";
/**
 * Hot-Reload Configuration Manager for Titan Production Deployment
 *
 * Provides hot-reload capabilities for configuration changes without service downtime,
 * with encryption support for sensitive data and atomic configuration updates.
 *
 * Requirements: 3.2, 3.4 - Configuration encryption and hot-reload without downtime
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HotReloadConfigManager = void 0;
exports.createHotReloadConfigManager = createHotReloadConfigManager;
const eventemitter3_1 = require("eventemitter3");
const fs_1 = require("fs");
const path_1 = require("path");
const ConfigEncryption_1 = require("./ConfigEncryption");
const HierarchicalConfigLoader_1 = require("./HierarchicalConfigLoader");
const ConfigSchema_1 = require("./ConfigSchema");
/**
 * Hot-Reload Configuration Manager
 */
class HotReloadConfigManager extends eventemitter3_1.EventEmitter {
    hierarchicalLoader;
    configEncryption;
    options;
    watchedFiles = new Map();
    configBackups = new Map();
    currentConfigs = new Map();
    reloadInProgress = new Set();
    constructor(options = {}) {
        super();
        this.options = {
            configDirectory: './config',
            environment: process.env.NODE_ENV || 'development',
            enableEnvironmentVariables: true,
            enableEnvironmentFiles: true,
            validateSchema: true,
            enableEncryption: true,
            encryptedFields: {
                brain: [],
                phase: ['exchanges.*.apiKey', 'exchanges.*.apiSecret'],
                service: {
                    'titan-brain': ['database.password'],
                    'titan-execution': ['exchanges.*.apiKey', 'exchanges.*.apiSecret']
                }
            },
            watchInterval: 1000,
            validationTimeout: 5000,
            rollbackOnError: true,
            ...options
        };
        // Initialize hierarchical loader
        this.hierarchicalLoader = new HierarchicalConfigLoader_1.HierarchicalConfigLoader({
            configDirectory: this.options.configDirectory,
            environment: this.options.environment,
            enableEnvironmentVariables: this.options.enableEnvironmentVariables,
            enableEnvironmentFiles: this.options.enableEnvironmentFiles,
            validateSchema: this.options.validateSchema
        });
        // Initialize encryption
        this.configEncryption = (0, ConfigEncryption_1.getConfigEncryption)();
    }
    /**
     * Initialize hot-reload manager with master password
     */
    async initialize(masterPassword) {
        if (this.options.enableEncryption && masterPassword) {
            this.configEncryption.initialize(masterPassword);
        }
        console.log('🔥 Hot-Reload Configuration Manager initialized');
    }
    /**
     * Load and watch brain configuration
     */
    async loadAndWatchBrainConfig() {
        const result = await this.hierarchicalLoader.loadBrainConfig();
        let config = result.config;
        // Decrypt encrypted fields if present
        if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(config)) {
            config = this.configEncryption.decryptFields(config);
        }
        // Store current config and backup
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
    async loadAndWatchPhaseConfig(phase) {
        const result = await this.hierarchicalLoader.loadPhaseConfig(phase);
        let config = result.config;
        // Decrypt encrypted fields if present
        if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(config)) {
            config = this.configEncryption.decryptFields(config);
        }
        // Store current config and backup
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
    async loadAndWatchServiceConfig(service) {
        const result = await this.hierarchicalLoader.loadServiceConfig(service);
        let config = result.config;
        // Decrypt encrypted fields if present
        if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(config)) {
            config = this.configEncryption.decryptFields(config);
        }
        // Store current config and backup
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
    async reloadBrainConfig() {
        if (this.reloadInProgress.has('brain')) {
            return; // Reload already in progress
        }
        this.reloadInProgress.add('brain');
        try {
            const oldConfig = this.currentConfigs.get('brain');
            const result = await this.hierarchicalLoader.loadBrainConfig();
            let newConfig = result.config;
            // Decrypt encrypted fields if present
            if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(newConfig)) {
                newConfig = this.configEncryption.decryptFields(newConfig);
            }
            // Validate configuration change
            const changeValidation = this.validateConfigChange('brain', 'brain', oldConfig, newConfig);
            if (!changeValidation.valid) {
                if (this.options.rollbackOnError) {
                    console.warn('⚠️ Invalid brain config change, rolling back:', changeValidation.errors);
                    return;
                }
                else {
                    throw new Error(`Invalid brain configuration: ${changeValidation.errors.join(', ')}`);
                }
            }
            // Update current config and create backup
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
                encrypted: this.configEncryption.hasEncryptedFields(result.config)
            });
            console.log('🔥 Brain configuration hot-reloaded successfully');
            if (changeValidation.warnings.length > 0) {
                console.warn('⚠️ Configuration warnings:', changeValidation.warnings);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.emit('hotReload', {
                type: 'config-error',
                configType: 'brain',
                configKey: 'brain',
                error: errorMessage,
                timestamp: Date.now()
            });
            console.error('❌ Failed to hot-reload brain configuration:', errorMessage);
        }
        finally {
            this.reloadInProgress.delete('brain');
        }
    }
    /**
     * Hot-reload phase configuration
     */
    async reloadPhaseConfig(phase) {
        if (this.reloadInProgress.has(phase)) {
            return; // Reload already in progress
        }
        this.reloadInProgress.add(phase);
        try {
            const oldConfig = this.currentConfigs.get(phase);
            const result = await this.hierarchicalLoader.loadPhaseConfig(phase);
            let newConfig = result.config;
            // Decrypt encrypted fields if present
            if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(newConfig)) {
                newConfig = this.configEncryption.decryptFields(newConfig);
            }
            // Validate configuration change
            const changeValidation = this.validateConfigChange('phase', phase, oldConfig, newConfig);
            if (!changeValidation.valid) {
                if (this.options.rollbackOnError) {
                    console.warn(`⚠️ Invalid ${phase} config change, rolling back:`, changeValidation.errors);
                    return;
                }
                else {
                    throw new Error(`Invalid ${phase} configuration: ${changeValidation.errors.join(', ')}`);
                }
            }
            // Update current config and create backup
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
                encrypted: this.configEncryption.hasEncryptedFields(result.config)
            });
            console.log(`🔥 ${phase} configuration hot-reloaded successfully`);
            if (changeValidation.warnings.length > 0) {
                console.warn('⚠️ Configuration warnings:', changeValidation.warnings);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.emit('hotReload', {
                type: 'config-error',
                configType: 'phase',
                configKey: phase,
                error: errorMessage,
                timestamp: Date.now()
            });
            console.error(`❌ Failed to hot-reload ${phase} configuration:`, errorMessage);
        }
        finally {
            this.reloadInProgress.delete(phase);
        }
    }
    /**
     * Hot-reload service configuration
     */
    async reloadServiceConfig(service) {
        if (this.reloadInProgress.has(service)) {
            return; // Reload already in progress
        }
        this.reloadInProgress.add(service);
        try {
            const oldConfig = this.currentConfigs.get(service);
            const result = await this.hierarchicalLoader.loadServiceConfig(service);
            let newConfig = result.config;
            // Decrypt encrypted fields if present
            if (this.options.enableEncryption && this.configEncryption.hasEncryptedFields(newConfig)) {
                newConfig = this.configEncryption.decryptFields(newConfig);
            }
            // Validate configuration change
            const changeValidation = this.validateConfigChange('service', service, oldConfig, newConfig);
            if (!changeValidation.valid) {
                if (this.options.rollbackOnError) {
                    console.warn(`⚠️ Invalid ${service} config change, rolling back:`, changeValidation.errors);
                    return;
                }
                else {
                    throw new Error(`Invalid ${service} configuration: ${changeValidation.errors.join(', ')}`);
                }
            }
            // Update current config and create backup
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
                encrypted: this.configEncryption.hasEncryptedFields(result.config)
            });
            console.log(`🔥 ${service} configuration hot-reloaded successfully`);
            if (changeValidation.warnings.length > 0) {
                console.warn('⚠️ Configuration warnings:', changeValidation.warnings);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.emit('hotReload', {
                type: 'config-error',
                configType: 'service',
                configKey: service,
                error: errorMessage,
                timestamp: Date.now()
            });
            console.error(`❌ Failed to hot-reload ${service} configuration:`, errorMessage);
        }
        finally {
            this.reloadInProgress.delete(service);
        }
    }
    /**
     * Save configuration with encryption
     */
    async saveConfigWithEncryption(configType, configKey, config) {
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
        (0, fs_1.writeFileSync)(configPath, JSON.stringify(configToSave, null, 2), 'utf8');
        console.log(`💾 ${configType} configuration saved with encryption: ${configKey}`);
    }
    /**
     * Rollback configuration to previous version
     */
    rollbackConfig(configType, configKey, steps = 1) {
        const backupKey = `${configType}:${configKey}`;
        const backups = this.configBackups.get(backupKey);
        if (!backups || backups.length < steps) {
            console.warn(`⚠️ Not enough backups to rollback ${steps} steps for ${configKey}`);
            return false;
        }
        // Get backup to restore (steps back from current)
        const backupToRestore = backups[backups.length - steps - 1];
        // Restore configuration
        this.currentConfigs.set(configKey, backupToRestore.data);
        // Emit rollback event
        this.emit('hotReload', {
            type: 'config-changed',
            configType,
            configKey,
            oldValue: this.currentConfigs.get(configKey),
            newValue: backupToRestore.data,
            timestamp: Date.now()
        });
        console.log(`🔄 Rolled back ${configKey} configuration ${steps} steps`);
        return true;
    }
    /**
     * Get current configuration
     */
    getCurrentConfig(configKey) {
        return this.currentConfigs.get(configKey);
    }
    /**
     * Get configuration backup history
     */
    getConfigHistory(configType, configKey) {
        const backupKey = `${configType}:${configKey}`;
        return this.configBackups.get(backupKey) || [];
    }
    /**
     * Watch configuration file for changes
     */
    watchConfigFile(filePath, callback) {
        if (this.watchedFiles.has(filePath)) {
            return; // Already watching
        }
        if (!(0, fs_1.existsSync)(filePath)) {
            return; // File doesn't exist
        }
        const stats = require('fs').statSync(filePath);
        this.watchedFiles.set(filePath, {
            mtime: stats.mtime,
            size: stats.size
        });
        (0, fs_1.watchFile)(filePath, { interval: this.options.watchInterval }, (curr, prev) => {
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
    validateConfigChange(configType, configKey, oldConfig, newConfig) {
        const errors = [];
        const warnings = [];
        let requiresRestart = false;
        const affectedServices = [];
        // Schema validation
        let validation;
        if (configType === 'brain') {
            validation = ConfigSchema_1.ConfigValidator.validateBrainConfig(newConfig);
        }
        else if (configType === 'phase') {
            validation = ConfigSchema_1.ConfigValidator.validatePhaseConfig(newConfig);
        }
        else {
            validation = ConfigSchema_1.ConfigValidator.validateServiceConfig(configKey, newConfig);
        }
        if (!validation.valid) {
            errors.push(...validation.errors);
        }
        warnings.push(...validation.warnings);
        // Check for changes that require restart
        if (configType === 'service') {
            const criticalFields = ['port', 'database', 'redis'];
            for (const field of criticalFields) {
                if (oldConfig?.[field] !== newConfig?.[field]) {
                    requiresRestart = true;
                    affectedServices.push(configKey);
                    warnings.push(`Change to ${field} requires service restart`);
                }
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            requiresRestart,
            affectedServices
        };
    }
    /**
     * Create configuration backup
     */
    createBackup(configType, configKey, data, encrypted) {
        const backupKey = `${configType}:${configKey}`;
        if (!this.configBackups.has(backupKey)) {
            this.configBackups.set(backupKey, []);
        }
        const backups = this.configBackups.get(backupKey);
        // Add new backup
        backups.push({
            timestamp: Date.now(),
            configType,
            configKey,
            data: JSON.parse(JSON.stringify(data)), // Deep copy
            encrypted
        });
        // Keep only last 10 backups
        if (backups.length > 10) {
            backups.shift();
        }
    }
    /**
     * Get fields to encrypt for configuration type
     */
    getFieldsToEncrypt(configType, configKey) {
        if (configType === 'brain') {
            return this.options.encryptedFields.brain || [];
        }
        else if (configType === 'phase') {
            return this.options.encryptedFields.phase || [];
        }
        else {
            return this.options.encryptedFields.service?.[configKey] || [];
        }
    }
    /**
     * Get configuration file path
     */
    getConfigFilePath(configType, configKey) {
        return (0, path_1.join)(this.options.configDirectory, `${configKey}.config.json`);
    }
    /**
     * Stop watching all files and cleanup
     */
    destroy() {
        // Stop watching all files
        for (const filePath of this.watchedFiles.keys()) {
            (0, fs_1.unwatchFile)(filePath);
        }
        this.watchedFiles.clear();
        this.configBackups.clear();
        this.currentConfigs.clear();
        this.reloadInProgress.clear();
        this.removeAllListeners();
        console.log('🛑 Hot-Reload Configuration Manager destroyed');
    }
}
exports.HotReloadConfigManager = HotReloadConfigManager;
/**
 * Create hot-reload config manager with default options
 */
function createHotReloadConfigManager(options) {
    return new HotReloadConfigManager(options);
}
//# sourceMappingURL=HotReloadConfigManager.js.map