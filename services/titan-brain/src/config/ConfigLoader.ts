/**
 * Configuration Loader for Titan Brain
 * Handles loading, validation, and merging of configuration from multiple sources
 */

import { existsSync, readFileSync } from "fs";
import { EquityTier, TitanBrainConfig } from "../types/index.js";
import { defaultConfig } from "./defaults.js";

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
  ) {
    super(
      `Configuration validation error: ${message} (field: ${field}, value: ${
        JSON.stringify(
          value,
        )
      })`,
    );
    this.name = "ConfigValidationError";
  }
}

/**
 * Configuration validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: string[];
}

/**
 * Configuration schema definition
 */
interface SchemaField {
  type: "string" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: unknown[];
  default?: unknown;
  validate?: (value: unknown) => boolean;
}

type ConfigSchema = Record<string, SchemaField | Record<string, SchemaField>>;

/**
 * Configuration schema for validation
 */
const configSchema: ConfigSchema = {
  brain: {
    signalTimeout: { type: "number", required: true, min: 10, max: 10000 },
    metricUpdateInterval: {
      type: "number",
      required: true,
      min: 1000,
      max: 3600000,
    },
    dashboardCacheTTL: { type: "number", required: true, min: 100, max: 60000 },
    maxQueueSize: { type: "number", required: true, min: 10, max: 10000 },
  },
  allocationEngine: {
    "transitionPoints.startP2": {
      type: "number",
      required: true,
      min: 100,
      max: 100000,
    },
    "transitionPoints.fullP2": {
      type: "number",
      required: true,
      min: 100,
      max: 100000,
    },
    "transitionPoints.startP3": {
      type: "number",
      required: true,
      min: 1000,
      max: 1000000,
    },
  },
  performanceTracker: {
    windowDays: { type: "number", required: true, min: 1, max: 365 },
    minTradeCount: { type: "number", required: true, min: 1, max: 1000 },
    malusMultiplier: { type: "number", required: true, min: 0, max: 1 },
    bonusMultiplier: { type: "number", required: true, min: 1, max: 5 },
    malusThreshold: { type: "number", required: true, min: -10, max: 10 },
    bonusThreshold: { type: "number", required: true, min: 0, max: 10 },
  },
  riskGuardian: {
    maxCorrelation: { type: "number", required: true, min: 0, max: 1 },
    correlationPenalty: { type: "number", required: true, min: 0, max: 1 },
    betaUpdateInterval: {
      type: "number",
      required: true,
      min: 1000,
      max: 3600000,
    },
    correlationUpdateInterval: {
      type: "number",
      required: true,
      min: 1000,
      max: 3600000,
    },
  },
  capitalFlow: {
    sweepThreshold: { type: "number", required: true, min: 1.01, max: 2 },
    reserveLimit: { type: "number", required: true, min: 0, max: 10000 },
    sweepSchedule: {
      type: "string",
      required: true,
      // eslint-disable-next-line no-useless-escape
      pattern: /^[\d\s\*\/\-,]+$/,
    },
    maxRetries: { type: "number", required: true, min: 0, max: 10 },
    retryBaseDelay: { type: "number", required: true, min: 100, max: 60000 },
  },
  circuitBreaker: {
    maxDailyDrawdown: { type: "number", required: true, min: 0.01, max: 1 },
    minEquity: { type: "number", required: true, min: 0, max: 100000 },
    consecutiveLossLimit: { type: "number", required: true, min: 1, max: 100 },
    consecutiveLossWindow: {
      type: "number",
      required: true,
      min: 60000,
      max: 86400000,
    },
    cooldownMinutes: { type: "number", required: true, min: 1, max: 1440 },
  },
  database: {
    host: { type: "string", required: true },
    port: { type: "number", required: true, min: 1, max: 65535 },
    database: { type: "string", required: true },
    user: { type: "string", required: true },
    password: { type: "string", required: true },
    maxConnections: { type: "number", required: true, min: 1, max: 100 },
    idleTimeout: { type: "number", required: true, min: 1000, max: 300000 },
  },
  redis: {
    url: { type: "string", required: true, pattern: /^redis:\/\// },
    maxRetries: { type: "number", required: true, min: 0, max: 10 },
    retryDelay: { type: "number", required: true, min: 100, max: 60000 },
  },
  server: {
    host: { type: "string", required: true },
    port: { type: "number", required: true, min: 1, max: 65535 },
    corsOrigins: { type: "array", required: true },
  },
  activeInference: {
    distributionBins: { type: "number", required: true, min: 10, max: 1000 },
    windowSize: { type: "number", required: true, min: 10, max: 10000 },
    minHistory: { type: "number", required: true, min: 1, max: 1000 },
    sensitivity: { type: "number", required: true, min: 0.1, max: 20 },
    surpriseOffset: { type: "number", required: true, min: 0, max: 1 },
  },
  services: {
    executionUrl: { type: "string", required: false, pattern: /^http/ },
    phase1WebhookUrl: { type: "string", required: false, pattern: /^http/ },
    phase2WebhookUrl: { type: "string", required: false, pattern: /^http/ },
    phase3WebhookUrl: { type: "string", required: false, pattern: /^http/ },
  },
};

/**
 * Validate a single field against its schema
 */
function validateField(
  value: unknown,
  schema: SchemaField,
  fieldPath: string,
): ConfigValidationError | null {
  // Check required
  if (schema.required && (value === undefined || value === null)) {
    return new ConfigValidationError(
      `Required field is missing`,
      fieldPath,
      value,
    );
  }

  // Skip validation if value is undefined and not required
  if (value === undefined || value === null) {
    return null;
  }

  // Type validation
  const actualType = Array.isArray(value) ? "array" : typeof value;
  if (actualType !== schema.type) {
    return new ConfigValidationError(
      `Expected type ${schema.type}, got ${actualType}`,
      fieldPath,
      value,
    );
  }

  // Number range validation
  if (schema.type === "number") {
    const numValue = value as number;
    if (schema.min !== undefined && numValue < schema.min) {
      return new ConfigValidationError(
        `Value ${numValue} is below minimum ${schema.min}`,
        fieldPath,
        value,
      );
    }
    if (schema.max !== undefined && numValue > schema.max) {
      return new ConfigValidationError(
        `Value ${numValue} is above maximum ${schema.max}`,
        fieldPath,
        value,
      );
    }
  }

  // String pattern validation
  if (schema.type === "string" && schema.pattern) {
    const strValue = value as string;
    if (!schema.pattern.test(strValue)) {
      return new ConfigValidationError(
        `Value does not match required pattern`,
        fieldPath,
        value,
      );
    }
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    return new ConfigValidationError(
      `Value must be one of: ${schema.enum.join(", ")}`,
      fieldPath,
      value,
    );
  }

  // Custom validation
  if (schema.validate && !schema.validate(value)) {
    return new ConfigValidationError(
      `Custom validation failed`,
      fieldPath,
      value,
    );
  }

  return null;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Validate configuration against schema
 */
export function validateConfig(
  config: Partial<TitanBrainConfig>,
): ValidationResult {
  const errors: ConfigValidationError[] = [];
  const warnings: string[] = [];

  for (const [section, fields] of Object.entries(configSchema)) {
    const sectionConfig = config[section as keyof TitanBrainConfig];

    if (!sectionConfig) {
      // Section missing - will use defaults
      warnings.push(`Section '${section}' not provided, using defaults`);
      continue;
    }

    for (
      const [fieldPath, schema] of Object.entries(
        fields as Record<string, SchemaField>,
      )
    ) {
      const fullPath = `${section}.${fieldPath}`;
      // Cast to unknown first to avoid type overlap issues
      const value = getNestedValue(
        sectionConfig as unknown as Record<string, unknown>,
        fieldPath,
      );
      const error = validateField(value, schema, fullPath);
      if (error) {
        errors.push(error);
      }
    }
  }

  // Cross-field validations
  if (config.allocationEngine?.transitionPoints) {
    const { startP2, fullP2, startP3 } =
      config.allocationEngine.transitionPoints;
    if (startP2 !== undefined && fullP2 !== undefined && startP2 >= fullP2) {
      errors.push(
        new ConfigValidationError(
          "startP2 must be less than fullP2",
          "allocationEngine.transitionPoints",
          { startP2, fullP2 },
        ),
      );
    }
    if (fullP2 !== undefined && startP3 !== undefined && fullP2 >= startP3) {
      errors.push(
        new ConfigValidationError(
          "fullP2 must be less than startP3",
          "allocationEngine.transitionPoints",
          { fullP2, startP3 },
        ),
      );
    }
  }

  if (config.performanceTracker) {
    const { malusThreshold, bonusThreshold } = config.performanceTracker;
    if (
      malusThreshold !== undefined &&
      bonusThreshold !== undefined &&
      malusThreshold >= bonusThreshold
    ) {
      errors.push(
        new ConfigValidationError(
          "malusThreshold must be less than bonusThreshold",
          "performanceTracker",
          { malusThreshold, bonusThreshold },
        ),
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
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
      signalTimeout: parseInt(process.env.BRAIN_SIGNAL_TIMEOUT || "100"),
      metricUpdateInterval: parseInt(
        process.env.BRAIN_METRIC_UPDATE_INTERVAL || "60000",
      ),
      dashboardCacheTTL: parseInt(
        process.env.BRAIN_DASHBOARD_CACHE_TTL || "5000",
      ),
      maxQueueSize: parseInt(process.env.BRAIN_MAX_QUEUE_SIZE || "100"),
    };
  }

  // Allocation engine config
  if (
    process.env.ALLOCATION_START_P2 ||
    process.env.ALLOCATION_FULL_P2 ||
    process.env.ALLOCATION_START_P3
  ) {
    config.allocationEngine = {
      transitionPoints: {
        startP2: parseInt(process.env.ALLOCATION_START_P2 || "1500"),
        fullP2: parseInt(process.env.ALLOCATION_FULL_P2 || "5000"),
        startP3: parseInt(process.env.ALLOCATION_START_P3 || "25000"),
      },
      leverageCaps: {
        [EquityTier.MICRO]: parseInt(process.env.LEVERAGE_CAP_MICRO || "20"),
        [EquityTier.SMALL]: parseInt(process.env.LEVERAGE_CAP_SMALL || "10"),
        [EquityTier.MEDIUM]: parseInt(process.env.LEVERAGE_CAP_MEDIUM || "5"),
        [EquityTier.LARGE]: parseInt(process.env.LEVERAGE_CAP_LARGE || "3"),
        [EquityTier.INSTITUTIONAL]: parseInt(
          process.env.LEVERAGE_CAP_INSTITUTIONAL || "2",
        ),
      },
    };
  }

  // Performance tracker config
  if (
    process.env.PERFORMANCE_WINDOW_DAYS ||
    process.env.PERFORMANCE_MIN_TRADE_COUNT
  ) {
    config.performanceTracker = {
      windowDays: parseInt(process.env.PERFORMANCE_WINDOW_DAYS || "7"),
      minTradeCount: parseInt(process.env.PERFORMANCE_MIN_TRADE_COUNT || "10"),
      malusMultiplier: parseFloat(
        process.env.PERFORMANCE_MALUS_MULTIPLIER || "0.5",
      ),
      bonusMultiplier: parseFloat(
        process.env.PERFORMANCE_BONUS_MULTIPLIER || "1.2",
      ),
      malusThreshold: parseFloat(
        process.env.PERFORMANCE_MALUS_THRESHOLD || "0",
      ),
      bonusThreshold: parseFloat(
        process.env.PERFORMANCE_BONUS_THRESHOLD || "2.0",
      ),
    };
  }

  // Risk guardian config
  if (
    process.env.RISK_MAX_CORRELATION || process.env.RISK_CORRELATION_PENALTY
  ) {
    config.riskGuardian = {
      maxCorrelation: parseFloat(process.env.RISK_MAX_CORRELATION || "0.8"),
      correlationPenalty: parseFloat(
        process.env.RISK_CORRELATION_PENALTY || "0.5",
      ),
      betaUpdateInterval: parseInt(
        process.env.RISK_BETA_UPDATE_INTERVAL || "300000",
      ),
      correlationUpdateInterval: parseInt(
        process.env.RISK_CORRELATION_UPDATE_INTERVAL || "300000",
      ),
      minStopDistanceMultiplier: parseFloat(
        process.env.RISK_MIN_STOP_DISTANCE_MULTIPLIER || "1.5",
      ),
    };
  }

  // Capital flow config
  if (
    process.env.CAPITAL_SWEEP_THRESHOLD || process.env.CAPITAL_RESERVE_LIMIT
  ) {
    config.capitalFlow = {
      sweepThreshold: parseFloat(process.env.CAPITAL_SWEEP_THRESHOLD || "1.2"),
      reserveLimit: parseFloat(process.env.CAPITAL_RESERVE_LIMIT || "200"),
      sweepSchedule: process.env.CAPITAL_SWEEP_SCHEDULE || "0 0 * * *",
      maxRetries: parseInt(process.env.CAPITAL_MAX_RETRIES || "3"),
      retryBaseDelay: parseInt(process.env.CAPITAL_RETRY_BASE_DELAY || "1000"),
    };
  }

  // Circuit breaker config
  if (
    process.env.BREAKER_MAX_DAILY_DRAWDOWN || process.env.BREAKER_MIN_EQUITY
  ) {
    config.circuitBreaker = {
      maxDailyDrawdown: parseFloat(
        process.env.BREAKER_MAX_DAILY_DRAWDOWN || "0.15",
      ),
      minEquity: parseFloat(process.env.BREAKER_MIN_EQUITY || "150"),
      consecutiveLossLimit: parseInt(
        process.env.BREAKER_CONSECUTIVE_LOSS_LIMIT || "3",
      ),
      consecutiveLossWindow: parseInt(
        process.env.BREAKER_CONSECUTIVE_LOSS_WINDOW || "3600000",
      ),
      cooldownMinutes: parseInt(process.env.BREAKER_COOLDOWN_MINUTES || "30"),
    };
  }

  // Database config
  if (process.env.DB_HOST) {
    config.database = {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || "5432"),
      database: process.env.DB_NAME || "titan_brain",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || "20"),
      idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || "30000"),
    };
  }

  // Redis config
  if (process.env.REDIS_URL) {
    config.redis = {
      url: process.env.REDIS_URL,
      maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || "3"),
      retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || "1000"),
    };
  }

  // Server config
  if (process.env.SERVER_PORT || process.env.SERVER_HOST) {
    config.server = {
      host: process.env.SERVER_HOST || "0.0.0.0",
      port: parseInt(process.env.SERVER_PORT || "3100"),
      corsOrigins: process.env.CORS_ORIGINS?.split(",") ||
        ["http://localhost:3000"],
    };
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
    };
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
    };
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
 * Configuration loader options
 */
