/**
 * ErrorHandler - Centralized Error Handling Utilities
 *
 * Provides:
 * - Exponential backoff for API retries
 * - Transaction safety for SQLite operations
 * - User-friendly error messages
 * - Error logging to file
 *
 * Requirements: All error scenarios from design
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@titan/shared';

/**
 * Error codes for categorization
 */
const logger = Logger.getInstance('ai-quant:ErrorHandler');

export enum ErrorCode {
  // AI API Errors
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  TIMEOUT = 'TIMEOUT',
  NETWORK_ERROR = 'NETWORK_ERROR',

  // Database Errors
  DB_BUSY = 'DB_BUSY',
  DB_CORRUPT = 'DB_CORRUPT',
  DB_DISK_FULL = 'DB_DISK_FULL',
  DB_SCHEMA_MISMATCH = 'DB_SCHEMA_MISMATCH',
  DB_TRANSACTION_FAILED = 'DB_TRANSACTION_FAILED',

  // Backtesting Errors
  MISSING_OHLCV_DATA = 'MISSING_OHLCV_DATA',
  INCOMPLETE_REGIME_DATA = 'INCOMPLETE_REGIME_DATA',
  CACHE_CORRUPTION = 'CACHE_CORRUPTION',
  DIVISION_BY_ZERO = 'DIVISION_BY_ZERO',
  SIMULATION_TIMEOUT = 'SIMULATION_TIMEOUT',
  MEMORY_OVERFLOW = 'MEMORY_OVERFLOW',

  // Configuration Errors
  CONFIG_PARSE_ERROR = 'CONFIG_PARSE_ERROR',
  CONFIG_MISSING_KEYS = 'CONFIG_MISSING_KEYS',
  CONFIG_TYPE_MISMATCH = 'CONFIG_TYPE_MISMATCH',
  CONFIG_WRITE_FAILURE = 'CONFIG_WRITE_FAILURE',
  CONFIG_VALIDATION_ERROR = 'CONFIG_VALIDATION_ERROR',
  HOT_RELOAD_FAILURE = 'HOT_RELOAD_FAILURE',

  // User Input Errors
  UNKNOWN_COMMAND = 'UNKNOWN_COMMAND',
  INVALID_SYMBOL = 'INVALID_SYMBOL',
  MALFORMED_INPUT = 'MALFORMED_INPUT',

  // Approval Workflow Errors
  CONCURRENT_APPROVAL = 'CONCURRENT_APPROVAL',
  STALE_PROPOSAL = 'STALE_PROPOSAL',

  // Generic
  UNKNOWN = 'UNKNOWN',
}

/**
 * Titan-specific error class with code and context
 */
export class TitanError extends Error {
  public readonly code: ErrorCode;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: number;
  public readonly isRetryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    isRetryable = false,
  ) {
    super(message);
    this.name = 'TitanError';
    this.code = code;
    this.context = context;
    this.timestamp = Date.now();
    this.isRetryable = isRetryable;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    return getUserFriendlyMessage(this.code, this.message);
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      isRetryable: this.isRetryable,
      stack: this.stack,
    };
  }
}

/**
 * Get user-friendly error message based on error code
 */
