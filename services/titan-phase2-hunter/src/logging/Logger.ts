/**
 * Logger for Titan Phase 2 - The Hunter
 *
 * Implements JSONL (JSON Lines) logging for signals, executions, and errors
 * utilizing the @titan/shared Logger Core.
 *
 * Requirements: 16.1-16.7 (Signal Execution Logging)
 */

import * as path from "path";
import {
  Logger as SharedLogger,
  LoggerConfig as SharedLoggerConfig,
  SharedLogLevel,
} from "@titan/shared";
import {
  ExecutionData,
  HologramState,
  OrderResult,
  SessionType,
  SignalData,
} from "../types";

/**
 * Signal log entry structure
 */
export interface SignalLogEntry {
  timestamp: number;
  type: "signal";
  symbol: string;
  strategyType: "holographic";
  confidence: number;
  leverage: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  alignmentState: {
    status: string;
    score: number;
    daily: string;
    h4: string;
    m15: string;
  };
  rsScore: number;
  sessionType: SessionType;
  poiType: "FVG" | "ORDER_BLOCK" | "LIQUIDITY_POOL";
  cvdStatus: boolean;
  direction: "LONG" | "SHORT";
  positionSize: number;
}

/**
 * Execution log entry structure
 */
export interface ExecutionLogEntry {
  timestamp: number;
  type: "execution";
  signalId?: string;
  orderId: string;
  symbol: string;
  side: "Buy" | "Sell";
  qty: number;
  fillPrice: number;
  fillTimestamp: number;
  orderType: "MARKET" | "LIMIT" | "POST_ONLY";
  slippage: number;
  fees?: number;
}

/**
 * Position close log entry structure
 */
export interface CloseLogEntry {
  timestamp: number;
  type: "close";
  positionId: string;
  symbol: string;
  side: "LONG" | "SHORT";
  exitPrice: number;
  exitTimestamp: number;
  profitPercentage: number;
  closeReason:
    | "STOP_LOSS"
    | "TAKE_PROFIT"
    | "TRAILING_STOP"
    | "MANUAL"
    | "EMERGENCY";
  holdTime: number; // milliseconds
  entryPrice: number;
  rValue: number; // R multiple
}

/**
 * Error log entry structure
 */
export interface ErrorLogEntry {
  timestamp: number;
  type: "error";
  level: "WARNING" | "ERROR" | "CRITICAL";
  message: string;
  context: {
    symbol?: string;
    phase: "phase2";
    component?: string;
    function?: string;
    stack?: string;
    data?: any;
  };
}

export interface GenericLogEntry {
  timestamp: number;
  type: "info" | "debug" | "warn";
  message: string;
  data?: any;
}

/**
 * Enhanced Hologram log entry structure
 * Requirement 5.7: Enhanced logging and event emission
 */
export interface EnhancedHologramLogEntry {
  timestamp: number;
  type: "enhanced_hologram";
  symbol: string;
  classicScore: number;
  enhancedScore: number;
  alignment: "A+" | "A" | "B" | "C" | "VETO";
  convictionLevel: "low" | "medium" | "high" | "extreme";
  oracle: {
    sentiment: number;
    confidence: number;
    veto: boolean;
    convictionMultiplier: number;
  } | null;
  flow: {
    flowType: string;
    confidence: number;
    institutionalProbability: number;
  } | null;
  botTrap: {
    isSuspect: boolean;
    suspicionScore: number;
  } | null;
  globalCVD: {
    consensus: string;
    confidence: number;
    manipulationDetected: boolean;
  } | null;
  enhancementsActive: boolean;
}

/**
 * Conviction sizing log entry structure
 * Requirement 7.7: Position sizing calculation logging
 */
export interface ConvictionSizingLogEntry {
  timestamp: number;
  type: "conviction_sizing";
  symbol: string;
  baseSize: number;
  oracleMultiplier: number;
  flowMultiplier: number;
  trapReduction: number;
  globalCVDMultiplier: number;
  finalSize: number;
  cappedAt: number;
  reasoning: string[];
}

export type LogEntry =
  | SignalLogEntry
  | ExecutionLogEntry
  | CloseLogEntry
  | ErrorLogEntry
  | EnhancedHologramLogEntry
  | ConvictionSizingLogEntry
  | GenericLogEntry;

/**
 * Logger configuration
 */
export interface LoggerConfig {
  logDir: string;
  logFileName: string;
  maxFileSizeBytes: number; // 10MB default
  compressionAgeMs: number; // 30 days default
  enableConsoleOutput: boolean;
}

