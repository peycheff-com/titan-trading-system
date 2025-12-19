/**
 * MEXC Exchange Adapter
 * 
 * Implements BrokerAdapter interface for MEXC exchange.
 * Handles order execution, position management, and account queries.
 * 
 * MEXC has two APIs:
 * - Spot API: https://api.mexc.com/api/v3/
 * - Futures API: https://contract.mexc.com/api/v1/
 * 
 * This adapter uses the Futures API for perpetual contracts.
 * 
 * @module MexcAdapter
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

/** @constant {string} MEXC Futures API base URL */
const MEXC_FUTURES_API_BASE = 'https://contract.mexc.com';

/** @constant {string} MEXC Spot API base URL (for ping only) */
const MEXC_SPOT_API_BASE = 'https://api.mexc.com';

/** @constant {Object} API endpoints */
const ENDPOINTS = {
  // Futures endpoints
  ORDER: '/api/v1/private/order/submit',
  ACCOUNT: '/api/v1/private/account/assets',
  POSITIONS: '/api/v1/private/position/open_positions',
  CANCEL_ORDER: '/api/v1/private/order/cancel',
  // Spot endpoint for connectivity test
  TEST_CONNECTIVITY: '/api/v3/ping',
};

/** @constant {number} Request timeout */
const REQUEST_TIMEOUT_MS = 10000;

//─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Generate MEXC signature
 * @param {string} queryString - Query string to sign
 * @param {string} apiSecret - API secret
 * @returns {string} HMAC SHA256 signature
 */
function generateSignature(queryString, apiSecret) {
  return crypto
    .createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');
}

/**
 * Create query string from parameters
 * @param {Object} params - Parameters object
 * @returns {string} Query string
 */
function createQueryString(params) {
  return Object.keys(params)
    .sort()
    .map(key => `${key}=${encodeURIComponent(params[key])}`)
    .join('&');
}

//─────────────────────────────────────────────────────────────────────────────
// MEXC ADAPTER CLASS
//─────────────────────────────────────────────────────────────────────────────

/**
 * MEXC Exchange Adapter
 * 
 * Implements BrokerAdapter interface for MEXC exchange.
 */
