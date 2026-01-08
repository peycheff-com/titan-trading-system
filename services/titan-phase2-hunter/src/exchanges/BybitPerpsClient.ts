/**
 * Bybit Perpetuals Client for Execution Target
 * 
 * Provides REST API methods for order execution, data fetching, and account management.
 * Includes HMAC signature generation, caching, and retry logic.
 * 
 * Requirements: 7.1-7.7 (Execution), 11.1-11.7 (Multi-Timeframe Data)
 */

import { createHmac } from 'crypto';
import { OHLCV, OrderParams, OrderResult, OrderStatus } from '../types';

export interface BybitSymbolInfo {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  status: string;
  marginTrading: string;
  lotSizeFilter: {
    basePrecision: string;
    quotePrecision: string;
    minOrderQty: string;
    maxOrderQty: string;
    minOrderAmt: string;
    maxOrderAmt: string;
  };
  priceFilter: {
    minPrice: string;
    maxPrice: string;
    tickSize: string;
  };
}

export interface BybitTickerInfo {
  symbol: string;
  bid1Price: string;
  bid1Size: string;
  ask1Price: string;
  ask1Size: string;
  lastPrice: string;
  prevPrice24h: string;
  price24hPcnt: string;
  highPrice24h: string;
  lowPrice24h: string;
  turnover24h: string;
  volume24h: string;
}

export interface BybitKlineData {
  symbol: string;
  category: string;
  list: string[][]; // [startTime, openPrice, highPrice, lowPrice, closePrice, volume, turnover]
}

export interface BybitOrderResponse {
  orderId: string;
  orderLinkId: string;
  symbol: string;
  createTime: string;
  updateTime: string;
  side: string;
  orderType: string;
  qty: string;
  price: string;
  orderStatus: string;
  timeInForce: string;
  avgPrice: string;
  leavesQty: string;
  leavesValue: string;
  cumExecQty: string;
  cumExecValue: string;
  cumExecFee: string;
  rejectReason: string;
}

export interface BybitAccountInfo {
  totalEquity: string;
  totalWalletBalance: string;
  totalMarginBalance: string;
  totalAvailableBalance: string;
  totalPerpUPL: string;
  totalInitialMargin: string;
  totalMaintenanceMargin: string;
  coin: Array<{
    coin: string;
    equity: string;
    usdValue: string;
    walletBalance: string;
    availableToWithdraw: string;
    availableToBorrow: string;
    borrowAmount: string;
    accruedInterest: string;
    totalOrderIM: string;
    totalPositionIM: string;
    totalPositionMM: string;
    unrealisedPnl: string;
    cumRealisedPnl: string;
  }>;
}

