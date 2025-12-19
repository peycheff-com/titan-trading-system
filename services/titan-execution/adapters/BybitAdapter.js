/**
 * Bybit Exchange Adapter
 * 
 * Implements BrokerAdapter interface for Bybit exchange.
 * Handles order execution, position management, and account queries.
 * 
 * Features:
 * - API rate limiting (10 req/s default)
 * - Exponential backoff retry logic
 * - Input validation
 * - Request queuing
 * - Account caching
 * - IPv4 forcing (to avoid IPv6 whitelist issues)
 * 
 * @module BybitAdapter
 */

import crypto from 'crypto';
import dns from 'dns';
import { Agent, fetch as undiciFetch } from 'undici';

// Force IPv4 DNS resolution to avoid IPv6 whitelist issues with exchanges
dns.setDefaultResultOrder('ipv4first');

// Create IPv4-only agent for all requests
const ipv4Agent = new Agent({
  connect: {
    family: 4, // Force IPv4
  },
});

// Use undici's fetch with IPv4 agent (Node's native fetch doesn't respect setGlobalDispatcher)
const fetch = (url, options = {}) => undiciFetch(url, { ...options, dispatcher: ipv4Agent });

//─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
//─────────────────────────────────────────────────────────────────────────────

/** @constant {string} Bybit API base URL */
const BYBIT_API_BASE = 'https://api.bybit.com';

/** @constant {string} Bybit testnet API base URL */
const BYBIT_TESTNET_BASE = 'https://api-testnet.bybit.com';

/** @constant {Object} API endpoints */
const ENDPOINTS = {
  ORDER: '/v5/order/create',
  ORDER_STATUS: '/v5/order/realtime',
  ACCOUNT: '/v5/account/wallet-balance',
  POSITIONS: '/v5/position/list',
  CANCEL_ORDER: '/v5/order/cancel',
  CLOSE_POSITION: '/v5/order/create',
  SET_LEVERAGE: '/v5/position/set-leverage',
  SET_TRADING_STOP: '/v5/position/trading-stop',
  TEST_CONNECTIVITY: '/v5/market/time',
};

/** @constant {number} Request timeout */
const REQUEST_TIMEOUT_MS = 5000;

/** @constant {number} Rate limit - requests per second */
const RATE_LIMIT_RPS = 10;

/** @constant {number} Rate limit window in milliseconds */
const RATE_LIMIT_WINDOW_MS = 1000;

/** @constant {number} Max retry attempts for rate limit errors */
const MAX_RETRY_ATTEMPTS = 3;

/** @constant {number} Initial retry delay in milliseconds */
const INITIAL_RETRY_DELAY_MS = 1000;

/** @constant {number} Account cache TTL in milliseconds */
const ACCOUNT_CACHE_TTL_MS = 5000;

/** @constant {string} Default category for futures */
const DEFAULT_CATEGORY = 'linear'; // USDT perpetual

/** @constant {number} Default receive window */
const DEFAULT_RECV_WINDOW = 5000;

/** @constant {number} Min leverage */
const MIN_LEVERAGE = 1;

/** @constant {number} Max leverage */
const MAX_LEVERAGE = 100;

//─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Generate Bybit signature
 * @param {string} timestamp - Request timestamp
 * @param {string} apiKey - API key
 * @param {string} recvWindow - Receive window
 * @param {string} queryString - Query string or body
 * @param {string} apiSecret - API secret
 * @returns {string} HMAC SHA256 signature
 */
function generateSignature(timestamp, apiKey, recvWindow, queryString, apiSecret) {
  const signString = timestamp + apiKey + recvWindow + queryString;
  return crypto
    .createHmac('sha256', apiSecret)
    .update(signString)
    .digest('hex');
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate symbol format
 * @param {string} symbol - Trading symbol
 * @throws {Error} If symbol is invalid
 */
function validateSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') {
    throw new Error('Symbol must be a non-empty string');
  }
  
  if (symbol.length < 3 || symbol.length > 20) {
    throw new Error('Symbol length must be between 3 and 20 characters');
  }
}

