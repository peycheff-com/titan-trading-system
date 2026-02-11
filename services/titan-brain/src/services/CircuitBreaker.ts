/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
/**
 * CircuitBreaker - Circuit breaker pattern implementation for fault tolerance
 *
 * Implements the circuit breaker pattern to prevent cascade failures
 * when calling external services. Provides automatic recovery and
 * configurable failure thresholds.
 *
 * Requirements: 2.1.2, 2.1.3, 2.1.4
 */

import { EventEmitter } from 'events';
import { Logger } from '../logging/Logger.js';

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  CLOSED = 'closed', // Normal operation
  OPEN = 'open', // Failing fast
  HALF_OPEN = 'half-open', // Testing recovery
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  recoveryTimeout: number; // Time to wait before trying half-open (ms)
  requestTimeout: number; // Individual request timeout (ms)
  monitoringPeriod: number; // Time window for failure counting (ms)
  halfOpenMaxCalls: number; // Max calls to allow in half-open state
  name: string; // Circuit breaker name for logging
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  nextAttemptTime: number | null;
  halfOpenCallsCount: number;
}

/**
 * Circuit breaker error
 */
export class CircuitBreakerError extends Error {
  constructor(
    message: string,
    public readonly state: CircuitBreakerState,
    public readonly stats: CircuitBreakerStats,
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime: number | null = null;
  private lastSuccessTime: number | null = null;
  private nextAttemptTime: number | null = null;
  private halfOpenCallsCount: number = 0;
  private config: CircuitBreakerConfig;
  private logger: Logger;

  constructor(config: CircuitBreakerConfig, logger?: Logger) {
    super();
    this.config = config;
    this.logger = logger ?? Logger.getInstance(`circuit-breaker-${config.name}`);

    this.logger.info('Circuit breaker initialized', undefined, {
      name: config.name,
      failureThreshold: config.failureThreshold,
      recoveryTimeout: config.recoveryTimeout,
      requestTimeout: config.requestTimeout,
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit breaker allows the call
    if (!this.canExecute()) {
      const error = new CircuitBreakerError(
        `Circuit breaker is ${this.state}`,
        this.state,
        this.getStats(),
      );

      this.logger.warn('Circuit breaker blocked request', undefined, {
        state: this.state,
        failureCount: this.failureCount,
        nextAttemptTime: this.nextAttemptTime,
      });

      throw error;
    }

    this.totalRequests++;

    // Track half-open calls
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.halfOpenCallsCount++;
    }

    const startTime = Date.now();

    try {
      // Execute with timeout
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeout),
        ),
      ]);

      // Success
      this.onSuccess();

      const duration = Date.now() - startTime;
      this.logger.debug('Circuit breaker request succeeded', undefined, {
        duration,
        state: this.state,
        successCount: this.successCount,
      });

