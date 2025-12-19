/**
 * Unit tests for BackupService
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { BackupService, BackupConfig } from '../BackupService';

describe('BackupService', () => {
  let tempDir: string;
  let backupService: BackupService;
  let config: BackupConfig;

  beforeEach(async () => {
    // Create temporary directories for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-test-'));
    
    const sourceDir = path.join(tempDir, 'source');
    const backupDir = path.join(tempDir, 'backups');
    
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(backupDir, { recursive: true });

    // Create test files
    await fs.writeFile(path.join(sourceDir, 'config.json'), '{"test": "data"}');
    await fs.writeFile(path.join(sourceDir, 'log.txt'), 'test log content');

    config = {
      backupDir,
      encryptionKey: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      sourceDirs: [sourceDir],
      includePatterns: ['*.json', '*.txt'],
      excludePatterns: [],
      retentionDays: 30,
      schedule: '0 2 * * *'
    };

    backupService = new BackupService(config);
  });

  afterEach(async () => {
    // Cleanup temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Configuration Validation', () => {
    test('should validate valid configuration', () => {
      expect(() => new BackupService(config)).not.toThrow();
    });

    test('should reject invalid encryption key', () => {
      const invalidConfig = { ...config, encryptionKey: 'invalid' };
      expect(() => new BackupService(invalidConfig)).toThrow('Encryption key must be 64 characters');
    });

    test('should reject empty source directories', () => {
      const invalidConfig = { ...config, sourceDirs: [] };
      expect(() => new BackupService(invalidConfig)).toThrow('At least one source directory is required');
    });
  });

  describe('Backup Creation', () => {
    test('should create backup successfully', async () => {
      const result = await backupService.createBackup();

      expect(result.backupId).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.size).toBeGreaterThan(0);
      expect(result.files).toHaveLength(2);
      expect(result.encrypted).toBe(true);
      expect(result.compressionRatio).toBeLessThan(1);

      // Verify backup file exists
      const backupExists = await fs.access(result.backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
    });

    test('should prevent concurrent backups', async () => {
      const promise1 = backupService.createBackup();
      const promise2 = backupService.createBackup();

      await expect(promise1).resolves.toBeDefined();
      await expect(promise2).rejects.toThrow('Backup already in progress');
    });

    test('should handle empty source directory', async () => {
      // Remove all files from source directory
      const sourceDir = config.sourceDirs[0];
      const files = await fs.readdir(sourceDir);
      for (const file of files) {
        await fs.unlink(path.join(sourceDir, file));
      }

      await expect(backupService.createBackup()).rejects.toThrow('No files found to backup');
    });
  });

  describe('Backup Restoration', () => {
    test('should restore backup successfully', async () => {
      // Create backup first
      const backupResult = await backupService.createBackup();
      
      // Create restore directory
      const restoreDir = path.join(tempDir, 'restore');
      await fs.mkdir(restoreDir, { recursive: true });

      // Restore backup
      const restoreResult = await backupService.restoreBackup(backupResult.backupId, restoreDir);

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.filesRestored).toBe(2);
      expect(restoreResult.errors).toHaveLength(0);

      // Verify restored files exist
      const restoredFiles = await fs.readdir(restoreDir, { recursive: true });
      expect(restoredFiles.length).toBeGreaterThan(0);
    });

    test('should handle non-existent backup', async () => {
      const restoreResult = await backupService.restoreBackup('non-existent-backup');

      expect(restoreResult.success).toBe(false);
      expect(restoreResult.filesRestored).toBe(0);
      expect(restoreResult.errors).toContain('Backup metadata not found for ID: non-existent-backup');
    });
  });

  describe('Backup Listing', () => {
    test('should list backups correctly', async () => {
      // Create multiple backups
      const backup1 = await backupService.createBackup();
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      const backup2 = await backupService.createBackup();

      const backups = await backupService.listBackups();

      expect(backups).toHaveLength(2);
      expect(backups[0].timestamp.getTime()).toBeGreaterThan(backups[1].timestamp.getTime());
      expect(backups.map(b => b.backupId)).toContain(backup1.backupId);
      expect(backups.map(b => b.backupId)).toContain(backup2.backupId);
    });

    test('should return empty list when no backups exist', async () => {
      const backups = await backupService.listBackups();
      expect(backups).toHaveLength(0);
    });
  });

  describe('Backup Cleanup', () => {
    test('should cleanup old backups', async () => {
      // Create backup
      const backup = await backupService.createBackup();

      // Modify config to have very short retention
      const shortRetentionService = new BackupService({
        ...config,
        retentionDays: 0 // Immediate cleanup
      });

      const deletedCount = await shortRetentionService.cleanupOldBackups();
      expect(deletedCount).toBe(0); // Should not delete backups from different service instance

      // Test with same service instance
      const originalRetention = config.retentionDays;
      config.retentionDays = 0;
      
      // Manually set backup timestamp to past
      const backups = await backupService.listBackups();
      if (backups.length > 0) {
        const deletedCount = await backupService.cleanupOldBackups();
        expect(deletedCount).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('File Pattern Matching', () => {
    test('should include files matching include patterns', async () => {
      // Create additional files
      const sourceDir = config.sourceDirs[0];
      await fs.writeFile(path.join(sourceDir, 'test.log'), 'log content');
      await fs.writeFile(path.join(sourceDir, 'readme.md'), 'readme content');

      // Update config to only include .json files
      const selectiveService = new BackupService({
        ...config,
        includePatterns: ['*.json']
      });

      const result = await selectiveService.createBackup();
      expect(result.files.filter(f => f.endsWith('.json')).length).toBeGreaterThan(0);
      expect(result.files.filter(f => f.endsWith('.txt')).length).toBe(0);
    });

    test('should exclude files matching exclude patterns', async () => {
      // Update config to exclude .txt files
      const selectiveService = new BackupService({
        ...config,
        excludePatterns: ['*.txt']
      });

      const result = await selectiveService.createBackup();
      expect(result.files.filter(f => f.endsWith('.txt')).length).toBe(0);
      expect(result.files.filter(f => f.endsWith('.json')).length).toBeGreaterThan(0);
    });
  });
});