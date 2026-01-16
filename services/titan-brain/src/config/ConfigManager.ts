/**
 * ConfigManager - Comprehensive configuration management for Railway deployment
 * 
 * Manages all configuration loading, validation, and hot-reload functionality
 * with proper error handling and Railway-specific environment variables.
 * 
 * Requirements: 1.3.1, 1.3.2, 1.3.3, 1.3.4, 1.3.5
 */

import { EventEmitter } from 'events';
import { ConfigValidator, ConfigValidationResult } from './ConfigValidator.js';
import { Logger } from '../logging/Logger.js';

/**
 * Brain configuration interface
 */
export interface BrainConfig {
  // Core application settings
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  host: string;

  // Database configuration
  databaseUrl: string;
  databasePoolMin: number;
  databasePoolMax: number;

  // Redis configuration (optional)
  redisUrl?: string;

  // NATS configuration
  natsUrl?: string;

  // Security configuration
  hmacSecret?: string;
  hmacAlgorithm: 'sha256' | 'sha512';

  // Logging configuration
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

  // Rate limiting configuration
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;

  // Health check configuration
  healthCheckInterval: number;

  // Service discovery configuration
  phase1ServiceUrl?: string;
  phase2ServiceUrl?: string;
  phase3ServiceUrl?: string;

  // Railway-specific configuration
  railwayEnvironment?: string;
  railwayServiceName?: string;

  // CORS configuration
  corsOrigins: string[];

  // Startup configuration
  startupTimeout: number;
  shutdownTimeout: number;
}

/**
 * Configuration change event
 */
export interface ConfigChangeEvent {
  field: string;
  oldValue: any;
  newValue: any;
  timestamp: number;
}

/**
 * Configuration manager for environment-based configuration
 */
export class ConfigManager extends EventEmitter {
  private config: BrainConfig | null = null;
  private validator: ConfigValidator;
  private logger: Logger;
  private lastValidation: ConfigValidationResult | null = null;

  constructor(logger?: Logger) {
    super();
    this.logger = logger ?? Logger.getInstance('config-manager');
    this.validator = new ConfigValidator(this.logger);
  }

  /**
   * Load and validate configuration from environment variables
   */
  async loadConfig(): Promise<BrainConfig> {
    this.logger.info('Loading configuration from environment variables');

    // Validate environment variables
    const validationResult = this.validator.validate();
    this.lastValidation = validationResult;

    if (!validationResult.valid) {
      const error = new Error(`Configuration validation failed: ${validationResult.errors.join(', ')}`);
      this.logger.error('Configuration validation failed', error, undefined, {
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        summary: validationResult.summary
      });
      throw error;
    }

    // Log warnings if any
    if (validationResult.warnings.length > 0) {
      for (const warning of validationResult.warnings) {
        this.logger.warn(warning);
      }
    }

    // Build configuration object
    const config: BrainConfig = {
      // Core application settings
      nodeEnv: this.getEnvValue('NODE_ENV', 'production') as 'development' | 'production' | 'test',
      port: this.getEnvValue('PORT', 3000) as number,
      host: this.getEnvValue('HOST', '0.0.0.0') as string,

      // Database configuration
      databaseUrl: this.getEnvValue('DATABASE_URL') as string,
      databasePoolMin: this.getEnvValue('DATABASE_POOL_MIN', 2) as number,
      databasePoolMax: this.getEnvValue('DATABASE_POOL_MAX', 10) as number,

      // Redis configuration (optional)
      redisUrl: this.getEnvValue('REDIS_URL') as string | undefined,

      // NATS configuration
      natsUrl: this.getEnvValue('NATS_URL') as string | undefined,

      // Security configuration
      hmacSecret: this.getEnvValue('HMAC_SECRET') as string | undefined,
      hmacAlgorithm: this.getEnvValue('HMAC_ALGORITHM', 'sha256') as 'sha256' | 'sha512',

      // Logging configuration
      logLevel: this.getEnvValue('LOG_LEVEL', 'info') as 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',

      // Rate limiting configuration
      rateLimitWindowMs: this.getEnvValue('RATE_LIMIT_WINDOW_MS', 60000) as number,
      rateLimitMaxRequests: this.getEnvValue('RATE_LIMIT_MAX_REQUESTS', 100) as number,

      // Health check configuration
      healthCheckInterval: this.getEnvValue('HEALTH_CHECK_INTERVAL', 30000) as number,

      // Service discovery configuration
      phase1ServiceUrl: this.getEnvValue('PHASE1_SERVICE_URL') as string | undefined,
      phase2ServiceUrl: this.getEnvValue('PHASE2_SERVICE_URL') as string | undefined,
      phase3ServiceUrl: this.getEnvValue('PHASE3_SERVICE_URL') as string | undefined,

      // Railway-specific configuration
      railwayEnvironment: this.getEnvValue('RAILWAY_ENVIRONMENT') as string | undefined,
      railwayServiceName: this.getEnvValue('RAILWAY_SERVICE_NAME') as string | undefined,

      // CORS configuration
      corsOrigins: this.parseCorsOrigins(this.getEnvValue('CORS_ORIGINS', '*') as string),

      // Startup configuration
      startupTimeout: this.getEnvValue('STARTUP_TIMEOUT', 60000) as number,
      shutdownTimeout: this.getEnvValue('SHUTDOWN_TIMEOUT', 10000) as number
    };

    this.config = config;

    this.logger.info('Configuration loaded successfully', undefined, {
      nodeEnv: config.nodeEnv,
      port: config.port,
      host: config.host,
      databaseConfigured: !!config.databaseUrl,
      redisConfigured: !!config.redisUrl,
      hmacEnabled: !!config.hmacSecret,
      logLevel: config.logLevel,
      railwayEnvironment: config.railwayEnvironment,
      railwayServiceName: config.railwayServiceName,
      validationSummary: validationResult.summary
    });

    this.emit('config:loaded', config);
    return config;
  }