export interface BybitPositionInfo {
  symbol: string;
  leverage: string;
  avgPrice: string;
  liqPrice: string;
  riskLimitValue: string;
  takeProfit: string;
  stopLoss: string;
  trailingStop: string;
  unrealisedPnl: string;
  cumRealisedPnl: string;
  positionMM: string;
  positionIM: string;
  positionValue: string;
  positionBalance: string;
  size: string;
  side: string;
  positionStatus: string;
  markPrice: string;
  bustPrice: string;
  positionIdx: number;
  tradeMode: number;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class BybitPerpsClient {
  private baseUrl = 'https://api.bybit.com';
  private apiKey: string;
  private apiSecret: string;
  private cache = new Map<string, CacheEntry<any>>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly REQUEST_TIMEOUT = 10000; // 10 seconds
  private readonly RETRY_ATTEMPTS = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  /**
   * Fetch top symbols by 24h volume (top 100)
   * @returns Promise with array of symbol names
   */
  public async fetchTopSymbols(): Promise<string[]> {
    const cacheKey = 'top_symbols';
    const cached = this.getFromCache<string[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.makeRequest('GET', '/v5/market/tickers', {
        category: 'linear'
      });

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      // Sort by 24h volume and take top 100
      const tickers = response.result.list as BybitTickerInfo[];
      const sortedSymbols = tickers
        .filter(ticker => ticker.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
        .slice(0, 100)
        .map(ticker => ticker.symbol);

      this.setCache(cacheKey, sortedSymbols, this.CACHE_TTL);
      return sortedSymbols;
    } catch (error) {
      throw new Error(`Failed to fetch top symbols: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch OHLCV data with caching (5-minute TTL)
   * @param symbol - Trading symbol (e.g., 'BTCUSDT')
   * @param interval - Timeframe ('1', '5', '15', '30', '60', '240', '1440')
   * @param limit - Number of candles (max 1000)
   * @returns Promise with OHLCV array
   */
  public async fetchOHLCV(symbol: string, interval: string, limit: number = 200): Promise<OHLCV[]> {
    const cacheKey = `ohlcv_${symbol}_${interval}_${limit}`;
    const cached = this.getFromCache<OHLCV[]>(cacheKey);
    if (cached) return cached;

    try {
      // Convert interval to Bybit format
      const bybitInterval = this.convertInterval(interval);
      
      const response = await this.makeRequest('GET', '/v5/market/kline', {
        category: 'linear',
        symbol: symbol.toUpperCase(),
        interval: bybitInterval,
        limit: Math.min(limit, 1000).toString()
      });

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      const klineData = response.result as BybitKlineData;
      const ohlcv: OHLCV[] = klineData.list.map(candle => ({
        timestamp: parseInt(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      }));

      // Sort by timestamp (oldest first)
      ohlcv.sort((a, b) => a.timestamp - b.timestamp);

      this.setCache(cacheKey, ohlcv, this.CACHE_TTL);
      return ohlcv;
    } catch (error) {
      throw new Error(`Failed to fetch OHLCV for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current price for a symbol
   * @param symbol - Trading symbol (e.g., 'BTCUSDT')
   * @returns Promise with current price
   */
  public async getCurrentPrice(symbol: string): Promise<number> {
    try {
      const response = await this.makeRequest('GET', '/v5/market/tickers', {
        category: 'linear',
        symbol: symbol.toUpperCase()
      });

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      const ticker = response.result.list[0] as BybitTickerInfo;
      if (!ticker) {
        throw new Error(`No ticker data found for ${symbol}`);
      }

      return parseFloat(ticker.lastPrice);
    } catch (error) {
      throw new Error(`Failed to get current price for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get account equity
   * @returns Promise with total equity in USDT
   */
  public async getEquity(): Promise<number> {
    try {
      const response = await this.makeRequest('GET', '/v5/account/wallet-balance', {
        accountType: 'UNIFIED'
      }, true);

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      const account = response.result.list[0] as BybitAccountInfo;
      if (!account) {
        throw new Error('No account data found');
      }

      return parseFloat(account.totalEquity);
    } catch (error) {
      throw new Error(`Failed to get equity: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Place order with HMAC signature and Post-Only support
   * @param params - Order parameters
   * @returns Promise with order result
   */
  public async placeOrder(params: OrderParams): Promise<OrderResult> {
    try {
      const orderParams: any = {
        category: 'linear',
        symbol: params.symbol.toUpperCase(),
        side: params.side,
        orderType: params.type === 'POST_ONLY' ? 'Limit' : params.type === 'LIMIT' ? 'Limit' : 'Market',
        qty: params.qty.toString(),
        timeInForce: params.type === 'POST_ONLY' ? 'PostOnly' : 'GTC'
      };

      // Add price for limit orders
      if (params.type === 'LIMIT' || params.type === 'POST_ONLY') {
        if (!params.price) {
          throw new Error('Price is required for limit orders');
        }
        orderParams.price = params.price.toString();
      }

      // Add stop loss and take profit if provided
      if (params.stopLoss) {
        orderParams.stopLoss = params.stopLoss.toString();
      }
      if (params.takeProfit) {
        orderParams.takeProfit = params.takeProfit.toString();
      }

      const response = await this.makeRequest('POST', '/v5/order/create', orderParams, true);

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      const orderData = response.result as BybitOrderResponse;
      
      return {
        orderId: orderData.orderId,
        symbol: orderData.symbol,
        side: orderData.side as 'Buy' | 'Sell',
        qty: parseFloat(orderData.qty),
        price: parseFloat(orderData.price || orderData.avgPrice || '0'),
        status: this.mapOrderStatus(orderData.orderStatus),
        timestamp: parseInt(orderData.createTime)
      };
    } catch (error) {
      throw new Error(`Failed to place order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Place order with retry logic (2-second timeout)
   * @param params - Order parameters
   * @param maxRetries - Maximum retry attempts (default: 2)
   * @returns Promise with order result
   */
  public async placeOrderWithRetry(params: OrderParams, maxRetries: number = 2): Promise<OrderResult> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Set timeout for each attempt
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Order timeout after 2 seconds')), 2000);
        });

        const orderPromise = this.placeOrder(params);
        const result = await Promise.race([orderPromise, timeoutPromise]);
        
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < maxRetries) {
          console.warn(`⚠️ Order attempt ${attempt + 1} failed, retrying: ${lastError.message}`);
          await this.sleep(this.RETRY_DELAY);
        }
      }
    }

    throw new Error(`Order failed after ${maxRetries + 1} attempts: ${lastError!.message}`);
  }

  /**
   * Set leverage for a symbol
   * @param symbol - Trading symbol
   * @param leverage - Leverage value (1-100)
   * @returns Promise with success status
   */
  public async setLeverage(symbol: string, leverage: number): Promise<boolean> {
    try {
      const response = await this.makeRequest('POST', '/v5/position/set-leverage', {
        category: 'linear',
        symbol: symbol.toUpperCase(),
        buyLeverage: leverage.toString(),
        sellLeverage: leverage.toString()
      }, true);

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to set leverage for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set stop loss for a position
   * @param symbol - Trading symbol
   * @param stopLoss - Stop loss price
   * @param positionIdx - Position index (0 for one-way mode)
   * @returns Promise with success status
   */
  public async setStopLoss(symbol: string, stopLoss: number, positionIdx: number = 0): Promise<boolean> {
    try {
      const response = await this.makeRequest('POST', '/v5/position/trading-stop', {
        category: 'linear',
        symbol: symbol.toUpperCase(),
        stopLoss: stopLoss.toString(),
        positionIdx: positionIdx.toString()
      }, true);

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to set stop loss for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set take profit for a position
   * @param symbol - Trading symbol
   * @param takeProfit - Take profit price
   * @param positionIdx - Position index (0 for one-way mode)
   * @returns Promise with success status
   */
  public async setTakeProfit(symbol: string, takeProfit: number, positionIdx: number = 0): Promise<boolean> {
    try {
      const response = await this.makeRequest('POST', '/v5/position/trading-stop', {
        category: 'linear',
        symbol: symbol.toUpperCase(),
        takeProfit: takeProfit.toString(),
        positionIdx: positionIdx.toString()
      }, true);

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to set take profit for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get order status
   * @param orderId - Order ID
   * @param symbol - Trading symbol
   * @returns Promise with order status
   */
  public async getOrderStatus(orderId: string, symbol: string): Promise<OrderStatus> {
    try {
      const response = await this.makeRequest('GET', '/v5/order/realtime', {
        category: 'linear',
        orderId: orderId,
        symbol: symbol.toUpperCase()
      }, true);

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      const orders = response.result.list as BybitOrderResponse[];
      if (orders.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      return this.mapOrderStatus(orders[0].orderStatus);
    } catch (error) {
      throw new Error(`Failed to get order status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cancel order
   * @param orderId - Order ID
   * @param symbol - Trading symbol
   * @returns Promise with success status
   */
  public async cancelOrder(orderId: string, symbol: string): Promise<boolean> {
    try {
      const response = await this.makeRequest('POST', '/v5/order/cancel', {
        category: 'linear',
        orderId: orderId,
        symbol: symbol.toUpperCase()
      }, true);

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      return true;
    } catch (error) {
      throw new Error(`Failed to cancel order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get position info
   * @param symbol - Trading symbol
   * @returns Promise with position info
   */
  public async getPositionInfo(symbol: string): Promise<BybitPositionInfo | null> {
    try {
      const response = await this.makeRequest('GET', '/v5/position/list', {
        category: 'linear',
        symbol: symbol.toUpperCase()
      }, true);

      if (response.retCode !== 0) {
        throw new Error(`Bybit API error: ${response.retMsg}`);
      }

      const positions = response.result.list as BybitPositionInfo[];
      return positions.length > 0 ? positions[0] : null;
    } catch (error) {
      throw new Error(`Failed to get position info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Make authenticated or public API request
   * @param method - HTTP method
   * @param endpoint - API endpoint
   * @param params - Request parameters
   * @param signed - Whether to sign the request
   * @returns Promise with API response
   */
  private async makeRequest(method: 'GET' | 'POST', endpoint: string, params: any = {}, signed: boolean = false): Promise<any> {
    const timestamp = Date.now().toString();
    let url = `${this.baseUrl}${endpoint}`;
    let body = '';

    // Prepare headers
    const headers: any = {
      'Content-Type': 'application/json',
      'X-BAPI-TIMESTAMP': timestamp,
      'X-BAPI-RECV-WINDOW': '5000'
    };

    if (signed) {
      headers['X-BAPI-API-KEY'] = this.apiKey;
    }

    // Prepare request data
    if (method === 'GET') {
      const queryString = new URLSearchParams(params).toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    } else {
      body = JSON.stringify(params);
    }

    // Generate signature for authenticated requests
    if (signed) {
      const signaturePayload = timestamp + this.apiKey + '5000' + (method === 'GET' ? new URLSearchParams(params).toString() : body);
      headers['X-BAPI-SIGN'] = createHmac('sha256', this.apiSecret).update(signaturePayload).digest('hex');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

      const response = await fetch(url, {
        method,
        headers,
        body: method === 'POST' ? body : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw new Error(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert interval to Bybit format
   * @param interval - Standard interval
   * @returns Bybit interval format
   */
  private convertInterval(interval: string): string {
    const intervalMap: { [key: string]: string } = {
      '1m': '1',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '1h': '60',
      '4h': '240',
      '1d': 'D',
      '1D': 'D',
      '1w': 'W',
      '1W': 'W'
    };

    return intervalMap[interval] || interval;
  }

  /**
   * Map Bybit order status to standard format
   * @param bybitStatus - Bybit order status
   * @returns Standard order status
   */
  private mapOrderStatus(bybitStatus: string): OrderStatus {
    const statusMap: { [key: string]: OrderStatus } = {
      'New': 'NEW',
      'PartiallyFilled': 'PARTIALLY_FILLED',
      'Filled': 'FILLED',
      'Cancelled': 'CANCELLED',
      'Rejected': 'REJECTED',
      'PartiallyFilledCanceled': 'CANCELLED',
      'Deactivated': 'CANCELLED'
    };

    return statusMap[bybitStatus] || 'NEW';
  }

  /**
   * Get data from cache if valid
   * @param key - Cache key
   * @returns Cached data or null
   */
  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set data in cache
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Time to live in milliseconds
   */
  private setCache<T>(key: string, data: T, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Sleep for specified milliseconds
   * @param ms - Milliseconds to sleep
   * @returns Promise that resolves after delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   * @returns Number of cached entries
   */
  public getCacheSize(): number {
    return this.cache.size;
  }
}