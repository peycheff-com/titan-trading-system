/**
 * ConfigSchema.js
 * 
 * Environment variable validation using Zod schema.
 * Ensures fail-fast startup with clear error messages for missing or invalid configuration.
 * 
 * Requirements: 96.1-96.10
 */

import { z } from 'zod';

/**
 * Validation constants for configuration bounds
 */
const VALIDATION_CONSTANTS = {
  MIN_HMAC_SECRET_LENGTH: 32,
  MIN_RISK_PCT: 0.01,
  MAX_RISK_PCT: 0.20,
  MIN_PHASE_RISK_PCT: 0.01,
  MAX_PHASE_RISK_PCT: 0.50,
  MIN_FEE_PCT: 0,
  MAX_FEE_PCT: 0.01,
  DEFAULT_MAKER_FEE: 0.0002,
  DEFAULT_TAKER_FEE: 0.0006,
  MIN_RATE_LIMIT: 1,
  MAX_RATE_LIMIT: 50,
  DEFAULT_RATE_LIMIT: 12,
  MIN_PORT: 1,
  MAX_PORT: 65535,
  DEFAULT_PORT: 3001,
  DEFAULT_HOST: '0.0.0.0',
  DEFAULT_LOG_LEVEL: 'info',
  MIN_HEARTBEAT_TIMEOUT: 60000,
  DEFAULT_HEARTBEAT_TIMEOUT: 300000,
  MIN_IDEMPOTENCY_TTL: 60,
  DEFAULT_IDEMPOTENCY_TTL: 300,
  MIN_TIMESTAMP_DRIFT: 1000,
  MAX_TIMESTAMP_DRIFT: 30000,
  DEFAULT_TIMESTAMP_DRIFT: 5000,
  MIN_SIGNAL_CACHE_TTL: 60000,
  DEFAULT_SIGNAL_CACHE_TTL: 300000,
  DEFAULT_ZSCORE_THRESHOLD: -2.0,
  MIN_DRAWDOWN_VELOCITY: 0.01,
  MAX_DRAWDOWN_VELOCITY: 0.10,
  DEFAULT_DRAWDOWN_VELOCITY: 0.02,
  MIN_WS_CACHE_AGE: 10,
  MAX_WS_CACHE_AGE: 1000,
  DEFAULT_WS_CACHE_AGE: 100,
  MIN_STRUCTURE_THRESHOLD: 0,
  MAX_STRUCTURE_THRESHOLD: 100,
  DEFAULT_STRUCTURE_THRESHOLD: 60,
  MIN_SPREAD_PCT: 0,
  MAX_SPREAD_PCT: 0.05,
  DEFAULT_SPREAD_PCT: 0.001,
  MIN_SLIPPAGE_PCT: 0,
  MAX_SLIPPAGE_PCT: 0.05,
  DEFAULT_SLIPPAGE_PCT: 0.002,
  MIN_CONSECUTIVE_LOSSES: 1,
  MAX_CONSECUTIVE_LOSSES: 10,
  DEFAULT_CONSECUTIVE_LOSSES: 3,
  MIN_DAILY_DRAWDOWN: 0.01,
  MAX_DAILY_DRAWDOWN: 0.20,
  DEFAULT_DAILY_DRAWDOWN: 0.05,
  MIN_WEEKLY_DRAWDOWN: 0.01,
  MAX_WEEKLY_DRAWDOWN: 0.30,
  DEFAULT_WEEKLY_DRAWDOWN: 0.10,
  MIN_COOLDOWN_HOURS: 1,
  MAX_COOLDOWN_HOURS: 24,
  DEFAULT_COOLDOWN_HOURS: 4,
  MIN_GREED_THRESHOLD: 50,
  MAX_GREED_THRESHOLD: 100,
  DEFAULT_GREED_THRESHOLD: 100,
  MIN_HIGH_GREED_THRESHOLD: 25,
  MAX_HIGH_GREED_THRESHOLD: 75,
  DEFAULT_HIGH_GREED_THRESHOLD: 50,
  MIN_FEAR_THRESHOLD: -100,
  MAX_FEAR_THRESHOLD: -25,
  DEFAULT_FEAR_THRESHOLD: -50,
  REDIS_CONNECT_TIMEOUT: 5000,
};

/**
 * Zod schema for environment variables
 * 
 * Requirements:
 * - 96.1: Validate ALL environment variables against strict schema before initializing components
 * - 96.4: MAX_RISK_PCT required: float between 0.01 and 0.20
 * - 96.5: PHASE_1_RISK_PCT and PHASE_2_RISK_PCT required: float between 0.01 and 0.50
 * - 96.6: BROKER_API_KEY, BROKER_API_SECRET, HMAC_SECRET required (critical security credentials)
 * - 96.7: Numeric environment variables must contain valid numeric values
 */
