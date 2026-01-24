/**
 * Logger Unit Tests
 *
 * Tests for JSONL logging with rotation and compression
 */

import { LogEntry, Logger } from "../../src/logging/Logger";
import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { promisify } from "util";

const gunzip = promisify(zlib.gunzip);

describe("Logger", () => {
  let logger: Logger;
  let testLogDir: string;
  let testLogPath: string;

  beforeEach(() => {
    // Create temporary test directory
    testLogDir = path.join(process.cwd(), "test-logs-" + Date.now());
    fs.mkdirSync(testLogDir, { recursive: true });

    // Initialize logger with test directory
    logger = new Logger(testLogDir);
    testLogPath = path.join(testLogDir, "trades.jsonl");

    // Silence console output during tests
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testLogDir)) {
      const files = fs.readdirSync(testLogDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testLogDir, file));
      }
      fs.rmdirSync(testLogDir);
    }
    jest.restoreAllMocks();
  });

  describe("Initialization", () => {
    test("should create log directory if it does not exist", () => {
      expect(fs.existsSync(testLogDir)).toBe(true);
    });

    test("should create log file if it does not exist", () => {
      expect(fs.existsSync(testLogPath)).toBe(true);
    });
  });

  describe("log()", () => {
    test("should append log entry to trades.jsonl", () => {
      const entry: LogEntry = {
        timestamp: Date.now(),
        service: "scavenger",
        level: "info",
        message: "Signal generated",
        type: "signal",
        symbol: "BTCUSDT",
        trapType: "LIQUIDATION",
        direction: "LONG",
        entry: 50000,
        stop: 49500,
        target: 51500,
        confidence: 95,
        leverage: 20,
      };

      logger.log(entry);

      const content = fs.readFileSync(testLogPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      expect(lines.length).toBe(1);

      const parsed = JSON.parse(lines[0]);
      expect(parsed.symbol).toBe("BTCUSDT");
      expect(parsed.trapType).toBe("LIQUIDATION");
      expect(parsed.confidence).toBe(95);
    });

    test("should append multiple entries without overwriting", () => {
      logger.log({
        timestamp: Date.now(),
        type: "signal",
        symbol: "BTCUSDT",
        trapType: "LIQUIDATION",
      });

      logger.log({
        timestamp: Date.now(),
        type: "execution",
        symbol: "ETHUSDT",
        trapType: "DAILY_LEVEL",
      });

      const content = fs.readFileSync(testLogPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      expect(lines.length).toBe(2);

      const first = JSON.parse(lines[0]);
      const second = JSON.parse(lines[1]);

      expect(first.symbol).toBe("BTCUSDT");
      expect(second.symbol).toBe("ETHUSDT");
    });
  });

  describe("logSignal()", () => {
    test("should log signal with all trap details", () => {
      logger.logSignal({
        symbol: "BTCUSDT",
        trapType: "OI_WIPEOUT",
        direction: "LONG",
        entry: 50000,
        stop: 49500,
        target: 51500,
        confidence: 95,
        leverage: 20,
        orderType: "MARKET",
        velocity: 0.006,
        positionSize: 0.1,
      });

      const content = fs.readFileSync(testLogPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      const parsed = JSON.parse(lines[0]);

      expect(parsed.type).toBe("signal");
      expect(parsed.symbol).toBe("BTCUSDT");
      expect(parsed.trapType).toBe("OI_WIPEOUT");
      expect(parsed.direction).toBe("LONG");
      expect(parsed.entry).toBe(50000);
      expect(parsed.stop).toBe(49500);
      expect(parsed.target).toBe(51500);
      expect(parsed.confidence).toBe(95);
      expect(parsed.leverage).toBe(20);
      expect(parsed.orderType).toBe("MARKET");
      expect(parsed.velocity).toBe(0.006);
      expect(parsed.positionSize).toBe(0.1);
      expect(parsed.timestamp).toBeDefined();
    });
  });

  describe("logExecution()", () => {
    test("should log execution with fill prices", () => {
      const fillTimestamp = Date.now();

      logger.logExecution({
        symbol: "ETHUSDT",
        trapType: "FUNDING_SQUEEZE",
        direction: "SHORT",
        fillPrice: 3000,
        fillTimestamp,
        orderType: "LIMIT",
        positionSize: 0.5,
        leverage: 15,
      });

      const content = fs.readFileSync(testLogPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      const parsed = JSON.parse(lines[0]);

      expect(parsed.type).toBe("execution");
      expect(parsed.symbol).toBe("ETHUSDT");
      expect(parsed.fillPrice).toBe(3000);
      expect(parsed.fillTimestamp).toBe(fillTimestamp);
      expect(parsed.orderType).toBe("LIMIT");
      expect(parsed.positionSize).toBe(0.5);
      expect(parsed.leverage).toBe(15);
    });
  });

  describe("logClose()", () => {
    test("should log position close with profit", () => {
      const exitTimestamp = Date.now();

      logger.logClose({
        symbol: "BTCUSDT",
        exitPrice: 51500,
        exitTimestamp,
        profitPercent: 3.0,
        closeReason: "TARGET_HIT",
        entry: 50000,
      });

      const content = fs.readFileSync(testLogPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      const parsed = JSON.parse(lines[0]);

      expect(parsed.type).toBe("close");
      expect(parsed.symbol).toBe("BTCUSDT");
      expect(parsed.exitPrice).toBe(51500);
      expect(parsed.exitTimestamp).toBe(exitTimestamp);
      expect(parsed.profitPercent).toBe(3.0);
      expect(parsed.closeReason).toBe("TARGET_HIT");
      expect(parsed.entry).toBe(50000);
    });
  });

  describe("logError()", () => {
    test("should log error with context", () => {
      const error = new Error("Order placement failed");
      const context = { symbol: "BTCUSDT", orderType: "MARKET" };

      logger.logError(error, context);

      const content = fs.readFileSync(testLogPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      const parsed = JSON.parse(lines[0]);

      expect(parsed.type).toBe("error");
      expect(parsed.symbol).toBe("BTCUSDT");
      expect(parsed.error).toBe("Order placement failed");
      expect(parsed.errorStack).toBeDefined();
      expect(parsed.context).toEqual(context);
    });

    test("should log string error", () => {
      logger.logError("Connection timeout", { exchange: "Bybit" });

      const content = fs.readFileSync(testLogPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      const parsed = JSON.parse(lines[0]);

      expect(parsed.type).toBe("error");
      expect(parsed.error).toBe("Connection timeout");
      expect(parsed.errorStack).toBeUndefined();
      expect(parsed.context.exchange).toBe("Bybit");
    });

    test("should default symbol to SYSTEM if not in context", () => {
      logger.logError("System error");

      const content = fs.readFileSync(testLogPath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());
      const parsed = JSON.parse(lines[0]);

      expect(parsed.symbol).toBe("SYSTEM");
    });
  });

  describe("Log Rotation", () => {
    test("should rotate log when size exceeds 10MB", () => {
      // Create a large log entry (approximately 1KB)
      const largeEntry: LogEntry = {
        timestamp: Date.now(),
        service: "scavenger",
        level: "info",
        message: "Large signal entry",
        type: "signal",
        symbol: "BTCUSDT",
        trapType: "LIQUIDATION",
        padding: "x".repeat(2000), // Ensure each entry is > 2KB to trigger rotation with fewer writes
      };

      // Write enough entries to exceed 10MB
      // Each entry is ~1100 bytes, so we need ~9500 entries to exceed 10MB
      const entriesNeeded = 9600;

      for (let i = 0; i < entriesNeeded; i++) {
        logger.log({ ...largeEntry, timestamp: Date.now() + i });
      }

      // Check that rotation occurred
      const files = fs.readdirSync(testLogDir);
      const rotatedFiles = files.filter((f) =>
        f.startsWith("trades-") && f.endsWith(".jsonl")
      );

      expect(rotatedFiles.length).toBeGreaterThan(0);

      // Current log should exist and be smaller than max size
      expect(fs.existsSync(testLogPath)).toBe(true);
      const currentStats = fs.statSync(testLogPath);
      expect(currentStats.size).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe("Log Compression", () => {
    test("should compress logs older than 30 days", async () => {
      // Create an old log file
      const oldLogPath = path.join(
        testLogDir,
        "trades-2024-01-01T00-00-00-000Z.jsonl",
      );
      fs.writeFileSync(oldLogPath, JSON.stringify({ test: "data" }) + "\n");

      // Set file modification time to 31 days ago
      const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      fs.utimesSync(oldLogPath, oldDate, oldDate);

      // Trigger compression by logging (which calls checkRotation)
      logger.log({
        timestamp: Date.now(),
        type: "signal",
        symbol: "BTCUSDT",
      });

      // Wait for async compression
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that compressed file exists
      const gzipPath = oldLogPath + ".gz";
      expect(fs.existsSync(gzipPath)).toBe(true);

      // Check that original file was deleted
      expect(fs.existsSync(oldLogPath)).toBe(false);

      // Verify compressed content
      const compressed = fs.readFileSync(gzipPath);
      const decompressed = await gunzip(compressed);
      const content = decompressed.toString("utf-8");

      expect(content).toContain("test");
      expect(content).toContain("data");
    });

    test("should not compress logs younger than 30 days", async () => {
      // Create a recent log file
      const recentLogPath = path.join(testLogDir, "trades-recent.jsonl");
      fs.writeFileSync(recentLogPath, JSON.stringify({ test: "data" }) + "\n");

      // Trigger compression check
      logger.log({
        timestamp: Date.now(),
        type: "signal",
        symbol: "BTCUSDT",
      });

      // Wait for async compression
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check that file was not compressed
      expect(fs.existsSync(recentLogPath)).toBe(true);
      expect(fs.existsSync(recentLogPath + ".gz")).toBe(false);
    });
  });

  describe("queryLogs()", () => {
    test("should return all log entries", () => {
      logger.log({ timestamp: Date.now(), type: "signal", symbol: "BTCUSDT" });
      logger.log({
        timestamp: Date.now(),
        type: "execution",
        symbol: "ETHUSDT",
      });
      logger.log({ timestamp: Date.now(), type: "close", symbol: "BTCUSDT" });

      const entries = logger.queryLogs();

      expect(entries.length).toBe(3);
      expect(entries[0].symbol).toBe("BTCUSDT");
      expect(entries[1].symbol).toBe("ETHUSDT");
      expect(entries[2].symbol).toBe("BTCUSDT");
    });

    test("should filter log entries", () => {
      logger.log({
        timestamp: Date.now(),
        type: "signal",
        symbol: "BTCUSDT",
        trapType: "LIQUIDATION",
      });
      logger.log({
        timestamp: Date.now(),
        type: "signal",
        symbol: "ETHUSDT",
        trapType: "DAILY_LEVEL",
      });
      logger.log({
        timestamp: Date.now(),
        type: "execution",
        symbol: "BTCUSDT",
      });

      const signals = logger.queryLogs((entry) => entry.type === "signal");

      expect(signals.length).toBe(2);
      expect(signals.every((e) => e.type === "signal")).toBe(true);
    });

    test("should filter by trap type", () => {
      logger.log({
        timestamp: Date.now(),
        type: "signal",
        symbol: "BTCUSDT",
        trapType: "LIQUIDATION",
      });
      logger.log({
        timestamp: Date.now(),
        type: "signal",
        symbol: "ETHUSDT",
        trapType: "LIQUIDATION",
      });
      logger.log({
        timestamp: Date.now(),
        type: "signal",
        symbol: "SOLUSDT",
        trapType: "DAILY_LEVEL",
      });

      const liquidations = logger.queryLogs((entry) =>
        entry.trapType === "LIQUIDATION"
      );

      expect(liquidations.length).toBe(2);
      expect(liquidations.every((e) => e.trapType === "LIQUIDATION")).toBe(
        true,
      );
    });
  });
});
