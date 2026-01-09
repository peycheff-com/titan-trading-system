/**
 * WebSocket Optimizer
 * 
 * Provides batching and compression for WebSocket updates to reduce
 * network overhead and improve performance.
 * 
 * Features:
 * - Message batching: Collects updates and sends them in batches
 * - Payload compression: Compresses large payloads using zlib
 * - Delta updates: Only sends changed fields when possible
 * 
 * Requirements: System Integration 3.1-3.5
 * 
 * @module WebSocketOptimizer
 */

import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {Object} Default configuration */
const DEFAULT_CONFIG = {
  /** Batch interval in milliseconds */
  batchIntervalMs: 50,
  /** Maximum batch size before forced flush */
  maxBatchSize: 100,
  /** Minimum payload size (bytes) to trigger compression */
  compressionThreshold: 1024,
  /** Enable delta updates (only send changed fields) */
  enableDeltaUpdates: true,
  /** Maximum age of cached state for delta calculation (ms) */
  deltaStateTtlMs: 5000,
};

/** @constant {string} Compression header marker */
const COMPRESSION_MARKER = '__compressed__';

//─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET OPTIMIZER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * WebSocket Optimizer for batching and compressing updates
 */
export class WebSocketOptimizer {
  /**
   * Create a new WebSocketOptimizer instance
   * @param {Object} options - Configuration options
   * @param {number} [options.batchIntervalMs=50] - Batch interval in ms
   * @param {number} [options.maxBatchSize=100] - Max messages per batch
   * @param {number} [options.compressionThreshold=1024] - Min bytes for compression
   * @param {boolean} [options.enableDeltaUpdates=true] - Enable delta updates
   * @param {number} [options.deltaStateTtlMs=5000] - Delta state TTL
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.logger = options.logger || console;
    
    /** @type {Map<string, Array>} Pending batches by channel */
    this._pendingBatches = new Map();
    
    /** @type {Map<string, NodeJS.Timeout>} Batch timers by channel */
    this._batchTimers = new Map();
    
    /** @type {Map<string, Object>} Last state by channel for delta calculation */
    this._lastState = new Map();
    
    /** @type {Map<string, number>} Last state timestamp by channel */
    this._lastStateTime = new Map();
    
