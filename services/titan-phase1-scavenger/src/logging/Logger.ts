/**
 * Logger - Scavenger Wrapper
 *
 * Logs signals and executions to JSONL format using usage of Shared Logger.
 *
 * Requirements: 11.1-11.7 (Signal Execution Logging)
 */

import {
  Logger as SharedLogger,
  LoggerConfig,
  SharedLogLevel,
  TradeLogEntry,
} from "@titan/shared";
import * as path from "path";

// Re-export types for compatibility
export type LogEntry = TradeLogEntry;

export class Logger extends SharedLogger {
  constructor(logDir?: string) {
    // Determine configuration based on legacy logDir argument
    const homeDir = process.env.HOME || process.env.USERPROFILE || ".";
    const defaultLogDir = path.join(homeDir, ".titan-scanner", "logs");
    const finalLogDir = logDir || defaultLogDir;
    const tradeLogPath = path.join(finalLogDir, "trades.jsonl");

    // Create a config that enables trade logging with the specified path
    const config: LoggerConfig = {
      level: SharedLogLevel.INFO,
      component: "scavenger",
      enableConsole: true,
      enableFile: false, // Scavenger focused on trade logs primarily in this class
      enablePerformanceLogging: true,
      sensitiveFields: [],
      maxStackTraceLines: 10,
      enableTradeLogging: true,
      tradeLogPath: tradeLogPath,
    };

    super(config);
    console.log(`📝 Scavenger Logger initialized: ${tradeLogPath}`);
  }

  /**
   * Log an entry to trades.jsonl
   * Compatibility wrapper for legacy .log() method
   */
  log(entry: Partial<LogEntry>): void {
    this.logTradeEntry(entry);
  }

  /**
   * Log an error with context
   * Compatibility wrapper for Scavenger's logError
   */
  logError(error: Error | string, context?: any): void {
    const errorMsg = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Log to trade log
    this.logTradeEntry({
      type: "error",
      level: "error",
      symbol: context?.symbol || "SYSTEM",
      error: errorMsg,
      errorStack: errorStack,
      signal_id: context?.signal_id,
      context,
    });

    // Also log to structured error log
    this.error(
      errorMsg,
      error instanceof Error ? error : undefined,
      context?.signal_id,
      context,
    );
  }
}
