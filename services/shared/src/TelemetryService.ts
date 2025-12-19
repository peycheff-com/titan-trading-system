/**
 * Centralized Telemetry Service for Titan Trading System
 * 
 * Provides unified logging aggregation, structured logging with correlation IDs,
 * metrics collection, and audit trail management across all services.
 * 
 * Requirements: 3.1 - Centralized telemetry and logging
 */

import { EventEmitter } from 'eventemitter3';
import { writeFileSync, appendFileSync, existsSync, mkdirSync, statSync, renameSync } from 'fs';
import { join } from 'path';
// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
  bgRed: {
    white: (text: string) => `\x1b[41m\x1b[37m${text}\x1b[0m`
  }
};

/**
 * Log levels
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  phase?: string;
  correlationId?: string;
  message: string;
  data?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Signal data for trading events
 */
export interface SignalData {
  symbol: string;
  type: string;
  confidence: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Execution data for order events
 */
export interface ExecutionData {
  orderId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  type: string;
  qty: number;
  price?: number;
  status: string;
  exchange: string;
  latency?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Metrics data
 */
export interface MetricData {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp?: number;
}

/**
 * Telemetry configuration
 */
export interface TelemetryConfig {
  logDirectory: string;
  maxLogFileSize: number; // bytes
  maxLogFiles: number;
  enableConsoleOutput: boolean;
  enableFileOutput: boolean;
  enableMetrics: boolean;
  correlationIdLength: number;
  retentionDays: number;
}

/**
 * Default telemetry configuration
 */
const DEFAULT_CONFIG: TelemetryConfig = {
  logDirectory: './logs',
  maxLogFileSize: 50 * 1024 * 1024, // 50MB
  maxLogFiles: 10,
  enableConsoleOutput: true,
  enableFileOutput: true,
  enableMetrics: true,
  correlationIdLength: 12,
  retentionDays: 30
};

/**
 * Correlation ID generator
 */
class CorrelationIdGenerator {
  private static counter = 0;
  
  static generate(length: number = 12): string {
    const timestamp = Date.now().toString(36);
    const counter = (++this.counter).toString(36).padStart(3, '0');
    const random = Math.random().toString(36).substr(2, length - timestamp.length - counter.length);
    return `${timestamp}${counter}${random}`.substr(0, length);
  }
}

/**
 * Log formatter
 */
class LogFormatter {
  static formatConsole(entry: LogEntry): string {
    const timestamp = colors.gray(entry.timestamp);
    const level = this.colorizeLevel(entry.level);
    const service = colors.cyan(`[${entry.service}${entry.phase ? `:${entry.phase}` : ''}]`);
    const correlationId = entry.correlationId ? colors.magenta(`(${entry.correlationId})`) : '';
    const message = entry.message;
    
    let output = `${timestamp} ${level} ${service} ${correlationId} ${message}`;
    
    if (entry.data) {
      output += `\n${colors.gray('Data:')} ${JSON.stringify(entry.data, null, 2)}`;
    }
    
    if (entry.error) {
      output += `\n${colors.red('Error:')} ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n${colors.gray(entry.error.stack)}`;
      }
    }
    
    return output;
  }
  
  static formatFile(entry: LogEntry): string {
    return JSON.stringify(entry) + '\n';
  }
  
  private static colorizeLevel(level: LogLevel): string {
    switch (level) {
      case 'DEBUG': return colors.gray(level);
      case 'INFO': return colors.blue(level);
      case 'WARN': return colors.yellow(level);
      case 'ERROR': return colors.red(level);
      case 'FATAL': return colors.bgRed.white(level);
      default: return level;
    }
  }
}

/**
 * Log rotation manager
 */
class LogRotationManager {
  constructor(private config: TelemetryConfig) {}
  
  /**
   * Check if log file needs rotation
   */
  needsRotation(filePath: string): boolean {
    if (!existsSync(filePath)) {
      return false;
    }
    
    const stats = statSync(filePath);
    return stats.size >= this.config.maxLogFileSize;
  }
  
  /**
   * Rotate log file
   */
  rotateLogFile(filePath: string): void {
    if (!existsSync(filePath)) {
      return;
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedPath = `${filePath}.${timestamp}`;
    
    try {
      renameSync(filePath, rotatedPath);
      console.log(colors.blue(`📁 Log rotated: ${filePath} -> ${rotatedPath}`));
      
      // Clean up old log files
      this.cleanupOldLogs(filePath);
    } catch (error) {
      console.error(colors.red('❌ Failed to rotate log file:'), error);
    }
  }
  
  /**
   * Clean up old log files
   */
  private cleanupOldLogs(basePath: string): void {
    // This would implement cleanup logic based on maxLogFiles and retentionDays
    // For now, just log the action
    console.log(colors.gray(`🧹 Cleaning up old logs for ${basePath}`));
  }
}

/**
 * Metrics collector
 */
class MetricsCollector {
  private metrics = new Map<string, MetricData[]>();
  private aggregatedMetrics = new Map<string, number>();
  
  /**
   * Record metric
   */
  record(metric: MetricData): void {
    const key = `${metric.name}:${JSON.stringify(metric.tags || {})}`;
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }
    