/**
 * Validate leverage value
 * @param {number} leverage - Leverage value
 * @throws {Error} If leverage is invalid
 */
function validateLeverage(leverage) {
  if (typeof leverage !== 'number' || !Number.isFinite(leverage)) {
    throw new Error('Leverage must be a finite number');
  }
  
  if (leverage < MIN_LEVERAGE || leverage > MAX_LEVERAGE) {
    throw new Error(`Leverage must be between ${MIN_LEVERAGE} and ${MAX_LEVERAGE}`);
  }
}

/**
 * Validate price value
 * @param {number} price - Price value
 * @param {string} fieldName - Field name for error message
 * @throws {Error} If price is invalid
 */
function validatePrice(price, fieldName = 'Price') {
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  
  if (price <= 0) {
    throw new Error(`${fieldName} must be positive`);
  }
}

/**
 * Validate size value
 * @param {number} size - Size value
 * @throws {Error} If size is invalid
 */
function validateSize(size) {
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    throw new Error('Size must be a finite number');
  }
  
  if (size <= 0) {
    throw new Error('Size must be positive');
  }
}

//─────────────────────────────────────────────────────────────────────────────
// BYBIT ADAPTER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Bybit Exchange Adapter
 * 
 * Implements BrokerAdapter interface for Bybit exchange.
 */
export class BybitAdapter {
  /**
   * Create a new Bybit adapter
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - Bybit API key
   * @param {string} options.apiSecret - Bybit API secret
   * @param {boolean} [options.testnet=false] - Use testnet
   * @param {string} [options.category='linear'] - Trading category (linear/inverse/spot)
   * @param {number} [options.rateLimitRps=10] - Rate limit in requests per second
   * @param {number} [options.maxRetries=3] - Max retry attempts for rate limit errors
   * @param {number} [options.accountCacheTtl=5000] - Account cache TTL in milliseconds
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.apiKey || !options.apiSecret) {
      throw new Error('Bybit API key and secret are required');
    }

    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.testnet = options.testnet || false;
    this.category = options.category || DEFAULT_CATEGORY;
    this.logger = options.logger || console;
    
    // Rate limiting configuration
    this.rateLimitRps = options.rateLimitRps || RATE_LIMIT_RPS;
    this.maxRetries = options.maxRetries || MAX_RETRY_ATTEMPTS;
    this.accountCacheTtl = options.accountCacheTtl || ACCOUNT_CACHE_TTL_MS;
    
    // Use testnet URL if specified
    this.baseUrl = this.testnet 
      ? BYBIT_TESTNET_BASE
      : BYBIT_API_BASE;
    
    // Rate limiting state
    this.requestQueue = [];
    this.requestTimestamps = [];
    this.isProcessingQueue = false;
    
    // Account cache
    this.accountCache = null;
    this.accountCacheTimestamp = 0;
  }
  
  /**
   * Format symbol to Bybit format (remove /)
   * @param {string} symbol - Trading symbol
   * @returns {string} Formatted symbol
   * @private
   */
  _formatSymbol(symbol) {
    return symbol.replace('/', '');
  }
  
  /**
   * Check if rate limit allows request
   * @returns {boolean} True if request can proceed
   * @private
   */
  _canMakeRequest() {
    const now = Date.now();
    
    // Remove timestamps older than 1 second
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < RATE_LIMIT_WINDOW_MS
    );
    