    /** @type {Object} Statistics */
    this._stats = {
      messagesBatched: 0,
      batchesSent: 0,
      bytesBeforeCompression: 0,
      bytesAfterCompression: 0,
      deltaUpdatesGenerated: 0,
      fullUpdatesGenerated: 0,
    };
  }

  //─────────────────────────────────────────────────────────────────────────────
  // BATCHING
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Queue a message for batched sending
   * @param {string} channel - Channel/topic identifier
   * @param {Object} message - Message to queue
   * @param {Function} sendFn - Function to call with batched messages
   * @returns {void}
   */
  queueMessage(channel, message, sendFn) {
    if (!this._pendingBatches.has(channel)) {
      this._pendingBatches.set(channel, []);
    }
    
    const batch = this._pendingBatches.get(channel);
    batch.push(message);
    this._stats.messagesBatched++;
    
    // Force flush if batch is full
    if (batch.length >= this.config.maxBatchSize) {
      this._flushBatch(channel, sendFn);
      return;
    }
    
    // Start timer if not already running
    if (!this._batchTimers.has(channel)) {
      const timer = setTimeout(() => {
        this._flushBatch(channel, sendFn);
      }, this.config.batchIntervalMs);
      this._batchTimers.set(channel, timer);
    }
  }

  /**
   * Flush pending batch for a channel
   * @param {string} channel - Channel identifier
   * @param {Function} sendFn - Function to call with batched messages
   * @private
   */
  _flushBatch(channel, sendFn) {
    // Clear timer
    const timer = this._batchTimers.get(channel);
    if (timer) {
      clearTimeout(timer);
      this._batchTimers.delete(channel);
    }
    
    // Get and clear batch
    const batch = this._pendingBatches.get(channel);
    if (!batch || batch.length === 0) {
      return;
    }
    this._pendingBatches.set(channel, []);
    
    // Send batch
    try {
      if (batch.length === 1) {
        // Single message, no need to wrap
        sendFn(batch[0]);
      } else {
        // Multiple messages, wrap in batch envelope
        sendFn({
          type: 'BATCH',
          channel,
          messages: batch,
          count: batch.length,
          timestamp: new Date().toISOString(),
        });
      }
      this._stats.batchesSent++;
    } catch (error) {
      this.logger.error?.({ error: error.message, channel }, 'Failed to send batch');
    }
  }

  /**
   * Flush all pending batches immediately
   * @param {Function} sendFn - Function to call with batched messages
   */
  flushAll(sendFn) {
    for (const channel of this._pendingBatches.keys()) {
      this._flushBatch(channel, sendFn);
    }
  }

  //─────────────────────────────────────────────────────────────────────────────
  // COMPRESSION
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Compress a message payload if it exceeds threshold
   * @param {Object} message - Message to potentially compress
   * @returns {Promise<Object|string>} Original message or compressed payload
   */
  async compressIfNeeded(message) {
    const jsonStr = JSON.stringify(message);
    const byteSize = Buffer.byteLength(jsonStr, 'utf8');
    
    this._stats.bytesBeforeCompression += byteSize;
    
    if (byteSize < this.config.compressionThreshold) {
      this._stats.bytesAfterCompression += byteSize;
      return message;
    }
    
    try {
      const compressed = await gzip(Buffer.from(jsonStr, 'utf8'));
      const compressedSize = compressed.length;
      
      // Only use compression if it actually reduces size
      if (compressedSize >= byteSize) {
        this._stats.bytesAfterCompression += byteSize;
        return message;
      }
      
      this._stats.bytesAfterCompression += compressedSize;
      
      return {
        [COMPRESSION_MARKER]: true,
        data: compressed.toString('base64'),
        originalSize: byteSize,
        compressedSize,
      };
    } catch (error) {
      this.logger.error?.({ error: error.message }, 'Compression failed');
      this._stats.bytesAfterCompression += byteSize;
      return message;
    }
  }

  /**
   * Decompress a compressed payload
   * @param {Object} payload - Potentially compressed payload
   * @returns {Promise<Object>} Decompressed message
   */
  async decompress(payload) {
    if (!payload || !payload[COMPRESSION_MARKER]) {
      return payload;
    }
    
    try {
      const compressed = Buffer.from(payload.data, 'base64');
      const decompressed = await gunzip(compressed);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (error) {
      this.logger.error?.({ error: error.message }, 'Decompression failed');
      throw error;
    }
  }

  /**
   * Check if a payload is compressed
   * @param {Object} payload - Payload to check
   * @returns {boolean} True if compressed
   */
  isCompressed(payload) {
    return payload && payload[COMPRESSION_MARKER] === true;
  }

  //─────────────────────────────────────────────────────────────────────────────
  // DELTA UPDATES
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate a delta update (only changed fields)
   * @param {string} channel - Channel identifier
   * @param {Object} newState - New state object
   * @returns {Object} Delta update or full state if no previous state
   */
  generateDelta(channel, newState) {
    if (!this.config.enableDeltaUpdates) {
      this._stats.fullUpdatesGenerated++;
      return { ...newState, _delta: false };
    }
    
    const lastState = this._lastState.get(channel);
    const lastTime = this._lastStateTime.get(channel);
    const now = Date.now();
    
    // Check if we have valid previous state
    if (!lastState || !lastTime || (now - lastTime) > this.config.deltaStateTtlMs) {
      // No valid previous state, send full update
      this._lastState.set(channel, { ...newState });
      this._lastStateTime.set(channel, now);
      this._stats.fullUpdatesGenerated++;
      return { ...newState, _delta: false };
    }
    
    // Calculate delta
    const delta = this._calculateDelta(lastState, newState);
    
    // Update cached state
    this._lastState.set(channel, { ...newState });
    this._lastStateTime.set(channel, now);
    
    // If delta is empty or too large, send full update
    const deltaKeys = Object.keys(delta).filter(k => k !== '_delta');
    const stateKeys = Object.keys(newState);
    
    if (deltaKeys.length === 0) {
      // No changes
      return null;
    }
    
    if (deltaKeys.length >= stateKeys.length * 0.7) {
      // Delta is >= 70% of full state, just send full
      this._stats.fullUpdatesGenerated++;
      return { ...newState, _delta: false };
    }
    
    this._stats.deltaUpdatesGenerated++;
    return { ...delta, _delta: true };
  }

  /**
   * Calculate difference between two state objects
   * @param {Object} oldState - Previous state
   * @param {Object} newState - New state
   * @returns {Object} Object containing only changed fields
   * @private
   */
  _calculateDelta(oldState, newState) {
    const delta = {};
    
    for (const key of Object.keys(newState)) {
      const oldVal = oldState[key];
      const newVal = newState[key];
      
      // Skip internal fields
      if (key.startsWith('_')) continue;
      
      // Check if value changed
      if (!this._deepEqual(oldVal, newVal)) {
        delta[key] = newVal;
      }
    }
    
    // Check for removed keys
    for (const key of Object.keys(oldState)) {
      if (key.startsWith('_')) continue;
      if (!(key in newState)) {
        delta[key] = null; // Mark as removed
      }
    }
    
    return delta;
  }

  /**
   * Deep equality check for values
   * @param {*} a - First value
   * @param {*} b - Second value
   * @returns {boolean} True if equal
   * @private
   */
  _deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    
    if (typeof a === 'object') {
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      
      if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        return a.every((val, i) => this._deepEqual(val, b[i]));
      }
      
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      
      return keysA.every(key => this._deepEqual(a[key], b[key]));
    }
    
    return false;
  }

  /**
   * Apply a delta update to a state object
   * @param {Object} state - Current state
   * @param {Object} delta - Delta update
   * @returns {Object} Updated state
   */
  applyDelta(state, delta) {
    if (!delta._delta) {
      // Full update, replace state
      const { _delta, ...rest } = delta;
      return rest;
    }
    
    const newState = { ...state };
    
    for (const [key, value] of Object.entries(delta)) {
      if (key === '_delta') continue;
      
      if (value === null) {
        delete newState[key];
      } else {
        newState[key] = value;
      }
    }
    
    return newState;
  }

  /**
   * Clear cached state for a channel
   * @param {string} channel - Channel identifier
   */
  clearState(channel) {
    this._lastState.delete(channel);
    this._lastStateTime.delete(channel);
  }

  //─────────────────────────────────────────────────────────────────────────────
  // STATISTICS
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Get optimizer statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const compressionRatio = this._stats.bytesBeforeCompression > 0
      ? (1 - this._stats.bytesAfterCompression / this._stats.bytesBeforeCompression) * 100
      : 0;
    
    return {
      ...this._stats,
      compressionRatio: compressionRatio.toFixed(2) + '%',
      pendingBatches: this._pendingBatches.size,
      cachedStates: this._lastState.size,
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this._stats = {
      messagesBatched: 0,
      batchesSent: 0,
      bytesBeforeCompression: 0,
      bytesAfterCompression: 0,
      deltaUpdatesGenerated: 0,
      fullUpdatesGenerated: 0,
    };
  }

  //─────────────────────────────────────────────────────────────────────────────
  // CLEANUP
  //─────────────────────────────────────────────────────────────────────────────

  /**
   * Clean up resources
   */
  close() {
    // Clear all timers
    for (const timer of this._batchTimers.values()) {
      clearTimeout(timer);
    }
    this._batchTimers.clear();
    
    // Clear batches
    this._pendingBatches.clear();
    
    // Clear state cache
    this._lastState.clear();
    this._lastStateTime.clear();
  }
}

export default WebSocketOptimizer;