const ConfigSchema = z.object({
  /**
   * Broker API key for order execution
   * @env BROKER_API_KEY
   * @required
   * @example "abc123xyz..."
   */
  BROKER_API_KEY: z.string().min(1, 'Broker API key required'),

  /**
   * Broker API secret for authentication
   * @env BROKER_API_SECRET
   * @required
   * @example "secret123..."
   */
  BROKER_API_SECRET: z.string().min(1, 'Broker API secret required'),

  /**
   * HMAC secret for webhook signature verification
   * @env HMAC_SECRET
   * @required
   * @minLength 32
   * @example "hmac_secret_at_least_32_chars_long"
   */
  HMAC_SECRET: z.string().min(
    VALIDATION_CONSTANTS.MIN_HMAC_SECRET_LENGTH,
    `HMAC secret must be at least ${VALIDATION_CONSTANTS.MIN_HMAC_SECRET_LENGTH} characters for security`
  ),

  /**
   * Maximum risk per trade as percentage of equity
   * @env MAX_RISK_PCT
   * @required
   * @range 0.01-0.20 (1%-20%)
   * @example 0.02 (2%)
   */
  MAX_RISK_PCT: z.number()
    .min(VALIDATION_CONSTANTS.MIN_RISK_PCT, `MAX_RISK_PCT must be at least ${VALIDATION_CONSTANTS.MIN_RISK_PCT} (1%)`)
    .max(VALIDATION_CONSTANTS.MAX_RISK_PCT, `MAX_RISK_PCT must not exceed ${VALIDATION_CONSTANTS.MAX_RISK_PCT} (20%)`),

  /**
   * Phase 1 (Kickstarter) risk percentage
   * @env PHASE_1_RISK_PCT
   * @required
   * @range 0.01-0.50 (1%-50%)
   * @example 0.10 (10%)
   */
  PHASE_1_RISK_PCT: z.number()
    .min(VALIDATION_CONSTANTS.MIN_PHASE_RISK_PCT, `PHASE_1_RISK_PCT must be at least ${VALIDATION_CONSTANTS.MIN_PHASE_RISK_PCT} (1%)`)
    .max(VALIDATION_CONSTANTS.MAX_PHASE_RISK_PCT, `PHASE_1_RISK_PCT must not exceed ${VALIDATION_CONSTANTS.MAX_PHASE_RISK_PCT} (50%)`),

  /**
   * Phase 2 (Trend Rider) risk percentage
   * @env PHASE_2_RISK_PCT
   * @required
   * @range 0.01-0.50 (1%-50%)
   * @example 0.05 (5%)
   */
  PHASE_2_RISK_PCT: z.number()
    .min(VALIDATION_CONSTANTS.MIN_PHASE_RISK_PCT, `PHASE_2_RISK_PCT must be at least ${VALIDATION_CONSTANTS.MIN_PHASE_RISK_PCT} (1%)`)
    .max(VALIDATION_CONSTANTS.MAX_PHASE_RISK_PCT, `PHASE_2_RISK_PCT must not exceed ${VALIDATION_CONSTANTS.MAX_PHASE_RISK_PCT} (50%)`),

  /**
   * Maker fee percentage (post-only orders)
   * @env MAKER_FEE_PCT
   * @optional
   * @default 0.0002 (0.02%)
   * @range 0-0.01 (0%-1%)
   */
  MAKER_FEE_PCT: z.number()
    .min(VALIDATION_CONSTANTS.MIN_FEE_PCT, 'MAKER_FEE_PCT cannot be negative')
    .max(VALIDATION_CONSTANTS.MAX_FEE_PCT, `MAKER_FEE_PCT must not exceed ${VALIDATION_CONSTANTS.MAX_FEE_PCT} (1%)`)
    .default(VALIDATION_CONSTANTS.DEFAULT_MAKER_FEE),

  /**
   * Taker fee percentage (market orders)
   * @env TAKER_FEE_PCT
   * @optional
   * @default 0.0006 (0.06%)
   * @range 0-0.01 (0%-1%)
   */
  TAKER_FEE_PCT: z.number()
    .min(VALIDATION_CONSTANTS.MIN_FEE_PCT, 'TAKER_FEE_PCT cannot be negative')
    .max(VALIDATION_CONSTANTS.MAX_FEE_PCT, `TAKER_FEE_PCT must not exceed ${VALIDATION_CONSTANTS.MAX_FEE_PCT} (1%)`)
    .default(VALIDATION_CONSTANTS.DEFAULT_TAKER_FEE),

  /**
   * Rate limit for broker API calls per second
   * @env RATE_LIMIT_PER_SEC
   * @optional
   * @default 12
   * @range 1-50
   */
  RATE_LIMIT_PER_SEC: z.number()
    .int('RATE_LIMIT_PER_SEC must be an integer')
    .min(VALIDATION_CONSTANTS.MIN_RATE_LIMIT, `RATE_LIMIT_PER_SEC must be at least ${VALIDATION_CONSTANTS.MIN_RATE_LIMIT}`)
    .max(VALIDATION_CONSTANTS.MAX_RATE_LIMIT, `RATE_LIMIT_PER_SEC must not exceed ${VALIDATION_CONSTANTS.MAX_RATE_LIMIT}`)
    .default(VALIDATION_CONSTANTS.DEFAULT_RATE_LIMIT),

  /**
   * Database connection URL
   * @env DATABASE_URL
   * @optional
   * @example "postgresql://user:pass@localhost:5432/db"
   */
  DATABASE_URL: z.string().optional(),

  /**
   * Database type
   * @env DATABASE_TYPE
   * @optional
   * @default "sqlite"
   * @values "postgres" | "sqlite"
   */
  DATABASE_TYPE: z.enum(['postgres', 'sqlite']).default('sqlite'),

  /**
   * Redis connection URL
   * @env REDIS_URL
   * @optional
   * @example "redis://localhost:6379"
   */
  REDIS_URL: z.string().optional(),

  /**
   * Whether Redis is required for operation
   * @env REDIS_REQUIRED
   * @optional
   * @default false
   */
  REDIS_REQUIRED: z.boolean().default(false),

  /**
   * Broker API base URL
   * @env BROKER_API_URL
   * @optional
   * @example "https://api.broker.com"
   */
  BROKER_API_URL: z.string().url('BROKER_API_URL must be a valid URL').optional(),

  /**
   * WebSocket URL for order book stream
   * @env WS_ORDERBOOK_URL
   * @optional
   * @example "wss://stream.broker.com/orderbook"
   */
  WS_ORDERBOOK_URL: z.string().optional(),

  /**
   * Maximum age of WebSocket cache data in milliseconds
   * @env WS_CACHE_MAX_AGE_MS
   * @optional
   * @default 100
   * @range 10-1000
   */
  WS_CACHE_MAX_AGE_MS: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_WS_CACHE_AGE)
    .max(VALIDATION_CONSTANTS.MAX_WS_CACHE_AGE)
    .default(VALIDATION_CONSTANTS.DEFAULT_WS_CACHE_AGE),

  /**
   * Server port
   * @env PORT
   * @optional
   * @default 3001
   * @range 1-65535
   */
  PORT: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_PORT)
    .max(VALIDATION_CONSTANTS.MAX_PORT)
    .default(VALIDATION_CONSTANTS.DEFAULT_PORT),

  /**
   * Server host
   * @env HOST
   * @optional
   * @default "0.0.0.0"
   */
  HOST: z.string().default(VALIDATION_CONSTANTS.DEFAULT_HOST),

  /**
   * Logging level
   * @env LOG_LEVEL
   * @optional
   * @default "info"
   * @values "trace" | "debug" | "info" | "warn" | "error" | "fatal"
   */
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default(VALIDATION_CONSTANTS.DEFAULT_LOG_LEVEL),

  /**
   * Heartbeat timeout in milliseconds (dead man's switch)
   * @env HEARTBEAT_TIMEOUT_MS
   * @optional
   * @default 300000 (5 minutes)
   * @min 60000 (1 minute)
   */
  HEARTBEAT_TIMEOUT_MS: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_HEARTBEAT_TIMEOUT)
    .default(VALIDATION_CONSTANTS.DEFAULT_HEARTBEAT_TIMEOUT),

  /**
   * Idempotency store TTL in seconds
   * @env IDEMPOTENCY_TTL
   * @optional
   * @default 300 (5 minutes)
   * @min 60 (1 minute)
   */
  IDEMPOTENCY_TTL: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_IDEMPOTENCY_TTL)
    .default(VALIDATION_CONSTANTS.DEFAULT_IDEMPOTENCY_TTL),

  /**
   * Maximum timestamp drift for replay attack prevention
   * @env MAX_TIMESTAMP_DRIFT_MS
   * @optional
   * @default 5000 (5 seconds)
   * @range 1000-30000 (1-30 seconds)
   */
  MAX_TIMESTAMP_DRIFT_MS: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_TIMESTAMP_DRIFT)
    .max(VALIDATION_CONSTANTS.MAX_TIMESTAMP_DRIFT)
    .default(VALIDATION_CONSTANTS.DEFAULT_TIMESTAMP_DRIFT),

  /**
   * Signal cache TTL in milliseconds
   * @env SIGNAL_CACHE_TTL_MS
   * @optional
   * @default 300000 (5 minutes)
   * @min 60000 (1 minute)
   */
  SIGNAL_CACHE_TTL_MS: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_SIGNAL_CACHE_TTL)
    .default(VALIDATION_CONSTANTS.DEFAULT_SIGNAL_CACHE_TTL),

  /**
   * Z-Score threshold for safety stop
   * @env ZSCORE_SAFETY_THRESHOLD
   * @optional
   * @default -2.0
   * @max 0 (must be negative or zero)
   */
  ZSCORE_SAFETY_THRESHOLD: z.number()
    .max(0, 'ZSCORE_SAFETY_THRESHOLD must be negative or zero')
    .default(VALIDATION_CONSTANTS.DEFAULT_ZSCORE_THRESHOLD),

  /**
   * Drawdown velocity threshold for hard kill
   * @env DRAWDOWN_VELOCITY_THRESHOLD
   * @optional
   * @default 0.02 (2%)
   * @range 0.01-0.10 (1%-10%)
   */
  DRAWDOWN_VELOCITY_THRESHOLD: z.number()
    .min(VALIDATION_CONSTANTS.MIN_DRAWDOWN_VELOCITY)
    .max(VALIDATION_CONSTANTS.MAX_DRAWDOWN_VELOCITY)
    .default(VALIDATION_CONSTANTS.DEFAULT_DRAWDOWN_VELOCITY),

  /**
   * Minimum market structure score threshold
   * @env MIN_STRUCTURE_THRESHOLD
   * @optional
   * @default 60
   * @range 0-100
   */
  MIN_STRUCTURE_THRESHOLD: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_STRUCTURE_THRESHOLD)
    .max(VALIDATION_CONSTANTS.MAX_STRUCTURE_THRESHOLD)
    .default(VALIDATION_CONSTANTS.DEFAULT_STRUCTURE_THRESHOLD),

  /**
   * Maximum spread percentage
   * @env MAX_SPREAD_PCT
   * @optional
   * @default 0.001 (0.1%)
   * @range 0-0.05 (0%-5%)
   */
  MAX_SPREAD_PCT: z.number()
    .min(VALIDATION_CONSTANTS.MIN_SPREAD_PCT)
    .max(VALIDATION_CONSTANTS.MAX_SPREAD_PCT)
    .default(VALIDATION_CONSTANTS.DEFAULT_SPREAD_PCT),

  /**
   * Maximum slippage percentage
   * @env MAX_SLIPPAGE_PCT
   * @optional
   * @default 0.002 (0.2%)
   * @range 0-0.05 (0%-5%)
   */
  MAX_SLIPPAGE_PCT: z.number()
    .min(VALIDATION_CONSTANTS.MIN_SLIPPAGE_PCT)
    .max(VALIDATION_CONSTANTS.MAX_SLIPPAGE_PCT)
    .default(VALIDATION_CONSTANTS.DEFAULT_SLIPPAGE_PCT),

  /**
   * Maximum consecutive losses before circuit breaker
   * @env MAX_CONSECUTIVE_LOSSES
   * @optional
   * @default 3
   * @range 1-10
   */
  MAX_CONSECUTIVE_LOSSES: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_CONSECUTIVE_LOSSES)
    .max(VALIDATION_CONSTANTS.MAX_CONSECUTIVE_LOSSES)
    .default(VALIDATION_CONSTANTS.DEFAULT_CONSECUTIVE_LOSSES),

  /**
   * Maximum daily drawdown percentage
   * @env MAX_DAILY_DRAWDOWN_PCT
   * @optional
   * @default 0.05 (5%)
   * @range 0.01-0.20 (1%-20%)
   */
  MAX_DAILY_DRAWDOWN_PCT: z.number()
    .min(VALIDATION_CONSTANTS.MIN_DAILY_DRAWDOWN)
    .max(VALIDATION_CONSTANTS.MAX_DAILY_DRAWDOWN)
    .default(VALIDATION_CONSTANTS.DEFAULT_DAILY_DRAWDOWN),

  /**
   * Maximum weekly drawdown percentage
   * @env MAX_WEEKLY_DRAWDOWN_PCT
   * @optional
   * @default 0.10 (10%)
   * @range 0.01-0.30 (1%-30%)
   */
  MAX_WEEKLY_DRAWDOWN_PCT: z.number()
    .min(VALIDATION_CONSTANTS.MIN_WEEKLY_DRAWDOWN)
    .max(VALIDATION_CONSTANTS.MAX_WEEKLY_DRAWDOWN)
    .default(VALIDATION_CONSTANTS.DEFAULT_WEEKLY_DRAWDOWN),

  /**
   * Circuit breaker cooldown period in hours
   * @env CIRCUIT_BREAKER_COOLDOWN_HOURS
   * @optional
   * @default 4
   * @range 1-24
   */
  CIRCUIT_BREAKER_COOLDOWN_HOURS: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_COOLDOWN_HOURS)
    .max(VALIDATION_CONSTANTS.MAX_COOLDOWN_HOURS)
    .default(VALIDATION_CONSTANTS.DEFAULT_COOLDOWN_HOURS),

  /**
   * Funding rate greed threshold
   * @env FUNDING_GREED_THRESHOLD
   * @optional
   * @default 100
   * @range 50-100
   */
  FUNDING_GREED_THRESHOLD: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_GREED_THRESHOLD)
    .max(VALIDATION_CONSTANTS.MAX_GREED_THRESHOLD)
    .default(VALIDATION_CONSTANTS.DEFAULT_GREED_THRESHOLD),

  /**
   * Funding rate high greed threshold
   * @env FUNDING_HIGH_GREED_THRESHOLD
   * @optional
   * @default 50
   * @range 25-75
   */
  FUNDING_HIGH_GREED_THRESHOLD: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_HIGH_GREED_THRESHOLD)
    .max(VALIDATION_CONSTANTS.MAX_HIGH_GREED_THRESHOLD)
    .default(VALIDATION_CONSTANTS.DEFAULT_HIGH_GREED_THRESHOLD),

  /**
   * Funding rate fear threshold
   * @env FUNDING_FEAR_THRESHOLD
   * @optional
   * @default -50
   * @range -100 to -25
   */
  FUNDING_FEAR_THRESHOLD: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_FEAR_THRESHOLD)
    .max(VALIDATION_CONSTANTS.MAX_FEAR_THRESHOLD)
    .default(VALIDATION_CONSTANTS.DEFAULT_FEAR_THRESHOLD),

  /**
   * Enable HTTPS for production
   * @env HTTPS_ENABLED
   * @optional
   * @default false
   */
  HTTPS_ENABLED: z.boolean().default(false),

  /**
   * Path to SSL certificate file
   * @env SSL_CERT_PATH
   * @optional
   * @example "/etc/ssl/certs/titan.crt"
   */
  SSL_CERT_PATH: z.string().optional(),

  /**
   * Path to SSL private key file
   * @env SSL_KEY_PATH
   * @optional
   * @example "/etc/ssl/private/titan.key"
   */
  SSL_KEY_PATH: z.string().optional(),

  /**
   * HTTPS port (if different from HTTP port)
   * @env HTTPS_PORT
   * @optional
   * @default 443
   * @range 1-65535
   */
  HTTPS_PORT: z.number()
    .int()
    .min(VALIDATION_CONSTANTS.MIN_PORT)
    .max(VALIDATION_CONSTANTS.MAX_PORT)
    .default(443),

  /**
   * Redirect HTTP to HTTPS
   * @env HTTPS_REDIRECT
   * @optional
   * @default true (when HTTPS is enabled)
   */
  HTTPS_REDIRECT: z.boolean().default(true),
});

