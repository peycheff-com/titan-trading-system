/**
 * Unit tests for Logger
 *
 * Tests the unified shared logger including structured logging,
 * trade logging, performance timers, and sensitive data masking.
 */

import {
    Logger,
    type LoggerConfig,
    LogLevel,
    type TradeLogEntry,
} from "../../../src/logger/Logger";

describe("Logger", () => {
    let logger: Logger;
    let consoleSpy: {
        debug: jest.SpyInstance;
        info: jest.SpyInstance;
        warn: jest.SpyInstance;
        error: jest.SpyInstance;
        log: jest.SpyInstance;
    };

    const createTestConfig = (
        overrides: Partial<LoggerConfig> = {},
    ): LoggerConfig => ({
        level: LogLevel.DEBUG,
        component: "test-component",
        enableConsole: true,
        enableFile: false,
        enablePerformanceLogging: true,
        sensitiveFields: [
            "password",
            "secret",
            "token",
            "key",
            "authorization",
        ],
        maxStackTraceLines: 5,
        enableTradeLogging: false,
        ...overrides,
    });

    beforeEach(() => {
        logger = new Logger(createTestConfig());
        consoleSpy = {
            debug: jest.spyOn(console, "debug").mockImplementation(),
            info: jest.spyOn(console, "info").mockImplementation(),
            warn: jest.spyOn(console, "warn").mockImplementation(),
            error: jest.spyOn(console, "error").mockImplementation(),
            log: jest.spyOn(console, "log").mockImplementation(),
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("LogLevel Enum", () => {
        it("should have correct severity order", () => {
            expect(LogLevel.DEBUG).toBeLessThan(LogLevel.INFO);
            expect(LogLevel.INFO).toBeLessThan(LogLevel.WARN);
            expect(LogLevel.WARN).toBeLessThan(LogLevel.ERROR);
            expect(LogLevel.ERROR).toBeLessThan(LogLevel.FATAL);
        });

        it("should have all expected levels", () => {
            expect(LogLevel.DEBUG).toBe(0);
            expect(LogLevel.INFO).toBe(1);
            expect(LogLevel.WARN).toBe(2);
            expect(LogLevel.ERROR).toBe(3);
            expect(LogLevel.FATAL).toBe(4);
        });
    });

    describe("Basic Logging Methods", () => {
        it("should log debug messages", () => {
            logger.debug("Debug message");

            expect(consoleSpy.debug).toHaveBeenCalled();
            const logOutput = consoleSpy.debug.mock.calls[0][0];
            expect(logOutput).toContain("Debug message");
            expect(logOutput).toContain("DEBUG");
        });

        it("should log info messages", () => {
            logger.info("Info message");

            expect(consoleSpy.info).toHaveBeenCalled();
            const logOutput = consoleSpy.info.mock.calls[0][0];
            expect(logOutput).toContain("Info message");
            expect(logOutput).toContain("INFO");
        });

        it("should log warn messages", () => {
            logger.warn("Warning message");

            expect(consoleSpy.warn).toHaveBeenCalled();
            const logOutput = consoleSpy.warn.mock.calls[0][0];
            expect(logOutput).toContain("Warning message");
            expect(logOutput).toContain("WARN");
        });

        it("should log error messages", () => {
            logger.error("Error message");

            expect(consoleSpy.error).toHaveBeenCalled();
            const logOutput = consoleSpy.error.mock.calls[0][0];
            expect(logOutput).toContain("Error message");
            expect(logOutput).toContain("ERROR");
        });

        it("should log fatal messages", () => {
            logger.fatal("Fatal message");

            expect(consoleSpy.error).toHaveBeenCalled();
            const logOutput = consoleSpy.error.mock.calls[0][0];
            expect(logOutput).toContain("Fatal message");
            expect(logOutput).toContain("FATAL");
        });

        it("should include component in log output", () => {
            logger.info("Test message");

            const logOutput = consoleSpy.info.mock.calls[0][0];
            expect(logOutput).toContain("test-component");
        });

        it("should include timestamp in log output", () => {
            logger.info("Test message");

            const logOutput = consoleSpy.info.mock.calls[0][0];
            const parsed = JSON.parse(logOutput);
            expect(parsed.timestamp).toMatch(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
            );
        });
    });

    describe("Log Level Filtering", () => {
        it("should filter debug when level is INFO", () => {
            logger = new Logger(createTestConfig({ level: LogLevel.INFO }));
            logger.debug("Should not appear");

            expect(consoleSpy.debug).not.toHaveBeenCalled();
        });

        it("should log info when level is INFO", () => {
            logger = new Logger(createTestConfig({ level: LogLevel.INFO }));
            logger.info("Should appear");

            expect(consoleSpy.info).toHaveBeenCalled();
        });

        it("should filter info and debug when level is WARN", () => {
            logger = new Logger(createTestConfig({ level: LogLevel.WARN }));
            logger.debug("Debug");
            logger.info("Info");
            logger.warn("Warn");

            expect(consoleSpy.debug).not.toHaveBeenCalled();
            expect(consoleSpy.info).not.toHaveBeenCalled();
            expect(consoleSpy.warn).toHaveBeenCalled();
        });

        it("should only log fatal when level is FATAL", () => {
            logger = new Logger(createTestConfig({ level: LogLevel.FATAL }));
            logger.debug("Debug");
            logger.info("Info");
            logger.warn("Warn");
            logger.error("Error");
            logger.fatal("Fatal");

            expect(consoleSpy.debug).not.toHaveBeenCalled();
            expect(consoleSpy.info).not.toHaveBeenCalled();
            expect(consoleSpy.warn).not.toHaveBeenCalled();
            // error logging path is shared for ERROR and FATAL
            expect(consoleSpy.error).toHaveBeenCalledTimes(1);
        });
    });

    describe("Correlation IDs", () => {
        it("should include correlation ID in log output", () => {
            logger.info("Test message", "corr-123");

            const logOutput = consoleSpy.info.mock.calls[0][0];
            const parsed = JSON.parse(logOutput);
            expect(parsed.correlationId).toBe("corr-123");
        });

        it("should generate unique correlation IDs", () => {
            const id1 = Logger.generateCorrelationId();
            const id2 = Logger.generateCorrelationId();

            expect(id1).not.toBe(id2);
            expect(id1).toMatch(/^[0-9a-f-]{36}$/); // UUID format
        });
    });

    describe("Metadata Handling", () => {
        it("should include metadata in log output", () => {
            logger.info("Test message", undefined, {
                name: "value",
                count: 42,
            });

            const logOutput = consoleSpy.info.mock.calls[0][0];
            const parsed = JSON.parse(logOutput);
            expect(parsed.metadata.name).toBe("value");
            expect(parsed.metadata.count).toBe(42);
        });
    });

    describe("Sensitive Data Masking", () => {
        it("should mask password fields", () => {
            logger.info("Test", undefined, { password: "secret123" });

            const logOutput = consoleSpy.info.mock.calls[0][0];
            const parsed = JSON.parse(logOutput);
            expect(parsed.metadata.password).toBe("[MASKED]");
        });

        it("should mask secret fields", () => {
            logger.info("Test", undefined, { apiSecret: "my-secret-key" });

            const logOutput = consoleSpy.info.mock.calls[0][0];
            const parsed = JSON.parse(logOutput);
            expect(parsed.metadata.apiSecret).toBe("[MASKED]");
        });

        it("should mask token fields", () => {
            logger.info("Test", undefined, { accessToken: "bearer-token-123" });

            const logOutput = consoleSpy.info.mock.calls[0][0];
            const parsed = JSON.parse(logOutput);
            expect(parsed.metadata.accessToken).toBe("[MASKED]");
        });

        it("should mask nested sensitive fields", () => {
            logger.info("Test", undefined, {
                config: {
                    apiKey: "key-123",
                    endpoint: "https://api.example.com",
                },
            });

            const logOutput = consoleSpy.info.mock.calls[0][0];
            const parsed = JSON.parse(logOutput);
            expect(parsed.metadata.config.apiKey).toBe("[MASKED]");
            expect(parsed.metadata.config.endpoint).toBe(
                "https://api.example.com",
            );
        });

        it("should not mask non-sensitive fields", () => {
            logger.info("Test", undefined, { username: "john", count: 5 });

            const logOutput = consoleSpy.info.mock.calls[0][0];
            const parsed = JSON.parse(logOutput);
            expect(parsed.metadata.username).toBe("john");
            expect(parsed.metadata.count).toBe(5);
        });
    });

    describe("Error Logging", () => {
        it("should include error details", () => {
            const error = new Error("Something went wrong");
            logger.error("Error occurred", error);

            const logOutput = consoleSpy.error.mock.calls[0][0];
            const parsed = JSON.parse(logOutput);
            expect(parsed.error.name).toBe("Error");
            expect(parsed.error.message).toBe("Something went wrong");
            expect(parsed.error.stack).toBeDefined();
        });

        it("should limit stack trace lines", () => {
            const error = new Error("Test error");
            logger.error("Error", error);

            const logOutput = consoleSpy.error.mock.calls[0][0];
            const parsed = JSON.parse(logOutput);
            const stackLines = parsed.error.stack.split("\n");
            expect(stackLines.length).toBeLessThanOrEqual(5);
        });
    });

    describe("Performance Timers", () => {
        it("should start and end a timer", () => {
            const timerId = logger.startTimer("operation1");
            const duration = logger.endTimer(timerId);

            expect(duration).toBeGreaterThanOrEqual(0);
        });

        it("should return null for unknown timer", () => {
            const duration = logger.endTimer("unknown-timer");
            expect(duration).toBeNull();
        });

        it("should track active timers", () => {
            expect(logger.getActiveTimerCount()).toBe(0);

            const timer1 = logger.startTimer("op1");
            expect(logger.getActiveTimerCount()).toBe(1);

            const timer2 = logger.startTimer("op2");
            expect(logger.getActiveTimerCount()).toBe(2);

            logger.endTimer(timer1);
            expect(logger.getActiveTimerCount()).toBe(1);

            logger.endTimer(timer2);
            expect(logger.getActiveTimerCount()).toBe(0);
        });

        it("should clear all timers", () => {
            logger.startTimer("op1");
            logger.startTimer("op2");
            expect(logger.getActiveTimerCount()).toBe(2);

            logger.clearTimers();
            expect(logger.getActiveTimerCount()).toBe(0);
        });
    });

    describe("HTTP Request Logging", () => {
        it("should log successful HTTP requests", () => {
            logger.logHttpRequest("GET", "/api/data", 200, 150);

            expect(consoleSpy.info).toHaveBeenCalled();
            const logOutput = consoleSpy.info.mock.calls[0][0];
            expect(logOutput).toContain("GET");
            expect(logOutput).toContain("/api/data");
            expect(logOutput).toContain("200");
        });

        it("should log failed HTTP requests as warnings", () => {
            logger.logHttpRequest("POST", "/api/error", 500, 50);

            expect(consoleSpy.warn).toHaveBeenCalled();
            const logOutput = consoleSpy.warn.mock.calls[0][0];
            expect(logOutput).toContain("500");
        });
    });

    describe("Security Event Logging", () => {
        it("should log critical security events as fatal", () => {
            logger.logSecurityEvent("Unauthorized access attempt", "critical");

            expect(consoleSpy.error).toHaveBeenCalled();
            const logOutput = consoleSpy.error.mock.calls[0][0];
            expect(logOutput).toContain("Unauthorized access attempt");
            expect(logOutput).toContain("FATAL");
        });

        it("should log high security events as error", () => {
            logger.logSecurityEvent("Rate limit exceeded", "high");

            expect(consoleSpy.error).toHaveBeenCalled();
            const logOutput = consoleSpy.error.mock.calls[0][0];
            expect(logOutput).toContain("ERROR");
        });

        it("should log medium security events as warning", () => {
            logger.logSecurityEvent("Suspicious activity", "medium");

            expect(consoleSpy.warn).toHaveBeenCalled();
        });

        it("should log low security events as info", () => {
            logger.logSecurityEvent("Login attempt", "low");

            expect(consoleSpy.info).toHaveBeenCalled();
        });
    });

    describe("Configuration", () => {
        it("should return current configuration", () => {
            const config = logger.getConfig();

            expect(config.component).toBe("test-component");
            expect(config.level).toBe(LogLevel.DEBUG);
        });

        it("should update log level", () => {
            logger.setLogLevel(LogLevel.ERROR);
            const config = logger.getConfig();

            expect(config.level).toBe(LogLevel.ERROR);
        });

        it("should disable console output", () => {
            logger = new Logger(createTestConfig({ enableConsole: false }));
            logger.info("Test message");

            expect(consoleSpy.info).not.toHaveBeenCalled();
        });
    });

    describe("Static Methods", () => {
        it("should create config from environment", () => {
            const config = Logger.createConfigFromEnv("test-service");

            expect(config.component).toBe("test-service");
            expect(config.sensitiveFields).toContain("password");
            expect(config.sensitiveFields).toContain("secret");
        });
    });

    describe("Trade Message Generation", () => {
        it("should generate signal messages correctly", () => {
            const signalData = {
                symbol: "BTCUSDT",
                trapType: "LIQUIDITY",
                direction: "LONG",
                entry: 40000,
                stop: 39500,
                target: 41000,
                confidence: 0.85,
                leverage: 5,
            };

            logger.logSignal(signalData);

            expect(consoleSpy.info).toHaveBeenCalled();
            const logOutput = consoleSpy.info.mock.calls[0][0];
            expect(logOutput).toContain("BTCUSDT");
            expect(logOutput).toContain("LIQUIDITY");
        });

        it("should generate execution messages correctly", () => {
            const executionData = {
                symbol: "ETHUSDT",
                trapType: "MOMENTUM",
                direction: "SHORT",
                fillPrice: 2500,
                fillTimestamp: Date.now(),
                orderType: "MARKET",
                positionSize: 1.5,
                leverage: 3,
            };

            logger.logExecution(executionData);

            expect(consoleSpy.info).toHaveBeenCalled();
        });

        it("should generate close messages correctly", () => {
            const closeData = {
                symbol: "BTCUSDT",
                exitPrice: 41000,
                exitTimestamp: Date.now(),
                profitPercent: 2.5,
                closeReason: "TARGET_HIT",
            };

            logger.logClose(closeData);

            expect(consoleSpy.info).toHaveBeenCalled();
        });
    });
});
