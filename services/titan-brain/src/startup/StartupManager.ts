/**
 * StartupManager - Reliable service initialization
 *
 * Ensures reliable service initialization with proper error handling,
 * timeout management, and graceful shutdown.
 *
 * Deployment Target: DigitalOcean (Docker Compose)
 * Requirements: 1.2.1, 1.2.2, 1.2.3, 1.2.4, 1.2.5
 */

import { EventEmitter } from 'events';
import { Logger } from '../logging/Logger.js';
import { PlatformAdapter } from './platforms/PlatformAdapter.js';
import { PlatformFactory } from './platforms/PlatformFactory.js';

/**
 * Startup step status
 */
export enum StartupStatus {
  STARTING = "STARTING",
  RUNNING = "RUNNING",
  READY = "READY",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
  PENDING = "PENDING",
  COMPLETED = "COMPLETED"
}

/**
 * Individual startup step
 */
export interface StartupStep {
  name: string;
  description: string;
  timeout: number;
  required: boolean;
  dependencies: string[];
  execute: () => Promise<void>;
}

/**
 * Startup step result
 */
export interface StartupStepResult {
  name: string;
  status: StartupStatus;
  duration: number;
  error?: Error;
  timestamp: number;
}

/**
 * Startup manager configuration
 */
export interface StartupManagerConfig {
  maxStartupTime: number;
  stepTimeout: number;
  maxRetries: number;
  retryDelay: number;
  gracefulShutdownTimeout: number;
  validateEnvironment: boolean;
}

/**
 * Environment validation result
 */
export interface EnvironmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  requiredVariables: string[];
  optionalVariables: string[];
}

/**
 * Startup manager for reliable service initialization
 */
export class StartupManager extends EventEmitter {
  private steps: Map<string, StartupStep> = new Map();
  private results: Map<string, StartupStepResult> = new Map();
  private config: StartupManagerConfig;
  private logger: Logger;
  private startTime: number = 0;
  private isStarted: boolean = false;
  private isShuttingDown: boolean = false;
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private signalHandlers: Map<string, (...args: any[]) => void> = new Map();

  private platform: PlatformAdapter;

  constructor(config: Partial<StartupManagerConfig> = {}, logger?: Logger) {
    super();

    this.logger = logger ?? Logger.getInstance('startup-manager');
    
    // Initialize Platform Adapter
    this.platform = PlatformFactory.getAdapter();
    this.logger.info(`Initializing StartupManager on platform: ${this.platform.getName()}`);

    this.config = {
      maxStartupTime: config.maxStartupTime || 60000, // 60 seconds
      stepTimeout: config.stepTimeout || 30000, // 30 seconds
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000, // 1 second
      gracefulShutdownTimeout: config.gracefulShutdownTimeout || 10000, // 10 seconds
      validateEnvironment: config.validateEnvironment ?? true,
    };

    // Setup process signal handlers
    this.setupSignalHandlers();
  }

  /**
   * Register a startup step
   */
  registerStep(step: StartupStep): void {
    if (this.isStarted) {
      throw new Error('Cannot register steps after startup has begun');
    }

    this.steps.set(step.name, step);
    this.emit('step:registered', { name: step.name });

    this.logger.debug(`Startup step registered: ${step.name}`, undefined, {
      description: step.description,
      timeout: step.timeout,
      required: step.required,
      dependencies: step.dependencies,
    });
  }