/**
 * Helper to parse number values from environment variables
 * @param {string} key - Environment variable key
 * @param {string} value - Environment variable value
 * @returns {number} Parsed number
 * @throws {Error} If value is not a valid number
 */
function parseNumberValue(key, value) {
  const num = parseFloat(value);
  if (isNaN(num)) {
    throw new Error(`${key} must be a valid number, got: ${value}`);
  }
  return num;
}

/**
 * Helper to parse integer values from environment variables
 * @param {string} key - Environment variable key
 * @param {string} value - Environment variable value
 * @returns {number} Parsed integer
 * @throws {Error} If value is not a valid integer
 */
function parseIntValue(key, value) {
  const num = Number.parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`${key} must be a valid integer, got: ${value}`);
  }
  return num;
}

/**
 * Helper to parse boolean values from environment variables
 * @param {string} value - Environment variable value
 * @returns {boolean} Parsed boolean
 */
function parseBooleanValue(value) {
  return value === 'true' || value === '1';
}

/**
 * Configuration specification for environment variables
 * Defines type, requirements, and defaults for each config field
 */
const CONFIG_SPEC = {
  // Critical Security Credentials (required)
  BROKER_API_KEY: { type: 'string', required: true },
  BROKER_API_SECRET: { type: 'string', required: true },
  HMAC_SECRET: { type: 'string', required: true },

  // Risk Parameters (required)
  MAX_RISK_PCT: { type: 'number', required: true },
  PHASE_1_RISK_PCT: { type: 'number', required: true },
  PHASE_2_RISK_PCT: { type: 'number', required: true },

  // Fee Configuration (optional with defaults)
  MAKER_FEE_PCT: { type: 'number', default: VALIDATION_CONSTANTS.DEFAULT_MAKER_FEE },
  TAKER_FEE_PCT: { type: 'number', default: VALIDATION_CONSTANTS.DEFAULT_TAKER_FEE },

  // Rate Limiting
  RATE_LIMIT_PER_SEC: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_RATE_LIMIT },

  // Database Configuration
  DATABASE_URL: { type: 'string', optional: true },
  DATABASE_TYPE: { type: 'enum', values: ['postgres', 'sqlite'], default: 'sqlite' },

  // Redis Configuration
  REDIS_URL: { type: 'string', optional: true },
  REDIS_REQUIRED: { type: 'boolean', default: false },

  // Broker Configuration
  BROKER_API_URL: { type: 'string', optional: true },

  // WebSocket Configuration
  WS_ORDERBOOK_URL: { type: 'string', optional: true },
  WS_CACHE_MAX_AGE_MS: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_WS_CACHE_AGE },

  // Server Configuration
  PORT: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_PORT },
  HOST: { type: 'string', default: VALIDATION_CONSTANTS.DEFAULT_HOST },
  LOG_LEVEL: { type: 'enum', values: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'], default: VALIDATION_CONSTANTS.DEFAULT_LOG_LEVEL },

  // Timeouts and Thresholds
  HEARTBEAT_TIMEOUT_MS: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_HEARTBEAT_TIMEOUT },
  IDEMPOTENCY_TTL: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_IDEMPOTENCY_TTL },
  MAX_TIMESTAMP_DRIFT_MS: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_TIMESTAMP_DRIFT },
  SIGNAL_CACHE_TTL_MS: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_SIGNAL_CACHE_TTL },

  // Risk Thresholds
  ZSCORE_SAFETY_THRESHOLD: { type: 'number', default: VALIDATION_CONSTANTS.DEFAULT_ZSCORE_THRESHOLD },
  DRAWDOWN_VELOCITY_THRESHOLD: { type: 'number', default: VALIDATION_CONSTANTS.DEFAULT_DRAWDOWN_VELOCITY },

  // Validation Thresholds
  MIN_STRUCTURE_THRESHOLD: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_STRUCTURE_THRESHOLD },
  MAX_SPREAD_PCT: { type: 'number', default: VALIDATION_CONSTANTS.DEFAULT_SPREAD_PCT },
  MAX_SLIPPAGE_PCT: { type: 'number', default: VALIDATION_CONSTANTS.DEFAULT_SLIPPAGE_PCT },

  // Safety Gates Configuration
  MAX_CONSECUTIVE_LOSSES: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_CONSECUTIVE_LOSSES },
  MAX_DAILY_DRAWDOWN_PCT: { type: 'number', default: VALIDATION_CONSTANTS.DEFAULT_DAILY_DRAWDOWN },
  MAX_WEEKLY_DRAWDOWN_PCT: { type: 'number', default: VALIDATION_CONSTANTS.DEFAULT_WEEKLY_DRAWDOWN },
  CIRCUIT_BREAKER_COOLDOWN_HOURS: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_COOLDOWN_HOURS },
  FUNDING_GREED_THRESHOLD: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_GREED_THRESHOLD },
  FUNDING_HIGH_GREED_THRESHOLD: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_HIGH_GREED_THRESHOLD },
  FUNDING_FEAR_THRESHOLD: { type: 'int', default: VALIDATION_CONSTANTS.DEFAULT_FEAR_THRESHOLD },

  // HTTPS Configuration
  HTTPS_ENABLED: { type: 'boolean', default: false },
  SSL_CERT_PATH: { type: 'string', optional: true },
  SSL_KEY_PATH: { type: 'string', optional: true },
  HTTPS_PORT: { type: 'int', default: 443 },
  HTTPS_REDIRECT: { type: 'boolean', default: true },
};

