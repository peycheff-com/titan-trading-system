/**
 * Factory functions for creating test configurations
 */

import { PerformanceOptimizationConfig } from '../../PerformanceOptimizer';
import { VersionManagerConfig } from '../../VersionManager';
import { BackupConfig } from '../../BackupService';

/**
 * Create a complete PerformanceOptimizationConfig for testing
 */
export function createTestPerformanceConfig(
  overrides: Partial<PerformanceOptimizationConfig> = {}
): PerformanceOptimizationConfig {
  const defaultConfig: PerformanceOptimizationConfig = {
    nodejs: {
      maxOldSpaceSize: 4096,
      maxSemiSpaceSize: 256,
      gcOptimization: true,
      exposeGC: false,
      maxEventLoopDelay: 100,
      heapSnapshotSignal: 'SIGUSR2',
      enableSourceMaps: false
    },
    redis: {
      maxMemory: '2gb',
      maxMemoryPolicy: 'allkeys-lru',
      maxClients: 10000,
      timeout: 0,
      tcpKeepAlive: 300,
      tcpUserTimeout: 30000,
      databases: 16,
      saveConfig: {
        enabled: true,
        intervals: [
          { seconds: 900, changes: 1 },
          { seconds: 300, changes: 10 },
          { seconds: 60, changes: 10000 }
        ]
      },
      appendOnly: {
        enabled: true,
        fsync: 'everysec',
        noAppendFsyncOnRewrite: false,
        autoAofRewritePercentage: 100,
        autoAofRewriteMinSize: '64mb'
      }
    },
    system: {
      logRotation: {
        maxSize: '100M',
        maxFiles: 10,
        compress: true,
        datePattern: 'YYYY-MM-DD'
      },
      kernelParameters: {
        netCoreRmemMax: 134217728,
        netCoreWmemMax: 134217728,
        netIpv4TcpRmem: [4096, 65536, 134217728],
        netIpv4TcpWmem: [4096, 65536, 134217728],
        netIpv4TcpCongestionControl: 'bbr',
        vmSwappiness: 10,
        fsFileMax: 2097152
      },
      processLimits: {
        nofile: 65536,
        nproc: 32768,
        memlock: 'unlimited'
      }
    },
    dataDir: './test-data'
  };

  return { ...defaultConfig, ...overrides };
}

/**
 * Create a complete VersionManagerConfig for testing
 */
export function createTestVersionManagerConfig(
  overrides: Partial<VersionManagerConfig> = {}
): VersionManagerConfig {
  const defaultConfig: VersionManagerConfig = {
    versionsDirectory: './test-versions',
    maxVersions: 5,
    compressionLevel: 6,
    enableEncryption: false,
    encryptionKey: undefined,
    backupDirectory: './test-backups',
    enableBackup: true,
    checksumAlgorithm: 'sha256',
    enableIntegrityCheck: true,
    metadataFile: 'versions.json',
    lockTimeout: 30000,
    enableConcurrentAccess: false
  };

  return { ...defaultConfig, ...overrides };
}

/**
 * Create a complete BackupConfig for testing
 */
export function createTestBackupConfig(
  overrides: Partial<BackupConfig> = {}
): BackupConfig {
  const defaultConfig: BackupConfig = {
    backupDirectory: './test-backups',
    retentionDays: 30,
    compressionLevel: 6,
    enableEncryption: false,
    encryptionKey: undefined,
    maxBackupSize: 1073741824, // 1GB
    enableIntegrityCheck: true,
    checksumAlgorithm: 'sha256',
    enableIncrementalBackup: false,
    excludePatterns: ['*.tmp', '*.log'],
    includePatterns: ['*'],
    enableCloudStorage: false,
    cloudStorageConfig: undefined,
    enableNotifications: false,
    notificationConfig: undefined,
    enableMetrics: true,
    metricsConfig: {
      enableDetailedMetrics: true,
      retentionDays: 7
    }
  };

  return { ...defaultConfig, ...overrides };
}