  /**
   * Register a shutdown handler
   */
  registerShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Start the initialization process
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('Startup manager has already been started');
    }

    this.isStarted = true;

    this.startTime = Date.now();

    this.logger.info('Starting service initialization', undefined, {
      totalSteps: this.steps.size,
      maxStartupTime: this.config.maxStartupTime,
    });

    this.emit('startup:started');

    try {
      // Validate environment if enabled
      if (this.config.validateEnvironment) {
        await this.validateEnvironment();
      }

      // Execute startup steps
      await this.executeSteps();

      const duration = Date.now() - this.startTime;

      this.logger.info('Service initialization completed successfully', undefined, {
        duration,
        completedSteps: Array.from(this.results.values()).filter(
          (r) => r.status === StartupStatus.COMPLETED,
        ).length,
        failedSteps: Array.from(this.results.values()).filter(
          (r) => r.status === StartupStatus.FAILED,
        ).length,
      });

      this.emit('startup:completed', { duration });
    } catch (error) {
      const duration = Date.now() - this.startTime;

      this.logger.error(
        'Service initialization failed',
        error instanceof Error ? error : new Error(String(error)),
        undefined,
        {
          duration,
          completedSteps: Array.from(this.results.values()).filter(
            (r) => r.status === StartupStatus.COMPLETED,
          ).length,
          failedSteps: Array.from(this.results.values()).filter(
            (r) => r.status === StartupStatus.FAILED,
          ).length,
        },
      );

      this.emit('startup:failed', { error, duration });
      throw error;
    }
  }

  /**
   * Validate environment variables
   */
  private async validateEnvironment(): Promise<void> {
    this.logger.info('Validating environment configuration');

    // Auto-construct URLs from parts if missing
    if (
      !process.env.DATABASE_URL &&
      process.env.TITAN_DB_USER &&
      process.env.TITAN_DB_PASSWORD &&
      process.env.TITAN_DB_HOST &&
      process.env.TITAN_DB_NAME
    ) {
      process.env.DATABASE_URL = `postgres://${process.env.TITAN_DB_USER}:${process.env.TITAN_DB_PASSWORD}@${process.env.TITAN_DB_HOST}:${
        process.env.TITAN_DB_PORT || 5432
      }/${process.env.TITAN_DB_NAME}`;
    }
    if (!process.env.REDIS_URL && process.env.TITAN_REDIS_HOST) {
      process.env.REDIS_URL = `redis://${process.env.TITAN_REDIS_HOST}:${
        process.env.TITAN_REDIS_PORT || 6379
      }`;
    }

    const requiredVariables = ['NODE_ENV', 'PORT', 'DATABASE_URL'];

    const optionalVariables = [
      'REDIS_URL',
      'HMAC_SECRET',
      'LOG_LEVEL',
      'RATE_LIMIT_WINDOW_MS',
      'RATE_LIMIT_MAX_REQUESTS',
    ];

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required variables
    for (const variable of requiredVariables) {
      if (!process.env[variable]) {
        errors.push(`Required environment variable ${variable} is not set`);
      }
    }

    // Check optional variables and warn if missing
    for (const variable of optionalVariables) {
      if (!process.env[variable]) {
        warnings.push(`Optional environment variable ${variable} is not set`);
      }
    }

    // Validate specific values
    if (
      process.env.NODE_ENV &&
      !['development', 'production', 'test'].includes(process.env.NODE_ENV)
    ) {
      errors.push(
        `NODE_ENV must be one of: development, production, test. Got: ${process.env.NODE_ENV}`,
      );
    }

    if (process.env.PORT) {
      const port = parseInt(process.env.PORT, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        errors.push(`PORT must be a valid port number (1-65535). Got: ${process.env.PORT}`);
      }
    }

    if (
      process.env.LOG_LEVEL &&
      !['fatal', 'error', 'warn', 'info', 'debug', 'trace'].includes(process.env.LOG_LEVEL)
    ) {
      warnings.push(
        `LOG_LEVEL should be one of: fatal, error, warn, info, debug, trace. Got: ${process.env.LOG_LEVEL}`,
      );
    }

    const result: EnvironmentValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      requiredVariables,
      optionalVariables,
    };

    // Log warnings
    for (const warning of warnings) {
      this.logger.warn(warning);
    }

    // Log configuration summary (mask sensitive values)
    const configSummary = {
      NODE_ENV: process.env.NODE_ENV,
      PORT: process.env.PORT,
      DATABASE_URL: process.env.DATABASE_URL ? '[CONFIGURED]' : '[NOT SET]',
      REDIS_URL: process.env.REDIS_URL ? '[CONFIGURED]' : '[NOT SET]',
      HMAC_SECRET: process.env.HMAC_SECRET ? '[CONFIGURED]' : '[NOT SET]',
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    };

    this.logger.info('Environment configuration summary', undefined, configSummary);

    this.emit('environment:validated', result);

    if (!result.valid) {
      const error = new Error(`Environment validation failed: ${errors.join(', ')}`);
      this.logger.error('Environment validation failed', error, undefined, {
        errors,
        warnings,
      });
      throw error;
    }

    this.logger.info('Environment validation completed successfully', undefined, {
      warningCount: warnings.length,
    });
  }

  /**
   * Execute all startup steps in dependency order
   */
  private async executeSteps(): Promise<void> {
    const executionOrder = this.calculateExecutionOrder();

    this.logger.info('Executing startup steps', undefined, {
      executionOrder,
      totalSteps: executionOrder.length,
    });

    for (const stepName of executionOrder) {
      const step = this.steps.get(stepName);
      if (!step) {
        throw new Error(`Step ${stepName} not found`);
      }

      await this.executeStep(step);

      // Check if we've exceeded the maximum startup time
      const elapsed = Date.now() - this.startTime;
      if (elapsed > this.config.maxStartupTime) {
        throw new Error(`Startup timeout exceeded: ${elapsed}ms > ${this.config.maxStartupTime}ms`);
      }
    }
  }

  /**
   * Calculate execution order based on dependencies
   */
  private calculateExecutionOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (stepName: string): void => {
      if (visiting.has(stepName)) {
        throw new Error(`Circular dependency detected involving step: ${stepName}`);
      }

      if (visited.has(stepName)) {
        return;
      }

      visiting.add(stepName);

      const step = this.steps.get(stepName);
      if (!step) {
        throw new Error(`Step ${stepName} not found`);
      }

      // Visit dependencies first
      for (const dependency of step.dependencies) {
        if (!this.steps.has(dependency)) {
          throw new Error(`Dependency ${dependency} for step ${stepName} not found`);
        }
        visit(dependency);
      }

      visiting.delete(stepName);

      visited.add(stepName);

      order.push(stepName);
    };

    // Visit all steps
    for (const stepName of this.steps.keys()) {
      visit(stepName);
    }

    return order;
  }

  /**
   * Execute a single startup step with retry logic
   */
  private async executeStep(step: StartupStep): Promise<void> {
    const startTime = Date.now();

    this.logger.info(`Executing startup step: ${step.name}`, undefined, {
      description: step.description,
      timeout: step.timeout,
      required: step.required,
    });

    this.emit('step:started', { name: step.name });

    let lastError: Error | undefined;

    let attempt = 0;

    while (attempt < this.config.maxRetries) {
      attempt++;

      try {
        // Execute step with timeout
        await Promise.race([
          step.execute(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Step timeout: ${step.name}`)), step.timeout),
          ),
        ]);

        const duration = Date.now() - startTime;
        const result: StartupStepResult = {
          name: step.name,
          status: StartupStatus.COMPLETED,
          duration,
          timestamp: Date.now(),
        };

        this.results.set(step.name, result);

        this.logger.info(`Startup step completed: ${step.name}`, undefined, {
          duration,
          attempt,
        });

        this.emit('step:completed', result);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        this.logger.warn(
          `Startup step failed (attempt ${attempt}/${this.config.maxRetries}): ${step.name}`,
          undefined,
          {
            attempt,
            maxRetries: this.config.maxRetries,
          },
        );

        if (attempt < this.config.maxRetries) {
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay * attempt));
        }
      }
    }

    // All retries failed
    const duration = Date.now() - startTime;
    const result: StartupStepResult = {
      name: step.name,
      status: StartupStatus.FAILED,
      duration,
      error: lastError,
      timestamp: Date.now(),
    };

    this.results.set(step.name, result);

    this.logger.error(`Startup step failed permanently: ${step.name}`, lastError!, undefined, {
      duration,
      attempts: attempt,
      required: step.required,
    });

    this.emit('step:failed', result);

    if (step.required) {
      throw new Error(`Required startup step failed: ${step.name} - ${lastError?.message}`);
    } else {
      this.logger.warn(`Optional startup step failed, continuing: ${step.name}`);
    }
  }

  /**
   * Setup process signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    // Increase max listeners to prevent warnings in tests
    process.setMaxListeners(20);

    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'] as const;

    // Store handlers for cleanup

    this.signalHandlers = new Map();

    for (const signal of signals) {
      const handler = async () => {
        this.logger.info(`Received ${signal}, initiating graceful shutdown`);
        await this.shutdown();
        process.exit(0);
      };

      this.signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }

    // Handle uncaught exceptions
    const uncaughtHandler = (error: Error) => {
      this.logger.error('Uncaught exception, shutting down', error);
      this.shutdown().finally(() => process.exit(1));
    };

    this.signalHandlers.set('uncaughtException', uncaughtHandler);
    process.on('uncaughtException', uncaughtHandler);

    // Handle unhandled promise rejections
    const rejectionHandler = (reason: any, promise: Promise<any>) => {
      this.logger.error(
        'Unhandled promise rejection, shutting down',
        new Error(String(reason)),
        undefined,
        {
          promise: promise.toString(),
        },
      );
      this.shutdown().finally(() => process.exit(1));
    };

    this.signalHandlers.set('unhandledRejection', rejectionHandler);
    process.on('unhandledRejection', rejectionHandler);
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    const shutdownStart = Date.now();

    this.logger.info('Starting graceful shutdown', undefined, {
      shutdownHandlers: this.shutdownHandlers.length,
      timeout: this.config.gracefulShutdownTimeout,
    });

    this.emit('shutdown:started');

    try {
      // Clean up signal handlers first
      this.cleanupSignalHandlers();

      // Execute shutdown handlers with timeout
      await Promise.race([
        this.executeShutdownHandlers(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Shutdown timeout')),
            this.config.gracefulShutdownTimeout,
          ),
        ),
      ]);

      const duration = Date.now() - shutdownStart;

      this.logger.info('Graceful shutdown completed', undefined, { duration });
      this.emit('shutdown:completed', { duration });
    } catch (error) {
      const duration = Date.now() - shutdownStart;

      this.logger.error(
        'Graceful shutdown failed',
        error instanceof Error ? error : new Error(String(error)),
        undefined,
        {
          duration,
        },
      );

      this.emit('shutdown:failed', { error, duration });
      throw error;
    }
  }

  /**
   * Clean up signal handlers
   */
  private cleanupSignalHandlers(): void {
    for (const [event, handler] of this.signalHandlers) {
      try {
        process.removeListener(event, handler);
      } catch (error) {
        // Ignore cleanup errors
        this.logger.debug('Failed to remove signal listener', undefined, { error: error instanceof Error ? error.message : String(error) });
      }
    }

    this.signalHandlers.clear();
  }

  /**
   * Execute all shutdown handlers
   */
  private async executeShutdownHandlers(): Promise<void> {
    const promises = this.shutdownHandlers.map(async (handler, index) => {
      try {
        await handler();
        this.logger.debug(`Shutdown handler ${index} completed`);
      } catch (error) {
        this.logger.error(
          `Shutdown handler ${index} failed`,
          error instanceof Error ? error : new Error(String(error)),
        );
        throw error;
      }
    });

    await Promise.all(promises);
  }

  /**
   * Get startup results
   */
  getResults(): StartupStepResult[] {
    return Array.from(this.results.values());
  }

  /**
   * Get startup duration
   */
  getStartupDuration(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0;
  }

  /**
   * Check if startup is complete
   */
  isStartupComplete(): boolean {
    if (!this.isStarted) return false;

    const requiredSteps = Array.from(this.steps.values()).filter((step) => step.required);
    const completedRequiredSteps = Array.from(this.results.values()).filter(
      (result) =>
        result.status === StartupStatus.COMPLETED && this.steps.get(result.name)?.required,
    );

    return completedRequiredSteps.length === requiredSteps.length;
  }

  /**
   * Get startup status summary
   */
  getStatusSummary(): {
    started: boolean;
    completed: boolean;
    failed: boolean;
    duration: number;
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    pendingSteps: number;
  } {
    const results = Array.from(this.results.values());

    return {
      started: this.isStarted,
      completed: this.isStartupComplete(),
      failed: results.some(
        (r) => r.status === StartupStatus.FAILED && this.steps.get(r.name)?.required,
      ),
      duration: this.getStartupDuration(),
      totalSteps: this.steps.size,
      completedSteps: results.filter((r) => r.status === StartupStatus.COMPLETED).length,
      failedSteps: results.filter((r) => r.status === StartupStatus.FAILED).length,
      pendingSteps: this.steps.size - results.length,
    };
  }
}
