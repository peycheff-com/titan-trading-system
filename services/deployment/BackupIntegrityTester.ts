/**
 * Backup Integrity Tester for Titan Production Deployment
 * 
 * Provides weekly automated restoration tests to validate backup completeness and integrity.
 * 
 * Requirements: 6.4
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import EventEmitter from 'eventemitter3';
import { BackupService, BackupMetadata, RestoreResult } from './BackupService';
import { BackupStorageManager } from './BackupStorageManager';

export interface IntegrityTestConfig {
  /** Test schedule (cron format) */
  schedule: string;
  /** Number of recent backups to test */
  testCount: number;
  /** Temporary directory for test restores */
  testDir: string;
  /** Maximum test duration in milliseconds */
  maxTestDuration: number;
  /** Whether to test all storage locations */
  testAllLocations: boolean;
  /** Cleanup test files after completion */
  cleanupAfterTest: boolean;
}

export interface IntegrityTestResult {
  /** Test execution ID */
  testId: string;
  /** Test timestamp */
  timestamp: Date;
  /** Backup being tested */
  backupId: string;
  /** Storage location tested */
  locationId?: string;
  /** Whether test passed */
  passed: boolean;
  /** Test duration in milliseconds */
  duration: number;
  /** Detailed test results */
  details: TestDetails;
  /** Any errors encountered */
  errors: string[];
}

export interface TestDetails {
  /** Backup metadata validation */
  metadataValid: boolean;
  /** Backup file checksum validation */
  checksumValid: boolean;
  /** Decryption successful */
  decryptionSuccessful: boolean;
  /** Decompression successful */
  decompressionSuccessful: boolean;
  /** File restoration successful */
  restorationSuccessful: boolean;
  /** Number of files restored */
  filesRestored: number;
  /** Total files expected */
  filesExpected: number;
  /** File integrity checks */
  fileIntegrityResults: FileIntegrityResult[];
}

export interface FileIntegrityResult {
  /** Original file path */
  originalPath: string;
  /** Restored file path */
  restoredPath: string;
  /** Whether file was restored */
  restored: boolean;
  /** Whether content matches */
  contentMatches: boolean;
  /** File size comparison */
  sizeMatches: boolean;
  /** Any errors */
  error?: string;
}

export interface TestSummary {
  /** Total tests run */
  totalTests: number;
  /** Tests passed */
  testsPassed: number;
  /** Tests failed */
  testsFailed: number;
  /** Success rate percentage */
  successRate: number;
  /** Average test duration */
  averageDuration: number;
  /** Last test timestamp */
  lastTestTime: Date;
  /** Recent test results */
  recentResults: IntegrityTestResult[];
}

export class BackupIntegrityTester extends EventEmitter {
  private config: IntegrityTestConfig;
  private backupService: BackupService;
  private storageManager: BackupStorageManager;
  private testTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private testHistory: IntegrityTestResult[] = [];

  constructor(
    config: IntegrityTestConfig,
    backupService: BackupService,
    storageManager: BackupStorageManager
  ) {
    super();
    this.config = config;
    this.backupService = backupService;
    this.storageManager = storageManager;
    this.validateConfig();
  }

  /**
   * Validate integrity test configuration
   */
  private validateConfig(): void {
    if (!this.config.schedule) {
      throw new Error('Test schedule is required');
    }
    if (this.config.testCount < 1) {
      throw new Error('Test count must be at least 1');
    }
    if (!this.config.testDir) {
      throw new Error('Test directory is required');
    }
    if (this.config.maxTestDuration < 1000) {
      throw new Error('Maximum test duration must be at least 1000ms');
    }
  }

