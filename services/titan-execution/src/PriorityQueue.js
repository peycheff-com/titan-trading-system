/**
 * PriorityQueue - Priority Queue with Rate Limiting (Thundering Herd Protection)
 * 
 * Handles simultaneous signals from screener with priority ordering and rate limiting.
 * CLOSE signals are processed before OPEN signals to protect existing positions.
 * 
 * Requirements: 69.1-69.7
 * 
 * @module PriorityQueue
 */

import { EventEmitter } from 'events';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Configuration defaults */
const CONFIG = {
  MAX_QUEUE_DEPTH: 50,
  MAX_REQUESTS_PER_SECOND: 5,
  INITIAL_BACKOFF_MS: 1000,
  MAX_BACKOFF_MS: 30000,
  BACKOFF_MULTIPLIER: 2,
};

/** @constant {Object} Signal priorities (lower = higher priority) */
const PRIORITY = {
  CLOSE: 0,       // Highest priority - protect existing positions
  CLOSE_LONG: 0,
  CLOSE_SHORT: 0,
  ABORT: 1,       // Second priority - cancel pending
  OPEN: 2,        // Lowest priority - new positions
  BUY_SETUP: 2,
  SELL_SETUP: 2,
  PREPARE: 2,
  CONFIRM: 2,
};

//─────────────────────────────────────────────────────────────────────────────
// TOKEN BUCKET RATE LIMITER
//─────────────────────────────────────────────────────────────────────────────

/**
 * Token Bucket Rate Limiter
 * Allows bursts up to bucket capacity, then limits to refill rate
 */
class TokenBucket {
  /**
   * @param {number} capacity - Maximum tokens (bucket size)
   * @param {number} refillRate - Tokens added per second
   */
  constructor(capacity, refillRate) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   * @private
   */
  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }

  /**
   * Try to consume a token
   * @returns {boolean} True if token was consumed
   */
  tryConsume() {
    this._refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Get time until next token is available (ms)
   * @returns {number} Milliseconds until next token
   */
  getWaitTime() {
    this._refill();
    if (this.tokens >= 1) {
      return 0;
    }
    return Math.ceil((1 - this.tokens) / this.refillRate * 1000);
  }

  /**
   * Get current token count
   * @returns {number} Available tokens
   */
  getTokens() {
    this._refill();
    return this.tokens;
  }
}

//─────────────────────────────────────────────────────────────────────────────
// PRIORITY QUEUE ITEM
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} QueueItem
 * @property {string} signal_id - Unique signal identifier
 * @property {string} type - Signal type (CLOSE, OPEN, etc.)
 * @property {number} priority - Priority level (lower = higher priority)
 * @property {Object} payload - Full webhook payload
 * @property {number} enqueued_at - Timestamp when enqueued
 * @property {number} retries - Number of retry attempts
 */

//─────────────────────────────────────────────────────────────────────────────
// PRIORITY QUEUE CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * PriorityQueue class with rate limiting
 * 
 * Features:
 * - Priority ordering: CLOSE > ABORT > OPEN
 * - Token bucket rate limiting (default: 5 req/sec)
 * - Queue overflow protection (drops lowest priority)
 * - Exponential backoff on broker 429
 * - Metrics emission
 * 
 * Events emitted:
 * - 'signal:enqueued' - When a signal is added to queue
 * - 'signal:processing' - When a signal starts processing
 * - 'signal:processed' - When a signal completes processing
 * - 'signal:dropped' - When a signal is dropped due to overflow
 * - 'signal:retry' - When a signal is retried after backoff
 * - 'rate_limit:hit' - When rate limit is encountered
 * - 'metrics:update' - Periodic metrics update
 */