export class MexcAdapter {
  /**
   * Create a new MEXC adapter
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - MEXC API key
   * @param {string} options.apiSecret - MEXC API secret
   * @param {boolean} [options.testnet=false] - Use testnet
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    if (!options.apiKey || !options.apiSecret) {
      throw new Error('MEXC API key and secret are required');
    }

    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.testnet = options.testnet || false;
    this.logger = options.logger || console;
    
    // MEXC Futures API base URL
    this.baseUrl = MEXC_FUTURES_API_BASE;
    // Spot API for ping test
    this.spotBaseUrl = MEXC_SPOT_API_BASE;
  }

  /**
   * Make authenticated request to MEXC Futures API
   * 
   * MEXC Futures API uses a different signature format:
   * - Signature is HMAC SHA256 of: timestamp + apiKey + requestBody
   * - Headers: ApiKey, Request-Time, Signature, Content-Type
   * 
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} [params={}] - Request parameters
   * @returns {Promise<Object>} API response
   */
  async _makeRequest(method, endpoint, params = {}) {
    const timestamp = Date.now().toString();
    
    // For MEXC Futures, signature = HMAC(timestamp + apiKey + (params if POST))
    let signaturePayload = timestamp + this.apiKey;
    let body = null;
    let url = `${this.baseUrl}${endpoint}`;
    
    if (method === 'POST' && Object.keys(params).length > 0) {
      body = JSON.stringify(params);
      signaturePayload += body;
    } else if (method === 'GET' && Object.keys(params).length > 0) {
      const queryString = createQueryString(params);
      url += `?${queryString}`;
    }
    
    // Generate signature
    const signature = generateSignature(signaturePayload, this.apiSecret);
    
    // Make request
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
      const headers = {
        'ApiKey': this.apiKey,
        'Request-Time': timestamp,
        'Signature': signature,
        'Content-Type': 'application/json',
      };
      
      const fetchOptions = {
        method,
        headers,
        signal: controller.signal,
      };
      
      if (body) {
        fetchOptions.body = body;
      }
      
      const response = await fetch(url, fetchOptions);
      
      clearTimeout(timeout);
      
      const data = await response.json();
      
      // MEXC Futures API returns { success: true/false, code: 0, data: {...} }
      if (!response.ok || data.success === false || (data.code && data.code !== 0)) {
        const errorMsg = data.message || data.msg || response.statusText;
        throw new Error(`MEXC API error: ${errorMsg} (code: ${data.code || response.status})`);
      }
      
      return data.data || data;
    } catch (error) {
      clearTimeout(timeout);
      
      if (error.name === 'AbortError') {
        throw new Error('MEXC API request timeout');
      }
      
      throw error;
    }
  }

  /**
   * Send order to MEXC
   * @param {Object} orderParams - Order parameters
   * @returns {Promise<Object>} Order result
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

    // Build MEXC order parameters
    const params = {
      symbol: symbol.replace('/', ''), // MEXC uses BTCUSDT format
      side: side.toUpperCase(),
      type: order_type,
      quantity: size,
      newClientOrderId: client_order_id,
    };

    // Add price for LIMIT orders
    if (order_type === 'LIMIT' && limit_price) {
      params.price = limit_price;
      
      if (post_only) {
        params.timeInForce = 'GTX'; // Good Till Crossing (post-only)
      } else {
        params.timeInForce = 'GTC'; // Good Till Cancel
      }
    }

    // Add reduce-only flag
    if (reduce_only) {
      params.reduceOnly = true;
    }

    try {
      const response = await this._makeRequest('POST', ENDPOINTS.ORDER, params);
      
      return {
        success: true,
        broker_order_id: response.orderId.toString(),
        client_order_id: response.clientOrderId,
        fill_price: parseFloat(response.price || response.avgPrice || 0),
        fill_size: parseFloat(response.executedQty || 0),
        filled: response.status === 'FILLED',
        status: response.status,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'MEXC sendOrder failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get account information
   * 
   * MEXC Futures API returns:
   * { success: true, code: 0, data: [{ currency: "USDT", equity: "100.00", ... }] }
   * 
   * @returns {Promise<Object>} Account info
   */
  async getAccount() {
    try {
      const response = await this._makeRequest('GET', ENDPOINTS.ACCOUNT);
      
      // Response is an array of assets, find USDT
      const assets = Array.isArray(response) ? response : [response];
      const usdtAsset = assets.find(a => a.currency === 'USDT') || assets[0] || {};
      
      return {
        success: true,
        balance: parseFloat(usdtAsset.equity || usdtAsset.availableBalance || 0),
        available_balance: parseFloat(usdtAsset.availableBalance || usdtAsset.available || 0),
        equity: parseFloat(usdtAsset.equity || 0),
        unrealized_pnl: parseFloat(usdtAsset.unrealisedPnl || usdtAsset.unrealizedPnl || 0),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message }, 'MEXC getAccount failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get current positions
   * @returns {Promise<Array>} Array of positions
   */
  async getPositions() {
    try {
      const response = await this._makeRequest('GET', ENDPOINTS.POSITIONS);
      
      // Filter out positions with zero size
      const positions = response
        .filter(pos => parseFloat(pos.positionAmt) !== 0)
        .map(pos => ({
          symbol: pos.symbol,
          side: parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT',
          size: Math.abs(parseFloat(pos.positionAmt)),
          entry_price: parseFloat(pos.entryPrice),
          unrealized_pnl: parseFloat(pos.unRealizedProfit || 0),
          leverage: parseFloat(pos.leverage || 1),
        }));
      
      return positions;
    } catch (error) {
      this.logger.error({ error: error.message }, 'MEXC getPositions failed');
      throw error;
    }
  }

  /**
   * Close a position
   * @param {string} symbol - Trading symbol
   * @returns {Promise<Object>} Close result
   */
  async closePosition(symbol) {
    try {
      // Get current position to determine size and side
      const positions = await this.getPositions();
      const position = positions.find(p => p.symbol === symbol.replace('/', ''));
      
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
      this.logger.error({ error: error.message, symbol }, 'MEXC closePosition failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Close all positions (emergency flatten)
   * @returns {Promise<Object>} Close result
   */
  async closeAllPositions() {
    try {
      const positions = await this.getPositions();
      
      if (positions.length === 0) {
        return {
          success: true,
          closed_count: 0,
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
      this.logger.error({ error: error.message }, 'MEXC closeAllPositions failed');
      
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
        orderId,
      };
      
      const response = await this._makeRequest('DELETE', ENDPOINTS.CANCEL_ORDER, params);
      
      return {
        success: true,
        order_id: response.orderId.toString(),
        status: response.status,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error({ error: error.message, orderId }, 'MEXC cancelOrder failed');
      
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Test connection using MEXC Spot API
   * Spot API uses different signature: signature = HMAC(queryString)
   * @returns {Promise<Object>} Test result
   */
  async _testSpotConnection() {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    // Spot API signature is just HMAC of query string
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
    
    const url = `${this.spotBaseUrl}/api/v3/account?${queryString}&signature=${signature}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-MEXC-APIKEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.msg || data.message || `HTTP ${response.status}`);
      }
      
      return {
        success: true,
        api_type: 'spot',
        balances: data.balances?.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0).slice(0, 5),
      };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Test connection to MEXC
   * Tries Spot API first, then Futures API
   * @param {string} [apiKey] - API key to test (optional, uses instance key if not provided)
   * @param {string} [apiSecret] - API secret to test (optional, uses instance secret if not provided)
   * @returns {Promise<Object>} Test result
   */
  async testConnection(apiKey, apiSecret) {
    try {
      // If testing different credentials, create temporary adapter
      if (apiKey && apiSecret) {
        const testAdapter = new MexcAdapter({
          apiKey,
          apiSecret,
          testnet: this.testnet,
          logger: this.logger,
        });
        
        return await testAdapter.testConnection();
      }

      // Test connectivity with ping first
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      const pingResponse = await fetch(`${this.spotBaseUrl}/api/v3/ping`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (!pingResponse.ok) {
        throw new Error('MEXC connectivity test failed');
      }

      // Try Spot API first (most common)
      try {
        await this._testSpotConnection();
        return {
          success: true,
          exchange: 'MEXC',
          api_type: 'spot',
          message: 'Spot API connection successful',
          timestamp: new Date().toISOString(),
        };
      } catch (spotError) {
        this.logger.info({ error: spotError.message }, 'Spot API failed, trying Futures API');
        
        // Try Futures API
        const accountResult = await this.getAccount();
        
        if (!accountResult.success) {
          // Both failed - return the spot error as it's more common
          throw new Error(`Spot: ${spotError.message}`);
        }
        
        return {
          success: true,
          exchange: 'MEXC',
          api_type: 'futures',
          message: 'Futures API connection successful',
          account_info: {
            balance: accountResult.balance,
            available_balance: accountResult.available_balance,
          },
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      this.logger.error({ error: error.message }, 'MEXC testConnection failed');
      
      return {
        success: false,
        error: error.message,
        exchange: 'MEXC',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
