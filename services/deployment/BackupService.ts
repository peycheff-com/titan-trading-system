/**
 * Backup Service for Titan Production Deployment
 * 
 * Provides automated backup functionality with compression and encryption
 * for configuration files and trading logs.
 * 
 * Requirements: 6.1, 6.2
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import EventEmitter from 'eventemitter3';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface BackupConfig {
  /** Backup directory path */
  backupDir: string;
  /** Encryption key for AES-256-GCM */
  encryptionKey: string;
  /** Directories to backup */
  sourceDirs: string[];
  /** File patterns to include */
  includePatterns: string[];
  /** File patterns to exclude */
  excludePatterns: string[];
  /** Maximum backup age in days */
  retentionDays: number;
  /** Backup schedule (cron format) */
  schedule: string;
}

export interface BackupResult {
  /** Unique backup identifier */
  backupId: string;
  /** Backup timestamp */
  timestamp: Date;
  /** Total backup size in bytes */
  size: number;
  /** List of backed up files */
  files: string[];
  /** Whether backup is encrypted */
  encrypted: boolean;
  /** Backup file path */
  backupPath: string;
  /** Compression ratio */
  compressionRatio: number;
}

export interface BackupMetadata {
  backupId: string;
  timestamp: Date;
  size: number;
  files: string[];
  encrypted: boolean;
  compressionRatio: number;
  checksum: string;
}

export interface RestoreResult {
  /** Whether restore was successful */
  success: boolean;
  /** Number of files restored */
  filesRestored: number;
  /** List of restored files */
  restoredFiles: string[];
  /** Any errors encountered */
  errors: string[];
}

export class BackupService extends EventEmitter {
  private config: BackupConfig;
  private isRunning: boolean = false;

  constructor(config: BackupConfig) {
    super();
    this.config = config;
    this.validateConfig();
  }

  /**
   * Validate backup configuration
   */
  private validateConfig(): void {
    if (!this.config.backupDir) {
      throw new Error('Backup directory is required');
    }
    if (!this.config.encryptionKey || this.config.encryptionKey.length !== 64) {
      throw new Error('Encryption key must be 64 characters (32 bytes hex)');
    }
    if (!this.config.sourceDirs || this.config.sourceDirs.length === 0) {
      throw new Error('At least one source directory is required');
    }
  }

