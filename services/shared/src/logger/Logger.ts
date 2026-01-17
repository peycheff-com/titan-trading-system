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

import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { promisify } from "util";

const gzip = promisify(zlib.gzip);

/**
 * Log levels in order of severity
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    FATAL = 4,
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
    level: "error" | "warn" | "info" | "debug" | "trace";
    message: string;
    signal_id?: string;
    type?: "signal" | "execution" | "close" | "error";
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
    // Trade logging specific
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
export class Logger {
    private config: LoggerConfig;
    private static instance: Logger | null = null;
    private activeTimers: Map<string, PerformanceTimer> = new Map();

    // Trade logging state
    private maxLogSize: number = 10 * 1024 * 1024; // 10 MB
    private maxLogAge: number = 30 * 24 * 60 * 60 * 1000; // 30 days

    constructor(config: LoggerConfig) {
        this.config = config;

        // Initialize trade logging if enabled
        if (this.config.enableTradeLogging && this.config.tradeLogPath) {
            this.initTradeLog();
        }
    }

    /**
     * Create logger configuration from environment variables
     */
    static createConfigFromEnv(component: string): LoggerConfig {
        const logLevelStr = process.env.LOG_LEVEL || "INFO";
        const logLevel =
            LogLevel[logLevelStr.toUpperCase() as keyof typeof LogLevel] ??
                LogLevel.INFO;

        const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
        const defaultTradeLogPath = path.join(
            homeDir,
            ".titan-scanner",
            "logs",
            "trades.jsonl",
        );

        return {
            level: logLevel,
            component,
            enableConsole: process.env.LOG_ENABLE_CONSOLE !== "false",
            enableFile: process.env.LOG_ENABLE_FILE === "true",
            filePath: process.env.LOG_FILE_PATH,
            enablePerformanceLogging:
                process.env.LOG_ENABLE_PERFORMANCE !== "false",
            sensitiveFields: (process.env.LOG_SENSITIVE_FIELDS ||
                "password,secret,token,key,authorization").split(","),
            maxStackTraceLines: parseInt(
                process.env.LOG_MAX_STACK_LINES || "10",
            ),
            enableTradeLogging: true, // Default to true, allow services to ignore if unused
            tradeLogPath: process.env.TRADE_LOG_PATH || defaultTradeLogPath,
        };
    }

    /**
     * Get or create singleton logger instance
     */
    static getInstance(component: string = "shared"): Logger {
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

    // ==========================================
    // Structured Logging Methods (Brain Logic)
    // ==========================================

    private maskSensitiveData(obj: any): any {
        if (obj === null || obj === undefined) return obj;
        if (typeof obj === "string") {
            const lowerStr = obj.toLowerCase();
            if (
                lowerStr.includes("password") || lowerStr.includes("secret") ||
                lowerStr.includes("token")
            ) {
                return "[MASKED]";
            }
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map((item) => this.maskSensitiveData(item));
        }
        if (typeof obj === "object") {
            const masked: any = {};
            for (const [key, value] of Object.entries(obj)) {
                const lowerKey = key.toLowerCase();
                if (
                    this.config.sensitiveFields.some((field) =>
                        lowerKey.includes(field.toLowerCase())
                    )
                ) {
                    masked[key] = "[MASKED]";
                } else {
                    masked[key] = this.maskSensitiveData(value);
                }
            }
            return masked;
        }
        return obj;
    }

    private formatError(error: Error): LogEntry["error"] {
        const stackLines = error.stack?.split("\n").slice(
            0,
            this.config.maxStackTraceLines,
        );
        return {
            name: error.name,
            message: error.message,
            stack: stackLines?.join("\n"),
            code: (error as any).code || (error as any).statusCode,
        };
    }

    private createLogEntry(
        level: LogLevel,
        message: string,
        correlationId?: string,
        operation?: string,
        duration?: number,
        metadata?: Record<string, any>,
        error?: Error,
    ): LogEntry {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level: LogLevel[level],
            message,
            component: this.config.component,
        };
        if (correlationId) entry.correlationId = correlationId;
        if (operation) entry.operation = operation;
        if (duration !== undefined) entry.duration = duration;
        if (metadata) entry.metadata = this.maskSensitiveData(metadata);
        if (error) entry.error = this.formatError(error);
        return entry;
    }

    private writeLog(entry: LogEntry): void {
        const logString = JSON.stringify(entry);

        // Console output
        if (this.config.enableConsole) {
            switch (entry.level) {
                case "DEBUG":
                    console.debug(logString);
                    break;
                case "INFO":
                    console.info(logString);
                    break;
                case "WARN":
                    console.warn(logString);
                    break;
                case "ERROR":
                case "FATAL":
                    console.error(logString);
                    break;
                default:
                    console.log(logString);
            }
        }

        // File output
        if (this.config.enableFile && this.config.filePath) {
            try {
                const logDir = path.dirname(this.config.filePath);
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true });
                }
                fs.appendFileSync(this.config.filePath, logString + "\n");
            } catch (error) {
                console.error("Failed to write to log file:", error);
            }
        }
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.config.level;
    }

    debug(
        message: string,
        correlationId?: string,
        metadata?: Record<string, any>,
    ): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        this.writeLog(
            this.createLogEntry(
                LogLevel.DEBUG,
                message,
                correlationId,
                undefined,
                undefined,
                metadata,
            ),
        );
    }

    info(
        message: string,
        correlationId?: string,
        metadata?: Record<string, any>,
    ): void {
        if (!this.shouldLog(LogLevel.INFO)) return;
        this.writeLog(
            this.createLogEntry(
                LogLevel.INFO,
                message,
                correlationId,
                undefined,
                undefined,
                metadata,
            ),
        );
    }

    warn(
        message: string,
        correlationId?: string,
        metadata?: Record<string, any>,
    ): void {
        if (!this.shouldLog(LogLevel.WARN)) return;
        this.writeLog(
            this.createLogEntry(
                LogLevel.WARN,
                message,
                correlationId,
                undefined,
                undefined,
                metadata,
            ),
        );
    }

    error(
        message: string,
        error?: Error,
        correlationId?: string,
        metadata?: Record<string, any>,
    ): void {
        if (!this.shouldLog(LogLevel.ERROR)) return;
        this.writeLog(
            this.createLogEntry(
                LogLevel.ERROR,
                message,
                correlationId,
                undefined,
                undefined,
                metadata,
                error,
            ),
        );
    }

    fatal(
        message: string,
        error?: Error,
        correlationId?: string,
        metadata?: Record<string, any>,
    ): void {
        if (!this.shouldLog(LogLevel.FATAL)) return;
        this.writeLog(
            this.createLogEntry(
                LogLevel.FATAL,
                message,
                correlationId,
                undefined,
                undefined,
                metadata,
                error,
            ),
        );
    }

    // Performance Logging
    startTimer(
        operation: string,
        correlationId?: string,
        metadata?: Record<string, any>,
    ): string {
        const timerId = randomUUID();
        this.activeTimers.set(timerId, {
            operation,
            startTime: Date.now(),
            correlationId,
            metadata,
        });
        if (this.config.enablePerformanceLogging) {
            this.debug(`Started operation: ${operation}`, correlationId, {
                timerId,
                ...metadata,
            });
        }
        return timerId;
    }

    endTimer(
        timerId: string,
        additionalMetadata?: Record<string, any>,
    ): number | null {
        const timer = this.activeTimers.get(timerId);
        if (!timer) {
            this.warn(`Timer not found: ${timerId}`);
            return null;
        }
        const duration = Date.now() - timer.startTime;
        this.activeTimers.delete(timerId);
        if (this.config.enablePerformanceLogging) {
            this.writeLog(this.createLogEntry(
                LogLevel.INFO,
                `Completed operation: ${timer.operation}`,
                timer.correlationId,
                timer.operation,
                duration,
                { timerId, ...timer.metadata, ...additionalMetadata },
            ));
        }
        return duration;
    }

    // ==========================================
    // Utility Logging Methods (Brain Compatibility)
    // ==========================================

    logHttpRequest(
        method: string,
        url: string,
        statusCode: number,
        duration: number,
        correlationId?: string,
        metadata?: Record<string, any>,
    ): void {
        const level = statusCode >= 400 ? LogLevel.WARN : LogLevel.INFO;
        if (!this.shouldLog(level)) return;

        this.writeLog(this.createLogEntry(
            level,
            `HTTP ${method} ${url} - ${statusCode}`,
            correlationId,
            "http_request",
            duration,
            { method, url, statusCode, ...metadata },
        ));
    }

    logDatabaseOperation(
        operation: string,
        table: string,
        duration: number,
        rowCount?: number,
        correlationId?: string,
        metadata?: Record<string, any>,
    ): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        this.writeLog(this.createLogEntry(
            LogLevel.DEBUG,
            `Database ${operation} on ${table}`,
            correlationId,
            "database_operation",
            duration,
            { operation, table, rowCount, ...metadata },
        ));
    }

    logCacheOperation(
        operation: string,
        key: string,
        hit: boolean,
        duration: number,
        correlationId?: string,
        metadata?: Record<string, any>,
    ): void {
        if (!this.shouldLog(LogLevel.DEBUG)) return;
        this.writeLog(this.createLogEntry(
            LogLevel.DEBUG,
            `Cache ${operation} for ${key} - ${hit ? "HIT" : "MISS"}`,
            correlationId,
            "cache_operation",
            duration,
            { operation, key, hit, ...metadata },
        ));
    }

    logSecurityEvent(
        event: string,
        severity: "low" | "medium" | "high" | "critical",
        correlationId?: string,
        metadata?: Record<string, any>,
    ): void {
        const level = severity === "critical"
            ? LogLevel.FATAL
            : severity === "high"
            ? LogLevel.ERROR
            : severity === "medium"
            ? LogLevel.WARN
            : LogLevel.INFO;

        if (!this.shouldLog(level)) return;

        this.writeLog(this.createLogEntry(
            level,
            `Security event: ${event}`,
            correlationId,
            "security_event",
            undefined,
            { event, severity, ...metadata },
        ));
    }

    // ==========================================
    // Trade Logging Methods (Scavenger Logic)
    // ==========================================

    private initTradeLog(): void {
        if (!this.config.tradeLogPath) return;
        try {
            const logDir = path.dirname(this.config.tradeLogPath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            if (!fs.existsSync(this.config.tradeLogPath)) {
                fs.writeFileSync(this.config.tradeLogPath, "");
            }
        } catch (error) {
            console.error(
                `Failed to initialize trade log at ${this.config.tradeLogPath}:`,
                error,
            );
        }
    }

    /**
     * Log an entry to trades.jsonl
     */
    logTradeEntry(entry: Partial<TradeLogEntry>): void {
        if (!this.config.enableTradeLogging || !this.config.tradeLogPath) {
            return;
        }

        try {
            const unifiedEntry: TradeLogEntry = {
                timestamp: new Date().toISOString(),
                service: this.config.component,
                level: (entry.level as any) ||
                    (entry.type === "error" ? "error" : "info"),
                message: entry.message || this.generateTradeMessage(entry),
                ...entry,
            };

            const jsonLine = JSON.stringify(unifiedEntry) + "\n";
            fs.appendFileSync(this.config.tradeLogPath, jsonLine);
            this.checkRotation();
        } catch (error) {
            console.error("Failed to write trade log entry:", error);
        }
    }

    private generateTradeMessage(entry: Partial<TradeLogEntry>): string {
        if (entry.type === "signal") {
            return `Signal: ${entry.trapType} ${entry.direction} ${entry.symbol} @ ${entry.entry}`;
        }
        if (entry.type === "execution") {
            return `Execution: ${entry.direction} ${entry.symbol} filled @ ${entry.fillPrice}`;
        }
        if (entry.type === "close") {
            return `Close: ${entry.symbol} @ ${entry.exitPrice} (${
                (entry.profitPercent || 0).toFixed(2)
            }%)`;
        }
        if (entry.type === "error") {
            return `Error: ${entry.error}`;
        }
        return "Trade log entry";
    }

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
    }): void {
        this.logTradeEntry({
            type: "signal",
            level: "info",
            signal_id: data.signal_id,
            ...data,
        });
        // Also log to info for standard feedback
        this.info(
            this.generateTradeMessage({ type: "signal", ...data }),
            data.signal_id,
            data,
        );
    }

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
    }): void {
        this.logTradeEntry({
            type: "execution",
            level: "info",
            signal_id: data.signal_id,
            ...data,
        });
        this.info(
            this.generateTradeMessage({ type: "execution", ...data }),
            data.signal_id,
            data,
        );
    }

    logClose(data: {
        symbol: string;
        exitPrice: number;
        exitTimestamp: number;
        profitPercent: number;
        closeReason: string;
        entry?: number;
        signal_id?: string;
    }): void {
        this.logTradeEntry({
            type: "close",
            level: "info",
            signal_id: data.signal_id,
            ...data,
        });
        this.info(
            this.generateTradeMessage({ type: "close", ...data }),
            data.signal_id,
            data,
        );
    }

    // Rotation Logic (Scavenger)
    private checkRotation(): void {
        if (!this.config.tradeLogPath) return;
        try {
            const stats = fs.statSync(this.config.tradeLogPath);
            if (stats.size > this.maxLogSize) {
                this.rotateLog();
            }
            this.compressOldLogs().catch((err) => {
                console.error("Failed to compress old logs:", err);
            });
        } catch (error) {
            // ignore
        }
    }

    private rotateLog(): void {
        if (!this.config.tradeLogPath) return;
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const rotatedPath = this.config.tradeLogPath.replace(
                ".jsonl",
                `-${timestamp}.jsonl`,
            );
            fs.renameSync(this.config.tradeLogPath, rotatedPath);
            fs.writeFileSync(this.config.tradeLogPath, "");
            console.log(`Log rotated: ${rotatedPath}`);
        } catch (error) {
            console.error("Failed to rotate log:", error);
        }
    }

    private async compressOldLogs(): Promise<void> {
        if (!this.config.tradeLogPath) return;
        try {
            const logDir = path.dirname(this.config.tradeLogPath);
            const files = fs.readdirSync(logDir);
            const now = Date.now();

            for (const file of files) {
                if (file === path.basename(this.config.tradeLogPath)) continue;
                if (!file.endsWith(".jsonl") || file.endsWith(".jsonl.gz")) {
                    continue;
                }

                const filePath = path.join(logDir, file);
                if (!fs.existsSync(filePath)) continue;

                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > this.maxLogAge) {
                    const content = fs.readFileSync(filePath);
                    const compressed = await gzip(content);
                    fs.writeFileSync(filePath + ".gz", compressed);
                    fs.unlinkSync(filePath);
                }
            }
        } catch (error) {
            console.error("Failed to compress old logs:", error);
        }
    }

    // Helpers
    queryLogs(filter?: (entry: TradeLogEntry) => boolean): TradeLogEntry[] {
        if (
            !this.config.tradeLogPath ||
            !fs.existsSync(this.config.tradeLogPath)
        ) return [];
        try {
            const content = fs.readFileSync(this.config.tradeLogPath, "utf-8");
            const lines = content.split("\n").filter((line) => line.trim());
            const entries: TradeLogEntry[] = lines.map((line) =>
                JSON.parse(line)
            );
            if (filter) return entries.filter(filter);
            return entries;
        } catch (error) {
            return [];
        }
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
