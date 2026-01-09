/**
 * Logger for Titan Phase 2 - The Hunter
 * 
 * Implements JSONL (JSON Lines) logging for signals, executions, and errors
 * with automatic log rotation and compression.
 * 
 * Requirements: 16.1-16.7 (Signal Execution Logging)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { 
  SignalData, 
  ExecutionData, 
  HologramState, 
  SessionType, 
  OrderResult 
} from '../types';

const gzip = promisify(zlib.gzip);
const writeFile = promisify(fs.writeFile);
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

/**
 * Signal log entry structure
 */
export interface SignalLogEntry {
  timestamp: number;
  type: 'signal';
  symbol: string;
  strategyType: 'holographic';
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
  poiType: 'FVG' | 'ORDER_BLOCK' | 'LIQUIDITY_POOL';
  cvdStatus: boolean;
  direction: 'LONG' | 'SHORT';
  positionSize: number;
}

/**
 * Execution log entry structure
 */
export interface ExecutionLogEntry {
  timestamp: number;
  type: 'execution';
  signalId?: string;
  orderId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  qty: number;
  fillPrice: number;
  fillTimestamp: number;
  orderType: 'MARKET' | 'LIMIT' | 'POST_ONLY';
  slippage: number;
  fees?: number;
}

/**
 * Position close log entry structure
 */
export interface CloseLogEntry {
  timestamp: number;
  type: 'close';
  positionId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  exitPrice: number;
  exitTimestamp: number;
  profitPercentage: number;
  closeReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TRAILING_STOP' | 'MANUAL' | 'EMERGENCY';
  holdTime: number; // milliseconds
  entryPrice: number;
  rValue: number; // R multiple
}

/**
 * Error log entry structure
 */
export interface ErrorLogEntry {
  timestamp: number;
  type: 'error';
  level: 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  context: {
    symbol?: string;
    phase: 'phase2';
    component?: string;
    function?: string;
    stack?: string;
    data?: any;
  };
}

export type LogEntry = SignalLogEntry | ExecutionLogEntry | CloseLogEntry | ErrorLogEntry;

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
 * with automatic rotation and compression.
 */
