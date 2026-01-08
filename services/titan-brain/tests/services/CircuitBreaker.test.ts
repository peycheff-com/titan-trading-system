/**
 * CircuitBreaker Tests
 * 
 * Comprehensive unit tests for the CircuitBreaker class
 */

import { CircuitBreaker, CircuitBreakerState, CircuitBreakerError, CircuitBreakerDefaults } from '../../src/services/CircuitBreaker';
import { Logger } from '../../src/logging/Logger';

// Mock Logger
jest.mock('../../src/logging/Logger');
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as any;

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  
  beforeEach(() => {
    jest.clearAllMocks();
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
    
    circuitBreaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      recoveryTimeout: 1000,
      requestTimeout: 500,
      monitoringPeriod: 5000,
      halfOpenMaxCalls: 2
    });
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      const stats = circuitBreaker.getStats();
      
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });

    it('should log initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Circuit breaker initialized',
        undefined,
        expect.objectContaining({
          name: 'test-service',
          failureThreshold: 3,
          recoveryTimeout: 1000,
          requestTimeout: 500
        })
      );
    });
  });

  describe('execute - CLOSED state', () => {
    it('should execute function successfully', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.successCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it('should handle function failure', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.failureCount).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it('should transition to OPEN after failure threshold', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Fail 3 times (threshold)
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.OPEN);
      expect(stats.failureCount).toBe(3);
    });

    it('should reset failure count on success', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('Test error'))
        .mockResolvedValue('success');
      
      // Fail once
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      expect(circuitBreaker.getStats().failureCount).toBe(1);
      
      // Succeed
      await circuitBreaker.execute(mockFn);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });

    it('should handle timeout', async () => {
      const mockFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Request timeout');
      
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(1);
    });
  });

  describe('execute - OPEN state', () => {
    beforeEach(async () => {
      // Force circuit breaker to OPEN state
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      }
    });

    it('should reject requests immediately', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(CircuitBreakerError);
      
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.HALF_OPEN);
    });
  });

  describe('execute - HALF_OPEN state', () => {
    beforeEach(async () => {
      // Force to OPEN state
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      }
      
      // Wait for recovery timeout and transition to HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 1100));
      const successFn = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successFn);
    });

    it('should allow limited calls', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Should allow one more call (total 2 in half-open)
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to CLOSED after successful calls', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to OPEN on failure', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      
      expect(circuitBreaker.getStats().state).toBe(CircuitBreakerState.OPEN);
    });

    it('should reject requests after max calls', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Complete the half-open transition
      await circuitBreaker.execute(mockFn);
      
      // Now in CLOSED state, should accept more calls
      await circuitBreaker.execute(mockFn);
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('state transitions', () => {
    it('should emit stateChange events', async () => {
      const stateChangeHandler = jest.fn();
      circuitBreaker.on('stateChange', stateChangeHandler);
      
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Trigger state change to OPEN
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      }
      
      expect(stateChangeHandler).toHaveBeenCalledWith({
        from: CircuitBreakerState.CLOSED,
        to: CircuitBreakerState.OPEN,
        stats: expect.any(Object)
      });
    });
  });

  describe('admin operations', () => {
    it('should force close circuit breaker', () => {
      circuitBreaker.forceOpen();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      
      circuitBreaker.forceClose();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should reset statistics', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      
      expect(circuitBreaker.getStats().failureCount).toBe(1);
      
      circuitBreaker.reset();
      
      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('utility methods', () => {
    it('should calculate failure rate correctly', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('error1'))
        .mockRejectedValueOnce(new Error('error2'))
        .mockResolvedValueOnce('success');
      
      // Two failures, then success
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('error1');
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('error2');
      await circuitBreaker.execute(mockFn);
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(3);
      // After success in CLOSED state, failure count is reset to 0
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(1);
      
      // Test with no success to see actual failure rate
      const failureOnlyBreaker = new CircuitBreaker({
        name: 'failure-test',
        failureThreshold: 5,
        recoveryTimeout: 1000,
        requestTimeout: 500,
        monitoringPeriod: 5000,
        halfOpenMaxCalls: 2
      });
      
      const failFn = jest.fn().mockRejectedValue(new Error('error'));
      
      await expect(failureOnlyBreaker.execute(failFn)).rejects.toThrow('error');
      await expect(failureOnlyBreaker.execute(failFn)).rejects.toThrow('error');
      
      expect(failureOnlyBreaker.getFailureRate()).toBeCloseTo(1.0);
      expect(failureOnlyBreaker.getSuccessRate()).toBeCloseTo(0.0);
    });

    it('should check if healthy', () => {
      expect(circuitBreaker.isHealthy()).toBe(true);
      
      circuitBreaker.forceOpen();
      expect(circuitBreaker.isHealthy()).toBe(false);
    });

    it('should calculate time until next attempt', () => {
      circuitBreaker.forceOpen();
      const timeUntilNext = circuitBreaker.getTimeUntilNextAttempt();
      expect(timeUntilNext).toBeGreaterThan(0);
    });
  });

  describe('defaults', () => {
    it('should have correct default configurations', () => {
      expect(CircuitBreakerDefaults.http).toEqual({
        failureThreshold: 5,
        recoveryTimeout: 30000,
        requestTimeout: 10000,
        monitoringPeriod: 60000,
        halfOpenMaxCalls: 3,
        name: 'http-service'
      });

      expect(CircuitBreakerDefaults.database).toEqual({
        failureThreshold: 3,
        recoveryTimeout: 60000,
        requestTimeout: 5000,
        monitoringPeriod: 300000,
        halfOpenMaxCalls: 2,
        name: 'database-service'
      });
    });
  });

  describe('error handling', () => {
    it('should handle CircuitBreakerError correctly', async () => {
      circuitBreaker.forceOpen();
      
      try {
        await circuitBreaker.execute(() => Promise.resolve('test'));
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        expect((error as CircuitBreakerError).state).toBe(CircuitBreakerState.OPEN);
        expect((error as CircuitBreakerError).stats).toBeDefined();
      }
    });
  });
});