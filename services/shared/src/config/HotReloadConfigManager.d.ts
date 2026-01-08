/**
 * Hot-Reload Configuration Manager for Titan Production Deployment
 *
 * Provides hot-reload capabilities for configuration changes without service downtime,
 * with encryption support for sensitive data and atomic configuration updates.
 *
 * Requirements: 3.2, 3.4 - Configuration encryption and hot-reload without downtime
 */
import { EventEmitter } from 'eventemitter3';
import { ConfigHierarchyOptions } from './HierarchicalConfigLoader';
import { BrainConfig, PhaseConfig } from './ConfigSchema';
/**
 * Hot-reload event types
 */
export interface HotReloadEvent {
    type: 'config-changed' | 'config-error' | 'encryption-changed';
    configType: 'brain' | 'phase' | 'service';
    configKey: string;
    oldValue?: any;
    newValue?: any;
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
    data: any;
    encrypted: boolean;
}
/**
 * Hot-Reload Configuration Manager
 */
export declare class HotReloadConfigManager extends EventEmitter {
    private hierarchicalLoader;
    private configEncryption;
    private options;
    private watchedFiles;
    private configBackups;
    private currentConfigs;
    private reloadInProgress;
    constructor(options?: Partial<HotReloadOptions>);
    /**
     * Initialize hot-reload manager with master password
     */
    initialize(masterPassword?: string): Promise<void>;
    /**
     * Load and watch brain configuration
     */
    loadAndWatchBrainConfig(): Promise<BrainConfig>;
    /**
     * Load and watch phase configuration
     */
    loadAndWatchPhaseConfig(phase: string): Promise<PhaseConfig>;
    /**
     * Load and watch service configuration
     */
    loadAndWatchServiceConfig(service: string): Promise<any>;
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
     * Save configuration with encryption
     */
    saveConfigWithEncryption(configType: 'brain' | 'phase' | 'service', configKey: string, config: any): Promise<void>;
    /**
     * Rollback configuration to previous version
     */
    rollbackConfig(configType: 'brain' | 'phase' | 'service', configKey: string, steps?: number): boolean;
    /**
     * Get current configuration
     */
    getCurrentConfig(configKey: string): any;
    /**
     * Get configuration backup history
     */
    getConfigHistory(configType: 'brain' | 'phase' | 'service', configKey: string): ConfigBackup[];
    /**
     * Watch configuration file for changes
     */
    private watchConfigFile;
    /**
     * Validate configuration change
     */
    private validateConfigChange;
    /**
     * Create configuration backup
     */
    private createBackup;
    /**
     * Get fields to encrypt for configuration type
     */
    private getFieldsToEncrypt;
    /**
     * Get configuration file path
     */
    private getConfigFilePath;
    /**
     * Stop watching all files and cleanup
     */
    destroy(): void;
}
/**
 * Create hot-reload config manager with default options
 */
export declare function createHotReloadConfigManager(options?: Partial<HotReloadOptions>): HotReloadConfigManager;
export {};
//# sourceMappingURL=HotReloadConfigManager.d.ts.map