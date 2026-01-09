import crypto from 'crypto';
import { fetch } from 'undici';

export class BybitAdapter {
  constructor(options = {}) {
    const { apiKey, apiSecret, testnet = true } = options;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = testnet === false
      ? 'https://api.bybit.com'
      : 'https://api-testnet.bybit.com';
    this.recvWindow = 5000;
  }
  
  /**
   * Generate signature for Bybit API
   */
  _generateSignature(timestamp, params) {
    const paramStr = timestamp + this.apiKey + this.recvWindow + params;
    return crypto.createHmac('sha256', this.apiSecret).update(paramStr).digest('hex');
  }
  
  /**
   * Make authenticated request to Bybit
   */
  async _request(method, endpoint, params = {}) {
    const timestamp = Date.now().toString();
    const queryString = method === 'GET' ? new URLSearchParams(params).toString() : '';
    const bodyString = method === 'POST' ? JSON.stringify(params) : '';
    
    // For GET, signature payload is queryString. For POST, it's JSON body.
    const signaturePayload = method === 'GET' ? queryString : bodyString;
    const signature = this._generateSignature(timestamp, signaturePayload);
    
    const url = `${this.baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;
    
    const headers = {
      'X-BAPI-API-KEY': this.apiKey,
      'X-BAPI-SIGN': signature,
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': this.recvWindow.toString(),
      'Content-Type': 'application/json',
    };
    
    const response = await fetch(url, {
      method,
      headers,
      body: method === 'POST' ? bodyString : undefined,
    });
    
    const data = await response.json();
    
    if (data.retCode !== 0) {
      throw new Error(data.retMsg || 'Bybit API error');
    }
    
    return data.result;
  }
  
  /**
   * Test connection
   */
  async testConnection() {
    try {
      const result = await this._request('GET', '/v5/user/query-api');
      return {
        success: true,
        message: 'Connected to Bybit',
        user_id: result.uid,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
  
  /**
   * Get account balance
   */
  async getAccount() {
    const result = await this._request('GET', '/v5/account/wallet-balance', {
      accountType: 'UNIFIED',
    });
    
    const account = result.list[0];
    const equity = parseFloat(account.totalEquity);
    // Use totalWalletBalance as available if totalAvailableBalance not explicit for UNIFIED sometimes, 
    // but usually totalAvailableBalance is correct.
    const availableBalance = parseFloat(account.totalAvailableBalance || account.totalWalletBalance);
    
    return {
      equity,
      available_balance: availableBalance,
      unrealized_pnl: parseFloat(account.totalPerpUPL || 0),
    };
  }
  
  /**
   * Get open positions
   */
  async getPositions() {
    const result = await this._request('GET', '/v5/position/list', {
      category: 'linear',
      settleCoin: 'USDT',
    });
    
    const list = result.list || [];
    
    return list
      .filter(pos => parseFloat(pos.size) > 0)
      .map(pos => ({
        symbol: pos.symbol,
        side: pos.side === 'Buy' ? 'LONG' : 'SHORT',
        size: parseFloat(pos.size),
        entry_price: parseFloat(pos.avgPrice),
        unrealized_pnl: parseFloat(pos.unrealisedPnl),
        leverage: parseFloat(pos.leverage),
      }));
  }
  
  /**
   * Send order
   */
  async sendOrder(order) {
    const params = {
      category: 'linear',
      symbol: order.symbol,
      side: order.side === 'BUY' ? 'Buy' : 'Sell',
      orderType: order.order_type === 'MARKET' ? 'Market' : 'Limit',
      qty: order.size.toString(),
      timeInForce: order.post_only ? 'PostOnly' : 'GTC',
    };
    
    if (order.limit_price) {
      params.price = order.limit_price.toString();
    }
    
    if (order.stop_loss) {
      params.stopLoss = order.stop_loss.toString();
    }
    
    if (order.take_profits && order.take_profits.length > 0) {
      params.takeProfit = order.take_profits[0].toString();
    }
    
    if (order.reduce_only) {
        params.reduceOnly = true;
    }
    
    const result = await this._request('POST', '/v5/order/create', params);
    
    return {
      broker_order_id: result.orderId,
      status: 'NEW',
    };
  }

  /**
   * Close specific position
   */
  async closePosition(symbol) {
      // 1. Get position details to know size and side
      const positions = await this.getPositions();
      const pos = positions.find(p => p.symbol === symbol);
      if (!pos) {
          return { success: false, error: 'Position not found' };
      }

      // 2. Send reduce_only market order
      return await this.sendOrder({
          symbol: pos.symbol,
          side: pos.side === 'LONG' ? 'SELL' : 'BUY',
          size: pos.size,
          order_type: 'MARKET',
          reduce_only: true
      });
  }
  
  /**
   * Close all positions
   */
  async closeAllPositions() {
    const positions = await this.getPositions();
    const results = [];
    
    for (const pos of positions) {
      try {
        const res = await this.sendOrder({
            symbol: pos.symbol,
            side: pos.side === 'LONG' ? 'SELL' : 'BUY',
            size: pos.size,
            order_type: 'MARKET',
            reduce_only: true,
        });
        results.push({ symbol: pos.symbol, success: true, result: res });
      } catch (e) {
        results.push({ symbol: pos.symbol, success: false, error: e.message });
      }
    }
    
    return {
      success: true,
      closed_count: positions.length,
      details: results
    };
  }
}
