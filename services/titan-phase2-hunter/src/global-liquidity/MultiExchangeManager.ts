/**
 * MultiExchangeManager - Manages connections to multiple exchanges
 *
 * Coordinates WebSocket connections to Binance, Coinbase, and Kraken
 * with unified trade stream and connection health monitoring.
 *
 * Requirements: 4.1, 4.6 (Global Liquidity Aggregation)
 */

import { EventEmitter } from 'events';
import {
  ExchangeWebSocketClient,
  ExchangeTrade,
  ConnectionHealth,
} from './ExchangeWebSocketClient';
import { ConnectionStatus, ExchangeFlow } from '../types';

/**
 * Multi-exchange manager configuration
 */
export interface MultiExchangeManagerConfig {
  symbols: string[];
  exchanges: ('binance' | 'coinbase' | 'kraken')[];
  reconnectInterval: number;
  maxReconnectAttempts: number;
  heartbeatInterval: number;
  messageTimeout: number;
}

/**
 * Exchange status summary
 */
export interface ExchangeStatusSummary {
  binance: ConnectionStatus;
  coinbase: ConnectionStatus;
  kraken: ConnectionStatus;
  connectedCount: number;
  totalExchanges: number;
  allConnected: boolean;
  anyConnected: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: MultiExchangeManagerConfig = {
  symbols: ['BTCUSDT'],
  exchanges: ['binance', 'coinbase', 'kraken'],
  reconnectInterval: 5000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 30000,
  messageTimeout: 60000,
};

/**
 * MultiExchangeManager - Unified multi-exchange WebSocket manager
 *
 * Emits events:
 * - 'trade': ExchangeTrade - Trade from any exchange
 * - 'exchangeConnected': exchange - Single exchange connected
 * - 'exchangeDisconnected': exchange - Single exchange disconnected
 * - 'allConnected': void - All exchanges connected
 * - 'connectionLost': { exchange, remainingCount } - Exchange connection lost
 * - 'healthUpdate': Map<exchange, ConnectionHealth> - Health metrics updated
 * - 'statusChange': ExchangeStatusSummary - Status changed
 */
export class MultiExchangeManager extends EventEmitter {
  private config: MultiExchangeManagerConfig;
  private clients: Map<'binance' | 'coinbase' | 'kraken', ExchangeWebSocketClient> = new Map();
  private healthMetrics: Map<'binance' | 'coinbase' | 'kraken', ConnectionHealth> = new Map();
  private isInitialized: boolean = false;

  constructor(config: Partial<MultiExchangeManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize and connect to all configured exchanges
   * Requirement 4.1: Establish WebSocket connections to Binance, Coinbase, and Kraken
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ MultiExchangeManager already initialized');
      return;
    }

    console.log('🌐 Initializing Multi-Exchange Manager...');
    console.log(`📊 Exchanges: ${this.config.exchanges.join(', ')}`);
    console.log(`📈 Symbols: ${this.config.symbols.join(', ')}`);

    // Create clients for each exchange
    for (const exchange of this.config.exchanges) {
      const client = new ExchangeWebSocketClient({
        exchange,
        symbols: this.config.symbols,
        reconnectInterval: this.config.reconnectInterval,
        maxReconnectAttempts: this.config.maxReconnectAttempts,
        heartbeatInterval: this.config.heartbeatInterval,
        messageTimeout: this.config.messageTimeout,
      });

      this.setupClientListeners(client, exchange);
      // eslint-disable-next-line functional/immutable-data
      this.clients.set(exchange, client);
    }

    // Connect to all exchanges in parallel
    const connectionPromises = Array.from(this.clients.entries()).map(
      async ([exchange, client]) => {
        try {
          await client.connect();
          return { exchange, success: true };
        } catch (error) {
          console.error(`❌ Failed to connect to ${exchange}:`, error);
          return { exchange, success: false, error };
        }
      }
    );

    const results = await Promise.all(connectionPromises);
    const successCount = results.filter(r => r.success).length;

    console.log(`✅ Connected to ${successCount}/${this.config.exchanges.length} exchanges`);

    // eslint-disable-next-line functional/immutable-data
    this.isInitialized = true;
    this.emitStatusChange();

    // Check if all connected
    if (successCount === this.config.exchanges.length) {
      this.emit('allConnected');
    }
  }

  /**
   * Disconnect from all exchanges
   */
  async disconnect(): Promise<void> {
    console.log('🔌 Disconnecting from all exchanges...');

    const disconnectPromises = Array.from(this.clients.values()).map(client => client.disconnect());

    await Promise.all(disconnectPromises);

    // eslint-disable-next-line functional/immutable-data
    this.clients.clear();
    // eslint-disable-next-line functional/immutable-data
    this.healthMetrics.clear();
    // eslint-disable-next-line functional/immutable-data
    this.isInitialized = false;

    console.log('✅ Disconnected from all exchanges');
  }

