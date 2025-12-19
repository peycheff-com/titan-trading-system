/**
 * WebSocket Order Book Cache
 * 
 * Maintains a real-time local mirror of the order book via WebSocket,
 * enabling zero-IO L2 validation with sub-100ms latency.
 * 
 * Requirements: 56.1-56.6
 * 
 * @module WebSocketCache
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {number} Maximum cache age in milliseconds before considered stale */
const MAX_CACHE_AGE_MS = 100;

/** @constant {number} Reconnection delay in milliseconds */
const RECONNECT_DELAY_MS = 1000;

/** @constant {number} Maximum reconnection attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 10;

/** @constant {number} Ping interval in milliseconds */
const PING_INTERVAL_MS = 30000;

/** @constant {number} Default order book depth (levels) */
const DEFAULT_DEPTH = 20;

//─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} OrderBookLevel
 * @property {number} price - Price level
 * @property {number} quantity - Quantity at this level
 */

/**
 * @typedef {Object} OrderBook
 * @property {string} symbol - Trading symbol
 * @property {OrderBookLevel[]} bids - Bid levels (sorted by price descending)
 * @property {OrderBookLevel[]} asks - Ask levels (sorted by price ascending)
 * @property {number} lastUpdateTime - Timestamp of last update
 * @property {number} lastUpdateId - Sequence ID for ordering
 */

/**
 * @typedef {Object} CacheEntry
 * @property {OrderBook} orderbook - The order book data
 * @property {number} receivedAt - Local timestamp when data was received
 * @property {boolean} isSnapshot - Whether this is a full snapshot or incremental update
 */

/**
 * @typedef {Object} Logger
 * @property {Function} info - Info level logging
 * @property {Function} warn - Warning level logging
 * @property {Function} error - Error level logging
 */

//─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create a default logger with consistent interface
 * @returns {Logger} Default logger
 */
function createDefaultLogger() {
  return {
    info: (data, message) => console.log(`[INFO] ${message}`, data),
    warn: (data, message) => console.warn(`[WARN] ${message}`, data),
    error: (data, message) => console.error(`[ERROR] ${message}`, data),
  };
}

/**
 * Parse order book level from exchange format
 * @param {Array} level - [price, quantity] array
 * @returns {OrderBookLevel} Parsed level
 */
function parseLevel(level) {
  return {
    price: parseFloat(level[0]),
    quantity: parseFloat(level[1]),
  };
}


//─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET CACHE CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * WebSocket Order Book Cache
 * 
 * Maintains real-time order book data via WebSocket connection.
 * Provides zero-IO access to L2 data for validation.
 * 
 * Events emitted:
 * - 'connected' - WebSocket connection established
 * - 'disconnected' - WebSocket connection lost
 * - 'reconnecting' - Attempting to reconnect
 * - 'orderbook:update' - Order book updated for a symbol
 * - 'orderbook:snapshot' - Full snapshot received
 * - 'cache:stale' - Cache marked as stale
 * - 'error' - Error occurred
 */
export class WebSocketCache extends EventEmitter {
  /**
   * Create a new WebSocketCache instance
   * @param {Object} options - Configuration options
   * @param {string} options.wsUrl - WebSocket URL for order book stream
   * @param {string[]} [options.symbols] - Symbols to subscribe to
   * @param {number} [options.maxCacheAgeMs] - Maximum cache age before stale (default: 100ms)
   * @param {number} [options.reconnectDelayMs] - Delay between reconnection attempts
   * @param {number} [options.maxReconnectAttempts] - Maximum reconnection attempts
   * @param {number} [options.depth] - Order book depth (levels)
   * @param {Logger} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    super();
    
    /** @type {string} WebSocket URL */
    this.wsUrl = options.wsUrl || '';
    
    /** @type {string[]} Symbols to subscribe to */
    this.symbols = options.symbols || [];
    