export class PriorityQueue extends EventEmitter {
  /**
   * Create a new PriorityQueue instance
   * @param {Object} options - Configuration options
   * @param {number} [options.maxQueueDepth] - Maximum queue size (default: 50)
   * @param {number} [options.maxRequestsPerSecond] - Rate limit (default: 5)
   * @param {number} [options.initialBackoffMs] - Initial backoff (default: 1000ms)
   * @param {number} [options.maxBackoffMs] - Maximum backoff (default: 30000ms)
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    this.maxQueueDepth = options.maxQueueDepth || CONFIG.MAX_QUEUE_DEPTH;
    this.maxRequestsPerSecond = options.maxRequestsPerSecond || CONFIG.MAX_REQUESTS_PER_SECOND;
    this.initialBackoffMs = options.initialBackoffMs || CONFIG.INITIAL_BACKOFF_MS;
    this.maxBackoffMs = options.maxBackoffMs || CONFIG.MAX_BACKOFF_MS;
    
    this.logger = options.logger || console;
    
    /** @type {QueueItem[]} Priority queue (sorted by priority, then enqueue time) */
    this.queue = [];
    
    /** @type {TokenBucket} Rate limiter */
    this.rateLimiter = new TokenBucket(this.maxRequestsPerSecond, this.maxRequestsPerSecond);
    
    /** @type {number} Current backoff in ms (0 = no backoff) */
    this.currentBackoffMs = 0;
    
    /** @type {number} Backoff end timestamp */
    this.backoffUntil = 0;
    
    /** @type {boolean} Whether queue is processing */
    this.isProcessing = false;
    
    /** @type {Function|null} Handler function for processing signals */
    this.handler = null;
    
    /** @type {Object} Metrics counters */
    this.metrics = {
      signals_enqueued: 0,
      signals_processed: 0,
      signals_dropped: 0,
      rate_limit_hits: 0,
      backoff_count: 0,
    };
    
