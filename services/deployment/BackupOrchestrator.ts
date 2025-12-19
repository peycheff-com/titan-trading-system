/**
 * Backup Orchestrator for Titan Production Deployment
 * 
 * Orchestrates all backup-related services including automated backups,
 * multi-location storage, and integrity testing.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import EventEmitter from 'eventemitter3';
import { 
  BackupService, 
  BackupConfig, 
  BackupResult, 
  BackupMetadata,
  getBackupService,
  resetBackupService 
} from './BackupService';
import { 
  BackupScheduler, 
  SchedulerConfig, 
  ScheduledBackupResult,
  getBackupScheduler,
  resetBackupScheduler,
  DEFAULT_SCHEDULER_CONFIG 
} from './BackupScheduler';
import { 
  BackupStorageManager, 
  StorageManagerConfig, 
  StorageLocation, 
  ReplicationStatus,
  CleanupResult,
  getBackupStorageManager,
  resetBackupStorageManager 
} from './BackupStorageManager';
import { 
  BackupIntegrityTester, 
  IntegrityTestConfig, 
  IntegrityTestResult, 
  TestSummary,
  getBackupIntegrityTester,
  resetBackupIntegrityTester,
  DEFAULT_INTEGRITY_TEST_CONFIG 
} from './BackupIntegrityTester';

export interface BackupOrchestratorConfig {
  /** Backup service configuration */
  backup: BackupConfig;
  /** Scheduler configuration */
  scheduler: SchedulerConfig;
  /** Storage manager configuration */
  storage: StorageManagerConfig;
  /** Integrity testing configuration */
  integrityTest: IntegrityTestConfig;
  /** Whether to start services automatically */
  autoStart: boolean;
}

export interface BackupSystemStatus {
  /** Overall system status */
  status: 'running' | 'stopped' | 'error';
  /** Individual service statuses */
  services: {
    backup: 'initialized' | 'error';
    scheduler: 'running' | 'stopped' | 'disabled';
    storage: 'running' | 'stopped';
    integrityTester: 'running' | 'stopped';
  };
  /** Current statistics */
  stats: {
    totalBackups: number;
    lastBackupTime: Date | null;
    nextScheduledBackup: Date | null;
    storageLocations: number;
    lastIntegrityTest: Date | null;
    integrityTestSuccess: number;
  };
}

export interface BackupOperationResult {
  /** Operation type */
  operation: 'backup' | 'restore' | 'cleanup' | 'integrity_test';
  /** Whether operation was successful */
  success: boolean;
  /** Operation timestamp */
  timestamp: Date;
  /** Operation details */
  details: any;
  /** Any errors encountered */
  errors: string[];
}

export class BackupOrchestrator extends EventEmitter {
  private config: BackupOrchestratorConfig;
  private backupService: BackupService;
  private scheduler: BackupScheduler;
  private storageManager: BackupStorageManager;
  private integrityTester: BackupIntegrityTester;
  private isRunning: boolean = false;

  constructor(config: BackupOrchestratorConfig) {
    super();
    this.config = config;
    this.initializeServices();
    this.setupEventHandlers();
  }

  /**
   * Initialize all backup services
   */
  private initializeServices(): void {
    try {
      // Initialize backup service
      this.backupService = getBackupService(this.config.backup);

      // Initialize storage manager
      this.storageManager = getBackupStorageManager(this.config.storage);

      // Initialize scheduler
      this.scheduler = getBackupScheduler(this.config.scheduler, this.backupService);

      // Initialize integrity tester
      this.integrityTester = getBackupIntegrityTester(
        this.config.integrityTest,
        this.backupService,
        this.storageManager
      );

      this.emit('services:initialized');
    } catch (error) {
      this.emit('services:error', { error: error.message });
      throw error;
    }
  }

