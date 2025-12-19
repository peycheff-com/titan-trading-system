/**
 * Hierarchical Config Manager for Titan Trading System
 *
 * Provides centralized configuration management with Brain override capabilities,
 * hot-reload support, schema validation, and environment-specific loading.
 *
 * Requirements: 3.1, 3.3 - Hierarchical configuration and environment-specific loading
 */
import { EventEmitter } from 'eventemitter3';
import { Environment, BrainConfig as SchemaBrainConfig, PhaseConfig as SchemaPhaseConfig } from './config/ConfigSchema';
import { type ConfigVersion } from './config/ConfigVersionHistory';
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
 * Hierarchical Configuration Manager
 */
export declare class ConfigManager extends EventEmitter {
    private brainConfig;
    private phaseConfigs;
    private serviceConfigs;
    private configWatcher;
    private configDirectory;
    private hierarchicalLoader;
    private environment;
    private versionHistory;
    constructor(configDirectory?: string, environment?: Environment);
    /**
     * Load brain configuration using hierarchical loader
     */
    loadBrainConfig(): Promise<BrainConfig>;
    /**
     * Load phase configuration using hierarchical loader with brain overrides
     */
    loadPhaseConfig(phase: string): Promise<PhaseConfig>;
    /**
     * Load service configuration using hierarchical loader
     */
    loadServiceConfig(service: string): Promise<ServiceConfig>;
    /**
     * Save brain configuration
     */
    saveBrainConfig(config: BrainConfig): void;
    /**
     * Save phase configuration
     */
    savePhaseConfig(phase: string, config: PhaseConfig): void;
    /**
     * Get current brain configuration
     */
    getBrainConfig(): BrainConfig | null;
    /**
     * Get current phase configuration
     */
    getPhaseConfig(phase: string): PhaseConfig | null;
    /**
     * Get current service configuration
     */
    getServiceConfig(service: string): ServiceConfig | null;
    /**
     * Check if brain has overrides for phase
     */
    hasBrainOverrides(phase?: string): boolean;
    /**
     * Hot-reload brain configuration
     */
    reloadBrainConfig(): Promise<void>;
    /**
     * Hot-reload phase configuration
     */
    reloadPhaseConfig(phase: string): Promise<void>;
    /**
     * Hot-reload service configuration
     */
    reloadServiceConfig(service: string): Promise<void>;
    /**
     * Validate phase config against brain limits
     */
    private validateAgainstBrainLimits;
    /**
     * Merge configurations with override precedence
     */
    private mergeConfigs;
    /**
     * Get configuration summary including hierarchy information
     */
    getConfigSummary(): {
        brainLoaded: boolean;
        phasesLoaded: string[];
        servicesLoaded: string[];
        hasOverrides: boolean;
        environment: Environment;
        hierarchySummary: any;
    };
    /**
     * Get configuration version history
     */
    getConfigVersionHistory(configType: 'brain' | 'phase' | 'service', configKey: string): ConfigVersion[];
    /**
     * Get configuration version history metadata
     */
    getConfigVersionMetadata(configType: 'brain' | 'phase' | 'service', configKey: string): any;
    /**
     * Get specific configuration version
     */
    getConfigVersion(configType: 'brain' | 'phase' | 'service', configKey: string, version: number): ConfigVersion | null;
    /**
     * Rollback configuration to specific version
     */
    rollbackToVersion(configType: 'brain' | 'phase' | 'service', configKey: string, version: number): Promise<any>;
    /**
     * Compare configuration versions
     */
    compareConfigVersions(configType: 'brain' | 'phase' | 'service', configKey: string, fromVersion: number, toVersion: number): any;
    /**
     * Search configuration versions by criteria
     */
    searchConfigVersions(configType: 'brain' | 'phase' | 'service', configKey: string, criteria: {
        author?: string;
        tags?: string[];
        fromDate?: number;
        toDate?: number;
        comment?: string;
    }): ConfigVersion[];
    /**
     * Export configuration version history
     */
    exportConfigHistory(configType: 'brain' | 'phase' | 'service', configKey: string, outputPath: string): void;
    /**
     * Import configuration version history
     */
    importConfigHistory(configType: 'brain' | 'phase' | 'service', configKey: string, inputPath: string, merge?: boolean): number;
    /**
     * Prune old configuration versions
     */
    pruneConfigHistory(configType: 'brain' | 'phase' | 'service', configKey: string, keepVersions: number): number;
    /**
     * Clear configuration version history
     */
    clearConfigHistory(configType: 'brain' | 'phase' | 'service', configKey: string): void;
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Get or create the global Config Manager instance
 */
export declare function getConfigManager(configDirectory?: string, environment?: Environment): ConfigManager;
/**
 * Reset the global Config Manager instance (for testing)
 */
export declare function resetConfigManager(): void;
//# sourceMappingURL=ConfigManager.d.ts.map