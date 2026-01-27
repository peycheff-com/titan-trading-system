/**
 * Configuration Loader for Titan Brain
 * Handles loading, validation, and merging of configuration independently.
 */

import { existsSync, readFileSync } from 'fs';
import { z } from 'zod'; // Added usage of zod

// --- INLINED TYPES AND DEFAULTS TO FIX BUILD ISSUES ---

export enum EquityTier {
  MICRO = 'MICRO', // < $1,500
  SMALL = 'SMALL', // $1,500 - $5,000
  MEDIUM = 'MEDIUM', // $5,000 - $25,000
  LARGE = 'LARGE', // $25,000 - $50,000
  INSTITUTIONAL = 'INSTITUTIONAL', // > $50,000
}

export type TitanBrainConfig = any;

export const defaultConfig: TitanBrainConfig = {
  brain: {
    signalTimeout: 100, // 100ms max latency
    metricUpdateInterval: 60000, // 1 minute
    dashboardCacheTTL: 5000, // 5 seconds
    maxQueueSize: 100,
    initialCapital: 1000,
  },

  allocationEngine: {
    transitionPoints: {
      startP2: 1500, // Phase 2 starts at $1,500
      fullP2: 5000, // Phase 2 full allocation at $5,000
      startP3: 25000, // Phase 3 starts at $25,000
    },
    leverageCaps: {
      [EquityTier.MICRO]: 20, // < $1,500: 20x max
      [EquityTier.SMALL]: 10, // $1,500 - $5,000: 10x max
      [EquityTier.MEDIUM]: 5, // $5,000 - $25,000: 5x max
      [EquityTier.LARGE]: 3, // $25,000 - $50,000: 3x max
      [EquityTier.INSTITUTIONAL]: 2, // > $50,000: 2x max
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
    correlationPenalty: 0.5, // 50% size reduction
    betaUpdateInterval: 300000, // 5 minutes
    correlationUpdateInterval: 300000, // 5 minutes
    minStopDistanceMultiplier: 2.0, // 2x ATR default
    minConfidenceScore: 0.7,
    confidence: {
      decayRate: 0.1,
      recoveryRate: 0.01,
      threshold: 0.5,
    },
    fractal: {},
  },

  capitalFlow: {
    sweepThreshold: 1.2, // 20% excess triggers sweep
    reserveLimit: 200, // $200 minimum
    sweepSchedule: '0 0 * * *', // Daily at midnight UTC
    maxRetries: 3,
    retryBaseDelay: 1000, // 1 second
  },

  circuitBreaker: {
    maxDailyDrawdown: 0.15, // 15%
    minEquity: 150, // $150 (75% of $200 starting)
    consecutiveLossLimit: 3,
    consecutiveLossWindow: 3600000, // 1 hour
    cooldownMinutes: 30,
  },

  database: {
    host: 'localhost',
    port: 5432,
    database: 'titan_brain',
    user: 'postgres',
    password: 'postgres',
    maxConnections: 20,
    idleTimeout: 30000,
  },

  redis: {
    url: 'redis://localhost:6379',
    maxRetries: 3,
    retryDelay: 1000,
  },

  server: {
    host: '0.0.0.0',
    port: 3100,
    corsOrigins: ['http://localhost:3000'],
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
    distributionBins: 20,
    windowSize: 100, // 100 data points
    minHistory: 10,
    sensitivity: 5.0, // Sigmoid steepness
    surpriseOffset: 0.5, // Center of sigmoid
  },

  services: {
    executionUrl: undefined,
  },

  reconciliation: {
    intervalMs: 60000,
    exchanges: ['BYBIT'],
  },
};

// --- INLINED SCHEMA TO FIX BUILD ISSUES ---
// Brain Config
export const BrainSchema = z.object({
  signalTimeout: z.number().min(10).max(10000).default(100),
  metricUpdateInterval: z.number().min(1000).max(3600000).default(60000),
  dashboardCacheTTL: z.number().min(100).max(60000).default(5000),
  maxQueueSize: z.number().min(10).max(10000).default(100),
});

// Allocation Engine Config
export const AllocationEngineSchema = z.object({
  transitionPoints: z
    .object({
      startP2: z.number().min(100).max(100000).default(1500),
      fullP2: z.number().min(100).max(100000).default(5000),
      startP3: z.number().min(1000).max(1000000).default(25000),
    })
    .refine((data) => data.startP2 < data.fullP2, {
      message: 'startP2 must be less than fullP2',
      path: ['startP2'],
    })
    .refine((data) => data.fullP2 < data.startP3, {
      message: 'fullP2 must be less than startP3',
      path: ['fullP2'],
    }),
  leverageCaps: z.object({
    [EquityTier.MICRO]: z.number().default(20),
    [EquityTier.SMALL]: z.number().default(10),
    [EquityTier.MEDIUM]: z.number().default(5),
    [EquityTier.LARGE]: z.number().default(3),
    [EquityTier.INSTITUTIONAL]: z.number().default(2),
  }),
});

// Performance Tracker Config
export const PerformanceTrackerSchema = z
  .object({
    windowDays: z.number().min(1).max(365).default(7),
    minTradeCount: z.number().min(1).max(1000).default(10),
    malusMultiplier: z.number().min(0).max(1).default(0.5),
    bonusMultiplier: z.number().min(1).max(5).default(1.2),
    malusThreshold: z.number().min(-10).max(10).default(0),
    bonusThreshold: z.number().min(0).max(10).default(2.0),
  })
  .refine((data) => data.malusThreshold < data.bonusThreshold, {
    message: 'malusThreshold must be less than bonusThreshold',
    path: ['malusThreshold'],
  });

// Risk Guardian Config
export const RiskGuardianSchema = z.object({
  maxCorrelation: z.number().min(0).max(1).default(0.8),
  correlationPenalty: z.number().min(0).max(1).default(0.5),
  betaUpdateInterval: z.number().min(1000).max(3600000).default(300000),
  correlationUpdateInterval: z.number().min(1000).max(3600000).default(300000),
  minStopDistanceMultiplier: z.number().default(1.5),
});

// Capital Flow Config
export const CapitalFlowSchema = z.object({
  sweepThreshold: z.number().min(1.01).max(2).default(1.2),
  reserveLimit: z.number().min(0).max(10000).default(200),
  sweepSchedule: z.string().regex(new RegExp('^[\\d\\s*/\\-,]+$')).default('0 0 * * *'),
  maxRetries: z.number().min(0).max(10).default(3),
  retryBaseDelay: z.number().min(100).max(60000).default(1000),
});

// Circuit Breaker Config
export const CircuitBreakerSchema = z.object({
  maxDailyDrawdown: z.number().min(0.01).max(1).default(0.15),
  minEquity: z.number().min(0).max(100000).default(150),
  consecutiveLossLimit: z.number().min(1).max(100).default(3),
  consecutiveLossWindow: z.number().min(60000).max(86400000).default(3600000),
  cooldownMinutes: z.number().min(1).max(1440).default(30),
});

// Database Config
export const DatabaseSchema = z.object({
  host: z.string().default('localhost'),
  port: z
    .union([z.string(), z.number()])
    .transform((val) => Number(val))
    .default(5432),
  database: z.string().default('titan_brain'),
  user: z.string().default('postgres'),
  password: z.string().default('postgres'),
  maxConnections: z.number().min(1).max(100).default(20),
  idleTimeout: z.number().min(1000).max(300000).default(30000),
  url: z.string().optional(),
});

// Redis Config
export const RedisSchema = z.object({
  url: z
    .string()
    .regex(/^redis:\/\//)
    .default('redis://localhost:6379'),
  maxRetries: z.number().min(0).max(10).default(3),
  retryDelay: z.number().min(100).max(60000).default(1000),
});

// Server Config
export const ServerSchema = z.object({
  host: z.string().default('0.0.0.0'),
  port: z
    .union([z.string(), z.number()])
    .transform((val) => Number(val))
    .default(3100),
  corsOrigins: z.array(z.string()).default(['http://localhost:3000']),
});

// Notifications Config
export const NotificationSchema = z.object({
  telegram: z.object({
    enabled: z.boolean().default(false),
    botToken: z.string().optional(),
    chatId: z.string().optional(),
  }),
  email: z.object({
    enabled: z.boolean().default(false),
    smtpHost: z.string().optional(),
    smtpPort: z.number().optional(),
    from: z.string().optional(),
    to: z.array(z.string()).optional(),
  }),
});

// Active Inference Config
export const ActiveInferenceSchema = z.object({
  distributionBins: z.number().min(10).max(1000).default(50),
  windowSize: z.number().min(10).max(10000).default(100),
  minHistory: z.number().min(1).max(1000).default(20),
  sensitivity: z.number().min(0.1).max(20).default(1.0),
  surpriseOffset: z.number().min(0).max(1).default(0.1),
});

// Services Config
export const ServicesSchema = z.object({
  executionUrl: z.string().regex(/^http/).optional(),
  phase1WebhookUrl: z.string().regex(/^http/).optional(),
  phase2WebhookUrl: z.string().regex(/^http/).optional(),
  phase3WebhookUrl: z.string().regex(/^http/).optional(),
});

// Root Schema
export const TitanBrainConfigSchema = z.object({
  brain: BrainSchema,
  allocationEngine: AllocationEngineSchema,
  performanceTracker: PerformanceTrackerSchema,
  riskGuardian: RiskGuardianSchema,
  capitalFlow: CapitalFlowSchema,
  circuitBreaker: CircuitBreakerSchema,
  database: DatabaseSchema,
  redis: RedisSchema,
  server: ServerSchema,
  notifications: NotificationSchema,
  activeInference: ActiveInferenceSchema,
  services: ServicesSchema,
});

// --- END INLINED CONTENT ---

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
    console.warn(`Warning: Could not load config file: ${(error as Error).message}`);
    return { config: {}, source: null };
  }
}

