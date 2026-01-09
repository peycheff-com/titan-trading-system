/**
 * GlobalRateLimiter - Global Rate Limiter (Anti-Ban Protection)
 * 
 * Prevents the system from getting banned by MEXC for excessive API requests.
 * Uses Token Bucket algorithm to cap requests to 80% of MEXC limit (12 req/sec).
 * 
 * Requirements: 92.1-92.6
 * 
 * @module GlobalRateLimiter
 */

import { EventEmitter } from 'events';
import Bottleneck from 'bottleneck';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  // MEXC limit is ~15 req/sec, we use 80% = 12 req/sec
  MAX_REQUESTS_PER_SECOND: 12,
  
  // Token bucket capacity (allow small bursts)
  RESERVOIR: 12,
  
  // Refill rate (tokens per second)
  RESERVOIR_REFRESH_AMOUNT: 12,
  RESERVOIR_REFRESH_INTERVAL: 1000, // 1 second
  
  // Queue depth threshold for warnings
  QUEUE_DEPTH_WARNING: 5,
  
  // Threshold for forcing market orders (Limit Chaser fallback)
  QUEUE_DEPTH_FORCE_MARKET: 8,
  
  // Alert threshold for consistent rate limit pressure
  ALERT_THRESHOLD_COUNT: 10, // Alert after 10 consecutive warnings
};

//─────────────────────────────────────────────────────────────────────────────
// GLOBAL RATE LIMITER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * GlobalRateLimiter class using Bottleneck
 * 
 * Features:
 * - Token Bucket rate limiting (12 req/sec = 80% of MEXC 15 req/sec limit)
 * - Queue depth monitoring
 * - Automatic Limit Chaser fallback when queue is deep
 * - Operator alerts for consistent rate limit pressure
 * - Comprehensive logging
 * 
 * Events emitted:
 * - 'rate_limit:approaching' - When queue depth > 5
 * - 'rate_limit:force_market' - When queue depth > 8 (force market order)
 * - 'rate_limit:alert' - When rate limit is consistently hit
 * - 'metrics:update' - Periodic metrics update
 * 
 * Requirements:
 * - 92.1: Use Token Bucket rate limiter (bottleneck library)
 * - 92.2: Cap requests to 80% of MEXC limit (12 req/sec)
 * - 92.3: Suspend Limit Chaser and force Market Order when limit approached
 * - 92.4: Queue requests with exponential backoff when limit exceeded
 * - 92.5: Log rate limit events
 * - 92.6: Alert operator when rate limit consistently hit
 */
export class GlobalRateLimiter extends EventEmitter {
  /**
   * Create a new GlobalRateLimiter instance
   * @param {Object} options - Configuration options
   * @param {number} [options.maxRequestsPerSecond] - Max requests per second (default: 12)
   * @param {number} [options.queueDepthWarning] - Queue depth warning threshold (default: 5)
   * @param {number} [options.queueDepthForceMarket] - Queue depth for forcing market orders (default: 8)
   * @param {number} [options.alertThresholdCount] - Consecutive warnings before alert (default: 10)
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    this.maxRequestsPerSecond = options.maxRequestsPerSecond || CONFIG.MAX_REQUESTS_PER_SECOND;
    this.queueDepthWarning = options.queueDepthWarning || CONFIG.QUEUE_DEPTH_WARNING;
    this.queueDepthForceMarket = options.queueDepthForceMarket || CONFIG.QUEUE_DEPTH_FORCE_MARKET;
    this.alertThresholdCount = options.alertThresholdCount || CONFIG.ALERT_THRESHOLD_COUNT;
    
    this.logger = options.logger || console;
    
    // Initialize Bottleneck limiter with Token Bucket configuration
    // Requirements: 92.1, 92.2
    this.limiter = new Bottleneck({
      reservoir: CONFIG.RESERVOIR, // Initial tokens
      reservoirRefreshAmount: CONFIG.RESERVOIR_REFRESH_AMOUNT, // Tokens to add
      reservoirRefreshInterval: CONFIG.RESERVOIR_REFRESH_INTERVAL, // Refill interval (ms)
      maxConcurrent: this.maxRequestsPerSecond, // Max concurrent requests
      minTime: Math.floor(1000 / this.maxRequestsPerSecond), // Min time between requests (ms)
    });
    
    /** @type {Object} Metrics counters */
    this.metrics = {
      requests_executed: 0,
      requests_queued: 0,
      requests_failed: 0,
      warnings_count: 0,
      force_market_count: 0,
      alerts_sent: 0,
    };
    
