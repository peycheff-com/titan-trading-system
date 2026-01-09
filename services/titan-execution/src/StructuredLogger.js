/**
 * Titan Structured Logger
 * 
 * Unified JSON logging format for all Titan services.
 * Supports log correlation via signal_id.
 */

const fs = require('fs');
const path = require('path');

class StructuredLogger {
  constructor(options = {}) {
    this.options = {
      service: options.service || 'unknown',
      level: options.level || process.env.LOG_LEVEL || 'info',
      outputFile: options.outputFile || null,
      consoleOutput: options.consoleOutput !== false,
      ...options
    };
    
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      critical: 4
    };
    
    this.currentLevel = this.levels[this.options.level] || 1;
    this.outputStream = null;
    
    if (this.options.outputFile) {
      this.initializeFileOutput();
    }
  }

  /**
   * Initialize file output stream
   */
  initializeFileOutput() {
    const dir = path.dirname(this.options.outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    this.outputStream = fs.createWriteStream(this.options.outputFile, { flags: 'a' });
  }

  /**
   * Log a message
   */
  log(level, message, context = {}) {
    if (this.levels[level] < this.currentLevel) {
      return;
    }
    
    const entry = this.formatEntry(level, message, context);
    const json = JSON.stringify(entry);
    
    if (this.options.consoleOutput) {
      this.writeToConsole(level, json);
    }
    
    if (this.outputStream) {
      this.outputStream.write(json + '\n');
    }
    
    return entry;
  }

  /**
   * Format log entry
   */
  formatEntry(level, message, context) {
    const entry = {
      timestamp: new Date().toISOString(),
      service: this.options.service,
      level,
      message
    };
    
    // Add signal_id for correlation if present
    if (context.signal_id) {
      entry.signal_id = context.signal_id;
      delete context.signal_id;
    }
    
    // Add remaining context
    if (Object.keys(context).length > 0) {
      entry.context = context;
    }
    
    return entry;
  }

  /**
   * Write to console with color coding
   */
  writeToConsole(level, json) {
    const colors = {
      debug: '\x1b[36m',   // Cyan
      info: '\x1b[32m',    // Green
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      critical: '\x1b[35m' // Magenta
    };
    
    const reset = '\x1b[0m';
    const color = colors[level] || reset;
    
    console.log(`${color}${json}${reset}`);
  }

  /**
   * Convenience methods
   */
  debug(message, context = {}) {
    return this.log('debug', message, context);
  }

  info(message, context = {}) {
    return this.log('info', message, context);
  }

  warn(message, context = {}) {
    return this.log('warn', message, context);
  }

  error(message, context = {}) {
    // Include stack trace if error object provided
    if (context.error instanceof Error) {
      context.stack = context.error.stack;
      context.errorMessage = context.error.message;
      delete context.error;
    }
    return this.log('error', message, context);
  }

  critical(message, context = {}) {
    if (context.error instanceof Error) {
      context.stack = context.error.stack;
      context.errorMessage = context.error.message;
      delete context.error;
    }
    return this.log('critical', message, context);
  }

  /**
   * Log with signal correlation
   */
  logSignal(level, message, signalId, context = {}) {
    return this.log(level, message, { ...context, signal_id: signalId });
  }

  /**
   * Set log level
   */
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level];
      this.options.level = level;
    }
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext) {
    const childLogger = new StructuredLogger({
      ...this.options,
      outputFile: null // Don't create new file stream
    });
    
    childLogger.outputStream = this.outputStream;
    childLogger.additionalContext = additionalContext;
    
    const originalLog = childLogger.log.bind(childLogger);
    childLogger.log = (level, message, context = {}) => {
      return originalLog(level, message, { ...additionalContext, ...context });
    };
    
    return childLogger;
  }

  /**
   * Close file stream
   */
  close() {
    if (this.outputStream) {
      this.outputStream.end();
    }
  }
}

/**
 * Create logger for a specific service
 */
function createLogger(service, options = {}) {
  return new StructuredLogger({
    service,
    outputFile: options.outputFile || `./logs/${service}.log`,
    ...options
  });
}

module.exports = { StructuredLogger, createLogger };
