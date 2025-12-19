/**
 * Metrics Data Retention Service for Titan Trading System
 * 
 * Provides 30-day metrics data retention with compression and automated cleanup.
 * 
 * Requirements: 5.5 - 30-day metrics retention with compression
 */

import { EventEmitter } from 'eventemitter3';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { getTelemetryService } from '../shared/src/TelemetryService';
import type { MonitoringData } from './MonitoringService';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
};

/**
 * Retention policy configuration
 */
export interface RetentionPolicy {
  retentionDays: number;
  compressionEnabled: boolean;
  compressionAfterDays: number;
  cleanupInterval: number; // milliseconds
  maxStorageSize: number; // bytes (0 = unlimited)
}

/**
 * Storage statistics
 */
export interface StorageStats {
  totalFiles: number;
  compressedFiles: number;
  uncompressedFiles: number;
  totalSize: number;
  compressedSize: number;
  uncompressedSize: number;
  oldestFile: string;
  newestFile: string;
}

/**
 * Metrics retention configuration
 */
export interface MetricsRetentionConfig {
  storagePath: string;
  policy: RetentionPolicy;
  enableAutoCleanup: boolean;
  enableAutoCompression: boolean;
}

/**
 * Default retention configuration
 */
const DEFAULT_CONFIG: MetricsRetentionConfig = {
  storagePath: './logs/metrics',
  policy: {
    retentionDays: 30,
    compressionEnabled: true,
    compressionAfterDays: 7,
    cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
    maxStorageSize: 0 // Unlimited
  },
  enableAutoCleanup: true,
  enableAutoCompression: true
};

/**
 * Metrics Data Retention Service
 */
export class MetricsRetentionService extends EventEmitter {
  private config: MetricsRetentionConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private compressionTimer: NodeJS.Timeout | null = null;
  private telemetry = getTelemetryService();
  
  constructor(config: Partial<MetricsRetentionConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    console.log(colors.blue('💾 Metrics Retention Service initialized'));
    console.log(colors.gray(`   Retention: ${this.config.policy.retentionDays} days`));
    console.log(colors.gray(`   Compression: ${this.config.policy.compressionEnabled ? 'enabled' : 'disabled'}`));
    console.log(colors.gray(`   Storage: ${this.config.storagePath}`));
  }
  
  /**
   * Start retention service
   */
  async start(): Promise<void> {
    // Ensure storage directory exists
    await this.ensureStorageDirectory();
    
    // Start auto-cleanup if enabled
    if (this.config.enableAutoCleanup) {
      this.startAutoCleanup();
    }
    
    // Start auto-compression if enabled
    if (this.config.enableAutoCompression) {
      this.startAutoCompression();
    }
    
    console.log(colors.green('💾 Metrics retention service started'));
    this.emit('started', { timestamp: Date.now() });
  }
  