/**
 * Load and merge configuration from all sources
 * Priority: Environment variables > Config file > Defaults
 */
export function loadConfig(options: ConfigLoaderOptions = {}): ConfigLoaderResult {
  const { configFile, validate = true, throwOnError = false } = options;

  // Load from config file if provided
  const fileRef = configFile ? getFileConfig(configFile) : { config: {}, source: null };

  // Load from environment variables (highest priority)
  const envConfig = loadConfigFromEnvironment();
  const envSource = Object.keys(envConfig).length > 0 ? 'environment' : null;

  const mergedConfig = deepMerge(deepMerge({ ...defaultConfig }, fileRef.config), envConfig);

  const sources: string[] = ['defaults', fileRef.source, envSource].filter(
    (s): s is string => s !== null,
  );

  // Validate configuration
  const validation = validate
    ? validateMergedConfig(mergedConfig)
    : { valid: true, errors: [], warnings: [] };

  if (validate && !validation.valid && throwOnError) {
    throw new Error(`Configuration validation failed:\n${validation.errors.join('\n')}`);
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
      throw new Error(`Configuration validation failed:\n${result.validation.errors.join('\\n')}`);
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
  public readonly errors: string[];

  constructor(message: string, errors: string[]) {
    super(message);
    this.name = 'ConfigValidationError';
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
      errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
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
    errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
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
