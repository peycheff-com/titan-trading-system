/**
 * Logger - Structured logging with correlation IDs and performance tracking
 * 
 * Provides JSON structured logging with correlation IDs, configurable log levels,
 * sensitive data masking, and performance tracking for Railway deployment.
 * 
 * Requirements: 4.1.1, 4.1.2, 4.1.3, 4.1.4, 4.1.5
 */

import { randomUUID } from 'crypto';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  correlationId?: string;
  component?: string;
  operation?: string;
  duration?: number;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  component: string;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  enablePerformanceLogging: boolean;
  sensitiveFields: string[];
  maxStackTraceLines: number;
}

/**
 * Performance timer for operation tracking
 */
export interface PerformanceTimer {
  operation: string;
  startTime: number;
  correlationId?: string;
  metadata?: Record<string, any>;
}

/**
 * Structured logger with correlation IDs and performance tracking
 */
export class Logger {
  private config: LoggerConfig;
  private static instance: Logger | null = null;
  private activeTimers: Map<string, PerformanceTimer> = new Map();

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  /**
   * Create logger configuration from environment variables
   */
  static createConfigFromEnv(component: string = 'titan-brain'): LoggerConfig {
    const logLevelStr = process.env.LOG_LEVEL || 'INFO';
    const logLevel = LogLevel[logLevelStr.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO;

    return {
      level: logLevel,
      component,
      enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false',
      enableFile: process.env.LOG_ENABLE_FILE === 'true',
      filePath: process.env.LOG_FILE_PATH || './logs/titan-brain.log',
      enablePerformanceLogging: process.env.LOG_ENABLE_PERFORMANCE !== 'false',
      sensitiveFields: (process.env.LOG_SENSITIVE_FIELDS || 'password,secret,token,key,authorization').split(','),
      maxStackTraceLines: parseInt(process.env.LOG_MAX_STACK_LINES || '10')
    };
  }

  /**
   * Get or create singleton logger instance
   */
  static getInstance(component?: string): Logger {
    if (!Logger.instance) {
      const config = Logger.createConfigFromEnv(component);
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  /**
   * Generate a new correlation ID
   */
  static generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Mask sensitive data in objects
   */
  private maskSensitiveData(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'string') {
      // Check if the string looks like a sensitive value
      const lowerStr = obj.toLowerCase();
      if (lowerStr.includes('password') || lowerStr.includes('secret') || lowerStr.includes('token')) {
        return '[MASKED]';
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.maskSensitiveData(item));
    }

    if (typeof obj === 'object') {
      const masked: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (this.config.sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
          masked[key] = '[MASKED]';
        } else {
          masked[key] = this.maskSensitiveData(value);
        }
      }
      return masked;
    }

    return obj;
  }

  /**
   * Format error for logging
   */
  private formatError(error: Error): LogEntry['error'] {
    const stackLines = error.stack?.split('\n').slice(0, this.config.maxStackTraceLines);
    
    return {
      name: error.name,
      message: error.message,
      stack: stackLines?.join('\n'),
      code: (error as any).code || (error as any).statusCode
    };
  }

  /**
   * Create log entry
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    correlationId?: string,
    operation?: string,
    duration?: number,
    metadata?: Record<string, any>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      component: this.config.component
    };

    if (correlationId) {
      entry.correlationId = correlationId;
    }

    if (operation) {
      entry.operation = operation;
    }

    if (duration !== undefined) {
      entry.duration = duration;
    }

    if (metadata) {
      entry.metadata = this.maskSensitiveData(metadata);
    }

    if (error) {
      entry.error = this.formatError(error);
    }

    return entry;
  }

  /**
   * Write log entry to outputs
   */
  private writeLog(entry: LogEntry): void {
    const logString = JSON.stringify(entry);

    // Console output
    if (this.config.enableConsole) {
      switch (entry.level) {
        case 'DEBUG':
          console.debug(logString);
          break;
        case 'INFO':
          console.info(logString);
          break;
        case 'WARN':
          console.warn(logString);
          break;
        case 'ERROR':
        case 'FATAL':
          console.error(logString);
          break;
        default:
          console.log(logString);
      }
    }

    // File output (if enabled)
    if (this.config.enableFile && this.config.filePath) {
      // In a production environment, you might want to use a proper logging library
      // like winston or pino for file rotation and better performance
      try {
        const fs = require('fs');
        const path = require('path');
        
        // Ensure log directory exists
        const logDir = path.dirname(this.config.filePath);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        
        fs.appendFileSync(this.config.filePath, logString + '\n');
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  /**
   * Debug logging
   */
  debug(message: string, correlationId?: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const entry = this.createLogEntry(LogLevel.DEBUG, message, correlationId, undefined, undefined, metadata);
    this.writeLog(entry);
  }

  /**
   * Info logging
   */
  info(message: string, correlationId?: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry = this.createLogEntry(LogLevel.INFO, message, correlationId, undefined, undefined, metadata);
    this.writeLog(entry);
  }

  /**
   * Warning logging
   */
  warn(message: string, correlationId?: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const entry = this.createLogEntry(LogLevel.WARN, message, correlationId, undefined, undefined, metadata);
    this.writeLog(entry);
  }

  /**
   * Error logging
   */
  error(message: string, error?: Error, correlationId?: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry = this.createLogEntry(LogLevel.ERROR, message, correlationId, undefined, undefined, metadata, error);
    this.writeLog(entry);
  }

  /**
   * Fatal error logging
   */
  fatal(message: string, error?: Error, correlationId?: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.FATAL)) return;
    
    const entry = this.createLogEntry(LogLevel.FATAL, message, correlationId, undefined, undefined, metadata, error);
    this.writeLog(entry);
  }

  /**
   * Start performance timer
   */
  startTimer(operation: string, correlationId?: string, metadata?: Record<string, any>): string {
    const timerId = randomUUID();
    const timer: PerformanceTimer = {
      operation,
      startTime: Date.now(),
      correlationId,
      metadata
    };
    
    this.activeTimers.set(timerId, timer);
    
    if (this.config.enablePerformanceLogging) {
      this.debug(`Started operation: ${operation}`, correlationId, { 
        timerId, 
        ...metadata 
      });
    }
    
    return timerId;
  }

  /**
   * End performance timer and log duration
   */
  endTimer(timerId: string, additionalMetadata?: Record<string, any>): number | null {
    const timer = this.activeTimers.get(timerId);
    if (!timer) {
      this.warn(`Timer not found: ${timerId}`);
      return null;
    }

    const duration = Date.now() - timer.startTime;
    this.activeTimers.delete(timerId);

    if (this.config.enablePerformanceLogging) {
      const metadata = {
        timerId,
        ...timer.metadata,
        ...additionalMetadata
      };

      const entry = this.createLogEntry(
        LogLevel.INFO,
        `Completed operation: ${timer.operation}`,
        timer.correlationId,
        timer.operation,
        duration,
        metadata
      );
      
      this.writeLog(entry);
    }

    return duration;
  }

  /**
   * Log HTTP request
   */
  logHttpRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    correlationId?: string,
    metadata?: Record<string, any>
  ): void {
    const level = statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
    if (!this.shouldLog(level)) return;

    const entry = this.createLogEntry(
      level,
      `HTTP ${method} ${url} - ${statusCode}`,
      correlationId,
      'http_request',
      duration,
      {
        method,
        url,
        statusCode,
        ...metadata
      }
    );

    this.writeLog(entry);
  }

  /**
   * Log database operation
   */
  logDatabaseOperation(
    operation: string,
    table: string,
    duration: number,
    rowCount?: number,
    correlationId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const entry = this.createLogEntry(
      LogLevel.DEBUG,
      `Database ${operation} on ${table}`,
      correlationId,
      'database_operation',
      duration,
      {
        operation,
        table,
        rowCount,
        ...metadata
      }
    );

    this.writeLog(entry);
  }

  /**
   * Log cache operation
   */
  logCacheOperation(
    operation: string,
    key: string,
    hit: boolean,
    duration: number,
    correlationId?: string,
    metadata?: Record<string, any>
  ): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const entry = this.createLogEntry(
      LogLevel.DEBUG,
      `Cache ${operation} for ${key} - ${hit ? 'HIT' : 'MISS'}`,
      correlationId,
      'cache_operation',
      duration,
      {
        operation,
        key,
        hit,
        ...metadata
      }
    );

    this.writeLog(entry);
  }

  /**
   * Log security event
   */
  logSecurityEvent(
    event: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    correlationId?: string,
    metadata?: Record<string, any>
  ): void {
    const level = severity === 'critical' ? LogLevel.FATAL : 
                  severity === 'high' ? LogLevel.ERROR :
                  severity === 'medium' ? LogLevel.WARN : LogLevel.INFO;

    if (!this.shouldLog(level)) return;

    const entry = this.createLogEntry(
      level,
      `Security event: ${event}`,
      correlationId,
      'security_event',
      undefined,
      {
        event,
        severity,
        ...metadata
      }
    );

    this.writeLog(entry);
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }

  /**
   * Update log level
   */
  setLogLevel(level: LogLevel): void {
    this.config.level = level;
    this.info(`Log level changed to ${LogLevel[level]}`);
  }

  /**
   * Get active timer count
   */
  getActiveTimerCount(): number {
    return this.activeTimers.size;
  }

  /**
   * Clear all active timers (useful for testing)
   */
  clearTimers(): void {
    this.activeTimers.clear();
  }
}