  /**
   * Get environment variable value with proper type conversion
   */
  private getEnvValue(name: string, defaultValue?: any): string | number | boolean | undefined {
    const validationResult = this.lastValidation?.variables.find(v => v.name === name);
    
    if (validationResult) {
      return validationResult.value;
    }

    // Fallback to direct environment access (shouldn't happen with proper validation)
    const rawValue = process.env[name];
    if (rawValue === undefined) {
      return defaultValue;
    }

    return rawValue;
  }

  /**
   * Parse CORS origins from comma-separated string
   */
  private parseCorsOrigins(corsOriginsStr: string): string[] {
    if (corsOriginsStr === '*') {
      return ['*'];
    }

    return corsOriginsStr
      .split(',')
      .map(origin => origin.trim())
      .filter(origin => origin.length > 0);
  }

  /**
   * Get current configuration
   */
  getConfig(): BrainConfig {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
    return { ...this.config };
  }

  /**
   * Check if configuration is loaded
   */
  isLoaded(): boolean {
    return this.config !== null;
  }

  /**
   * Get last validation result
   */
  getLastValidation(): ConfigValidationResult | null {
    return this.lastValidation;
  }

  /**
   * Reload configuration from environment variables
   */
  async reloadConfig(): Promise<BrainConfig> {
    this.logger.info('Reloading configuration');

    const oldConfig = this.config ? { ...this.config } : null;
    const newConfig = await this.loadConfig();

    // Compare configurations and emit change events
    if (oldConfig) {
      this.compareAndEmitChanges(oldConfig, newConfig);
    }

    this.emit('config:reloaded', { oldConfig, newConfig });
    return newConfig;
  }

  /**
   * Compare configurations and emit change events
   */
  private compareAndEmitChanges(oldConfig: BrainConfig, newConfig: BrainConfig): void {
    const changes: ConfigChangeEvent[] = [];

    for (const [key, newValue] of Object.entries(newConfig)) {
      const oldValue = (oldConfig as any)[key];
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        const change: ConfigChangeEvent = {
          field: key,
          oldValue,
          newValue,
          timestamp: Date.now()
        };
        
        changes.push(change);
        this.emit('config:changed', change);
        
        this.logger.info(`Configuration changed: ${key}`, undefined, {
          field: key,
          oldValue: this.maskSensitiveValue(key, oldValue),
          newValue: this.maskSensitiveValue(key, newValue)
        });
      }
    }