    // Check if we're under the rate limit
    return this.requestTimestamps.length < this.rateLimitRps;
  }
  
  /**
   * Record a request timestamp
   * @private
   */
  _recordRequest() {
    this.requestTimestamps.push(Date.now());
  }
  
  /**
   * Process request queue
   * @private
   */
  async _processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    while (this.requestQueue.length > 0) {
      if (!this._canMakeRequest()) {
        // Wait until we can make another request
        await sleep(100);
        continue;
      }
      
      const { resolve, reject, fn } = this.requestQueue.shift();
      
      try {
        this._recordRequest();
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }
    
    this.isProcessingQueue = false;
  }
  
  /**
   * Queue a request with rate limiting
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} Result of function
   * @private
   */
  async _queueRequest(fn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ resolve, reject, fn });
      this._processQueue();
    });
  }
  
  /**
   * Retry request with exponential backoff
   * @param {Function} fn - Async function to execute
   * @param {number} [attempt=1] - Current attempt number
   * @returns {Promise<any>} Result of function
   * @private
   */
  async _retryWithBackoff(fn, attempt = 1) {
    try {
      return await fn();
    } catch (error) {
      // Check if it's a rate limit error (429)
      const isRateLimitError = error.message && (
        error.message.includes('429') ||
        error.message.includes('rate limit') ||
        error.message.includes('too many requests')
      );
      
      if (isRateLimitError && attempt < this.maxRetries) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        
        this.logger.warn({
          attempt,
          maxRetries: this.maxRetries,
          delay,
          error: error.message,
        }, 'Rate limit hit, retrying with exponential backoff...');
        
        await sleep(delay);
        return this._retryWithBackoff(fn, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Make authenticated request to Bybit API with rate limiting and retry logic
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} [params={}] - Request parameters
   * @param {boolean} [skipQueue=false] - Skip rate limit queue (for internal use)
   * @returns {Promise<Object>} API response
   * @private
   * 
   * Requirements: 3.7 (Rate limiting with exponential backoff on 429 errors)
   */
  async _makeRequest(method, endpoint, params = {}, skipQueue = false) {
    const executeRequest = async () => {
      const timestamp = Date.now().toString();
      const recvWindow = DEFAULT_RECV_WINDOW.toString();
      
      let queryString = '';
      let body = null;
      
      if (method === 'GET') {
        // For GET requests, params go in query string
        queryString = Object.keys(params)
          .sort()
          .map(key => `${key}=${params[key]}`)
          .join('&');
      } else {
        // For POST/DELETE, params go in body
        body = JSON.stringify(params);
        queryString = body;
      }
      
      // Generate signature
      const signature = generateSignature(
        timestamp,
        this.apiKey,
        recvWindow,
        queryString,
        this.apiSecret
      );
      
      // Build URL
      const url = method === 'GET' && queryString
        ? `${this.baseUrl}${endpoint}?${queryString}`
        : `${this.baseUrl}${endpoint}`;
      
      // Make request
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'X-BAPI-API-KEY': this.apiKey,
            'X-BAPI-SIGN': signature,
            'X-BAPI-TIMESTAMP': timestamp,
            'X-BAPI-RECV-WINDOW': recvWindow,
            'Content-Type': 'application/json',
          },
          body: method !== 'GET' ? body : undefined,
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        const data = await response.json();
        
        // Check for rate limit error
        if (response.status === 429 || data.retCode === 10006) {
          throw new Error('Rate limit exceeded (429)');
        }
        
        if (data.retCode !== 0) {
          throw new Error(`Bybit API error: ${data.retMsg || 'Unknown error'} (code: ${data.retCode})`);
        }
        
        return data.result;
      } catch (error) {
        clearTimeout(timeout);
        
        if (error.name === 'AbortError') {
          throw new Error('Bybit API request timeout');
        }
        
        throw error;
      }
    };
    
    // Apply rate limiting and retry logic
    if (skipQueue) {
      return await this._retryWithBackoff(executeRequest);
    } else {
      return await this._queueRequest(() => this._retryWithBackoff(executeRequest));
    }
  }

  /**
   * Send order to Bybit
   * @param {Object} orderParams - Order parameters
   * @param {string} orderParams.symbol - Trading symbol (e.g., 'BTC/USDT')
   * @param {string} orderParams.side - Order side ('BUY' or 'SELL')
   * @param {number} orderParams.size - Order size
   * @param {number} [orderParams.limit_price] - Limit price (required for LIMIT orders)
   * @param {string} [orderParams.order_type='LIMIT'] - Order type ('MARKET' or 'LIMIT')
   * @param {boolean} [orderParams.reduce_only=false] - Reduce-only flag
   * @param {boolean} [orderParams.post_only=true] - Post-only flag (for LIMIT orders)
   * @param {string} [orderParams.client_order_id] - Client order ID
   * @returns {Promise<Object>} Order result with success flag, order IDs, fill info, and timestamp
   */
  async sendOrder(orderParams) {
    const {
      symbol,
      side,
      size,
      limit_price,
      order_type = 'LIMIT',
      reduce_only = false,
      post_only = true,
      client_order_id,
    } = orderParams;

    try {
      // Input validation
      validateSymbol(symbol);
      validateSize(size);
      
      if (!['BUY', 'SELL'].includes(side)) {
        throw new Error('Side must be BUY or SELL');
      }
      
      if (!['MARKET', 'LIMIT'].includes(order_type)) {
        throw new Error('Order type must be MARKET or LIMIT');
      }
      
      if (order_type === 'LIMIT' && !limit_price) {
        throw new Error('Limit price is required for LIMIT orders');
      }
      
      if (limit_price) {
        validatePrice(limit_price, 'Limit price');
      }

      // Build Bybit order parameters
      const params = {
        category: this.category,
        symbol: this._formatSymbol(symbol),
        side: side === 'BUY' ? 'Buy' : 'Sell',
        orderType: order_type === 'MARKET' ? 'Market' : 'Limit',
        qty: size.toString(),
        orderLinkId: client_order_id,
      };

      // Add price for LIMIT orders
      if (order_type === 'LIMIT' && limit_price) {
        params.price = limit_price.toString();
        
        if (post_only) {
          params.timeInForce = 'PostOnly';
        } else {
          params.timeInForce = 'GTC'; // Good Till Cancel
        }
      }

      // Add reduce-only flag
      if (reduce_only) {
        params.reduceOnly = true;
      }

      const response = await this._makeRequest('POST', ENDPOINTS.ORDER, params);
      
      return {
        success: true,
        broker_order_id: response.orderId,
        client_order_id: response.orderLinkId,
        fill_price: parseFloat(response.avgPrice || response.price || 0),
        fill_size: parseFloat(response.cumExecQty || 0),
        filled: response.orderStatus === 'Filled',
        status: response.orderStatus,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message, orderParams }, 'Bybit sendOrder failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get account information with caching
   * @param {boolean} [skipCache=false] - Skip cache and fetch fresh data
   * @returns {Promise<Object>} Account info with success flag, balance, available balance, and timestamp
   */
  async getAccount(skipCache = false) {
    try {
      // Check cache
      const now = Date.now();
      if (!skipCache && this.accountCache && (now - this.accountCacheTimestamp) < this.accountCacheTtl) {
        return this.accountCache;
      }
      
      const params = {
        accountType: 'UNIFIED', // Unified trading account
      };
      
      const response = await this._makeRequest('GET', ENDPOINTS.ACCOUNT, params);
      
      // Extract USDT balance from unified account
      const usdtCoin = response.list[0]?.coin?.find(c => c.coin === 'USDT');
      
      const result = {
        success: true,
        balance: parseFloat(usdtCoin?.walletBalance || 0),
        available_balance: parseFloat(usdtCoin?.availableToWithdraw || 0),
        timestamp: new Date().toISOString(),
      };
      
      // Update cache
      this.accountCache = result;
      this.accountCacheTimestamp = now;
      
      return result;
    } catch (error) {
      this.logger.error({ error: error.message }, 'Bybit getAccount failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get current positions
   * @returns {Promise<Object>} Result with success flag and positions array or error
   */
  async getPositions() {
    try {
      const params = {
        category: this.category,
        settleCoin: 'USDT',
      };
      
      const response = await this._makeRequest('GET', ENDPOINTS.POSITIONS, params);
      
      // Filter out positions with zero size
      const positions = response.list
        .filter(pos => parseFloat(pos.size) !== 0)
        .map(pos => ({
          symbol: pos.symbol,
          side: pos.side === 'Buy' ? 'LONG' : 'SHORT',
          size: parseFloat(pos.size),
          entry_price: parseFloat(pos.avgPrice),
          unrealized_pnl: parseFloat(pos.unrealisedPnl || 0),
          leverage: parseFloat(pos.leverage || 1),
        }));
      
      return {
        success: true,
        positions,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Bybit getPositions failed');
      
      return {
        success: false,
        error: error.message,
        positions: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Close a position
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object>} Close result with success flag and order details or error
   */
  async closePosition(symbol) {
    try {
      // Input validation
      validateSymbol(symbol);
      
      // Get current position to determine size and side
      const positionsResult = await this.getPositions();
      
      if (!positionsResult.success) {
        return {
          success: false,
          error: positionsResult.error || 'Failed to get positions',
          timestamp: new Date().toISOString(),
        };
      }
      
      const position = positionsResult.positions.find(
        p => p.symbol === this._formatSymbol(symbol)
      );
      
      if (!position) {
        return {
          success: false,
          error: 'Position not found',
          timestamp: new Date().toISOString(),
        };
      }

      // Close position with market order in opposite direction
      const closeSide = position.side === 'LONG' ? 'SELL' : 'BUY';
      
      return await this.sendOrder({
        symbol,
        side: closeSide,
        size: position.size,
        order_type: 'MARKET',
        reduce_only: true,
      });
    } catch (error) {
      this.logger.error({ error: error.message, symbol }, 'Bybit closePosition failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Close all positions (emergency flatten)
   * @returns {Promise<Object>} Close result with success flag, counts, and individual results
   */
  async closeAllPositions() {
    try {
      const positionsResult = await this.getPositions();
      
      if (!positionsResult.success) {
        return {
          success: false,
          error: positionsResult.error || 'Failed to get positions',
          timestamp: new Date().toISOString(),
        };
      }
      
      const positions = positionsResult.positions;
      
      if (positions.length === 0) {
        return {
          success: true,
          closed_count: 0,
          total_positions: 0,
          timestamp: new Date().toISOString(),
        };
      }

      // Close all positions in parallel
      const closePromises = positions.map(pos => 
        this.closePosition(pos.symbol)
      );
      
      const results = await Promise.all(closePromises);
      
      const successCount = results.filter(r => r.success).length;
      
      return {
        success: successCount === positions.length,
        closed_count: successCount,
        total_positions: positions.length,
        results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Bybit closeAllPositions failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Cancel an order
   * @param {string} orderId - Order ID to cancel
   * @returns {Promise<Object>} Cancel result
   */
  async cancelOrder(orderId) {
    try {
      const params = {
        category: this.category,
        orderId,
      };
      
      const response = await this._makeRequest('POST', ENDPOINTS.CANCEL_ORDER, params);
      
      return {
        success: true,
        order_id: response.orderId,
        status: response.orderStatus,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message, orderId }, 'Bybit cancelOrder failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get order status
   * @param {string} orderId - Order ID to query
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object>} Order status with success flag, status, fill info, and timestamp
   * 
   * Requirements: 3.5 (Order status polling with max 5 retries)
   */
  async getOrderStatus(orderId, symbol) {
    try {
      // Input validation
      if (!orderId || typeof orderId !== 'string') {
        throw new Error('Order ID must be a non-empty string');
      }
      
      validateSymbol(symbol);
      
      const params = {
        category: this.category,
        orderId,
        symbol: this._formatSymbol(symbol),
      };
      
      const response = await this._makeRequest('GET', ENDPOINTS.ORDER_STATUS, params);
      
      if (!response.list || response.list.length === 0) {
        throw new Error('Order not found');
      }
      
      const order = response.list[0];
      
      return {
        success: true,
        status: order.orderStatus, // Created, New, PartiallyFilled, Filled, Cancelled, Rejected
        fill_price: parseFloat(order.avgPrice) || null,
        fill_size: parseFloat(order.cumExecQty) || 0,
        requested_size: parseFloat(order.qty),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message, orderId, symbol }, 'Bybit getOrderStatus failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Poll order status with retries
   * @param {string} orderId - Order ID to query
   * @param {string} symbol - Trading symbol
   * @param {number} [maxRetries=5] - Maximum number of retries
   * @param {number} [retryDelay=500] - Delay between retries in ms
   * @returns {Promise<Object>} Order status
   * 
   * Requirements: 3.5 (Poll every 500ms for max 5 retries = 2.5 seconds)
   */
  async pollOrderStatus(orderId, symbol, maxRetries = 5, retryDelay = 500) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const status = await this.getOrderStatus(orderId, symbol);
      
      if (!status.success) {
        this.logger.warn({ attempt, maxRetries, orderId }, 'Order status query failed, retrying...');
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        return status; // Return error after max retries
      }
      
      // Check if order is in final state
      const finalStates = ['Filled', 'Cancelled', 'Rejected'];
      if (finalStates.includes(status.status)) {
        this.logger.info({ orderId, status: status.status, attempt }, 'Order reached final state');
        return status;
      }
      
      // Order still pending, retry
      this.logger.info({ orderId, status: status.status, attempt, maxRetries }, 'Order still pending, retrying...');
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    // Max retries reached, return last status
    const finalStatus = await this.getOrderStatus(orderId, symbol);
    this.logger.warn({ orderId, maxRetries }, 'Max polling attempts reached');
    return finalStatus;
  }

  /**
   * Set leverage for a symbol
   * @param {string} symbol - Trading symbol
   * @param {number} leverage - Leverage value (1-100)
   * @returns {Promise<Object>} Set leverage result with success flag and timestamp
   * 
   * Requirements: 3.1 (Set leverage before placing order)
   */
  async setLeverage(symbol, leverage) {
    try {
      // Input validation
      validateSymbol(symbol);
      validateLeverage(leverage);
      
      const params = {
        category: this.category,
        symbol: this._formatSymbol(symbol),
        buyLeverage: leverage.toString(),
        sellLeverage: leverage.toString(),
      };
      
      await this._makeRequest('POST', ENDPOINTS.SET_LEVERAGE, params);
      
      return {
        success: true,
        leverage,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message, symbol, leverage }, 'Bybit setLeverage failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Set stop loss for a position
   * @param {string} symbol - Trading symbol
   * @param {number} stopLoss - Stop loss price
   * @param {number} [positionIdx=0] - Position index (0 for one-way mode)
   * @returns {Promise<Object>} Set stop loss result with success flag and timestamp
   * 
   * Requirements: 3.6 (Place stop loss order when position is opened)
   */
  async setStopLoss(symbol, stopLoss, positionIdx = 0) {
    try {
      // Input validation
      validateSymbol(symbol);
      validatePrice(stopLoss, 'Stop loss');
      
      const params = {
        category: this.category,
        symbol: this._formatSymbol(symbol),
        stopLoss: stopLoss.toString(),
        positionIdx,
      };
      
      await this._makeRequest('POST', ENDPOINTS.SET_TRADING_STOP, params);
      
      return {
        success: true,
        stop_loss: stopLoss,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message, symbol, stopLoss }, 'Bybit setStopLoss failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Set take profit for a position
   * @param {string} symbol - Trading symbol
   * @param {number} takeProfit - Take profit price
   * @param {number} [positionIdx=0] - Position index (0 for one-way mode)
   * @returns {Promise<Object>} Set take profit result with success flag and timestamp
   * 
   * Requirements: 3.6 (Place take profit order when position is opened)
   */
  async setTakeProfit(symbol, takeProfit, positionIdx = 0) {
    try {
      // Input validation
      validateSymbol(symbol);
      validatePrice(takeProfit, 'Take profit');
      
      const params = {
        category: this.category,
        symbol: this._formatSymbol(symbol),
        takeProfit: takeProfit.toString(),
        positionIdx,
      };
      
      await this._makeRequest('POST', ENDPOINTS.SET_TRADING_STOP, params);
      
      return {
        success: true,
        take_profit: takeProfit,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message, symbol, takeProfit }, 'Bybit setTakeProfit failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get account equity
   * @param {boolean} [skipCache=false] - Skip cache and fetch fresh data
   * @returns {Promise<Object>} Result with success flag and equity value or error
   * 
   * Requirements: Used for position sizing calculations
   */
  async getEquity(skipCache = false) {
    try {
      const accountResult = await this.getAccount(skipCache);
      
      if (!accountResult.success) {
        return {
          success: false,
          error: accountResult.error || 'Failed to get account',
          timestamp: new Date().toISOString(),
        };
      }
      
      return {
        success: true,
        equity: accountResult.balance,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Bybit getEquity failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
  
  /**
   * Health check - test adapter functionality
   * @returns {Promise<Object>} Health check result with success flag and details
   */
  async healthCheck() {
    try {
      // Test connectivity
      const connectivityResult = await this.testConnection();
      
      if (!connectivityResult.success) {
        return {
          success: false,
          error: 'Connectivity test failed',
          details: connectivityResult,
          timestamp: new Date().toISOString(),
        };
      }
      
      // Test account access
      const accountResult = await this.getAccount(true); // Skip cache
      
      if (!accountResult.success) {
        return {
          success: false,
          error: 'Account access failed',
          details: accountResult,
          timestamp: new Date().toISOString(),
        };
      }
      
      return {
        success: true,
        exchange: 'Bybit',
        testnet: this.testnet,
        balance: accountResult.balance,
        rate_limit_status: {
          requests_in_window: this.requestTimestamps.length,
          max_rps: this.rateLimitRps,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Bybit healthCheck failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Test connection to Bybit
   * @param {string} [apiKey] - API key to test (optional, uses instance key if not provided)
   * @param {string} [apiSecret] - API secret to test (optional, uses instance secret if not provided)
   * @returns {Promise<Object>} Test result
   */
  async testConnection(apiKey, apiSecret) {
    try {
      // If testing different credentials, create temporary adapter
      if (apiKey && apiSecret) {
        const testAdapter = new BybitAdapter({
          apiKey,
          apiSecret,
          testnet: this.testnet,
          category: this.category,
          logger: this.logger,
        });
        
        return await testAdapter.testConnection();
      }

      // Test connectivity with server time
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      const response = await fetch(`${this.baseUrl}${ENDPOINTS.TEST_CONNECTIVITY}`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      const data = await response.json();
      
      if (data.retCode !== 0) {
        throw new Error('Bybit server time check failed');
      }

      // Test authentication with account query
      const accountResult = await this.getAccount();
      
      if (!accountResult.success) {
        throw new Error(accountResult.error || 'Account query failed');
      }

      return {
        success: true,
        exchange: 'Bybit',
        account_info: {
          balance: accountResult.balance,
          available_balance: accountResult.available_balance,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'Bybit testConnection failed');
      
      // Extract more details from error if available
      let errorMessage = error.message;
      
      // Check if it's an IP whitelist error and provide helpful message
      if (errorMessage.includes('10010') || errorMessage.includes('Unmatched IP')) {
        errorMessage = `${errorMessage}. Your server's outgoing IP may have changed. Check /api/config/my-ip endpoint to see your current IPs.`;
      }
      
      return {
        success: false,
        error: errorMessage,
        exchange: 'Bybit',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
