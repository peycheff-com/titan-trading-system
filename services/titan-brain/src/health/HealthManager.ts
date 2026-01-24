/**
 * HealthManager - Comprehensive health monitoring
 *
 * Provides health checks for all system components including database,
 * Redis, configuration, and memory usage.
 *
 * Requirements: 1.1.1, 1.1.2, 1.1.3, 1.1.4, 1.1.5
 */

import { EventEmitter } from 'events';

/**
 * Health status levels
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * Individual component health result
 */
export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message: string;
  duration: number;
  timestamp: number;
  details?: Record<string, any>;
}

/**
 * Overall system health result
 */
export interface SystemHealth {
  status: HealthStatus;
  timestamp: number;
  duration: number;
  components: ComponentHealth[];
  version: string;
  uptime: number;
}

/**
 * Health check component interface
 */
export interface HealthComponent {
  name: string;
  check(): Promise<ComponentHealth>;
  isRequired: boolean;
  timeout: number;
}

/**
 * Health manager configuration
 */
export interface HealthManagerConfig {
  checkInterval: number;
  componentTimeout: number;
  maxConcurrentChecks: number;
  cacheHealthResults: boolean;
  cacheTtl: number;
}

/**
 * Database health component
 */
export class DatabaseHealthComponent implements HealthComponent {
  name = 'database';
  isRequired = true;
  timeout = 5000;

  constructor(private databaseManager: any) {}