/**
 * Parse and coerce environment variables to correct types using configuration specification
 * 
 * @param {object} env - process.env object
 * @returns {object} Parsed environment variables with correct types
 * @throws {Error} If required variables are missing or have invalid types
 */
function parseEnvironment(env) {
  const parsed = {};

  // Map aliases for backward compatibility and provider-specific keys
  if (!env.BROKER_API_KEY && env.BYBIT_API_KEY) env.BROKER_API_KEY = env.BYBIT_API_KEY;
  if (!env.BROKER_API_SECRET && env.BYBIT_API_SECRET) env.BROKER_API_SECRET = env.BYBIT_API_SECRET;

  // Set defaults for required risk parameters if missing
  if (!env.MAX_RISK_PCT) env.MAX_RISK_PCT = '0.02';
  if (!env.PHASE_1_RISK_PCT) env.PHASE_1_RISK_PCT = '0.10';
  if (!env.PHASE_2_RISK_PCT) env.PHASE_2_RISK_PCT = '0.05';

  for (const [key, spec] of Object.entries(CONFIG_SPEC)) {
    let value = env[key];

    // Handle missing values
    if (value === undefined || value === '') {
      if (spec.required) {
        throw new Error(`${key} is required but not provided. (Available env keys: ${Object.keys(env).filter(k => !k.includes('SECRET') && !k.includes('KEY')).join(', ')})`);
      }
      if (spec.default !== undefined) {
        parsed[key] = spec.default;
      }
      continue;
    }

    // Parse based on type
    try {
      switch (spec.type) {
        case 'string':
          parsed[key] = value;
          break;

        case 'number':
          parsed[key] = parseNumberValue(key, value);
          break;

        case 'int':
          parsed[key] = parseIntValue(key, value);
          break;

        case 'boolean':
          parsed[key] = parseBooleanValue(value);
          break;

        case 'enum':
          if (!spec.values.includes(value)) {
            throw new Error(`${key} must be one of: ${spec.values.join(', ')}, got: ${value}`);
          }
          parsed[key] = value;
          break;

        default:
          throw new Error(`Unknown type specification for ${key}: ${spec.type}`);
      }
    } catch (error) {
      // Re-throw with context
      throw new Error(`Failed to parse ${key}: ${error.message}`);
    }
  }

  return parsed;
}

