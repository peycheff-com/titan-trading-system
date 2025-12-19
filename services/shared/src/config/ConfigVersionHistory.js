"use strict";
/**
 * Configuration Version History for Titan Production Deployment
 *
 * Provides comprehensive version tracking for configuration changes
 * with rollback capabilities and audit trail.
 *
 * Requirements: 3.5 - Configuration version history for rollback
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigVersionHistory = void 0;
exports.getConfigVersionHistory = getConfigVersionHistory;
exports.resetConfigVersionHistory = resetConfigVersionHistory;
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
/**
 * Configuration Version History Manager
 */
class ConfigVersionHistory {
    historyDirectory;
    maxVersions;
    enableCompression;
    constructor(historyDirectory = './config/.history', maxVersions = 100, enableCompression = false) {
        this.historyDirectory = historyDirectory;
        this.maxVersions = maxVersions;
        this.enableCompression = enableCompression;
        // Ensure history directory exists
        if (!(0, fs_1.existsSync)(this.historyDirectory)) {
            (0, fs_1.mkdirSync)(this.historyDirectory, { recursive: true });
        }
    }
    /**
     * Save configuration version
     */
    saveVersion(configType, configKey, data, author, comment, tags) {
        // Load existing history
        const history = this.loadHistory(configType, configKey);
        // Calculate next version number
        const nextVersion = history.length > 0
            ? Math.max(...history.map(v => v.version)) + 1
            : 1;
        // Calculate hash of configuration data
        const hash = this.calculateHash(data);
        // Check if this is a duplicate of the last version
        if (history.length > 0) {
            const lastVersion = history[history.length - 1];
            if (lastVersion.hash === hash) {
                console.log(`⚠️ Configuration unchanged, skipping version save for ${configKey}`);
                return lastVersion;
            }
        }
        // Create version entry
        const version = {
            version: nextVersion,
            timestamp: Date.now(),
            configType,
            configKey,
            data: JSON.parse(JSON.stringify(data)), // Deep copy
            hash,
            author,
            comment,
            tags
        };
        // Add to history
        history.push(version);
        // Enforce max versions limit
        if (history.length > this.maxVersions) {
            history.shift(); // Remove oldest version
        }
        // Save history
        this.saveHistory(configType, configKey, history);
        console.log(`📝 Saved configuration version ${nextVersion} for ${configKey}`);
        return version;
    }
    /**
     * Get specific configuration version
     */
    getVersion(configType, configKey, version) {
        const history = this.loadHistory(configType, configKey);
        return history.find(v => v.version === version) || null;
    }
    /**
     * Get latest configuration version
     */
    getLatestVersion(configType, configKey) {
        const history = this.loadHistory(configType, configKey);
        return history.length > 0 ? history[history.length - 1] : null;
    }
    /**
     * Get all versions for configuration
     */
    getAllVersions(configType, configKey) {
        return this.loadHistory(configType, configKey);
    }
    /**
     * Get version history metadata
     */
    getMetadata(configType, configKey) {
        const history = this.loadHistory(configType, configKey);
        if (history.length === 0) {
            return null;
        }
        const versions = history.map(v => v.version);
        const timestamps = history.map(v => v.timestamp);
        return {
            configType,
            configKey,
            currentVersion: Math.max(...versions),
            totalVersions: history.length,
            firstVersion: Math.min(...versions),
            lastModified: Math.max(...timestamps),
            createdAt: Math.min(...timestamps)
        };
    }
    /**
     * Compare two configuration versions
     */
    compareVersions(configType, configKey, fromVersion, toVersion) {
        const fromConfig = this.getVersion(configType, configKey, fromVersion);
        const toConfig = this.getVersion(configType, configKey, toVersion);
        if (!fromConfig || !toConfig) {
            return null;
        }
        const changes = this.detectChanges(fromConfig.data, toConfig.data);
        const summary = {
            added: changes.filter(c => c.changeType === 'added').length,
            modified: changes.filter(c => c.changeType === 'modified').length,
            removed: changes.filter(c => c.changeType === 'removed').length
        };
        return {
            fromVersion,
            toVersion,
            changes,
            summary
        };
    }
    /**
     * Rollback to specific version
     */
    rollbackToVersion(configType, configKey, targetVersion) {
        try {
            const history = this.loadHistory(configType, configKey);
            const currentVersion = history.length > 0
                ? history[history.length - 1].version
                : 0;
            const targetConfig = this.getVersion(configType, configKey, targetVersion);
            if (!targetConfig) {
                return {
                    success: false,
                    fromVersion: currentVersion,
                    toVersion: targetVersion,
                    error: `Version ${targetVersion} not found`
                };
            }
            // Create a new version entry for the rollback
            const rollbackVersion = this.saveVersion(configType, configKey, targetConfig.data, 'system', `Rollback to version ${targetVersion}`, ['rollback']);
            console.log(`🔄 Rolled back ${configKey} from version ${currentVersion} to ${targetVersion}`);
            return {
                success: true,
                fromVersion: currentVersion,
                toVersion: rollbackVersion.version,
                data: targetConfig.data
            };
        }
        catch (error) {
            return {
                success: false,
                fromVersion: 0,
                toVersion: targetVersion,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
    /**
     * Search versions by criteria
     */
    searchVersions(configType, configKey, criteria) {
        const history = this.loadHistory(configType, configKey);
        return history.filter(version => {
            // Filter by author
            if (criteria.author && version.author !== criteria.author) {
                return false;
            }
            // Filter by tags
            if (criteria.tags && criteria.tags.length > 0) {
                if (!version.tags || !criteria.tags.some(tag => version.tags.includes(tag))) {
                    return false;
                }
            }
            // Filter by date range
            if (criteria.fromDate && version.timestamp < criteria.fromDate) {
                return false;
            }
            if (criteria.toDate && version.timestamp > criteria.toDate) {
                return false;
            }
            // Filter by comment
            if (criteria.comment && (!version.comment || !version.comment.includes(criteria.comment))) {
                return false;
            }
            return true;
        });
    }
    /**
     * Delete old versions (keep only last N versions)
     */
    pruneHistory(configType, configKey, keepVersions) {
        const history = this.loadHistory(configType, configKey);
        if (history.length <= keepVersions) {
            return 0; // Nothing to prune
        }
        const versionsToRemove = history.length - keepVersions;
        const prunedHistory = history.slice(versionsToRemove);
        this.saveHistory(configType, configKey, prunedHistory);
        console.log(`🗑️ Pruned ${versionsToRemove} old versions for ${configKey}`);
        return versionsToRemove;
    }
    /**
     * Export version history to JSON
     */
    exportHistory(configType, configKey, outputPath) {
        const history = this.loadHistory(configType, configKey);
        const metadata = this.getMetadata(configType, configKey);
        const exportData = {
            metadata,
            versions: history
        };
        (0, fs_1.writeFileSync)(outputPath, JSON.stringify(exportData, null, 2), 'utf8');
        console.log(`📤 Exported version history for ${configKey} to ${outputPath}`);
    }
    /**
     * Import version history from JSON
     */
    importHistory(configType, configKey, inputPath, merge = false) {
        if (!(0, fs_1.existsSync)(inputPath)) {
            throw new Error(`Import file not found: ${inputPath}`);
        }
        const importData = JSON.parse((0, fs_1.readFileSync)(inputPath, 'utf8'));
        const importedVersions = importData.versions;
        if (merge) {
            // Merge with existing history
            const existingHistory = this.loadHistory(configType, configKey);
            const mergedHistory = [...existingHistory, ...importedVersions];
            // Sort by version number
            mergedHistory.sort((a, b) => a.version - b.version);
            // Remove duplicates based on hash
            const uniqueHistory = mergedHistory.filter((version, index, self) => index === self.findIndex(v => v.hash === version.hash));
            this.saveHistory(configType, configKey, uniqueHistory);
            console.log(`📥 Imported and merged ${importedVersions.length} versions for ${configKey}`);
            return importedVersions.length;
        }
        else {
            // Replace existing history
            this.saveHistory(configType, configKey, importedVersions);
            console.log(`📥 Imported ${importedVersions.length} versions for ${configKey}`);
            return importedVersions.length;
        }
    }
    /**
     * Calculate hash of configuration data
     */
    calculateHash(data) {
        const jsonString = JSON.stringify(data, Object.keys(data).sort());
        return (0, crypto_1.createHash)('sha256').update(jsonString).digest('hex');
    }
    /**
     * Detect changes between two configuration objects
     */
    detectChanges(oldData, newData, path = '') {
        const changes = [];
        // Check for added and modified keys
        for (const key in newData) {
            const currentPath = path ? `${path}.${key}` : key;
            if (!(key in oldData)) {
                // Key added
                changes.push({
                    path: currentPath,
                    oldValue: undefined,
                    newValue: newData[key],
                    changeType: 'added'
                });
            }
            else if (typeof newData[key] === 'object' && newData[key] !== null &&
                typeof oldData[key] === 'object' && oldData[key] !== null) {
                // Recursively check nested objects
                changes.push(...this.detectChanges(oldData[key], newData[key], currentPath));
            }
            else if (newData[key] !== oldData[key]) {
                // Value modified
                changes.push({
                    path: currentPath,
                    oldValue: oldData[key],
                    newValue: newData[key],
                    changeType: 'modified'
                });
            }
        }
        // Check for removed keys
        for (const key in oldData) {
            if (!(key in newData)) {
                const currentPath = path ? `${path}.${key}` : key;
                changes.push({
                    path: currentPath,
                    oldValue: oldData[key],
                    newValue: undefined,
                    changeType: 'removed'
                });
            }
        }
        return changes;
    }
    /**
     * Load version history from file
     */
    loadHistory(configType, configKey) {
        const historyPath = this.getHistoryFilePath(configType, configKey);
        if (!(0, fs_1.existsSync)(historyPath)) {
            return [];
        }
        try {
            const content = (0, fs_1.readFileSync)(historyPath, 'utf8');
            return JSON.parse(content);
        }
        catch (error) {
            console.error(`❌ Failed to load version history for ${configKey}:`, error);
            return [];
        }
    }
    /**
     * Save version history to file
     */
    saveHistory(configType, configKey, history) {
        const historyPath = this.getHistoryFilePath(configType, configKey);
        try {
            (0, fs_1.writeFileSync)(historyPath, JSON.stringify(history, null, 2), 'utf8');
        }
        catch (error) {
            console.error(`❌ Failed to save version history for ${configKey}:`, error);
            throw error;
        }
    }
    /**
     * Get history file path
     */
    getHistoryFilePath(_configType, configKey) {
        return (0, path_1.join)(this.historyDirectory, `${configKey}.history.json`);
    }
    /**
     * Clear all version history
     */
    clearHistory(configType, configKey) {
        this.saveHistory(configType, configKey, []);
        console.log(`🗑️ Cleared version history for ${configKey}`);
    }
}
exports.ConfigVersionHistory = ConfigVersionHistory;
/**
 * Singleton instance for global use
 */
let configVersionHistoryInstance = null;
/**
 * Get or create global config version history instance
 */
function getConfigVersionHistory(historyDirectory, maxVersions, enableCompression) {
    if (!configVersionHistoryInstance) {
        configVersionHistoryInstance = new ConfigVersionHistory(historyDirectory, maxVersions, enableCompression);
    }
    return configVersionHistoryInstance;
}
/**
 * Reset global config version history instance
 */
function resetConfigVersionHistory() {
    configVersionHistoryInstance = null;
}
//# sourceMappingURL=ConfigVersionHistory.js.map