    const metricWithTimestamp = {
      ...metric,
      timestamp: metric.timestamp || Date.now()
    };
    
    this.metrics.get(key)!.push(metricWithTimestamp);
    
    // Update aggregated metrics
    this.updateAggregatedMetrics(key, metric.value);
  }
  
  /**
   * Get metrics by name
   */
  getMetrics(name: string): MetricData[] {
    const results: MetricData[] = [];
    
    for (const [key, metrics] of this.metrics) {
      if (key.startsWith(`${name}:`)) {
        results.push(...metrics);
      }
    }
    
    return results.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }
  
  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(): Record<string, number> {
    return Object.fromEntries(this.aggregatedMetrics);
  }
  
  /**
   * Clear old metrics
   */
  clearOldMetrics(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs;
    
    for (const [key, metrics] of this.metrics) {
      const filtered = metrics.filter(m => (m.timestamp || 0) > cutoff);
      if (filtered.length === 0) {
        this.metrics.delete(key);
      } else {
        this.metrics.set(key, filtered);
      }
    }
  }
  
  private updateAggregatedMetrics(key: string, value: number): void {
    const current = this.aggregatedMetrics.get(key) || 0;
    this.aggregatedMetrics.set(key, current + value);
  }
}

/**
 * Centralized Telemetry Service
 */
export class TelemetryService extends EventEmitter {
  private config: TelemetryConfig;
  private rotationManager: LogRotationManager;
  private metricsCollector: MetricsCollector;
  private logFilePaths: Map<string, string> = new Map();
  
  constructor(config: Partial<TelemetryConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rotationManager = new LogRotationManager(this.config);
    this.metricsCollector = new MetricsCollector();
    
    this.ensureLogDirectory();
    
    console.log(colors.blue('🚀 Telemetry Service initialized'));
  }
  
  /**
   * Log message with specified level
   */
  log(
    level: LogLevel,
    service: string,
    message: string,
    data?: unknown,
    options: {
      phase?: string;
      correlationId?: string;
      error?: Error;
      metadata?: Record<string, unknown>;
    } = {}
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      phase: options.phase,
      correlationId: options.correlationId || this.generateCorrelationId(),
      message,
      data,
      error: options.error ? {
        name: options.error.name,
        message: options.error.message,
        stack: options.error.stack
      } : undefined,
      metadata: options.metadata
    };
    
    // Console output
    if (this.config.enableConsoleOutput) {
      console.log(LogFormatter.formatConsole(entry));
    }
    
    // File output
    if (this.config.enableFileOutput) {
      this.writeToFile(entry);
    }
    
    // Emit event
    this.emit('log', entry);
  }
  
  /**
   * Log debug message
   */
  debug(service: string, message: string, data?: unknown, options?: { phase?: string; correlationId?: string }): void {
    this.log('DEBUG', service, message, data, options);
  }
  
  /**
   * Log info message
   */
  info(service: string, message: string, data?: unknown, options?: { phase?: string; correlationId?: string }): void {
    this.log('INFO', service, message, data, options);
  }
  
  /**
   * Log warning message
   */
  warn(service: string, message: string, data?: unknown, options?: { phase?: string; correlationId?: string }): void {
    this.log('WARN', service, message, data, options);
  }
  
  /**
   * Log error message
   */
  error(service: string, message: string, error?: Error, options?: { phase?: string; correlationId?: string; metadata?: Record<string, unknown> }): void {
    this.log('ERROR', service, message, undefined, { ...options, error });
  }
  
  /**
   * Log fatal message
   */
  fatal(service: string, message: string, error?: Error, options?: { phase?: string; correlationId?: string }): void {
    this.log('FATAL', service, message, undefined, { ...options, error });
  }
  
  /**
   * Log signal event
   */
  logSignal(phase: string, signal: SignalData, correlationId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'trading',
      phase,
      correlationId: correlationId || this.generateCorrelationId(),
      message: `Signal generated: ${signal.type} for ${signal.symbol}`,
      data: signal,
      metadata: {
        eventType: 'signal',
        symbol: signal.symbol,
        confidence: signal.confidence
      }
    };
    
