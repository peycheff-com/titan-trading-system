/**
 * Deployment Orchestrator
 * 
 * Manages dependency-aware deployment of Titan services with validation and health checks.
 * Implements Requirements 2.1, 2.2, 2.3 for service deployment ordering and validation.
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ServiceConfig {
  name: string;
  path: string;
  dependencies: string[];
  healthCheck: HealthCheckConfig;
  environment: Record<string, string>;
  timeout: number; // startup timeout in seconds
}

export interface HealthCheckConfig {
  type: 'http' | 'tcp' | 'redis' | 'websocket';
  endpoint?: string;
  port?: number;
  timeout: number;
  retries: number;
  interval: number;
}

export interface DeploymentResult {
  success: boolean;
  deployedServices: string[];
  failedServices: string[];
  errors: DeploymentError[];
  totalTime: number;
}

export interface DeploymentError {
  service: string;
  error: string;
  timestamp: Date;
}

export interface ServiceStatus {
  name: string;
  status: 'starting' | 'running' | 'stopped' | 'error';
  pid?: number;
  uptime?: number;
  lastHealthCheck?: Date;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown';
}

/**
 * Service Deployment Orchestrator
 * 
 * Manages the deployment of Titan services in dependency order with comprehensive
 * validation and health checking capabilities.
 */
export class DeploymentOrchestrator extends EventEmitter {
  private services: Map<string, ServiceConfig> = new Map();
  private serviceProcesses: Map<string, ChildProcess> = new Map();
  private serviceStatus: Map<string, ServiceStatus> = new Map();
  private deploymentInProgress = false;

  constructor() {
    super();
    this.initializeServiceConfigurations();
  }

  /**
   * Initialize service configurations with dependency order
   * Requirements 2.1, 2.2: Deploy Shared Infrastructure before Phase Services, Brain first
   */
  private initializeServiceConfigurations(): void {
    // Shared Infrastructure (no dependencies)
    this.services.set('shared', {
      name: 'shared',
      path: './services/shared',
      dependencies: [],
      healthCheck: {
        type: 'tcp',
        port: 3001,
        timeout: 5000,
        retries: 3,
        interval: 1000
      },
      environment: {
        NODE_ENV: 'production',
        PORT: '3001'
      },
      timeout: 30
    });

    // Security Services (depends on shared)
    this.services.set('security', {
      name: 'security',
      path: './services/security',
      dependencies: ['shared'],
      healthCheck: {
        type: 'tcp',
        port: 3002,
        timeout: 5000,
        retries: 3,
        interval: 1000
      },
      environment: {
        NODE_ENV: 'production',
        PORT: '3002'
      },
      timeout: 30
    });

    // Titan Brain (depends on shared and security)
    this.services.set('titan-brain', {
      name: 'titan-brain',
      path: './services/titan-brain',
      dependencies: ['shared', 'security'],
      healthCheck: {
        type: 'http',
        endpoint: 'http://localhost:3000/health',
        timeout: 5000,
        retries: 3,
        interval: 1000
      },
      environment: {
        NODE_ENV: 'production',
        PORT: '3000'
      },
      timeout: 30
    });

    // Titan Execution (depends on shared, security, brain)
    this.services.set('titan-execution', {
      name: 'titan-execution',
      path: './services/titan-execution',
      dependencies: ['shared', 'security', 'titan-brain'],
      healthCheck: {
        type: 'http',
        endpoint: 'http://localhost:3003/health',
        timeout: 5000,
        retries: 3,
        interval: 1000
      },
      environment: {
        NODE_ENV: 'production',
        PORT: '3003'
      },
      timeout: 30
    });

    // Phase 1 Scavenger (depends on brain and execution)
    this.services.set('titan-phase1-scavenger', {
      name: 'titan-phase1-scavenger',
      path: './services/titan-phase1-scavenger',
      dependencies: ['titan-brain', 'titan-execution'],
      healthCheck: {
        type: 'tcp',
        port: 3004,
        timeout: 5000,
        retries: 3,
        interval: 1000
      },
      environment: {
        NODE_ENV: 'production',
        PORT: '3004'
      },
      timeout: 30
    });

    // AI Quant (depends on brain)
    this.services.set('titan-ai-quant', {
      name: 'titan-ai-quant',
      path: './services/titan-ai-quant',
      dependencies: ['titan-brain'],
      healthCheck: {
        type: 'tcp',
        port: 3005,
        timeout: 5000,
        retries: 3,
        interval: 1000
      },
      environment: {
        NODE_ENV: 'production',
        PORT: '3005'
      },
      timeout: 30
    });

    // Console (depends on brain)
    this.services.set('titan-console', {
      name: 'titan-console',
      path: './services/titan-console',
      dependencies: ['titan-brain'],
      healthCheck: {
        type: 'http',
        endpoint: 'http://localhost:3006/health',
        timeout: 5000,
        retries: 3,
        interval: 1000
      },
      environment: {
        NODE_ENV: 'production',
        PORT: '3006'
      },
      timeout: 30
    });
  }

