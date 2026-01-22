/**
 * Configuration Loader for Titan Brain
 * Handles loading, validation, and merging of configuration independently.
 */

import { existsSync, readFileSync } from 'fs';
import { EquityTier, TitanBrainConfig } from '../types/index.js';
import { defaultConfig } from './defaults.js';
import { TitanBrainConfigSchema } from './schema.js';

/**
 * Configuration validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Configuration loader options
 */
export interface ConfigLoaderOptions {
  /** Path to configuration file (optional) */
  configFile?: string;
  /** Whether to validate configuration (default: true) */
  validate?: boolean;
  /** Whether to throw error on validation failure (default: false) */
  throwOnError?: boolean;
}

/**
 * Configuration loader result
 */
export interface ConfigLoaderResult {
  config: TitanBrainConfig;
  validation: ValidationResult;
  sources: string[];
}

/**
 * Load configuration from a JSON file
 */
export function loadConfigFromFile(filePath: string): Partial<TitanBrainConfig> {
  if (!existsSync(filePath)) {
    throw new Error(`Configuration file not found: ${filePath}`);
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as Partial<TitanBrainConfig>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${filePath}`);
    }
    throw error;
  }
}

import { loadConfigFromEnvironment } from './EnvironmentLoader.js';

export { loadConfigFromEnvironment };

/**
 * Deep merge configuration objects
 */
function mergeConfigSection<T>(target: T, source: Partial<T> | undefined): T {
  if (!source) return target;

  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      // eslint-disable-next-line functional/immutable-data
      result[key] = { ...targetValue, ...sourceValue } as T[keyof T];
    } else if (sourceValue !== undefined) {
      // eslint-disable-next-line functional/immutable-data
      result[key] = sourceValue as T[keyof T];
    }
  }
  return result;
}

/**
 * Deep merge two TitanBrainConfig objects
 */
function deepMerge(target: TitanBrainConfig, source: Partial<TitanBrainConfig>): TitanBrainConfig {
  return {
    brain: mergeConfigSection(target.brain, source.brain),
    allocationEngine: mergeConfigSection(target.allocationEngine, source.allocationEngine),
    performanceTracker: mergeConfigSection(target.performanceTracker, source.performanceTracker),
    riskGuardian: mergeConfigSection(target.riskGuardian, source.riskGuardian),
    capitalFlow: mergeConfigSection(target.capitalFlow, source.capitalFlow),
    circuitBreaker: mergeConfigSection(target.circuitBreaker, source.circuitBreaker),
    database: mergeConfigSection(target.database, source.database),
    redis: mergeConfigSection(target.redis, source.redis),
    server: mergeConfigSection(target.server, source.server),
    notifications: mergeConfigSection(target.notifications, source.notifications),
    activeInference: mergeConfigSection(target.activeInference, source.activeInference),
    services: mergeConfigSection(target.services, source.services),
    reconciliation: mergeConfigSection(target.reconciliation, source.reconciliation),
  };
}

/**
 * Load and merge configuration from all sources
 * Priority: Environment variables > Config file > Defaults
 */
export function loadConfig(options: ConfigLoaderOptions = {}): ConfigLoaderResult {
  const { configFile, validate = true, throwOnError = false } = options;

  const sources: string[] = ['defaults'];
  // eslint-disable-next-line functional/no-let
  let mergedConfig: TitanBrainConfig = { ...defaultConfig };

  // Load from config file if provided
  if (configFile) {
    try {
      const fileConfig = loadConfigFromFile(configFile);
      mergedConfig = deepMerge(mergedConfig, fileConfig);
      // eslint-disable-next-line functional/immutable-data
      sources.push(`file:${configFile}`);
    } catch (error) {
      console.warn(`Warning: Could not load config file: ${(error as Error).message}`);
    }
  }

  // Load from environment variables (highest priority)
  const envConfig = loadConfigFromEnvironment();
  if (Object.keys(envConfig).length > 0) {
    mergedConfig = deepMerge(mergedConfig, envConfig);
    // eslint-disable-next-line functional/immutable-data
    sources.push('environment');
  }

  // Validate configuration
  // eslint-disable-next-line functional/no-let
  let validation: ValidationResult = { valid: true, errors: [], warnings: [] };
  if (validate) {
    const result = TitanBrainConfigSchema.safeParse(mergedConfig);

    if (result.success) {
      mergedConfig = result.data as TitanBrainConfig;
      validation = { valid: true, errors: [], warnings: [] };
    } else {
      validation = {
        valid: false,
        errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
        warnings: [],
      };

      if (throwOnError) {
        throw new Error(`Configuration validation failed:\n${validation.errors.join('\n')}`);
      }
    }
  }

  return {
    config: mergedConfig,
    validation,
    sources,
  };
}

/**
 * Create a configuration loader instance with caching
 */
export class ConfigLoader {
  private config: TitanBrainConfig | null = null;
  private options: ConfigLoaderOptions;

  constructor(options: ConfigLoaderOptions = {}) {
    this.options = options;
  }

  /**
   * Get configuration (cached)
   */
  async getConfig(): Promise<TitanBrainConfig> {
    if (this.config) {
      return this.config;
    }

    return this.load();
  }

  /**
   * Force reload configuration
   */
  async reload(): Promise<TitanBrainConfig> {
    // eslint-disable-next-line functional/immutable-data
    this.config = null;
    return this.load();
  }

  private async load(): Promise<TitanBrainConfig> {
    const result = loadConfig(this.options);
    if (!result.validation.valid && this.options.throwOnError) {
      throw new Error(`Configuration validation failed:\n${result.validation.errors.join('\\n')}`);
    }
    // eslint-disable-next-line functional/immutable-data
    this.config = result.config;
    return this.config;
  }

  /**
   * Get validation result for current configuration
   */
  validate(): ValidationResult {
    if (!this.config) {
      return {
        valid: false,
        errors: ['Configuration not loaded'],
        warnings: [],
      };
    }
    const result = TitanBrainConfigSchema.safeParse(this.config);
    if (result.success) {
      return { valid: true, errors: [], warnings: [] };
    }
    return {
      valid: false,
      errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      warnings: [],
    };
  }

  /**
   * Check if configuration is valid
   */
  isValid(): boolean {
    return this.validate().valid;
  }
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  public errors: string[];

  constructor(message: string, errors: string[]) {
    super(message);
    this.name = 'ConfigValidationError';
    this.errors = errors;
  }
}

/**
 * Validate configuration object against schema
 */
export function validateConfig(config: unknown): ValidationResult {
  const result = TitanBrainConfigSchema.safeParse(config);
  if (result.success) {
    return { valid: true, errors: [], warnings: [] };
  }
  return {
    valid: false,
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    warnings: [],
  };
}

// Export singleton instance for convenience
// eslint-disable-next-line functional/no-let
let defaultLoader: ConfigLoader | null = null;

/**
 * Get the default configuration loader instance
 */
export function getConfigLoader(options?: ConfigLoaderOptions): ConfigLoader {
  if (!defaultLoader) {
    defaultLoader = new ConfigLoader(options);
  }
  return defaultLoader;
}

/**
 * Reset the default configuration loader (useful for testing)
 */
export function resetConfigLoader(): void {
  defaultLoader = null;
}