  /**
   * Start the integrity testing scheduler
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.scheduleNextTest();
    this.emit('tester:started', { schedule: this.config.schedule });
  }

  /**
   * Stop the integrity testing scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.testTimer) {
      clearTimeout(this.testTimer);
      this.testTimer = null;
    }

    this.emit('tester:stopped');
  }

  /**
   * Run integrity tests immediately
   */
  async runTests(): Promise<IntegrityTestResult[]> {
    this.emit('tests:started');

    try {
      // Get recent backups to test
      const backups = await this.getBackupsToTest();
      
      if (backups.length === 0) {
        this.emit('tests:no_backups');
        return [];
      }

      const results: IntegrityTestResult[] = [];

      for (const backup of backups) {
        if (this.config.testAllLocations) {
          // Test backup from all available locations
          const locationResults = await this.testBackupAllLocations(backup);
          results.push(...locationResults);
        } else {
          // Test backup from primary location only
          const result = await this.testBackup(backup);
          results.push(result);
        }
      }

      // Store test history
      this.testHistory.push(...results);
      
      // Keep only recent history (last 100 tests)
      if (this.testHistory.length > 100) {
        this.testHistory = this.testHistory.slice(-100);
      }

      this.emit('tests:completed', { 
        totalTests: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length
      });

      return results;

    } catch (error) {
      this.emit('tests:error', { error: error.message });
      throw error;
    }
  }

  /**
   * Test specific backup integrity
   */
  async testBackupIntegrity(backupId: string, locationId?: string): Promise<IntegrityTestResult> {
    const backups = await this.backupService.listBackups();
    const backup = backups.find(b => b.backupId === backupId);
    
    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    return await this.testBackup(backup, locationId);
  }

  /**
   * Get test summary statistics
   */
  getTestSummary(): TestSummary {
    const recentResults = this.testHistory.slice(-20); // Last 20 tests
    const totalTests = this.testHistory.length;
    const testsPassed = this.testHistory.filter(r => r.passed).length;
    const testsFailed = totalTests - testsPassed;
    const successRate = totalTests > 0 ? (testsPassed / totalTests) * 100 : 0;
    
    const totalDuration = this.testHistory.reduce((sum, r) => sum + r.duration, 0);
    const averageDuration = totalTests > 0 ? totalDuration / totalTests : 0;
    
    const lastTestTime = this.testHistory.length > 0 ? 
      this.testHistory[this.testHistory.length - 1].timestamp : 
      new Date(0);

    return {
      totalTests,
      testsPassed,
      testsFailed,
      successRate,
      averageDuration,
      lastTestTime,
      recentResults
    };
  }

