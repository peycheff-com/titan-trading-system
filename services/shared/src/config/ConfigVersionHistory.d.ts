/**
 * Configuration Version History for Titan Production Deployment
 *
 * Provides comprehensive version tracking for configuration changes
 * with rollback capabilities and audit trail.
 *
 * Requirements: 3.5 - Configuration version history for rollback
 */
/**
 * Configuration version entry
 */
export interface ConfigVersion {
    version: number;
    timestamp: number;
    configType: 'brain' | 'phase' | 'service';
    configKey: string;
    data: any;
    hash: string;
    author?: string;
    comment?: string;
    tags?: string[];
}
/**
 * Version history metadata
 */
export interface VersionHistoryMetadata {
    configType: 'brain' | 'phase' | 'service';
    configKey: string;
    currentVersion: number;
    totalVersions: number;
    firstVersion: number;
    lastModified: number;
    createdAt: number;
}
/**
 * Version comparison result
 */
export interface VersionComparison {
    fromVersion: number;
    toVersion: number;
    changes: Array<{
        path: string;
        oldValue: any;
        newValue: any;
        changeType: 'added' | 'modified' | 'removed';
    }>;
    summary: {
        added: number;
        modified: number;
        removed: number;
    };
}
/**
 * Rollback result
 */
export interface RollbackResult {
    success: boolean;
    fromVersion: number;
    toVersion: number;
    data?: any;
    error?: string;
}
/**
 * Configuration Version History Manager
 */
export declare class ConfigVersionHistory {
    private historyDirectory;
    private maxVersions;
    private enableCompression;
    constructor(historyDirectory?: string, maxVersions?: number, enableCompression?: boolean);
    /**
     * Save configuration version
     */
    saveVersion(configType: 'brain' | 'phase' | 'service', configKey: string, data: any, author?: string, comment?: string, tags?: string[]): ConfigVersion;
    /**
     * Get specific configuration version
     */
    getVersion(configType: 'brain' | 'phase' | 'service', configKey: string, version: number): ConfigVersion | null;
    /**
     * Get latest configuration version
     */
    getLatestVersion(configType: 'brain' | 'phase' | 'service', configKey: string): ConfigVersion | null;
    /**
     * Get all versions for configuration
     */
    getAllVersions(configType: 'brain' | 'phase' | 'service', configKey: string): ConfigVersion[];
    /**
     * Get version history metadata
     */
    getMetadata(configType: 'brain' | 'phase' | 'service', configKey: string): VersionHistoryMetadata | null;
    /**
     * Compare two configuration versions
     */
    compareVersions(configType: 'brain' | 'phase' | 'service', configKey: string, fromVersion: number, toVersion: number): VersionComparison | null;
    /**
     * Rollback to specific version
     */
    rollbackToVersion(configType: 'brain' | 'phase' | 'service', configKey: string, targetVersion: number): RollbackResult;
    /**
     * Search versions by criteria
     */
    searchVersions(configType: 'brain' | 'phase' | 'service', configKey: string, criteria: {
        author?: string;
        tags?: string[];
        fromDate?: number;
        toDate?: number;
        comment?: string;
    }): ConfigVersion[];
    /**
     * Delete old versions (keep only last N versions)
     */
    pruneHistory(configType: 'brain' | 'phase' | 'service', configKey: string, keepVersions: number): number;
    /**
     * Export version history to JSON
     */
    exportHistory(configType: 'brain' | 'phase' | 'service', configKey: string, outputPath: string): void;
    /**
     * Import version history from JSON
     */
    importHistory(configType: 'brain' | 'phase' | 'service', configKey: string, inputPath: string, merge?: boolean): number;
    /**
     * Calculate hash of configuration data
     */
    private calculateHash;
    /**
     * Detect changes between two configuration objects
     */
    private detectChanges;
    /**
     * Load version history from file
     */
    private loadHistory;
    /**
     * Save version history to file
     */
    private saveHistory;
    /**
     * Get history file path
     */
    private getHistoryFilePath;
    /**
     * Clear all version history
     */
    clearHistory(configType: 'brain' | 'phase' | 'service', configKey: string): void;
}
/**
 * Get or create global config version history instance
 */
export declare function getConfigVersionHistory(historyDirectory?: string, maxVersions?: number, enableCompression?: boolean): ConfigVersionHistory;
/**
 * Reset global config version history instance
 */
export declare function resetConfigVersionHistory(): void;
//# sourceMappingURL=ConfigVersionHistory.d.ts.map