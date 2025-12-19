/**
 * Integrated Rollback System
 * 
 * Combines version management, rollback orchestration, and performance optimization
 * into a unified rollback system for production deployments.
 */

import { EventEmitter } from 'events';
import { VersionManager, DeploymentVersion } from './VersionManager';
import { RollbackOrchestrator, RollbackResult } from './RollbackOrchestrator';
import { RollbackOptimizer } from './RollbackOptimizer';
import { PM2Manager } from './PM2Manager';
import { DeploymentValidator } from './DeploymentValidator';

export interface RollbackSystemConfig {
  versionManager: {
    maxVersions: number;
    versionsDirectory: string;
    backupDirectory: string;
  };
  orchestrator: {
    maxRollbackTime: number;
    gracefulShutdownTimeout: number;
    validationTimeout: number;
    parallelOperations: boolean;
  };
  optimizer: {
    maxParallelOperations: number;
    useIncrementalBackup: boolean;
    preloadCriticalServices: boolean;
    enableProgressiveRestart: boolean;
  };
}

export interface RollbackSystemStatus {
  initialized: boolean;
  rollbackInProgress: boolean;
  activeVersion?: {
    id: string;
    version: string;
    timestamp: Date;
  };
  availableTargets: number;
  systemHealth: 'healthy' | 'degraded' | 'critical';
}

/**
 * Integrated Rollback System
 * 
 * Provides a unified interface for all rollback operations including
 * version management, orchestration, and performance optimization.
 */
export class RollbackSystem extends EventEmitter {
  private versionManager: VersionManager;
  private rollbackOrchestrator: RollbackOrchestrator;
  private rollbackOptimizer: RollbackOptimizer;
  private pm2Manager: PM2Manager;
  private validator: DeploymentValidator;
  private config: RollbackSystemConfig;
  private initialized = false;

  constructor(config?: Partial<RollbackSystemConfig>) {
    super();
    
    this.config = {
      versionManager: {
        maxVersions: 5,
        versionsDirectory: './deployment/versions',
        backupDirectory: './deployment/backups'
      },
      orchestrator: {
        maxRollbackTime: 120,
        gracefulShutdownTimeout: 30,
        validationTimeout: 30,
        parallelOperations: true
      },
      optimizer: {
        maxParallelOperations: 4,
        useIncrementalBackup: true,
        preloadCriticalServices: true,
        enableProgressiveRestart: true
      },
      ...config
    };

    // Initialize components
    this.versionManager = new VersionManager(this.config.versionManager);
    this.pm2Manager = new PM2Manager();
    this.validator = new DeploymentValidator();
    this.rollbackOptimizer = new RollbackOptimizer(this.config.optimizer);
    this.rollbackOrchestrator = new RollbackOrchestrator(
      this.versionManager,
      this.pm2Manager,
      this.validator,
      this.config.orchestrator
    );

    this.setupEventHandlers();
  }

  /**
   * Initialize the rollback system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize all components
      await this.versionManager.initialize();
      await this.pm2Manager.initialize();
      
      this.initialized = true;
      this.emit('rollback_system:initialized');
    } catch (error) {
      throw new Error(`Failed to initialize rollback system: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new deployment version
   */
  async createDeploymentVersion(
    version: string,
    services: Array<{
      name: string;
      version: string;
      buildHash: string;
      configHash: string;
      dependencies: string[];
    }>,
    metadata?: any
  ): Promise<DeploymentVersion> {
    await this.ensureInitialized();
    
    const deploymentVersion = await this.versionManager.createVersion(
      version,
      services.map(s => ({
        ...s,
        healthCheckEndpoint: this.getServiceHealthCheckEndpoint(s.name),
        startupTimeout: 30
      })),
      metadata
    );

    this.emit('version:created', deploymentVersion);
    return deploymentVersion;
  }

  /**
   * Perform optimized rollback to a target version
   */
  async rollback(targetVersionId: string): Promise<RollbackResult> {
    await this.ensureInitialized();
    
    const targetVersion = this.versionManager.getVersion(targetVersionId);
    if (!targetVersion) {
      throw new Error(`Target version not found: ${targetVersionId}`);
    }

    // Optimize rollback instructions for performance
    const optimization = this.rollbackOptimizer.optimizeRollbackInstructions(
      targetVersion.rollbackData.rollbackInstructions
    );

    this.emit('rollback:optimization_complete', {
      estimatedDuration: optimization.estimatedDuration,
      parallelizationGains: optimization.parallelizationGains
    });

    // Execute optimized rollback
    const result = await this.rollbackOrchestrator.rollback(targetVersionId);
    
    this.emit('rollback:complete', result);
    return result;
  }

  /**
   * Perform dry run rollback analysis
   */
  async analyzeRollback(targetVersionId: string): Promise<{
    feasible: boolean;
    estimatedDuration: number;
    optimizationGains: number;
    risks: string[];
    blockers: string[];
    steps: any[];
  }> {
    await this.ensureInitialized();
    
    const dryRunResult = await this.rollbackOrchestrator.dryRunRollback(targetVersionId);
    
    const targetVersion = this.versionManager.getVersion(targetVersionId);
    if (!targetVersion) {
      throw new Error(`Target version not found: ${targetVersionId}`);
    }

    const optimization = this.rollbackOptimizer.optimizeRollbackInstructions(
      targetVersion.rollbackData.rollbackInstructions
    );

    return {
      feasible: dryRunResult.feasible,
      estimatedDuration: optimization.estimatedDuration,
      optimizationGains: optimization.parallelizationGains,
      risks: dryRunResult.risks,
      blockers: dryRunResult.blockers,
      steps: dryRunResult.steps
    };
  }

