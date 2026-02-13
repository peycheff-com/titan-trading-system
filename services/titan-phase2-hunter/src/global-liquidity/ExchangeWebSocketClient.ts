/**
 * ExchangeWebSocketClient - Multi-Exchange WebSocket Connection Manager
 *
 * Provides WebSocket clients for Binance, Bybit, Coinbase, Kraken, and MEXC
 * trade streams with automatic reconnection and connection health monitoring.
 * Supports multiple product types: Spot, Linear (USDT-M), Inverse, and Options.
 *
 * Requirements: 4.1, 4.6 (Global Liquidity Aggregation)
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ConnectionStatus, ExchangeFlow } from '../types';
import { Logger } from '@titan/shared';

/**
 * Supported exchange identifiers
 */
const logger = Logger.getInstance('hunter:ExchangeWebSocketClient');

export type ExchangeId = 'binance' | 'bybit' | 'coinbase' | 'deribit' | 'kraken' | 'mexc' | 'okx';

/**
 * Supported product types
 */
export type ProductType = 'spot' | 'linear' | 'inverse' | 'option';

/**
 * Trade data from exchange WebSocket
 */
export interface ExchangeTrade {
  exchange: ExchangeId;
  product: ProductType;
  symbol: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
  tradeId: string;
}

/**
 * Connection health metrics
 */
export interface ConnectionHealth {
  exchange: ExchangeId;
  product: ProductType;
  status: ConnectionStatus;
  lastMessageTime: number;
  reconnectAttempts: number;
  latency: number;
  messagesPerSecond: number;
  uptime: number;
}

/**
 * WebSocket client configuration
 */
export interface ExchangeWebSocketConfig {
  exchange: ExchangeId;
  product: ProductType;
  symbols: string[];
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  messageTimeout: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Omit<ExchangeWebSocketConfig, 'exchange' | 'product' | 'symbols'> = {
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,
  messageTimeout: 60000,
};

/**
 * Exchange WebSocket URLs by exchange and product type
 */
const EXCHANGE_WS_URLS: Record<ExchangeId, Partial<Record<ProductType, string>>> = {
  binance: {
    spot: 'wss://stream.binance.com:9443/ws',
    linear: 'wss://fstream.binance.com/ws',
    inverse: 'wss://dstream.binance.com/ws',
    option: 'wss://nbstream.binance.com/eoptions/ws',
  },
  bybit: {
    spot: 'wss://stream.bybit.com/v5/public/spot',
    linear: 'wss://stream.bybit.com/v5/public/linear',
    inverse: 'wss://stream.bybit.com/v5/public/inverse',
    option: 'wss://stream.bybit.com/v5/public/option',
  },
  coinbase: {
    spot: 'wss://advanced-trade-ws.coinbase.com',
  },
  deribit: {
    linear: 'wss://www.deribit.com/ws/api/v2',
    option: 'wss://www.deribit.com/ws/api/v2',
  },
  kraken: {
    spot: 'wss://ws.kraken.com/v2',
    linear: 'wss://futures.kraken.com/ws/v1',
  },
  mexc: {
    spot: 'wss://wbs.mexc.com/ws',
  },
  okx: {
    spot: 'wss://ws.okx.com:8443/ws/v5/public',
    linear: 'wss://ws.okx.com:8443/ws/v5/public',
    inverse: 'wss://ws.okx.com:8443/ws/v5/public',
    option: 'wss://ws.okx.com:8443/ws/v5/public',
  },
};

/**
 * ExchangeWebSocketClient - Manages WebSocket connections to crypto exchanges
 *
 * Emits events:
 * - 'trade': ExchangeTrade - New trade received
 * - 'connected': exchange - Connection established
 * - 'disconnected': exchange - Connection lost
 * - 'reconnecting': { exchange, attempt } - Reconnection attempt
 * - 'error': { exchange, error } - Error occurred
 * - 'healthUpdate': ConnectionHealth - Health metrics updated
 */
export class ExchangeWebSocketClient extends EventEmitter {
  private config: ExchangeWebSocketConfig;
  private ws: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private isReconnecting: boolean = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastMessageTime: number = 0;
  private connectionStartTime: number = 0;
  private messageCount: number = 0;
  private lastMessageCountReset: number = 0;
  private latencyMeasurements: number[] = [];
  private pingTime: number = 0;
  private isClosing: boolean = false;