/**
 * JSONL Logger for Titan Phase 2
 *
 * Logs all signals, executions, and errors to trades.jsonl file
 * with automatic rotation and compression via @titan/shared.
 */
export class Logger extends SharedLogger {
  private localConfig: LoggerConfig; // Keep for backward compat access

  constructor(config?: Partial<LoggerConfig>) {
    // Determine configuration based on legacy arguments
    const logDir = config?.logDir || path.join(process.cwd(), "logs");
    const logFileName = config?.logFileName || "trades.jsonl";
    const tradeLogPath = path.join(logDir, logFileName);
    const enableConsole = config?.enableConsoleOutput ??
      (process.env.NODE_ENV !== "production");

    const sharedConfig: SharedLoggerConfig = {
      level: SharedLogLevel.INFO,
      component: "phase2-hunter",
      enableConsole: enableConsole,
      enableFile: false, // We mostly use tradeLogPath for JSONL
      enablePerformanceLogging: true,
      maxStackTraceLines: 10,
      enableTradeLogging: true,
      tradeLogPath: tradeLogPath,
      sensitiveFields: [], // Required by SharedLoggerConfig
    };

    super(sharedConfig);

    this.localConfig = {
      logDir,
      logFileName,
      maxFileSizeBytes: config?.maxFileSizeBytes || 10 * 1024 * 1024,
      compressionAgeMs: config?.compressionAgeMs || 30 * 24 * 3600 * 1000,
      enableConsoleOutput: enableConsole,
    };

    if (enableConsole) {
      console.log(`📝 Hunter Logger initialized: ${tradeLogPath}`);
    }
  }

  /**
   * Log a signal with comprehensive hologram state
   * Renamed to avoid name collision with SharedLogger.logSignal
   *
   * Requirement 16.2: Include timestamp, symbol, strategyType, etc.
   */
  public logPhase2Signal(
    signal: SignalData,
    hologramState: HologramState,
    sessionType: SessionType,
    poiType: "FVG" | "ORDER_BLOCK" | "LIQUIDITY_POOL",
    cvdConfirmation: boolean,
  ): void {
    const logEntry: SignalLogEntry = {
      timestamp: Date.now(),
      type: "signal",
      symbol: signal.symbol,
      strategyType: "holographic",
      confidence: signal.confidence,
      leverage: signal.leverage,
      entryPrice: signal.entryPrice,
      stopPrice: signal.stopLoss,
      targetPrice: signal.takeProfit,
      alignmentState: {
        status: hologramState.status,
        score: hologramState.alignmentScore,
        daily: `${hologramState.daily.trend}_${hologramState.daily.location}`,
        h4: `${hologramState.h4.trend}_${hologramState.h4.location}`,
        m15: `${hologramState.m15.trend}_${
          hologramState.m15.mss ? "MSS" : "NO_MSS"
        }`,
      },
      rsScore: hologramState.rsScore,
      sessionType,
      poiType,
      cvdStatus: cvdConfirmation,
      direction: signal.direction,
      positionSize: signal.positionSize,
    };

    this.logTradeEntry(logEntry as any);

    if (this.localConfig.enableConsoleOutput) {
      console.log(
        `📊 SIGNAL: ${signal.symbol} ${signal.direction} @ ${signal.entryPrice} (${hologramState.status}, RS:${
          hologramState.rsScore.toFixed(3)
        })`,
      );
    }
  }

  /**
   * Log order execution with fill details
   * Renamed to avoid name collision with SharedLogger.logExecution
   *
   * Requirement 16.3: Include fill price, fill timestamp, order type, and slippage
   */
  public logPhase2Execution(
    orderResult: OrderResult,
    slippage: number,
    signalId?: string,
    fees?: number,
  ): void {
    const logEntry: ExecutionLogEntry = {
      timestamp: Date.now(),
      type: "execution",
      signalId,
      orderId: orderResult.orderId,
      symbol: orderResult.symbol,
      side: orderResult.side,
      qty: orderResult.qty,
      fillPrice: orderResult.price,
      fillTimestamp: orderResult.timestamp,
      orderType: "LIMIT", // Phase 2 uses Post-Only Limit Orders
      slippage,
      fees,
    };

    this.logTradeEntry(logEntry as any);

    if (this.localConfig.enableConsoleOutput) {
      console.log(
        `✅ FILL: ${orderResult.symbol} ${orderResult.side} ${orderResult.qty} @ ${orderResult.price} (slippage: ${
          (slippage * 100).toFixed(3)
        }%)`,
      );
    }
  }

