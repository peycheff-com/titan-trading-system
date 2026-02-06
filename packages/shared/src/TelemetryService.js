/**
 * Centralized Telemetry Service for Titan Trading System
 *
 * Provides unified logging aggregation, structured logging with correlation IDs,
 * metrics collection, and audit trail management across all services.
 *
 * Requirements: 3.1 - Centralized telemetry and logging
 */
import { EventEmitter } from 'eventemitter3';
import { appendFileSync, existsSync, mkdirSync, statSync, renameSync } from 'fs';
import { join } from 'path';
// Simple color logging utility
const colors = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    gray: (text) => `\x1b[90m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
    bgRed: {
        white: (text) => `\x1b[41m\x1b[37m${text}\x1b[0m`,
    },
};
/**
 * Default telemetry configuration
 */
const DEFAULT_CONFIG = {
    logDirectory: './logs',
    maxLogFileSize: 50 * 1024 * 1024, // 50MB
    maxLogFiles: 10,
    enableConsoleOutput: true,
    enableFileOutput: true,
    enableMetrics: true,
    correlationIdLength: 12,
    retentionDays: 30,
};
/**
 * Correlation ID generator
 */
class CorrelationIdGenerator {
    static counter = 0;
    static generate(length = 12) {
        const timestamp = Date.now().toString(36);
        // eslint-disable-next-line functional/immutable-data
        const counter = (++this.counter).toString(36).padStart(3, '0');
        const random = Math.random()
            .toString(36)
            .substr(2, length - timestamp.length - counter.length);
        return `${timestamp}${counter}${random}`.substr(0, length);
    }
}
/**
 * Log formatter
 */
class LogFormatter {
    static formatConsole(entry) {
        const timestamp = colors.gray(entry.timestamp);
        const level = this.colorizeLevel(entry.level);
        const service = colors.cyan(`[${entry.service}${entry.phase ? `:${entry.phase}` : ''}]`);
        const correlationId = entry.correlationId ? colors.magenta(`(${entry.correlationId})`) : '';
        const message = entry.message;
        // eslint-disable-next-line functional/no-let
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
    static formatFile(entry) {
        return JSON.stringify(entry) + '\n';
    }
    static colorizeLevel(level) {
        switch (level) {
            case 'DEBUG':
                return colors.gray(level);
            case 'INFO':
                return colors.blue(level);
            case 'WARN':
                return colors.yellow(level);
            case 'ERROR':
                return colors.red(level);
            case 'FATAL':
                return colors.bgRed.white(level);
            default:
                return level;
        }
    }
}
/**
 * Log rotation manager
 */
class LogRotationManager {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Check if log file needs rotation
     */
    needsRotation(filePath) {
        if (!existsSync(filePath)) {
            return false;
        }
        const stats = statSync(filePath);
        return stats.size >= this.config.maxLogFileSize;
    }
    /**
     * Rotate log file
     */
    rotateLogFile(filePath) {
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
        }
        catch (error) {
            console.error(colors.red('❌ Failed to rotate log file:'), error);
        }
    }
    /**
     * Clean up old log files
     */
    cleanupOldLogs(basePath) {
        // This would implement cleanup logic based on maxLogFiles and retentionDays
        // For now, just log the action
        console.log(colors.gray(`🧹 Cleaning up old logs for ${basePath}`));
    }
}
/**
 * Metrics collector
 */
class MetricsCollector {
    metrics = new Map();
    aggregatedMetrics = new Map();
    /**
     * Record metric
     */
    record(metric) {
        const key = `${metric.name}:${JSON.stringify(metric.tags || {})}`;
        if (!this.metrics.has(key)) {
            // eslint-disable-next-line functional/immutable-data
            this.metrics.set(key, []);
        }
        const metricWithTimestamp = {
            ...metric,
            timestamp: metric.timestamp || Date.now(),
        };
        // eslint-disable-next-line functional/immutable-data
        this.metrics.get(key).push(metricWithTimestamp);
        // Update aggregated metrics
        this.updateAggregatedMetrics(key, metric.value);
    }
    /**
     * Get metrics by name
     */
    getMetrics(name) {
        const results = [];
        for (const [key, metrics] of this.metrics) {
            if (key.startsWith(`${name}:`)) {
                // eslint-disable-next-line functional/immutable-data
                results.push(...metrics);
            }
        }
        // eslint-disable-next-line functional/immutable-data
        return results.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }
    /**
     * Get aggregated metrics
     */
    getAggregatedMetrics() {
        return Object.fromEntries(this.aggregatedMetrics);
    }
    /**
     * Clear old metrics
     */
    clearOldMetrics(maxAgeMs) {
        const cutoff = Date.now() - maxAgeMs;
        for (const [key, metrics] of this.metrics) {
            const filtered = metrics.filter((m) => (m.timestamp || 0) > cutoff);
            if (filtered.length === 0) {
                // eslint-disable-next-line functional/immutable-data
                this.metrics.delete(key);
            }
            else {
                // eslint-disable-next-line functional/immutable-data
                this.metrics.set(key, filtered);
            }
        }
    }
    updateAggregatedMetrics(key, value) {
        const current = this.aggregatedMetrics.get(key) || 0;
        // eslint-disable-next-line functional/immutable-data
        this.aggregatedMetrics.set(key, current + value);
    }
}
/**
 * Centralized Telemetry Service
 */
export class TelemetryService extends EventEmitter {
    config;
    rotationManager;
    metricsCollector;
    logFilePaths = new Map();
    constructor(config = {}) {
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
    log(level, service, message, data, options = {}) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            service,
            phase: options.phase,
            correlationId: options.correlationId || this.generateCorrelationId(),
            message,
            data,
            error: options.error
                ? {
                    name: options.error.name,
                    message: options.error.message,
                    stack: options.error.stack,
                }
                : undefined,
            metadata: options.metadata,
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
    debug(service, message, data, options) {
        this.log('DEBUG', service, message, data, options);
    }
    /**
     * Log info message
     */
    info(service, message, data, options) {
        this.log('INFO', service, message, data, options);
    }
    /**
     * Log warning message
     */
    warn(service, message, data, options) {
        this.log('WARN', service, message, data, options);
    }
    /**
     * Log error message
     */
    error(service, message, error, options) {
        this.log('ERROR', service, message, undefined, { ...options, error });
    }
    /**
     * Log fatal message
     */
    fatal(service, message, error, options) {
        this.log('FATAL', service, message, undefined, { ...options, error });
    }
    /**
     * Log signal event
     */
    logSignal(phase, signal, correlationId) {
        const entry = {
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
                confidence: signal.confidence,
            },
        };
        this.writeToTradingLog(entry);
        this.emit('signal', { phase, signal, correlationId: entry.correlationId });
    }
    /**
     * Log execution event
     */
    logExecution(phase, execution, correlationId) {
        const entry = {
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
                latency: execution.latency,
            },
        };
        this.writeToTradingLog(entry);
        this.emit('execution', { phase, execution, correlationId: entry.correlationId });
    }
    /**
     * Record metric
     */
    recordMetric(metric) {
        if (!this.config.enableMetrics) {
            return;
        }
        this.metricsCollector.record(metric);
        this.emit('metric', metric);
    }
    /**
     * Get metrics by name
     */
    getMetrics(name, timeRange) {
        // eslint-disable-next-line functional/no-let
        let metrics = this.metricsCollector.getMetrics(name);
        if (timeRange) {
            metrics = metrics.filter((m) => {
                const timestamp = m.timestamp || 0;
                return timestamp >= timeRange.start && timestamp <= timeRange.end;
            });
        }
        return metrics;
    }
    /**
     * Get aggregated metrics
     */
    getAggregatedMetrics() {
        return this.metricsCollector.getAggregatedMetrics();
    }
    /**
     * Generate correlation ID
     */
    generateCorrelationId() {
        return CorrelationIdGenerator.generate(this.config.correlationIdLength);
    }
    /**
     * Create child logger with correlation ID
     */
    createChildLogger(service, phase, correlationId) {
        const childCorrelationId = correlationId || this.generateCorrelationId();
        return {
            correlationId: childCorrelationId,
            debug: (message, data) => this.debug(service, message, data, { phase, correlationId: childCorrelationId }),
            info: (message, data) => this.info(service, message, data, { phase, correlationId: childCorrelationId }),
            warn: (message, data) => this.warn(service, message, data, { phase, correlationId: childCorrelationId }),
            error: (message, error) => this.error(service, message, error, { phase, correlationId: childCorrelationId }),
            fatal: (message, error) => this.fatal(service, message, error, { phase, correlationId: childCorrelationId }),
        };
    }
    /**
     * Get log file path for service
     */
    getLogFilePath(service) {
        if (!this.logFilePaths.has(service)) {
            const filename = `${service}.log`;
            const filepath = join(this.config.logDirectory, filename);
            // eslint-disable-next-line functional/immutable-data
            this.logFilePaths.set(service, filepath);
        }
        return this.logFilePaths.get(service);
    }
    /**
     * Write log entry to file
     */
    writeToFile(entry) {
        try {
            const filePath = this.getLogFilePath(entry.service);
            // Check if rotation is needed
            if (this.rotationManager.needsRotation(filePath)) {
                this.rotationManager.rotateLogFile(filePath);
            }
            // Write log entry
            const logLine = LogFormatter.formatFile(entry);
            appendFileSync(filePath, logLine, 'utf8');
        }
        catch (error) {
            console.error(colors.red('❌ Failed to write log to file:'), error);
        }
    }
    /**
     * Write to trading-specific log
     */
    writeToTradingLog(entry) {
        try {
            const tradingLogPath = join(this.config.logDirectory, 'trades.jsonl');
            // Check if rotation is needed
            if (this.rotationManager.needsRotation(tradingLogPath)) {
                this.rotationManager.rotateLogFile(tradingLogPath);
            }
            // Write log entry
            const logLine = LogFormatter.formatFile(entry);
            appendFileSync(tradingLogPath, logLine, 'utf8');
        }
        catch (error) {
            console.error(colors.red('❌ Failed to write trading log:'), error);
        }
    }
    /**
     * Ensure log directory exists
     */
    ensureLogDirectory() {
        if (!existsSync(this.config.logDirectory)) {
            mkdirSync(this.config.logDirectory, { recursive: true });
        }
    }
    /**
     * Cleanup old metrics and logs
     */
    cleanup() {
        const maxAge = this.config.retentionDays * 24 * 60 * 60 * 1000;
        this.metricsCollector.clearOldMetrics(maxAge);
        console.log(colors.blue('🧹 Telemetry cleanup completed'));
    }
    /**
     * Get service statistics
     */
    getStats() {
        return {
            logDirectory: this.config.logDirectory,
            enabledFeatures: [
                ...(this.config.enableConsoleOutput ? ['console'] : []),
                ...(this.config.enableFileOutput ? ['file'] : []),
                ...(this.config.enableMetrics ? ['metrics'] : []),
            ],
            logFiles: Array.from(this.logFilePaths.values()),
            metricsCount: Object.keys(this.metricsCollector.getAggregatedMetrics()).length,
        };
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
        console.log(colors.blue('🛑 Shutting down Telemetry Service...'));
        this.cleanup();
        this.removeAllListeners();
    }
}
/**
 * Singleton Telemetry Service instance
 */
// eslint-disable-next-line functional/no-let
let telemetryServiceInstance = null;
/**
 * Get or create the global Telemetry Service instance
 */
export function getTelemetryService(config) {
    if (!telemetryServiceInstance) {
        telemetryServiceInstance = new TelemetryService(config);
    }
    return telemetryServiceInstance;
}
/**
 * Reset the global Telemetry Service instance (for testing)
 */
export function resetTelemetryService() {
    if (telemetryServiceInstance) {
        telemetryServiceInstance.shutdown();
    }
    telemetryServiceInstance = null;
}
//# sourceMappingURL=TelemetryService.js.map