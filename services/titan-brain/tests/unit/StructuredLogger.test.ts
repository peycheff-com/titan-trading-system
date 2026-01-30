/**
 * StructuredLogger Unit Tests
 *
 * Tests for JSON structured logging with correlation IDs
 */

// Define mock values before importing anything
const mockSharedLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    setConfig: jest.fn(),
};

// Mock @titan/shared before importing StructuredLogger
jest.mock("@titan/shared", () => {
    // SharedLogLevel values must be inline for hoisting
    const LogLevelEnum = {
        DEBUG: 0,
        INFO: 1,
        WARN: 2,
        ERROR: 3,
    };
    return {
        Logger: {
            getInstance: jest.fn(() => ({
                debug: jest.fn(),
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                setConfig: jest.fn(),
                setLogLevel: jest.fn(),
            })),
        },
        LogLevel: LogLevelEnum,
        SharedLogLevel: LogLevelEnum,
    };
});

import {
    LogLevel,
    StructuredLogger,
} from "../../src/monitoring/StructuredLogger.js";

describe("StructuredLogger", () => {
    let logger: StructuredLogger;

    beforeEach(() => {
        jest.clearAllMocks();
        logger = new StructuredLogger({ level: 1, component: "test" });
    });

    describe("constructor", () => {
        it("should create logger with default config", () => {
            const defaultLogger = new StructuredLogger();
            expect(defaultLogger).toBeDefined();
        });

        it("should create logger with custom config", () => {
            const customLogger = new StructuredLogger({
                level: 0,
                component: "custom",
                sanitizeSensitive: true,
            });
            expect(customLogger).toBeDefined();
        });
    });

    describe("correlation ID management", () => {
        it("should generate correlation ID", () => {
            const id = logger.generateCorrelationId();
            expect(id).toBeDefined();
            expect(typeof id).toBe("string");
            expect(id.length).toBeGreaterThan(0);
        });

        it("should set and get correlation ID", () => {
            logger.setCorrelationId("test-correlation-123");
            expect(logger.getCorrelationId()).toBe("test-correlation-123");
        });

        it("should clear correlation ID when set to null", () => {
            logger.setCorrelationId("test-id");
            expect(logger.getCorrelationId()).toBe("test-id");
            logger.setCorrelationId(null);
            expect(logger.getCorrelationId()).toBeNull();
        });

        it("should run async function with correlation ID context", async () => {
            const result = await logger.withCorrelationId(
                "async-id",
                async () => {
                    expect(logger.getCorrelationId()).toBe("async-id");
                    return "success";
                },
            );
            expect(result).toBe("success");
        });
    });

    describe("logging methods", () => {
        it("should log debug messages", () => {
            expect(() => logger.debug("Debug message", { key: "value" })).not
                .toThrow();
        });

        it("should log info messages", () => {
            expect(() => logger.info("Info message", { key: "value" })).not
                .toThrow();
        });

        it("should log warn messages", () => {
            expect(() => logger.warn("Warning message", { key: "value" })).not
                .toThrow();
        });

        it("should log error messages with Error object", () => {
            const error = new Error("Test error");
            expect(() =>
                logger.error("Error occurred", error, { key: "value" })
            ).not.toThrow();
        });

        it("should log error messages without Error object", () => {
            expect(() => logger.error("Error occurred")).not.toThrow();
        });
    });

    describe("domain-specific logging methods", () => {
        it("should log signal processing events", () => {
            expect(() =>
                logger.logSignalProcessing(
                    "signal-123",
                    "phase-1",
                    true,
                    "Signal approved by risk check",
                    { symbol: "BTCUSDT" },
                )
            ).not.toThrow();
        });

        it("should log rejected signal processing events", () => {
            expect(() =>
                logger.logSignalProcessing(
                    "signal-456",
                    "phase-2",
                    false,
                    "Signal rejected due to risk limits",
                )
            ).not.toThrow();
        });

        it("should log allocation changes", () => {
            expect(() =>
                logger.logAllocationChange(
                    { w1: 0.4, w2: 0.3, w3: 0.3 },
                    { w1: 0.5, w2: 0.25, w3: 0.25 },
                    "Performance adjustment",
                    { trigger: "sharpe_ratio" },
                )
            ).not.toThrow();
        });

        it("should log successful sweep operations", () => {
            expect(() =>
                logger.logSweepOperation(
                    1000,
                    "hot-wallet",
                    "cold-wallet",
                    "Weekly sweep",
                    true,
                    { txId: "tx-123" },
                )
            ).not.toThrow();
        });

        it("should log failed sweep operations", () => {
            expect(() =>
                logger.logSweepOperation(
                    500,
                    "hot-wallet",
                    "cold-wallet",
                    "Emergency sweep failed",
                    false,
                )
            ).not.toThrow();
        });

        it("should log circuit breaker trigger events", () => {
            expect(() =>
                logger.logCircuitBreakerEvent(
                    "TRIGGER",
                    "Max drawdown exceeded",
                    95000,
                    "operator-123",
                    { drawdown: 0.15 },
                )
            ).not.toThrow();
        });

        it("should log circuit breaker reset events", () => {
            expect(() =>
                logger.logCircuitBreakerEvent(
                    "RESET",
                    "Manual reset by operator",
                    100000,
                    "operator-456",
                )
            ).not.toThrow();
        });

        it("should log performance updates", () => {
            expect(() =>
                logger.logPerformanceUpdate(
                    "phase-1",
                    1.5,
                    0.8,
                    100,
                    { winRate: 0.55 },
                )
            ).not.toThrow();
        });

        it("should log risk decisions", () => {
            expect(() =>
                logger.logRiskDecision(
                    "signal-789",
                    true,
                    "Within risk limits",
                    { maxDrawdown: 0.1, currentExposure: 0.05 },
                    { symbol: "ETHUSDT" },
                )
            ).not.toThrow();
        });

        it("should log rejected risk decisions", () => {
            expect(() =>
                logger.logRiskDecision(
                    "signal-999",
                    false,
                    "Exceeds max position size",
                    { maxPositionSize: 10000, requestedSize: 15000 },
                )
            ).not.toThrow();
        });
    });

    describe("backward compatibility", () => {
        it("should support addHandler (deprecated)", () => {
            const handler = jest.fn();
            expect(() => logger.addHandler(handler)).not.toThrow();
        });

        it("should support removeHandler (deprecated)", () => {
            const handler = jest.fn();
            expect(() => logger.removeHandler(handler)).not.toThrow();
        });

        it("should support setLevel", () => {
            expect(() => logger.setLevel("debug" as LogLevel)).not.toThrow();
        });
    });
});