  constructor(
    config: Partial<ExchangeWebSocketConfig> & {
      exchange: ExchangeId;
      product?: ProductType;
    }
  ) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      symbols: ['BTCUSDT'],
      product: 'spot',
      ...config,
    };
  }

  /**
   * Connect to the exchange WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    // eslint-disable-next-line functional/immutable-data
    this.isClosing = false;
    return new Promise((resolve, reject) => {
      try {
        const url = this.buildWebSocketUrl();
        // eslint-disable-next-line functional/immutable-data
        this.ws = new WebSocket(url);
        // eslint-disable-next-line functional/immutable-data
        this.connectionStartTime = Date.now();

        this.ws.on('open', () => {
          logger.info(`🔗 ${this.config.exchange.toUpperCase()} WebSocket connected`);
          // eslint-disable-next-line functional/immutable-data
          this.reconnectAttempts = 0;
          // eslint-disable-next-line functional/immutable-data
          this.isReconnecting = false;
          // eslint-disable-next-line functional/immutable-data
          this.lastMessageTime = Date.now();
          this.startHeartbeat();
          this.subscribeToStreams();
          this.emit('connected', this.config.exchange);
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('pong', () => {
          const latency = Date.now() - this.pingTime;
          // eslint-disable-next-line functional/immutable-data
          this.latencyMeasurements.push(latency);
          if (this.latencyMeasurements.length > 10) {
            // eslint-disable-next-line functional/immutable-data
            this.latencyMeasurements.shift();
          }
        });

        this.ws.on('error', (error: Error) => {
          logger.error(`❌ ${this.config.exchange.toUpperCase()} WebSocket error:`, error.message);
          this.emit('error', { exchange: this.config.exchange, error });
          if (!this.isReconnecting && this.reconnectAttempts === 0) {
            reject(error);
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          logger.info(
            `🔌 ${this.config.exchange.toUpperCase()} WebSocket closed: ${code} ${reason.toString()}`
          );
          this.stopHeartbeat();
          this.emit('disconnected', this.config.exchange);

          if (!this.isClosing) {
            this.attemptReconnect();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the exchange WebSocket
   */
  async disconnect(): Promise<void> {
    // eslint-disable-next-line functional/immutable-data
    this.isClosing = true;
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      // eslint-disable-next-line functional/immutable-data
      this.ws = null;
    }

    // eslint-disable-next-line functional/immutable-data
    this.reconnectAttempts = 0;
    // eslint-disable-next-line functional/immutable-data
    this.isReconnecting = false;
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    if (!this.ws) return ConnectionStatus.DISCONNECTED;

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return ConnectionStatus.RECONNECTING;
      case WebSocket.OPEN:
        // Check if messages are stale
        if (Date.now() - this.lastMessageTime > this.config.messageTimeout) {
          return ConnectionStatus.DELAYED;
        }
        return ConnectionStatus.CONNECTED;
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
      default:
        return this.isReconnecting ? ConnectionStatus.RECONNECTING : ConnectionStatus.DISCONNECTED;
    }
  }

  /**
   * Get connection health metrics
   */
  getHealth(): ConnectionHealth {
    const avgLatency =
      this.latencyMeasurements.length > 0
        ? this.latencyMeasurements.reduce((a, b) => a + b, 0) / this.latencyMeasurements.length
        : 0;

    const now = Date.now();
    const timeSinceReset = (now - this.lastMessageCountReset) / 1000;
    const messagesPerSecond = timeSinceReset > 0 ? this.messageCount / timeSinceReset : 0;

    // Reset message count periodically
    if (timeSinceReset > 60) {
      // eslint-disable-next-line functional/immutable-data
      this.messageCount = 0;
      // eslint-disable-next-line functional/immutable-data
      this.lastMessageCountReset = now;
    }

    return {
      exchange: this.config.exchange,
      product: this.config.product,
      status: this.getStatus(),
      lastMessageTime: this.lastMessageTime,
      reconnectAttempts: this.reconnectAttempts,
      latency: avgLatency,
      messagesPerSecond,
      uptime: this.connectionStartTime > 0 ? now - this.connectionStartTime : 0,
    };
  }

  /**
   * Build WebSocket URL based on exchange and product
   */
  private buildWebSocketUrl(): string {
    const exchangeUrls = EXCHANGE_WS_URLS[this.config.exchange];
    const baseUrl = exchangeUrls[this.config.product];

    if (!baseUrl) {
      throw new Error(`No WebSocket URL for ${this.config.exchange} ${this.config.product}`);
    }

    switch (this.config.exchange) {
      case 'binance': {
        // Binance uses stream names in URL for all products
        const streamSuffix = this.config.product === 'spot' ? 'aggTrade' : 'aggTrade';
        const streams = this.config.symbols
          .map(s => `${s.toLowerCase()}@${streamSuffix}`)
          .join('/');
        return `${baseUrl}/${streams}`;
      }

      case 'bybit':
      case 'coinbase':
      case 'kraken':
      case 'mexc':
      case 'okx':
        // These exchanges subscribe after connection
        return baseUrl;

      default:
        return baseUrl;
    }
  }

  /**
   * Subscribe to trade streams after connection
   */
  private subscribeToStreams(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    switch (this.config.exchange) {
      case 'bybit':
        this.subscribeBybit();
        break;
      case 'coinbase':
        this.subscribeCoinbase();
        break;
      case 'kraken':
        this.subscribeKraken();
        break;
      case 'mexc':
        this.subscribeMexc();
        break;

      case 'deribit':
        this.subscribeDeribit();
        break;

      case 'okx':
        this.subscribeOkx();
        break;
      // Binance subscribes via URL
    }
  }

  /**
   * Subscribe to Bybit V5 trade stream
   */
  private subscribeBybit(): void {
    // Bybit V5 Format: publicTrade.{SYMBOL}
    const args = this.config.symbols.map(s => `publicTrade.${s.toUpperCase()}`);
    const subscribeMessage = {
      op: 'subscribe',
      args: args,
    };
    this.ws?.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Subscribe to Coinbase trade stream
   */
  private subscribeCoinbase(): void {
    const productIds = this.config.symbols.map(s => this.convertSymbolToCoinbase(s));
    const subscribeMessage = {
      type: 'subscribe',
      product_ids: productIds,
      channels: ['matches'],
    };
    this.ws?.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Subscribe to Kraken trade stream
   */
  private subscribeKraken(): void {
    const pairs = this.config.symbols.map(s => this.convertSymbolToKraken(s));
    const subscribeMessage = {
      event: 'subscribe',
      pair: pairs,
      subscription: { name: 'trade' },
    };
    this.ws?.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Subscribe to MEXC trade stream
   */
  private subscribeMexc(): void {
    // MEXC Format: spot@public.deals.v3.api@<SYMBOL>
    const params = this.config.symbols.map(s => `spot@public.deals.v3.api@${s.toUpperCase()}`);
    const subscribeMessage = {
      method: 'SUBSCRIPTION',
      params: params,
    };
    this.ws?.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Subscribe to Deribit trade stream (Options/Futures)
   * Uses JSON-RPC 2.0 format: { jsonrpc: "2.0", method: "public/subscribe", params: { channels: ["trades.{instrument_name}.raw"] } }
   */
  private subscribeDeribit(): void {
    // Deribit uses instrument names like "BTC-PERPETUAL" for perpetual futures
    // or "BTC-31JAN25-100000-C" for options
    // Build channels using map to avoid array mutation
    const channels = this.config.symbols.map(symbol => {
      const baseCoin = symbol
        .replace(/USDT$/, '')
        .replace(/USD$/, '')
        .replace(/PERP$/, '')
        .toUpperCase();

      if (this.config.product === 'option') {
        // Subscribe to all options trades for this coin using trades.option.{currency}.raw
        return `trades.option.${baseCoin}.raw`;
      } else {
        // Subscribe to perpetual futures
        return `trades.${baseCoin}-PERPETUAL.raw`;
      }
    });

    // Deribit uses JSON-RPC 2.0
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'public/subscribe',
      params: {
        channels: channels,
      },
    };

    this.ws?.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Subscribe to OKX trade stream
   */
  private subscribeOkx(): void {
    const args = this.config.symbols.map(symbol => {
      // Normalize symbol to OKX format
      // eslint-disable-next-line functional/no-let
      let instId = symbol;
      if (this.config.product === 'spot') {
        instId = symbol.replace('USDT', '-USDT').replace('USD', '-USD');
      } else if (this.config.product === 'linear') {
        instId = symbol.replace('USDT', '-USDT') + '-SWAP';
      }
      return {
        channel: 'trades',
        instId: instId,
      };
    });
    const subscribeMessage = { op: 'subscribe', args: args };
    this.ws?.send(JSON.stringify(subscribeMessage));
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: WebSocket.Data): void {
    // eslint-disable-next-line functional/immutable-data
    this.lastMessageTime = Date.now();
    // eslint-disable-next-line functional/immutable-data
    this.messageCount++;

    try {
      const message = JSON.parse(data.toString());
      const trade = this.parseTradeMessage(message);

      if (trade) {
        this.emit('trade', trade);
      }
    } catch (error) {
      // Ignore parse errors for non-trade messages
    }
  }

  /**
   * Parse trade message based on exchange format
   */
  private parseTradeMessage(message: any): ExchangeTrade | null {
    switch (this.config.exchange) {
      case 'binance':
        return this.parseBinanceTrade(message);
      case 'bybit':
        return this.parseBybitTrade(message);
      case 'coinbase':
        return this.parseCoinbaseTrade(message);
      case 'kraken':
        return this.parseKrakenTrade(message);
      case 'mexc':
        return this.parseMexcTrade(message);

      case 'deribit':
        return this.parseDeribitTrade(message);
      case 'okx':
        return this.parseOkxTrade(message);
      default:
        return null;
    }
  }

  /**
   * Parse Binance aggTrade message
   */
  private parseBinanceTrade(message: any): ExchangeTrade | null {
    if (message.e !== 'aggTrade') return null;

    return {
      exchange: 'binance',
      product: this.config.product,
      symbol: message.s,
      price: parseFloat(message.p),
      quantity: parseFloat(message.q),
      side: message.m ? 'sell' : 'buy', // m=true means buyer is maker (sell aggressor)
      timestamp: message.T,
      tradeId: message.a.toString(),
    };
  }

  /**
   * Parse Bybit V5 trade message
   */
  private parseBybitTrade(message: any): ExchangeTrade | null {
    // Bybit V5 Format:
    // {
    //   "topic": "publicTrade.BTCUSDT",
    //   "type": "snapshot",
    //   "ts": 1672304486868,
    //   "data": [{
    //     "T": 1672304486865,  // timestamp
    //     "s": "BTCUSDT",     // symbol
    //     "S": "Buy",         // side
    //     "v": "0.001",       // quantity
    //     "p": "16578.50",    // price
    //     "i": "uuid"         // trade ID
    //   }]
    // }
    if (!message.topic || !message.topic.startsWith('publicTrade.')) {
      return null;
    }
    if (!message.data || !Array.isArray(message.data) || message.data.length === 0) {
      return null;
    }

    // Get the most recent trade
    const trade = message.data[message.data.length - 1];

    return {
      exchange: 'bybit',
      product: this.config.product,
      symbol: trade.s,
      price: parseFloat(trade.p),
      quantity: parseFloat(trade.v),
      side: trade.S.toLowerCase() as 'buy' | 'sell',
      timestamp: trade.T,
      tradeId: trade.i,
    };
  }

  /**
   * Parse Coinbase match message
   */
  private parseCoinbaseTrade(message: any): ExchangeTrade | null {
    if (message.type !== 'match') return null;

    return {
      exchange: 'coinbase',
      product: this.config.product,
      symbol: this.convertCoinbaseToSymbol(message.product_id),
      price: parseFloat(message.price),
      quantity: parseFloat(message.size),
      side: message.side as 'buy' | 'sell',
      timestamp: new Date(message.time).getTime(),
      tradeId: message.trade_id.toString(),
    };
  }

  /**
   * Parse Kraken trade message
   */
  private parseKrakenTrade(message: any): ExchangeTrade | null {
    // Kraken sends array format: [channelID, [[price, volume, time, side, orderType, misc], ...], channelName, pair]
    if (!Array.isArray(message) || message.length < 4) return null;
    if (message[2] !== 'trade') return null;

    const trades = message[1];
    const pair = message[3];

    if (!Array.isArray(trades) || trades.length === 0) return null;

    // Return the most recent trade
    const latestTrade = trades[trades.length - 1];

    return {
      exchange: 'kraken',
      product: this.config.product,
      symbol: this.convertKrakenToSymbol(pair),
      price: parseFloat(latestTrade[0]),
      quantity: parseFloat(latestTrade[1]),
      side: latestTrade[3] === 'b' ? 'buy' : 'sell',
      timestamp: Math.floor(parseFloat(latestTrade[2]) * 1000),
      tradeId: `${pair}-${latestTrade[2]}`,
    };
  }

  /**
   * Parse MEXC trade message
   */
  private parseMexcTrade(message: any): ExchangeTrade | null {
    // MEXC Format:
    // {
    //   "c": "spot@public.deals.v3.api@BTCUSDT",
    //   "d": {
    //     "deals": [
    //       {
    //         "t": 1612239652123, // Trade time
    //         "p": "32200.5",     // Price
    //         "q": "0.022",       // Quantity
    //         "S": 1              // 1: Buy, 2: Sell
    //       }
    //     ]
    //   },
    //   "t": 1612239652345 // Push time
    // }

    if (!message.c || !message.c.startsWith('spot@public.deals.v3.api@')) {
      return null;
    }
    if (!message.d || !message.d.deals || !Array.isArray(message.d.deals)) {
      return null;
    }

    const deals = message.d.deals;
    if (deals.length === 0) return null;

    // Get the last deal in the array
    const deal = deals[deals.length - 1];

    // Extract symbol from channel name
    const symbol = message.c.split('@')[2];

    return {
      exchange: 'mexc',
      product: this.config.product,
      symbol: symbol,
      price: parseFloat(deal.p),
      quantity: parseFloat(deal.q),
      side: deal.S === 1 ? 'buy' : 'sell',
      timestamp: deal.t,
      tradeId: `${symbol}-${deal.t}-${deal.p}`, // Construct a unique ID as MEXC doesn't provide one per trade in this stream
    };
  }

  /**
   * Parse Deribit trade message (Options/Futures)
   * Format: { jsonrpc: "2.0", method: "subscription", params: { channel: "trades.option.BTC.raw", data: [...] } }
   * Trade data: { instrument_name, trade_seq, trade_id, timestamp, tick_direction, price, mark_price, iv, index_price, direction, amount }
   */
  private parseDeribitTrade(message: any): ExchangeTrade | null {
    // Handle JSON-RPC subscription response (confirmation)
    if (message.result) return null;

    // Handle JSON-RPC errors
    if (message.error) return null;

    // Trade data comes via "subscription" method
    if (message.method !== 'subscription' || !message.params) return null;

    const { channel, data } = message.params;
    if (!channel || !data || !Array.isArray(data) || data.length === 0) {
      return null;
    }

    // Process latest trade
    const trade = data[data.length - 1];

    // Normalize symbol from Deribit format (BTC-PERPETUAL or BTC-31JAN25-100000-C)
    // Extract the base currency (first part before first dash)
    const instrumentParts = trade.instrument_name.split('-');
    const baseCoin = instrumentParts[0];

    return {
      exchange: 'deribit',
      product: this.config.product,
      symbol: `${baseCoin}USD`, // Normalize to BTCUSD format
      price: trade.price,
      quantity: trade.amount,
      side: trade.direction.toLowerCase() as 'buy' | 'sell',
      timestamp: trade.timestamp,
      tradeId: trade.trade_id,
    };
  }

  /**
   * Parse OKX trade message
   */
  private parseOkxTrade(message: any): ExchangeTrade | null {
    // OKX Format: { arg: { channel: 'trades', instId: 'BTC-USDT' }, data: [ { instId, tradeId, px, sz, side, ts } ] }
    if (!message.data || !Array.isArray(message.data) || message.data.length === 0) {
      return null;
    }

    // Process most recent trade
    const trade = message.data[message.data.length - 1];

    // Normalize symbol to standard format (remove dashes)
    const symbol = trade.instId.replace(/-/g, '').replace('SWAP', '');

    return {
      exchange: 'okx',
      product: this.config.product,
      symbol: symbol,
      price: parseFloat(trade.px),
      quantity: parseFloat(trade.sz),
      side: trade.side as 'buy' | 'sell',
      timestamp: parseInt(trade.ts, 10),
      tradeId: trade.tradeId,
    };
  }

  /**
   * Convert symbol to Coinbase format (BTCUSDT -> BTC-USD)
   */
  private convertSymbolToCoinbase(symbol: string): string {
    // Handle common patterns
    if (symbol.endsWith('USDT')) {
      return symbol.replace('USDT', '-USD');
    }
    if (symbol.endsWith('USD')) {
      return symbol.replace('USD', '-USD');
    }
    return symbol;
  }

  /**
   * Convert Coinbase format to symbol (BTC-USD -> BTCUSDT)
   */
  private convertCoinbaseToSymbol(productId: string): string {
    return productId.replace('-USD', 'USDT').replace('-', '');
  }

  /**
   * Convert symbol to Kraken format (BTCUSDT -> XBT/USD)
   */
  private convertSymbolToKraken(symbol: string): string {
    // Kraken uses XBT for BTC
    // eslint-disable-next-line functional/no-let
    let converted = symbol.replace('BTC', 'XBT');

    if (converted.endsWith('USDT')) {
      converted = converted.replace('USDT', '/USD');
    } else if (converted.endsWith('USD')) {
      converted = converted.slice(0, -3) + '/USD';
    }

    return converted;
  }

  /**
   * Convert Kraken format to symbol (XBT/USD -> BTCUSDT)
   */
  private convertKrakenToSymbol(pair: string): string {
    return pair.replace('XBT', 'BTC').replace('/USD', 'USDT').replace('/', '');
  }

  /**
   * Start heartbeat to monitor connection health
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    // eslint-disable-next-line functional/immutable-data
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send ping
        // eslint-disable-next-line functional/immutable-data
        this.pingTime = Date.now();
        this.ws.ping();

        // Check for stale connection
        if (Date.now() - this.lastMessageTime > this.config.messageTimeout) {
          logger.warn(
            `⚠️ ${this.config.exchange.toUpperCase()} connection stale, reconnecting...`
          );
          this.ws.close();
        }

        // Emit health update
        this.emit('healthUpdate', this.getHealth());
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      // eslint-disable-next-line functional/immutable-data
      this.heartbeatTimer = null;
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.isReconnecting || this.isClosing) return;
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error(`❌ ${this.config.exchange.toUpperCase()} max reconnect attempts reached`);
      this.emit('error', {
        exchange: this.config.exchange,
        error: new Error('Max reconnect attempts reached'),
      });
      return;
    }

    // eslint-disable-next-line functional/immutable-data
    this.isReconnecting = true;
    // eslint-disable-next-line functional/immutable-data
    this.reconnectAttempts++;

    const delay = Math.min(
      this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
      60000 // Max 60 seconds
    );

    logger.info(
      `🔄 ${this.config.exchange.toUpperCase()} reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`
    );

    this.emit('reconnecting', {
      exchange: this.config.exchange,
      attempt: this.reconnectAttempts,
    });

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error(`❌ ${this.config.exchange.toUpperCase()} reconnect failed:`, error);
        // eslint-disable-next-line functional/immutable-data
        this.isReconnecting = false;
        this.attemptReconnect();
      }
    }, delay);
  }

  /**
   * Update symbols to subscribe to
   */
  updateSymbols(symbols: string[]): void {
    // eslint-disable-next-line functional/immutable-data
    this.config.symbols = symbols;

    // Reconnect to apply new symbols
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
      // Will auto-reconnect with new symbols
    }
  }
}
