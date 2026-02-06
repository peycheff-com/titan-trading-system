/**
 * Shared Logger - Unified logging for Titan Services
 *
 * Combines:
 * 1. Structured logging (JSON) from Titan Brain
 * 2. Trade logging (JSONL) from Titan Scavenger
 *
 * Requirements:
 * - 4.1.1-4.1.5: Structured logging, correlation IDs, masking
 * - 11.1-11.7: Signal execution logging to trades.jsonl
 */
/**
 * Log levels in order of severity
 */
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4
}
/**
 * Structured Log entry structure (Brain style)
 */
export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    correlationId?: string;
    component?: string;
    operation?: string;
    duration?: number;
    traceId?: string;
    spanId?: string;
    metadata?: Record<string, any>;
    error?: {
        name: string;
        message: string;
        stack?: string;
        code?: string | number;
    };
}
/**
 * Trade Log entry structure (Scavenger style)
 * Used for trades.jsonl
 */
export interface TradeLogEntry {
    timestamp: string | number;
    service: string;
    level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    message: string;
    signal_id?: string;
    type?: 'signal' | 'execution' | 'close' | 'error';
    symbol?: string;
    trapType?: string;
    direction?: string;
    entry?: number;
    stop?: number;
    target?: number;
    confidence?: number;
    leverage?: number;
    orderType?: string;
    velocity?: number;
    positionSize?: number;
    fillPrice?: number;
    fillTimestamp?: number;
    exitPrice?: number;
    exitTimestamp?: number;
    profitPercent?: number;
    closeReason?: string;
    error?: string;
    errorStack?: string;
    context?: any;
    [key: string]: any;
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
    enableTradeLogging?: boolean;
    tradeLogPath?: string;
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
 * Unified Shared Logger
 */
export declare class Logger {
    private config;
    private static instance;
    private activeTimers;
    private maxLogSize;
    private maxLogAge;
    constructor(config: LoggerConfig);
    /**
     * Create logger configuration from environment variables
     */
    static createConfigFromEnv(component: string): LoggerConfig;
    /**
     * Get or create singleton logger instance
     */
    static getInstance(component?: string): Logger;
    /**
     * Generate a new correlation ID
     */
    static generateCorrelationId(): string;
    private maskSensitiveData;
    private formatError;
    private createLogEntry;
    private writeLog;
    private shouldLog;
    debug(message: string, correlationId?: string, metadata?: Record<string, any>): void;
    info(message: string, correlationId?: string, metadata?: Record<string, any>): void;
    warn(message: string, correlationId?: string, metadata?: Record<string, any>): void;
    error(message: string, error?: Error, correlationId?: string, metadata?: Record<string, any>): void;
    fatal(message: string, error?: Error, correlationId?: string, metadata?: Record<string, any>): void;
    startTimer(operation: string, correlationId?: string, metadata?: Record<string, any>): string;
    endTimer(timerId: string, additionalMetadata?: Record<string, any>): number | null;
    logHttpRequest(method: string, url: string, statusCode: number, duration: number, correlationId?: string, metadata?: Record<string, any>): void;
    logDatabaseOperation(operation: string, table: string, duration: number, rowCount?: number, correlationId?: string, metadata?: Record<string, any>): void;
    logCacheOperation(operation: string, key: string, hit: boolean, duration: number, correlationId?: string, metadata?: Record<string, any>): void;
    logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', correlationId?: string, metadata?: Record<string, any>): void;
    private initTradeLog;
    /**
     * Log an entry to trades.jsonl
     */
    logTradeEntry(entry: Partial<TradeLogEntry>): void;
    private generateTradeMessage;
    logSignal(data: {
        symbol: string;
        trapType: string;
        direction: string;
        entry: number;
        stop: number;
        target: number;
        confidence: number;
        leverage: number;
        orderType?: string;
        velocity?: number;
        positionSize?: number;
        signal_id?: string;
    }): void;
    logExecution(data: {
        symbol: string;
        trapType: string;
        direction: string;
        fillPrice: number;
        fillTimestamp: number;
        orderType: string;
        positionSize: number;
        leverage: number;
        signal_id?: string;
    }): void;
    logClose(data: {
        symbol: string;
        exitPrice: number;
        exitTimestamp: number;
        profitPercent: number;
        closeReason: string;
        entry?: number;
        signal_id?: string;
    }): void;
    private checkRotation;
    private rotateLog;
    private compressOldLogs;
    queryLogs(filter?: (entry: TradeLogEntry) => boolean): TradeLogEntry[];
    /**
     * Get current configuration
     */
    getConfig(): LoggerConfig;
    /**
     * Update log level
     */
    setLogLevel(level: LogLevel): void;
    /**
     * Get active timer count
     */
    getActiveTimerCount(): number;
    /**
     * Clear all active timers (useful for testing)
     */
    clearTimers(): void;
}
//# sourceMappingURL=Logger.d.ts.map