    if (changes.length > 0) {
      this.emit('config:changes', changes);
    }
  }

  /**
   * Mask sensitive configuration values for logging
   */
  private maskSensitiveValue(key: string, value: any): any {
    const sensitiveKeys = ['hmacSecret', 'databaseUrl', 'redisUrl', 'natsUrl'];
    const lowerKey = key.toLowerCase();
    
    if (sensitiveKeys.some(sensitiveKey => lowerKey.includes(sensitiveKey.toLowerCase()))) {
      return value ? '[CONFIGURED]' : '[NOT SET]';
    }
    
    return value;
  }

  /**
   * Validate current configuration
   */
  validateConfig(): ConfigValidationResult {
    return this.validator.validate();
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary(): Record<string, any> {
    if (!this.config) {
      return { error: 'Configuration not loaded' };
    }

    return {
      nodeEnv: this.config.nodeEnv,
      port: this.config.port,
      host: this.config.host,
      databaseConfigured: !!this.config.databaseUrl,
      redisConfigured: !!this.config.redisUrl,
      hmacEnabled: !!this.config.hmacSecret,
      logLevel: this.config.logLevel,
      rateLimitWindowMs: this.config.rateLimitWindowMs,
      rateLimitMaxRequests: this.config.rateLimitMaxRequests,
      healthCheckInterval: this.config.healthCheckInterval,
      corsOrigins: this.config.corsOrigins,
      startupTimeout: this.config.startupTimeout,
      shutdownTimeout: this.config.shutdownTimeout,
      railwayEnvironment: this.config.railwayEnvironment,
      railwayServiceName: this.config.railwayServiceName,
      servicesConfigured: {
        phase1: !!this.config.phase1ServiceUrl,
        phase2: !!this.config.phase2ServiceUrl,
        phase3: !!this.config.phase3ServiceUrl
      }
    };
  }

  /**
   * Get Railway-specific configuration
   */
  getRailwayConfig(): {
    environment?: string;
    serviceName?: string;
    isRailwayDeployment: boolean;
  } {
    return {
      environment: this.config?.railwayEnvironment,
      serviceName: this.config?.railwayServiceName,
      isRailwayDeployment: !!(this.config?.railwayEnvironment || process.env.RAILWAY_ENVIRONMENT)
    };
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig(): {
    url: string;
    poolMin: number;
    poolMax: number;
  } {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    return {
      url: this.config.databaseUrl,
      poolMin: this.config.databasePoolMin,
      poolMax: this.config.databasePoolMax
    };
  }

  /**
   * Get Redis configuration
   */
  getRedisConfig(): {
    url?: string;
    enabled: boolean;
  } {
    return {
      url: this.config?.redisUrl,
      enabled: !!this.config?.redisUrl
    };
  }

  /**
   * Get security configuration
   */
  getSecurityConfig(): {
    hmacSecret?: string;
    hmacAlgorithm: string;
    hmacEnabled: boolean;
  } {
    return {
      hmacSecret: this.config?.hmacSecret,
      hmacAlgorithm: this.config?.hmacAlgorithm || 'sha256',
      hmacEnabled: !!this.config?.hmacSecret
    };
  }

  /**
   * Get service URLs configuration
   */
  getServiceUrls(): {
    phase1?: string;
    phase2?: string;
    phase3?: string;
  } {
    return {
      phase1: this.config?.phase1ServiceUrl,
      phase2: this.config?.phase2ServiceUrl,
      phase3: this.config?.phase3ServiceUrl
    };
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.config?.nodeEnv === 'production';
  }

  /**
   * Check if running in development
   */
  isDevelopment(): boolean {
    return this.config?.nodeEnv === 'development';
  }

  /**
   * Check if running in test mode
   */
  isTest(): boolean {
    return this.config?.nodeEnv === 'test';
  }

  /**
   * Get server configuration
   */
  getServerConfig(): {
    port: number;
    host: string;
    corsOrigins: string[];
  } {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    return {
      port: this.config.port,
      host: this.config.host,
      corsOrigins: this.config.corsOrigins
    };
  }

  /**
   * Get rate limiting configuration
   */
  getRateLimitConfig(): {
    windowMs: number;
    maxRequests: number;
  } {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    return {
      windowMs: this.config.rateLimitWindowMs,
      maxRequests: this.config.rateLimitMaxRequests
    };
  }

  /**
   * Get startup configuration
   */
  getStartupConfig(): {
    startupTimeout: number;
    shutdownTimeout: number;
  } {
    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    return {
      startupTimeout: this.config.startupTimeout,
      shutdownTimeout: this.config.shutdownTimeout
    };
  }
}