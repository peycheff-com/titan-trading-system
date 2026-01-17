/**
 * StructuredLogger - JSON structured logging with correlation IDs
 *
 * Implements JSON structured logging by wrapping the authoritative @titan/shared Logger.
 * Preserves domain-specific logic while consolidating infrastructure.
 *
 * Requirements: 2.7, 4.7, 5.7, 9.6
 */

import { randomUUID } from 'crypto';
import {
  Logger as SharedLogger,
  LoggerConfig as SharedLoggerConfig,
  SharedLogEntry,
  SharedLogLevel,
} from '@titan/shared';

/**
 * Re-export types for backward compatibility
 */
export type LogEntry = SharedLogEntry;
export type LoggerConfig = SharedLoggerConfig;
export { SharedLogLevel };

/**
 * Log levels in order of severity (String based for local usage)
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log handler type for backward compatibility
 */
export type LogHandler = (entry: LogEntry) => void;

/**
 * Configuration options for StructuredLogger
 * Extends SharedLoggerConfig but allows loose parsing for compatibility
 */
export interface StructuredLoggerOptions extends Partial<Omit<SharedLoggerConfig, 'level'>> {
  level?: SharedLogLevel | LogLevel;
  sanitizeSensitive?: boolean;
  component?: string;
}

/**
 * StructuredLogger class for JSON logging with correlation IDs
 * Wraps @titan/shared Logger for consistent formatting
 */
export class StructuredLogger {
  private sharedLogger: SharedLogger;
  private correlationId: string | null = null;
  private component: string;
  private sanitizeSensitive: boolean;

  constructor(config: StructuredLoggerOptions = {}) {
    this.component = config.component || 'titan-brain';
    this.sanitizeSensitive = config.sanitizeSensitive ?? true; // Default to true if not specified

    // Get singleton instance of shared logger
    // We pass the component name to init/config
    this.sharedLogger = SharedLogger.getInstance(this.component);

    // Apply config overrides if needed
    if (config.level !== undefined) {
      let sharedLevel: SharedLogLevel = SharedLogLevel.INFO;

      if (typeof config.level === 'number') {
        sharedLevel = config.level;
      } else if (typeof config.level === 'string') {
        if (config.level === 'debug') sharedLevel = SharedLogLevel.DEBUG;
        else if (config.level === 'warn') sharedLevel = SharedLogLevel.WARN;
        else if (config.level === 'error') sharedLevel = SharedLogLevel.ERROR;
        else sharedLevel = SharedLogLevel.INFO;
      }

      this.sharedLogger.setLogLevel(sharedLevel);
    }
  }

  /**
   * Set the current correlation ID
   */
  setCorrelationId(id: string | null): void {
    this.correlationId = id;
  }

  /**
   * Get the current correlation ID
   */
  getCorrelationId(): string | null {
    return this.correlationId;
  }

  /**
   * Generate a new correlation ID
   */
  generateCorrelationId(): string {
    const id = randomUUID();
    this.correlationId = id;
    return id;
  }

  // ============ Basic Logging Methods ============

  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    // SharedLogger.debug(message, correlationId, metadata)
    this.sharedLogger.debug(message, this.correlationId || undefined, context);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.sharedLogger.info(message, this.correlationId || undefined, context);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.sharedLogger.warn(message, this.correlationId || undefined, context);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : undefined;
    const ctx = error instanceof Error ? context : (error as Record<string, unknown> | undefined);