  /**
   * Log position close with P&L details
   *
   * Requirement 16.4: Include exit price, exit timestamp, profit percentage...
   */
  public logPhase2PositionClose(
    positionId: string,
    symbol: string,
    side: "LONG" | "SHORT",
    entryPrice: number,
    exitPrice: number,
    profitPercentage: number,
    closeReason:
      | "STOP_LOSS"
      | "TAKE_PROFIT"
      | "TRAILING_STOP"
      | "MANUAL"
      | "EMERGENCY",
    holdTime: number,
    rValue: number,
  ): void {
    const logEntry: CloseLogEntry = {
      timestamp: Date.now(),
      type: "close",
      positionId,
      symbol,
      side,
      exitPrice,
      exitTimestamp: Date.now(),
      profitPercentage,
      closeReason,
      holdTime,
      entryPrice,
      rValue,
    };

    this.logTradeEntry(logEntry as any);

    if (this.localConfig.enableConsoleOutput) {
      const pnlColor = profitPercentage >= 0 ? "\x1b[32m" : "\x1b[31m";
      console.log(
        `${pnlColor}💰 CLOSE: ${symbol} ${side} ${
          profitPercentage.toFixed(2)
        }% (${rValue.toFixed(2)}R) - ${closeReason}\x1b[0m`,
      );
    }
  }

  /**
   * Log error with context - Compatibility method
   */
  public logError(
    level: "WARNING" | "ERROR" | "CRITICAL",
    message: string,
    context: {
      symbol?: string;
      component?: string;
      function?: string;
      stack?: string;
      data?: any;
    } = {},
  ): void {
    this.logPhase2Error(level, message, context);
  }

  /**
   * Log error with context - Internal implementation
   */
  public logPhase2Error(
    level: "WARNING" | "ERROR" | "CRITICAL",
    message: string,
    context: {
      symbol?: string;
      component?: string;
      function?: string;
      stack?: string;
      data?: any;
    } = {},
  ): void {
    const logEntry: ErrorLogEntry = {
      timestamp: Date.now(),
      type: "error",
      level,
      message,
      context: {
        ...context,
        phase: "phase2",
      },
    };

    // Log to trade log for consistency
    this.logTradeEntry(logEntry as any);

    // Also use SharedLogger specific methods for standard error logging
    if (level === "CRITICAL" || level === "ERROR") {
      // error(message, error?, correlationId?, metadata?)
      this.error(message, new Error(message), undefined, context);
    } else {
      // warn(message, correlationId?, metadata?)
      this.warn(message, undefined, context);
    }
  }

  /**
   * Log enhanced holographic state
   */
  public logEnhancedHologram(
    symbol: string,
    state: {
      classicScore: number;
      enhancedScore: number;
      alignment: "A+" | "A" | "B" | "C" | "VETO";
      convictionLevel: "low" | "medium" | "high" | "extreme";
      oracleScore: {
        sentiment: number;
        confidence: number;
        veto: boolean;
        convictionMultiplier: number;
      } | null;
      flowValidation: {
        flowType: string;
        confidence: number;
        institutionalProbability: number;
      } | null;
      botTrapAnalysis: {
        isSuspect: boolean;
        suspicionScore: number;
      } | null;
      globalCVD: {
        consensus: string;
        confidence: number;
        manipulation: { detected: boolean };
      } | null;
      enhancementsActive: boolean;
    },
  ): void {
    const logEntry: EnhancedHologramLogEntry = {
      timestamp: Date.now(),
      type: "enhanced_hologram",
      symbol,
      classicScore: state.classicScore,
      enhancedScore: state.enhancedScore,
      alignment: state.alignment,
      convictionLevel: state.convictionLevel,
      oracle: state.oracleScore
        ? {
          sentiment: state.oracleScore.sentiment,
          confidence: state.oracleScore.confidence,
          veto: state.oracleScore.veto,
          convictionMultiplier: state.oracleScore.convictionMultiplier,
        }
        : null,
      flow: state.flowValidation
        ? {
          flowType: state.flowValidation.flowType,
          confidence: state.flowValidation.confidence,
          institutionalProbability:
            state.flowValidation.institutionalProbability,
        }
        : null,
      botTrap: state.botTrapAnalysis
        ? {
          isSuspect: state.botTrapAnalysis.isSuspect,
          suspicionScore: state.botTrapAnalysis.suspicionScore,
        }
        : null,
      globalCVD: state.globalCVD
        ? {
          consensus: state.globalCVD.consensus,
          confidence: state.globalCVD.confidence,
          manipulationDetected: state.globalCVD.manipulation.detected,
        }
        : null,
      enhancementsActive: state.enhancementsActive,
    };

    this.logTradeEntry(logEntry as any);

    if (this.localConfig.enableConsoleOutput) {
      console.log(
        `🔮 ENHANCED HOLOGRAM: ${symbol} ${state.alignment} (${
          state.enhancedScore.toFixed(1)
        }) - ${state.convictionLevel} conviction`,
      );
    }
  }

