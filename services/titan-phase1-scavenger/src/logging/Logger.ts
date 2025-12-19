/**
 * Logger
 * 
 * Logs signals and executions to JSONL format for queryable analysis.
 * 
 * Requirements: 11.1-11.7 (Signal Execution Logging)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);

/**
 * Unified log entry format
 * Requirements: System Integration 27.1-27.5 - Unified JSON logging format
 */
export interface LogEntry {
  timestamp: string | number;  // ISO 8601 format (string) or epoch ms (number) - converted to ISO on write
  service: string;    // 'scavenger' | 'execution' | 'console'
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  message: string;
  signal_id?: string; // For correlation across services
  // Legacy fields for backward compatibility
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

export class Logger {
  private logFilePath: string;
  private maxLogSize: number = 10 * 1024 * 1024;  // 10 MB
  private maxLogAge: number = 30 * 24 * 60 * 60 * 1000;  // 30 days
  
  constructor(logDir?: string) {
    // Default log directory: ~/.titan-scanner/logs/
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    const defaultLogDir = path.join(homeDir, '.titan-scanner', 'logs');
    
    const targetLogDir = logDir || defaultLogDir;
    
    // Create log directory if it doesn't exist
    if (!fs.existsSync(targetLogDir)) {
      fs.mkdirSync(targetLogDir, { recursive: true });
    }
    
    // Log file path
    this.logFilePath = path.join(targetLogDir, 'trades.jsonl');
    
    // Create log file if it doesn't exist
    if (!fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, '');
    }
    
    console.log(`📝 Logger initialized: ${this.logFilePath}`);
  }
  