export function getUserFriendlyMessage(code: ErrorCode, details?: string): string {
  const messages: Record<ErrorCode, string> = {
    // AI API Errors
    [ErrorCode.RATE_LIMIT]: 'AI service is temporarily busy. Please wait a moment and try again.',
    [ErrorCode.SERVER_ERROR]:
      'AI service encountered an error. The system will retry automatically.',
    [ErrorCode.INVALID_RESPONSE]: 'Received an unexpected response from AI. Please try again.',
    [ErrorCode.TIMEOUT]: 'AI request timed out. Please try again.',
    [ErrorCode.NETWORK_ERROR]: 'Network connection issue. Please check your internet connection.',

    // Database Errors
    [ErrorCode.DB_BUSY]: 'Database is busy. Please wait and try again.',
    [ErrorCode.DB_CORRUPT]: 'Database integrity issue detected. Please contact support.',
    [ErrorCode.DB_DISK_FULL]: 'Disk space is low. Please free up space to continue.',
    [ErrorCode.DB_SCHEMA_MISMATCH]: 'Database schema needs update. Running migration...',
    [ErrorCode.DB_TRANSACTION_FAILED]: 'Database operation failed. Changes have been rolled back.',

    // Backtesting Errors
    [ErrorCode.MISSING_OHLCV_DATA]:
      'Historical price data is unavailable for the requested period.',
    [ErrorCode.INCOMPLETE_REGIME_DATA]: 'Market regime data is incomplete. Using last known state.',
    [ErrorCode.CACHE_CORRUPTION]: 'Data cache is corrupted. Rebuilding from source...',
    [ErrorCode.DIVISION_BY_ZERO]: 'Calculation error: division by zero. Check input data.',
    [ErrorCode.SIMULATION_TIMEOUT]: 'Backtest simulation took too long. Try a shorter period.',
    [ErrorCode.MEMORY_OVERFLOW]: 'Backtest period too large. Please reduce to 30 days or less.',

    // Configuration Errors
    [ErrorCode.CONFIG_PARSE_ERROR]: 'Configuration file has invalid format. Please check syntax.',
    [ErrorCode.CONFIG_MISSING_KEYS]: 'Configuration is missing required values. Using defaults.',
    [ErrorCode.CONFIG_TYPE_MISMATCH]: 'Configuration value has wrong type. Please correct it.',
    [ErrorCode.CONFIG_WRITE_FAILURE]: 'Failed to save configuration. Check file permissions.',
    [ErrorCode.CONFIG_VALIDATION_ERROR]: 'Configuration values are out of allowed range.',
    [ErrorCode.HOT_RELOAD_FAILURE]: 'Failed to apply new configuration. Rolled back to previous.',

    // User Input Errors
    [ErrorCode.UNKNOWN_COMMAND]: 'Unknown command. Type /help for available commands.',
    [ErrorCode.INVALID_SYMBOL]:
      'Invalid trading symbol. Please use a valid symbol like SOL, BTC, ETH.',
    [ErrorCode.MALFORMED_INPUT]: 'Invalid input format. Please check your command syntax.',

    // Approval Workflow Errors
    [ErrorCode.CONCURRENT_APPROVAL]: 'Another approval is in progress. Please wait.',
    [ErrorCode.STALE_PROPOSAL]: 'This proposal is outdated. Please re-validate before applying.',

    // Generic
    [ErrorCode.UNKNOWN]: 'An unexpected error occurred. Please try again.',
  };

  const baseMessage = messages[code] || messages[ErrorCode.UNKNOWN];
  return details ? `${baseMessage} (${details})` : baseMessage;
}

/**
 * Exponential backoff configuration
 */
export interface BackoffConfig {
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Multiplier for each retry */
  multiplier: number;
  /** Maximum number of retries */
  maxRetries: number;
  /** Jitter factor (0-1) to add randomness */
  jitter: number;
}

const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  maxRetries: 5,
  jitter: 0.1,
};

/**
 * Calculate delay for exponential backoff
 */
export function calculateBackoffDelay(
  attempt: number,
  config: Partial<BackoffConfig> = {},
): number {
  const { initialDelayMs, maxDelayMs, multiplier, jitter } = {
    ...DEFAULT_BACKOFF_CONFIG,
    ...config,
  };

  // Calculate base delay: initialDelay * multiplier^attempt
  const baseDelay = initialDelayMs * Math.pow(multiplier, attempt);

  // Apply jitter
  const jitterAmount = baseDelay * jitter * (Math.random() * 2 - 1);
  const delayWithJitter = baseDelay + jitterAmount;

  // Cap at max delay
  return Math.min(delayWithJitter, maxDelayMs);
}

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<BackoffConfig> = {},
  shouldRetry?: (error: unknown, attempt: number) => boolean,
): Promise<T> {
  const { maxRetries } = { ...DEFAULT_BACKOFF_CONFIG, ...config };

  // eslint-disable-next-line functional/no-let
  let lastError: unknown;

  // eslint-disable-next-line functional/no-let
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const canRetry = shouldRetry ? shouldRetry(error, attempt) : isRetryableError(error);

      if (!canRetry || attempt >= maxRetries) {
        throw error;
      }

      // Wait before retrying
      const delay = calculateBackoffDelay(attempt, config);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof TitanError) {
    return error.isRetryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('429') ||
      message.includes('rate limit') ||
      message.includes('500') ||
      message.includes('503') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('sqlite_busy')
    );
  }

  return false;
}

/**
 * Classify an error into a TitanError
 */
export function classifyError(error: unknown): TitanError {
  if (error instanceof TitanError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // AI API errors
    if (message.includes('429') || message.includes('rate limit')) {
      return new TitanError(ErrorCode.RATE_LIMIT, error.message, undefined, true);
    }
    if (message.includes('500') || message.includes('503')) {
      return new TitanError(ErrorCode.SERVER_ERROR, error.message, undefined, true);
    }
    if (message.includes('timeout')) {
      return new TitanError(ErrorCode.TIMEOUT, error.message, undefined, true);
    }
    if (
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('econnrefused')
    ) {
      return new TitanError(ErrorCode.NETWORK_ERROR, error.message, undefined, true);
    }

    // Database errors
    if (message.includes('sqlite_busy')) {
      return new TitanError(ErrorCode.DB_BUSY, error.message, undefined, true);
    }
    if (
      message.includes('sqlite_corrupt') ||
      message.includes('database disk image is malformed')
    ) {
      return new TitanError(ErrorCode.DB_CORRUPT, error.message, undefined, false);
    }
    if (message.includes('disk full') || message.includes('no space')) {
      return new TitanError(ErrorCode.DB_DISK_FULL, error.message, undefined, false);
    }

    // Config errors
    if (message.includes('json') && (message.includes('parse') || message.includes('syntax'))) {
      return new TitanError(ErrorCode.CONFIG_PARSE_ERROR, error.message, undefined, false);
    }

    return new TitanError(ErrorCode.UNKNOWN, error.message, undefined, false);
  }

  return new TitanError(ErrorCode.UNKNOWN, String(error), undefined, false);
}