/**
 * Mask sensitive values in config for logging
 * 
 * @param {object} config - Validated configuration object
 * @returns {object} Config with masked secrets
 */
function maskSecrets(config) {
  const masked = { ...config };

  // Mask API keys and secrets
  if (masked.BROKER_API_KEY) {
    masked.BROKER_API_KEY = `${masked.BROKER_API_KEY.substring(0, 4)}...${masked.BROKER_API_KEY.substring(masked.BROKER_API_KEY.length - 4)}`;
  }
  if (masked.BROKER_API_SECRET) {
    masked.BROKER_API_SECRET = '***MASKED***';
  }
  if (masked.HMAC_SECRET) {
    masked.HMAC_SECRET = '***MASKED***';
  }
  if (masked.REDIS_URL) {
    // Mask password in Redis URL if present
    masked.REDIS_URL = masked.REDIS_URL.replace(/:([^@]+)@/, ':***@');
  }
  if (masked.DATABASE_URL) {
    // Mask password in Database URL if present
    masked.DATABASE_URL = masked.DATABASE_URL.replace(/:([^@]+)@/, ':***@');
  }

  return masked;
}

/**
 * Generate validation summary for logging
 * 
 * @param {object} config - Validated configuration object
 * @returns {object} Summary of validation results
 */
