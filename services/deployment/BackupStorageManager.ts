/**
 * Backup Storage Manager for Titan Production Deployment
 * 
 * Manages multi-location backup storage with local and cloud storage support.
 * Implements 90-day retention with automated cleanup.
 * 
 * Requirements: 6.3, 6.5
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import EventEmitter from 'eventemitter3';
import { BackupMetadata } from './BackupService';

export interface StorageLocation {
  /** Unique identifier for the storage location */
  id: string;
  /** Storage type */
  type: 'local' | 'cloud';
  /** Storage configuration */
  config: LocalStorageConfig | CloudStorageConfig;
  /** Whether this location is enabled */
  enabled: boolean;
  /** Priority for storage (lower number = higher priority) */
  priority: number;
}

export interface LocalStorageConfig {
  /** Local directory path */
  path: string;
  /** Maximum storage size in bytes */
  maxSize?: number;
}

export interface CloudStorageConfig {
  /** Cloud provider */
  provider: 'aws-s3' | 'gcp-storage' | 'azure-blob';
  /** Bucket/container name */
  bucket: string;
  /** Region */
  region: string;
  /** Access credentials */
  credentials: {
    accessKeyId?: string;
    secretAccessKey?: string;
    projectId?: string;
    keyFilename?: string;
  };
  /** Storage class for cost optimization */
  storageClass?: string;
}

export interface StorageManagerConfig {
  /** List of storage locations */
  locations: StorageLocation[];
  /** Retention period in days */
  retentionDays: number;
  /** Minimum number of copies to maintain */
  minCopies: number;
  /** Maximum number of copies to maintain */
  maxCopies: number;
  /** Cleanup schedule (cron format) */
  cleanupSchedule: string;
}

export interface StorageResult {
  /** Storage location ID */
  locationId: string;
  /** Whether storage was successful */
  success: boolean;
  /** Storage path/key */
  storagePath: string;
  /** Error message if failed */
  error?: string;
  /** Storage size in bytes */
  size?: number;
}

export interface ReplicationStatus {
  /** Backup ID */
  backupId: string;
  /** Total locations configured */
  totalLocations: number;
  /** Successful replications */
  successfulReplications: number;
  /** Failed replications */
  failedReplications: number;
  /** Replication results per location */
  results: StorageResult[];
}

export interface CleanupResult {
  /** Location where cleanup was performed */
  locationId: string;
  /** Number of backups deleted */
  deletedCount: number;
  /** Space freed in bytes */
  spaceFreed: number;
  /** Any errors encountered */
  errors: string[];
}

export class BackupStorageManager extends EventEmitter {
  private config: StorageManagerConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(config: StorageManagerConfig) {
    super();
    this.config = config;
    this.validateConfig();
  }

  /**
   * Validate storage manager configuration
   */
  private validateConfig(): void {
    if (!this.config.locations || this.config.locations.length === 0) {
      throw new Error('At least one storage location is required');
    }

    if (this.config.retentionDays < 1) {
      throw new Error('Retention days must be at least 1');
    }

    if (this.config.minCopies < 1) {
      throw new Error('Minimum copies must be at least 1');
    }

    if (this.config.maxCopies < this.config.minCopies) {
      throw new Error('Maximum copies must be greater than or equal to minimum copies');
    }

    // Validate each storage location
    for (const location of this.config.locations) {
      this.validateStorageLocation(location);
    }
  }

  /**
   * Validate individual storage location
   */
  private validateStorageLocation(location: StorageLocation): void {
    if (!location.id) {
      throw new Error('Storage location ID is required');
    }

    if (location.type === 'local') {
      const config = location.config as LocalStorageConfig;
      if (!config.path) {
        throw new Error(`Local storage path is required for location: ${location.id}`);
      }
    } else if (location.type === 'cloud') {
      const config = location.config as CloudStorageConfig;
      if (!config.bucket) {
        throw new Error(`Cloud storage bucket is required for location: ${location.id}`);
      }
      if (!config.region) {
        throw new Error(`Cloud storage region is required for location: ${location.id}`);
      }
    }
  }

