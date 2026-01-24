/**
 * ExchangeWebSocketClient - Multi-Exchange WebSocket Connection Manager
 *
 * Provides WebSocket clients for Binance, Coinbase, and Kraken trade streams
 * with automatic reconnection and connection health monitoring.
 *
 * Requirements: 4.1, 4.6 (Global Liquidity Aggregation)
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { ConnectionStatus, ExchangeFlow } from '../types';

/**
 * Trade data from exchange WebSocket
 */
export interface ExchangeTrade {
  exchange: 'binance' | 'coinbase' | 'kraken';
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
  exchange: 'binance' | 'coinbase' | 'kraken';
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
  exchange: 'binance' | 'coinbase' | 'kraken';
  symbols: string[];
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  messageTimeout: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Omit<ExchangeWebSocketConfig, 'exchange' | 'symbols'> = {
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,
  messageTimeout: 60000,
};

/**
 * Exchange WebSocket URLs
 */
const EXCHANGE_WS_URLS: Record<'binance' | 'coinbase' | 'kraken', string> = {
  binance: 'wss://stream.binance.com:9443/ws',
  coinbase: 'wss://ws-feed.exchange.coinbase.com',
  kraken: 'wss://ws.kraken.com',
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
      exchange: 'binance' | 'coinbase' | 'kraken';
    }
  ) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      symbols: ['BTCUSDT'],
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
          console.log(`🔗 ${this.config.exchange.toUpperCase()} WebSocket connected`);
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
          console.error(`❌ ${this.config.exchange.toUpperCase()} WebSocket error:`, error.message);
          this.emit('error', { exchange: this.config.exchange, error });
          if (!this.isReconnecting && this.reconnectAttempts === 0) {
            reject(error);
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          console.log(
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
      status: this.getStatus(),
      lastMessageTime: this.lastMessageTime,
      reconnectAttempts: this.reconnectAttempts,
      latency: avgLatency,
      messagesPerSecond,
      uptime: this.connectionStartTime > 0 ? now - this.connectionStartTime : 0,
    };
  }

  /**
   * Build WebSocket URL based on exchange
   */
  private buildWebSocketUrl(): string {
    const baseUrl = EXCHANGE_WS_URLS[this.config.exchange];

    switch (this.config.exchange) {
      case 'binance': {
        // Binance uses stream names in URL
        const streams = this.config.symbols.map(s => `${s.toLowerCase()}@aggTrade`).join('/');
        return `${baseUrl}/${streams}`;
      }

      case 'coinbase':
      case 'kraken':
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
      case 'coinbase':
        this.subscribeCoinbase();
        break;
      case 'kraken':
        this.subscribeKraken();
        break;
      // Binance subscribes via URL
    }
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
      case 'coinbase':
        return this.parseCoinbaseTrade(message);
      case 'kraken':
        return this.parseKrakenTrade(message);
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
      symbol: message.s,
      price: parseFloat(message.p),
      quantity: parseFloat(message.q),
      side: message.m ? 'sell' : 'buy', // m=true means buyer is maker (sell aggressor)
      timestamp: message.T,
      tradeId: message.a.toString(),
    };
  }

  /**
   * Parse Coinbase match message
   */
  private parseCoinbaseTrade(message: any): ExchangeTrade | null {
    if (message.type !== 'match') return null;

    return {
      exchange: 'coinbase',
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
      symbol: this.convertKrakenToSymbol(pair),
      price: parseFloat(latestTrade[0]),
      quantity: parseFloat(latestTrade[1]),
      side: latestTrade[3] === 'b' ? 'buy' : 'sell',
      timestamp: Math.floor(parseFloat(latestTrade[2]) * 1000),
      tradeId: `${pair}-${latestTrade[2]}`,
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
          console.warn(
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
      console.error(`❌ ${this.config.exchange.toUpperCase()} max reconnect attempts reached`);
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

    console.log(
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
        console.error(`❌ ${this.config.exchange.toUpperCase()} reconnect failed:`, error);
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