  /**
   * Setup event handlers for all services
   */
  private setupEventHandlers(): void {
    // Backup service events
    this.backupService.on('backup:started', (data) => {
      this.emit('backup:started', data);
    });

    this.backupService.on('backup:completed', async (result: BackupResult) => {
      this.emit('backup:completed', result);
      
      // Replicate to storage locations
      try {
        const backupData = await this.readBackupFile(result.backupPath);
        const metadata: BackupMetadata = {
          backupId: result.backupId,
          timestamp: result.timestamp,
          size: result.size,
          files: result.files,
          encrypted: result.encrypted,
          compressionRatio: result.compressionRatio,
          checksum: this.calculateChecksum(backupData)
        };

        const replicationStatus = await this.storageManager.storeBackup(
          result.backupId,
          backupData,
          metadata
        );

        this.emit('replication:completed', replicationStatus);
      } catch (error) {
        this.emit('replication:failed', { 
          backupId: result.backupId, 
          error: error.message 
        });
      }
    });

    this.backupService.on('backup:failed', (data) => {
      this.emit('backup:failed', data);
    });

    // Scheduler events
    this.scheduler.on('scheduler:started', (data) => {
      this.emit('scheduler:started', data);
    });

    this.scheduler.on('backup:scheduled', (data) => {
      this.emit('backup:scheduled', data);
    });

    this.scheduler.on('backup:completed', (result: ScheduledBackupResult) => {
      this.emit('scheduled_backup:completed', result);
    });

    // Storage manager events
    this.storageManager.on('replication:completed', (status: ReplicationStatus) => {
      this.emit('storage:replication_completed', status);
    });

    this.storageManager.on('cleanup:completed', (result) => {
      this.emit('storage:cleanup_completed', result);
    });

    // Integrity tester events
    this.integrityTester.on('test:completed', (result: IntegrityTestResult) => {
      this.emit('integrity:test_completed', result);
    });

    this.integrityTester.on('tests:completed', (summary) => {
      this.emit('integrity:tests_completed', summary);
    });
  }