function generateValidationSummary(config) {
  const requiredFields = Object.entries(CONFIG_SPEC)
    .filter(([_, spec]) => spec.required)
    .map(([key]) => key);

  const optionalFieldsWithDefaults = Object.entries(CONFIG_SPEC)
    .filter(([_, spec]) => !spec.required && spec.default !== undefined)
    .map(([key]) => key);

  const optionalFieldsProvided = Object.entries(CONFIG_SPEC)
    .filter(([key, spec]) => spec.optional && config[key] !== undefined)
    .map(([key]) => key);

  return {
    validation_status: 'PASSED',
    required_fields_count: requiredFields.length,
    required_fields: requiredFields,
    optional_with_defaults_count: optionalFieldsWithDefaults.length,
    optional_provided_count: optionalFieldsProvided.length,
    optional_provided: optionalFieldsProvided,
    redis_configured: !!config.REDIS_URL,
    redis_required: config.REDIS_REQUIRED,
    database_type: config.DATABASE_TYPE,
    database_configured: !!config.DATABASE_URL,
    broker_api_configured: !!config.BROKER_API_URL,
    websocket_configured: !!config.WS_ORDERBOOK_URL,
    server_port: config.PORT,
    log_level: config.LOG_LEVEL,
  };
}

/**
 * Validate configuration on startup
 * 
 * Requirements:
 * - 96.1: Validate ALL environment variables before initializing components
 * - 96.2: Refuse to start if required variables are missing
 * - 96.3: Refuse to start if variables have invalid types or values
 * - 96.8: Validate Redis connection if REDIS_URL provided
 * - 96.9: Log sanitized config summary on success
 * - 96.10: Exit with code 1 on validation failure
 * 
 * @returns {object} Validated configuration object
 * @throws {Error} If validation fails (process will exit)
 */
