/**
 * Logger.test.ts - Unit tests for structured logging
 * 
 * Tests the Logger class functionality including structured logging,
 * correlation IDs, performance tracking, and sensitive data masking.
 */

import { Logger, LogLevel, LoggerConfig } from '../../src/logging/Logger';
import * as fs from 'fs';
import * as path from 'path';

// Mock console methods
const originalConsole = { ...console };
const mockConsole = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  log: jest.fn()
};

// Mock fs methods
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('Logger', () => {
  let logger: Logger;
  let testConfig: LoggerConfig;

  beforeEach(() => {
    // Reset console mocks
    Object.assign(console, mockConsole);
    Object.keys(mockConsole).forEach(key => {
      (mockConsole as any)[key].mockClear();
    });

    // Reset fs mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockImplementation();
    mockFs.appendFileSync.mockImplementation();

    // Create test configuration
    testConfig = {
      level: LogLevel.DEBUG,
      component: 'test-component',
      enableConsole: true,
      enableFile: false,
      enablePerformanceLogging: true,
      sensitiveFields: ['password', 'secret', 'token'],
      maxStackTraceLines: 5
    };

    logger = new Logger(testConfig);
  });

  afterEach(() => {
    // Restore original console
    Object.assign(console, originalConsole);
    
    // Clear any active timers
    logger.clearTimers();
  });

  describe('Configuration', () => {
    it('should create configuration from environment variables', () => {
      process.env.LOG_LEVEL = 'WARN';
      process.env.LOG_ENABLE_CONSOLE = 'true';
      process.env.LOG_ENABLE_FILE = 'true';
      process.env.LOG_FILE_PATH = './test.log';
      process.env.LOG_SENSITIVE_FIELDS = 'password,secret,apikey';

      const config = Logger.createConfigFromEnv('test-service');

      expect(config.level).toBe(LogLevel.WARN);
      expect(config.component).toBe('test-service');
      expect(config.enableConsole).toBe(true);
      expect(config.enableFile).toBe(true);
      expect(config.filePath).toBe('./test.log');
      expect(config.sensitiveFields).toEqual(['password', 'secret', 'apikey']);

      // Clean up
      delete process.env.LOG_LEVEL;
      delete process.env.LOG_ENABLE_CONSOLE;
      delete process.env.LOG_ENABLE_FILE;
      delete process.env.LOG_FILE_PATH;
      delete process.env.LOG_SENSITIVE_FIELDS;
    });

    it('should use default values when environment variables are not set', () => {
      const config = Logger.createConfigFromEnv();

      expect(config.level).toBe(LogLevel.INFO);
      expect(config.component).toBe('titan-brain');
      expect(config.enableConsole).toBe(true);
      expect(config.enableFile).toBe(false);
    });

    it('should create singleton instance', () => {
      const instance1 = Logger.getInstance('test');
      const instance2 = Logger.getInstance('test');

      expect(instance1).toBe(instance2);
    });
  });

  describe('Basic Logging', () => {
    it('should log debug messages', () => {
      const correlationId = 'test-correlation-id';
      const metadata = { key: 'value' };

      logger.debug('Debug message', correlationId, metadata);

      expect(mockConsole.debug).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.debug.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.level).toBe('DEBUG');
      expect(logEntry.message).toBe('Debug message');
      expect(logEntry.correlationId).toBe(correlationId);
      expect(logEntry.component).toBe('test-component');
      expect(logEntry.metadata).toEqual(metadata);
      expect(logEntry.timestamp).toBeDefined();
    });

    it('should log info messages', () => {
      logger.info('Info message');

      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.level).toBe('INFO');
      expect(logEntry.message).toBe('Info message');
    });

    it('should log warning messages', () => {
      logger.warn('Warning message');

      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.warn.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.level).toBe('WARN');
      expect(logEntry.message).toBe('Warning message');
    });

    it('should log error messages with error objects', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:1:1\n    at test.js:2:2';

      logger.error('Error message', error);

      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.error.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.level).toBe('ERROR');
      expect(logEntry.message).toBe('Error message');
      expect(logEntry.error).toBeDefined();
      expect(logEntry.error.name).toBe('Error');
      expect(logEntry.error.message).toBe('Test error');
      expect(logEntry.error.stack).toContain('Error: Test error');
    });

    it('should log fatal messages', () => {
      logger.fatal('Fatal message');

      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.error.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.level).toBe('FATAL');
      expect(logEntry.message).toBe('Fatal message');
    });
  });

  describe('Log Level Filtering', () => {
    it('should respect log level configuration', () => {
      const warnLogger = new Logger({
        ...testConfig,
        level: LogLevel.WARN
      });

      warnLogger.debug('Debug message');
      warnLogger.info('Info message');
      warnLogger.warn('Warning message');
      warnLogger.error('Error message');

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
    });

    it('should allow changing log level at runtime', () => {
      // First set to WARN level so we can see the setLogLevel message
      logger.setLogLevel(LogLevel.WARN);
      
      // Clear the mock calls from setLogLevel
      Object.keys(mockConsole).forEach(key => {
        (mockConsole as any)[key].mockClear();
      });

      // Now set to ERROR level
      logger.setLogLevel(LogLevel.ERROR);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled(); // setLogLevel won't log at ERROR level
      expect(mockConsole.warn).not.toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalledTimes(1); // error message only
    });
  });

  describe('Sensitive Data Masking', () => {
    it('should mask sensitive fields in metadata', () => {
      const metadata = {
        username: 'testuser',
        password: 'secret123',
        apiToken: 'abc123',
        normalField: 'normal value'
      };

      logger.info('Test message', undefined, metadata);

      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.metadata.username).toBe('testuser');
      expect(logEntry.metadata.password).toBe('[MASKED]');
      expect(logEntry.metadata.apiToken).toBe('[MASKED]');
      expect(logEntry.metadata.normalField).toBe('normal value');
    });

    it('should mask sensitive data in nested objects', () => {
      const metadata = {
        user: {
          name: 'testuser',
          password: 'secret123'
        },
        config: {
          apiSecret: 'secret456',
          timeout: 5000
        }
      };

      logger.info('Test message', undefined, metadata);

      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.metadata.user.name).toBe('testuser');
      expect(logEntry.metadata.user.password).toBe('[MASKED]');
      expect(logEntry.metadata.config.apiSecret).toBe('[MASKED]');
      expect(logEntry.metadata.config.timeout).toBe(5000);
    });

    it('should mask sensitive data in arrays', () => {
      const metadata = {
        items: [
          { name: 'item1', secret: 'secret1' },
          { name: 'item2', secret: 'secret2' }
        ]
      };

      logger.info('Test message', undefined, metadata);

      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.metadata.items[0].name).toBe('item1');
      expect(logEntry.metadata.items[0].secret).toBe('[MASKED]');
      expect(logEntry.metadata.items[1].name).toBe('item2');
      expect(logEntry.metadata.items[1].secret).toBe('[MASKED]');
    });
  });

  describe('Performance Timing', () => {
    it('should track operation timing', () => {
      const timerId = logger.startTimer('test-operation', 'correlation-123', { key: 'value' });

      expect(typeof timerId).toBe('string');
      expect(logger.getActiveTimerCount()).toBe(1);

      // Simulate some work
      const duration = logger.endTimer(timerId, { result: 'success' });

      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
      expect(logger.getActiveTimerCount()).toBe(0);

      // Check that performance log was written
      expect(mockConsole.debug).toHaveBeenCalledTimes(1); // Start timer
      expect(mockConsole.info).toHaveBeenCalledTimes(1);  // End timer

      const endLogCall = mockConsole.info.mock.calls[0][0];
      const endLogEntry = JSON.parse(endLogCall);

      expect(endLogEntry.operation).toBe('test-operation');
      expect(endLogEntry.duration).toBe(duration);
      expect(endLogEntry.correlationId).toBe('correlation-123');
      expect(endLogEntry.metadata.key).toBe('value');
      expect(endLogEntry.metadata.result).toBe('success');
    });

    it('should handle invalid timer IDs', () => {
      const duration = logger.endTimer('invalid-timer-id');

      expect(duration).toBeNull();
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
    });

    it('should disable performance logging when configured', () => {
      const noPerformanceLogger = new Logger({
        ...testConfig,
        enablePerformanceLogging: false
      });

      const timerId = noPerformanceLogger.startTimer('test-operation');
      noPerformanceLogger.endTimer(timerId);

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log HTTP requests', () => {
      logger.logHttpRequest('GET', '/api/test', 200, 150, 'correlation-123', {
        userAgent: 'test-agent'
      });

      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.info.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.message).toBe('HTTP GET /api/test - 200');
      expect(logEntry.operation).toBe('http_request');
      expect(logEntry.duration).toBe(150);
      expect(logEntry.correlationId).toBe('correlation-123');
      expect(logEntry.metadata.method).toBe('GET');
      expect(logEntry.metadata.url).toBe('/api/test');
      expect(logEntry.metadata.statusCode).toBe(200);
      expect(logEntry.metadata.userAgent).toBe('test-agent');
    });

    it('should log HTTP requests as warnings for error status codes', () => {
      logger.logHttpRequest('POST', '/api/error', 500, 200);

      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.warn.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.level).toBe('WARN');
      expect(logEntry.message).toBe('HTTP POST /api/error - 500');
    });

    it('should log database operations', () => {
      logger.logDatabaseOperation('SELECT', 'users', 50, 10, 'correlation-123');

      expect(mockConsole.debug).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.debug.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.message).toBe('Database SELECT on users');
      expect(logEntry.operation).toBe('database_operation');
      expect(logEntry.duration).toBe(50);
      expect(logEntry.metadata.operation).toBe('SELECT');
      expect(logEntry.metadata.table).toBe('users');
      expect(logEntry.metadata.rowCount).toBe(10);
    });

    it('should log cache operations', () => {
      logger.logCacheOperation('GET', 'user:123', true, 5, 'correlation-123');

      expect(mockConsole.debug).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.debug.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.message).toBe('Cache GET for user:123 - HIT');
      expect(logEntry.operation).toBe('cache_operation');
      expect(logEntry.duration).toBe(5);
      expect(logEntry.metadata.operation).toBe('GET');
      expect(logEntry.metadata.key).toBe('user:123');
      expect(logEntry.metadata.hit).toBe(true);
    });

    it('should log security events', () => {
      logger.logSecurityEvent('Invalid login attempt', 'high', 'correlation-123', {
        ip: '192.168.1.1',
        username: 'admin'
      });

      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.error.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.level).toBe('ERROR');
      expect(logEntry.message).toBe('Security event: Invalid login attempt');
      expect(logEntry.operation).toBe('security_event');
      expect(logEntry.metadata.event).toBe('Invalid login attempt');
      expect(logEntry.metadata.severity).toBe('high');
      expect(logEntry.metadata.ip).toBe('192.168.1.1');
      expect(logEntry.metadata.username).toBe('admin');
    });

    it('should log critical security events as fatal', () => {
      logger.logSecurityEvent('System compromise detected', 'critical');

      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.error.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.level).toBe('FATAL');
    });
  });

  describe('File Logging', () => {
    it('should write to file when enabled', () => {
      const fileLogger = new Logger({
        ...testConfig,
        enableFile: true,
        filePath: './test.log'
      });

      mockFs.existsSync.mockReturnValue(false);

      fileLogger.info('Test message');

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(path.dirname('./test.log'), { recursive: true });
      expect(mockFs.appendFileSync).toHaveBeenCalledWith('./test.log', expect.stringContaining('"message":"Test message"'));
    });

    it('should handle file write errors gracefully', () => {
      const fileLogger = new Logger({
        ...testConfig,
        enableFile: true,
        filePath: './test.log'
      });

      mockFs.appendFileSync.mockImplementation(() => {
        throw new Error('File write error');
      });

      fileLogger.info('Test message');

      expect(mockConsole.error).toHaveBeenCalledWith('Failed to write to log file:', expect.any(Error));
    });
  });

  describe('Correlation ID Generation', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = Logger.generateCorrelationId();
      const id2 = Logger.generateCorrelationId();

      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1).not.toBe(id2);
      expect(id1.length).toBeGreaterThan(0);
      expect(id2.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Management', () => {
    it('should return current configuration', () => {
      const config = logger.getConfig();

      expect(config).toEqual(testConfig);
      expect(config).not.toBe(testConfig); // Should be a copy
    });

    it('should clear all timers', () => {
      logger.startTimer('timer1');
      logger.startTimer('timer2');

      expect(logger.getActiveTimerCount()).toBe(2);

      logger.clearTimers();

      expect(logger.getActiveTimerCount()).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors with custom codes', () => {
      const error = new Error('Custom error') as any;
      error.code = 'CUSTOM_ERROR';
      error.statusCode = 400;

      logger.error('Error with code', error);

      const logCall = mockConsole.error.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      expect(logEntry.error.code).toBe('CUSTOM_ERROR');
    });

    it('should limit stack trace lines', () => {
      const error = new Error('Test error');
      error.stack = Array(20).fill(0).map((_, i) => `    at line${i}`).join('\n');

      logger.error('Error with long stack', error);

      const logCall = mockConsole.error.mock.calls[0][0];
      const logEntry = JSON.parse(logCall);

      const stackLines = logEntry.error.stack.split('\n');
      expect(stackLines.length).toBeLessThanOrEqual(testConfig.maxStackTraceLines);
    });
  });
});