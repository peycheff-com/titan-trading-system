/**
 * Rollback Orchestrator
 * 
 * Manages graceful service shutdown, version restoration, and service restart with validation.
 * Implements Requirements 8.2, 8.3, 8.4: Graceful rollback with service validation.
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { VersionManager, DeploymentVersion, RollbackInstruction } from './VersionManager';
import { PM2Manager } from './PM2Manager';
import { DeploymentValidator } from './DeploymentValidator';

export interface RollbackConfig {
  maxRollbackTime: number; // Maximum time allowed for rollback in seconds
  gracefulShutdownTimeout: number; // Time to wait for graceful shutdown
  validationTimeout: number; // Time to wait for service validation
  parallelOperations: boolean; // Whether to perform operations in parallel when safe
  backupCurrentVersion: boolean; // Whether to backup current version before rollback
  autoValidation: boolean; // Whether to automatically validate after rollback
}

export interface RollbackResult {
  success: boolean;
  targetVersionId: string;
  targetVersion: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  steps: RollbackStepResult[];
  errors: RollbackError[];
  validationResults?: any;
}

export interface RollbackStepResult {
  step: number;
  action: string;
  target: string;
  success: boolean;
  startTime: Date;
  endTime: Date;
  duration: number;
  error?: string;
  details?: any;
}

export interface RollbackError {
  step: number;
  action: string;
  target: string;
  error: string;
  timestamp: Date;
  recoverable: boolean;
}

export interface RollbackProgress {
  currentStep: number;
  totalSteps: number;
  currentAction: string;
  target: string;
  progress: number; // 0-100
  estimatedTimeRemaining: number;
}

/**
 * Rollback Orchestrator
 * 
 * Orchestrates the complete rollback process including service shutdown,
 * file restoration, service restart, and validation with comprehensive
 * error handling and progress tracking.
 */
export class RollbackOrchestrator extends EventEmitter {
  private versionManager: VersionManager;
  private pm2Manager: PM2Manager;
  private validator: DeploymentValidator;
  private config: RollbackConfig;
  private rollbackInProgress = false;

  constructor(
    versionManager: VersionManager,
    pm2Manager: PM2Manager,
    validator: DeploymentValidator,
    config?: Partial<RollbackConfig>
  ) {
    super();
    
    this.versionManager = versionManager;
    this.pm2Manager = pm2Manager;
    this.validator = validator;
    
    this.config = {
      maxRollbackTime: 120, // 2 minutes
      gracefulShutdownTimeout: 30,
      validationTimeout: 30,
      parallelOperations: true,
      backupCurrentVersion: true,
      autoValidation: true,
      ...config
    };
  }

