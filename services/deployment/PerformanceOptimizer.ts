/**
 * Performance Optimizer
 * 
 * Main orchestrator for all performance optimizations including Node.js,
 * Redis, and system-level optimizations for high-frequency trading operations.
 */

import { EventEmitter } from 'events';
import { NodeJSOptimizer, NodeJSOptimizationConfig, DEFAULT_NODEJS_CONFIG } from './NodeJSOptimizer';
import { RedisOptimizer, RedisOptimizationConfig, DEFAULT_REDIS_CONFIG } from './RedisOptimizer';
import { SystemOptimizer, SystemOptimizationConfig, DEFAULT_SYSTEM_CONFIG } from './SystemOptimizer';

export interface PerformanceOptimizationConfig {
  nodejs: NodeJSOptimizationConfig;
  redis: RedisOptimizationConfig;
  system: SystemOptimizationConfig;
  dataDir?: string;
}

export interface PerformanceMetrics {
  nodejs: any; // NodeJS metrics
  redis: any; // Redis metrics
  system: any; // System metrics
  overall: {
    status: 'optimal' | 'good' | 'warning' | 'critical';
    score: number; // 0-100
    recommendations: string[];
  };
}

export interface OptimizationResult {
  success: boolean;
  appliedOptimizations: string[];
  errors: string[];
  warnings: string[];
  timestamp: Date;
}

/**
 * Performance Optimizer
 * 
 * Orchestrates all performance optimizations for the Titan Trading System:
 * - Node.js runtime optimizations and connection pooling
 * - Redis memory and persistence optimization
 * - System-level kernel and log rotation optimization
 */
export class PerformanceOptimizer extends EventEmitter {
  private config: PerformanceOptimizationConfig;
  private nodejsOptimizer: NodeJSOptimizer;
  private redisOptimizer: RedisOptimizer;
  private systemOptimizer: SystemOptimizer;
  private isOptimized: boolean = false;