  /**
   * Get rollback system status
   */
  async getSystemStatus(): Promise<RollbackSystemStatus> {
    await this.ensureInitialized();
    
    const activeVersion = this.versionManager.getActiveVersion();
    const rollbackTargets = this.versionManager.getRollbackTargets();
    const orchestratorStatus = this.rollbackOrchestrator.getRollbackStatus();
    
    // Perform quick health check
    const healthCheck = await this.validator.quickHealthCheck();
    
    return {
      initialized: this.initialized,
      rollbackInProgress: orchestratorStatus.inProgress,
      activeVersion: activeVersion ? {
        id: activeVersion.id,
        version: activeVersion.version,
        timestamp: activeVersion.timestamp
      } : undefined,
      availableTargets: rollbackTargets.length,
      systemHealth: healthCheck.healthy ? 'healthy' : 
                   healthCheck.issues.length < 3 ? 'degraded' : 'critical'
    };
  }

  /**
   * Get available rollback targets with analysis
   */
  async getRollbackTargets(): Promise<Array<{
    versionId: string;
    version: string;
    timestamp: Date;
    services: string[];
    canRollback: boolean;
    estimatedDuration: number;
    risks: string[];
    reason?: string;
  }>> {
    await this.ensureInitialized();
    
    const targets = this.rollbackOrchestrator.getRollbackTargets();
    
    // Enhance with analysis data
    const enhancedTargets = await Promise.all(
      targets.map(async (target) => {
        try {
          const analysis = await this.analyzeRollback(target.versionId);
          return {
            ...target,
            estimatedDuration: analysis.estimatedDuration,
            risks: analysis.risks
          };
        } catch (error) {
          return {
            ...target,
            estimatedDuration: 0,
            risks: ['Analysis failed']
          };
        }
      })
    );

    return enhancedTargets;
  }

  /**
   * Get version history with rollback information
   */
  getVersionHistory(): Array<{
    versionId: string;
    version: string;
    timestamp: Date;
    status: string;
    services: number;
    canRollback: boolean;
    deploymentDuration: number;
  }> {
    const versions = this.versionManager.getAllVersions();
    
    return versions.map(version => ({
      versionId: version.id,
      version: version.version,
      timestamp: version.timestamp,
      status: version.status,
      services: version.services.length,
      canRollback: version.status !== 'archived' && version.rollbackData.rollbackInstructions.length > 0,
      deploymentDuration: version.metadata.deploymentDuration
    }));
  }

  /**
   * Compare two versions
   */
  compareVersions(versionId1: string, versionId2: string): any {
    return this.versionManager.compareVersions(versionId1, versionId2);
  }

  /**
   * Archive old versions
   */
  async archiveVersion(versionId: string): Promise<void> {
    await this.ensureInitialized();
    await this.versionManager.archiveVersion(versionId);
    this.emit('version:archived', { versionId });
  }

  /**
   * Delete a version (use with caution)
   */
  async deleteVersion(versionId: string): Promise<void> {
    await this.ensureInitialized();
    await this.versionManager.deleteVersion(versionId);
    this.emit('version:deleted', { versionId });
  }

  /**
   * Update system configuration
   */
  updateConfig(config: Partial<RollbackSystemConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update component configurations
    if (config.orchestrator) {
      this.rollbackOrchestrator.updateConfig(config.orchestrator);
    }
    
    if (config.optimizer) {
      this.rollbackOptimizer.updateConfig(config.optimizer);
    }
    
    this.emit('rollback_system:config_updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): RollbackSystemConfig {
    return { ...this.config };
  }

  /**
   * Emergency abort rollback
   */
  async abortRollback(): Promise<void> {
    await this.rollbackOrchestrator.abortRollback();
    this.emit('rollback:aborted');
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): any {
    return this.rollbackOptimizer.getPerformanceMetrics();
  }

  /**
   * Clear performance metrics
   */
  clearPerformanceMetrics(): void {
    this.rollbackOptimizer.clearPerformanceMetrics();
  }

  /**
   * Setup event handlers for component coordination
   */
  private setupEventHandlers(): void {
    // Forward version manager events
    this.versionManager.on('version:created', (data) => {
      this.emit('version:created', data);
    });
    
    this.versionManager.on('version:activated', (data) => {
      this.emit('version:activated', data);
    });

    // Forward rollback orchestrator events
    this.rollbackOrchestrator.on('rollback:started', (data) => {
      this.emit('rollback:started', data);
    });
    
    this.rollbackOrchestrator.on('rollback:progress', (data) => {
      this.emit('rollback:progress', data);
    });
    
    this.rollbackOrchestrator.on('rollback:completed', (data) => {
      this.emit('rollback:completed', data);
    });

    // Forward optimizer events
    this.rollbackOptimizer.on('optimizer:config_updated', (data) => {
      this.emit('optimizer:config_updated', data);
    });
  }

  /**
   * Get health check endpoint for a service
   */
  private getServiceHealthCheckEndpoint(serviceName: string): string | undefined {
    const healthCheckEndpoints: Record<string, string> = {
      'titan-brain': 'http://localhost:3000/health',
      'titan-execution': 'http://localhost:3003/health',
      'titan-console': 'http://localhost:3006/health'
    };
    
    return healthCheckEndpoints[serviceName];
  }

  /**
   * Ensure system is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}

// Singleton instance for global access
let rollbackSystemInstance: RollbackSystem | null = null;

/**
 * Get the singleton rollback system instance
 */
export function getRollbackSystem(config?: Partial<RollbackSystemConfig>): RollbackSystem {
  if (!rollbackSystemInstance) {
    rollbackSystemInstance = new RollbackSystem(config);
  }
  return rollbackSystemInstance;
}

/**
 * Reset the rollback system instance (for testing)
 */
export function resetRollbackSystem(): void {
  rollbackSystemInstance = null;
}