import crypto from 'crypto';
import { fetch } from 'undici';

export class BinanceAdapter {
  constructor(apiKey, apiSecret, testnet = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.testnet = testnet;
    this.baseUrl = testnet
      ? 'https://testnet.binance.vision' // Spot Testnet
      : 'https://api.binance.com';
    // this.baseUrl = 'https://fapi.binance.com'; // Futures - user report mentions "Spot trading"
  }

  /**
   * Generate HMAC signature
   */
  _sign(queryString) {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Make authenticated request
   */
  async _request(method, endpoint, params = {}) {
    const timestamp = Date.now();
    let queryString = new URLSearchParams({ ...params, timestamp }).toString();
    const signature = this._sign(queryString);
    queryString += `&signature=${signature}`;

    const url = `${this.baseUrl}${endpoint}?${queryString}`;
    
    const headers = {
      'X-MBX-APIKEY': this.apiKey,
      'Content-Type': 'application/x-www-form-urlencoded', // Binance usually takes query params even for POST, but standard is URL-encoded body or query
    };

    // For POST/DELETE, Binance V3 often accepts params in query string or body. 
    // Query string is safest for signature matching.
    
    // However, if we put everything in query string (as constructed above), 
    // we don't need body for GET/DELETE/POST if all params are moved there.
    
    const response = await fetch(url, {
      method,
      headers
    });

    const data = await response.json();

    if (data.code && data.code !== 0) {
        throw new Error(`Binance API Error: ${data.msg} (Code: ${data.code})`);
    }

    return data;
  }

  async testConnection() {
      try {
          // getAccount is a good test
          await this.getAccount();
          return { success: true, message: 'Connected to Binance Spot' };
      } catch (e) {
          return { success: false, error: e.message };
      }
  }

  async getAccount() {
    const data = await this._request('GET', '/api/v3/account');
    
    // Transform to standard format
    // Binance Spot balances
    const balances = data.balances.map(b => ({
      asset: b.asset,
      free: parseFloat(b.free),
      locked: parseFloat(b.locked),
      total: parseFloat(b.free) + parseFloat(b.locked)
    })).filter(b => b.total > 0);

    // Calculate approximate equity in USDT (simplified, just USDT balance for now or sum of assets if we had prices)
    // For specific task, usually USDT is main concern.
    const usdt = balances.find(b => b.asset === 'USDT');
    const equity = usdt ? usdt.total : 0; // Rough approximation for Spot
    const available = usdt ? usdt.free : 0;

    return {
      equity,
      available_balance: available,
      balances, // Extra field specific to Spot
      unrealized_pnl: 0 // Spot has no unrealized PnL in the same way as Perp
    };
  }

  async getPositions() {
      // Spot doesn't have "positions" like futures. It has balances.
      // We return balances as positions for compatibility with the interface.
      const account = await this.getAccount();
      return account.balances.map(b => ({
          symbol: `${b.asset}USDT`, // Assumption: Measured in USDT
          side: 'LONG', // Spot is always long assets
          size: b.total,
          entry_price: 0, // Not tracked by simple account endpoint
          unrealized_pnl: 0
      }));
  }

  async sendOrder(order) {
    // order: { symbol, side, size, order_type, limit_price? }
    const side = order.side.toUpperCase(); // BUY/SELL
    const type = order.order_type === 'MARKET' ? 'MARKET' : 'LIMIT';
    
    const params = {
        symbol: order.symbol.replace('/', '').replace('-', ''), // Normalize symbol (e.g. BTCUSDT)
        side,
        type,
        quantity: order.size,
    };

    if (type === 'LIMIT') {
        params.price = order.limit_price;
        params.timeInForce = 'GTC';
    }

    const res = await this._request('POST', '/api/v3/order', params);

    return {
        broker_order_id: res.orderId,
        status: res.status, // NEW, FILLED, etc.
        fill_price: res.cummulativeQuoteQty && res.executedQty ? (parseFloat(res.cummulativeQuoteQty) / parseFloat(res.executedQty)) : undefined
    };
  }

  async cancelOrder(orderId, symbol) {
      return await this._request('DELETE', '/api/v3/order', {
          symbol: symbol.replace('/', ''),
          orderId
      });
  }
}