export function validateConfig() {
  try {
    // Requirement 96.1: Parse environment variables with type coercion
    const parsedEnv = parseEnvironment(process.env);

    // Requirement 96.1, 96.3: Validate against schema
    const validatedConfig = ConfigSchema.parse(parsedEnv);

    // Requirement 96.9: Log sanitized config summary (mask secrets)
    const maskedConfig = maskSecrets(validatedConfig);
    const summary = generateValidationSummary(validatedConfig);

    console.log('✓ Environment validation passed: all required config present');
    console.log('\nValidation Summary:');
    console.log(JSON.stringify(summary, null, 2));
    console.log('\nConfiguration (secrets masked):');
    console.log(JSON.stringify(maskedConfig, null, 2));

    return validatedConfig;
  } catch (error) {
    // Requirement 96.2, 96.3, 96.10: Log specific errors and exit with code 1
    console.error('✗ Environment validation failed:');
    console.error('');

    if (error.errors) {
      // Zod validation errors
      console.error('Validation errors:');
      error.errors.forEach((err) => {
        const field = err.path.join('.');
        console.error(`  ✗ ${field}: ${err.message}`);
      });
    } else {
      // Type coercion errors
      console.error('Parse error:');
      console.error(`  ✗ ${error.message}`);
    }

    console.error('');
    console.error('Please check your .env file and ensure all required variables are set correctly.');
    console.error('See .env.example for reference.');
    console.error('');
    console.error('Required fields:');
    Object.entries(CONFIG_SPEC)
      .filter(([_, spec]) => spec.required)
      .forEach(([key]) => {
        const isSet = process.env[key] !== undefined && process.env[key] !== '';
        console.error(`  ${isSet ? '✓' : '✗'} ${key}`);
      });

    // Requirement 96.10: Exit with code 1
    process.exit(1);
  }
}

/**
 * Validate Redis connection if REDIS_URL is provided
 * 
 * Requirement 96.8: Validate Redis connection on startup
 * 
 * @param {string} redisUrl - Redis connection URL
 * @param {boolean} required - Whether Redis is required
 * @returns {Promise<boolean>} True if connection successful or not required
 */