    /** @type {number} Maximum cache age in milliseconds */
    this.maxCacheAgeMs = options.maxCacheAgeMs || MAX_CACHE_AGE_MS;
    
    /** @type {number} Reconnection delay */
    this.reconnectDelayMs = options.reconnectDelayMs || RECONNECT_DELAY_MS;
    
    /** @type {number} Maximum reconnection attempts */
    this.maxReconnectAttempts = options.maxReconnectAttempts || MAX_RECONNECT_ATTEMPTS;
    
    /** @type {number} Order book depth */
    this.depth = options.depth || DEFAULT_DEPTH;
    
    /** @type {Map<string, CacheEntry>} symbol → CacheEntry */
    this.cache = new Map();
    
    /** @type {WebSocket|null} WebSocket connection */
    this.ws = null;
    
    /** @type {boolean} Whether cache is globally stale (disconnected) */
    this.isStale = true;
    
    /** @type {number} Current reconnection attempt count */
    this.reconnectAttempts = 0;
    
    /** @type {NodeJS.Timeout|null} Reconnection timer */
    this._reconnectTimer = null;
    
    /** @type {NodeJS.Timeout|null} Ping timer */
    this._pingTimer = null;
    
    /** @type {boolean} Whether we're intentionally closing */
    this._closing = false;
    