  /**
   * Log conviction-based position sizing
   */
  public logConvictionSizing(
    symbol: string,
    sizing: {
      baseSize: number;
      oracleMultiplier: number;
      flowMultiplier: number;
      trapReduction: number;
      globalCVDMultiplier: number;
      finalSize: number;
      cappedAt: number;
      reasoning: string[];
    },
  ): void {
    const logEntry: ConvictionSizingLogEntry = {
      timestamp: Date.now(),
      type: "conviction_sizing",
      symbol,
      baseSize: sizing.baseSize,
      oracleMultiplier: sizing.oracleMultiplier,
      flowMultiplier: sizing.flowMultiplier,
      trapReduction: sizing.trapReduction,
      globalCVDMultiplier: sizing.globalCVDMultiplier,
      finalSize: sizing.finalSize,
      cappedAt: sizing.cappedAt,
      reasoning: sizing.reasoning,
    };

    this.logTradeEntry(logEntry as any);

    if (this.localConfig.enableConsoleOutput) {
      console.log(
        `📊 CONVICTION SIZING: ${symbol} base=${
          sizing.baseSize.toFixed(2)
        } → final=${
          sizing.finalSize.toFixed(2)
        } (capped at ${sizing.cappedAt}x)`,
      );
    }
  }

  /**
   * Update logger configuration
   */
  public updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.localConfig = { ...this.localConfig, ...newConfig };
    console.log(
      "📊 Logger: Configuration updated locally (Shared logger config immutable at runtime)",
    );
  }

  /**
   * Generic info log
   */
  public info(message: string, data?: any): void {
    super.info(message, undefined, data);
  }

  /**
   * Generic debug log
   */
  public debug(message: string, data?: any): void {
    super.debug(message, undefined, data);
  }

  /**
   * Get log file statistics (Stub for compat)
   */
  public async getLogStats(): Promise<{
    currentSize: number;
    totalFiles: number;
    compressedFiles: number;
    oldestFile: string | null;
    newestFile: string | null;
  }> {
    return {
      currentSize: 0,
      totalFiles: 0,
      compressedFiles: 0,
      oldestFile: null,
      newestFile: null,
    };
  }

  /**
   * Flush and close logger (Stub for compat)
   */
  public async close(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Default logger instance for Phase 2
 * Lazy initialization to avoid issues with mocking in tests
 */
let _logger: Logger | null = null;

export const getLogger = (): Logger => {
  if (!_logger) {
    _logger = new Logger({
      enableConsoleOutput: process.env.NODE_ENV !== "production",
    });
  }
  return _logger;
};

/**
 * Convenience functions for common logging operations
 */
export const logSignal = (
  signal: SignalData,
  hologramState: HologramState,
  sessionType: SessionType,
  poiType: "FVG" | "ORDER_BLOCK" | "LIQUIDITY_POOL",
  cvdConfirmation: boolean,
): void => {
  getLogger().logPhase2Signal(
    signal,
    hologramState,
    sessionType,
    poiType,
    cvdConfirmation,
  );
};

export const logExecution = (
  orderResult: OrderResult,
  slippage: number,
  signalId?: string,
  fees?: number,
): void => {
  getLogger().logPhase2Execution(orderResult, slippage, signalId, fees);
};

export const logPositionClose = (
  positionId: string,
  symbol: string,
  side: "LONG" | "SHORT",
  entryPrice: number,
  exitPrice: number,
  profitPercentage: number,
  closeReason:
    | "STOP_LOSS"
    | "TAKE_PROFIT"
    | "TRAILING_STOP"
    | "MANUAL"
    | "EMERGENCY",
  holdTime: number,
  rValue: number,
): void => {
  getLogger().logPhase2PositionClose(
    positionId,
    symbol,
    side,
    entryPrice,
    exitPrice,
    profitPercentage,
    closeReason,
    holdTime,
    rValue,
  );
};

export const logError = (
  level: "WARNING" | "ERROR" | "CRITICAL",
  message: string,
  context?: any,
): void => {
  getLogger().logPhase2Error(level, message, context);
};
