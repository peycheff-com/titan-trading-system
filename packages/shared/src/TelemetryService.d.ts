/**
 * Centralized Telemetry Service for Titan Trading System
 *
 * Provides unified logging aggregation, structured logging with correlation IDs,
 * metrics collection, and audit trail management across all services.
 *
 * Requirements: 3.1 - Centralized telemetry and logging
 */
import { EventEmitter } from 'eventemitter3';
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
    maxLogFileSize: number;
    maxLogFiles: number;
    enableConsoleOutput: boolean;
    enableFileOutput: boolean;
    enableMetrics: boolean;
    correlationIdLength: number;
    retentionDays: number;
}
/**
 * Centralized Telemetry Service
 */
export declare class TelemetryService extends EventEmitter {
    private config;
    private rotationManager;
    private metricsCollector;
    private logFilePaths;
    constructor(config?: Partial<TelemetryConfig>);
    /**
     * Log message with specified level
     */
    log(level: LogLevel, service: string, message: string, data?: unknown, options?: {
        phase?: string;
        correlationId?: string;
        error?: Error;
        metadata?: Record<string, unknown>;
    }): void;
    /**
     * Log debug message
     */
    debug(service: string, message: string, data?: unknown, options?: {
        phase?: string;
        correlationId?: string;
    }): void;
    /**
     * Log info message
     */
    info(service: string, message: string, data?: unknown, options?: {
        phase?: string;
        correlationId?: string;
    }): void;
    /**
     * Log warning message
     */
    warn(service: string, message: string, data?: unknown, options?: {
        phase?: string;
        correlationId?: string;
    }): void;
    /**
     * Log error message
     */
    error(service: string, message: string, error?: Error, options?: {
        phase?: string;
        correlationId?: string;
        metadata?: Record<string, unknown>;
    }): void;
    /**
     * Log fatal message
     */
    fatal(service: string, message: string, error?: Error, options?: {
        phase?: string;
        correlationId?: string;
    }): void;
    /**
     * Log signal event
     */
    logSignal(phase: string, signal: SignalData, correlationId?: string): void;
    /**
     * Log execution event
     */
    logExecution(phase: string, execution: ExecutionData, correlationId?: string): void;
    /**
     * Record metric
     */
    recordMetric(metric: MetricData): void;
    /**
     * Get metrics by name
     */
    getMetrics(name: string, timeRange?: {
        start: number;
        end: number;
    }): MetricData[];
    /**
     * Get aggregated metrics
     */
    getAggregatedMetrics(): Record<string, number>;
    /**
     * Generate correlation ID
     */
    generateCorrelationId(): string;
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
    };
    /**
     * Get log file path for service
     */
    private getLogFilePath;
    /**
     * Write log entry to file
     */
    private writeToFile;
    /**
     * Write to trading-specific log
     */
    private writeToTradingLog;
    /**
     * Ensure log directory exists
     */
    private ensureLogDirectory;
    /**
     * Cleanup old metrics and logs
     */
    cleanup(): void;
    /**
     * Get service statistics
     */
    getStats(): {
        logDirectory: string;
        enabledFeatures: string[];
        logFiles: string[];
        metricsCount: number;
    };
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Get or create the global Telemetry Service instance
 */
export declare function getTelemetryService(config?: Partial<TelemetryConfig>): TelemetryService;
/**
 * Reset the global Telemetry Service instance (for testing)
 */
export declare function resetTelemetryService(): void;
//# sourceMappingURL=TelemetryService.d.ts.map