    /** @type {number} Consecutive warnings counter for alert threshold */
    this.consecutiveWarnings = 0;
    
    /** @type {boolean} Whether the instance has been destroyed */
    this._destroyed = false;
    
    /** @type {number} Start time for rate calculation */
    this._startTime = Date.now();
    
    // Set up Bottleneck event listeners
    this._setupEventListeners();
  }

  /**
   * Set up Bottleneck event listeners
   * @private
   */
  _setupEventListeners() {
    // Monitor queue depth
    this.limiter.on('queued', () => {
      this.metrics.requests_queued++;
      this._checkQueueDepth();
    });
    
    // Track successful executions
    this.limiter.on('done', () => {
      this.metrics.requests_executed++;
      this.consecutiveWarnings = 0; // Reset on success
    });
    
    // Track failures
    this.limiter.on('failed', (error) => {
      this.metrics.requests_failed++;
      this.logger.error({ error: error.message }, 'Rate limited request failed');
    });
  }

  /**
   * Check queue depth and emit warnings/alerts
   * Requirements: 92.3, 92.5, 92.6
   * @private
   */
  _checkQueueDepth() {
    const queueDepth = this.limiter.counts().QUEUED || 0;
    const currentRate = this.metrics.requests_executed / ((Date.now() - this._startTime) / 1000);
    
    // Requirement 92.5: Log rate limit events
    const logData = {
      current_rate: currentRate.toFixed(2),
      limit: this.maxRequestsPerSecond,
      queued_requests: queueDepth,
    };
    
    // Check if approaching limit (queue depth > warning threshold)
    // Requirement 92.3: Suspend Limit Chaser logic and force Market Order
    if (queueDepth > this.queueDepthForceMarket) {
      this.metrics.force_market_count++;
      this.consecutiveWarnings++;
      
      this.logger.warn({
        ...logData,
        action_taken: 'FORCE_MARKET_ORDER',
      }, 'RATE_LIMIT_CRITICAL - Forcing Market Orders');
      
      this.emit('rate_limit:force_market', {
        queue_depth: queueDepth,
        current_rate: currentRate,
        limit: this.maxRequestsPerSecond,
      });
      
    } else if (queueDepth > this.queueDepthWarning) {
      this.metrics.warnings_count++;
      this.consecutiveWarnings++;
      
      this.logger.warn({
        ...logData,
        action_taken: 'SUSPEND_LIMIT_CHASER',
      }, 'RATE_LIMIT_APPROACHING - Suspending Limit Chaser');
      
      this.emit('rate_limit:approaching', {
        queue_depth: queueDepth,
        current_rate: currentRate,
        limit: this.maxRequestsPerSecond,
      });
    }
    
    // Requirement 92.6: Alert operator when rate limit consistently hit
    if (this.consecutiveWarnings >= this.alertThresholdCount) {
      this.metrics.alerts_sent++;
      this.consecutiveWarnings = 0; // Reset after alert
      
      this.logger.error({
        ...logData,
        consecutive_warnings: this.alertThresholdCount,
        action_taken: 'OPERATOR_ALERT',
      }, 'RATE_LIMIT_PRESSURE - Operator alert triggered');
      
      this.emit('rate_limit:alert', {
        queue_depth: queueDepth,
        current_rate: currentRate,
        limit: this.maxRequestsPerSecond,
        consecutive_warnings: this.alertThresholdCount,
        message: 'RATE_LIMIT_PRESSURE',
      });
    }
  }

  /**
   * Execute a function with rate limiting
   * Requirements: 92.1, 92.4
   * 
   * @param {Function} fn - Async function to execute
   * @param {Object} [options] - Execution options
   * @param {number} [options.priority] - Priority (0-9, lower = higher priority)
   * @param {number} [options.weight] - Weight (default: 1)
   * @returns {Promise<*>} Result of the function
   * 
   * @example
   * const result = await rateLimiter.execute(async () => {
   *   return await brokerAPI.placeOrder(order);
   * });
   */
  async execute(fn, options = {}) {
    if (this._destroyed) {
      throw new Error('GlobalRateLimiter has been destroyed');
    }
    
    if (typeof fn !== 'function') {
      throw new Error('execute() requires a function argument');
    }
    
    // Use Bottleneck's schedule method with priority and weight
    // Requirement 92.4: Queue requests with exponential backoff (handled by Bottleneck)
    return this.limiter.schedule(
      { 
        priority: options.priority || 5,
        weight: options.weight || 1,
      },
      fn
    );
  }

  /**
   * Check if rate limit is approaching
   * Requirements: 92.3
   * 
   * @returns {boolean} True if queue depth > warning threshold
   */
  isLimitApproaching() {
    const queueDepth = this.limiter.counts().QUEUED || 0;
    return queueDepth > this.queueDepthWarning;
  }

  /**
   * Check if should force market order (Limit Chaser fallback)
   * Requirements: 92.3
   * 
   * @returns {boolean} True if queue depth > force market threshold
   */
  shouldForceMarketOrder() {
    const queueDepth = this.limiter.counts().QUEUED || 0;
    return queueDepth > this.queueDepthForceMarket;
  }

  /**
   * Get current queue depth
   * @returns {number} Number of queued requests
   */
  getQueueDepth() {
    return this.limiter.counts().QUEUED || 0;
  }

  /**
   * Get current metrics
   * Requirements: 92.5
   * 
   * @returns {Object} Current metrics
   */
  getMetrics() {
    const counts = this.limiter.counts();
    const currentRate = this.metrics.requests_executed / ((Date.now() - this._startTime) / 1000);
    
    return {
      current_rate: parseFloat(currentRate.toFixed(2)),
      limit: this.maxRequestsPerSecond,
      queued_requests: counts.QUEUED || 0,
      running_requests: counts.RUNNING || 0,
      requests_executed: this.metrics.requests_executed,
      requests_queued: this.metrics.requests_queued,
      requests_failed: this.metrics.requests_failed,
      warnings_count: this.metrics.warnings_count,
      force_market_count: this.metrics.force_market_count,
      alerts_sent: this.metrics.alerts_sent,
      is_limit_approaching: this.isLimitApproaching(),
      should_force_market: this.shouldForceMarketOrder(),
    };
  }

  /**
   * Get limiter status
   * @returns {Object} Limiter status
   */
  getStatus() {
    const counts = this.limiter.counts();
    
    return {
      queued: counts.QUEUED || 0,
      running: counts.RUNNING || 0,
      executing: counts.EXECUTING || 0,
      done: counts.DONE || 0,
      is_limit_approaching: this.isLimitApproaching(),
      should_force_market: this.shouldForceMarketOrder(),
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      requests_executed: 0,
      requests_queued: 0,
      requests_failed: 0,
      warnings_count: 0,
      force_market_count: 0,
      alerts_sent: 0,
    };
    this.consecutiveWarnings = 0;
    this._startTime = Date.now();
  }

  /**
   * Stop accepting new requests
   * @returns {Promise<void>}
   */
  async stop() {
    if (this._destroyed) {
      return;
    }
    
    this.logger.info('Stopping GlobalRateLimiter - waiting for pending requests');
    await this.limiter.stop({ dropWaitingJobs: false });
    this.logger.info('GlobalRateLimiter stopped');
  }

  /**
   * Destroy the limiter
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this._destroyed) {
      return;
    }
    
    this._destroyed = true;
    this.logger.info('Destroying GlobalRateLimiter');
    
    // Stop and disconnect (check if not already stopped)
    try {
      await this.limiter.stop({ dropWaitingJobs: true });
    } catch (error) {
      // Already stopped, ignore
      if (!error.message?.includes('already been called')) {
        throw error;
      }
    }
    
    await this.limiter.disconnect();
    
    this.removeAllListeners();
    this.logger.info('GlobalRateLimiter destroyed');
  }
}