    /** @type {boolean} Whether the instance has been destroyed */
    this._destroyed = false;
  }

  /**
   * Get priority for a signal type
   * @param {string} type - Signal type
   * @returns {number} Priority level
   * @private
   */
  _getPriority(type) {
    const upperType = (type || '').toUpperCase();
    
    // Check for CLOSE variants
    if (upperType.includes('CLOSE')) {
      return PRIORITY.CLOSE;
    }
    
    return PRIORITY[upperType] ?? PRIORITY.OPEN;
  }

  /**
   * Insert item maintaining priority order
   * @param {QueueItem} item - Item to insert
   * @private
   */
  _insertSorted(item) {
    // Find insertion point (binary search would be overkill for queue size <= 50)
    let insertIndex = this.queue.length;
    
    for (let i = 0; i < this.queue.length; i++) {
      const existing = this.queue[i];
      // Lower priority number = higher priority
      // If same priority, earlier enqueue time wins
      if (item.priority < existing.priority || 
          (item.priority === existing.priority && item.enqueued_at < existing.enqueued_at)) {
        insertIndex = i;
        break;
      }
    }
    
    this.queue.splice(insertIndex, 0, item);
  }

  /**
   * Drop lowest priority items when queue overflows
   * Requirements: 69.4 - Drop lowest-priority OPEN signals when queue depth > 50
   * @private
   */
  _handleOverflow() {
    while (this.queue.length > this.maxQueueDepth) {
      // Find lowest priority item (highest priority number, latest enqueue)
      let dropIndex = -1;
      let lowestPriority = -1;
      
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const item = this.queue[i];
        // Only drop OPEN signals (priority >= 2)
        if (item.priority >= PRIORITY.OPEN && item.priority >= lowestPriority) {
          lowestPriority = item.priority;
          dropIndex = i;
        }
      }
      
      if (dropIndex === -1) {
        // No OPEN signals to drop, must drop from end
        dropIndex = this.queue.length - 1;
      }
      
      const dropped = this.queue.splice(dropIndex, 1)[0];
      this.metrics.signals_dropped++;
      
      this.logger.warn({
        signal_id: dropped.signal_id,
        type: dropped.type,
        queue_depth: this.queue.length,
      }, 'QUEUE_OVERFLOW - Signal dropped');
      
      this.emit('signal:dropped', {
        signal_id: dropped.signal_id,
        type: dropped.type,
        reason: 'QUEUE_OVERFLOW',
      });
    }
  }

  /**
   * Enqueue a webhook signal
   * Requirements: 69.1 - Enqueue webhooks in priority queue
   * Requirements: 69.2 - Process CLOSE before OPEN
   * 
   * @param {Object} payload - Webhook payload
   * @param {string} payload.signal_id - Unique signal identifier
   * @param {string} payload.type - Signal type
   * @returns {QueueItem} The enqueued item
   */
  enqueue(payload) {
    if (this._destroyed) {
      throw new Error('PriorityQueue has been destroyed');
    }
    
    const { signal_id, type } = payload;
    
    if (!signal_id) {
      throw new Error('signal_id is required');
    }
    
    const item = {
      signal_id,
      type: type || 'OPEN',
      priority: this._getPriority(type),
      payload,
      enqueued_at: Date.now(),
      retries: 0,
    };
    
    this._insertSorted(item);
    this.metrics.signals_enqueued++;
    
    this.logger.info({
      signal_id,
      type: item.type,
      priority: item.priority,
      queue_depth: this.queue.length,
    }, 'Signal enqueued');
    
    this.emit('signal:enqueued', {
      signal_id,
      type: item.type,
      priority: item.priority,
      queue_depth: this.queue.length,
    });
    
    // Handle overflow
    this._handleOverflow();
    
    // Start processing if not already
    this._scheduleProcessing();
    
    return item;
  }

  /**
   * Set the handler function for processing signals
   * @param {Function} handler - Async function(payload) => result
   */
  setHandler(handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    this.handler = handler;
  }

  /**
   * Schedule queue processing
   * @private
   */
  _scheduleProcessing() {
    if (this.isProcessing || this._destroyed || !this.handler) {
      return;
    }
    
    // Check if in backoff period
    const now = Date.now();
    if (now < this.backoffUntil) {
      const waitTime = this.backoffUntil - now;
      setTimeout(() => this._scheduleProcessing(), waitTime);
      return;
    }
    
    // Check rate limiter
    const waitTime = this.rateLimiter.getWaitTime();
    if (waitTime > 0) {
      setTimeout(() => this._scheduleProcessing(), waitTime);
      return;
    }
    
    this._processNext();
  }

  /**
   * Process next item in queue
   * Requirements: 69.3 - Use Token Bucket rate limiter
   * @private
   */
  async _processNext() {
    if (this._destroyed || this.queue.length === 0 || !this.handler) {
      this.isProcessing = false;
      return;
    }
    
    // Check rate limit
    if (!this.rateLimiter.tryConsume()) {
      this.metrics.rate_limit_hits++;
      this.emit('rate_limit:hit', { queue_depth: this.queue.length });
      
      const waitTime = this.rateLimiter.getWaitTime();
      setTimeout(() => this._processNext(), waitTime);
      return;
    }
    
    this.isProcessing = true;
    const item = this.queue.shift();
    
    this.logger.info({
      signal_id: item.signal_id,
      type: item.type,
      retries: item.retries,
    }, 'Processing signal');
    
    this.emit('signal:processing', {
      signal_id: item.signal_id,
      type: item.type,
    });
    
    try {
      const result = await this.handler(item.payload);
      
      // Check for rate limit response (HTTP 429)
      if (result && result.statusCode === 429) {
        await this._handleRateLimit(item);
        return;
      }
      
      // Success - reset backoff
      this.currentBackoffMs = 0;
      this.metrics.signals_processed++;
      
      this.logger.info({
        signal_id: item.signal_id,
        type: item.type,
      }, 'Signal processed');
      
      this.emit('signal:processed', {
        signal_id: item.signal_id,
        type: item.type,
        result,
      });
      
    } catch (error) {
      // Check if error indicates rate limit
      if (error.statusCode === 429 || error.message?.includes('429')) {
        await this._handleRateLimit(item);
        return;
      }
      
      this.logger.error({
        signal_id: item.signal_id,
        error: error.message,
      }, 'Signal processing failed');
      
      this.emit('signal:error', {
        signal_id: item.signal_id,
        error: error.message,
      });
    }
    
    // Continue processing
    setImmediate(() => this._processNext());
  }

  /**
   * Handle rate limit (HTTP 429) with exponential backoff
   * Requirements: 69.5-69.6 - Pause on 429, exponential backoff
   * 
   * @param {QueueItem} item - Item that triggered rate limit
   * @private
   */
  async _handleRateLimit(item) {
    this.metrics.rate_limit_hits++;
    this.metrics.backoff_count++;
    
    // Calculate backoff with exponential increase
    if (this.currentBackoffMs === 0) {
      this.currentBackoffMs = this.initialBackoffMs;
    } else {
      this.currentBackoffMs = Math.min(
        this.currentBackoffMs * CONFIG.BACKOFF_MULTIPLIER,
        this.maxBackoffMs
      );
    }
    
    this.backoffUntil = Date.now() + this.currentBackoffMs;
    
    this.logger.warn({
      signal_id: item.signal_id,
      backoff_ms: this.currentBackoffMs,
      retries: item.retries,
    }, 'Rate limit hit, backing off');
    
    this.emit('rate_limit:hit', {
      signal_id: item.signal_id,
      backoff_ms: this.currentBackoffMs,
    });
    
    // Re-enqueue the item for retry
    item.retries++;
    this._insertSorted(item);
    
    this.emit('signal:retry', {
      signal_id: item.signal_id,
      retries: item.retries,
      backoff_ms: this.currentBackoffMs,
    });
    
    // Schedule next processing after backoff
    this.isProcessing = false;
    setTimeout(() => this._scheduleProcessing(), this.currentBackoffMs);
  }

  /**
   * Get current queue depth
   * @returns {number} Number of items in queue
   */
  getQueueDepth() {
    return this.queue.length;
  }

  /**
   * Get current metrics
   * Requirements: 69.7 - Emit metrics
   * 
   * @returns {Object} Current metrics
   */
  getMetrics() {
    return {
      queue_depth: this.queue.length,
      signals_enqueued: this.metrics.signals_enqueued,
      signals_processed: this.metrics.signals_processed,
      signals_dropped: this.metrics.signals_dropped,
      rate_limit_hits: this.metrics.rate_limit_hits,
      backoff_count: this.metrics.backoff_count,
      current_backoff_ms: this.currentBackoffMs,
      tokens_available: this.rateLimiter.getTokens(),
    };
  }

  /**
   * Get queue status
   * @returns {Object} Queue status
   */
  getStatus() {
    return {
      queue_depth: this.queue.length,
      is_processing: this.isProcessing,
      in_backoff: Date.now() < this.backoffUntil,
      backoff_remaining_ms: Math.max(0, this.backoffUntil - Date.now()),
      has_handler: this.handler !== null,
    };
  }

  /**
   * Peek at next item without removing
   * @returns {QueueItem|null} Next item or null
   */
  peek() {
    return this.queue.length > 0 ? { ...this.queue[0] } : null;
  }

  /**
   * Clear the queue
   * @returns {number} Number of items cleared
   */
  clear() {
    const count = this.queue.length;
    this.queue = [];
    this.logger.info({ cleared: count }, 'Queue cleared');
    return count;
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      signals_enqueued: 0,
      signals_processed: 0,
      signals_dropped: 0,
      rate_limit_hits: 0,
      backoff_count: 0,
    };
  }

  /**
   * Destroy the queue
   */
  destroy() {
    this._destroyed = true;
    this.isProcessing = false;
    this.queue = [];
    this.handler = null;
    this.removeAllListeners();
    this.logger.info('PriorityQueue destroyed');
  }
}

// Export TokenBucket for testing
export { TokenBucket, PRIORITY };