  async check(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      if (!this.databaseManager) {
        return {
          name: this.name,
          status: HealthStatus.UNHEALTHY,
          message: 'Database manager not initialized',
          duration: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      const hasHealthCheck = typeof this.databaseManager.healthCheck === 'function';
      const hasIsConnected = typeof this.databaseManager.isConnected === 'function';
      const isHealthy = hasHealthCheck
        ? await this.databaseManager.healthCheck()
        : hasIsConnected
          ? this.databaseManager.isConnected()
          : false;
      const metrics =
        typeof this.databaseManager.getMetrics === 'function'
          ? this.databaseManager.getMetrics()
          : null;
      const poolStats =
        typeof this.databaseManager.getPoolStats === 'function'
          ? this.databaseManager.getPoolStats()
          : null;

      if (!isHealthy) {
        return {
          name: this.name,
          status: HealthStatus.UNHEALTHY,
          message: 'Database connection unhealthy',
          duration: Date.now() - startTime,
          timestamp: Date.now(),
          details: {
            ...(metrics ?? {}),
            ...(poolStats ?? {}),
          },
        };
      }

      return {
        name: this.name,
        status: HealthStatus.HEALTHY,
        message: 'Database connection healthy',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        details: {
          ...(metrics ?? {}),
          ...(poolStats ?? {}),
        },
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.UNHEALTHY,
        message: error instanceof Error ? error.message : 'Database check failed',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  }
}

/**
 * Configuration health component
 */
export class ConfigHealthComponent implements HealthComponent {
  name = 'configuration';
  isRequired = true;
  timeout = 1000;

  constructor(private config: any) {}

  async check(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const nodeEnv = this.config?.nodeEnv || process.env.NODE_ENV;
      const port = this.config?.port;

      if (!port) {
        return {
          name: this.name,
          status: HealthStatus.UNHEALTHY,
          message: 'Missing required configuration: port',
          duration: Date.now() - startTime,
          timestamp: Date.now(),
          details: { missingFields: ['port'] },
        };
      }

      return {
        name: this.name,
        status: HealthStatus.HEALTHY,
        message: 'Configuration valid',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        details: {
          nodeEnv: nodeEnv || 'unknown',
          port,
        },
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.UNHEALTHY,
        message: error instanceof Error ? error.message : 'Configuration check failed',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  }
}

/**
 * Memory health component
 */
export class MemoryHealthComponent implements HealthComponent {
  name = 'memory';
  isRequired = false;
  timeout = 1000;

  private readonly WARNING_THRESHOLD = 0.8; // 80% memory usage
  private readonly CRITICAL_THRESHOLD = 0.9; // 90% memory usage

  async check(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const memUsage = process.memoryUsage();
      const totalMemory = memUsage.heapTotal;
      const usedMemory = memUsage.heapUsed;
      const memoryUsageRatio = usedMemory / totalMemory;

       
      let status = HealthStatus.HEALTHY;
       
      let message = 'Memory usage normal';

      if (memoryUsageRatio > this.CRITICAL_THRESHOLD) {
        status = HealthStatus.UNHEALTHY;
        message = `Critical memory usage: ${(memoryUsageRatio * 100).toFixed(1)}%`;
      } else if (memoryUsageRatio > this.WARNING_THRESHOLD) {
        status = HealthStatus.DEGRADED;
        message = `High memory usage: ${(memoryUsageRatio * 100).toFixed(1)}%`;
      }

      return {
        name: this.name,
        status,
        message,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
        details: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
          external: Math.round(memUsage.external / 1024 / 1024), // MB
          rss: Math.round(memUsage.rss / 1024 / 1024), // MB
          usagePercentage: Math.round(memoryUsageRatio * 100),
        },
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.UNHEALTHY,
        message: error instanceof Error ? error.message : 'Memory check failed',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  }
}

/**
 * Redis health component (optional)
 */
export class RedisHealthComponent implements HealthComponent {
  name = 'redis';
  isRequired = false;
  timeout = 3000;

  constructor(private cacheManager?: any) {}

  async check(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      if (!this.cacheManager) {
        return {
          name: this.name,
          status: HealthStatus.DEGRADED,
          message: 'Redis not configured (using in-memory fallback)',
          duration: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      const isHealthy = await this.cacheManager.isHealthy();

      if (!isHealthy) {
        return {
          name: this.name,
          status: HealthStatus.DEGRADED,
          message: 'Redis unavailable (using in-memory fallback)',
          duration: Date.now() - startTime,
          timestamp: Date.now(),
        };
      }

      return {
        name: this.name,
        status: HealthStatus.HEALTHY,
        message: 'Redis connection healthy',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        name: this.name,
        status: HealthStatus.DEGRADED,
        message: 'Redis check failed (using in-memory fallback)',
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  }
}

/**
 * Health manager for comprehensive system health monitoring
 */
export class HealthManager extends EventEmitter {
  private components: Map<string, HealthComponent> = new Map();
  private lastHealthCheck: SystemHealth | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private startTime: number = Date.now();
  private config: HealthManagerConfig;

  constructor(config: Partial<HealthManagerConfig> = {}) {
    super();

    this.config = {
      checkInterval: config.checkInterval || 30000, // 30 seconds
      componentTimeout: config.componentTimeout || 5000, // 5 seconds
      maxConcurrentChecks: config.maxConcurrentChecks || 10,
      cacheHealthResults: config.cacheHealthResults ?? true,
      cacheTtl: config.cacheTtl || 10000, // 10 seconds
    };
  }

  /**
   * Register a health component
   */
  registerComponent(component: HealthComponent): void {
     
    this.components.set(component.name, component);
    this.emit('component:registered', { name: component.name });
  }

  /**
   * Unregister a health component
   */
  unregisterComponent(name: string): void {
     
    this.components.delete(name);
    this.emit('component:unregistered', { name });
  }

  /**
   * Perform health check on all components
   */
  async checkHealth(): Promise<SystemHealth> {
    const startTime = Date.now();

    // Return cached result if available and fresh
    if (this.config.cacheHealthResults && this.lastHealthCheck) {
      const age = Date.now() - this.lastHealthCheck.timestamp;
      if (age < this.config.cacheTtl) {
        return this.lastHealthCheck;
      }
    }

    const componentChecks = Array.from(this.components.values()).map((component) =>
      this.checkComponent(component),
    );

    const componentResults = await Promise.all(componentChecks);

    // Determine overall system health
    const overallStatus = this.determineOverallStatus(componentResults);

    const systemHealth: SystemHealth = {
      status: overallStatus,
      timestamp: Date.now(),
      duration: Date.now() - startTime,
      components: componentResults,
      version: process.env.npm_package_version || '1.0.0',
      uptime: Date.now() - this.startTime,
    };

     
    this.lastHealthCheck = systemHealth;
    this.emit('health:checked', systemHealth);

    return systemHealth;
  }

  /**
   * Check individual component with timeout
   */
  private async checkComponent(component: HealthComponent): Promise<ComponentHealth> {
    try {
      const timeout = component.timeout || this.config.componentTimeout;

      const result = await Promise.race([
        component.check(),
        new Promise<ComponentHealth>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), timeout),
        ),
      ]);

      this.emit('component:checked', result);
      return result;
    } catch (error) {
      const result: ComponentHealth = {
        name: component.name,
        status: HealthStatus.UNHEALTHY,
        message: error instanceof Error ? error.message : 'Component check failed',
        duration: component.timeout || this.config.componentTimeout,
        timestamp: Date.now(),
      };

      this.emit('component:failed', result);
      return result;
    }
  }

  /**
   * Determine overall system health status
   */
  private determineOverallStatus(components: ComponentHealth[]): HealthStatus {
    const requiredComponents = components.filter((c) => {
      const component = this.components.get(c.name);
      return component?.isRequired ?? true;
    });

    // If any required component is unhealthy, system is unhealthy
    if (requiredComponents.some((c) => c.status === HealthStatus.UNHEALTHY)) {
      return HealthStatus.UNHEALTHY;
    }

    // If any component is degraded, system is degraded
    if (components.some((c) => c.status === HealthStatus.DEGRADED)) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

     
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        this.emit('health:error', error);
      }
    }, this.config.checkInterval);

    this.emit('periodic:started', { interval: this.config.checkInterval });
  }

  /**
   * Stop periodic health checks
   */
  stopPeriodicChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
       
      this.healthCheckInterval = null;
    }

    this.emit('periodic:stopped');
  }

  /**
   * Get the last health check result
   */
  getLastHealthCheck(): SystemHealth | null {
    return this.lastHealthCheck;
  }

  /**
   * Check if system is healthy
   */
  isHealthy(): boolean {
    return this.lastHealthCheck?.status === HealthStatus.HEALTHY;
  }

  /**
   * Get system uptime in milliseconds
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Shutdown health manager
   */
  shutdown(): void {
    this.stopPeriodicChecks();
     
    this.components.clear();
     
    this.lastHealthCheck = null;
    this.emit('shutdown');
  }
}
