/**
 * Version Management System
 * 
 * Maintains deployment versions with metadata and dependencies tracking.
 * Implements Requirement 8.1: Maintain last 5 deployment versions with metadata.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface DeploymentVersion {
  id: string;
  version: string;
  timestamp: Date;
  services: ServiceVersionInfo[];
  metadata: VersionMetadata;
  dependencies: VersionDependencies;
  status: 'active' | 'inactive' | 'archived';
  rollbackData: RollbackData;
}

export interface ServiceVersionInfo {
  name: string;
  version: string;
  buildHash: string;
  configHash: string;
  dependencies: string[];
  healthCheckEndpoint?: string;
  startupTimeout: number;
}

export interface VersionMetadata {
  deployedBy: string;
  deploymentReason: string;
  gitCommit?: string;
  gitBranch?: string;
  buildNumber?: string;
  releaseNotes?: string;
  environment: 'production' | 'staging' | 'development';
  deploymentDuration: number;
  validationResults?: any;
}

export interface VersionDependencies {
  nodeVersion: string;
  npmVersion: string;
  systemDependencies: Record<string, string>;
  externalServices: ExternalServiceDependency[];
  configurationVersion: string;
}

export interface ExternalServiceDependency {
  name: string;
  version?: string;
  endpoint: string;
  required: boolean;
  healthCheckUrl?: string;
}

export interface RollbackData {
  previousVersionId?: string;
  configBackupPath: string;
  serviceBackupPaths: Record<string, string>;
  databaseBackupPath?: string;
  rollbackInstructions: RollbackInstruction[];
}

export interface RollbackInstruction {
  step: number;
  action: 'stop_service' | 'restore_files' | 'start_service' | 'validate_service' | 'restore_config' | 'restore_database';
  target: string;
  parameters: Record<string, any>;
  timeout: number;
  rollbackOnFailure: boolean;
}

export interface VersionManagerConfig {
  maxVersions: number;
  versionsDirectory: string;
  backupDirectory: string;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  encryptionKey?: string;
}

/**
 * Version Manager
 * 
 * Manages deployment versions with comprehensive metadata tracking,
 * dependency management, and rollback data preparation.
 */
export class VersionManager extends EventEmitter {
  private config: VersionManagerConfig;
  private versions: Map<string, DeploymentVersion> = new Map();
  private activeVersionId?: string;

  constructor(config?: Partial<VersionManagerConfig>) {
    super();
    
    this.config = {
      maxVersions: 5,
      versionsDirectory: './deployment/versions',
      backupDirectory: './deployment/backups',
      compressionEnabled: true,
      encryptionEnabled: true,
      encryptionKey: process.env.DEPLOYMENT_ENCRYPTION_KEY,
      ...config
    };
  }

  /**
   * Initialize version manager and load existing versions
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directories exist
      await fs.mkdir(this.config.versionsDirectory, { recursive: true });
      await fs.mkdir(this.config.backupDirectory, { recursive: true });

      // Load existing versions
      await this.loadVersions();

      this.emit('version_manager:initialized');
    } catch (error) {
      throw new Error(`Failed to initialize version manager: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new deployment version
   * Requirement 8.1: Track version metadata and dependencies
   */
  async createVersion(
    version: string,
    services: ServiceVersionInfo[],
    metadata: Partial<VersionMetadata>
  ): Promise<DeploymentVersion> {
    const versionId = this.generateVersionId(version);
    
    // Collect system dependencies
    const dependencies = await this.collectDependencies();
    
    // Create rollback data
    const rollbackData = await this.createRollbackData(services);
    
    const deploymentVersion: DeploymentVersion = {
      id: versionId,
      version,
      timestamp: new Date(),
      services,
      metadata: {
        deployedBy: process.env.USER || 'system',
        deploymentReason: 'Manual deployment',
        environment: 'production',
        deploymentDuration: 0,
        ...metadata
      },
      dependencies,
      status: 'inactive',
      rollbackData
    };

    // Store version
    this.versions.set(versionId, deploymentVersion);
    
    // Save to disk
    await this.saveVersion(deploymentVersion);
    
    // Cleanup old versions if needed
    await this.cleanupOldVersions();
    
    this.emit('version:created', { versionId, version });
    
    return deploymentVersion;
  }

  /**
   * Activate a deployment version
   */
  async activateVersion(versionId: string): Promise<void> {
    const version = this.versions.get(versionId);
    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }

    // Deactivate current active version
    if (this.activeVersionId) {
      const currentVersion = this.versions.get(this.activeVersionId);
      if (currentVersion) {
        currentVersion.status = 'inactive';
        await this.saveVersion(currentVersion);
      }
    }