export class Logger {
  private config: LoggerConfig;
  private logFilePath: string;
  private writeStream: fs.WriteStream | null = null;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      logDir: path.join(process.cwd(), 'logs'),
      logFileName: 'trades.jsonl',
      maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
      compressionAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
      enableConsoleOutput: false,
      ...config
    };

    this.logFilePath = path.join(this.config.logDir, this.config.logFileName);
    this.ensureLogDirectory();
    this.initializeWriteStream();
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.config.logDir)) {
      fs.mkdirSync(this.config.logDir, { recursive: true });
    }
  }

  /**
   * Initialize write stream for log file
   */
  private initializeWriteStream(): void {
    this.writeStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
    
    this.writeStream.on('error', (error) => {
      console.error('Logger write stream error:', error);
    });
  }

  /**
   * Log a signal with comprehensive hologram state
   * 
   * Requirement 16.2: Include timestamp, symbol, strategy type, confidence, 
   * leverage, entry price, stop price, target price, alignment state, 
   * RS score, session type, POI type, and CVD status
   */
  public logSignal(
    signal: SignalData,
    hologramState: HologramState,
    sessionType: SessionType,
    poiType: 'FVG' | 'ORDER_BLOCK' | 'LIQUIDITY_POOL',
    cvdConfirmation: boolean
  ): void {
    const logEntry: SignalLogEntry = {
      timestamp: Date.now(),
      type: 'signal',
      symbol: signal.symbol,
      strategyType: 'holographic',
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
        m15: `${hologramState.m15.trend}_${hologramState.m15.mss ? 'MSS' : 'NO_MSS'}`
      },
      rsScore: hologramState.rsScore,
      sessionType,
      poiType,
      cvdStatus: cvdConfirmation,
      direction: signal.direction,
      positionSize: signal.positionSize
    };

    this.writeLogEntry(logEntry);

    if (this.config.enableConsoleOutput) {
      console.log(`📊 SIGNAL: ${signal.symbol} ${signal.direction} @ ${signal.entryPrice} (${hologramState.status}, RS:${hologramState.rsScore.toFixed(3)})`);
    }
  }

  /**
   * Log order execution with fill details
   * 
   * Requirement 16.3: Include fill price, fill timestamp, order type, and slippage
   */
  public logExecution(
    orderResult: OrderResult,
    slippage: number,
    signalId?: string,
    fees?: number
  ): void {
    const logEntry: ExecutionLogEntry = {
      timestamp: Date.now(),
      type: 'execution',
      signalId,
      orderId: orderResult.orderId,
      symbol: orderResult.symbol,
      side: orderResult.side,
      qty: orderResult.qty,
      fillPrice: orderResult.price,
      fillTimestamp: orderResult.timestamp,
      orderType: 'LIMIT', // Phase 2 uses Post-Only Limit Orders
      slippage,
      fees
    };

    this.writeLogEntry(logEntry);

    if (this.config.enableConsoleOutput) {
      console.log(`✅ FILL: ${orderResult.symbol} ${orderResult.side} ${orderResult.qty} @ ${orderResult.price} (slippage: ${(slippage * 100).toFixed(3)}%)`);
    }
  }

  /**
   * Log position close with P&L details
   * 
   * Requirement 16.4: Include exit price, exit timestamp, profit percentage, 
   * close reason, and hold time
   */
  public logPositionClose(
    positionId: string,
    symbol: string,
    side: 'LONG' | 'SHORT',
    entryPrice: number,
    exitPrice: number,
    profitPercentage: number,
    closeReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TRAILING_STOP' | 'MANUAL' | 'EMERGENCY',
    holdTime: number,
    rValue: number
  ): void {
    const logEntry: CloseLogEntry = {
      timestamp: Date.now(),
      type: 'close',
      positionId,
      symbol,
      side,
      exitPrice,
      exitTimestamp: Date.now(),
      profitPercentage,
      closeReason,
      holdTime,
      entryPrice,
      rValue
    };

    this.writeLogEntry(logEntry);

    if (this.config.enableConsoleOutput) {
      const pnlColor = profitPercentage >= 0 ? '\x1b[32m' : '\x1b[31m';
      console.log(`${pnlColor}💰 CLOSE: ${symbol} ${side} ${profitPercentage.toFixed(2)}% (${rValue.toFixed(2)}R) - ${closeReason}\x1b[0m`);
    }
  }

  /**
   * Log error with context
   */
  public logError(
    level: 'WARNING' | 'ERROR' | 'CRITICAL',
    message: string,
    context: {
      symbol?: string;
      component?: string;
      function?: string;
      stack?: string;
      data?: any;
    } = {}
  ): void {
    const logEntry: ErrorLogEntry = {
      timestamp: Date.now(),
      type: 'error',
      level,
      message,
      context: {
        ...context,
        phase: 'phase2'
      }
    };

    this.writeLogEntry(logEntry);

    if (this.config.enableConsoleOutput) {
      const levelColor = level === 'CRITICAL' ? '\x1b[31m' : level === 'ERROR' ? '\x1b[33m' : '\x1b[36m';
      console.log(`${levelColor}❌ ${level}: ${message}\x1b[0m`);
    }
  }

  /**
   * Write log entry to JSONL file
   * 
   * Requirement 16.1: Append signal data to trades.jsonl file as single JSON object per line
   */
  private writeLogEntry(entry: LogEntry): void {
    try {
      const jsonLine = JSON.stringify(entry) + '\n';
      
      if (this.writeStream) {
        this.writeStream.write(jsonLine);
      } else {
        // Fallback to synchronous write if stream is not available
        fs.appendFileSync(this.logFilePath, jsonLine);
      }

      // Check if log rotation is needed
      this.checkLogRotation();
    } catch (error) {
      console.error('Failed to write log entry:', error);
    }
  }

  /**
   * Check if log file needs rotation
   * 
   * Requirement 16.5: Rotate log file when size exceeds 10MB
   */
  private async checkLogRotation(): Promise<void> {
    try {
      const stats = await stat(this.logFilePath);
      
      if (stats.size >= this.config.maxFileSizeBytes) {
        await this.rotateLogFile();
      }
    } catch (error) {
      // File might not exist yet, ignore
    }
  }

  /**
   * Rotate log file with timestamp suffix
   * 
   * Requirement 16.5: Rotate log file with timestamp suffix
   */
  private async rotateLogFile(): Promise<void> {
    try {
      // Close current write stream
      if (this.writeStream) {
        this.writeStream.end();
        this.writeStream = null;
      }

      // Create rotated filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedFileName = this.config.logFileName.replace('.jsonl', `-${timestamp}.jsonl`);
      const rotatedFilePath = path.join(this.config.logDir, rotatedFileName);

      // Rename current log file
      fs.renameSync(this.logFilePath, rotatedFilePath);

      // Create new write stream
      this.initializeWriteStream();

      console.log(`📁 Log rotated: ${rotatedFileName}`);

      // Schedule compression check
      this.scheduleCompressionCheck();
    } catch (error) {
      console.error('Failed to rotate log file:', error);
      // Reinitialize write stream on error
      this.initializeWriteStream();
    }
  }

  /**
   * Schedule compression check for old log files
   * 
   * Requirement 16.6: Compress log files older than 30 days
   */
  private scheduleCompressionCheck(): void {
    // Run compression check asynchronously
    setImmediate(() => {
      this.compressOldLogs().catch(error => {
        console.error('Failed to compress old logs:', error);
      });
    });
  }

  /**
   * Compress log files older than configured age
   * 
   * Requirement 16.6: Compress log file to gzip format when age exceeds 30 days
   */
  private async compressOldLogs(): Promise<void> {
    try {
      const files = await readdir(this.config.logDir);
      const now = Date.now();

      for (const file of files) {
        // Skip current log file and already compressed files
        if (file === this.config.logFileName || file.endsWith('.gz')) {
          continue;
        }

        // Only process .jsonl files
        if (!file.endsWith('.jsonl')) {
          continue;
        }

        const filePath = path.join(this.config.logDir, file);
        const stats = await stat(filePath);
        const fileAge = now - stats.mtime.getTime();

        // Compress if older than configured age
        if (fileAge > this.config.compressionAgeMs) {
          await this.compressLogFile(filePath);
        }
      }
    } catch (error) {
      console.error('Failed to check old logs for compression:', error);
    }
  }

  /**
   * Compress a single log file to gzip format
   */
  private async compressLogFile(filePath: string): Promise<void> {
    try {
      const fileContent = fs.readFileSync(filePath);
      const compressed = await gzip(fileContent);
      const compressedPath = filePath + '.gz';

      await writeFile(compressedPath, compressed);
      fs.unlinkSync(filePath); // Remove original file

      console.log(`🗜️ Compressed: ${path.basename(filePath)} → ${path.basename(compressedPath)}`);
    } catch (error) {
      console.error(`Failed to compress ${filePath}:`, error);
    }
  }

  /**
   * Get log file statistics
   */
  public async getLogStats(): Promise<{
    currentSize: number;
    totalFiles: number;
    compressedFiles: number;
    oldestFile: string | null;
    newestFile: string | null;
  }> {
    try {
      const files = await readdir(this.config.logDir);
      const logFiles = files.filter(f => f.endsWith('.jsonl') || f.endsWith('.jsonl.gz'));
      
      let currentSize = 0;
      let oldestFile: string | null = null;
      let newestFile: string | null = null;
      let oldestTime = Infinity;
      let newestTime = 0;

      // Get current log file size
      try {
        const currentStats = await stat(this.logFilePath);
        currentSize = currentStats.size;
      } catch {
        // File might not exist yet
      }

      // Find oldest and newest files
      for (const file of logFiles) {
        const filePath = path.join(this.config.logDir, file);
        const stats = await stat(filePath);
        
        if (stats.mtime.getTime() < oldestTime) {
          oldestTime = stats.mtime.getTime();
          oldestFile = file;
        }
        
        if (stats.mtime.getTime() > newestTime) {
          newestTime = stats.mtime.getTime();
          newestFile = file;
        }
      }

      return {
        currentSize,
        totalFiles: logFiles.length,
        compressedFiles: files.filter(f => f.endsWith('.gz')).length,
        oldestFile,
        newestFile
      };
    } catch (error) {
      console.error('Failed to get log stats:', error);
      return {
        currentSize: 0,
        totalFiles: 0,
        compressedFiles: 0,
        oldestFile: null,
        newestFile: null
      };
    }
  }

  /**
   * Flush and close logger
   */
  public async close(): Promise<void> {
    if (this.writeStream) {
      return new Promise((resolve) => {
        this.writeStream!.end(() => {
          this.writeStream = null;
          resolve();
        });
      });
    }
  }

  /**
   * Update logger configuration
   */
  public updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('📊 Logger: Configuration updated');
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
      enableConsoleOutput: process.env.NODE_ENV !== 'production'
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
  poiType: 'FVG' | 'ORDER_BLOCK' | 'LIQUIDITY_POOL',
  cvdConfirmation: boolean
) => getLogger().logSignal(signal, hologramState, sessionType, poiType, cvdConfirmation);

export const logExecution = (
  orderResult: OrderResult,
  slippage: number,
  signalId?: string,
  fees?: number
) => getLogger().logExecution(orderResult, slippage, signalId, fees);

export const logPositionClose = (
  positionId: string,
  symbol: string,
  side: 'LONG' | 'SHORT',
  entryPrice: number,
  exitPrice: number,
  profitPercentage: number,
  closeReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TRAILING_STOP' | 'MANUAL' | 'EMERGENCY',
  holdTime: number,
  rValue: number
) => getLogger().logPositionClose(positionId, symbol, side, entryPrice, exitPrice, profitPercentage, closeReason, holdTime, rValue);

export const logError = (
  level: 'WARNING' | 'ERROR' | 'CRITICAL',
  message: string,
  context?: {
    symbol?: string;
    component?: string;
    function?: string;
    stack?: string;
    data?: any;
  }
) => getLogger().logError(level, message, context);