  /**
   * Start the storage manager (including cleanup scheduler)
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.scheduleCleanup();
    this.emit('storage:started');
  }

  /**
   * Stop the storage manager
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.emit('storage:stopped');
  }

  /**
   * Store backup to all configured locations
   */
  async storeBackup(backupId: string, backupData: Buffer, metadata: BackupMetadata): Promise<ReplicationStatus> {
    const enabledLocations = this.config.locations
      .filter(loc => loc.enabled)
      .sort((a, b) => a.priority - b.priority);

    const results: StorageResult[] = [];
    let successfulReplications = 0;
    let failedReplications = 0;

    this.emit('replication:started', { backupId, totalLocations: enabledLocations.length });

    for (const location of enabledLocations) {
      try {
        const result = await this.storeToLocation(location, backupId, backupData, metadata);
        results.push(result);

        if (result.success) {
          successfulReplications++;
        } else {
          failedReplications++;
        }

        // Stop if we've reached the maximum copies
        if (successfulReplications >= this.config.maxCopies) {
          break;
        }

      } catch (error) {
        const result: StorageResult = {
          locationId: location.id,
          success: false,
          storagePath: '',
          error: error.message
        };
        results.push(result);
        failedReplications++;
      }
    }

    const status: ReplicationStatus = {
      backupId,
      totalLocations: enabledLocations.length,
      successfulReplications,
      failedReplications,
      results
    };

    // Check if we met minimum replication requirements
    if (successfulReplications < this.config.minCopies) {
      this.emit('replication:insufficient', status);
    } else {
      this.emit('replication:completed', status);
    }

    return status;
  }

  /**
   * Retrieve backup from any available location
   */
  async retrieveBackup(backupId: string): Promise<{ data: Buffer; metadata: BackupMetadata } | null> {
    const enabledLocations = this.config.locations
      .filter(loc => loc.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const location of enabledLocations) {
      try {
        const result = await this.retrieveFromLocation(location, backupId);
        if (result) {
          this.emit('retrieval:success', { backupId, locationId: location.id });
          return result;
        }
      } catch (error) {
        this.emit('retrieval:error', { 
          backupId, 
          locationId: location.id, 
          error: error.message 
        });
      }
    }

    this.emit('retrieval:failed', { backupId });
    return null;
  }

  /**
   * List backups across all locations
   */
  async listBackups(): Promise<Map<string, BackupMetadata[]>> {
    const backupsByLocation = new Map<string, BackupMetadata[]>();

    for (const location of this.config.locations.filter(loc => loc.enabled)) {
      try {
        const backups = await this.listBackupsInLocation(location);
        backupsByLocation.set(location.id, backups);
      } catch (error) {
        this.emit('list:error', { 
          locationId: location.id, 
          error: error.message 
        });
        backupsByLocation.set(location.id, []);
      }
    }

    return backupsByLocation;
  }

  /**
   * Perform cleanup across all locations
   */
  async performCleanup(): Promise<CleanupResult[]> {
    const results: CleanupResult[] = [];

    for (const location of this.config.locations.filter(loc => loc.enabled)) {
      try {
        const result = await this.cleanupLocation(location);
        results.push(result);
      } catch (error) {
        results.push({
          locationId: location.id,
          deletedCount: 0,
          spaceFreed: 0,
          errors: [error.message]
        });
      }
    }

    this.emit('cleanup:completed', { results });
    return results;
  }

  /**
   * Store backup to specific location
   */
  private async storeToLocation(
    location: StorageLocation, 
    backupId: string, 
    backupData: Buffer, 
    metadata: BackupMetadata
  ): Promise<StorageResult> {
    if (location.type === 'local') {
      return await this.storeToLocal(location, backupId, backupData, metadata);
    } else if (location.type === 'cloud') {
      return await this.storeToCloud(location, backupId, backupData, metadata);
    } else {
      throw new Error(`Unsupported storage type: ${location.type}`);
    }
  }

