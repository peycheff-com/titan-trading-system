/**
 * Structured Logger
 * Requirements: System Integration 10.1, 27.1-27.5
 * 
 * Provides unified JSON logging format across all Titan services with:
 * - Consistent timestamp, service, level, message, and context fields
 * - Signal ID correlation for tracing signals across services
 * - Error logging with stack traces
 * - Log level filtering
 */

import { EventEmitter } from 'events';

/**
 * Log levels with numeric values for filtering
 */
export const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

/**
 * StructuredLogger class for unified logging
 */
export class StructuredLogger extends EventEmitter {
  /**
   * Create a new StructuredLogger instance
   * @param {Object} options - Logger options
   * @param {string} options.service - Service name (e.g., 'execution', 'scavenger', 'console')
   * @param {string} options.level - Minimum log level (default: 'info')
   * @param {Function} options.output - Output function (default: console.log)
   * @param {boolean} options.pretty - Pretty print JSON (default: false)
   */
  constructor(options = {}) {
    super();
    this.service = options.service || 'titan';
    this.level = options.level || 'info';
    this.levelValue = LOG_LEVELS[this.level] ?? LOG_LEVELS.info;
    this.output = options.output || console.log;
    this.pretty = options.pretty || false;
    this.correlationId = null;
  }

  /**
   * Set correlation ID for request tracing
   * @param {string} id - Correlation ID (usually signal_id)
   */
  setCorrelationId(id) {
    this.correlationId = id;
  }

  /**
   * Clear correlation ID
   */
  clearCorrelationId() {
    this.correlationId = null;
  }

  /**
   * Create a child logger with additional context
   * @param {Object} context - Additional context to include in all logs
   * @returns {StructuredLogger} Child logger instance
   */
  child(context) {
    const child = new StructuredLogger({
      service: this.service,
      level: this.level,
      output: this.output,
      pretty: this.pretty,
    });
    child.defaultContext = { ...this.defaultContext, ...context };
    child.correlationId = this.correlationId;
    return child;
  }

  /**
   * Format log entry as JSON
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @param {Object} context - Additional context
   * @returns {string} JSON formatted log entry
   */
  formatEntry(level, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      service: this.service,
      level,
      message,
      ...this.defaultContext,
      ...context,
    };

    // Add correlation ID if set
    if (this.correlationId) {
      entry.signal_id = this.correlationId;
    }

    // Add error details if present
    if (context.error instanceof Error) {
      entry.error = {
        name: context.error.name,
        message: context.error.message,
        stack: context.error.stack,
      };
      delete context.error;
    }

    return this.pretty 
      ? JSON.stringify(entry, null, 2) 
      : JSON.stringify(entry);
  }

  /**
   * Check if log level should be output
   * @param {string} level - Log level to check
   * @returns {boolean} True if level should be logged
   */
  shouldLog(level) {
    return (LOG_LEVELS[level] ?? LOG_LEVELS.info) <= this.levelValue;
  }

  /**
   * Log at specified level
   * @param {string} level - Log level
   * @param {string|Object} messageOrContext - Message string or context object
   * @param {string} message - Message string (if first arg is context)
   */
  log(level, messageOrContext, message) {
    if (!this.shouldLog(level)) return;

    let logMessage;
    let context = {};

    if (typeof messageOrContext === 'object' && message) {
      context = messageOrContext;
      logMessage = message;
    } else if (typeof messageOrContext === 'string') {
      logMessage = messageOrContext;
    } else {
      logMessage = 'Log entry';
      context = messageOrContext || {};
    }

    const entry = this.formatEntry(level, logMessage, context);
    this.output(entry);
    this.emit('log', { level, message: logMessage, context });
  }

  /**
   * Log info level message
   * @param {string|Object} messageOrContext - Message or context
   * @param {string} message - Message (if first arg is context)
   */
  info(messageOrContext, message) {
    this.log('info', messageOrContext, message);
  }

  /**
   * Log warn level message
   * @param {string|Object} messageOrContext - Message or context
   * @param {string} message - Message (if first arg is context)
   */
  warn(messageOrContext, message) {
    this.log('warn', messageOrContext, message);
  }

  /**
   * Log error level message
   * @param {string|Object} messageOrContext - Message or context
   * @param {string} message - Message (if first arg is context)
   */
  error(messageOrContext, message) {
    this.log('error', messageOrContext, message);
  }

  /**
   * Log debug level message
   * @param {string|Object} messageOrContext - Message or context
   * @param {string} message - Message (if first arg is context)
   */
  debug(messageOrContext, message) {
    this.log('debug', messageOrContext, message);
  }

  /**
   * Log trace level message
   * @param {string|Object} messageOrContext - Message or context
   * @param {string} message - Message (if first arg is context)
   */
  trace(messageOrContext, message) {
    this.log('trace', messageOrContext, message);
  }

  /**
   * Log signal event with correlation
   * Requirements: System Integration 27.5 - Include signal_id in all logs
   * @param {string} signalId - Signal ID for correlation
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  logSignal(signalId, event, data = {}) {
    this.log('info', {
      signal_id: signalId,
      event,
      ...data,
    }, `Signal ${event}`);
  }

  /**
   * Log trade execution
   * @param {Object} trade - Trade details
   */
  logTrade(trade) {
    this.log('info', {
      event: 'trade_executed',
      signal_id: trade.signal_id,
      symbol: trade.symbol,
      side: trade.side,
      size: trade.size,
      price: trade.price,
      order_id: trade.order_id,
    }, `Trade executed: ${trade.side} ${trade.size} ${trade.symbol} @ ${trade.price}`);
  }

  /**
   * Log system event
   * @param {string} event - Event type
   * @param {Object} data - Event data
   */
  logSystemEvent(event, data = {}) {
    this.log('info', {
      event,
      ...data,
    }, `System event: ${event}`);
  }

  /**
   * Log error with stack trace
   * Requirements: System Integration 10.4 - Include stack trace and error context
   * @param {Error} error - Error object
   * @param {Object} context - Additional context
   */
  logError(error, context = {}) {
    this.log('error', {
      error,
      ...context,
    }, error.message);
  }
}

/**
 * Create a structured logger adapter that wraps Pino logger
 * @param {Object} pinoLogger - Pino logger instance
 * @param {string} service - Service name
 * @returns {StructuredLogger} Structured logger instance
 */
export function createStructuredLoggerAdapter(pinoLogger, service = 'execution') {
  const logger = new StructuredLogger({
    service,
    level: pinoLogger.level || 'info',
    output: (entry) => {
      const parsed = JSON.parse(entry);
      const level = parsed.level;
      delete parsed.level;
      delete parsed.timestamp;
      delete parsed.service;
      
      if (pinoLogger[level]) {
        pinoLogger[level](parsed, parsed.message);
      } else {
        pinoLogger.info(parsed, parsed.message);
      }
    },
  });

  return logger;
}

/**
 * Create a file logger that writes to a JSONL file
 * @param {string} filePath - Path to log file
 * @param {string} service - Service name
 * @returns {StructuredLogger} Structured logger instance
 */
export function createFileLogger(filePath, service = 'titan') {
  const fs = require('fs');
  const stream = fs.createWriteStream(filePath, { flags: 'a' });

  const logger = new StructuredLogger({
    service,
    output: (entry) => {
      stream.write(entry + '\n');
    },
  });

  // Handle stream errors
  stream.on('error', (err) => {
    console.error(`Log file error: ${err.message}`);
  });

  // Add close method
  logger.close = () => {
    stream.end();
  };

  return logger;
}

export default StructuredLogger;
