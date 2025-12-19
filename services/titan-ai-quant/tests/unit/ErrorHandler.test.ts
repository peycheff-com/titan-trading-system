/**
 * ErrorHandler Unit Tests
 * 
 * Tests for centralized error handling utilities
 * Task 15: Add Error Handling
 */

import {
  TitanError,
  ErrorCode,
  getUserFriendlyMessage,
  calculateBackoffDelay,
  withRetry,
  isRetryableError,
  classifyError,
  ErrorLogger,
} from '../../src/utils/ErrorHandler';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';


describe('ErrorHandler', () => {
  describe('TitanError', () => {
    it('should create error with code and message', () => {
      const error = new TitanError(ErrorCode.RATE_LIMIT, 'Rate limit exceeded');
      
      expect(error.code).toBe(ErrorCode.RATE_LIMIT);
      expect(error.message).toBe('Rate limit exceeded');
      expect(error.name).toBe('TitanError');
      expect(error.timestamp).toBeDefined();
    });

    it('should include context when provided', () => {
      const context = { attempt: 3, maxRetries: 5 };
      const error = new TitanError(ErrorCode.SERVER_ERROR, 'Server error', context);
      
      expect(error.context).toEqual(context);
    });

    it('should mark error as retryable when specified', () => {
      const retryableError = new TitanError(ErrorCode.RATE_LIMIT, 'Rate limit', undefined, true);
      const nonRetryableError = new TitanError(ErrorCode.CONFIG_PARSE_ERROR, 'Parse error', undefined, false);
      
      expect(retryableError.isRetryable).toBe(true);
      expect(nonRetryableError.isRetryable).toBe(false);
    });

    it('should return user-friendly message', () => {
      const error = new TitanError(ErrorCode.RATE_LIMIT, 'Technical details');
      const userMessage = error.getUserMessage();
      
      expect(userMessage).toContain('temporarily busy');
    });

    it('should convert to JSON for logging', () => {
      const error = new TitanError(ErrorCode.TIMEOUT, 'Timeout', { attempt: 1 }, true);
      const json = error.toJSON();
      
      expect(json.name).toBe('TitanError');
      expect(json.code).toBe(ErrorCode.TIMEOUT);
      expect(json.message).toBe('Timeout');
      expect(json.context).toEqual({ attempt: 1 });
      expect(json.isRetryable).toBe(true);
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('getUserFriendlyMessage', () => {
    it('should return user-friendly message for each error code', () => {
      expect(getUserFriendlyMessage(ErrorCode.RATE_LIMIT)).toContain('temporarily busy');
      expect(getUserFriendlyMessage(ErrorCode.SERVER_ERROR)).toContain('retry');
      expect(getUserFriendlyMessage(ErrorCode.TIMEOUT)).toContain('timed out');
      expect(getUserFriendlyMessage(ErrorCode.DB_BUSY)).toContain('busy');
      expect(getUserFriendlyMessage(ErrorCode.CONFIG_PARSE_ERROR)).toContain('invalid format');
      expect(getUserFriendlyMessage(ErrorCode.UNKNOWN_COMMAND)).toContain('/help');
    });

    it('should append details when provided', () => {
      const message = getUserFriendlyMessage(ErrorCode.INVALID_SYMBOL, 'XYZ123');
      
      expect(message).toContain('Invalid trading symbol');
      expect(message).toContain('XYZ123');
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff', () => {
      const delay0 = calculateBackoffDelay(0, { initialDelayMs: 1000, multiplier: 2, jitter: 0 });
      const delay1 = calculateBackoffDelay(1, { initialDelayMs: 1000, multiplier: 2, jitter: 0 });
      const delay2 = calculateBackoffDelay(2, { initialDelayMs: 1000, multiplier: 2, jitter: 0 });
      
      expect(delay0).toBe(1000);
      expect(delay1).toBe(2000);
      expect(delay2).toBe(4000);
    });

    it('should cap at max delay', () => {
      const delay = calculateBackoffDelay(10, { 
        initialDelayMs: 1000, 
        multiplier: 2, 
        maxDelayMs: 5000,
        jitter: 0 
      });
      
      expect(delay).toBe(5000);
    });

    it('should add jitter when specified', () => {
      const delays = new Set<number>();
      
      // Run multiple times to check jitter adds variation
      for (let i = 0; i < 10; i++) {
        delays.add(calculateBackoffDelay(1, { 
          initialDelayMs: 1000, 
          multiplier: 2, 
          jitter: 0.5 
        }));
      }
      
      // With jitter, we should get some variation
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe('isRetryableError', () => {
    it('should return true for TitanError marked as retryable', () => {
      const error = new TitanError(ErrorCode.RATE_LIMIT, 'Rate limit', undefined, true);
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for TitanError not marked as retryable', () => {
      const error = new TitanError(ErrorCode.CONFIG_PARSE_ERROR, 'Parse error', undefined, false);
      expect(isRetryableError(error)).toBe(false);
    });

    it('should detect retryable errors from message', () => {
      expect(isRetryableError(new Error('429 Too Many Requests'))).toBe(true);
      expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
      expect(isRetryableError(new Error('500 Internal Server Error'))).toBe(true);
      expect(isRetryableError(new Error('503 Service Unavailable'))).toBe(true);
      expect(isRetryableError(new Error('timeout'))).toBe(true);
      expect(isRetryableError(new Error('network error'))).toBe(true);
      expect(isRetryableError(new Error('SQLITE_BUSY'))).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      expect(isRetryableError(new Error('Invalid JSON'))).toBe(false);
      expect(isRetryableError(new Error('File not found'))).toBe(false);
    });
  });

  describe('classifyError', () => {
    it('should return TitanError unchanged', () => {
      const original = new TitanError(ErrorCode.RATE_LIMIT, 'Rate limit');
      const classified = classifyError(original);
      
      expect(classified).toBe(original);
    });

    it('should classify rate limit errors', () => {
      const error = classifyError(new Error('429 Too Many Requests'));
      
      expect(error.code).toBe(ErrorCode.RATE_LIMIT);
      expect(error.isRetryable).toBe(true);
    });

    it('should classify server errors', () => {
      const error = classifyError(new Error('500 Internal Server Error'));
      
      expect(error.code).toBe(ErrorCode.SERVER_ERROR);
      expect(error.isRetryable).toBe(true);
    });

    it('should classify timeout errors', () => {
      const error = classifyError(new Error('Request timeout'));
      
      expect(error.code).toBe(ErrorCode.TIMEOUT);
      expect(error.isRetryable).toBe(true);
    });

    it('should classify database busy errors', () => {
      const error = classifyError(new Error('SQLITE_BUSY'));
      
      expect(error.code).toBe(ErrorCode.DB_BUSY);
      expect(error.isRetryable).toBe(true);
    });

    it('should classify JSON parse errors', () => {
      const error = classifyError(new Error('JSON parse error: unexpected token'));
      
      expect(error.code).toBe(ErrorCode.CONFIG_PARSE_ERROR);
      expect(error.isRetryable).toBe(false);
    });

    it('should classify unknown errors', () => {
      const error = classifyError(new Error('Something went wrong'));
      
      expect(error.code).toBe(ErrorCode.UNKNOWN);
      expect(error.isRetryable).toBe(false);
    });

    it('should handle non-Error values', () => {
      const error = classifyError('string error');
      
      expect(error.code).toBe(ErrorCode.UNKNOWN);
      expect(error.message).toBe('string error');
    });
  });

  describe('withRetry', () => {
    it('should return result on success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(fn, { maxRetries: 3 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('429 Rate limit'))
        .mockResolvedValue('success');
      
      const result = await withRetry(fn, { 
        maxRetries: 3, 
        initialDelayMs: 10,
        jitter: 0 
      });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('429 Rate limit'));
      
      await expect(withRetry(fn, { 
        maxRetries: 2, 
        initialDelayMs: 10,
        jitter: 0 
      })).rejects.toThrow('429 Rate limit');
      
      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Invalid config'));
      
      await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('Invalid config');
      
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use custom shouldRetry function', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Custom error'))
        .mockResolvedValue('success');
      
      const shouldRetry = jest.fn().mockReturnValue(true);
      
      const result = await withRetry(fn, { 
        maxRetries: 3, 
        initialDelayMs: 10,
        jitter: 0 
      }, shouldRetry);
      
      expect(result).toBe('success');
      expect(shouldRetry).toHaveBeenCalled();
    });
  });

  describe('ErrorLogger', () => {
    let tempDir: string;
    let logPath: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'titan-test-'));
      logPath = path.join(tempDir, 'test-errors.log');
    });

    afterEach(() => {
      // Clean up temp directory
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true });
      }
    });

    it('should create log directory if it does not exist', () => {
      const nestedLogPath = path.join(tempDir, 'nested', 'dir', 'errors.log');
      const logger = new ErrorLogger({ logPath: nestedLogPath });
      
      const error = new TitanError(ErrorCode.RATE_LIMIT, 'Test error');
      logger.log(error);
      
      expect(fs.existsSync(nestedLogPath)).toBe(true);
    });

    it('should log TitanError to file', () => {
      const logger = new ErrorLogger({ logPath });
      const error = new TitanError(ErrorCode.RATE_LIMIT, 'Test error', { test: true });
      
      logger.log(error, { additionalContext: 'value' });
      
      const content = fs.readFileSync(logPath, 'utf-8');
      const logEntry = JSON.parse(content.trim());
      
      expect(logEntry.code).toBe(ErrorCode.RATE_LIMIT);
      expect(logEntry.message).toBe('Test error');
      // Context from TitanError is in the error's context field
      expect(logEntry.context).toEqual({ additionalContext: 'value' });
      expect(logEntry.timestamp).toBeDefined();
    });

    it('should log regular Error to file', () => {
      const logger = new ErrorLogger({ logPath });
      const error = new Error('Regular error');
      
      logger.log(error);
      
      const content = fs.readFileSync(logPath, 'utf-8');
      const logEntry = JSON.parse(content.trim());
      
      expect(logEntry.name).toBe('Error');
      expect(logEntry.message).toBe('Regular error');
    });

    it('should log with severity level', () => {
      const logger = new ErrorLogger({ logPath });
      
      logger.logWithLevel('error', 'Error message', { key: 'value' });
      
      const content = fs.readFileSync(logPath, 'utf-8');
      const logEntry = JSON.parse(content.trim());
      
      expect(logEntry.level).toBe('error');
      expect(logEntry.message).toBe('Error message');
      expect(logEntry.context).toEqual({ key: 'value' });
    });

    it('should append multiple log entries', () => {
      const logger = new ErrorLogger({ logPath });
      
      logger.log(new TitanError(ErrorCode.RATE_LIMIT, 'Error 1'));
      logger.log(new TitanError(ErrorCode.TIMEOUT, 'Error 2'));
      
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).code).toBe(ErrorCode.RATE_LIMIT);
      expect(JSON.parse(lines[1]).code).toBe(ErrorCode.TIMEOUT);
    });
  });
});
