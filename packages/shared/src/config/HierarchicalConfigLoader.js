/**
 * Hierarchical Configuration Loader for Titan Production Deployment
 *
 * Provides environment-specific configuration loading with proper hierarchy:
 * 1. Environment variables (highest priority)
 * 2. Environment-specific config files
 * 3. Base config files
 * 4. Default values (lowest priority)
 *
 * Requirements: 3.1, 3.3 - Hierarchical configuration and environment-specific loading
 */
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { ConfigValidator, } from './ConfigSchema';
/**
 * Default configuration values
 */
const DEFAULT_CONFIGS = {
    brain: {
        maxTotalLeverage: 50,
        maxGlobalDrawdown: 0.15,
        emergencyFlattenThreshold: 0.15,
        phaseTransitionRules: {
            phase1ToPhase2: 5000,
            phase2ToPhase3: 50000,
        },
    },
    phase: {
        enabled: true,
        maxLeverage: 20,
        maxDrawdown: 0.07,
        maxPositionSize: 0.5,
        riskPerTrade: 0.02,
        exchanges: {
            bybit: {
                enabled: true,
                executeOn: false,
                testnet: false,
                rateLimit: 10,
                timeout: 5000,
            },
            mexc: {
                enabled: false,
                executeOn: false,
                testnet: false,
                rateLimit: 10,
                timeout: 5000,
            },
        },
    },
};
/**
 * Environment variable mapping for configuration keys
 */
const ENV_VAR_MAPPINGS = {
    brain: {
        TITAN_MAX_TOTAL_LEVERAGE: 'maxTotalLeverage',
        TITAN_MAX_GLOBAL_DRAWDOWN: 'maxGlobalDrawdown',
        TITAN_EMERGENCY_FLATTEN_THRESHOLD: 'emergencyFlattenThreshold',
        TITAN_PHASE1_TO_PHASE2_THRESHOLD: 'phaseTransitionRules.phase1ToPhase2',
        TITAN_PHASE2_TO_PHASE3_THRESHOLD: 'phaseTransitionRules.phase2ToPhase3',
    },
    phase: {
        TITAN_MAX_LEVERAGE: 'maxLeverage',
        TITAN_MAX_DRAWDOWN: 'maxDrawdown',
        TITAN_MAX_POSITION_SIZE: 'maxPositionSize',
        TITAN_RISK_PER_TRADE: 'riskPerTrade',
    },
};
/**
 * Hierarchical Configuration Loader
 */
