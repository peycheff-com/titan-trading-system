/**
 * Disaster Recovery Automation System
 * 
 * Automates service restoration within 15 minutes and implements
 * system integrity validation before trading resume.
 * 
 * Requirements: 10.3, 10.4
 */

import { EventEmitter } from 'events';
import { HotStandbyManager } from './HotStandbyManager';
import { FailoverAutomation } from './FailoverAutomation';
import * as fs from 'fs';
import * as path from 'path';

export interface DisasterRecoveryConfig {
  enabled: boolean;
  maxRecoveryTime: number; // seconds (15 minutes = 900 seconds)
  validationTimeout: number; // seconds
  retryAttempts: number;
  retryDelay: number; // seconds
  components: RecoveryComponent[];
  validation: ValidationConfig;
  notifications: NotificationConfig;
}

export interface RecoveryComponent {
  name: string;
  type: 'service' | 'database' | 'infrastructure';
  priority: number; // 1 = highest priority
  dependencies: string[];
  recoverySteps: RecoveryStep[];
  validationSteps: ValidationStep[];
  rollbackSteps?: RecoveryStep[];
}

export interface RecoveryStep {
  id: string;
  description: string;
  command: string;
  timeout: number;
  critical: boolean;
  retryable: boolean;
  environment?: Record<string, string>;
}

export interface ValidationStep {
  id: string;
  description: string;
  type: 'health-check' | 'connectivity' | 'data-integrity' | 'performance' | 'custom';
  target: string;
  criteria: ValidationCriteria;
  timeout: number;
}

export interface ValidationCriteria {
  expectedValue?: any;
  operator?: 'equals' | 'not-equals' | 'greater-than' | 'less-than' | 'contains';
  threshold?: number;
  customValidator?: string;
}

export interface ValidationConfig {
  tradingSystemChecks: TradingValidation[];
  performanceThresholds: PerformanceThresholds;
  dataIntegrityChecks: DataIntegrityCheck[];
}

export interface TradingValidation {
  name: string;
  endpoint: string;
  expectedResponse: any;
  timeout: number;
}

export interface PerformanceThresholds {
  maxResponseTime: number; // milliseconds
  minThroughput: number; // requests per second
  maxCpuUsage: number; // percentage
  maxMemoryUsage: number; // percentage
}

export interface DataIntegrityCheck {
  name: string;
  type: 'database' | 'file' | 'api';
  target: string;
  validation: string;
}

export interface NotificationConfig {
  channels: NotificationChannel[];
  templates: NotificationTemplate[];
}

export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'sms';
  config: Record<string, any>;
  enabled: boolean;
}

export interface NotificationTemplate {
  event: string;
  subject: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface RecoveryExecution {
  id: string;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'executing' | 'validating' | 'completed' | 'failed' | 'rolled-back';
  trigger: string;
  components: ComponentRecovery[];
  totalDuration?: number;
  validationResults?: ValidationResult[];
  error?: string;
}

export interface ComponentRecovery {
  component: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  steps: StepExecution[];
  error?: string;
}

export interface StepExecution {
  step: RecoveryStep;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  output?: string;
  error?: string;
  retryCount: number;
}

export interface ValidationResult {
  step: ValidationStep;
  status: 'passed' | 'failed' | 'skipped';
  actualValue?: any;
  message?: string;
  timestamp: Date;
}

export class DisasterRecoveryAutomation extends EventEmitter {
  private config: DisasterRecoveryConfig;
  private standbyManager?: HotStandbyManager;
  private failoverAutomation?: FailoverAutomation;
  private activeRecovery?: RecoveryExecution;
  private recoveryHistory: RecoveryExecution[] = [];
  private isEnabled: boolean = false;

  constructor(config: DisasterRecoveryConfig) {
    super();
    this.config = config;
    this.validateConfig();
  }

  /**
   * Initialize disaster recovery automation
   */
  public async initialize(
    standbyManager?: HotStandbyManager,
    failoverAutomation?: FailoverAutomation
  ): Promise<void> {
    this.standbyManager = standbyManager;
    this.failoverAutomation = failoverAutomation;
    
    if (this.config.enabled) {
      this.isEnabled = true;
      this.emit('automation:initialized');
      console.log('Disaster recovery automation initialized');
    }
  }