  /**
   * Get current status of all exchanges
   * Requirement 4.6: Add connection health monitoring and status reporting
   */
  getStatus(): ExchangeStatusSummary {
    const statuses: Record<'binance' | 'coinbase' | 'kraken', ConnectionStatus> = {
      binance: ConnectionStatus.DISCONNECTED,
      coinbase: ConnectionStatus.DISCONNECTED,
      kraken: ConnectionStatus.DISCONNECTED,
    };

    // eslint-disable-next-line functional/no-let
    let connectedCount = 0;

    for (const [exchange, client] of this.clients) {
      const status = client.getStatus();
      // eslint-disable-next-line functional/immutable-data
      statuses[exchange] = status;
      if (status === ConnectionStatus.CONNECTED) {
        connectedCount++;
      }
    }

    return {
      ...statuses,
      connectedCount,
      totalExchanges: this.config.exchanges.length,
      allConnected: connectedCount === this.config.exchanges.length,
      anyConnected: connectedCount > 0,
    };
  }

  /**
   * Get health metrics for all exchanges
   */
  getHealthMetrics(): Map<'binance' | 'coinbase' | 'kraken', ConnectionHealth> {
    const metrics = new Map<'binance' | 'coinbase' | 'kraken', ConnectionHealth>();

    for (const [exchange, client] of this.clients) {
      // eslint-disable-next-line functional/immutable-data
      metrics.set(exchange, client.getHealth());
    }

    return metrics;
  }

  /**
   * Get health for a specific exchange
   */
  getExchangeHealth(exchange: 'binance' | 'coinbase' | 'kraken'): ConnectionHealth | null {
    const client = this.clients.get(exchange);
    return client ? client.getHealth() : null;
  }

  /**
   * Check if a specific exchange is connected
   */
  isExchangeConnected(exchange: 'binance' | 'coinbase' | 'kraken'): boolean {
    const client = this.clients.get(exchange);
    return client ? client.getStatus() === ConnectionStatus.CONNECTED : false;
  }

  /**
   * Get list of connected exchanges
   */
  getConnectedExchanges(): ('binance' | 'coinbase' | 'kraken')[] {
    const connected: ('binance' | 'coinbase' | 'kraken')[] = [];

    for (const [exchange, client] of this.clients) {
      if (client.getStatus() === ConnectionStatus.CONNECTED) {
        // eslint-disable-next-line functional/immutable-data
        connected.push(exchange);
      }
    }

    return connected;
  }

  /**
   * Get count of connected exchanges
   */
  getConnectedCount(): number {
    return this.getConnectedExchanges().length;
  }

  /**
   * Update symbols for all exchanges
   */
  updateSymbols(symbols: string[]): void {
    // eslint-disable-next-line functional/immutable-data
    this.config.symbols = symbols;

    for (const client of this.clients.values()) {
      client.updateSymbols(symbols);
    }
  }

  /**
   * Setup event listeners for a client
   */
  private setupClientListeners(
    client: ExchangeWebSocketClient,
    exchange: 'binance' | 'coinbase' | 'kraken'
  ): void {
    // Forward trade events
    client.on('trade', (trade: ExchangeTrade) => {
      this.emit('trade', trade);
    });

    // Handle connection events
    client.on('connected', () => {
      console.log(`✅ ${exchange.toUpperCase()} connected`);
      this.emit('exchangeConnected', exchange);
      this.emitStatusChange();

      // Check if all connected
      if (this.getConnectedCount() === this.config.exchanges.length) {
        this.emit('allConnected');
      }
    });

    client.on('disconnected', () => {
      console.log(`🔌 ${exchange.toUpperCase()} disconnected`);
      this.emit('exchangeDisconnected', exchange);
      this.emit('connectionLost', {
        exchange,
        remainingCount: this.getConnectedCount(),
      });
      this.emitStatusChange();
    });

    client.on('reconnecting', (data: { exchange: string; attempt: number }) => {
      console.log(`🔄 ${exchange.toUpperCase()} reconnecting (attempt ${data.attempt})`);
    });

    client.on('error', (data: { exchange: string; error: Error }) => {
      console.error(`❌ ${exchange.toUpperCase()} error:`, data.error.message);
    });

    // Handle health updates
    client.on('healthUpdate', (health: ConnectionHealth) => {
      // eslint-disable-next-line functional/immutable-data
      this.healthMetrics.set(exchange, health);
      this.emit('healthUpdate', this.healthMetrics);
    });
  }

  /**
   * Emit status change event
   */
  private emitStatusChange(): void {
    this.emit('statusChange', this.getStatus());
  }

  /**
   * Get configuration
   */
  getConfig(): MultiExchangeManagerConfig {
    return { ...this.config };
  }

  /**
   * Check if manager is initialized
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