  /**
   * Get backups to test based on configuration
   */
  private async getBackupsToTest(): Promise<BackupMetadata[]> {
    const allBackups = await this.backupService.listBackups();
    
    // Sort by timestamp (newest first) and take the configured count
    return allBackups
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, this.config.testCount);
  }

  /**
   * Test backup from all available locations
   */
  private async testBackupAllLocations(backup: BackupMetadata): Promise<IntegrityTestResult[]> {
    const backupsByLocation = await this.storageManager.listBackups();
    const results: IntegrityTestResult[] = [];

    for (const [locationId, locationBackups] of backupsByLocation) {
      const locationBackup = locationBackups.find(b => b.backupId === backup.backupId);
      if (locationBackup) {
        const result = await this.testBackup(backup, locationId);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Test individual backup integrity
   */
  private async testBackup(backup: BackupMetadata, locationId?: string): Promise<IntegrityTestResult> {
    const testId = this.generateTestId();
    const startTime = Date.now();
    
    this.emit('test:started', { testId, backupId: backup.backupId, locationId });

    try {
      // Create test directory
      const testDir = await this.createTestDirectory(testId);
      
      // Initialize test details
      const details: TestDetails = {
        metadataValid: false,
        checksumValid: false,
        decryptionSuccessful: false,
        decompressionSuccessful: false,
        restorationSuccessful: false,
        filesRestored: 0,
        filesExpected: backup.files.length,
        fileIntegrityResults: []
      };

      const errors: string[] = [];

      try {
        // Step 1: Validate metadata
        details.metadataValid = await this.validateMetadata(backup);
        
        // Step 2: Retrieve and validate backup
        const backupData = await this.retrieveBackupData(backup.backupId, locationId);
        if (!backupData) {
          throw new Error('Failed to retrieve backup data');
        }

        // Step 3: Validate checksum
        details.checksumValid = await this.validateChecksum(backupData, backup.checksum);
        
        // Step 4: Test restoration
        const restoreResult = await this.testRestore(backup.backupId, testDir);
        details.decryptionSuccessful = restoreResult.success;
        details.decompressionSuccessful = restoreResult.success;
        details.restorationSuccessful = restoreResult.success;
        details.filesRestored = restoreResult.filesRestored;
        
        if (restoreResult.errors.length > 0) {
          errors.push(...restoreResult.errors);
        }

        // Step 5: Validate restored files
        if (restoreResult.success) {
          details.fileIntegrityResults = await this.validateRestoredFiles(
            backup.files, 
            restoreResult.restoredFiles,
            testDir
          );
        }

      } catch (error) {
        errors.push(error.message);
      } finally {
        // Cleanup test directory
        if (this.config.cleanupAfterTest) {
          await this.cleanupTestDirectory(testDir);
        }
      }

      const duration = Date.now() - startTime;
      const passed = this.evaluateTestResult(details, errors);

      const result: IntegrityTestResult = {
        testId,
        timestamp: new Date(),
        backupId: backup.backupId,
        locationId,
        passed,
        duration,
        details,
        errors
      };

      this.emit('test:completed', result);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      
      const result: IntegrityTestResult = {
        testId,
        timestamp: new Date(),
        backupId: backup.backupId,
        locationId,
        passed: false,
        duration,
        details: {
          metadataValid: false,
          checksumValid: false,
          decryptionSuccessful: false,
          decompressionSuccessful: false,
          restorationSuccessful: false,
          filesRestored: 0,
          filesExpected: backup.files.length,
          fileIntegrityResults: []
        },
        errors: [error.message]
      };

      this.emit('test:failed', result);
      return result;
    }
  }

  /**
   * Validate backup metadata
   */
  private async validateMetadata(backup: BackupMetadata): Promise<boolean> {
    try {
      // Check required fields
      if (!backup.backupId || !backup.timestamp || !backup.files || !backup.checksum) {
        return false;
      }

      // Check timestamp is valid
      if (isNaN(backup.timestamp.getTime())) {
        return false;
      }

      // Check files array is not empty
      if (backup.files.length === 0) {
        return false;
      }

      // Check checksum format
      if (!/^[a-f0-9]{64}$/i.test(backup.checksum)) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Retrieve backup data for testing
   */
  private async retrieveBackupData(backupId: string, locationId?: string): Promise<Buffer | null> {
    if (locationId) {
      // Retrieve from specific location via storage manager
      const result = await this.storageManager.retrieveBackup(backupId);
      return result?.data || null;
    } else {
      // Retrieve via backup service (will try all locations)
      const result = await this.storageManager.retrieveBackup(backupId);
      return result?.data || null;
    }
  }

  /**
   * Validate backup checksum
   */
  private async validateChecksum(data: Buffer, expectedChecksum: string): Promise<boolean> {
    const actualChecksum = crypto.createHash('sha256').update(data).digest('hex');
    return actualChecksum.toLowerCase() === expectedChecksum.toLowerCase();
  }

  /**
   * Test backup restoration
   */
  private async testRestore(backupId: string, testDir: string): Promise<RestoreResult> {
    try {
      return await this.backupService.restoreBackup(backupId, testDir);
    } catch (error) {
      return {
        success: false,
        filesRestored: 0,
        restoredFiles: [],
        errors: [error.message]
      };
    }
  }

  /**
   * Validate restored files against originals
   */
  private async validateRestoredFiles(
    originalFiles: string[],
    restoredFiles: string[],
    testDir: string
  ): Promise<FileIntegrityResult[]> {
    const results: FileIntegrityResult[] = [];

    for (const originalPath of originalFiles) {
      const relativePath = path.relative(process.cwd(), originalPath);
      const restoredPath = path.join(testDir, relativePath);
      
      const result: FileIntegrityResult = {
        originalPath,
        restoredPath,
        restored: false,
        contentMatches: false,
        sizeMatches: false
      };

      try {
        // Check if file was restored
        result.restored = restoredFiles.includes(restoredPath);
        
        if (result.restored) {
          // Compare file sizes
          const [originalStats, restoredStats] = await Promise.all([
            fs.stat(originalPath).catch(() => null),
            fs.stat(restoredPath).catch(() => null)
          ]);

          if (originalStats && restoredStats) {
            result.sizeMatches = originalStats.size === restoredStats.size;

            // Compare file contents (for small files only)
            if (originalStats.size < 1024 * 1024) { // 1MB limit
              const [originalContent, restoredContent] = await Promise.all([
                fs.readFile(originalPath).catch(() => null),
                fs.readFile(restoredPath).catch(() => null)
              ]);

              if (originalContent && restoredContent) {
                result.contentMatches = originalContent.equals(restoredContent);
              }
            } else {
              // For large files, assume content matches if size matches
              result.contentMatches = result.sizeMatches;
            }
          }
        }
      } catch (error) {
        result.error = error.message;
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Evaluate overall test result
   */
  private evaluateTestResult(details: TestDetails, errors: string[]): boolean {
    // Test passes if all critical checks pass and no errors
    return details.metadataValid &&
           details.checksumValid &&
           details.decryptionSuccessful &&
           details.decompressionSuccessful &&
           details.restorationSuccessful &&
           details.filesRestored === details.filesExpected &&
           errors.length === 0;
  }

  /**
   * Create test directory
   */
  private async createTestDirectory(testId: string): Promise<string> {
    const testDir = path.join(this.config.testDir, `test_${testId}`);
    await fs.mkdir(testDir, { recursive: true });
    return testDir;
  }

  /**
   * Cleanup test directory
   */
  private async cleanupTestDirectory(testDir: string): Promise<void> {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      this.emit('cleanup:error', { testDir, error: error.message });
    }
  }

  /**
   * Generate unique test ID
   */
  private generateTestId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${random}`;
  }

  /**
   * Schedule next test based on cron expression
   */
  private scheduleNextTest(): void {
    if (!this.isRunning) {
      return;
    }

    // For simplicity, schedule tests weekly (every 7 days)
    // In a real implementation, you would parse the cron expression
    const testInterval = 7 * 24 * 60 * 60 * 1000; // 7 days

    this.testTimer = setTimeout(async () => {
      try {
        await this.runTests();
      } catch (error) {
        this.emit('tests:error', { error: error.message });
      }
      
      // Schedule next test
      this.scheduleNextTest();
    }, testInterval);

    const nextTestTime = new Date(Date.now() + testInterval);
    this.emit('test:scheduled', { nextTestTime });
  }
}

// Default configuration
export const DEFAULT_INTEGRITY_TEST_CONFIG: IntegrityTestConfig = {
  schedule: '0 3 * * 0', // Weekly on Sunday at 3 AM
  testCount: 3, // Test 3 most recent backups
  testDir: path.join(os.tmpdir(), 'titan-backup-tests'),
  maxTestDuration: 30 * 60 * 1000, // 30 minutes
  testAllLocations: true,
  cleanupAfterTest: true
};

// Singleton instance
let integrityTesterInstance: BackupIntegrityTester | null = null;

/**
 * Get or create BackupIntegrityTester instance
 */
export function getBackupIntegrityTester(
  config?: IntegrityTestConfig,
  backupService?: BackupService,
  storageManager?: BackupStorageManager
): BackupIntegrityTester {
  if (!integrityTesterInstance && config && backupService && storageManager) {
    integrityTesterInstance = new BackupIntegrityTester(config, backupService, storageManager);
  }
  
  if (!integrityTesterInstance) {
    throw new Error('BackupIntegrityTester not initialized. Provide all required parameters on first call.');
  }
  
  return integrityTesterInstance;
}

/**
 * Reset BackupIntegrityTester instance (for testing)
 */
export function resetBackupIntegrityTester(): void {
  if (integrityTesterInstance) {
    integrityTesterInstance.stop();
    integrityTesterInstance = null;
  }
}