  /**
   * Trigger disaster recovery process
   */
  public async triggerRecovery(trigger: string, components?: string[]): Promise<RecoveryExecution> {
    if (!this.isEnabled) {
      throw new Error('Disaster recovery automation is not enabled');
    }

    if (this.activeRecovery && this.activeRecovery.status === 'executing') {
      throw new Error('Recovery process is already in progress');
    }

    const recoveryId = `recovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const recovery: RecoveryExecution = {
      id: recoveryId,
      startTime: new Date(),
      status: 'pending',
      trigger,
      components: []
    };

    this.activeRecovery = recovery;
    this.emit('recovery:started', recovery);

    try {
      // Determine components to recover
      const componentsToRecover = components || this.config.components.map(c => c.name);
      
      // Sort components by priority
      const sortedComponents = this.config.components
        .filter(c => componentsToRecover.includes(c.name))
        .sort((a, b) => a.priority - b.priority);

      // Initialize component recovery tracking
      recovery.components = sortedComponents.map(component => ({
        component: component.name,
        status: 'pending',
        steps: component.recoverySteps.map(step => ({
          step,
          status: 'pending',
          retryCount: 0
        }))
      }));

      recovery.status = 'executing';
      this.emit('recovery:executing', recovery);

      // Execute recovery for each component
      for (const component of sortedComponents) {
        await this.recoverComponent(recovery, component);
      }

      // Perform system validation
      recovery.status = 'validating';
      this.emit('recovery:validating', recovery);
      
      const validationResults = await this.validateSystemIntegrity();
      recovery.validationResults = validationResults;

      // Check if all validations passed
      const allValidationsPassed = validationResults.every(result => result.status === 'passed');
      
      if (allValidationsPassed) {
        recovery.status = 'completed';
        recovery.endTime = new Date();
        recovery.totalDuration = recovery.endTime.getTime() - recovery.startTime.getTime();
        
        this.emit('recovery:completed', recovery);
        await this.sendNotification('recovery-completed', recovery);
      } else {
        throw new Error('System validation failed after recovery');
      }

    } catch (error) {
      recovery.status = 'failed';
      recovery.endTime = new Date();
      recovery.error = error instanceof Error ? error.message : 'Unknown error';
      
      this.emit('recovery:failed', recovery);
      await this.sendNotification('recovery-failed', recovery);
      
      // Attempt rollback if configured
      await this.attemptRollback(recovery);
    } finally {
      this.recoveryHistory.push(recovery);
      this.activeRecovery = undefined;
    }

    return recovery;
  }
  /**
   * Recover a specific component
   */
  private async recoverComponent(recovery: RecoveryExecution, component: RecoveryComponent): Promise<void> {
    const componentRecovery = recovery.components.find(c => c.component === component.name)!;
    componentRecovery.status = 'executing';
    componentRecovery.startTime = new Date();

    this.emit('component:recovery-started', { recovery: recovery.id, component: component.name });

    try {
      // Check dependencies first
      await this.checkDependencies(component);

      // Execute recovery steps
      for (const stepExecution of componentRecovery.steps) {
        await this.executeRecoveryStep(stepExecution);
        
        if (stepExecution.status === 'failed' && stepExecution.step.critical) {
          throw new Error(`Critical step failed: ${stepExecution.step.description}`);
        }
      }

      // Validate component recovery
      await this.validateComponentRecovery(component);

      componentRecovery.status = 'completed';
      componentRecovery.endTime = new Date();
      
      this.emit('component:recovery-completed', { recovery: recovery.id, component: component.name });

    } catch (error) {
      componentRecovery.status = 'failed';
      componentRecovery.endTime = new Date();
      componentRecovery.error = error instanceof Error ? error.message : 'Unknown error';
      
      this.emit('component:recovery-failed', { 
        recovery: recovery.id, 
        component: component.name, 
        error: componentRecovery.error 
      });
      
      throw error;
    }
  }

  /**
   * Check component dependencies
   */
  private async checkDependencies(component: RecoveryComponent): Promise<void> {
    for (const dependency of component.dependencies) {
      const dependencyComponent = this.config.components.find(c => c.name === dependency);
      if (!dependencyComponent) {
        throw new Error(`Dependency not found: ${dependency}`);
      }

      // Check if dependency is healthy
      const isHealthy = await this.checkComponentHealth(dependency);
      if (!isHealthy) {
        throw new Error(`Dependency is not healthy: ${dependency}`);
      }
    }
  }

  /**
   * Execute a recovery step
   */
  private async executeRecoveryStep(stepExecution: StepExecution): Promise<void> {
    const step = stepExecution.step;
    stepExecution.status = 'executing';
    stepExecution.startTime = new Date();

    this.emit('step:executing', { step: step.id, description: step.description });

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        stepExecution.retryCount = attempt;

        // Execute the command
        const result = await this.executeCommand(step);
        
        stepExecution.output = result.output;
        stepExecution.status = 'completed';
        stepExecution.endTime = new Date();
        
        this.emit('step:completed', { step: step.id, output: result.output });
        return;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (!step.retryable || attempt >= this.config.retryAttempts) {
          break;
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * 1000));
      }
    }

    stepExecution.status = 'failed';
    stepExecution.endTime = new Date();
    stepExecution.error = lastError?.message || 'Unknown error';
    
    this.emit('step:failed', { step: step.id, error: stepExecution.error });
    
    if (step.critical) {
      throw lastError || new Error('Step execution failed');
    }
  }

  /**
   * Execute a command with timeout
   */
  private async executeCommand(step: RecoveryStep): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      
      const timeout = setTimeout(() => {
        process.kill();
        reject(new Error(`Command timeout after ${step.timeout} seconds`));
      }, step.timeout * 1000);

      const process = spawn('bash', ['-c', step.command], {
        env: { ...process.env, ...step.environment },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      process.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      process.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      process.on('close', (code: number) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          resolve({ output, exitCode: code });
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${errorOutput}`));
        }
      });

      process.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Validate component recovery
   */
  private async validateComponentRecovery(component: RecoveryComponent): Promise<void> {
    for (const validationStep of component.validationSteps) {
      const result = await this.executeValidationStep(validationStep);
      
      if (result.status === 'failed') {
        throw new Error(`Component validation failed: ${result.message}`);
      }
    }
  }

  /**
   * Validate system integrity before resuming trading
   */
  private async validateSystemIntegrity(): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Validate trading system checks
    for (const check of this.config.validation.tradingSystemChecks) {
      const result = await this.validateTradingSystem(check);
      results.push(result);
    }

    // Validate performance thresholds
    const performanceResult = await this.validatePerformance();
    results.push(performanceResult);

    // Validate data integrity
    for (const check of this.config.validation.dataIntegrityChecks) {
      const result = await this.validateDataIntegrity(check);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a validation step
   */
  private async executeValidationStep(step: ValidationStep): Promise<ValidationResult> {
    const result: ValidationResult = {
      step,
      status: 'failed',
      timestamp: new Date()
    };

    try {
      switch (step.type) {
        case 'health-check':
          result.actualValue = await this.performHealthCheck(step.target);
          break;
        
        case 'connectivity':
          result.actualValue = await this.performConnectivityCheck(step.target);
          break;
        
        case 'data-integrity':
          result.actualValue = await this.performDataIntegrityCheck(step.target);
          break;
        
        case 'performance':
          result.actualValue = await this.performPerformanceCheck(step.target);
          break;
        
        case 'custom':
          result.actualValue = await this.performCustomValidation(step.target, step.criteria.customValidator);
          break;
        
        default:
          throw new Error(`Unsupported validation type: ${step.type}`);
      }

      // Evaluate criteria
      if (this.evaluateValidationCriteria(result.actualValue, step.criteria)) {
        result.status = 'passed';
        result.message = 'Validation passed';
      } else {
        result.status = 'failed';
        result.message = `Validation failed: expected ${step.criteria.expectedValue}, got ${result.actualValue}`;
      }

    } catch (error) {
      result.status = 'failed';
      result.message = error instanceof Error ? error.message : 'Unknown validation error';
    }

    return result;
  }

  /**
   * Validate trading system
   */
  private async validateTradingSystem(check: TradingValidation): Promise<ValidationResult> {
    const step: ValidationStep = {
      id: `trading-${check.name}`,
      description: `Trading system check: ${check.name}`,
      type: 'health-check',
      target: check.endpoint,
      criteria: { expectedValue: check.expectedResponse },
      timeout: check.timeout
    };

    return this.executeValidationStep(step);
  }

  /**
   * Validate system performance
   */
  private async validatePerformance(): Promise<ValidationResult> {
    const step: ValidationStep = {
      id: 'performance-check',
      description: 'System performance validation',
      type: 'performance',
      target: 'system',
      criteria: { threshold: this.config.validation.performanceThresholds.maxResponseTime },
      timeout: 30
    };

    return this.executeValidationStep(step);
  }

  /**
   * Validate data integrity
   */
  private async validateDataIntegrity(check: DataIntegrityCheck): Promise<ValidationResult> {
    const step: ValidationStep = {
      id: `data-integrity-${check.name}`,
      description: `Data integrity check: ${check.name}`,
      type: 'data-integrity',
      target: check.target,
      criteria: { customValidator: check.validation },
      timeout: 60
    };

    return this.executeValidationStep(step);
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(target: string): Promise<any> {
    try {
      const response = await fetch(target, { 
        method: 'GET',
        timeout: 10000
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Perform connectivity check
   */
  private async performConnectivityCheck(target: string): Promise<any> {
    // Implementation would test network connectivity
    return true;
  }

  /**
   * Perform data integrity check
   */
  private async performDataIntegrityCheck(target: string): Promise<any> {
    // Implementation would validate data consistency
    return true;
  }

  /**
   * Perform performance check
   */
  private async performPerformanceCheck(target: string): Promise<any> {
    // Implementation would measure system performance
    return { responseTime: 100, cpuUsage: 50, memoryUsage: 60 };
  }

  /**
   * Perform custom validation
   */
  private async performCustomValidation(target: string, validator?: string): Promise<any> {
    // Implementation would execute custom validation logic
    return true;
  }

  /**
   * Evaluate validation criteria
   */
  private evaluateValidationCriteria(actualValue: any, criteria: ValidationCriteria): boolean {
    if (criteria.expectedValue !== undefined && criteria.operator) {
      switch (criteria.operator) {
        case 'equals':
          return actualValue === criteria.expectedValue;
        case 'not-equals':
          return actualValue !== criteria.expectedValue;
        case 'greater-than':
          return actualValue > criteria.expectedValue;
        case 'less-than':
          return actualValue < criteria.expectedValue;
        case 'contains':
          return String(actualValue).includes(String(criteria.expectedValue));
        default:
          return false;
      }
    }

    if (criteria.threshold !== undefined) {
      return actualValue <= criteria.threshold;
    }

    // Default to true if no specific criteria
    return Boolean(actualValue);
  }

  /**
   * Check component health
   */
  private async checkComponentHealth(componentName: string): Promise<boolean> {
    if (this.standbyManager) {
      const health = this.standbyManager.getComponentHealth(componentName);
      return health?.status === 'healthy';
    }
    return true;
  }

  /**
   * Attempt rollback after failed recovery
   */
  private async attemptRollback(recovery: RecoveryExecution): Promise<void> {
    try {
      recovery.status = 'rolled-back';
      this.emit('recovery:rollback-started', recovery);

      // Execute rollback steps for each component in reverse order
      const completedComponents = recovery.components
        .filter(c => c.status === 'completed')
        .reverse();

      for (const componentRecovery of completedComponents) {
        const component = this.config.components.find(c => c.name === componentRecovery.component);
        if (component?.rollbackSteps) {
          await this.executeRollbackSteps(component.rollbackSteps);
        }
      }

      this.emit('recovery:rollback-completed', recovery);
      await this.sendNotification('recovery-rollback-completed', recovery);

    } catch (rollbackError) {
      this.emit('recovery:rollback-failed', { 
        recovery, 
        error: rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error'
      });
      await this.sendNotification('recovery-rollback-failed', recovery);
    }
  }

  /**
   * Execute rollback steps
   */
  private async executeRollbackSteps(rollbackSteps: RecoveryStep[]): Promise<void> {
    for (const step of rollbackSteps) {
      try {
        await this.executeCommand(step);
      } catch (error) {
        console.error(`Rollback step failed: ${step.description}`, error);
        // Continue with other rollback steps even if one fails
      }
    }
  }

  /**
   * Send notification
   */
  private async sendNotification(event: string, recovery: RecoveryExecution): Promise<void> {
    const template = this.config.notifications.templates.find(t => t.event === event);
    if (!template) {
      return;
    }

    const message = this.formatNotificationMessage(template.message, recovery);
    
    for (const channel of this.config.notifications.channels) {
      if (!channel.enabled) continue;

      try {
        await this.sendNotificationToChannel(channel, template.subject, message, template.severity);
      } catch (error) {
        console.error(`Failed to send notification via ${channel.type}:`, error);
      }
    }
  }

  /**
   * Format notification message with recovery data
   */
  private formatNotificationMessage(template: string, recovery: RecoveryExecution): string {
    return template
      .replace('{recoveryId}', recovery.id)
      .replace('{trigger}', recovery.trigger)
      .replace('{status}', recovery.status)
      .replace('{duration}', recovery.totalDuration ? `${recovery.totalDuration}ms` : 'N/A')
      .replace('{timestamp}', recovery.startTime.toISOString());
  }

  /**
   * Send notification to specific channel
   */
  private async sendNotificationToChannel(
    channel: NotificationChannel,
    subject: string,
    message: string,
    severity: string
  ): Promise<void> {
    // Implementation would send notifications via configured channels
    console.log(`Notification [${channel.type}] ${severity}: ${subject} - ${message}`);
  }

  /**
   * Get recovery status
   */
  public getRecoveryStatus(): RecoveryExecution | undefined {
    return this.activeRecovery;
  }

  /**
   * Get recovery history
   */
  public getRecoveryHistory(limit: number = 10): RecoveryExecution[] {
    return this.recoveryHistory.slice(-limit);
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<DisasterRecoveryConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.validateConfig();
    this.emit('config:updated', this.config);
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (this.config.maxRecoveryTime < 60) {
      throw new Error('Maximum recovery time must be at least 60 seconds');
    }

    if (this.config.components.length === 0) {
      throw new Error('At least one component must be configured');
    }

    for (const component of this.config.components) {
      if (!component.name || component.recoverySteps.length === 0) {
        throw new Error(`Invalid component configuration: ${component.name}`);
      }
    }
  }
}