  /**
   * Perform rollback to a specific version
   * Requirements 8.2, 8.3, 8.4: Complete rollback with validation
   */
  async rollback(targetVersionId: string): Promise<RollbackResult> {
    if (this.rollbackInProgress) {
      throw new Error('Rollback already in progress');
    }

    const targetVersion = this.versionManager.getVersion(targetVersionId);
    if (!targetVersion) {
      throw new Error(`Target version not found: ${targetVersionId}`);
    }

    if (targetVersion.status === 'active') {
      throw new Error('Target version is already active');
    }

    this.rollbackInProgress = true;
    const startTime = new Date();
    
    const result: RollbackResult = {
      success: false,
      targetVersionId,
      targetVersion: targetVersion.version,
      startTime,
      endTime: new Date(),
      duration: 0,
      steps: [],
      errors: []
    };

    try {
      this.emit('rollback:started', { targetVersionId, targetVersion: targetVersion.version });

      // Set overall timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Rollback timeout after ${this.config.maxRollbackTime} seconds`));
        }, this.config.maxRollbackTime * 1000);
      });

      // Execute rollback with timeout
      await Promise.race([
        this.executeRollback(targetVersion, result),
        timeoutPromise
      ]);

      result.success = result.errors.length === 0;
      
    } catch (error) {
      result.success = false;
      result.errors.push({
        step: -1,
        action: 'rollback',
        target: 'system',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
        recoverable: false
      });
    } finally {
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - result.startTime.getTime();
      this.rollbackInProgress = false;
      
      this.emit('rollback:completed', result);
    }

    return result;
  }

  /**
   * Execute the complete rollback process
   */
  private async executeRollback(targetVersion: DeploymentVersion, result: RollbackResult): Promise<void> {
    const instructions = targetVersion.rollbackData.rollbackInstructions;
    const totalSteps = instructions.length;

    // Backup current version if configured
    if (this.config.backupCurrentVersion) {
      await this.backupCurrentVersion();
    }

    // Execute rollback instructions
    for (let i = 0; i < instructions.length; i++) {
      const instruction = instructions[i];
      
      // Emit progress
      this.emit('rollback:progress', {
        currentStep: i + 1,
        totalSteps,
        currentAction: instruction.action,
        target: instruction.target,
        progress: ((i + 1) / totalSteps) * 100,
        estimatedTimeRemaining: this.estimateTimeRemaining(i, totalSteps, result.steps)
      });

      const stepResult = await this.executeRollbackStep(instruction);
      result.steps.push(stepResult);

      if (!stepResult.success) {
        const error: RollbackError = {
          step: instruction.step,
          action: instruction.action,
          target: instruction.target,
          error: stepResult.error || 'Unknown error',
          timestamp: new Date(),
          recoverable: !instruction.rollbackOnFailure
        };
        
        result.errors.push(error);
        
        if (instruction.rollbackOnFailure) {
          throw new Error(`Critical rollback step failed: ${error.error}`);
        }
      }
    }

    // Activate the target version
    await this.versionManager.activateVersion(targetVersion.id);

    // Perform validation if configured
    if (this.config.autoValidation) {
      result.validationResults = await this.validateRollback();
    }
  }

  /**
   * Execute a single rollback step
   */
  private async executeRollbackStep(instruction: RollbackInstruction): Promise<RollbackStepResult> {
    const startTime = new Date();
    const stepResult: RollbackStepResult = {
      step: instruction.step,
      action: instruction.action,
      target: instruction.target,
      success: false,
      startTime,
      endTime: new Date(),
      duration: 0
    };

    try {
      this.emit('rollback:step_started', { step: instruction.step, action: instruction.action, target: instruction.target });

      switch (instruction.action) {
        case 'stop_service':
          await this.stopServices(instruction.target, instruction.parameters);
          break;
          
        case 'restore_files':
          await this.restoreFiles(instruction.target, instruction.parameters);
          break;
          
        case 'restore_config':
          await this.restoreConfiguration(instruction.target, instruction.parameters);
          break;
          
        case 'restore_database':
          await this.restoreDatabase(instruction.target, instruction.parameters);
          break;
          
        case 'start_service':
          await this.startService(instruction.target, instruction.parameters);
          break;
          
        case 'validate_service':
          await this.validateService(instruction.target, instruction.parameters);
          break;
          
        default:
          throw new Error(`Unknown rollback action: ${instruction.action}`);
      }

      stepResult.success = true;
      
    } catch (error) {
      stepResult.error = error instanceof Error ? error.message : String(error);
    } finally {
      stepResult.endTime = new Date();
      stepResult.duration = stepResult.endTime.getTime() - stepResult.startTime.getTime();
      
      this.emit('rollback:step_completed', stepResult);
    }

    return stepResult;
  }

  /**
   * Stop services (gracefully or all)
   */
  private async stopServices(target: string, parameters: Record<string, any>): Promise<void> {
    if (target === 'all') {
      // Stop all services in reverse dependency order
      await this.pm2Manager.stopAll();
    } else {
      // Stop specific service
      await this.pm2Manager.stopProcess(target);
    }

    // Wait for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, this.config.gracefulShutdownTimeout * 1000));
  }

  /**
   * Restore files for a service
   */
  private async restoreFiles(serviceName: string, parameters: Record<string, any>): Promise<void> {
    const { sourcePath, targetPath } = parameters;
    
    if (!sourcePath || !targetPath) {
      throw new Error('Source and target paths required for file restoration');
    }

    // Ensure target directory exists
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Copy files from backup
    await this.copyDirectory(sourcePath, targetPath);
  }

  /**
   * Restore configuration files
   */
  private async restoreConfiguration(backupPath: string, parameters: Record<string, any>): Promise<void> {
    const configFiles = [
      'brain.config.json',
      'phase1.config.json',
      'phase2.config.json',
      'phase3.config.json',
      'ecosystem.config.js'
    ];

    for (const configFile of configFiles) {
      const sourcePath = path.join(backupPath, configFile);
      const targetPath = path.join('./config', configFile);
      
      try {
        await fs.copyFile(sourcePath, targetPath);
      } catch (error) {
        // Config file might not exist in backup, continue
        console.warn(`Failed to restore config file ${configFile}:`, error);
      }
    }
  }

  /**
   * Restore database (placeholder for future implementation)
   */
  private async restoreDatabase(target: string, parameters: Record<string, any>): Promise<void> {
    // Placeholder for database restoration
    // In a real implementation, this would restore database backups
    console.log(`Database restoration not implemented for target: ${target}`);
  }

  /**
   * Start a service
   */
  private async startService(serviceName: string, parameters: Record<string, any>): Promise<void> {
    await this.pm2Manager.startProcess(serviceName);
    
    // Wait a moment for service to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Validate a service is running correctly
   */
  private async validateService(serviceName: string, parameters: Record<string, any>): Promise<void> {
    const validationResult = await this.validator.validateSingleService(serviceName);
    
    if (!validationResult.success) {
      throw new Error(`Service validation failed: ${validationResult.error}`);
    }
  }

  /**
   * Backup current version before rollback
   */
  private async backupCurrentVersion(): Promise<void> {
    const activeVersion = this.versionManager.getActiveVersion();
    if (!activeVersion) {
      return; // No active version to backup
    }

    const timestamp = Date.now();
    const backupPath = `./deployment/backups/pre-rollback-${timestamp}`;
    
    await fs.mkdir(backupPath, { recursive: true });

    // Backup current configuration
    const configBackupPath = path.join(backupPath, 'config');
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
        const backupFilePath = path.join(configBackupPath, fileName);
        await fs.copyFile(configFile, backupFilePath);
      } catch {
        // Config file might not exist
      }
    }

    this.emit('rollback:backup_created', { backupPath, versionId: activeVersion.id });
  }

  /**
   * Validate rollback completion
   */
  private async validateRollback(): Promise<any> {
    try {
      const validationResult = await this.validator.validateDeployment();
      return validationResult;
    } catch (error) {
      throw new Error(`Rollback validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Copy directory recursively
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    try {
      const stat = await fs.stat(source);
      
      if (stat.isDirectory()) {
        await fs.mkdir(target, { recursive: true });
        const files = await fs.readdir(source);
        
        for (const file of files) {
          const sourcePath = path.join(source, file);
          const targetPath = path.join(target, file);
          await this.copyDirectory(sourcePath, targetPath);
        }
      } else {
        await fs.copyFile(source, target);
      }
    } catch (error) {
      throw new Error(`Failed to copy ${source} to ${target}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Estimate time remaining for rollback
   */
  private estimateTimeRemaining(currentStep: number, totalSteps: number, completedSteps: RollbackStepResult[]): number {
    if (completedSteps.length === 0) {
      return (totalSteps - currentStep) * 10; // Rough estimate of 10 seconds per step
    }

    const averageStepTime = completedSteps.reduce((sum, step) => sum + step.duration, 0) / completedSteps.length;
    const remainingSteps = totalSteps - currentStep;
    
    return Math.round((remainingSteps * averageStepTime) / 1000); // Convert to seconds
  }

  /**
   * Get rollback status
   */
  getRollbackStatus(): {
    inProgress: boolean;
    config: RollbackConfig;
  } {
    return {
      inProgress: this.rollbackInProgress,
      config: { ...this.config }
    };
  }

  /**
   * Update rollback configuration
   */
  updateConfig(config: Partial<RollbackConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('rollback:config_updated', this.config);
  }

  /**
   * Abort rollback (emergency stop)
   */
  async abortRollback(): Promise<void> {
    if (!this.rollbackInProgress) {
      throw new Error('No rollback in progress');
    }

    this.rollbackInProgress = false;
    this.emit('rollback:aborted');
    
    // Try to start all services to restore some functionality
    try {
      await this.pm2Manager.startAll();
    } catch (error) {
      console.error('Failed to restart services after rollback abort:', error);
    }
  }

  /**
   * Get available rollback targets
   */
  getRollbackTargets(): Array<{
    versionId: string;
    version: string;
    timestamp: Date;
    services: string[];
    canRollback: boolean;
    reason?: string;
  }> {
    const targets = this.versionManager.getRollbackTargets();
    
    return targets.map(version => ({
      versionId: version.id,
      version: version.version,
      timestamp: version.timestamp,
      services: version.services.map(s => s.name),
      canRollback: this.canRollbackToVersion(version),
      reason: this.getRollbackBlockReason(version)
    }));
  }

  /**
   * Check if rollback to a specific version is possible
   */
  private canRollbackToVersion(version: DeploymentVersion): boolean {
    // Check if rollback data exists
    if (!version.rollbackData || !version.rollbackData.rollbackInstructions.length) {
      return false;
    }

    // Check if backup files exist
    try {
      // This would check if backup files actually exist
      // For now, assume they exist if rollback data is present
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get reason why rollback might be blocked
   */
  private getRollbackBlockReason(version: DeploymentVersion): string | undefined {
    if (!version.rollbackData || !version.rollbackData.rollbackInstructions.length) {
      return 'No rollback data available';
    }

    if (version.status === 'archived') {
      return 'Version is archived';
    }

    return undefined;
  }

  /**
   * Dry run rollback (simulate without making changes)
   */
  async dryRunRollback(targetVersionId: string): Promise<{
    feasible: boolean;
    estimatedDuration: number;
    steps: Array<{
      step: number;
      action: string;
      target: string;
      estimatedDuration: number;
      risks: string[];
    }>;
    risks: string[];
    blockers: string[];
  }> {
    const targetVersion = this.versionManager.getVersion(targetVersionId);
    if (!targetVersion) {
      throw new Error(`Target version not found: ${targetVersionId}`);
    }

    const instructions = targetVersion.rollbackData.rollbackInstructions;
    const steps = instructions.map(instruction => ({
      step: instruction.step,
      action: instruction.action,
      target: instruction.target,
      estimatedDuration: this.estimateStepDuration(instruction),
      risks: this.identifyStepRisks(instruction)
    }));

    const estimatedDuration = steps.reduce((sum, step) => sum + step.estimatedDuration, 0);
    const risks = this.identifyRollbackRisks(targetVersion);
    const blockers = this.identifyRollbackBlockers(targetVersion);

    return {
      feasible: blockers.length === 0,
      estimatedDuration,
      steps,
      risks,
      blockers
    };
  }

  /**
   * Estimate duration for a rollback step
   */
  private estimateStepDuration(instruction: RollbackInstruction): number {
    const baseDurations: Record<string, number> = {
      'stop_service': 10,
      'restore_files': 30,
      'restore_config': 5,
      'restore_database': 60,
      'start_service': 15,
      'validate_service': 10
    };

    return baseDurations[instruction.action] || 10;
  }

  /**
   * Identify risks for a rollback step
   */
  private identifyStepRisks(instruction: RollbackInstruction): string[] {
    const risks: string[] = [];

    switch (instruction.action) {
      case 'stop_service':
        if (instruction.target === 'all') {
          risks.push('Complete service outage during rollback');
        }
        break;
        
      case 'restore_files':
        risks.push('Potential data loss if backup is incomplete');
        break;
        
      case 'restore_database':
        risks.push('Database inconsistency if backup is stale');
        break;
        
      case 'start_service':
        risks.push('Service may fail to start with restored configuration');
        break;
    }

    return risks;
  }

  /**
   * Identify overall rollback risks
   */
  private identifyRollbackRisks(version: DeploymentVersion): string[] {
    const risks: string[] = [];
    
    const currentVersion = this.versionManager.getActiveVersion();
    if (currentVersion) {
      const timeDiff = Date.now() - version.timestamp.getTime();
      const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 7) {
        risks.push('Rolling back to version older than 7 days');
      }
      
      if (daysDiff > 30) {
        risks.push('Rolling back to version older than 30 days - high risk');
      }
    }

    return risks;
  }

  /**
   * Identify rollback blockers
   */
  private identifyRollbackBlockers(version: DeploymentVersion): string[] {
    const blockers: string[] = [];
    
    if (!this.canRollbackToVersion(version)) {
      blockers.push('Rollback data unavailable or incomplete');
    }
    
    if (this.rollbackInProgress) {
      blockers.push('Another rollback is already in progress');
    }

    return blockers;
  }
}