    this.sharedLogger.error(message, err, this.correlationId || undefined, ctx);
  }

  // ============ Domain-Specific Logging Methods ============

  /**
   * Log a signal processing event
   * Requirement 2.7: Log all weight adjustments with reasoning
   */
  logSignalProcessing(
    signalId: string,
    phaseId: string,
    approved: boolean,
    reason: string,
    context?: Record<string, unknown>,
  ): void {
    this.info('Signal processed', {
      signalId,
      phaseId,
      approved,
      reason,
      ...context,
    });
  }

  /**
   * Log an allocation change
   * Requirement 9.6: Maintain audit log of all allocation changes
   */
  logAllocationChange(
    previousAllocation: { w1: number; w2: number; w3: number },
    newAllocation: { w1: number; w2: number; w3: number },
    reason: string,
    context?: Record<string, unknown>,
  ): void {
    this.info('Allocation changed', {
      previousAllocation,
      newAllocation,
      reason,
      ...context,
    });
  }

  /**
   * Log a sweep operation
   * Requirement 4.7: Log all sweep transactions with amount and reason
   */
  logSweepOperation(
    amount: number,
    fromWallet: string,
    toWallet: string,
    reason: string,
    success: boolean,
    context?: Record<string, unknown>,
  ): void {
    // If success, log as INFO, else WARN
    if (success) {
      this.info('Sweep operation success', {
        amount,
        fromWallet,
        toWallet,
        reason,
        ...context,
      });
    } else {
      this.warn('Sweep operation failed', {
        amount,
        fromWallet,
        toWallet,
        reason,
        ...context,
      });
    }
  }

  /**
   * Log a circuit breaker event
   * Requirement 5.7: Log circuit breaker events with full context
   */
  logCircuitBreakerEvent(
    eventType: 'TRIGGER' | 'RESET',
    reason: string,
    equity: number,
    operatorId?: string,
    context?: Record<string, unknown>,
  ): void {
    if (eventType === 'TRIGGER') {
      this.error(`Circuit breaker ${eventType.toLowerCase()}`, undefined, {
        eventType,
        reason,
        equity,
        operatorId,
        ...context,
      });
    } else {
      this.info(`Circuit breaker ${eventType.toLowerCase()}`, {
        eventType,
        reason,
        equity,
        operatorId,
        ...context,
      });
    }
  }

  /**
   * Log a performance update
   * Requirement 2.7: Log weight adjustments with reasoning
   */
  logPerformanceUpdate(
    phaseId: string,
    sharpeRatio: number,
    modifier: number,
    tradeCount: number,
    context?: Record<string, unknown>,
  ): void {
    this.debug('Performance updated', {
      phaseId,
      sharpeRatio,
      modifier,
      tradeCount,
      ...context,
    });
  }

  /**
   * Log a risk decision
   */
  logRiskDecision(
    signalId: string,
    approved: boolean,
    reason: string,
    riskMetrics: Record<string, unknown>,
    context?: Record<string, unknown>,
  ): void {
    this.info('Risk decision', {
      signalId,
      approved,
      reason,
      riskMetrics,
      ...context,
    });
  }

  /**
   * Log a database operation
   */
  logDatabaseOperation(
    operation: string,
    table: string,
    durationMs: number,
    success: boolean,
    context?: Record<string, unknown>,
  ): void {
    if (success) {
      this.debug('Database operation success', {
        operation,
        table,
        durationMs,
        ...context,
      });
    } else {
      this.warn('Database operation failed', {
        operation,
        table,
        durationMs,
        ...context,
      });
    }
  }

  /**
   * Log a manual override event
   * Requirement 9.6: Audit log for allocation changes
   */
  logManualOverride(
    operatorId: string,
    action: 'CREATE' | 'DEACTIVATE',
    allocation?: { w1: number; w2: number; w3: number },
    reason?: string,
    context?: Record<string, unknown>,
  ): void {
    this.warn('Manual override', {
      operatorId,
      action,
      allocation,
      reason,
      ...context,
    });
  }

  /**
   * Log a notification event
   */
  logNotification(
    channel: string,
    type: string,
    success: boolean,
    context?: Record<string, unknown>,
  ): void {
    if (success) {
      this.info('Notification sent', {
        channel,
        type,
        ...context,
      });
    } else {
      this.warn('Notification failed', {
        channel,
        type,
        ...context,
      });
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): StructuredLogger {
    const child = new StructuredLogger({
      component: this.component,
      sanitizeSensitive: this.sanitizeSensitive,
    });
    child.correlationId = this.correlationId;

    // Custom context injection for child instances
    (child as any)._childContext = context;

    const originalInfo = child.info.bind(child);
    child.info = (message, ctx) =>
      originalInfo(message, { ...(child as any)._childContext, ...ctx });

    const originalDebug = child.debug.bind(child);
    child.debug = (message, ctx) =>
      originalDebug(message, { ...(child as any)._childContext, ...ctx });

    const originalWarn = child.warn.bind(child);
    child.warn = (message, ctx) =>
      originalWarn(message, { ...(child as any)._childContext, ...ctx });

    const originalError = child.error.bind(child);
    child.error = (message, error, ctx) =>
      originalError(message, error, {
        ...(child as any)._childContext,
        ...ctx,
      });

    return child;
  }

  /**
   * Execute a function with a correlation ID
   */
  async withCorrelationId<T>(correlationId: string | null, fn: () => Promise<T>): Promise<T> {
    const previousId = this.correlationId;
    this.correlationId = correlationId ?? this.generateCorrelationId();

    try {
      return await fn();
    } finally {
      this.correlationId = previousId;
    }
  }

  // Deprecated support for addHandler/removeHandler
  addHandler(handler: LogHandler): void {
    // No-op
  }

  removeHandler(handler: LogHandler): void {
    // No-op
  }

  setLevel(level: LogLevel): void {
    let sharedLevel = SharedLogLevel.INFO;
    if (level === 'debug') sharedLevel = SharedLogLevel.DEBUG;
    if (level === 'warn') sharedLevel = SharedLogLevel.WARN;
    if (level === 'error') sharedLevel = SharedLogLevel.ERROR;

    this.sharedLogger.setLogLevel(sharedLevel);
  }
}

/**
 * Singleton instance for global logging
 */
let loggerInstance: StructuredLogger | null = null;

/**
 * Get or create the global logger instance
 */
export function getLogger(config?: StructuredLoggerOptions): StructuredLogger {
  if (!loggerInstance) {
    loggerInstance = new StructuredLogger(config);
  }
  return loggerInstance;
}

/**
 * Reset the global logger instance (for testing)
 */
export function resetLogger(): void {
  loggerInstance = null;
}

/**
 * Create a request-scoped logger with correlation ID
 */
export function createRequestLogger(
  correlationId?: string,
  config?: StructuredLoggerOptions,
): StructuredLogger {
  const logger = new StructuredLogger(config);
  logger.setCorrelationId(correlationId ?? logger.generateCorrelationId());
  return logger;
}