      return result;
    } catch (error) {
      // Failure
      this.onFailure(error);

      const duration = Date.now() - startTime;
      this.logger.warn('Circuit breaker request failed', undefined, {
        duration,
        state: this.state,
        failureCount: this.failureCount,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Check if circuit breaker allows execution
   */
  private canExecute(): boolean {
    const now = Date.now();

    switch (this.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if recovery timeout has passed
        if (this.nextAttemptTime && now >= this.nextAttemptTime) {
          this.transitionToHalfOpen();
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        // Allow limited calls in half-open state
        return this.halfOpenCallsCount < this.config.halfOpenMaxCalls;

      default:
        return false;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.successCount++;

    this.lastSuccessTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      // If we've had enough successful calls, close the circuit
      if (this.halfOpenCallsCount >= this.config.halfOpenMaxCalls) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success in closed state

      this.failureCount = 0;
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(error: unknown): void {
    this.failureCount++;

    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.CLOSED) {
      // Check if we should open the circuit
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    } else if (this.state === CircuitBreakerState.HALF_OPEN) {
      // Any failure in half-open state opens the circuit
      this.transitionToOpen();
    }
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const previousState = this.state;

    this.state = CircuitBreakerState.CLOSED;

    this.failureCount = 0;

    this.halfOpenCallsCount = 0;

    this.nextAttemptTime = null;

    this.logger.info('Circuit breaker transitioned to CLOSED', undefined, {
      previousState,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
    });

    this.emit('stateChange', {
      from: previousState,
      to: this.state,
      stats: this.getStats(),
    });
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const previousState = this.state;

    this.state = CircuitBreakerState.OPEN;

    this.nextAttemptTime = Date.now() + this.config.recoveryTimeout;

    this.halfOpenCallsCount = 0;

    this.logger.warn('Circuit breaker transitioned to OPEN', undefined, {
      previousState,
      failureCount: this.failureCount,
      nextAttemptTime: this.nextAttemptTime,
      recoveryTimeout: this.config.recoveryTimeout,
    });

    this.emit('stateChange', {
      from: previousState,
      to: this.state,
      stats: this.getStats(),
    });
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const previousState = this.state;

    this.state = CircuitBreakerState.HALF_OPEN;

    this.halfOpenCallsCount = 0;

    this.nextAttemptTime = null;

    this.logger.info('Circuit breaker transitioned to HALF_OPEN', undefined, {
      previousState,
      maxCalls: this.config.halfOpenMaxCalls,
    });

    this.emit('stateChange', {
      from: previousState,
      to: this.state,
      stats: this.getStats(),
    });
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextAttemptTime: this.nextAttemptTime,
      halfOpenCallsCount: this.halfOpenCallsCount,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Check if circuit breaker is healthy
   */
  isHealthy(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }

  /**
   * Force circuit breaker to CLOSED state (for testing/admin)
   */
  forceClose(): void {
    this.logger.info('Circuit breaker force closed by admin');
    this.transitionToClosed();
  }

  /**
   * Force circuit breaker to OPEN state (for testing/admin)
   */
  forceOpen(): void {
    this.logger.info('Circuit breaker force opened by admin');
    this.transitionToOpen();
  }

  /**
   * Reset circuit breaker statistics
   */
  reset(): void {
    this.failureCount = 0;

    this.successCount = 0;

    this.totalRequests = 0;

    this.lastFailureTime = null;

    this.lastSuccessTime = null;

    this.halfOpenCallsCount = 0;

    this.logger.info('Circuit breaker statistics reset');

    this.emit('reset', { stats: this.getStats() });
  }

  /**
   * Get failure rate (0-1)
   */
  getFailureRate(): number {
    if (this.totalRequests === 0) return 0;
    return this.failureCount / this.totalRequests;
  }

  /**
   * Get success rate (0-1)
   */
  getSuccessRate(): number {
    if (this.totalRequests === 0) return 0;
    return this.successCount / this.totalRequests;
  }

  /**
   * Check if circuit breaker is in monitoring period
   */
  isInMonitoringPeriod(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime < this.config.monitoringPeriod;
  }

  /**
   * Get time until next attempt (for OPEN state)
   */
  getTimeUntilNextAttempt(): number {
    if (this.state !== CircuitBreakerState.OPEN || !this.nextAttemptTime) {
      return 0;
    }
    return Math.max(0, this.nextAttemptTime - Date.now());
  }
}

/**
 * Default circuit breaker configurations for different service types
 */
export const CircuitBreakerDefaults = {
  /**
   * Configuration for HTTP services
   */
  http: {
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30 seconds
    requestTimeout: 10000, // 10 seconds
    monitoringPeriod: 60000, // 1 minute
    halfOpenMaxCalls: 3,
    name: 'http-service',
  },

  /**
   * Configuration for database services
   */
  database: {
    failureThreshold: 3,
    recoveryTimeout: 60000, // 1 minute
    requestTimeout: 5000, // 5 seconds
    monitoringPeriod: 300000, // 5 minutes
    halfOpenMaxCalls: 2,
    name: 'database-service',
  },

  /**
   * Configuration for cache services (Redis)
   */
  cache: {
    failureThreshold: 10,
    recoveryTimeout: 15000, // 15 seconds
    requestTimeout: 2000, // 2 seconds
    monitoringPeriod: 60000, // 1 minute
    halfOpenMaxCalls: 5,
    name: 'cache-service',
  },

  /**
   * Configuration for external APIs
   */
  externalApi: {
    failureThreshold: 3,
    recoveryTimeout: 120000, // 2 minutes
    requestTimeout: 15000, // 15 seconds
    monitoringPeriod: 300000, // 5 minutes
    halfOpenMaxCalls: 2,
    name: 'external-api',
  },
} as const;
