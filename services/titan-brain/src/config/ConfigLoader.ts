/**
 * Configuration Loader for Titan Brain
 * Handles loading, validation, and merging of configuration independently.
 */

import { existsSync, readFileSync } from "fs";
import { EquityTier, TitanBrainConfig } from "../types/index.js";
import { defaultConfig } from "./defaults.js";
import { TitanBrainConfigSchema } from "./schema.js";

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

/**
 * Load configuration from environment variables
 * Enhanced version with full support for all config sections
 */
export function loadConfigFromEnvironment(): Partial<TitanBrainConfig> {
  const config: Partial<TitanBrainConfig> = {};

  // Brain config
  if (
    process.env.BRAIN_SIGNAL_TIMEOUT || process.env.BRAIN_METRIC_UPDATE_INTERVAL
  ) {
    config.brain = {
      signalTimeout: process.env.BRAIN_SIGNAL_TIMEOUT
        ? parseInt(process.env.BRAIN_SIGNAL_TIMEOUT)
        : undefined,
      metricUpdateInterval: process.env.BRAIN_METRIC_UPDATE_INTERVAL
        ? parseInt(process.env.BRAIN_METRIC_UPDATE_INTERVAL)
        : undefined,
      dashboardCacheTTL: process.env.BRAIN_DASHBOARD_CACHE_TTL
        ? parseInt(process.env.BRAIN_DASHBOARD_CACHE_TTL)
        : undefined,
      maxQueueSize: process.env.BRAIN_MAX_QUEUE_SIZE
        ? parseInt(process.env.BRAIN_MAX_QUEUE_SIZE)
        : undefined,
    } as any;
  }

  // Allocation engine config
  if (
    process.env.ALLOCATION_START_P2 ||
    process.env.ALLOCATION_FULL_P2 ||
    process.env.ALLOCATION_START_P3
  ) {
    config.allocationEngine = {
      transitionPoints: {
        startP2: process.env.ALLOCATION_START_P2
          ? parseInt(process.env.ALLOCATION_START_P2)
          : undefined,
        fullP2: process.env.ALLOCATION_FULL_P2
          ? parseInt(process.env.ALLOCATION_FULL_P2)
          : undefined,
        startP3: process.env.ALLOCATION_START_P3
          ? parseInt(process.env.ALLOCATION_START_P3)
          : undefined,
      },
      leverageCaps: {
        [EquityTier.MICRO]: process.env.LEVERAGE_CAP_MICRO
          ? parseInt(process.env.LEVERAGE_CAP_MICRO)
          : undefined,
        [EquityTier.SMALL]: process.env.LEVERAGE_CAP_SMALL
          ? parseInt(process.env.LEVERAGE_CAP_SMALL)
          : undefined,
        [EquityTier.MEDIUM]: process.env.LEVERAGE_CAP_MEDIUM
          ? parseInt(process.env.LEVERAGE_CAP_MEDIUM)
          : undefined,
        [EquityTier.LARGE]: process.env.LEVERAGE_CAP_LARGE
          ? parseInt(process.env.LEVERAGE_CAP_LARGE)
          : undefined,
        [EquityTier.INSTITUTIONAL]: process.env.LEVERAGE_CAP_INSTITUTIONAL
          ? parseInt(process.env.LEVERAGE_CAP_INSTITUTIONAL)
          : undefined,
      },
    } as any;
  }

  // Performance tracker config
  if (
    process.env.PERFORMANCE_WINDOW_DAYS ||
    process.env.PERFORMANCE_MIN_TRADE_COUNT
  ) {
    config.performanceTracker = {
      windowDays: process.env.PERFORMANCE_WINDOW_DAYS
        ? parseInt(process.env.PERFORMANCE_WINDOW_DAYS)
        : undefined,
      minTradeCount: process.env.PERFORMANCE_MIN_TRADE_COUNT
        ? parseInt(process.env.PERFORMANCE_MIN_TRADE_COUNT)
        : undefined,
      malusMultiplier: process.env.PERFORMANCE_MALUS_MULTIPLIER
        ? parseFloat(process.env.PERFORMANCE_MALUS_MULTIPLIER)
        : undefined,
      bonusMultiplier: process.env.PERFORMANCE_BONUS_MULTIPLIER
        ? parseFloat(process.env.PERFORMANCE_BONUS_MULTIPLIER)
        : undefined,
      malusThreshold: process.env.PERFORMANCE_MALUS_THRESHOLD
        ? parseFloat(process.env.PERFORMANCE_MALUS_THRESHOLD)
        : undefined,
      bonusThreshold: process.env.PERFORMANCE_BONUS_THRESHOLD
        ? parseFloat(process.env.PERFORMANCE_BONUS_THRESHOLD)
        : undefined,
    } as any;
  }

  // Risk guardian config
  if (
    process.env.RISK_MAX_CORRELATION || process.env.RISK_CORRELATION_PENALTY
  ) {
    config.riskGuardian = {
      maxCorrelation: process.env.RISK_MAX_CORRELATION
        ? parseFloat(process.env.RISK_MAX_CORRELATION)
        : undefined,
      correlationPenalty: process.env.RISK_CORRELATION_PENALTY
        ? parseFloat(process.env.RISK_CORRELATION_PENALTY)
        : undefined,
      betaUpdateInterval: process.env.RISK_BETA_UPDATE_INTERVAL
        ? parseInt(process.env.RISK_BETA_UPDATE_INTERVAL)
        : undefined,
      correlationUpdateInterval: process.env.RISK_CORRELATION_UPDATE_INTERVAL
        ? parseInt(process.env.RISK_CORRELATION_UPDATE_INTERVAL)
        : undefined,
      minStopDistanceMultiplier: process.env.RISK_MIN_STOP_DISTANCE_MULTIPLIER
        ? parseFloat(process.env.RISK_MIN_STOP_DISTANCE_MULTIPLIER)
        : undefined,
    } as any;
  }

  // Capital flow config
  if (
    process.env.CAPITAL_SWEEP_THRESHOLD || process.env.CAPITAL_RESERVE_LIMIT
  ) {
    config.capitalFlow = {
      sweepThreshold: process.env.CAPITAL_SWEEP_THRESHOLD
        ? parseFloat(process.env.CAPITAL_SWEEP_THRESHOLD)
        : undefined,
      reserveLimit: process.env.CAPITAL_RESERVE_LIMIT
        ? parseFloat(process.env.CAPITAL_RESERVE_LIMIT)
        : undefined,
      sweepSchedule: process.env.CAPITAL_SWEEP_SCHEDULE || undefined,
      maxRetries: process.env.CAPITAL_MAX_RETRIES
        ? parseInt(process.env.CAPITAL_MAX_RETRIES)
        : undefined,
      retryBaseDelay: process.env.CAPITAL_RETRY_BASE_DELAY
        ? parseInt(process.env.CAPITAL_RETRY_BASE_DELAY)
        : undefined,
    } as any;
  }

  // Circuit breaker config
  if (
    process.env.BREAKER_MAX_DAILY_DRAWDOWN || process.env.BREAKER_MIN_EQUITY
  ) {
    config.circuitBreaker = {
      maxDailyDrawdown: process.env.BREAKER_MAX_DAILY_DRAWDOWN
        ? parseFloat(process.env.BREAKER_MAX_DAILY_DRAWDOWN)
        : undefined,
      minEquity: process.env.BREAKER_MIN_EQUITY
        ? parseFloat(process.env.BREAKER_MIN_EQUITY)
        : undefined,
      consecutiveLossLimit: process.env.BREAKER_CONSECUTIVE_LOSS_LIMIT
        ? parseInt(process.env.BREAKER_CONSECUTIVE_LOSS_LIMIT)
        : undefined,
      consecutiveLossWindow: process.env.BREAKER_CONSECUTIVE_LOSS_WINDOW
        ? parseInt(process.env.BREAKER_CONSECUTIVE_LOSS_WINDOW)
        : undefined,
      cooldownMinutes: process.env.BREAKER_COOLDOWN_MINUTES
        ? parseInt(process.env.BREAKER_COOLDOWN_MINUTES)
        : undefined,
    } as any;
  }

  // Database config
  if (process.env.DB_HOST) {
    config.database = {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      maxConnections: process.env.DB_MAX_CONNECTIONS
        ? parseInt(process.env.DB_MAX_CONNECTIONS)
        : undefined,
      idleTimeout: process.env.DB_IDLE_TIMEOUT
        ? parseInt(process.env.DB_IDLE_TIMEOUT)
        : undefined,
    } as any;
  }

  // Redis config
  if (process.env.REDIS_URL) {
    config.redis = {
      url: process.env.REDIS_URL,
      maxRetries: process.env.REDIS_MAX_RETRIES
        ? parseInt(process.env.REDIS_MAX_RETRIES)
        : undefined,
      retryDelay: process.env.REDIS_RETRY_DELAY
        ? parseInt(process.env.REDIS_RETRY_DELAY)
        : undefined,
    } as any;
  }

  // Server config
  if (process.env.SERVER_PORT || process.env.SERVER_HOST) {
    config.server = {
      host: process.env.SERVER_HOST,
      port: process.env.SERVER_PORT
        ? parseInt(process.env.SERVER_PORT)
        : undefined,
      corsOrigins: process.env.CORS_ORIGINS?.split(","),
    } as any;
  }

  // Notification config
  if (process.env.TELEGRAM_BOT_TOKEN || process.env.EMAIL_SMTP_HOST) {
    config.notifications = {
      telegram: {
        enabled: !!process.env.TELEGRAM_BOT_TOKEN,
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
      },
      email: {
        enabled: !!process.env.EMAIL_SMTP_HOST,
        smtpHost: process.env.EMAIL_SMTP_HOST,
        smtpPort: process.env.EMAIL_SMTP_PORT
          ? parseInt(process.env.EMAIL_SMTP_PORT)
          : undefined,
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO?.split(","),
      },
    } as any;
  }

  // Services config
  if (
    process.env.EXECUTION_SERVICE_URL ||
    process.env.PHASE1_WEBHOOK_URL ||
    process.env.PHASE2_WEBHOOK_URL ||
    process.env.PHASE3_WEBHOOK_URL
  ) {
    config.services = {
      executionUrl: process.env.EXECUTION_SERVICE_URL,
      phase1WebhookUrl: process.env.PHASE1_WEBHOOK_URL,
      phase2WebhookUrl: process.env.PHASE2_WEBHOOK_URL,
      phase3WebhookUrl: process.env.PHASE3_WEBHOOK_URL,
    } as any;
  }

  return config;
}

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
  };
}