  constructor(config?: Partial<PerformanceOptimizationConfig>) {
    super();
    
    this.config = {
      nodejs: { ...DEFAULT_NODEJS_CONFIG, ...config?.nodejs },
      redis: { ...DEFAULT_REDIS_CONFIG, ...config?.redis },
      system: { ...DEFAULT_SYSTEM_CONFIG, ...config?.system },
      dataDir: config?.dataDir || '/var/lib/titan'
    };
    
    this.nodejsOptimizer = new NodeJSOptimizer(this.config.nodejs);
    this.redisOptimizer = new RedisOptimizer(this.config.redis, this.config.dataDir);
    this.systemOptimizer = new SystemOptimizer(this.config.system);
    
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for all optimizers
   */
  private setupEventHandlers(): void {
    // Node.js optimizer events
    this.nodejsOptimizer.on('optimizations-applied', (data) => {
      this.emit('nodejs-optimized', data);
    });
    
    this.nodejsOptimizer.on('optimization-error', (data) => {
      this.emit('nodejs-error', data);
    });
    
    this.nodejsOptimizer.on('threshold-warning', (data) => {
      this.emit('performance-warning', { source: 'nodejs', ...data });
    });
    
    // Redis optimizer events
    this.redisOptimizer.on('optimizations-applied', (data) => {
      this.emit('redis-optimized', data);
    });
    
    this.redisOptimizer.on('optimization-error', (data) => {
      this.emit('redis-error', data);
    });
    
    this.redisOptimizer.on('redis-started', (data) => {
      this.emit('redis-started', data);
    });
    
    // System optimizer events
    this.systemOptimizer.on('optimizations-applied', (data) => {
      this.emit('system-optimized', data);
    });
    
    this.systemOptimizer.on('optimization-error', (data) => {
      this.emit('system-error', data);
    });
  }

  /**
   * Apply all performance optimizations
   */
  async applyAllOptimizations(): Promise<OptimizationResult> {
    const result: OptimizationResult = {
      success: false,
      appliedOptimizations: [],
      errors: [],
      warnings: [],
      timestamp: new Date()
    };
    
    try {
      this.emit('optimization-started', {
        timestamp: new Date()
      });
      
      // Apply optimizations in order
      await this.applyNodeJSOptimizations(result);
      await this.applyRedisOptimizations(result);
      await this.applySystemOptimizations(result);
      
      // Verify all optimizations
      await this.verifyOptimizations();
      
      this.isOptimized = true;
      result.success = result.errors.length === 0;
      
      this.emit('optimization-completed', result);
      
      return result;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      result.success = false;
      
      this.emit('optimization-failed', result);
      
      return result;
    }
  }

  /**
   * Apply Node.js optimizations
   */
  private async applyNodeJSOptimizations(result: OptimizationResult): Promise<void> {
    try {
      await this.nodejsOptimizer.applyOptimizations();
      result.appliedOptimizations.push('Node.js runtime optimization');
      result.appliedOptimizations.push('Connection pooling configuration');
    } catch (error) {
      const errorMsg = `Node.js optimization failed: ${error}`;
      result.errors.push(errorMsg);
      result.warnings.push('Some Node.js optimizations may not be applied');
    }
  }

  /**
   * Apply Redis optimizations
   */
  private async applyRedisOptimizations(result: OptimizationResult): Promise<void> {
    try {
      await this.redisOptimizer.applyOptimizations();
      result.appliedOptimizations.push('Redis memory optimization');
      result.appliedOptimizations.push('Redis persistence configuration');
      result.appliedOptimizations.push('Redis high-frequency trading tuning');
    } catch (error) {
      const errorMsg = `Redis optimization failed: ${error}`;
      result.errors.push(errorMsg);
      result.warnings.push('Redis may not be optimally configured');
    }
  }

  /**
   * Apply system-level optimizations
   */
  private async applySystemOptimizations(result: OptimizationResult): Promise<void> {
    try {
      await this.systemOptimizer.applyOptimizations();
      result.appliedOptimizations.push('Kernel parameter tuning');
      result.appliedOptimizations.push('Log rotation configuration');
      result.appliedOptimizations.push('CPU and disk optimization');
    } catch (error) {
      const errorMsg = `System optimization failed: ${error}`;
      result.errors.push(errorMsg);
      result.warnings.push('Some system optimizations may require root privileges');
    }
  }

  /**
   * Verify all optimizations are working correctly
   */
  private async verifyOptimizations(): Promise<void> {
    const verificationPromises = [];
    
    // Verify Node.js optimizations
    try {
      const nodejsMetrics = this.nodejsOptimizer.getMetrics();
      if (nodejsMetrics.memoryUsage.heapUsed > nodejsMetrics.memoryUsage.heapTotal * 0.9) {
        throw new Error('Node.js memory usage is too high');
      }
    } catch (error) {
      throw new Error(`Node.js verification failed: ${error}`);
    }
    
    // Verify Redis optimizations
    try {
      const redisHealth = await this.redisOptimizer.performHealthCheck();
      if (redisHealth.status === 'critical') {
        throw new Error(`Redis health check failed: ${redisHealth.issues.join(', ')}`);
      }
    } catch (error) {
      throw new Error(`Redis verification failed: ${error}`);
    }
    
    // System verification is handled internally by SystemOptimizer
  }

  /**
   * Get comprehensive performance metrics
   */
  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    try {
      const [nodejsMetrics, redisMetrics, systemMetrics] = await Promise.all([
        this.nodejsOptimizer.getMetrics(),
        this.redisOptimizer.getMetrics(),
        this.systemOptimizer.getSystemMetrics()
      ]);
      
      const overallScore = this.calculateOverallScore(nodejsMetrics, redisMetrics, systemMetrics);
      const recommendations = this.generateRecommendations(nodejsMetrics, redisMetrics, systemMetrics);
      
      return {
        nodejs: nodejsMetrics,
        redis: redisMetrics,
        system: systemMetrics,
        overall: {
          status: this.getOverallStatus(overallScore),
          score: overallScore,
          recommendations
        }
      };
    } catch (error) {
      throw new Error(`Failed to get performance metrics: ${error}`);
    }
  }