export class HierarchicalConfigLoader {
    options;
    constructor(options = {}) {
        this.options = {
            configDirectory: './config',
            environment: process.env.NODE_ENV || 'development',
            enableEnvironmentVariables: true,
            enableEnvironmentFiles: true,
            validateSchema: true,
            ...options,
        };
    }
    /**
     * Load brain configuration with hierarchy
     */
    async loadBrainConfig() {
        const sources = [];
        // eslint-disable-next-line functional/no-let
        let config = { ...DEFAULT_CONFIGS.brain };
        // 1. Load base configuration file
        const baseConfigPath = join(this.options.configDirectory, 'brain.config.json');
        if (existsSync(baseConfigPath)) {
            const baseConfig = this.loadJsonFile(baseConfigPath);
            config = this.mergeConfigs(config, baseConfig);
            // eslint-disable-next-line functional/immutable-data
            sources.push({
                source: 'base-file',
                path: baseConfigPath,
                keys: Object.keys(baseConfig),
            });
        }
        // 2. Load environment-specific configuration file
        if (this.options.enableEnvironmentFiles) {
            const envConfigPath = join(this.options.configDirectory, `brain.${this.options.environment}.config.json`);
            if (existsSync(envConfigPath)) {
                const envConfig = this.loadJsonFile(envConfigPath);
                config = this.mergeConfigs(config, envConfig);
                // eslint-disable-next-line functional/immutable-data
                sources.push({
                    source: 'env-file',
                    path: envConfigPath,
                    keys: Object.keys(envConfig),
                });
            }
            // Also check for environment-specific overrides in base config
            if (existsSync(baseConfigPath)) {
                const baseConfig = this.loadJsonFile(baseConfigPath);
                if (baseConfig.environments?.[this.options.environment]) {
                    const envOverrides = baseConfig.environments[this.options.environment];
                    config = this.mergeConfigs(config, envOverrides);
                    // eslint-disable-next-line functional/immutable-data
                    sources.push({
                        source: 'env-file',
                        path: `${baseConfigPath}:environments.${this.options.environment}`,
                        keys: Object.keys(envOverrides),
                    });
                }
            }
        }
        // 3. Apply environment variables
        if (this.options.enableEnvironmentVariables) {
            const envVars = this.loadEnvironmentVariables('brain');
            if (Object.keys(envVars).length > 0) {
                config = this.mergeConfigs(config, envVars);
                // eslint-disable-next-line functional/immutable-data
                sources.push({
                    source: 'environment',
                    keys: Object.keys(envVars),
                });
            }
        }
        // 4. Validate configuration
        // eslint-disable-next-line functional/no-let
        let validation = {
            valid: true,
            errors: [],
            warnings: [],
        };
        if (this.options.validateSchema) {
            validation = ConfigValidator.validateBrainConfig(config);
            if (!validation.valid) {
                throw new Error(`Invalid brain configuration: ${validation.errors.join(', ')}`);
            }
        }
        return {
            config: validation.data || config,
            sources,
            validation,
        };
    }
    /**
     * Load phase configuration with hierarchy
     */
    async loadPhaseConfig(phase) {
        const sources = [];
        // eslint-disable-next-line functional/no-let
        let config = { ...DEFAULT_CONFIGS.phase };
        // 1. Load base configuration file
        const baseConfigPath = join(this.options.configDirectory, `${phase}.config.json`);
        if (existsSync(baseConfigPath)) {
            const baseConfig = this.loadJsonFile(baseConfigPath);
            config = this.mergeConfigs(config, baseConfig);
            // eslint-disable-next-line functional/immutable-data
            sources.push({
                source: 'base-file',
                path: baseConfigPath,
                keys: Object.keys(baseConfig),
            });
        }
        // 2. Load environment-specific configuration file
        if (this.options.enableEnvironmentFiles) {
            const envConfigPath = join(this.options.configDirectory, `${phase}.${this.options.environment}.config.json`);
            if (existsSync(envConfigPath)) {
                const envConfig = this.loadJsonFile(envConfigPath);
                config = this.mergeConfigs(config, envConfig);
                // eslint-disable-next-line functional/immutable-data
                sources.push({
                    source: 'env-file',
                    path: envConfigPath,
                    keys: Object.keys(envConfig),
                });
            }
            // Also check for environment-specific overrides in base config
            if (existsSync(baseConfigPath)) {
                const baseConfig = this.loadJsonFile(baseConfigPath);
                if (baseConfig.environments?.[this.options.environment]) {
                    const envOverrides = baseConfig.environments[this.options.environment];
                    config = this.mergeConfigs(config, envOverrides);
                    // eslint-disable-next-line functional/immutable-data
                    sources.push({
                        source: 'env-file',
                        path: `${baseConfigPath}:environments.${this.options.environment}`,
                        keys: Object.keys(envOverrides),
                    });
                }
            }
        }
        // 3. Apply environment variables
        if (this.options.enableEnvironmentVariables) {
            const envVars = this.loadEnvironmentVariables('phase', phase);
            if (Object.keys(envVars).length > 0) {
                config = this.mergeConfigs(config, envVars);
                // eslint-disable-next-line functional/immutable-data
                sources.push({
                    source: 'environment',
                    keys: Object.keys(envVars),
                });
            }
        }
        // 4. Validate configuration
        // eslint-disable-next-line functional/no-let
        let validation = {
            valid: true,
            errors: [],
            warnings: [],
        };
        if (this.options.validateSchema) {
            validation = ConfigValidator.validatePhaseConfig(config);
            if (!validation.valid) {
                throw new Error(`Invalid ${phase} configuration: ${validation.errors.join(', ')}`);
            }
        }
        return {
            config: validation.data || config,
            sources,
            validation,
        };
    }
    /**
     * Load infrastructure configuration with hierarchy
     */
    async loadInfrastructureConfig() {
        const sources = [];
        // eslint-disable-next-line functional/no-let
        let config = {};
        // 1. Load base configuration file
        const baseConfigPath = join(this.options.configDirectory, 'infrastructure.config.json');
        if (existsSync(baseConfigPath)) {
            const baseConfig = this.loadJsonFile(baseConfigPath);
            config = this.mergeConfigs(config, baseConfig);
            // eslint-disable-next-line functional/immutable-data
            sources.push({
                source: 'base-file',
                path: baseConfigPath,
                keys: Object.keys(baseConfig),
            });
        }
        // 2. Load environment-specific configuration file
        if (this.options.enableEnvironmentFiles) {
            const envConfigPath = join(this.options.configDirectory, `infrastructure.${this.options.environment}.config.json`);
            if (existsSync(envConfigPath)) {
                const envConfig = this.loadJsonFile(envConfigPath);
                config = this.mergeConfigs(config, envConfig);
                // eslint-disable-next-line functional/immutable-data
                sources.push({
                    source: 'env-file',
                    path: envConfigPath,
                    keys: Object.keys(envConfig),
                });
            }
            if (existsSync(baseConfigPath)) {
                const baseConfig = this.loadJsonFile(baseConfigPath);
                if (baseConfig.environments?.[this.options.environment]) {
                    const envOverrides = baseConfig.environments[this.options.environment];
                    config = this.mergeConfigs(config, envOverrides);
                    // eslint-disable-next-line functional/immutable-data
                    sources.push({
                        source: 'env-file',
                        path: `${baseConfigPath}:environments.${this.options.environment}`,
                        keys: Object.keys(envOverrides),
                    });
                }
            }
        }
        // 3. Validate configuration
        // eslint-disable-next-line functional/no-let
        let validation = {
            valid: true,
            errors: [],
            warnings: [],
        };
        if (this.options.validateSchema) {
            validation = ConfigValidator.validateInfrastructureConfig(config);
            if (!validation.valid) {
                throw new Error(`Invalid infrastructure configuration: ${validation.errors.join(', ')}`);
            }
        }
        return {
            config: validation.data || config,
            sources,
            validation,
        };
    }
    /**
     * Load deployment configuration with hierarchy
     */
    async loadDeploymentConfig() {
        const sources = [];
        // eslint-disable-next-line functional/no-let
        let config = {};
        // 1. Load base configuration file
        const baseConfigPath = join(this.options.configDirectory, 'deployment.config.json');
        if (existsSync(baseConfigPath)) {
            const baseConfig = this.loadJsonFile(baseConfigPath);
            config = this.mergeConfigs(config, baseConfig);
            // eslint-disable-next-line functional/immutable-data
            sources.push({
                source: 'base-file',
                path: baseConfigPath,
                keys: Object.keys(baseConfig),
            });
        }
        // 2. Load environment-specific configuration file
        if (this.options.enableEnvironmentFiles) {
            const envConfigPath = join(this.options.configDirectory, `deployment.${this.options.environment}.config.json`);
            if (existsSync(envConfigPath)) {
                const envConfig = this.loadJsonFile(envConfigPath);
                config = this.mergeConfigs(config, envConfig);
                // eslint-disable-next-line functional/immutable-data
                sources.push({
                    source: 'env-file',
                    path: envConfigPath,
                    keys: Object.keys(envConfig),
                });
            }
            if (existsSync(baseConfigPath)) {
                const baseConfig = this.loadJsonFile(baseConfigPath);
                if (baseConfig.environments?.[this.options.environment]) {
                    const envOverrides = baseConfig.environments[this.options.environment];
                    config = this.mergeConfigs(config, envOverrides);
                    // eslint-disable-next-line functional/immutable-data
                    sources.push({
                        source: 'env-file',
                        path: `${baseConfigPath}:environments.${this.options.environment}`,
                        keys: Object.keys(envOverrides),
                    });
                }
            }
        }
        // 3. Validate configuration
        // eslint-disable-next-line functional/no-let
        let validation = {
            valid: true,
            errors: [],
            warnings: [],
        };
        if (this.options.validateSchema) {
            validation = ConfigValidator.validateDeploymentConfig(config);
            if (!validation.valid) {
                throw new Error(`Invalid deployment configuration: ${validation.errors.join(', ')}`);
            }
        }
        return {
            config: validation.data || config,
            sources,
            validation,
        };
    }
    /**
     * Load service configuration with hierarchy
     */
    async loadServiceConfig(service) {
        const sources = [];
        // eslint-disable-next-line functional/no-let
        let config = {};
        // 1. Load base configuration file
        const baseConfigPath = join(this.options.configDirectory, `${service}.config.json`);
        if (existsSync(baseConfigPath)) {
            const baseConfig = this.loadJsonFile(baseConfigPath);
            config = this.mergeConfigs(config, baseConfig);
            // eslint-disable-next-line functional/immutable-data
            sources.push({
                source: 'base-file',
                path: baseConfigPath,
                keys: Object.keys(baseConfig),
            });
        }
        // 2. Load environment-specific configuration file
        if (this.options.enableEnvironmentFiles) {
            const envConfigPath = join(this.options.configDirectory, `${service}.${this.options.environment}.config.json`);
            if (existsSync(envConfigPath)) {
                const envConfig = this.loadJsonFile(envConfigPath);
                config = this.mergeConfigs(config, envConfig);
                // eslint-disable-next-line functional/immutable-data
                sources.push({
                    source: 'env-file',
                    path: envConfigPath,
                    keys: Object.keys(envConfig),
                });
            }
            if (existsSync(baseConfigPath)) {
                const baseConfig = this.loadJsonFile(baseConfigPath);
                if (baseConfig.environments?.[this.options.environment]) {
                    const envOverrides = baseConfig.environments[this.options.environment];
                    config = this.mergeConfigs(config, envOverrides);
                    // eslint-disable-next-line functional/immutable-data
                    sources.push({
                        source: 'env-file',
                        path: `${baseConfigPath}:environments.${this.options.environment}`,
                        keys: Object.keys(envOverrides),
                    });
                }
            }
        }
        // 3. Validate configuration if schema exists
        // eslint-disable-next-line functional/no-let
        let validation = {
            valid: true,
            errors: [],
            warnings: [],
        };
        if (this.options.validateSchema) {
            validation = ConfigValidator.validateServiceConfig(service, config);
            // Don't throw for unknown services, just warn
            if (!validation.valid && !validation.errors.some((e) => e.includes('No schema defined'))) {
                throw new Error(`Invalid ${service} configuration: ${validation.errors.join(', ')}`);
            }
        }
        return {
            config: validation.data || config,
            sources,
            validation,
        };
    }
    /**
     * Load JSON configuration file
     */
    loadJsonFile(filePath) {
        try {
            const content = readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        }
        catch (error) {
            throw new Error(`Failed to load configuration file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Load environment variables for configuration type
     */
    loadEnvironmentVariables(configType, phase) {
        const envVars = {};
        const mappings = ENV_VAR_MAPPINGS[configType];
        for (const [envVar, configPath] of Object.entries(mappings)) {
            // For phase configs, allow phase-specific environment variables
            const phaseSpecificVar = phase ? `${envVar}_${phase.toUpperCase()}` : null;
            const rawValue = process.env[phaseSpecificVar || ''] || process.env[envVar];
            if (rawValue !== undefined) {
                // Convert string values to appropriate types
                // eslint-disable-next-line functional/no-let
                let value = rawValue;
                if (rawValue === 'true')
                    value = true;
                else if (rawValue === 'false')
                    value = false;
                else if (!isNaN(Number(rawValue)))
                    value = Number(rawValue);
                this.setNestedValue(envVars, configPath, value);
            }
        }
        return envVars;
    }
    /**
     * Set nested object value using dot notation
     */
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        // eslint-disable-next-line functional/no-let
        let current = obj;
        // eslint-disable-next-line functional/no-let
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (!(key in current) || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        current[keys[keys.length - 1]] = value;
    }
    /**
     * Deep merge configuration objects
     */
    mergeConfigs(base, override) {
        const result = { ...base };
        for (const [key, value] of Object.entries(override)) {
            if (value !== undefined && value !== null) {
                if (typeof value === 'object' &&
                    !Array.isArray(value) &&
                    typeof result[key] === 'object' &&
                    !Array.isArray(result[key])) {
                    // Deep merge objects
                    // eslint-disable-next-line functional/immutable-data
                    result[key] = this.mergeConfigs(result[key], value);
                }
                else {
                    // Direct assignment for primitives, arrays, and null values
                    // eslint-disable-next-line functional/immutable-data
                    result[key] = value;
                }
            }
        }
        return result;
    }
    /**
     * Get configuration hierarchy summary
     */
    getHierarchySummary() {
        const configFiles = [
            'brain',
            'infrastructure',
            'deployment',
            'phase1',
            'phase2',
            'phase3',
            ...ConfigValidator.getAvailableServiceSchemas(),
        ];
        const enabledSources = [
            'base-file',
            'default',
            ...(this.options.enableEnvironmentFiles ? ['env-file'] : []),
            ...(this.options.enableEnvironmentVariables ? ['environment'] : []),
        ];
        return {
            environment: this.options.environment,
            configDirectory: resolve(this.options.configDirectory),
            enabledSources,
            availableConfigs: configFiles,
        };
    }
}
/**
 * Create hierarchical config loader with default options
 */
export function createConfigLoader(options) {
    return new HierarchicalConfigLoader(options);
}
//# sourceMappingURL=HierarchicalConfigLoader.js.map