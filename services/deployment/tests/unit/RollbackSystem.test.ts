/**
 * Rollback System Unit Tests
 * 
 * Tests the integrated rollback system functionality including version management,
 * orchestration, and performance optimization.
 */

import { RollbackSystem, getRollbackSystem, resetRollbackSystem } from '../../RollbackSystem';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock external dependencies
jest.mock('../../PM2Manager');
jest.mock('../../DeploymentValidator');

describe('RollbackSystem', () => {
  let rollbackSystem: RollbackSystem;
  const testVersionsDir = './test-deployment/versions';
  const testBackupDir = './test-deployment/backups';

  beforeEach(async () => {
    // Reset singleton
    resetRollbackSystem();
    
    // Clean up test directories
    try {
      await fs.rm('./test-deployment', { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }

    // Create rollback system with test configuration
    rollbackSystem = getRollbackSystem({
      versionManager: {
        maxVersions: 3,
        versionsDirectory: testVersionsDir,
        backupDirectory: testBackupDir
      },
      orchestrator: {
        maxRollbackTime: 60,
        gracefulShutdownTimeout: 10,
        validationTimeout: 10,
        parallelOperations: true
      },
      optimizer: {
        maxParallelOperations: 2,
        useIncrementalBackup: true,
        preloadCriticalServices: false,
        enableProgressiveRestart: true
      }
    });

    await rollbackSystem.initialize();
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm('./test-deployment', { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
    
    resetRollbackSystem();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      const status = await rollbackSystem.getSystemStatus();
      expect(status.initialized).toBe(true);
    });

    it('should create required directories', async () => {
      await expect(fs.access(testVersionsDir)).resolves.not.toThrow();
      await expect(fs.access(testBackupDir)).resolves.not.toThrow();
    });
  });

  describe('Version Management', () => {
    it('should create a deployment version', async () => {
      const services = [
        {
          name: 'titan-brain',
          version: '1.0.0',
          buildHash: 'abc123',
          configHash: 'def456',
          dependencies: ['shared']
        },
        {
          name: 'shared',
          version: '1.0.0',
          buildHash: 'ghi789',
          configHash: 'jkl012',
          dependencies: []
        }
      ];

      const version = await rollbackSystem.createDeploymentVersion(
        'v1.0.0',
        services,
        { deployedBy: 'test', deploymentReason: 'Initial deployment' }
      );

      expect(version).toBeDefined();
      expect(version.version).toBe('v1.0.0');
      expect(version.services).toHaveLength(2);
      expect(version.rollbackData).toBeDefined();
      expect(version.rollbackData.rollbackInstructions).toBeDefined();
    });

    it('should get version history', async () => {
      // Create a test version
      await rollbackSystem.createDeploymentVersion(
        'v1.0.0',
        [{
          name: 'test-service',
          version: '1.0.0',
          buildHash: 'abc123',
          configHash: 'def456',
          dependencies: []
        }]
      );

      const history = rollbackSystem.getVersionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].version).toBe('v1.0.0');
      expect(history[0].services).toBe(1);
    });
  });

  describe('Rollback Analysis', () => {
    it('should analyze rollback feasibility', async () => {
      // Create two versions
      const version1 = await rollbackSystem.createDeploymentVersion(
        'v1.0.0',
        [{
          name: 'test-service',
          version: '1.0.0',
          buildHash: 'abc123',
          configHash: 'def456',
          dependencies: []
        }]
      );

      const version2 = await rollbackSystem.createDeploymentVersion(
        'v1.1.0',
        [{
          name: 'test-service',
          version: '1.1.0',
          buildHash: 'xyz789',
          configHash: 'uvw012',
          dependencies: []
        }]
      );

      const analysis = await rollbackSystem.analyzeRollback(version1.id);
      
      expect(analysis).toBeDefined();
      expect(typeof analysis.feasible).toBe('boolean');
      expect(typeof analysis.estimatedDuration).toBe('number');
      expect(Array.isArray(analysis.risks)).toBe(true);
      expect(Array.isArray(analysis.blockers)).toBe(true);
      expect(Array.isArray(analysis.steps)).toBe(true);
    });

    it('should get rollback targets with analysis', async () => {
      // Create multiple versions
      await rollbackSystem.createDeploymentVersion('v1.0.0', [{
        name: 'test-service',
        version: '1.0.0',
        buildHash: 'abc123',
        configHash: 'def456',
        dependencies: []
      }]);

      await rollbackSystem.createDeploymentVersion('v1.1.0', [{
        name: 'test-service',
        version: '1.1.0',
        buildHash: 'xyz789',
        configHash: 'uvw012',
        dependencies: []
      }]);

      const targets = await rollbackSystem.getRollbackTargets();
      
      expect(targets).toHaveLength(1); // One target (excluding active version)
      expect(targets[0]).toHaveProperty('versionId');
      expect(targets[0]).toHaveProperty('estimatedDuration');
      expect(targets[0]).toHaveProperty('risks');
    });
  });

  describe('Version Comparison', () => {
    it('should compare two versions', async () => {
      const version1 = await rollbackSystem.createDeploymentVersion(
        'v1.0.0',
        [{
          name: 'test-service',
          version: '1.0.0',
          buildHash: 'abc123',
          configHash: 'def456',
          dependencies: []
        }]
      );

      const version2 = await rollbackSystem.createDeploymentVersion(
        'v1.1.0',
        [{
          name: 'test-service',
          version: '1.1.0',
          buildHash: 'xyz789',
          configHash: 'uvw012',
          dependencies: []
        }]
      );

      const comparison = rollbackSystem.compareVersions(version1.id, version2.id);
      
      expect(comparison).toBeDefined();
      expect(comparison.servicesModified).toHaveLength(1);
      expect(comparison.servicesModified[0].name).toBe('test-service');
      expect(comparison.servicesModified[0].oldVersion).toBe('1.0.0');
      expect(comparison.servicesModified[0].newVersion).toBe('1.1.0');
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const newConfig = {
        orchestrator: {
          maxRollbackTime: 180,
          gracefulShutdownTimeout: 20,
          validationTimeout: 15,
          parallelOperations: false
        }
      };

      rollbackSystem.updateConfig(newConfig);
      
      const currentConfig = rollbackSystem.getConfig();
      expect(currentConfig.orchestrator.maxRollbackTime).toBe(180);
      expect(currentConfig.orchestrator.gracefulShutdownTimeout).toBe(20);
      expect(currentConfig.orchestrator.parallelOperations).toBe(false);
    });

    it('should get current configuration', () => {
      const config = rollbackSystem.getConfig();
      
      expect(config).toBeDefined();
      expect(config.versionManager).toBeDefined();
      expect(config.orchestrator).toBeDefined();
      expect(config.optimizer).toBeDefined();
    });
  });

  describe('System Status', () => {
    it('should get system status', async () => {
      const status = await rollbackSystem.getSystemStatus();
      
      expect(status).toBeDefined();
      expect(status.initialized).toBe(true);
      expect(status.rollbackInProgress).toBe(false);
      expect(typeof status.availableTargets).toBe('number');
      expect(['healthy', 'degraded', 'critical']).toContain(status.systemHealth);
    });
  });

  describe('Performance Metrics', () => {
    it('should get and clear performance metrics', () => {
      const metrics = rollbackSystem.getPerformanceMetrics();
      expect(Array.isArray(metrics)).toBe(true);
      
      rollbackSystem.clearPerformanceMetrics();
      const clearedMetrics = rollbackSystem.getPerformanceMetrics();
      expect(clearedMetrics).toHaveLength(0);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = getRollbackSystem();
      const instance2 = getRollbackSystem();
      
      expect(instance1).toBe(instance2);
    });

    it('should reset singleton', () => {
      const instance1 = getRollbackSystem();
      resetRollbackSystem();
      const instance2 = getRollbackSystem();
      
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid version ID in analysis', async () => {
      await expect(rollbackSystem.analyzeRollback('invalid-id'))
        .rejects.toThrow('Target version not found');
    });

    it('should handle invalid version ID in comparison', () => {
      expect(() => rollbackSystem.compareVersions('invalid-1', 'invalid-2'))
        .toThrow('One or both versions not found');
    });
  });
});