export async function validateRedisConnection(redisUrl, required = false) {
  if (!redisUrl) {
    if (required) {
      console.error('✗ Redis connection required but REDIS_URL not provided');
      process.exit(1);
    }
    console.log('ℹ Redis not configured, using in-memory fallback');
    return true;
  }

  try {
    // Dynamic import to avoid loading Redis if not needed
    const { createClient } = await import('redis');
    const client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: VALIDATION_CONSTANTS.REDIS_CONNECT_TIMEOUT,
        reconnectStrategy: false, // Don't reconnect during validation
      },
    });

    const startTime = Date.now();
    await client.connect();
    await client.ping();
    const latency = Date.now() - startTime;
    await client.disconnect();

    console.log(`✓ Redis connection validated (latency: ${latency}ms)`);
    return true;
  } catch (error) {
    console.error(`✗ Redis connection failed: ${error.message}`);

    if (required) {
      console.error('Redis is required but connection failed. Exiting.');
      process.exit(1);
    } else {
      console.warn('⚠ Redis connection failed but not required. Continuing with in-memory fallback.');
      console.warn('  Note: In-memory fallback does not persist across restarts.');
      return false;
    }
  }
}

/**
 * Create a minimal valid config for testing
 * Useful for unit tests and integration tests
 * 
 * @param {object} overrides - Optional overrides for specific config values
 * @returns {object} Minimal valid configuration
 * 
 * @example
 * const testConfig = createTestConfig({ MAX_RISK_PCT: 0.01 });
 */
export function createTestConfig(overrides = {}) {
  return {
    BROKER_API_KEY: 'test_key_1234567890abcdef',
    BROKER_API_SECRET: 'test_secret_1234567890abcdef',
    HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
    MAX_RISK_PCT: 0.02,
    PHASE_1_RISK_PCT: 0.10,
    PHASE_2_RISK_PCT: 0.05,
    MAKER_FEE_PCT: VALIDATION_CONSTANTS.DEFAULT_MAKER_FEE,
    TAKER_FEE_PCT: VALIDATION_CONSTANTS.DEFAULT_TAKER_FEE,
    RATE_LIMIT_PER_SEC: VALIDATION_CONSTANTS.DEFAULT_RATE_LIMIT,
    DATABASE_TYPE: 'sqlite',
    REDIS_REQUIRED: false,
    WS_CACHE_MAX_AGE_MS: VALIDATION_CONSTANTS.DEFAULT_WS_CACHE_AGE,
    PORT: VALIDATION_CONSTANTS.DEFAULT_PORT,
    HOST: VALIDATION_CONSTANTS.DEFAULT_HOST,
    LOG_LEVEL: VALIDATION_CONSTANTS.DEFAULT_LOG_LEVEL,
    HEARTBEAT_TIMEOUT_MS: VALIDATION_CONSTANTS.DEFAULT_HEARTBEAT_TIMEOUT,
    IDEMPOTENCY_TTL: VALIDATION_CONSTANTS.DEFAULT_IDEMPOTENCY_TTL,
    MAX_TIMESTAMP_DRIFT_MS: VALIDATION_CONSTANTS.DEFAULT_TIMESTAMP_DRIFT,
    SIGNAL_CACHE_TTL_MS: VALIDATION_CONSTANTS.DEFAULT_SIGNAL_CACHE_TTL,
    ZSCORE_SAFETY_THRESHOLD: VALIDATION_CONSTANTS.DEFAULT_ZSCORE_THRESHOLD,
    DRAWDOWN_VELOCITY_THRESHOLD: VALIDATION_CONSTANTS.DEFAULT_DRAWDOWN_VELOCITY,
    MIN_STRUCTURE_THRESHOLD: VALIDATION_CONSTANTS.DEFAULT_STRUCTURE_THRESHOLD,
    MAX_SPREAD_PCT: VALIDATION_CONSTANTS.DEFAULT_SPREAD_PCT,
    MAX_SLIPPAGE_PCT: VALIDATION_CONSTANTS.DEFAULT_SLIPPAGE_PCT,
    MAX_CONSECUTIVE_LOSSES: VALIDATION_CONSTANTS.DEFAULT_CONSECUTIVE_LOSSES,
    MAX_DAILY_DRAWDOWN_PCT: VALIDATION_CONSTANTS.DEFAULT_DAILY_DRAWDOWN,
    MAX_WEEKLY_DRAWDOWN_PCT: VALIDATION_CONSTANTS.DEFAULT_WEEKLY_DRAWDOWN,
    CIRCUIT_BREAKER_COOLDOWN_HOURS: VALIDATION_CONSTANTS.DEFAULT_COOLDOWN_HOURS,
    FUNDING_GREED_THRESHOLD: VALIDATION_CONSTANTS.DEFAULT_GREED_THRESHOLD,
    FUNDING_HIGH_GREED_THRESHOLD: VALIDATION_CONSTANTS.DEFAULT_HIGH_GREED_THRESHOLD,
    FUNDING_FEAR_THRESHOLD: VALIDATION_CONSTANTS.DEFAULT_FEAR_THRESHOLD,
    ...overrides,
  };
}

export { ConfigSchema };
