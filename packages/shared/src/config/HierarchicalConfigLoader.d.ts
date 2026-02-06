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
import { BrainConfig, DeploymentConfig, Environment, InfrastructureConfig, PhaseConfig, ValidationResult } from './ConfigSchema';
/**
 * Configuration source types
 */
export type ConfigSource = 'environment' | 'env-file' | 'base-file' | 'default';
/**
 * Configuration load result
 */
export interface ConfigLoadResult<T> {
    config: T;
    sources: Array<{
        source: ConfigSource;
        path?: string;
        keys: string[];
    }>;
    validation: ValidationResult;
}
/**
 * Configuration hierarchy options
 */
export interface ConfigHierarchyOptions {
    configDirectory: string;
    environment: Environment;
    enableEnvironmentVariables: boolean;
    enableEnvironmentFiles: boolean;
    validateSchema: boolean;
}
/**
 * Hierarchical Configuration Loader
 */
export declare class HierarchicalConfigLoader {
    private options;
    constructor(options?: Partial<ConfigHierarchyOptions>);
    /**
     * Load brain configuration with hierarchy
     */
    loadBrainConfig(): Promise<ConfigLoadResult<BrainConfig>>;
    /**
     * Load phase configuration with hierarchy
     */
    loadPhaseConfig(phase: string): Promise<ConfigLoadResult<PhaseConfig>>;
    /**
     * Load infrastructure configuration with hierarchy
     */
    loadInfrastructureConfig(): Promise<ConfigLoadResult<InfrastructureConfig>>;
    /**
     * Load deployment configuration with hierarchy
     */
    loadDeploymentConfig(): Promise<ConfigLoadResult<DeploymentConfig>>;
    /**
     * Load service configuration with hierarchy
     */
    loadServiceConfig(service: string): Promise<ConfigLoadResult<unknown>>;
    /**
     * Load JSON configuration file
     */
    private loadJsonFile;
    /**
     * Load environment variables for configuration type
     */
    private loadEnvironmentVariables;
    /**
     * Set nested object value using dot notation
     */
    private setNestedValue;
    /**
     * Deep merge configuration objects
     */
    private mergeConfigs;
    /**
     * Get configuration hierarchy summary
     */
    getHierarchySummary(): {
        environment: Environment;
        configDirectory: string;
        enabledSources: ConfigSource[];
        availableConfigs: string[];
    };
}
/**
 * Create hierarchical config loader with default options
 */
export declare function createConfigLoader(options?: Partial<ConfigHierarchyOptions>): HierarchicalConfigLoader;
//# sourceMappingURL=HierarchicalConfigLoader.d.ts.map