    this.writeToTradingLog(entry);
    this.emit('signal', { phase, signal, correlationId: entry.correlationId });
  }
  
  /**
   * Log execution event
   */
  logExecution(phase: string, execution: ExecutionData, correlationId?: string): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      service: 'execution',
      phase,
      correlationId: correlationId || this.generateCorrelationId(),
      message: `Order executed: ${execution.side} ${execution.qty} ${execution.symbol}`,
      data: execution,
      metadata: {
        eventType: 'execution',
        orderId: execution.orderId,
        exchange: execution.exchange,
        latency: execution.latency
      }
    };
    
    this.writeToTradingLog(entry);
    this.emit('execution', { phase, execution, correlationId: entry.correlationId });
  }
  
  /**
   * Record metric
   */
  recordMetric(metric: MetricData): void {
    if (!this.config.enableMetrics) {
      return;
    }
    
    this.metricsCollector.record(metric);
    this.emit('metric', metric);
  }
  
  /**
   * Get metrics by name
   */
  getMetrics(name: string, timeRange?: { start: number; end: number }): MetricData[] {
    let metrics = this.metricsCollector.getMetrics(name);
    
    if (timeRange) {
      metrics = metrics.filter(m => {
        const timestamp = m.timestamp || 0;
        return timestamp >= timeRange.start && timestamp <= timeRange.end;
      });
    }
    
    return metrics;
  }
  
  /**
   * Get aggregated metrics
   */
  getAggregatedMetrics(): Record<string, number> {
    return this.metricsCollector.getAggregatedMetrics();
  }
  
  /**
   * Generate correlation ID
   */
  generateCorrelationId(): string {
    return CorrelationIdGenerator.generate(this.config.correlationIdLength);
  }
  
  /**
   * Create child logger with correlation ID
   */
  createChildLogger(service: string, phase?: string, correlationId?: string): {
    correlationId: string;
    debug: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, error?: Error) => void;
    fatal: (message: string, error?: Error) => void;
  } {
    const childCorrelationId = correlationId || this.generateCorrelationId();
    
    return {
      correlationId: childCorrelationId,
      debug: (message: string, data?: unknown) => 
        this.debug(service, message, data, { phase, correlationId: childCorrelationId }),
      info: (message: string, data?: unknown) => 
        this.info(service, message, data, { phase, correlationId: childCorrelationId }),
      warn: (message: string, data?: unknown) => 
        this.warn(service, message, data, { phase, correlationId: childCorrelationId }),
      error: (message: string, error?: Error) => 
        this.error(service, message, error, { phase, correlationId: childCorrelationId }),
      fatal: (message: string, error?: Error) => 
        this.fatal(service, message, error, { phase, correlationId: childCorrelationId })
    };
  }
  
  /**
   * Get log file path for service
   */
  private getLogFilePath(service: string): string {
    if (!this.logFilePaths.has(service)) {
      const filename = `${service}.log`;
      const filepath = join(this.config.logDirectory, filename);
      this.logFilePaths.set(service, filepath);
    }
    return this.logFilePaths.get(service)!;
  }
  
  /**
   * Write log entry to file
   */
  private writeToFile(entry: LogEntry): void {
    try {
      const filePath = this.getLogFilePath(entry.service);
      
      // Check if rotation is needed
      if (this.rotationManager.needsRotation(filePath)) {
        this.rotationManager.rotateLogFile(filePath);
      }
      
      // Write log entry
      const logLine = LogFormatter.formatFile(entry);
      appendFileSync(filePath, logLine, 'utf8');
      
    } catch (error) {
      console.error(colors.red('❌ Failed to write log to file:'), error);
    }
  }
  
  /**
   * Write to trading-specific log
   */
  private writeToTradingLog(entry: LogEntry): void {
    try {
      const tradingLogPath = join(this.config.logDirectory, 'trades.jsonl');
      
      // Check if rotation is needed
      if (this.rotationManager.needsRotation(tradingLogPath)) {
        this.rotationManager.rotateLogFile(tradingLogPath);
      }
      
      // Write log entry
      const logLine = LogFormatter.formatFile(entry);
      appendFileSync(tradingLogPath, logLine, 'utf8');
      
    } catch (error) {
      console.error(colors.red('❌ Failed to write trading log:'), error);
    }
  }
  
  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    if (!existsSync(this.config.logDirectory)) {
      mkdirSync(this.config.logDirectory, { recursive: true });
    }
  }
  
  /**
   * Cleanup old metrics and logs
   */
  cleanup(): void {
    const maxAge = this.config.retentionDays * 24 * 60 * 60 * 1000;
    this.metricsCollector.clearOldMetrics(maxAge);
    console.log(colors.blue('🧹 Telemetry cleanup completed'));
  }
  
  /**
   * Get service statistics
   */
  getStats(): {
    logDirectory: string;
    enabledFeatures: string[];
    logFiles: string[];
    metricsCount: number;
  } {
    return {
      logDirectory: this.config.logDirectory,
      enabledFeatures: [
        ...(this.config.enableConsoleOutput ? ['console'] : []),
        ...(this.config.enableFileOutput ? ['file'] : []),
        ...(this.config.enableMetrics ? ['metrics'] : [])
      ],
      logFiles: Array.from(this.logFilePaths.values()),
      metricsCount: Object.keys(this.metricsCollector.getAggregatedMetrics()).length
    };
  }
  
  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down Telemetry Service...'));
    this.cleanup();
    this.removeAllListeners();
  }
}

/**
 * Singleton Telemetry Service instance
 */
let telemetryServiceInstance: TelemetryService | null = null;

/**
 * Get or create the global Telemetry Service instance
 */
export function getTelemetryService(config?: Partial<TelemetryConfig>): TelemetryService {
  if (!telemetryServiceInstance) {
    telemetryServiceInstance = new TelemetryService(config);
  }
  return telemetryServiceInstance;
}

/**
 * Reset the global Telemetry Service instance (for testing)
 */
export function resetTelemetryService(): void {
  if (telemetryServiceInstance) {
    telemetryServiceInstance.shutdown();
  }
  telemetryServiceInstance = null;
}