  /**
   * Create a backup of configured directories
   */
  async createBackup(): Promise<BackupResult> {
    if (this.isRunning) {
      throw new Error('Backup already in progress');
    }

    this.isRunning = true;
    const backupId = this.generateBackupId();
    const timestamp = new Date();

    try {
      this.emit('backup:started', { backupId, timestamp });

      // Ensure backup directory exists
      await fs.mkdir(this.config.backupDir, { recursive: true });

      // Collect files to backup
      const filesToBackup = await this.collectFiles();
      
      if (filesToBackup.length === 0) {
        throw new Error('No files found to backup');
      }

      // Create backup archive
      const backupData = await this.createArchive(filesToBackup);
      
      // Compress the archive
      const compressedData = await gzip(backupData);
      const compressionRatio = compressedData.length / backupData.length;

      // Encrypt the compressed data
      const encryptedData = await this.encryptData(compressedData);

      // Write backup file
      const backupFileName = `backup_${backupId}.enc`;
      const backupPath = path.join(this.config.backupDir, backupFileName);
      await fs.writeFile(backupPath, encryptedData);

      // Create metadata
      const metadata: BackupMetadata = {
        backupId,
        timestamp,
        size: encryptedData.length,
        files: filesToBackup,
        encrypted: true,
        compressionRatio,
        checksum: this.calculateChecksum(encryptedData)
      };

      // Save metadata
      await this.saveMetadata(backupId, metadata);

      const result: BackupResult = {
        backupId,
        timestamp,
        size: encryptedData.length,
        files: filesToBackup,
        encrypted: true,
        backupPath,
        compressionRatio
      };

      this.emit('backup:completed', result);
      return result;

    } catch (error) {
      this.emit('backup:failed', { backupId, error: error.message });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Restore a backup by ID
   */
  async restoreBackup(backupId: string, targetDir?: string): Promise<RestoreResult> {
    try {
      this.emit('restore:started', { backupId });

      // Load metadata
      const metadata = await this.loadMetadata(backupId);
      if (!metadata) {
        throw new Error(`Backup metadata not found for ID: ${backupId}`);
      }

      // Read backup file
      const backupFileName = `backup_${backupId}.enc`;
      const backupPath = path.join(this.config.backupDir, backupFileName);
      const encryptedData = await fs.readFile(backupPath);

      // Verify checksum
      const checksum = this.calculateChecksum(encryptedData);
      if (checksum !== metadata.checksum) {
        throw new Error('Backup file checksum mismatch - file may be corrupted');
      }

      // Decrypt data
      const compressedData = await this.decryptData(encryptedData);

      // Decompress data
      const archiveData = await gunzip(compressedData);

      // Extract archive
      const restoredFiles = await this.extractArchive(archiveData, targetDir);

      const result: RestoreResult = {
        success: true,
        filesRestored: restoredFiles.length,
        restoredFiles,
        errors: []
      };

      this.emit('restore:completed', result);
      return result;

    } catch (error) {
      const result: RestoreResult = {
        success: false,
        filesRestored: 0,
        restoredFiles: [],
        errors: [error.message]
      };

      this.emit('restore:failed', { backupId, error: error.message });
      return result;
    }
  }

  /**
   * List available backups
   */
  async listBackups(): Promise<BackupMetadata[]> {
    const metadataDir = path.join(this.config.backupDir, 'metadata');
    
    try {
      const files = await fs.readdir(metadataDir);
      const metadataFiles = files.filter(f => f.endsWith('.json'));
      
      const backups: BackupMetadata[] = [];
      for (const file of metadataFiles) {
        const backupId = file.replace('.json', '');
        const metadata = await this.loadMetadata(backupId);
        if (metadata) {
          backups.push(metadata);
        }
      }

      // Sort by timestamp (newest first)
      return backups.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<number> {
    const backups = await this.listBackups();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    let deletedCount = 0;
    for (const backup of backups) {
      if (backup.timestamp < cutoffDate) {
        await this.deleteBackup(backup.backupId);
        deletedCount++;
      }
    }

    this.emit('cleanup:completed', { deletedCount });
    return deletedCount;
  }

  /**
   * Delete a specific backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    // Delete backup file
    const backupFileName = `backup_${backupId}.enc`;
    const backupPath = path.join(this.config.backupDir, backupFileName);
    
    try {
      await fs.unlink(backupPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Delete metadata
    const metadataPath = path.join(this.config.backupDir, 'metadata', `${backupId}.json`);
    try {
      await fs.unlink(metadataPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    this.emit('backup:deleted', { backupId });
  }

  /**
   * Generate unique backup ID
   */
  private generateBackupId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${random}`;
  }

  /**
   * Collect files to backup based on configuration
   */
  private async collectFiles(): Promise<string[]> {
    const files: string[] = [];

    for (const sourceDir of this.config.sourceDirs) {
      try {
        const dirFiles = await this.scanDirectory(sourceDir);
        files.push(...dirFiles);
      } catch (error) {
        // Log warning but continue with other directories
        this.emit('backup:warning', { 
          message: `Failed to scan directory: ${sourceDir}`, 
          error: error.message 
        });
      }
    }

    return this.filterFiles(files);
  }

  /**
   * Recursively scan directory for files
   */
  private async scanDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.scanDirectory(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory might not exist or be accessible
      throw new Error(`Cannot access directory: ${dirPath} - ${error.message}`);
    }

    return files;
  }

  /**
   * Filter files based on include/exclude patterns
   */
  private filterFiles(files: string[]): string[] {
    return files.filter(file => {
      // Check exclude patterns first
      if (this.config.excludePatterns) {
        for (const pattern of this.config.excludePatterns) {
          if (this.matchesPattern(file, pattern)) {
            return false;
          }
        }
      }

      // Check include patterns
      if (this.config.includePatterns && this.config.includePatterns.length > 0) {
        for (const pattern of this.config.includePatterns) {
          if (this.matchesPattern(file, pattern)) {
            return true;
          }
        }
        return false;
      }

      return true;
    });
  }

  /**
   * Check if file matches pattern (simple glob-like matching)
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath) || regex.test(path.basename(filePath));
  }

  /**
   * Create archive from file list
   */
  private async createArchive(files: string[]): Promise<Buffer> {
    const archive: any = {};

    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath);
        archive[filePath] = content.toString('base64');
      } catch (error) {
        this.emit('backup:warning', { 
          message: `Failed to read file: ${filePath}`, 
          error: error.message 
        });
      }
    }

    return Buffer.from(JSON.stringify(archive), 'utf8');
  }

  /**
   * Extract archive to target directory
   */
  private async extractArchive(archiveData: Buffer, targetDir?: string): Promise<string[]> {
    const archive = JSON.parse(archiveData.toString('utf8'));
    const restoredFiles: string[] = [];

    for (const [filePath, content] of Object.entries(archive)) {
      try {
        const actualPath = targetDir ? 
          path.join(targetDir, path.relative(process.cwd(), filePath)) : 
          filePath;

        // Ensure directory exists
        await fs.mkdir(path.dirname(actualPath), { recursive: true });

        // Write file
        const fileContent = Buffer.from(content as string, 'base64');
        await fs.writeFile(actualPath, fileContent);
        
        restoredFiles.push(actualPath);
      } catch (error) {
        this.emit('restore:warning', { 
          message: `Failed to restore file: ${filePath}`, 
          error: error.message 
        });
      }
    }

    return restoredFiles;
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private async encryptData(data: Buffer): Promise<Buffer> {
    const key = Buffer.from(this.config.encryptionKey, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', key);
    cipher.setAAD(Buffer.from('titan-backup', 'utf8'));

    const encrypted = Buffer.concat([
      cipher.update(data),
      cipher.final()
    ]);

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    return Buffer.concat([iv, authTag, encrypted]);
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private async decryptData(encryptedData: Buffer): Promise<Buffer> {
    const key = Buffer.from(this.config.encryptionKey, 'hex');
    const iv = encryptedData.slice(0, 16);
    const authTag = encryptedData.slice(16, 32);
    const encrypted = encryptedData.slice(32);

    const decipher = crypto.createDecipher('aes-256-gcm', key);
    decipher.setAAD(Buffer.from('titan-backup', 'utf8'));
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  }

  /**
   * Calculate SHA-256 checksum
   */
  private calculateChecksum(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Save backup metadata
   */
  private async saveMetadata(backupId: string, metadata: BackupMetadata): Promise<void> {
    const metadataDir = path.join(this.config.backupDir, 'metadata');
    await fs.mkdir(metadataDir, { recursive: true });
    
    const metadataPath = path.join(metadataDir, `${backupId}.json`);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Load backup metadata
   */
  private async loadMetadata(backupId: string): Promise<BackupMetadata | null> {
    const metadataPath = path.join(this.config.backupDir, 'metadata', `${backupId}.json`);
    
    try {
      const content = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(content);
      
      // Convert timestamp string back to Date
      metadata.timestamp = new Date(metadata.timestamp);
      
      return metadata;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
}

// Singleton instance
let backupServiceInstance: BackupService | null = null;

/**
 * Get or create BackupService instance
 */
export function getBackupService(config?: BackupConfig): BackupService {
  if (!backupServiceInstance && config) {
    backupServiceInstance = new BackupService(config);
  }
  
  if (!backupServiceInstance) {
    throw new Error('BackupService not initialized. Provide config on first call.');
  }
  
  return backupServiceInstance;
}

/**
 * Reset BackupService instance (for testing)
 */
export function resetBackupService(): void {
  backupServiceInstance = null;
}