    // Create logger
    const defaultLogger = createDefaultLogger();
    this.logger = options.logger ? { ...defaultLogger, ...options.logger } : defaultLogger;
  }

  /**
   * Connect to WebSocket stream
   * Requirements: 56.1 - Establish WebSocket connection to exchange order book stream
   * 
   * @returns {Promise<void>} Resolves when connected
   */
  async connect() {
    if (!this.wsUrl) {
      throw new Error('WebSocket URL is required');
    }
    
    this._closing = false;
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.on('open', () => {
          this.logger.info({ url: this.wsUrl }, 'WebSocket connected');
          this.reconnectAttempts = 0;
          this._startPingInterval();
          
          // Subscribe to symbols
          this._subscribeToSymbols();
          
          // Request initial snapshots
          this._requestSnapshots();
          
          this.emit('connected');
          resolve();
        });
        
        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });
        
        this.ws.on('close', (code, reason) => {
          this._handleDisconnect(code, reason?.toString());
        });
        
        this.ws.on('error', (error) => {
          this.logger.error({ error: error.message }, 'WebSocket error');
          this.emit('error', error);
          
          // Only reject if we haven't connected yet
          if (this.isStale && this.reconnectAttempts === 0) {
            reject(error);
          }
        });
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket stream
   */
  disconnect() {
    this._closing = true;
    this._clearTimers();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this._markCacheStale();
    this.logger.info({}, 'WebSocket disconnected intentionally');
  }

  /**
   * Get order book for a symbol
   * Requirements: 56.3 - Read from local cache (0ms latency) not REST API
   * 
   * @param {string} symbol - Trading symbol
   * @returns {OrderBook|null} Order book or null if not available
   */
  getOrderbook(symbol) {
    const entry = this.cache.get(symbol);
    if (!entry) {
      return null;
    }
    
    return entry.orderbook;
  }

  /**
   * Get cache age for a symbol in milliseconds
   * Requirements: 56.5 - Track cache age per symbol
   * 
   * @param {string} symbol - Trading symbol
   * @returns {number} Age in milliseconds, or Infinity if not cached
   */
  getCacheAge(symbol) {
    const entry = this.cache.get(symbol);
    if (!entry) {
      return Infinity;
    }
    
    return Date.now() - entry.receivedAt;
  }

  /**
   * Check if cache is stale for a symbol
   * Requirements: 56.5 - Flag cache as potentially stale if age exceeds 100ms
   * 
   * @param {string} symbol - Trading symbol
   * @returns {boolean} True if cache is stale
   */
  isCacheStale(symbol) {
    // Global stale flag (disconnected)
    if (this.isStale) {
      return true;
    }
    
    const age = this.getCacheAge(symbol);
    return age > this.maxCacheAgeMs;
  }

  /**
   * Check if cache is valid for validation
   * Requirements: 56.4 - Mark cache as stale and reject all validations until reconnected
   * 
   * @param {string} symbol - Trading symbol
   * @returns {{valid: boolean, reason?: string}} Validation result
   */
  validateCacheForSymbol(symbol) {
    if (this.isStale) {
      return { valid: false, reason: 'STALE_L2_CACHE_DISCONNECTED' };
    }
    
    const entry = this.cache.get(symbol);
    if (!entry) {
      return { valid: false, reason: 'SYMBOL_NOT_CACHED' };
    }
    
    const age = this.getCacheAge(symbol);
    if (age > this.maxCacheAgeMs) {
      return { valid: false, reason: 'STALE_L2_CACHE' };
    }
    
    return { valid: true };
  }

  /**
   * Get best bid price for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {number|null} Best bid price or null
   */
  getBestBid(symbol) {
    const orderbook = this.getOrderbook(symbol);
    if (!orderbook || !orderbook.bids || orderbook.bids.length === 0) {
      return null;
    }
    return orderbook.bids[0].price;
  }

  /**
   * Get best ask price for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {number|null} Best ask price or null
   */
  getBestAsk(symbol) {
    const orderbook = this.getOrderbook(symbol);
    if (!orderbook || !orderbook.asks || orderbook.asks.length === 0) {
      return null;
    }
    return orderbook.asks[0].price;
  }

  /**
   * Get spread for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {number|null} Spread or null
   */
  getSpread(symbol) {
    const bid = this.getBestBid(symbol);
    const ask = this.getBestAsk(symbol);
    if (bid === null || ask === null) {
      return null;
    }
    return ask - bid;
  }

  /**
   * Get spread percentage for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {number|null} Spread percentage or null
   */
  getSpreadPct(symbol) {
    const bid = this.getBestBid(symbol);
    const spread = this.getSpread(symbol);
    if (bid === null || spread === null || bid === 0) {
      return null;
    }
    return (spread / bid) * 100;
  }

  /**
   * Calculate total volume at top N% of price levels
   * @param {OrderBookLevel[]} levels - Order book levels
   * @param {number} pct - Percentage of price range (e.g., 1 for top 1%)
   * @returns {number} Total volume
   */
  _calculateVolumeAtTopPct(levels, pct) {
    if (!levels || levels.length === 0) {
      return 0;
    }
    
    const topPrice = levels[0].price;
    const threshold = topPrice * (pct / 100);
    
    let totalVolume = 0;
    for (const level of levels) {
      const priceDiff = Math.abs(level.price - topPrice);
      if (priceDiff <= threshold) {
        totalVolume += level.quantity;
      } else {
        break; // Levels are sorted, so we can stop early
      }
    }
    
    return totalVolume;
  }

  /**
   * Calculate Order Book Imbalance (OBI)
   * Requirements: 22.5 - Calculate OBI: Bids_Volume_Top_1% / Asks_Volume_Top_1%
   * 
   * @param {string} symbol - Trading symbol
   * @param {number} [pct=1] - Percentage of price range to consider
   * @returns {number|null} OBI ratio or null if not available
   */
  calculateOBI(symbol, pct = 1) {
    const orderbook = this.getOrderbook(symbol);
    if (!orderbook) {
      return null;
    }
    
    const bidVolume = this._calculateVolumeAtTopPct(orderbook.bids, pct);
    const askVolume = this._calculateVolumeAtTopPct(orderbook.asks, pct);
    
    if (askVolume === 0) {
      return bidVolume > 0 ? Infinity : 1; // Avoid division by zero
    }
    
    return bidVolume / askVolume;
  }

  /**
   * Update order book from message
   * Requirements: 56.2 - Update local memory cache immediately on updates
   * 
   * @param {string} symbol - Trading symbol
   * @param {Object} data - Order book data
   * @param {boolean} isSnapshot - Whether this is a full snapshot
   * @private
   */
  _updateOrderbook(symbol, data, isSnapshot = false) {
    const orderbook = {
      symbol,
      bids: (data.bids || []).map(parseLevel),
      asks: (data.asks || []).map(parseLevel),
      lastUpdateTime: data.E || Date.now(),
      lastUpdateId: data.u || data.lastUpdateId || 0,
    };
    
    // Sort bids descending by price
    orderbook.bids.sort((a, b) => b.price - a.price);
    
    // Sort asks ascending by price
    orderbook.asks.sort((a, b) => a.price - b.price);
    
    // Trim to depth
    orderbook.bids = orderbook.bids.slice(0, this.depth);
    orderbook.asks = orderbook.asks.slice(0, this.depth);
    
    const entry = {
      orderbook,
      receivedAt: Date.now(),
      isSnapshot,
    };
    
    this.cache.set(symbol, entry);
    
    // Mark cache as not stale since we received data
    if (this.isStale && isSnapshot) {
      this.isStale = false;
      this.logger.info({ symbol }, 'Cache no longer stale after snapshot');
    }
    
    this.emit(isSnapshot ? 'orderbook:snapshot' : 'orderbook:update', { symbol, orderbook });
  }

  /**
   * Handle incoming WebSocket message
   * @param {Buffer|string} data - Raw message data
   * @private
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle different message formats (Binance-style)
      if (message.e === 'depthUpdate') {
        // Incremental update
        const symbol = message.s;
        this._updateOrderbook(symbol, {
          bids: message.b,
          asks: message.a,
          E: message.E,
          u: message.u,
        }, false);
      } else if (message.lastUpdateId !== undefined) {
        // Snapshot response
        const symbol = message.symbol || this._extractSymbolFromStream(message);
        if (symbol) {
          this._updateOrderbook(symbol, message, true);
        }
      } else if (message.stream) {
        // Combined stream format
        const streamData = message.data;
        if (streamData && streamData.e === 'depthUpdate') {
          const symbol = streamData.s;
          this._updateOrderbook(symbol, {
            bids: streamData.b,
            asks: streamData.a,
            E: streamData.E,
            u: streamData.u,
          }, false);
        }
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to parse WebSocket message');
    }
  }

  /**
   * Handle WebSocket disconnection
   * Requirements: 56.4 - Mark cache as stale and reject all validations until reconnected
   * 
   * @param {number} code - Close code
   * @param {string} reason - Close reason
   * @private
   */
  _handleDisconnect(code, reason) {
    this._clearTimers();
    this._markCacheStale();
    
    this.logger.warn({ code, reason }, 'WebSocket disconnected');
    this.emit('disconnected', { code, reason });
    
    // Attempt reconnection if not intentionally closing
    if (!this._closing) {
      this._scheduleReconnect();
    }
  }

  /**
   * Mark cache as stale
   * @private
   */
  _markCacheStale() {
    if (!this.isStale) {
      this.isStale = true;
      this.logger.warn({}, 'Cache marked as stale');
      this.emit('cache:stale');
    }
  }

  /**
   * Schedule reconnection attempt
   * Requirements: 56.6 - Request full order book snapshot before resuming validation
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error({ attempts: this.reconnectAttempts }, 'Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    this.logger.info({ attempt: this.reconnectAttempts, delay }, 'Scheduling reconnection');
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });
    
    this._reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        this.logger.error({ error: error.message }, 'Reconnection failed');
        this._scheduleReconnect();
      }
    }, delay);
  }

  /**
   * Subscribe to symbols
   * @private
   */
  _subscribeToSymbols() {
    if (!this.isConnected()) {
      return;
    }
    
    // Binance-style subscription
    const streams = this.symbols.map(s => `${s.toLowerCase()}@depth@100ms`);
    
    if (streams.length > 0) {
      const subscribeMsg = {
        method: 'SUBSCRIBE',
        params: streams,
        id: Date.now(),
      };
      
      this.ws.send(JSON.stringify(subscribeMsg));
      this.logger.info({ symbols: this.symbols }, 'Subscribed to symbols');
    }
  }

  /**
   * Request full snapshots for all symbols
   * Requirements: 56.6 - Request full order book snapshot before resuming validation
   * @private
   */
  _requestSnapshots() {
    // For Binance, snapshots are requested via REST API
    // This is a placeholder - in production, you'd make REST calls
    // For now, we'll wait for the first depth update
    this.logger.info({ symbols: this.symbols }, 'Waiting for order book snapshots');
  }

  /**
   * Start ping interval to keep connection alive
   * @private
   */
  _startPingInterval() {
    this._pingTimer = setInterval(() => {
      if (this.isConnected()) {
        this.ws.ping();
      }
    }, PING_INTERVAL_MS);
  }

  /**
   * Clear all timers
   * @private
   */
  _clearTimers() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
  }

  /**
   * Extract symbol from stream name
   * @param {Object} message - Message object
   * @returns {string|null} Symbol or null
   * @private
   */
  _extractSymbolFromStream(message) {
    if (message.stream) {
      const parts = message.stream.split('@');
      if (parts.length > 0) {
        return parts[0].toUpperCase();
      }
    }
    return null;
  }

  /**
   * Add a symbol to subscription
   * @param {string} symbol - Symbol to add
   */
  addSymbol(symbol) {
    if (!this.symbols.includes(symbol)) {
      this.symbols.push(symbol);
      
      if (this.isConnected()) {
        const subscribeMsg = {
          method: 'SUBSCRIBE',
          params: [`${symbol.toLowerCase()}@depth@100ms`],
          id: Date.now(),
        };
        this.ws.send(JSON.stringify(subscribeMsg));
        this.logger.info({ symbol }, 'Added symbol subscription');
      }
    }
  }

  /**
   * Remove a symbol from subscription
   * @param {string} symbol - Symbol to remove
   */
  removeSymbol(symbol) {
    const index = this.symbols.indexOf(symbol);
    if (index !== -1) {
      this.symbols.splice(index, 1);
      this.cache.delete(symbol);
      
      if (this.isConnected()) {
        const unsubscribeMsg = {
          method: 'UNSUBSCRIBE',
          params: [`${symbol.toLowerCase()}@depth@100ms`],
          id: Date.now(),
        };
        this.ws.send(JSON.stringify(unsubscribeMsg));
        this.logger.info({ symbol }, 'Removed symbol subscription');
      }
    }
  }

  /**
   * Get all cached symbols
   * @returns {string[]} Array of cached symbols
   */
  getCachedSymbols() {
    return [...this.cache.keys()];
  }

  /**
   * Check if WebSocket is connected
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const stats = {
      connected: this.isConnected(),
      isStale: this.isStale,
      symbolCount: this.cache.size,
      reconnectAttempts: this.reconnectAttempts,
      symbols: {},
    };
    
    for (const [symbol, entry] of this.cache) {
      stats.symbols[symbol] = {
        age: Date.now() - entry.receivedAt,
        isStale: this.isCacheStale(symbol),
        bidLevels: entry.orderbook.bids.length,
        askLevels: entry.orderbook.asks.length,
        lastUpdateId: entry.orderbook.lastUpdateId,
      };
    }
    
    return stats;
  }

  /**
   * Clear cache (for testing)
   */
  clear() {
    this.cache.clear();
    this.isStale = true;
  }

  /**
   * Inject mock data (for testing)
   * @param {string} symbol - Symbol
   * @param {Object} orderbook - Order book data
   */
  injectMockData(symbol, orderbook) {
    this._updateOrderbook(symbol, orderbook, true);
    this.isStale = false;
  }
}

// Export singleton instance for convenience
export const webSocketCache = new WebSocketCache();

export default WebSocketCache;
