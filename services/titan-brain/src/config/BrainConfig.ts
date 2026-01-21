/**
 * BrainConfig - Type definitions for Titan Brain configuration
 *
 * Centralized type definitions for all configuration interfaces
 * used throughout the Titan Brain service.
 *
 * Requirements: 1.3.1, 1.3.2, 1.3.3, 1.3.4, 1.3.5
 */

import { FeatureManager } from './FeatureManager.js';

/**
 * Main Brain configuration interface
 * This is re-exported from ConfigManager for convenience
 */
export interface BrainConfig {
  // Core application settings
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  host: string;

  // Database configuration
  databaseUrl: string;
  databaseHost?: string;
  databasePort?: number;
  databaseUser?: string;
  databasePassword?: string;
  databaseName?: string;
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

  // Deployment configuration (platform-agnostic)
  deploymentEnvironment?: string;
  serviceName?: string;

  // CORS configuration
  corsOrigins: string[];

  // Startup configuration
  startupTimeout: number;
  shutdownTimeout: number;

  // Power Law Risk configuration
  risk: RiskConfig;

  // Feature Flags
  featureManager?: FeatureManager;
}

/**
 * Database configuration subset
 */
export interface DatabaseConfig {
  url: string;
  poolMin: number;
  poolMax: number;
}

/**
 * Redis configuration subset
 */
export interface RedisConfig {
  url?: string;
  enabled: boolean;
}

/**
 * Security configuration subset
 */
export interface SecurityConfig {
  hmacSecret?: string;
  hmacAlgorithm: string;
  hmacEnabled: boolean;
}

/**
 * Server configuration subset
 */
export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
}

/**
 * Rate limiting configuration subset
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * Startup configuration subset
 */
export interface StartupConfig {
  startupTimeout: number;
  shutdownTimeout: number;
}

/**
 * Service URLs configuration subset
 */
export interface ServiceUrlsConfig {
  phase1?: string;
  phase2?: string;
  phase3?: string;
}

/**
 * Deployment configuration subset
 */
export interface DeploymentConfig {
  environment?: string;
  serviceName?: string;
  isProduction: boolean;
}

/**
 * Power Law Risk configuration subset
 */
export interface RiskConfig {
  /** Global maximum leverage cap */
  maxLeverage: number;
  /** Buffer reduction for fat tail regimes (0.0 to 1.0) */
  fatTailBuffer: number;
  /** Alpha threshold below which tails are considered "Fat" */
  tailIndexThreshold: number;
  /** Maximum allowable impact in basis points */
  maxImpactBps: number;
}

/**
 * Configuration defaults for different environments
 */
export const ConfigDefaults = {
  development: {
    logLevel: 'debug' as const,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 1000,
    healthCheckInterval: 10000,
    startupTimeout: 30000,
    shutdownTimeout: 5000,
    risk: {
      maxLeverage: 10,
      fatTailBuffer: 0.3,
      tailIndexThreshold: 2.5,
      maxImpactBps: 20,
    },
  },

  production: {
    logLevel: 'info' as const,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 100,
    healthCheckInterval: 30000,
    startupTimeout: 60000,
    shutdownTimeout: 10000,
    risk: {
      maxLeverage: 5, // Safer default for prod
      fatTailBuffer: 0.4,
      tailIndexThreshold: 2.5,
      maxImpactBps: 10,
    },
  },

  test: {
    logLevel: 'warn' as const,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 10000,
    healthCheckInterval: 5000,
    startupTimeout: 10000,
    shutdownTimeout: 1000,
    risk: {
      maxLeverage: 20,
      fatTailBuffer: 0.0,
      tailIndexThreshold: 2.0,
      maxImpactBps: 50,
    },
  },
} as const;

/**
 * Required environment variables for production deployment
 */
export const RequiredEnvVars = ['NODE_ENV', 'PORT', 'DATABASE_URL'] as const;

/**
 * Optional environment variables with defaults
 */
export const OptionalEnvVars = [
  'HOST',
  'REDIS_URL',
  'HMAC_SECRET',
  'HMAC_ALGORITHM',
  'LOG_LEVEL',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX_REQUESTS',
  'HEALTH_CHECK_INTERVAL',
  'PHASE1_SERVICE_URL',
  'PHASE2_SERVICE_URL',
  'PHASE3_SERVICE_URL',
  'DEPLOYMENT_ENVIRONMENT',
  'SERVICE_NAME',
  'CORS_ORIGINS',
  'STARTUP_TIMEOUT',
  'SHUTDOWN_TIMEOUT',
] as const;

/**
 * Sensitive environment variables that should be masked in logs
 */
export const SensitiveEnvVars = ['DATABASE_URL', 'REDIS_URL', 'HMAC_SECRET'] as const;

/**
 * Type guard to check if a value is a valid node environment
 */
export function isValidNodeEnv(value: string): value is 'development' | 'production' | 'test' {
  return ['development', 'production', 'test'].includes(value);
}

/**
 * Type guard to check if a value is a valid log level
 */
export function isValidLogLevel(
  value: string,
): value is 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' {
  return ['fatal', 'error', 'warn', 'info', 'debug', 'trace'].includes(value);
}

/**
 * Type guard to check if a value is a valid HMAC algorithm
 */
export function isValidHmacAlgorithm(value: string): value is 'sha256' | 'sha512' {
  return ['sha256', 'sha512'].includes(value);
}

/**
 * Configuration validation helpers
 */
export const ConfigValidation = {
  /**
   * Validate port number
   */
  isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  },

  /**
   * Validate URL format
   */
  isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Validate positive integer
   */
  isPositiveInteger(value: number): boolean {
    return Number.isInteger(value) && value > 0;
  },

  /**
   * Validate non-negative integer
   */
  isNonNegativeInteger(value: number): boolean {
    return Number.isInteger(value) && value >= 0;
  },

  /**
   * Validate timeout value (must be positive)
   */
  isValidTimeout(timeout: number): boolean {
    return this.isPositiveInteger(timeout) && timeout <= 300000; // Max 5 minutes
  },

  /**
   * Validate CORS origins
   */
  isValidCorsOrigins(origins: string[]): boolean {
    if (origins.length === 1 && origins[0] === '*') {
      return true;
    }

    return origins.every((origin) => {
      if (origin === '*') return false; // * must be alone
      return (
        this.isValidUrl(origin) ||
        origin.startsWith('http://localhost:') ||
        origin.startsWith('https://localhost:')
      );
    });
  },
} as const;
