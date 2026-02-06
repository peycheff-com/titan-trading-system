/**
 * Configuration Loader for Titan Brain
 * Handles loading, validation, and merging of configuration independently.
 */

import { existsSync, readFileSync } from "fs";
import { z } from "zod"; // Added usage of zod

import { TitanBrainConfig, TitanBrainConfigSchema } from "./ConfigSchema.js";

// Re-export types
export { EquityTier, TitanBrainConfig } from "./ConfigSchema.js";

// Default config matching the schema defaults
// Note: Zod defaults are applied during parsing, but we keep a roughly matching object for reference/fallback
// if needed before parsing. However, we should primarily rely on Zod.
// For now, to keep existing logic working without massive refactor, we can rely on proper parsing
// or re-declare a minimal default if referenced directly.
// ACTUALLY: The original code exported a massive explicit defaultConfig object.
// We should probably keep that or import it if we moved it.
// I did NOT move defaultConfig in the previous step (I only moved Schemas).
// Let's re-introduce defaultConfig but typed correctly.

export const defaultConfig: TitanBrainConfig = {
  brain: {
    signalTimeout: 100,
    metricUpdateInterval: 60000,
    dashboardCacheTTL: 5000,
    maxQueueSize: 100,
    initialCapital: 1000,
  },
  allocationEngine: {
    transitionPoints: {
      startP2: 1500,
      fullP2: 5000,
      startP3: 25000,
    },
    leverageCaps: {
      MICRO: 20,
      SMALL: 10,
      MEDIUM: 5,
      LARGE: 3,
      INSTITUTIONAL: 2,
    },
  },
  performanceTracker: {
    windowDays: 7,
    minTradeCount: 10,
    malusMultiplier: 0.5,
    bonusMultiplier: 1.2,
    malusThreshold: 0,
    bonusThreshold: 2.0,
  },
  riskGuardian: {
    maxCorrelation: 0.8,
    correlationPenalty: 0.5,
    betaUpdateInterval: 300000,
    correlationUpdateInterval: 300000,
    minStopDistanceMultiplier: 1.5,
    minConfidenceScore: 0.7,
    confidence: {
      decayRate: 0.1,
      recoveryRate: 0.01,
      threshold: 0.5,
    },
    fractal: {},
  },
  capitalFlow: {
    sweepThreshold: 1.2,
    reserveLimit: 200,
    sweepSchedule: "0 0 * * *",
    maxRetries: 3,
    retryBaseDelay: 1000,
  },
  circuitBreaker: {
    maxDailyDrawdown: 0.15,
    minEquity: 150,
    consecutiveLossLimit: 3,
    consecutiveLossWindow: 3600000,
    cooldownMinutes: 30,
  },
  database: {
    host: "localhost",
    port: 5432,
    database: "titan_brain",
    user: "postgres",
    password: "postgres",
    maxConnections: 20,
    idleTimeout: 30000,
  },
  redis: {
    url: "redis://localhost:6379",
    maxRetries: 3,
    retryDelay: 1000,
  },
  server: {
    host: "0.0.0.0",
    port: 3100,
    corsOrigins: ["http://localhost:3000"],
  },
  notifications: {
    telegram: {
      enabled: false,
    },
    email: {
      enabled: false,
    },
  },
  activeInference: {
    distributionBins: 50, // Updated to match schema default
    windowSize: 100,
    minHistory: 20, // Updated to match schema default
    sensitivity: 1.0, // Updated to match schema default
    surpriseOffset: 0.1, // Updated to match schema default
  },
  services: {
    executionUrl: undefined,
  },
  reconciliation: {
    intervalMs: 60000,
    exchanges: ["BYBIT"],
  },
};

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
export function loadConfigFromFile(
  filePath: string,
): Partial<TitanBrainConfig> {
  if (!existsSync(filePath)) {
    throw new Error(`Configuration file not found: ${filePath}`);
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Partial<TitanBrainConfig>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${filePath}`);
    }
    throw error;
  }
}

import { loadConfigFromEnvironment } from "./EnvironmentLoader.js";

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
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = { ...targetValue, ...sourceValue } as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }
  return result;
}

/**
 * Deep merge two TitanBrainConfig objects
 */
function deepMerge(
  target: TitanBrainConfig,
  source: Partial<TitanBrainConfig>,
): TitanBrainConfig {
  return {
    brain: mergeConfigSection(target.brain, source.brain),
    allocationEngine: mergeConfigSection(
      target.allocationEngine,
      source.allocationEngine,
    ),
    performanceTracker: mergeConfigSection(
      target.performanceTracker,
      source.performanceTracker,
    ),
    riskGuardian: mergeConfigSection(target.riskGuardian, source.riskGuardian),
    capitalFlow: mergeConfigSection(target.capitalFlow, source.capitalFlow),
    circuitBreaker: mergeConfigSection(
      target.circuitBreaker,
      source.circuitBreaker,
    ),
    database: mergeConfigSection(target.database, source.database),
    redis: mergeConfigSection(target.redis, source.redis),
    server: mergeConfigSection(target.server, source.server),
    notifications: mergeConfigSection(
      target.notifications,
      source.notifications,
    ),
    activeInference: mergeConfigSection(
      target.activeInference,
      source.activeInference,
    ),
    services: mergeConfigSection(target.services, source.services),
    reconciliation: mergeConfigSection(
      target.reconciliation,
      source.reconciliation,
    ),
  };
}

/**
 * Helper to safely load file config
 */
function getFileConfig(configFile: string): {
  config: Partial<TitanBrainConfig>;
  source: string | null;
} {
  try {
    const fileConfig = loadConfigFromFile(configFile);
    return { config: fileConfig, source: `file:${configFile}` };
  } catch (error) {
    console.warn(
      `Warning: Could not load config file: ${(error as Error).message}`,
    );
    return { config: {}, source: null };
  }
}

/**
 * Load and merge configuration from all sources
 * Priority: Environment variables > Config file > Defaults
 */
export function loadConfig(
  options: ConfigLoaderOptions = {},
): ConfigLoaderResult {
  const { configFile, validate = true, throwOnError = false } = options;

  // Load from config file if provided
  const fileRef = configFile
    ? getFileConfig(configFile)
    : { config: {}, source: null };

  // Load from environment variables (highest priority)
  const envConfig = loadConfigFromEnvironment();
  const envSource = Object.keys(envConfig).length > 0 ? "environment" : null;

  const mergedConfig = deepMerge(
    deepMerge({ ...defaultConfig }, fileRef.config),
    envConfig,
  );

  const sources: string[] = ["defaults", fileRef.source, envSource].filter(
    (s): s is string => s !== null,
  );

  // Validate configuration
  const validation = validate
    ? validateMergedConfig(mergedConfig)
    : { valid: true, errors: [], warnings: [] };

  if (validate && !validation.valid && throwOnError) {
    throw new Error(
      `Configuration validation failed:\n${validation.errors.join("\n")}`,
    );
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
  private readonly options: ConfigLoaderOptions;

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
    this.config = null;
    return this.load();
  }

  private async load(): Promise<TitanBrainConfig> {
    const result = loadConfig(this.options);
    if (!result.validation.valid && this.options.throwOnError) {
      throw new Error(
        `Configuration validation failed:\n${
          result.validation.errors.join("\\n")
        }`,
      );
    }

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
        errors: ["Configuration not loaded"],
        warnings: [],
      };
    }
    const result = TitanBrainConfigSchema.safeParse(this.config);
    if (result.success) {
      return { valid: true, errors: [], warnings: [] };
    }
    return {
      valid: false,
      errors: result.error.errors.map((e) =>
        `${e.path.join(".")}: ${e.message}`
      ),
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
  public readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(message);
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

function validateMergedConfig(config: TitanBrainConfig): ValidationResult {
  const result = TitanBrainConfigSchema.safeParse(config);

  if (result.success) {
    return { valid: true, errors: [], warnings: [] };
  } else {
    return {
      valid: false,
      errors: result.error.errors.map((e) =>
        `${e.path.join(".")}: ${e.message}`
      ),
      warnings: [],
    };
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
    errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
    warnings: [],
  };
}

// Export singleton instance for convenience

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