  /**
   * Stop retention service
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    if (this.compressionTimer) {
      clearInterval(this.compressionTimer);
      this.compressionTimer = null;
    }
    
    console.log(colors.yellow('💾 Metrics retention service stopped'));
    this.emit('stopped', { timestamp: Date.now() });
  }
  /**
   * Store metrics data
   */
  async storeMetrics(data: MonitoringData): Promise<void> {
    try {
      const date = new Date(data.system.timestamp).toISOString().split('T')[0];
      const filename = `metrics-${date}.jsonl`;
      const filepath = path.join(this.config.storagePath, filename);
      
      const line = JSON.stringify(data) + '\n';
      await fs.appendFile(filepath, line);
      
      this.emit('metricsStored', { 
        timestamp: Date.now(), 
        file: filename, 
        size: Buffer.byteLength(line) 
      });
      
    } catch (error) {
      console.error(colors.red('❌ Failed to store metrics:'), error);
      this.telemetry.logError('MetricsRetentionService', 'Failed to store metrics', { 
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * Retrieve metrics data for date range
   */
  async retrieveMetrics(startDate: Date, endDate: Date): Promise<MonitoringData[]> {
    try {
      const metrics: MonitoringData[] = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const filename = `metrics-${dateStr}.jsonl`;
        const compressedFilename = `metrics-${dateStr}.jsonl.gz`;
        
        // Try compressed file first
        const compressedPath = path.join(this.config.storagePath, compressedFilename);
        const uncompressedPath = path.join(this.config.storagePath, filename);
        
        let data: string | null = null;
        
        try {
          // Check for compressed file
          const compressedData = await fs.readFile(compressedPath);
          const decompressed = await gunzip(compressedData);
          data = decompressed.toString();
        } catch {
          // Try uncompressed file
          try {
            data = await fs.readFile(uncompressedPath, 'utf-8');
          } catch {
            // File doesn't exist for this date
          }
        }
        
        if (data) {
          const lines = data.trim().split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const metric = JSON.parse(line);
                metrics.push(metric);
              } catch (parseError) {
                console.warn(colors.yellow(`⚠️ Failed to parse metrics line: ${line}`));
              }
            }
          }
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      return metrics;
      
    } catch (error) {
      console.error(colors.red('❌ Failed to retrieve metrics:'), error);
      this.telemetry.logError('MetricsRetentionService', 'Failed to retrieve metrics', { 
        error: error.message,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
      throw error;
    }
  }
  /**
   * Compress old metrics files
   */
  async compressOldFiles(): Promise<number> {
    try {
      const files = await fs.readdir(this.config.storagePath);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.policy.compressionAfterDays);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];
      
      let compressedCount = 0;
      
      for (const file of files) {
        if (file.startsWith('metrics-') && file.endsWith('.jsonl') && !file.endsWith('.gz')) {
          const dateMatch = file.match(/metrics-(\d{4}-\d{2}-\d{2})\.jsonl/);
          if (dateMatch && dateMatch[1] < cutoffStr) {
            const filepath = path.join(this.config.storagePath, file);
            const compressedPath = filepath + '.gz';
            
            // Check if compressed version already exists
            try {
              await fs.access(compressedPath);
              continue; // Skip if already compressed
            } catch {
              // Compressed version doesn't exist, proceed with compression
            }
            
            const data = await fs.readFile(filepath);
            const compressed = await gzip(data);
            
            await fs.writeFile(compressedPath, compressed);
            await fs.unlink(filepath);
            
            compressedCount++;
            
            console.log(colors.cyan(`🗜️ Compressed metrics file: ${file}`));
            
            this.emit('fileCompressed', {
              timestamp: Date.now(),
              originalFile: file,
              compressedFile: file + '.gz',
              originalSize: data.length,
              compressedSize: compressed.length,
              compressionRatio: (compressed.length / data.length * 100).toFixed(1)
            });
          }
        }
      }
      
      if (compressedCount > 0) {
        console.log(colors.green(`✅ Compressed ${compressedCount} metrics files`));
      }
      
      return compressedCount;
      
    } catch (error) {
      console.error(colors.red('❌ Failed to compress old files:'), error);
      this.telemetry.logError('MetricsRetentionService', 'Failed to compress old files', { 
        error: error.message 
      });
      throw error;
    }
  }
  
  /**
   * Clean up old metrics files based on retention policy
   */
  async cleanupOldFiles(): Promise<number> {
    try {
      const files = await fs.readdir(this.config.storagePath);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.policy.retentionDays);
      const cutoffStr = cutoffDate.toISOString().split('T')[0];
      
      let deletedCount = 0;
      
      for (const file of files) {
        if (file.startsWith('metrics-') && (file.endsWith('.jsonl') || file.endsWith('.jsonl.gz'))) {
          const dateMatch = file.match(/metrics-(\d{4}-\d{2}-\d{2})\.jsonl/);
          if (dateMatch && dateMatch[1] < cutoffStr) {
            const filepath = path.join(this.config.storagePath, file);
            
            const stats = await fs.stat(filepath);
            await fs.unlink(filepath);
            
            deletedCount++;
            
            console.log(colors.gray(`🗑️ Deleted old metrics file: ${file}`));
            
            this.emit('fileDeleted', {
              timestamp: Date.now(),
              file,
              size: stats.size,
              age: Date.now() - stats.mtime.getTime()
            });
          }
        }
      }
      
      if (deletedCount > 0) {
        console.log(colors.green(`✅ Cleaned up ${deletedCount} old metrics files`));
      }
      
      return deletedCount;
      
    } catch (error) {
      console.error(colors.red('❌ Failed to cleanup old files:'), error);
      this.telemetry.logError('MetricsRetentionService', 'Failed to cleanup old files', { 
        error: error.message 
      });
      throw error;
    }
  }
  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageStats> {
    try {
      const files = await fs.readdir(this.config.storagePath);
      const metricsFiles = files.filter(f => 
        f.startsWith('metrics-') && (f.endsWith('.jsonl') || f.endsWith('.jsonl.gz'))
      );
      
      let totalSize = 0;
      let compressedSize = 0;
      let uncompressedSize = 0;
      let compressedFiles = 0;
      let uncompressedFiles = 0;
      let oldestFile = '';
      let newestFile = '';
      let oldestDate = new Date();
      let newestDate = new Date(0);
      
      for (const file of metricsFiles) {
        const filepath = path.join(this.config.storagePath, file);
        const stats = await fs.stat(filepath);
        
        totalSize += stats.size;
        
        if (file.endsWith('.gz')) {
          compressedFiles++;
          compressedSize += stats.size;
        } else {
          uncompressedFiles++;
          uncompressedSize += stats.size;
        }
        
        // Track oldest and newest files
        if (stats.mtime < oldestDate) {
          oldestDate = stats.mtime;
          oldestFile = file;
        }
        
        if (stats.mtime > newestDate) {
          newestDate = stats.mtime;
          newestFile = file;
        }
      }
      
      return {
        totalFiles: metricsFiles.length,
        compressedFiles,
        uncompressedFiles,
        totalSize,
        compressedSize,
        uncompressedSize,
        oldestFile,
        newestFile
      };
      
    } catch (error) {
      console.error(colors.red('❌ Failed to get storage stats:'), error);
      throw error;
    }
  }
  
  /**
   * Check storage size and enforce limits
   */
  async enforceStorageLimits(): Promise<void> {
    if (this.config.policy.maxStorageSize === 0) {
      return; // No size limit
    }
    
    try {
      const stats = await this.getStorageStats();
      
      if (stats.totalSize > this.config.policy.maxStorageSize) {
        console.log(colors.yellow(`⚠️ Storage size (${this.formatBytes(stats.totalSize)}) exceeds limit (${this.formatBytes(this.config.policy.maxStorageSize)})`));
        
        // Delete oldest files until under limit
        const files = await fs.readdir(this.config.storagePath);
        const metricsFiles = files
          .filter(f => f.startsWith('metrics-') && (f.endsWith('.jsonl') || f.endsWith('.jsonl.gz')))
          .map(f => ({
            name: f,
            path: path.join(this.config.storagePath, f)
          }));
        
        // Sort by modification time (oldest first)
        const fileStats = await Promise.all(
          metricsFiles.map(async f => ({
            ...f,
            stats: await fs.stat(f.path)
          }))
        );
        
        fileStats.sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());
        
        let currentSize = stats.totalSize;
        let deletedCount = 0;
        
        for (const file of fileStats) {
          if (currentSize <= this.config.policy.maxStorageSize) {
            break;
          }
          
          await fs.unlink(file.path);
          currentSize -= file.stats.size;
          deletedCount++;
          
          console.log(colors.gray(`🗑️ Deleted file to enforce size limit: ${file.name}`));
          
          this.emit('fileDeleted', {
            timestamp: Date.now(),
            file: file.name,
            size: file.stats.size,
            reason: 'size_limit'
          });
        }
        
        if (deletedCount > 0) {
          console.log(colors.green(`✅ Deleted ${deletedCount} files to enforce storage limits`));
        }
      }
      
    } catch (error) {
      console.error(colors.red('❌ Failed to enforce storage limits:'), error);
      this.telemetry.logError('MetricsRetentionService', 'Failed to enforce storage limits', { 
        error: error.message 
      });
    }
  }
  /**
   * Start automatic cleanup
   */
  private startAutoCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      try {
        await this.cleanupOldFiles();
        await this.enforceStorageLimits();
      } catch (error) {
        console.error(colors.red('❌ Auto-cleanup failed:'), error);
      }
    }, this.config.policy.cleanupInterval);
    
    console.log(colors.green(`🔄 Auto-cleanup started (${this.config.policy.cleanupInterval / 1000}s interval)`));
  }
  
  /**
   * Start automatic compression
   */
  private startAutoCompression(): void {
    if (!this.config.policy.compressionEnabled) {
      return;
    }
    
    // Run compression every 6 hours
    const compressionInterval = 6 * 60 * 60 * 1000;
    
    this.compressionTimer = setInterval(async () => {
      try {
        await this.compressOldFiles();
      } catch (error) {
        console.error(colors.red('❌ Auto-compression failed:'), error);
      }
    }, compressionInterval);
    
    console.log(colors.green(`🗜️ Auto-compression started (6h interval)`));
  }
  
  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.storagePath, { recursive: true });
    } catch (error) {
      console.error(colors.red('❌ Failed to create storage directory:'), error);
      throw error;
    }
  }
  
  /**
   * Format bytes to human readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * Export metrics for backup
   */
  async exportMetrics(startDate: Date, endDate: Date, outputPath: string): Promise<void> {
    try {
      const metrics = await this.retrieveMetrics(startDate, endDate);
      const exportData = {
        exportTimestamp: Date.now(),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        totalRecords: metrics.length,
        data: metrics
      };
      
      const jsonData = JSON.stringify(exportData, null, 2);
      await fs.writeFile(outputPath, jsonData);
      
      console.log(colors.green(`📤 Exported ${metrics.length} metrics records to ${outputPath}`));
      
      this.emit('metricsExported', {
        timestamp: Date.now(),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        recordCount: metrics.length,
        outputPath
      });
      
    } catch (error) {
      console.error(colors.red('❌ Failed to export metrics:'), error);
      throw error;
    }
  }
  
  /**
   * Update retention configuration
   */
  updateConfig(config: Partial<MetricsRetentionConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Restart timers if intervals changed
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.startAutoCleanup();
    }
    
    if (this.compressionTimer) {
      clearInterval(this.compressionTimer);
      this.startAutoCompression();
    }
    
    console.log(colors.blue('⚙️ Metrics retention configuration updated'));
    this.emit('configUpdated', this.config);
  }
  
  /**
   * Get retention service status
   */
  getStatus(): {
    isRunning: boolean;
    autoCleanupEnabled: boolean;
    autoCompressionEnabled: boolean;
    retentionDays: number;
    compressionAfterDays: number;
    storagePath: string;
  } {
    return {
      isRunning: this.cleanupTimer !== null || this.compressionTimer !== null,
      autoCleanupEnabled: this.config.enableAutoCleanup,
      autoCompressionEnabled: this.config.enableAutoCompression,
      retentionDays: this.config.policy.retentionDays,
      compressionAfterDays: this.config.policy.compressionAfterDays,
      storagePath: this.config.storagePath
    };
  }
  
  /**
   * Shutdown retention service
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down Metrics Retention Service...'));
    this.stop();
    this.removeAllListeners();
  }
}

/**
 * Singleton retention service instance
 */
let retentionServiceInstance: MetricsRetentionService | null = null;

/**
 * Get or create the global retention service instance
 */
export function getMetricsRetentionService(config?: Partial<MetricsRetentionConfig>): MetricsRetentionService {
  if (!retentionServiceInstance) {
    retentionServiceInstance = new MetricsRetentionService(config);
  }
  return retentionServiceInstance;
}

/**
 * Reset the global retention service instance (for testing)
 */
export function resetMetricsRetentionService(): void {
  if (retentionServiceInstance) {
    retentionServiceInstance.shutdown();
  }
  retentionServiceInstance = null;
}