  /**
   * Log an entry to trades.jsonl
   * 
   * Requirement 11.1: Append signal data to trades.jsonl file as single JSON object per line
   * Requirement 27.1: Use unified JSON format with timestamp, service, level, message, context
   */
  log(entry: Partial<LogEntry>): void {
    try {
      // Ensure unified format
      const unifiedEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        service: 'scavenger',
        level: entry.level || (entry.type === 'error' ? 'error' : 'info'),
        message: entry.message || this.generateMessage(entry),
        ...entry
      };
      
      // Convert entry to JSON string
      const jsonLine = JSON.stringify(unifiedEntry) + '\n';
      
      // Append to log file
      fs.appendFileSync(this.logFilePath, jsonLine);
      
      // Check if rotation is needed
      this.checkRotation();
      
    } catch (error) {
      console.error('❌ Failed to write log entry:', error);
    }
  }
  
  /**
   * Generate message from entry data
   */
  private generateMessage(entry: Partial<LogEntry>): string {
    if (entry.type === 'signal') {
      return `Signal: ${entry.trapType} ${entry.direction} ${entry.symbol} @ ${entry.entry}`;
    }
    if (entry.type === 'execution') {
      return `Execution: ${entry.direction} ${entry.symbol} filled @ ${entry.fillPrice}`;
    }
    if (entry.type === 'close') {
      return `Close: ${entry.symbol} @ ${entry.exitPrice} (${entry.profitPercent?.toFixed(2)}%)`;
    }
    if (entry.type === 'error') {
      return `Error: ${entry.error}`;
    }
    return 'Log entry';
  }
  
  /**
   * Log a signal with all trap details
   * 
   * Requirement 11.2: Log signal with timestamp, symbol, strategy type, confidence, leverage, entry price, stop price, target price
   * Requirement 27.5: Include signal_id for correlation across services
   */
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
    this.log({
      type: 'signal',
      level: 'info',
      signal_id: data.signal_id,
      ...data
    });
  }
  
  /**
   * Log an execution with fill prices
   * 
   * Requirement 11.3: Log execution with fill price, fill timestamp, and order type
   * Requirement 27.5: Include signal_id for correlation across services
   */
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
    this.log({
      type: 'execution',
      level: 'info',
      signal_id: data.signal_id,
      ...data
    });
  }
  
  /**
   * Log a position close
   * 
   * Requirement 11.4: Log close with exit price, exit timestamp, profit percentage, and close reason
   * Requirement 27.5: Include signal_id for correlation across services
   */
  logClose(data: {
    symbol: string;
    exitPrice: number;
    exitTimestamp: number;
    profitPercent: number;
    closeReason: string;
    entry?: number;
    signal_id?: string;
  }): void {
    this.log({
      type: 'close',
      level: 'info',
      signal_id: data.signal_id,
      ...data
    });
  }
  
  /**
   * Log an error with context
   * 
   * Requirement 10.4: Include stack trace and error context
   * Requirement 27.5: Include signal_id for correlation across services
   */
  logError(error: Error | string, context?: any): void {
    const errorData: Partial<LogEntry> = {
      type: 'error',
      level: 'error',
      symbol: context?.symbol || 'SYSTEM',
      error: error instanceof Error ? error.message : error,
      errorStack: error instanceof Error ? error.stack : undefined,
      signal_id: context?.signal_id,
      context
    };
    
    this.log(errorData);
    
    // Also log to console for immediate visibility
    console.error('❌ Error logged:', errorData.error, context);
  }
  
  /**
   * Check if log rotation is needed
   * 
   * Requirement 11.5: Rotate log file when size exceeds 10 MB
   */
  private checkRotation(): void {
    try {
      const stats = fs.statSync(this.logFilePath);
      
      // Check file size
      if (stats.size > this.maxLogSize) {
        this.rotateLog();
      }
      
      // Check for old logs to compress (async, don't wait)
      this.compressOldLogs().catch(err => {
        console.error('⚠️ Failed to compress old logs:', err);
      });
      
    } catch (error) {
      console.error('⚠️ Failed to check log rotation:', error);
    }
  }
  
  /**
   * Rotate log file
   * 
   * Requirement 11.5: Rotate log file with timestamp suffix
   */
  private rotateLog(): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = this.logFilePath.replace('.jsonl', `-${timestamp}.jsonl`);
      
      // Rename current log file
      fs.renameSync(this.logFilePath, rotatedPath);
      
      // Create new empty log file
      fs.writeFileSync(this.logFilePath, '');
      
      console.log(`📦 Log rotated: ${rotatedPath}`);
      
    } catch (error) {
      console.error('❌ Failed to rotate log:', error);
    }
  }
  
  /**
   * Compress old logs
   * 
   * Requirement 11.6: Compress log files older than 30 days to gzip format
   */
  private async compressOldLogs(): Promise<void> {
    try {
      const logDir = path.dirname(this.logFilePath);
      const files = fs.readdirSync(logDir);
      
      const now = Date.now();
      
      for (const file of files) {
        // Skip current log file
        if (file === path.basename(this.logFilePath)) continue;
        
        // Only process .jsonl files (not already compressed)
        if (!file.endsWith('.jsonl') || file.endsWith('.jsonl.gz')) continue;
        
        const filePath = path.join(logDir, file);
        
        // Check if file exists (might have been deleted)
        if (!fs.existsSync(filePath)) continue;
        
        const stats = fs.statSync(filePath);
        
        // Check if file is older than 30 days
        const age = now - stats.mtimeMs;
        if (age > this.maxLogAge) {
          await this.compressFile(filePath);
        }
      }
      
    } catch (error) {
      console.error('⚠️ Failed to compress old logs:', error);
    }
  }
  
  /**
   * Compress a single file using gzip
   * 
   * Requirement 11.6: Compress log files to gzip format
   */
  private async compressFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath);
      const compressed = await gzip(content);
      
      const gzipPath = filePath + '.gz';
      fs.writeFileSync(gzipPath, compressed);
      
      // Delete original file after successful compression
      fs.unlinkSync(filePath);
      
      const ageInDays = Math.floor((Date.now() - fs.statSync(gzipPath).mtimeMs) / (24 * 60 * 60 * 1000));
      console.log(`📦 Compressed old log: ${path.basename(filePath)} (age: ${ageInDays} days)`);
      
    } catch (error) {
      console.error(`❌ Failed to compress file ${filePath}:`, error);
    }
  }
  
  /**
   * Query logs (helper method for analysis)
   * 
   * Requirement 11.7: Support jq command-line tool for JSON filtering
   */
  queryLogs(filter?: (entry: LogEntry) => boolean): LogEntry[] {
    try {
      const content = fs.readFileSync(this.logFilePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const entries: LogEntry[] = lines.map(line => JSON.parse(line));
      
      if (filter) {
        return entries.filter(filter);
      }
      
      return entries;
      
    } catch (error) {
      console.error('❌ Failed to query logs:', error);
      return [];
    }
  }
}
