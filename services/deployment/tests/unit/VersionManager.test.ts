/**
 * Version Manager Unit Tests
 * 
 * Tests the version management functionality including version creation,
 * metadata tracking, and rollback data preparation.
 */

import { VersionManager } from '../../VersionManager';
import * as fs from 'fs/promises';

describe('VersionManager', () => {
  let versionManager: VersionManager;
  const testVersionsDir = './test-versions';
  const testBackupDir = './test-backups';

  beforeEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(testVersionsDir, { recursive: true, force: true });
      await fs.rm(testBackupDir, { recursive: true, force: true });
    } catch {
      // Directories might not exist
    }

    versionManager = new VersionManager({
      maxVersions: 3,
      versionsDirectory: testVersionsDir,
      backupDirectory: testBackupDir,
      compressionEnabled: false,
      encryptionEnabled: false
    });

    await versionManager.initialize();
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(testVersionsDir, { recursive: true, force: true });
      await fs.rm(testBackupDir, { recursive: true, force: true });
    } catch {
      // Directories might not exist
    }
  });

  describe('Initialization', () => {
    it('should initialize and create directories', async () => {
      await expect(fs.access(testVersionsDir)).resolves.not.toThrow();
      await expect(fs.access(testBackupDir)).resolves.not.toThrow();
    });
  });

  describe('Version Creation', () => {
    it('should create a deployment version', async () => {
      const services = [
        {
          name: 'test-service',
          version: '1.0.0',
          buildHash: 'abc123',
          configHash: 'def456',
          dependencies: [],
          healthCheckEndpoint: 'http://localhost:3000/health',
          startupTimeout: 30
        }
      ];

      const version = await versionManager.createVersion(
        'v1.0.0',
        services,
        { deployedBy: 'test-user', deploymentReason: 'Initial deployment' }
      );

      expect(version).toBeDefined();
      expect(version.version).toBe('v1.0.0');
      expect(version.services).toHaveLength(1);
      expect(version.services[0].name).toBe('test-service');
      expect(version.metadata.deployedBy).toBe('test-user');
      expect(version.rollbackData).toBeDefined();
      expect(version.rollbackData.rollbackInstructions).toBeDefined();
      expect(version.rollbackData.rollbackInstructions.length).toBeGreaterThan(0);
    });

    it('should generate unique version IDs', async () => {
      const services = [{
        name: 'test-service',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      const version1 = await versionManager.createVersion('v1.0.0', services);
      const version2 = await versionManager.createVersion('v1.0.1', services);

      expect(version1.id).not.toBe(version2.id);
    });
  });

  describe('Version Retrieval', () => {
    it('should get all versions sorted by timestamp', async () => {
      const services = [{
        name: 'test-service',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      await versionManager.createVersion('v1.0.0', services);
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
      await versionManager.createVersion('v1.0.1', services);

      const versions = versionManager.getAllVersions();
      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe('v1.0.1'); // Newest first
      expect(versions[1].version).toBe('v1.0.0');
    });

    it('should get rollback targets excluding active version', async () => {
      const services = [{
        name: 'test-service',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      const version1 = await versionManager.createVersion('v1.0.0', services);
      const version2 = await versionManager.createVersion('v1.0.1', services);

      await versionManager.activateVersion(version2.id);

      const targets = versionManager.getRollbackTargets();
      expect(targets).toHaveLength(1);
      expect(targets[0].id).toBe(version1.id);
    });
  });

  describe('Version Activation', () => {
    it('should activate a version', async () => {
      const services = [{
        name: 'test-service',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      const version = await versionManager.createVersion('v1.0.0', services);
      await versionManager.activateVersion(version.id);

      const activeVersion = versionManager.getActiveVersion();
      expect(activeVersion).toBeDefined();
      expect(activeVersion!.id).toBe(version.id);
      expect(activeVersion!.status).toBe('active');
    });

    it('should deactivate previous version when activating new one', async () => {
      const services = [{
        name: 'test-service',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      const version1 = await versionManager.createVersion('v1.0.0', services);
      const version2 = await versionManager.createVersion('v1.0.1', services);

      await versionManager.activateVersion(version1.id);
      await versionManager.activateVersion(version2.id);

      const version1Updated = versionManager.getVersion(version1.id);
      const activeVersion = versionManager.getActiveVersion();

      expect(version1Updated!.status).toBe('inactive');
      expect(activeVersion!.id).toBe(version2.id);
    });
  });

  describe('Version Comparison', () => {
    it('should compare two versions and identify differences', async () => {
      const services1 = [{
        name: 'test-service',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      const services2 = [{
        name: 'test-service',
        version: '1.1.0',
        buildHash: 'xyz789',
        configHash: 'uvw012',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      const version1 = await versionManager.createVersion('v1.0.0', services1);
      const version2 = await versionManager.createVersion('v1.1.0', services2);

      const comparison = versionManager.compareVersions(version1.id, version2.id);

      expect(comparison.servicesModified).toHaveLength(1);
      expect(comparison.servicesModified[0].name).toBe('test-service');
      expect(comparison.servicesModified[0].oldVersion).toBe('1.0.0');
      expect(comparison.servicesModified[0].newVersion).toBe('1.1.0');
      expect(comparison.servicesModified[0].configChanged).toBe(true);
    });

    it('should identify added and removed services', async () => {
      const services1 = [{
        name: 'service-a',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      const services2 = [
        {
          name: 'service-a',
          version: '1.0.0',
          buildHash: 'abc123',
          configHash: 'def456',
          dependencies: [],
          healthCheckEndpoint: 'http://localhost:3000/health',
          startupTimeout: 30
        },
        {
          name: 'service-b',
          version: '1.0.0',
          buildHash: 'ghi789',
          configHash: 'jkl012',
          dependencies: [],
          healthCheckEndpoint: 'http://localhost:3001/health',
          startupTimeout: 30
        }
      ];

      const version1 = await versionManager.createVersion('v1.0.0', services1);
      const version2 = await versionManager.createVersion('v1.1.0', services2);

      const comparison = versionManager.compareVersions(version1.id, version2.id);

      expect(comparison.servicesAdded).toContain('service-b');
      expect(comparison.servicesRemoved).toHaveLength(0);
    });
  });

  describe('Service Version History', () => {
    it('should get version history for a specific service', async () => {
      const services1 = [{
        name: 'test-service',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      const services2 = [{
        name: 'test-service',
        version: '1.1.0',
        buildHash: 'xyz789',
        configHash: 'uvw012',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      await versionManager.createVersion('v1.0.0', services1);
      await versionManager.createVersion('v1.1.0', services2);

      const history = versionManager.getServiceVersionHistory('test-service');

      expect(history).toHaveLength(2);
      expect(history[0].serviceVersion).toBe('1.1.0'); // Newest first
      expect(history[1].serviceVersion).toBe('1.0.0');
    });
  });

  describe('Version Archival', () => {
    it('should archive a version', async () => {
      const services = [{
        name: 'test-service',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      const version = await versionManager.createVersion('v1.0.0', services);
      await versionManager.archiveVersion(version.id);

      const archivedVersion = versionManager.getVersion(version.id);
      expect(archivedVersion!.status).toBe('archived');
    });

    it('should not allow archiving active version', async () => {
      const services = [{
        name: 'test-service',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: [],
        healthCheckEndpoint: 'http://localhost:3000/health',
        startupTimeout: 30
      }];

      const version = await versionManager.createVersion('v1.0.0', services);
      await versionManager.activateVersion(version.id);

      await expect(versionManager.archiveVersion(version.id))
        .rejects.toThrow('Cannot archive active version');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid version ID', () => {
      expect(versionManager.getVersion('invalid-id')).toBeUndefined();
    });

    it('should throw error when comparing non-existent versions', () => {
      expect(() => versionManager.compareVersions('invalid-1', 'invalid-2'))
        .toThrow('One or both versions not found');
    });

    it('should throw error when activating non-existent version', async () => {
      await expect(versionManager.activateVersion('invalid-id'))
        .rejects.toThrow('Version not found');
    });
  });
});