  /**
   * Start all backup services
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    try {
      this.emit('orchestrator:starting');

      // Start storage manager first
      this.storageManager.start();

      // Start scheduler
      this.scheduler.start();

      // Start integrity tester
      this.integrityTester.start();

      this.isRunning = true;
      this.emit('orchestrator:started');

    } catch (error) {
      this.emit('orchestrator:error', { error: error.message });
      throw error;
    }
  }

  /**
   * Stop all backup services
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.emit('orchestrator:stopping');

      // Stop services in reverse order
      this.integrityTester.stop();
      this.scheduler.stop();
      this.storageManager.stop();

      this.isRunning = false;
      this.emit('orchestrator:stopped');

    } catch (error) {
      this.emit('orchestrator:error', { error: error.message });
      throw error;
    }
  }

  /**
   * Create immediate backup
   */
  async createBackup(): Promise<BackupOperationResult> {
    const timestamp = new Date();
    
    try {
      this.emit('operation:started', { operation: 'backup', timestamp });

      const result = await this.backupService.createBackup();
      
      return {
        operation: 'backup',
        success: true,
        timestamp,
        details: result,
        errors: []
      };

    } catch (error) {
      return {
        operation: 'backup',
        success: false,
        timestamp,
        details: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Restore backup by ID
   */
  async restoreBackup(backupId: string, targetDir?: string): Promise<BackupOperationResult> {
    const timestamp = new Date();
    
    try {
      this.emit('operation:started', { operation: 'restore', timestamp, backupId });

      const result = await this.backupService.restoreBackup(backupId, targetDir);
      
      return {
        operation: 'restore',
        success: result.success,
        timestamp,
        details: result,
        errors: result.errors
      };

    } catch (error) {
      return {
        operation: 'restore',
        success: false,
        timestamp,
        details: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Perform cleanup across all storage locations
   */
  async performCleanup(): Promise<BackupOperationResult> {
    const timestamp = new Date();
    
    try {
      this.emit('operation:started', { operation: 'cleanup', timestamp });

      const results = await this.storageManager.performCleanup();
      
      // Also cleanup local backups
      const localCleanupCount = await this.backupService.cleanupOldBackups();
      
      return {
        operation: 'cleanup',
        success: true,
        timestamp,
        details: {
          storageResults: results,
          localCleanupCount
        },
        errors: []
      };

    } catch (error) {
      return {
        operation: 'cleanup',
        success: false,
        timestamp,
        details: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Run integrity tests
   */
  async runIntegrityTests(): Promise<BackupOperationResult> {
    const timestamp = new Date();
    
    try {
      this.emit('operation:started', { operation: 'integrity_test', timestamp });

      const results = await this.integrityTester.runTests();
      
      return {
        operation: 'integrity_test',
        success: results.every(r => r.passed),
        timestamp,
        details: results,
        errors: results.flatMap(r => r.errors)
      };

    } catch (error) {
      return {
        operation: 'integrity_test',
        success: false,
        timestamp,
        details: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus(): Promise<BackupSystemStatus> {
    try {
      const backups = await this.backupService.listBackups();
      const schedulerStatus = this.scheduler.getStatus();
      const testSummary = this.integrityTester.getTestSummary();

      return {
        status: this.isRunning ? 'running' : 'stopped',
        services: {
          backup: 'initialized',
          scheduler: schedulerStatus.isRunning ? 'running' : 'stopped',
          storage: this.isRunning ? 'running' : 'stopped',
          integrityTester: this.isRunning ? 'running' : 'stopped'
        },
        stats: {
          totalBackups: backups.length,
          lastBackupTime: backups.length > 0 ? backups[0].timestamp : null,
          nextScheduledBackup: schedulerStatus.nextBackupTime,
          storageLocations: this.config.storage.locations.filter(l => l.enabled).length,
          lastIntegrityTest: testSummary.lastTestTime,
          integrityTestSuccess: testSummary.testsPassed
        }
      };

    } catch (error) {
      return {
        status: 'error',
        services: {
          backup: 'error',
          scheduler: 'stopped',
          storage: 'stopped',
          integrityTester: 'stopped'
        },
        stats: {
          totalBackups: 0,
          lastBackupTime: null,
          nextScheduledBackup: null,
          storageLocations: 0,
          lastIntegrityTest: null,
          integrityTestSuccess: 0
        }
      };
    }
  }

  /**
   * List all available backups
   */
  async listBackups(): Promise<BackupMetadata[]> {
    return await this.backupService.listBackups();
  }

  /**
   * Get integrity test summary
   */
  getIntegrityTestSummary(): TestSummary {
    return this.integrityTester.getTestSummary();
  }

  /**
   * Update configuration
   */
  async updateConfiguration(newConfig: Partial<BackupOrchestratorConfig>): Promise<void> {
    // For now, configuration updates require restart
    // In a production system, you might implement hot-reload for some settings
    
    if (this.isRunning) {
      await this.stop();
    }

    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize services with new config
    this.resetServices();
    this.initializeServices();
    this.setupEventHandlers();

    if (newConfig.autoStart !== false) {
      await this.start();
    }

    this.emit('configuration:updated', newConfig);
  }

  /**
   * Reset all services (for configuration updates)
   */
  private resetServices(): void {
    resetBackupService();
    resetBackupScheduler();
    resetBackupStorageManager();
    resetBackupIntegrityTester();
  }

  /**
   * Read backup file for replication
   */
  private async readBackupFile(filePath: string): Promise<Buffer> {
    const fs = await import('fs/promises');
    return await fs.readFile(filePath);
  }

  /**
   * Calculate checksum for backup data
   */
  private calculateChecksum(data: Buffer): string {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

// Default configuration
export const DEFAULT_BACKUP_ORCHESTRATOR_CONFIG: Partial<BackupOrchestratorConfig> = {
  scheduler: DEFAULT_SCHEDULER_CONFIG,
  integrityTest: DEFAULT_INTEGRITY_TEST_CONFIG,
  autoStart: true
};

// Singleton instance
let orchestratorInstance: BackupOrchestrator | null = null;

/**
 * Get or create BackupOrchestrator instance
 */
export function getBackupOrchestrator(config?: BackupOrchestratorConfig): BackupOrchestrator {
  if (!orchestratorInstance && config) {
    orchestratorInstance = new BackupOrchestrator(config);
  }
  
  if (!orchestratorInstance) {
    throw new Error('BackupOrchestrator not initialized. Provide config on first call.');
  }
  
  return orchestratorInstance;
}

/**
 * Reset BackupOrchestrator instance (for testing)
 */
export function resetBackupOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.stop();
    orchestratorInstance = null;
  }
}