  /**
   * Calculate overall performance score (0-100)
   */
  private calculateOverallScore(nodejsMetrics: any, redisMetrics: any, systemMetrics: any): number {
    let score = 100;
    
    // Node.js scoring
    const memoryUsagePercent = (nodejsMetrics.memoryUsage.heapUsed / nodejsMetrics.memoryUsage.heapTotal) * 100;
    if (memoryUsagePercent > 85) score -= 20;
    else if (memoryUsagePercent > 70) score -= 10;
    
    if (nodejsMetrics.eventLoopDelay > 10) score -= 15;
    if (nodejsMetrics.eventLoopUtilization > 80) score -= 15;
    
    // Redis scoring
    if (redisMetrics.memory.fragmentation > 1.5) score -= 15;
    if (redisMetrics.performance.hitRate < 90) score -= 20;
    if (redisMetrics.performance.commandsPerSecond < 1000) score -= 10;
    
    // System scoring
    if (systemMetrics.cpu.usage > 80) score -= 15;
    if (systemMetrics.memory.used / systemMetrics.memory.total > 0.9) score -= 20;
    if (systemMetrics.disk.usage > 85) score -= 10;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get overall status based on score
   */
  private getOverallStatus(score: number): 'optimal' | 'good' | 'warning' | 'critical' {
    if (score >= 90) return 'optimal';
    if (score >= 75) return 'good';
    if (score >= 50) return 'warning';
    return 'critical';
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(nodejsMetrics: any, redisMetrics: any, systemMetrics: any): string[] {
    const recommendations: string[] = [];
    
    // Node.js recommendations
    const memoryUsagePercent = (nodejsMetrics.memoryUsage.heapUsed / nodejsMetrics.memoryUsage.heapTotal) * 100;
    if (memoryUsagePercent > 85) {
      recommendations.push('Consider increasing Node.js heap size or optimizing memory usage');
    }
    
    if (nodejsMetrics.eventLoopDelay > 10) {
      recommendations.push('High event loop delay detected - review synchronous operations');
    }
    
    // Redis recommendations
    if (redisMetrics.memory.fragmentation > 1.5) {
      recommendations.push('Consider restarting Redis to reduce memory fragmentation');
    }
    
    if (redisMetrics.performance.hitRate < 90) {
      recommendations.push('Review Redis cache patterns and TTL settings to improve hit rate');
    }
    
    // System recommendations
    if (systemMetrics.cpu.usage > 80) {
      recommendations.push('High CPU usage - consider scaling or optimizing workloads');
    }
    
    if (systemMetrics.memory.used / systemMetrics.memory.total > 0.9) {
      recommendations.push('High memory usage - consider adding more RAM or optimizing memory usage');
    }
    
    if (systemMetrics.disk.usage > 85) {
      recommendations.push('Disk usage is high - consider cleanup or adding storage');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('System performance is optimal');
    }
    
    return recommendations;
  }

  /**
   * Optimize for high-frequency trading specifically
   */
  async optimizeForHighFrequencyTrading(): Promise<void> {
    try {
      // Apply HFT-specific Redis optimizations
      await this.redisOptimizer.optimizeForHighFrequency();
      
      // Update Node.js configuration for ultra-low latency
      const hftNodeConfig = {
        ...this.config.nodejs,
        maxEventLoopDelay: 1, // 1ms max delay
        eventLoopUtilization: 50, // Lower utilization for stability
        connectionPooling: {
          ...this.config.nodejs.connectionPooling,
          maxConnections: 100, // More connections for parallel processing
          timeout: 5000 // Shorter timeout
        }
      };
      
      this.nodejsOptimizer.updateConfig(hftNodeConfig);
      
      this.emit('hft-optimized', {
        timestamp: new Date()
      });
    } catch (error) {
      throw new Error(`HFT optimization failed: ${error}`);
    }
  }

  /**
   * Create a connection pool for database connections
   */
  createDatabaseConnectionPool(
    name: string,
    factory: () => Promise<any>,
    destroyer: (connection: any) => Promise<void>
  ) {
    return this.nodejsOptimizer.createConnectionPool(name, factory, destroyer);
  }

  /**
   * Get connection pool by name
   */
  getConnectionPool(name: string) {
    return this.nodejsOptimizer.getConnectionPool(name);
  }

  /**
   * Update configuration for all optimizers
   */
  updateConfiguration(newConfig: Partial<PerformanceOptimizationConfig>): void {
    if (newConfig.nodejs) {
      this.config.nodejs = { ...this.config.nodejs, ...newConfig.nodejs };
      this.nodejsOptimizer.updateConfig(newConfig.nodejs);
    }
    
    if (newConfig.redis) {
      this.config.redis = { ...this.config.redis, ...newConfig.redis };
      this.redisOptimizer.updateConfig(newConfig.redis);
    }
    
    if (newConfig.system) {
      this.config.system = { ...this.config.system, ...newConfig.system };
      this.systemOptimizer.updateConfig(newConfig.system);
    }
    
    this.emit('configuration-updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfiguration(): PerformanceOptimizationConfig {
    return { ...this.config };
  }

  /**
   * Check if optimizations are applied
   */
  isSystemOptimized(): boolean {
    return this.isOptimized;
  }

  /**
   * Rollback all optimizations
   */
  async rollbackOptimizations(): Promise<void> {
    try {
      await Promise.all([
        this.systemOptimizer.rollbackOptimizations(),
        this.redisOptimizer.stop(),
        this.nodejsOptimizer.destroy()
      ]);
      
      this.isOptimized = false;
      
      this.emit('optimizations-rolled-back', {
        timestamp: new Date()
      });
    } catch (error) {
      throw new Error(`Rollback failed: ${error}`);
    }
  }

  /**
   * Cleanup and destroy all optimizers
   */
  async destroy(): Promise<void> {
    try {
      await Promise.all([
        this.nodejsOptimizer.destroy(),
        this.redisOptimizer.stop()
      ]);
      
      this.emit('destroyed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

/**
 * Default performance optimization configuration for production
 */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceOptimizationConfig = {
  nodejs: DEFAULT_NODEJS_CONFIG,
  redis: DEFAULT_REDIS_CONFIG,
  system: DEFAULT_SYSTEM_CONFIG,
  dataDir: '/var/lib/titan'
};