/**
 * Error logger configuration
 */
export interface ErrorLoggerConfig {
  /** Path to error log file */
  logPath: string;
  /** Maximum log file size in bytes before rotation */
  maxFileSize: number;
  /** Number of backup files to keep */
  maxBackups: number;
}

const DEFAULT_LOGGER_CONFIG: ErrorLoggerConfig = {
  logPath: path.join(process.cwd(), 'logs', 'ai-quant-errors.log'),
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxBackups: 5,
};

/**
 * Error logger class for file-based logging
 */
export class ErrorLogger {
  private config: ErrorLoggerConfig;
  private writeStream: fs.WriteStream | null = null;

  constructor(config: Partial<ErrorLoggerConfig> = {}) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
    this.ensureLogDirectory();
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    const dir = path.dirname(this.config.logPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Rotate log file if needed
   */
  private rotateIfNeeded(): void {
    try {
      if (!fs.existsSync(this.config.logPath)) {
        return;
      }

      const stats = fs.statSync(this.config.logPath);
      if (stats.size < this.config.maxFileSize) {
        return;
      }

      // Close current stream
      if (this.writeStream) {
        this.writeStream.end();
        // eslint-disable-next-line functional/immutable-data
        this.writeStream = null;
      }

      // Rotate existing backups
      // eslint-disable-next-line functional/no-let
      for (let i = this.config.maxBackups - 1; i >= 1; i--) {
        const oldPath = `${this.config.logPath}.${i}`;
        const newPath = `${this.config.logPath}.${i + 1}`;
        if (fs.existsSync(oldPath)) {
          if (i === this.config.maxBackups - 1) {
            fs.unlinkSync(oldPath);
          } else {
            fs.renameSync(oldPath, newPath);
          }
        }
      }

      // Move current log to .1
      fs.renameSync(this.config.logPath, `${this.config.logPath}.1`);
    } catch {
      // Ignore rotation errors
    }
  }

  /**
   * Log an error to file
   */
  log(error: TitanError | Error, context?: Record<string, unknown>): void {
    this.rotateIfNeeded();

    const logEntry = {
      timestamp: new Date().toISOString(),
      ...(error instanceof TitanError
        ? error.toJSON()
        : {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }),
      context,
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      fs.appendFileSync(this.config.logPath, logLine, 'utf-8');
    } catch {
      // Fallback to console if file write fails
      logger.error('[ErrorLogger] Failed to write to log file:', logEntry);
    }
  }

  /**
   * Log with severity level
   */
  logWithLevel(
    level: 'debug' | 'info' | 'warn' | 'error' | 'critical',
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      fs.appendFileSync(this.config.logPath, logLine, 'utf-8');
    } catch {
      logger.error(`[${level.toUpperCase()}] ${message}`, context);
    }
  }

  /**
   * Close the logger
   */
  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      // eslint-disable-next-line functional/immutable-data
      this.writeStream = null;
    }
  }
}

// Global error logger instance
// eslint-disable-next-line functional/no-let
let globalLogger: ErrorLogger | null = null;

/**
 * Get or create global error logger
 */
export function getErrorLogger(config?: Partial<ErrorLoggerConfig>): ErrorLogger {
  if (!globalLogger) {
    globalLogger = new ErrorLogger(config);
  }
  return globalLogger;
}

/**
 * Log an error using the global logger
 */
export function logError(error: TitanError | Error, context?: Record<string, unknown>): void {
  getErrorLogger().log(error, context);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a function to catch and log errors
 */
export function withErrorLogging<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context?: Record<string, unknown>,
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      const titanError = classifyError(error);
      logError(titanError, { ...context, args });
      throw titanError;
    }
  }) as T;
}

/**
 * Create a safe wrapper that returns a default value on error
 */
export function withFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  onError?: (error: TitanError) => void,
): () => Promise<T> {
  return async () => {
    try {
      return await fn();
    } catch (error) {
      const titanError = classifyError(error);
      logError(titanError);
      onError?.(titanError);
      return fallback;
    }
  };
}