    // Activate new version
    version.status = 'active';
    this.activeVersionId = versionId;
    
    await this.saveVersion(version);
    
    this.emit('version:activated', { versionId, version: version.version });
  }

  /**
   * Get deployment version by ID
   */
  getVersion(versionId: string): DeploymentVersion | undefined {
    return this.versions.get(versionId);
  }

  /**
   * Get active deployment version
   */
  getActiveVersion(): DeploymentVersion | undefined {
    if (!this.activeVersionId) {
      return undefined;
    }
    return this.versions.get(this.activeVersionId);
  }

  /**
   * Get all deployment versions (sorted by timestamp, newest first)
   */
  getAllVersions(): DeploymentVersion[] {
    return Array.from(this.versions.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get available rollback targets (last 5 versions excluding current)
   */
  getRollbackTargets(): DeploymentVersion[] {
    const allVersions = this.getAllVersions();
    return allVersions
      .filter(v => v.id !== this.activeVersionId && v.status !== 'archived')
      .slice(0, this.config.maxVersions - 1);
  }

  /**
   * Get version history for a specific service
   */
  getServiceVersionHistory(serviceName: string): Array<{
    versionId: string;
    version: string;
    timestamp: Date;
    serviceVersion: string;
    buildHash: string;
  }> {
    return this.getAllVersions()
      .map(v => {
        const serviceInfo = v.services.find(s => s.name === serviceName);
        if (!serviceInfo) return null;
        
        return {
          versionId: v.id,
          version: v.version,
          timestamp: v.timestamp,
          serviceVersion: serviceInfo.version,
          buildHash: serviceInfo.buildHash
        };
      })
      .filter(Boolean) as Array<{
        versionId: string;
        version: string;
        timestamp: Date;
        serviceVersion: string;
        buildHash: string;
      }>;
  }

  /**
   * Compare two versions and identify differences
   */
  compareVersions(versionId1: string, versionId2: string): {
    servicesAdded: string[];
    servicesRemoved: string[];
    servicesModified: Array<{
      name: string;
      oldVersion: string;
      newVersion: string;
      configChanged: boolean;
    }>;
    dependencyChanges: Array<{
      name: string;
      oldVersion?: string;
      newVersion?: string;
      type: 'added' | 'removed' | 'modified';
    }>;
  } {
    const version1 = this.versions.get(versionId1);
    const version2 = this.versions.get(versionId2);
    
    if (!version1 || !version2) {
      throw new Error('One or both versions not found');
    }

    const services1 = new Map(version1.services.map(s => [s.name, s]));
    const services2 = new Map(version2.services.map(s => [s.name, s]));

    const servicesAdded = Array.from(services2.keys()).filter(name => !services1.has(name));
    const servicesRemoved = Array.from(services1.keys()).filter(name => !services2.has(name));
    
    const servicesModified = Array.from(services1.keys())
      .filter(name => services2.has(name))
      .map(name => {
        const service1 = services1.get(name)!;
        const service2 = services2.get(name)!;
        
        if (service1.version !== service2.version || service1.configHash !== service2.configHash) {
          return {
            name,
            oldVersion: service1.version,
            newVersion: service2.version,
            configChanged: service1.configHash !== service2.configHash
          };
        }
        return null;
      })
      .filter(Boolean) as Array<{
        name: string;
        oldVersion: string;
        newVersion: string;
        configChanged: boolean;
      }>;

    // Compare system dependencies
    const deps1 = version1.dependencies.systemDependencies;
    const deps2 = version2.dependencies.systemDependencies;
    
    const dependencyChanges: Array<{
      name: string;
      oldVersion?: string;
      newVersion?: string;
      type: 'added' | 'removed' | 'modified';
    }> = [];

    // Check for added/modified dependencies
    for (const [name, version] of Object.entries(deps2)) {
      if (!deps1[name]) {
        dependencyChanges.push({ name, newVersion: version, type: 'added' });
      } else if (deps1[name] !== version) {
        dependencyChanges.push({ name, oldVersion: deps1[name], newVersion: version, type: 'modified' });
      }
    }

    // Check for removed dependencies
    for (const [name, version] of Object.entries(deps1)) {
      if (!deps2[name]) {
        dependencyChanges.push({ name, oldVersion: version, type: 'removed' });
      }
    }

    return {
      servicesAdded,
      servicesRemoved,
      servicesModified,
      dependencyChanges
    };
  }

  /**
   * Archive old versions beyond the retention limit
   */
  async archiveVersion(versionId: string): Promise<void> {
    const version = this.versions.get(versionId);
    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }

    if (version.status === 'active') {
      throw new Error('Cannot archive active version');
    }

    version.status = 'archived';
    await this.saveVersion(version);
    
    this.emit('version:archived', { versionId, version: version.version });
  }

  /**
   * Delete a version completely (use with caution)
   */
  async deleteVersion(versionId: string): Promise<void> {
    const version = this.versions.get(versionId);
    if (!version) {
      throw new Error(`Version not found: ${versionId}`);
    }

    if (version.status === 'active') {
      throw new Error('Cannot delete active version');
    }

    // Remove from memory
    this.versions.delete(versionId);
    
    // Remove from disk
    const versionFile = path.join(this.config.versionsDirectory, `${versionId}.json`);
    try {
      await fs.unlink(versionFile);
    } catch (error) {
      // File might not exist, continue
    }

    // Remove backup data
    try {
      const backupPath = version.rollbackData.configBackupPath;
      if (backupPath) {
        await fs.rm(backupPath, { recursive: true, force: true });
      }
    } catch (error) {
      // Backup might not exist, continue
    }

    this.emit('version:deleted', { versionId, version: version.version });
  }

  /**
   * Generate unique version ID
   */
  private generateVersionId(version: string): string {
    const timestamp = Date.now();
    const hash = crypto.createHash('sha256')
      .update(`${version}-${timestamp}-${Math.random()}`)
      .digest('hex')
      .substring(0, 8);
    
    return `v${timestamp}-${hash}`;
  }

  /**
   * Collect system dependencies
   */
  private async collectDependencies(): Promise<VersionDependencies> {
    try {
      const { execSync } = require('child_process');
      
      const nodeVersion = process.version;
      const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
      
      // Collect system dependencies
      const systemDependencies: Record<string, string> = {
        node: nodeVersion,
        npm: npmVersion
      };

      // Try to get additional system info
      try {
        systemDependencies.os = execSync('uname -a', { encoding: 'utf8' }).trim();
      } catch {
        systemDependencies.os = process.platform;
      }

      try {
        systemDependencies.pm2 = execSync('pm2 --version', { encoding: 'utf8' }).trim();
      } catch {
        // PM2 not available
      }

      try {
        systemDependencies.redis = execSync('redis-server --version', { encoding: 'utf8' }).trim();
      } catch {
        // Redis not available
      }

      // External services (exchanges, etc.)
      const externalServices: ExternalServiceDependency[] = [
        {
          name: 'binance-api',
          endpoint: 'https://api.binance.com',
          required: true,
          healthCheckUrl: 'https://api.binance.com/api/v3/ping'
        },
        {
          name: 'bybit-api',
          endpoint: 'https://api.bybit.com',
          required: true,
          healthCheckUrl: 'https://api.bybit.com/v5/market/time'
        }
      ];

      return {
        nodeVersion,
        npmVersion,
        systemDependencies,
        externalServices,
        configurationVersion: await this.getConfigurationVersion()
      };
    } catch (error) {
      throw new Error(`Failed to collect dependencies: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get configuration version hash
   */
  private async getConfigurationVersion(): Promise<string> {
    try {
      const configPaths = [
        './config/brain.config.json',
        './config/phase1.config.json',
        './config/phase2.config.json',
        './config/phase3.config.json'
      ];

      const configHashes: string[] = [];
      
      for (const configPath of configPaths) {
        try {
          const configContent = await fs.readFile(configPath, 'utf8');
          const hash = crypto.createHash('sha256').update(configContent).digest('hex');
          configHashes.push(hash);
        } catch {
          // Config file might not exist
          configHashes.push('missing');
        }
      }

      return crypto.createHash('sha256').update(configHashes.join('')).digest('hex').substring(0, 16);
    } catch {
      return 'unknown';
    }
  }

  /**
   * Create rollback data for services
   */
  private async createRollbackData(services: ServiceVersionInfo[]): Promise<RollbackData> {
    const timestamp = Date.now();
    const backupBasePath = path.join(this.config.backupDirectory, `rollback-${timestamp}`);
    
    await fs.mkdir(backupBasePath, { recursive: true });

    const configBackupPath = path.join(backupBasePath, 'config');
    const serviceBackupPaths: Record<string, string> = {};

    // Backup configuration files
    await fs.mkdir(configBackupPath, { recursive: true });
    
    const configFiles = [
      './config/brain.config.json',
      './config/phase1.config.json',
      './config/phase2.config.json',
      './config/phase3.config.json',
      './ecosystem.config.js'
    ];

    for (const configFile of configFiles) {
      try {
        const fileName = path.basename(configFile);
        const backupPath = path.join(configBackupPath, fileName);
        await fs.copyFile(configFile, backupPath);
      } catch {
        // Config file might not exist
      }
    }

    // Create service backup paths (actual backup will be done during deployment)
    for (const service of services) {
      const serviceBackupPath = path.join(backupBasePath, 'services', service.name);
      serviceBackupPaths[service.name] = serviceBackupPath;
    }

    // Generate rollback instructions
    const rollbackInstructions: RollbackInstruction[] = [
      {
        step: 1,
        action: 'stop_service',
        target: 'all',
        parameters: {},
        timeout: 30000,
        rollbackOnFailure: false
      },
      {
        step: 2,
        action: 'restore_config',
        target: configBackupPath,
        parameters: {},
        timeout: 10000,
        rollbackOnFailure: true
      }
    ];

    // Add service-specific rollback instructions
    let step = 3;
    for (const service of services) {
      rollbackInstructions.push({
        step: step++,
        action: 'restore_files',
        target: service.name,
        parameters: {
          sourcePath: serviceBackupPaths[service.name],
          targetPath: `./services/${service.name}`
        },
        timeout: 30000,
        rollbackOnFailure: true
      });
    }

    // Add service startup instructions (in dependency order)
    const startupOrder = this.calculateServiceStartupOrder(services);
    for (const serviceName of startupOrder) {
      rollbackInstructions.push({
        step: step++,
        action: 'start_service',
        target: serviceName,
        parameters: {},
        timeout: 30000,
        rollbackOnFailure: true
      });

      rollbackInstructions.push({
        step: step++,
        action: 'validate_service',
        target: serviceName,
        parameters: {},
        timeout: 30000,
        rollbackOnFailure: true
      });
    }

    return {
      previousVersionId: this.activeVersionId,
      configBackupPath,
      serviceBackupPaths,
      rollbackInstructions
    };
  }

  /**
   * Calculate service startup order based on dependencies
   */
  private calculateServiceStartupOrder(services: ServiceVersionInfo[]): string[] {
    const serviceMap = new Map(services.map(s => [s.name, s]));
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (serviceName: string): void => {
      if (visited.has(serviceName)) return;
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected: ${serviceName}`);
      }

      visiting.add(serviceName);
      
      const service = serviceMap.get(serviceName);
      if (service) {
        for (const dependency of service.dependencies) {
          if (serviceMap.has(dependency)) {
            visit(dependency);
          }
        }
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };

    for (const service of services) {
      visit(service.name);
    }

    return order;
  }

  /**
   * Load versions from disk
   */
  private async loadVersions(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.versionsDirectory);
      const versionFiles = files.filter(f => f.endsWith('.json'));

      for (const file of versionFiles) {
        try {
          const filePath = path.join(this.config.versionsDirectory, file);
          const content = await fs.readFile(filePath, 'utf8');
          const version: DeploymentVersion = JSON.parse(content);
          
          // Convert timestamp string back to Date
          version.timestamp = new Date(version.timestamp);
          
          this.versions.set(version.id, version);
          
          if (version.status === 'active') {
            this.activeVersionId = version.id;
          }
        } catch (error) {
          console.warn(`Failed to load version file ${file}:`, error);
        }
      }
    } catch (error) {
      // Directory might not exist yet
    }
  }

  /**
   * Save version to disk
   */
  private async saveVersion(version: DeploymentVersion): Promise<void> {
    const filePath = path.join(this.config.versionsDirectory, `${version.id}.json`);
    const content = JSON.stringify(version, null, 2);
    
    if (this.config.encryptionEnabled && this.config.encryptionKey) {
      // Encrypt sensitive data (not implemented in this basic version)
      // In production, you would encrypt the entire content or sensitive fields
    }
    
    await fs.writeFile(filePath, content, 'utf8');
  }

  /**
   * Cleanup old versions beyond retention limit
   */
  private async cleanupOldVersions(): Promise<void> {
    const allVersions = this.getAllVersions();
    
    if (allVersions.length <= this.config.maxVersions) {
      return;
    }

    // Keep the most recent versions and the active version
    const versionsToKeep = new Set<string>();
    
    // Always keep active version
    if (this.activeVersionId) {
      versionsToKeep.add(this.activeVersionId);
    }
    
    // Keep the most recent versions
    const recentVersions = allVersions
      .filter(v => v.id !== this.activeVersionId)
      .slice(0, this.config.maxVersions - 1);
    
    for (const version of recentVersions) {
      versionsToKeep.add(version.id);
    }

    // Archive versions beyond the limit
    for (const version of allVersions) {
      if (!versionsToKeep.has(version.id) && version.status !== 'archived') {
        await this.archiveVersion(version.id);
      }
    }
  }
}