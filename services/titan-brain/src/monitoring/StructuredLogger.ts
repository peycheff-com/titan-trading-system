/**
 * StructuredLogger - JSON structured logging with correlation IDs
 * 
 * Implements JSON structured logging, correlation IDs, log level configuration,
 * and sensitive data sanitization.
 * 
 * Requirements: 2.7, 4.7, 5.7, 9.6
 */

import { randomUUID } from 'crypto';

/**
 * Log levels in order of severity
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log level numeric values for comparison
 */
const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Sensitive field patterns to sanitize
 */
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /api[_-]?secret/i,
  /password/i,
  /secret/i,
  /token/i,
  /auth/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
];

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId?: string;
  component?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  component?: string;
  enableConsole?: boolean;
  enableJson?: boolean;
  sanitizeSensitive?: boolean;
  correlationIdHeader?: string;
}

/**
 * Log output handler
 */
export type LogHandler = (entry: LogEntry) => void;

/**
 * StructuredLogger class for JSON logging with correlation IDs
 */
export class StructuredLogger {
  private readonly config: Required<LoggerConfig>;
  private correlationId: string | null = null;
  private handlers: LogHandler[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level ?? 'info',
      component: config.component ?? 'titan-brain',
      enableConsole: config.enableConsole ?? true,
      enableJson: config.enableJson ?? true,
      sanitizeSensitive: config.sanitizeSensitive ?? true,
      correlationIdHeader: config.correlationIdHeader ?? 'x-correlation-id',
    };
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

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Add a custom log handler
   */
  addHandler(handler: LogHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Remove a custom log handler
   */
  removeHandler(handler: LogHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
    }
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.level];
  }

  /**
   * Sanitize sensitive data from an object
   * Requirement: Add sensitive data sanitization
   */
  private sanitize(obj: unknown): unknown {
    if (!this.config.sanitizeSensitive) return obj;
    
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'string') {
      // Check if the string looks like a sensitive value (long alphanumeric)
      if (obj.length > 20 && /^[A-Za-z0-9+/=_-]+$/.test(obj)) {
        return '[REDACTED]';
      }
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitize(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        // Check if key matches sensitive patterns
        const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
        if (isSensitive) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitize(value);
        }
      }
      return sanitized;
    }
    
    return obj;
  }

  /**
   * Create a log entry
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      component: this.config.component,
    };

    if (this.correlationId) {
      entry.correlationId = this.correlationId;
    }

    if (context) {
      entry.context = this.sanitize(context) as Record<string, unknown>;
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  /**
   * Output a log entry
   */
  private output(entry: LogEntry): void {
    // Call custom handlers
    for (const handler of this.handlers) {
      try {
        handler(entry);
      } catch (e) {
        // Ignore handler errors
      }
    }

    // Console output
    if (this.config.enableConsole) {
      if (this.config.enableJson) {
        console.log(JSON.stringify(entry));
      } else {
        const prefix = entry.correlationId ? `[${entry.correlationId.slice(0, 8)}]` : '';
        const component = entry.component ? `[${entry.component}]` : '';
        const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
        const errorStr = entry.error ? ` Error: ${entry.error.message}` : '';
        
        const logFn = entry.level === 'error' ? console.error :
                      entry.level === 'warn' ? console.warn :
                      entry.level === 'debug' ? console.debug :
                      console.log;
        
        logFn(`${entry.timestamp} ${entry.level.toUpperCase()} ${prefix}${component} ${entry.message}${contextStr}${errorStr}`);
      }
    }
  }


  /**
   * Log a debug message
   */
  debug(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('debug')) return;
    const entry = this.createEntry('debug', message, context);
    this.output(entry);
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('info')) return;
    const entry = this.createEntry('info', message, context);
    this.output(entry);
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.shouldLog('warn')) return;
    const entry = this.createEntry('warn', message, context);
    this.output(entry);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;
    
    const err = error instanceof Error ? error : undefined;
    const ctx = error instanceof Error ? context : (error as Record<string, unknown> | undefined);
    
    const entry = this.createEntry('error', message, ctx, err);
    this.output(entry);
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
    context?: Record<string, unknown>
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
    context?: Record<string, unknown>
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
    context?: Record<string, unknown>
  ): void {
    const level = success ? 'info' : 'warn';
    const entry = this.createEntry(level, 'Sweep operation', {
      amount,
      fromWallet,
      toWallet,
      reason,
      success,
      ...context,
    });
    this.output(entry);
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
    context?: Record<string, unknown>
  ): void {
    const level = eventType === 'TRIGGER' ? 'error' : 'info';
    const entry = this.createEntry(level, `Circuit breaker ${eventType.toLowerCase()}`, {
      eventType,
      reason,
      equity,
      operatorId,
      ...context,
    });
    this.output(entry);
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
    context?: Record<string, unknown>
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
    context?: Record<string, unknown>
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
    context?: Record<string, unknown>
  ): void {
    const level = success ? 'debug' : 'warn';
    const entry = this.createEntry(level, 'Database operation', {
      operation,
      table,
      durationMs,
      success,
      ...context,
    });
    this.output(entry);
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
    context?: Record<string, unknown>
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
    context?: Record<string, unknown>
  ): void {
    const level = success ? 'info' : 'warn';
    const entry = this.createEntry(level, 'Notification sent', {
      channel,
      type,
      success,
      ...context,
    });
    this.output(entry);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): StructuredLogger {
    const child = new StructuredLogger(this.config);
    child.correlationId = this.correlationId;
    
    // Wrap the output to include additional context
    const originalOutput = child['output'].bind(child);
    child['output'] = (entry: LogEntry) => {
      entry.context = { ...context, ...entry.context };
      originalOutput(entry);
    };
    
    return child;
  }

  /**
   * Execute a function with a correlation ID
   */
  async withCorrelationId<T>(
    correlationId: string | null,
    fn: () => Promise<T>
  ): Promise<T> {
    const previousId = this.correlationId;
    this.correlationId = correlationId ?? this.generateCorrelationId();
    
    try {
      return await fn();
    } finally {
      this.correlationId = previousId;
    }
  }
}

/**
 * Singleton instance for global logging
 */
let loggerInstance: StructuredLogger | null = null;

/**
 * Get or create the global logger instance
 */
export function getLogger(config?: Partial<LoggerConfig>): StructuredLogger {
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
  config?: Partial<LoggerConfig>
): StructuredLogger {
  const logger = new StructuredLogger(config);
  logger.setCorrelationId(correlationId ?? logger.generateCorrelationId());
  return logger;
}