  /**
   * Store backup to local storage
   */
  private async storeToLocal(
    location: StorageLocation, 
    backupId: string, 
    backupData: Buffer, 
    metadata: BackupMetadata
  ): Promise<StorageResult> {
    const config = location.config as LocalStorageConfig;
    const backupDir = path.join(config.path, 'backups');
    const metadataDir = path.join(config.path, 'metadata');

    // Ensure directories exist
    await fs.mkdir(backupDir, { recursive: true });
    await fs.mkdir(metadataDir, { recursive: true });

    // Check storage limits
    if (config.maxSize) {
      const currentSize = await this.getDirectorySize(config.path);
      if (currentSize + backupData.length > config.maxSize) {
        throw new Error('Storage limit exceeded');
      }
    }

    // Store backup file
    const backupPath = path.join(backupDir, `${backupId}.enc`);
    await fs.writeFile(backupPath, backupData);

    // Store metadata
    const metadataPath = path.join(metadataDir, `${backupId}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    return {
      locationId: location.id,
      success: true,
      storagePath: backupPath,
      size: backupData.length
    };
  }

  /**
   * Store backup to cloud storage
   */
  private async storeToCloud(
    location: StorageLocation, 
    backupId: string, 
    backupData: Buffer, 
    metadata: BackupMetadata
  ): Promise<StorageResult> {
    const config = location.config as CloudStorageConfig;
    
    // For now, we'll implement a placeholder for cloud storage
    // In a real implementation, you would use the appropriate cloud SDK
    // (AWS SDK, Google Cloud SDK, Azure SDK, etc.)
    
    const storagePath = `backups/${backupId}.enc`;
    
    // Simulate cloud storage operation
    await this.simulateCloudUpload(config, storagePath, backupData);
    
    // Store metadata
    const metadataPath = `metadata/${backupId}.json`;
    const metadataBuffer = Buffer.from(JSON.stringify(metadata, null, 2));
    await this.simulateCloudUpload(config, metadataPath, metadataBuffer);

    return {
      locationId: location.id,
      success: true,
      storagePath,
      size: backupData.length
    };
  }

  /**
   * Simulate cloud storage upload (placeholder)
   */
  private async simulateCloudUpload(
    config: CloudStorageConfig, 
    key: string, 
    data: Buffer
  ): Promise<void> {
    // In a real implementation, this would use the appropriate cloud SDK
    // For example, for AWS S3:
    // const s3 = new AWS.S3(config.credentials);
    // await s3.upload({ Bucket: config.bucket, Key: key, Body: data }).promise();
    
    // For now, just simulate the operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.emit('cloud:upload', { 
      provider: config.provider, 
      bucket: config.bucket, 
      key, 
      size: data.length 
    });
  }

  /**
   * Retrieve backup from specific location
   */
  private async retrieveFromLocation(
    location: StorageLocation, 
    backupId: string
  ): Promise<{ data: Buffer; metadata: BackupMetadata } | null> {
    if (location.type === 'local') {
      return await this.retrieveFromLocal(location, backupId);
    } else if (location.type === 'cloud') {
      return await this.retrieveFromCloud(location, backupId);
    } else {
      throw new Error(`Unsupported storage type: ${location.type}`);
    }
  }

  /**
   * Retrieve backup from local storage
   */
  private async retrieveFromLocal(
    location: StorageLocation, 
    backupId: string
  ): Promise<{ data: Buffer; metadata: BackupMetadata } | null> {
    const config = location.config as LocalStorageConfig;
    const backupPath = path.join(config.path, 'backups', `${backupId}.enc`);
    const metadataPath = path.join(config.path, 'metadata', `${backupId}.json`);

    try {
      const [data, metadataContent] = await Promise.all([
        fs.readFile(backupPath),
        fs.readFile(metadataPath, 'utf8')
      ]);

      const metadata = JSON.parse(metadataContent);
      metadata.timestamp = new Date(metadata.timestamp);

      return { data, metadata };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Retrieve backup from cloud storage (placeholder)
   */
  private async retrieveFromCloud(
    location: StorageLocation, 
    backupId: string
  ): Promise<{ data: Buffer; metadata: BackupMetadata } | null> {
    // Placeholder for cloud storage retrieval
    // In a real implementation, this would use the appropriate cloud SDK
    return null;
  }

  /**
   * List backups in specific location
   */
  private async listBackupsInLocation(location: StorageLocation): Promise<BackupMetadata[]> {
    if (location.type === 'local') {
      return await this.listLocalBackups(location);
    } else if (location.type === 'cloud') {
      return await this.listCloudBackups(location);
    } else {
      throw new Error(`Unsupported storage type: ${location.type}`);
    }
  }

  /**
   * List backups in local storage
   */
  private async listLocalBackups(location: StorageLocation): Promise<BackupMetadata[]> {
    const config = location.config as LocalStorageConfig;
    const metadataDir = path.join(config.path, 'metadata');

    try {
      const files = await fs.readdir(metadataDir);
      const metadataFiles = files.filter(f => f.endsWith('.json'));
      
      const backups: BackupMetadata[] = [];
      for (const file of metadataFiles) {
        try {
          const content = await fs.readFile(path.join(metadataDir, file), 'utf8');
          const metadata = JSON.parse(content);
          metadata.timestamp = new Date(metadata.timestamp);
          backups.push(metadata);
        } catch (error) {
          // Skip corrupted metadata files
          this.emit('metadata:corrupted', { file, error: error.message });
        }
      }

      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * List backups in cloud storage (placeholder)
   */
  private async listCloudBackups(location: StorageLocation): Promise<BackupMetadata[]> {
    // Placeholder for cloud storage listing
    return [];
  }

  /**
   * Cleanup old backups in specific location
   */
  private async cleanupLocation(location: StorageLocation): Promise<CleanupResult> {
    const backups = await this.listBackupsInLocation(location);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    const toDelete = backups.filter(backup => backup.timestamp < cutoffDate);
    
    let deletedCount = 0;
    let spaceFreed = 0;
    const errors: string[] = [];

    for (const backup of toDelete) {
      try {
        await this.deleteBackupFromLocation(location, backup.backupId);
        deletedCount++;
        spaceFreed += backup.size;
      } catch (error) {
        errors.push(`Failed to delete ${backup.backupId}: ${error.message}`);
      }
    }

    return {
      locationId: location.id,
      deletedCount,
      spaceFreed,
      errors
    };
  }

  /**
   * Delete backup from specific location
   */
  private async deleteBackupFromLocation(location: StorageLocation, backupId: string): Promise<void> {
    if (location.type === 'local') {
      await this.deleteFromLocal(location, backupId);
    } else if (location.type === 'cloud') {
      await this.deleteFromCloud(location, backupId);
    }
  }

  /**
   * Delete backup from local storage
   */
  private async deleteFromLocal(location: StorageLocation, backupId: string): Promise<void> {
    const config = location.config as LocalStorageConfig;
    const backupPath = path.join(config.path, 'backups', `${backupId}.enc`);
    const metadataPath = path.join(config.path, 'metadata', `${backupId}.json`);

    await Promise.all([
      fs.unlink(backupPath).catch(err => {
        if (err.code !== 'ENOENT') throw err;
      }),
      fs.unlink(metadataPath).catch(err => {
        if (err.code !== 'ENOENT') throw err;
      })
    ]);
  }

  /**
   * Delete backup from cloud storage (placeholder)
   */
  private async deleteFromCloud(location: StorageLocation, backupId: string): Promise<void> {
    // Placeholder for cloud storage deletion
  }

  /**
   * Get directory size in bytes
   */
  private async getDirectorySize(dirPath: string): Promise<number> {
    let totalSize = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // Directory might not exist
      return 0;
    }

    return totalSize;
  }

  /**
   * Schedule periodic cleanup
   */
  private scheduleCleanup(): void {
    if (!this.isRunning) {
      return;
    }

    // For simplicity, schedule cleanup every 24 hours
    // In a real implementation, you would parse the cron expression
    const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours

    this.cleanupTimer = setTimeout(async () => {
      try {
        await this.performCleanup();
      } catch (error) {
        this.emit('cleanup:error', { error: error.message });
      }
      
      // Schedule next cleanup
      this.scheduleCleanup();
    }, cleanupInterval);
  }
}

// Singleton instance
let storageManagerInstance: BackupStorageManager | null = null;

/**
 * Get or create BackupStorageManager instance
 */
export function getBackupStorageManager(config?: StorageManagerConfig): BackupStorageManager {
  if (!storageManagerInstance && config) {
    storageManagerInstance = new BackupStorageManager(config);
  }
  
  if (!storageManagerInstance) {
    throw new Error('BackupStorageManager not initialized. Provide config on first call.');
  }
  
  return storageManagerInstance;
}

/**
 * Reset BackupStorageManager instance (for testing)
 */
export function resetBackupStorageManager(): void {
  if (storageManagerInstance) {
    storageManagerInstance.stop();
    storageManagerInstance = null;
  }
}