  /**
   * Deploy all services in dependency order
   * Requirement 2.1, 2.2: Proper deployment order
   */
  async deployAll(): Promise<DeploymentResult> {
    if (this.deploymentInProgress) {
      throw new Error('Deployment already in progress');
    }

    this.deploymentInProgress = true;
    const startTime = Date.now();
    const result: DeploymentResult = {
      success: true,
      deployedServices: [],
      failedServices: [],
      errors: [],
      totalTime: 0
    };

    try {
      // Calculate deployment order using topological sort
      const deploymentOrder = this.calculateDeploymentOrder();
      
      this.emit('deployment:started', { services: deploymentOrder });

      // Deploy services in order
      for (const serviceName of deploymentOrder) {
        try {
          await this.deployService(serviceName);
          result.deployedServices.push(serviceName);
          this.emit('service:deployed', { service: serviceName });
        } catch (error) {
          const deploymentError: DeploymentError = {
            service: serviceName,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date()
          };
          
          result.failedServices.push(serviceName);
          result.errors.push(deploymentError);
          result.success = false;
          
          this.emit('service:failed', deploymentError);
          
          // Stop deployment on failure
          break;
        }
      }

      result.totalTime = Date.now() - startTime;
      this.emit('deployment:completed', result);
      
      return result;
    } finally {
      this.deploymentInProgress = false;
    }
  }

  /**
   * Deploy a single service with validation
   * Requirement 2.3: Validate service starts successfully within 30 seconds
   */
  async deployService(serviceName: string): Promise<void> {
    const config = this.services.get(serviceName);
    if (!config) {
      throw new Error(`Service configuration not found: ${serviceName}`);
    }

    // Check dependencies are running
    await this.validateDependencies(config.dependencies);

    // Start the service
    await this.startService(config);

    // Validate service startup within timeout
    await this.validateServiceStartup(config);

    // Update service status
    this.serviceStatus.set(serviceName, {
      name: serviceName,
      status: 'running',
      pid: this.serviceProcesses.get(serviceName)?.pid,
      uptime: 0,
      lastHealthCheck: new Date(),
      healthStatus: 'healthy'
    });
  }

  /**
   * Calculate deployment order using topological sort
   * Ensures dependencies are deployed before dependents
   */
  private calculateDeploymentOrder(): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (serviceName: string): void => {
      if (visited.has(serviceName)) return;
      if (visiting.has(serviceName)) {
        throw new Error(`Circular dependency detected involving service: ${serviceName}`);
      }

      visiting.add(serviceName);
      
      const config = this.services.get(serviceName);
      if (config) {
        for (const dependency of config.dependencies) {
          visit(dependency);
        }
      }

      visiting.delete(serviceName);
      visited.add(serviceName);
      order.push(serviceName);
    };

    for (const serviceName of this.services.keys()) {
      visit(serviceName);
    }