export interface ConfigLoaderOptions {
  /** Path to configuration file (optional) */
  configFile?: string;
  /** Whether to validate configuration (default: true) */
  validate?: boolean;
  /** Whether to throw on validation errors (default: true) */
  throwOnError?: boolean;
  /** Whether to log warnings (default: true) */
  logWarnings?: boolean;
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
 * Load and merge configuration from all sources
 * Priority: Environment variables > Config file > Defaults
 */
export function loadConfig(
  options: ConfigLoaderOptions = {},
): ConfigLoaderResult {
  const {
    configFile,
    validate = true,
    throwOnError = true,
    logWarnings = true,
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
      if (throwOnError) {
        throw error;
      }
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
    validation = validateConfig(mergedConfig);

    if (logWarnings && validation.warnings.length > 0) {
      for (const warning of validation.warnings) {
        console.warn(`Config warning: ${warning}`);
      }
    }

    if (!validation.valid && throwOnError) {
      const errorMessages = validation.errors.map((e) => e.message).join("\n");
      throw new Error(`Configuration validation failed:\n${errorMessages}`);
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
  private lastLoaded: number = 0;
  private readonly cacheTTL: number;

  constructor(
    private readonly options: ConfigLoaderOptions = {},
    cacheTTL: number = 60000, // 1 minute default
  ) {
    this.cacheTTL = cacheTTL;
  }

  /**
   * Get configuration (cached)
   */
  getConfig(): TitanBrainConfig {
    const now = Date.now();
    if (this.config && now - this.lastLoaded < this.cacheTTL) {
      return this.config;
    }

    const result = loadConfig(this.options);
    this.config = result.config;
    this.lastLoaded = now;
    return this.config;
  }

  /**
   * Force reload configuration
   */
  reload(): TitanBrainConfig {
    this.config = null;
    this.lastLoaded = 0;
    return this.getConfig();
  }

  /**
   * Get validation result for current configuration
   */
  validate(): ValidationResult {
    return validateConfig(this.getConfig());
  }

  /**
   * Check if configuration is valid
   */
  isValid(): boolean {
    return this.validate().valid;
  }
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