/**
 * Load and merge configuration from all sources
 * Priority: Environment variables > Config file > Defaults
 */
export function loadConfig(
  options: ConfigLoaderOptions = {},
): ConfigLoaderResult {
  const {
    configFile,
    validate = true,
    throwOnError = false,
  } = options;

  const sources: string[] = ["defaults"];
  let mergedConfig: TitanBrainConfig = { ...defaultConfig };

  // Load from config file if provided
  if (configFile) {
    try {
      const fileConfig = loadConfigFromFile(configFile);
      mergedConfig = deepMerge(mergedConfig, fileConfig);
      sources.push(`file:${configFile}`);
    } catch (error) {
      console.warn(
        `Warning: Could not load config file: ${(error as Error).message}`,
      );
    }
  }

  // Load from environment variables (highest priority)
  const envConfig = loadConfigFromEnvironment();
  if (Object.keys(envConfig).length > 0) {
    mergedConfig = deepMerge(mergedConfig, envConfig);
    sources.push("environment");
  }

  // Validate configuration
  let validation: ValidationResult = { valid: true, errors: [], warnings: [] };
  if (validate) {
    const result = TitanBrainConfigSchema.safeParse(mergedConfig);

    if (result.success) {
      mergedConfig = result.data as TitanBrainConfig;
      validation = { valid: true, errors: [], warnings: [] };
    } else {
      validation = {
        valid: false,
        errors: result.error.errors.map((e) =>
          `${e.path.join(".")}: ${e.message}`
        ),
        warnings: [],
      };

      if (throwOnError) {
        throw new Error(
          `Configuration validation failed:\n${validation.errors.join("\n")}`,
        );
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
  public errors: string[];

  constructor(message: string, errors: string[]) {
    super(message);
    this.name = "ConfigValidationError";
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
