/**
 * Deployment Pipeline Integration Tests
 * 
 * Tests complete deployment flow from start to finish, rollback scenarios,
 * and recovery procedures.
 * 
 * Requirements: 2.1, 2.2, 2.3, 8.2, 8.3, 8.4
 */

import { DeploymentOrchestrator, DeploymentResult } from '../../DeploymentOrchestrator';
import { DeploymentValidator, ValidationResult } from '../../DeploymentValidator';
import { RollbackOrchestrator, RollbackResult } from '../../RollbackOrchestrator';
import { VersionManager } from '../../VersionManager';
import { PM2Manager } from '../../PM2Manager';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Deployment Pipeline Integration Tests', () => {
  let deploymentOrchestrator: DeploymentOrchestrator;
  let deploymentValidator: DeploymentValidator;
  let rollbackOrchestrator: RollbackOrchestrator;
  let versionManager: VersionManager;
  let pm2Manager: PM2Manager;
  let testWorkspace: string;

  beforeAll(async () => {
    // Create test workspace
    testWorkspace = path.join(__dirname, '../../test-workspace');
    await fs.mkdir(testWorkspace, { recursive: true });

    // Initialize components
    versionManager = new VersionManager(path.join(testWorkspace, 'versions'));
    pm2Manager = new PM2Manager();
    deploymentValidator = new DeploymentValidator();
    deploymentOrchestrator = new DeploymentOrchestrator();
    rollbackOrchestrator = new RollbackOrchestrator(
      versionManager,
      pm2Manager,
      deploymentValidator
    );
  });

  afterAll(async () => {
    // Cleanup test workspace
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup test workspace:', error);
    }
  });

  describe('Complete Deployment Flow', () => {
    /**
     * Test complete deployment flow from start to finish
     * Requirements: 2.1, 2.2, 2.3 - Service deployment ordering and validation
     */
    it('should deploy all services in correct dependency order', async () => {
      // Mock service directories
      await createMockServiceDirectories();

      // Start deployment
      const deploymentResult: DeploymentResult = await deploymentOrchestrator.deployAll();

      // Verify deployment success
      expect(deploymentResult.success).toBe(true);
      expect(deploymentResult.deployedServices).toHaveLength(7); // All services
      expect(deploymentResult.failedServices).toHaveLength(0);
      expect(deploymentResult.totalTime).toBeGreaterThan(0);

      // Verify dependency order (shared -> security -> brain -> execution -> phases)
      const expectedOrder = [
        'shared',
        'security', 
        'titan-brain',
        'titan-execution',
        'titan-phase1-scavenger',
        'titan-ai-quant',
        'titan-console'
      ];

      expect(deploymentResult.deployedServices).toEqual(expectedOrder);

      // Verify all services are running
      const serviceStatuses = deploymentOrchestrator.getServiceStatuses();
      expect(serviceStatuses).toHaveLength(7);
      
      for (const status of serviceStatuses) {
        expect(status.status).toBe('running');
        expect(status.healthStatus).toBe('healthy');
        expect(status.pid).toBeGreaterThan(0);
      }
    }, 60000); // 60 second timeout for full deployment

    /**
     * Test deployment validation within 30 seconds
     * Requirements: 2.3 - Service validation within timeout
     */
    it('should validate all services within 30 seconds', async () => {
      const startTime = Date.now();
      
      // Run deployment validation
      const validationResult: ValidationResult = await deploymentValidator.validateDeployment();
      
      const validationTime = Date.now() - startTime;

      // Verify validation completed within 30 seconds
      expect(validationTime).toBeLessThan(30000);
      expect(validationResult.success).toBe(true);
      expect(validationResult.duration).toBeLessThan(30000);

      // Verify all services validated successfully
      expect(validationResult.results.services).toHaveLength(7);
      for (const serviceResult of validationResult.results.services) {
        expect(serviceResult.success).toBe(true);
        expect(serviceResult.responseTime).toBeLessThan(5000); // Individual service < 5s
      }

      // Verify Redis connectivity
      expect(validationResult.results.redis.success).toBe(true);
      expect(validationResult.results.redis.pubSubWorking).toBe(true);

      // Verify WebSocket connections
      expect(validationResult.results.websockets.length).toBeGreaterThan(0);
      for (const wsResult of validationResult.results.websockets) {
        expect(wsResult.success).toBe(true);
        expect(wsResult.connectionEstablished).toBe(true);
      }
    }, 35000);

    /**
     * Test deployment failure handling
     * Requirements: 2.1, 2.2 - Proper error handling and rollback
     */
    it('should handle deployment failures gracefully', async () => {
      // Create a service that will fail to start
      await createFailingService('failing-service');

      // Attempt deployment (should fail)
      const deploymentResult = await deploymentOrchestrator.deployAll();

      // Verify deployment failed appropriately
      expect(deploymentResult.success).toBe(false);
      expect(deploymentResult.errors.length).toBeGreaterThan(0);
      expect(deploymentResult.failedServices).toContain('failing-service');

      // Verify error details
      const error = deploymentResult.errors[0];
      expect(error.service).toBe('failing-service');
      expect(error.error).toBeDefined();
      expect(error.timestamp).toBeInstanceOf(Date);

      // Verify partial deployment stopped
      expect(deploymentResult.deployedServices.length).toBeLessThan(7);
    });
  });

  describe('Rollback Scenarios', () => {
    /**
     * Test complete rollback procedure
     * Requirements: 8.2, 8.3, 8.4 - Graceful rollback with validation
     */
    it('should perform complete rollback within 2 minutes', async () => {
      // Create a previous version to rollback to
      const previousVersion = await versionManager.createVersion('1.0.0', [
        { name: 'titan-brain', path: './services/titan-brain' },
        { name: 'shared', path: './services/shared' }
      ]);

      const startTime = Date.now();

      // Perform rollback
      const rollbackResult: RollbackResult = await rollbackOrchestrator.rollback(previousVersion.id);

      const rollbackTime = Date.now() - startTime;

      // Verify rollback completed within 2 minutes
      expect(rollbackTime).toBeLessThan(120000);
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.duration).toBeLessThan(120000);

      // Verify rollback steps completed successfully
      expect(rollbackResult.steps.length).toBeGreaterThan(0);
      for (const step of rollbackResult.steps) {
        expect(step.success).toBe(true);
        expect(step.duration).toBeGreaterThan(0);
      }

      // Verify services restarted and validated
      expect(rollbackResult.validationResults).toBeDefined();
      expect(rollbackResult.validationResults.success).toBe(true);

      // Verify version is now active
      const activeVersion = versionManager.getActiveVersion();
      expect(activeVersion?.id).toBe(previousVersion.id);
    }, 150000); // 2.5 minute timeout

    /**
     * Test rollback with service validation
     * Requirements: 8.4 - Service validation after rollback
     */
    it('should validate services after rollback', async () => {
      // Get current version for rollback
      const currentVersion = versionManager.getActiveVersion();
      expect(currentVersion).toBeDefined();

      // Perform rollback
      const rollbackResult = await rollbackOrchestrator.rollback(currentVersion!.id);

      // Verify rollback validation
      expect(rollbackResult.validationResults).toBeDefined();
      expect(rollbackResult.validationResults.success).toBe(true);

      // Verify individual service validations
      const serviceResults = rollbackResult.validationResults.results.services;
      expect(serviceResults.length).toBeGreaterThan(0);

      for (const serviceResult of serviceResults) {
        expect(serviceResult.success).toBe(true);
        expect(serviceResult.responseTime).toBeLessThan(10000);
      }

      // Verify system connectivity after rollback
      expect(rollbackResult.validationResults.results.redis.success).toBe(true);
    });

    /**
     * Test rollback failure recovery
     * Requirements: 8.2, 8.3 - Rollback error handling
     */
    it('should handle rollback failures and attempt recovery', async () => {
      // Create a version with invalid rollback data
      const invalidVersion = await versionManager.createVersion('invalid', []);
      
      // Attempt rollback (should fail)
      const rollbackResult = await rollbackOrchestrator.rollback(invalidVersion.id);

      // Verify rollback failed appropriately
      expect(rollbackResult.success).toBe(false);
      expect(rollbackResult.errors.length).toBeGreaterThan(0);

      // Verify error details
      const error = rollbackResult.errors[0];
      expect(error.error).toBeDefined();
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.recoverable).toBeDefined();

      // Verify system attempted recovery
      expect(rollbackResult.steps.length).toBeGreaterThan(0);
    });
  });

  describe('Recovery Procedures', () => {
    /**
     * Test disaster recovery procedures
     * Requirements: 8.2, 8.3 - Recovery from critical failures
     */
    it('should recover from critical deployment failures', async () => {
      // Simulate critical failure by stopping all services
      await pm2Manager.stopAll();

      // Verify services are stopped
      let serviceStatuses = deploymentOrchestrator.getServiceStatuses();
      for (const status of serviceStatuses) {
        expect(status.status).not.toBe('running');
      }

      // Attempt recovery through redeployment
      const recoveryResult = await deploymentOrchestrator.deployAll();

      // Verify recovery succeeded
      expect(recoveryResult.success).toBe(true);
      expect(recoveryResult.deployedServices.length).toBeGreaterThan(0);

      // Verify services are running again
      serviceStatuses = deploymentOrchestrator.getServiceStatuses();
      for (const status of serviceStatuses) {
        expect(status.status).toBe('running');
        expect(status.healthStatus).toBe('healthy');
      }
    });

    /**
     * Test partial failure recovery
     * Requirements: 2.1, 2.2 - Partial deployment recovery
     */
    it('should recover from partial deployment failures', async () => {
      // Stop a specific service to simulate partial failure
      await deploymentOrchestrator.stopService('titan-phase1-scavenger');

      // Verify service is stopped
      const stoppedStatus = deploymentOrchestrator.getServiceStatus('titan-phase1-scavenger');
      expect(stoppedStatus?.status).not.toBe('running');

      // Redeploy the failed service
      await deploymentOrchestrator.deployService('titan-phase1-scavenger');

      // Verify service recovered
      const recoveredStatus = deploymentOrchestrator.getServiceStatus('titan-phase1-scavenger');
      expect(recoveredStatus?.status).toBe('running');
      expect(recoveredStatus?.healthStatus).toBe('healthy');

      // Verify other services remained unaffected
      const allStatuses = deploymentOrchestrator.getServiceStatuses();
      const runningServices = allStatuses.filter(s => s.status === 'running');
      expect(runningServices.length).toBe(allStatuses.length);
    });

    /**
     * Test configuration corruption recovery
     * Requirements: 8.3, 8.4 - Configuration recovery and validation
     */
    it('should recover from configuration corruption', async () => {
      // Backup current configuration
      const configBackup = await backupConfiguration();

      // Corrupt configuration files
      await corruptConfiguration();

      // Attempt deployment (should detect corruption)
      const deploymentResult = await deploymentOrchestrator.deployAll();
      expect(deploymentResult.success).toBe(false);

      // Restore configuration from backup
      await restoreConfiguration(configBackup);

      // Retry deployment
      const recoveryResult = await deploymentOrchestrator.deployAll();
      expect(recoveryResult.success).toBe(true);

      // Validate configuration integrity
      const validationResult = await deploymentValidator.validateDeployment();
      expect(validationResult.success).toBe(true);
    });
  });

  describe('End-to-End Integration', () => {
    /**
     * Test complete deployment lifecycle
     * Requirements: 2.1, 2.2, 2.3, 8.2, 8.3, 8.4 - Full lifecycle
     */
    it('should handle complete deployment lifecycle', async () => {
      // 1. Initial deployment
      const initialDeployment = await deploymentOrchestrator.deployAll();
      expect(initialDeployment.success).toBe(true);

      // 2. Validation
      const initialValidation = await deploymentValidator.validateDeployment();
      expect(initialValidation.success).toBe(true);

      // 3. Create new version
      const newVersion = await versionManager.createVersion('2.0.0', [
        { name: 'titan-brain', path: './services/titan-brain' },
        { name: 'shared', path: './services/shared' }
      ]);

      // 4. Deploy new version
      const upgradeDeployment = await deploymentOrchestrator.deployAll();
      expect(upgradeDeployment.success).toBe(true);

      // 5. Validate new deployment
      const upgradeValidation = await deploymentValidator.validateDeployment();
      expect(upgradeValidation.success).toBe(true);

      // 6. Rollback to previous version
      const rollbackResult = await rollbackOrchestrator.rollback(newVersion.id);
      expect(rollbackResult.success).toBe(true);

      // 7. Final validation
      const finalValidation = await deploymentValidator.validateDeployment();
      expect(finalValidation.success).toBe(true);

      // Verify complete lifecycle completed successfully
      expect(rollbackResult.duration).toBeLessThan(120000); // Within 2 minutes
    }, 300000); // 5 minute timeout for full lifecycle
  });

  // Helper functions
  async function createMockServiceDirectories(): Promise<void> {
    const services = [
      'shared',
      'security',
      'titan-brain',
      'titan-execution', 
      'titan-phase1-scavenger',
      'titan-ai-quant',
      'titan-console'
    ];

    for (const service of services) {
      const servicePath = path.join(testWorkspace, 'services', service);
      await fs.mkdir(servicePath, { recursive: true });
      
      // Create package.json
      const packageJson = {
        name: service,
        version: '1.0.0',
        scripts: {
          start: 'node index.js'
        }
      };
      await fs.writeFile(
        path.join(servicePath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Create mock index.js
      const indexJs = `
        const http = require('http');
        const server = http.createServer((req, res) => {
          if (req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('healthy');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('${service} service running');
          }
        });
        
        const port = process.env.PORT || ${3000 + services.indexOf(service)};
        server.listen(port, () => {
          console.log('${service} service listening on port', port);
        });
      `;
      await fs.writeFile(path.join(servicePath, 'index.js'), indexJs);
    }
  }

  async function createFailingService(serviceName: string): Promise<void> {
    const servicePath = path.join(testWorkspace, 'services', serviceName);
    await fs.mkdir(servicePath, { recursive: true });
    
    // Create package.json
    const packageJson = {
      name: serviceName,
      version: '1.0.0',
      scripts: {
        start: 'node index.js'
      }
    };
    await fs.writeFile(
      path.join(servicePath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create failing index.js
    const indexJs = `
      console.error('Service intentionally failing for test');
      process.exit(1);
    `;
    await fs.writeFile(path.join(servicePath, 'index.js'), indexJs);
  }

  async function backupConfiguration(): Promise<string> {
    const backupPath = path.join(testWorkspace, 'config-backup');
    await fs.mkdir(backupPath, { recursive: true });
    
    // Mock configuration backup
    const configData = { version: '1.0.0', services: [] };
    await fs.writeFile(
      path.join(backupPath, 'config.json'),
      JSON.stringify(configData, null, 2)
    );
    
    return backupPath;
  }

  async function corruptConfiguration(): Promise<void> {
    const configPath = path.join(testWorkspace, 'config');
    await fs.mkdir(configPath, { recursive: true });
    
    // Create corrupted configuration
    await fs.writeFile(
      path.join(configPath, 'config.json'),
      'invalid json content'
    );
  }

  async function restoreConfiguration(backupPath: string): Promise<void> {
    const configPath = path.join(testWorkspace, 'config');
    const backupFile = path.join(backupPath, 'config.json');
    const configFile = path.join(configPath, 'config.json');
    
    await fs.mkdir(configPath, { recursive: true });
    await fs.copyFile(backupFile, configFile);
  }
});