    return order;
  }

  /**
   * Validate that all dependencies are running and healthy
   */
  private async validateDependencies(dependencies: string[]): Promise<void> {
    for (const dependency of dependencies) {
      const status = this.serviceStatus.get(dependency);
      if (!status || status.status !== 'running' || status.healthStatus !== 'healthy') {
        throw new Error(`Dependency not ready: ${dependency}`);
      }
    }
  }

  /**
   * Start a service process
   */
  private async startService(config: ServiceConfig): Promise<void> {
    // Check if service directory exists
    try {
      await fs.access(config.path);
    } catch {
      throw new Error(`Service directory not found: ${config.path}`);
    }

    // Check if package.json exists
    const packageJsonPath = path.join(config.path, 'package.json');
    try {
      await fs.access(packageJsonPath);
    } catch {
      throw new Error(`package.json not found in service directory: ${config.path}`);
    }

    // Start the service using npm start
    const childProcess = spawn('npm', ['start'], {
      cwd: config.path,
      env: { ...process.env, ...config.environment },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Store process reference
    this.serviceProcesses.set(config.name, childProcess);

    // Handle process events
    childProcess.on('error', (error: Error) => {
      this.emit('service:error', { service: config.name, error: error.message });
    });

    childProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.serviceProcesses.delete(config.name);
      this.emit('service:exit', { service: config.name, code, signal });
    });

    // Log service output
    childProcess.stdout?.on('data', (data: Buffer) => {
      this.emit('service:stdout', { service: config.name, data: data.toString() });
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      this.emit('service:stderr', { service: config.name, data: data.toString() });
    });
  }

  /**
   * Validate service startup within timeout period
   * Requirement 2.3: Service must start successfully within 30 seconds
   */
  private async validateServiceStartup(config: ServiceConfig): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = config.timeout * 1000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const isHealthy = await this.performHealthCheck(config.healthCheck);
        if (isHealthy) {
          return; // Service is healthy
        }
      } catch (error) {
        // Health check failed, continue trying
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, config.healthCheck.interval));
    }

    throw new Error(`Service ${config.name} failed to start within ${config.timeout} seconds`);
  }

  /**
   * Perform health check on a service
   */
  private async performHealthCheck(healthCheck: HealthCheckConfig): Promise<boolean> {
    switch (healthCheck.type) {
      case 'http':
        return this.performHttpHealthCheck(healthCheck);
      case 'tcp':
        return this.performTcpHealthCheck(healthCheck);
      case 'redis':
        return this.performRedisHealthCheck(healthCheck);
      case 'websocket':
        return this.performWebSocketHealthCheck(healthCheck);
      default:
        throw new Error(`Unsupported health check type: ${healthCheck.type}`);
    }
  }

  /**
   * Perform HTTP health check
   */
  private async performHttpHealthCheck(healthCheck: HealthCheckConfig): Promise<boolean> {
    if (!healthCheck.endpoint) {
      throw new Error('HTTP health check requires endpoint');
    }

    try {
      const response = await fetch(healthCheck.endpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(healthCheck.timeout)
      });
      
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Perform TCP health check
   */
  private async performTcpHealthCheck(healthCheck: HealthCheckConfig): Promise<boolean> {
    if (!healthCheck.port) {
      throw new Error('TCP health check requires port');
    }

    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, healthCheck.timeout);

      socket.connect(healthCheck.port, 'localhost', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Perform Redis health check
   */
  private async performRedisHealthCheck(healthCheck: HealthCheckConfig): Promise<boolean> {
    try {
      const redis = require('redis');
      const client = redis.createClient({
        socket: {
          port: healthCheck.port || 6379,
          connectTimeout: healthCheck.timeout
        }
      });

      await client.connect();
      const result = await client.ping();
      await client.disconnect();
      
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Perform WebSocket health check
   */
  private async performWebSocketHealthCheck(healthCheck: HealthCheckConfig): Promise<boolean> {
    if (!healthCheck.endpoint) {
      throw new Error('WebSocket health check requires endpoint');
    }

    return new Promise((resolve) => {
      const WebSocket = require('ws');
      const ws = new WebSocket(healthCheck.endpoint);
      
      const timeout = setTimeout(() => {
        ws.terminate();
        resolve(false);
      }, healthCheck.timeout);

      ws.on('open', () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  /**
   * Get status of all services
   */
  getServiceStatuses(): ServiceStatus[] {
    return Array.from(this.serviceStatus.values());
  }

  /**
   * Get status of a specific service
   */
  getServiceStatus(serviceName: string): ServiceStatus | undefined {
    return this.serviceStatus.get(serviceName);
  }

  /**
   * Stop a service
   */
  async stopService(serviceName: string): Promise<void> {
    const process = this.serviceProcesses.get(serviceName);
    if (process) {
      process.kill('SIGTERM');
      
      // Wait for graceful shutdown, then force kill if needed
      setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGKILL');
        }
      }, 10000); // 10 second grace period
    }

    this.serviceStatus.delete(serviceName);
    this.serviceProcesses.delete(serviceName);
  }

  /**
   * Stop all services in reverse dependency order
   */
  async stopAll(): Promise<void> {
    const deploymentOrder = this.calculateDeploymentOrder();
    const stopOrder = deploymentOrder.reverse();

    for (const serviceName of stopOrder) {
      await this.stopService(serviceName);
    }
  }
}