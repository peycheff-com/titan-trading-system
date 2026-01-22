/**
 * FastPathOrderExecutor - IPC-based Order Executor for Sentinel
 *
 * Implements IOrderExecutor interface using FastPathClient for
 * sub-millisecond order execution via Unix Domain Socket IPC.
 */

import type { Order, OrderResult } from '../types/orders.js';
import type { IOrderExecutor } from './interfaces.js';
import { FastPathClient, type IntentSignal } from '@titan/shared';

/**
 * FastPathOrderExecutor Configuration
 */
export interface FastPathExecutorConfig {
  socketPath?: string;
  hmacSecret?: string;
}

/**
 * Order executor that routes orders through FastPathClient IPC
 */
export class FastPathOrderExecutor implements IOrderExecutor {
  private client: FastPathClient;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly PRICE_CACHE_TTL = 1000; // 1 second

  constructor(config?: FastPathExecutorConfig) {
    this.client = new FastPathClient({
      source: 'sentinel',
      socketPath: config?.socketPath || process.env.TITAN_IPC_SOCKET || '/tmp/titan-ipc.sock',
      hmacSecret: config?.hmacSecret || process.env.TITAN_HMAC_SECRET || 'titan-hmac-secret',
    });

    // CRITICAL: Handle error events to prevent Node.js crash
    // The EventEmitter 'error' event will crash the process if unhandled
    this.client.on('error', (error: Error) => {
      console.warn(`⚠️ [Sentinel FastPath] IPC error (non-fatal): ${error.message}`);
      // IPC is optional in cloud deployments - service continues without it
    });

    this.client.on('maxReconnectAttemptsReached', () => {
      console.warn('⚠️ [Sentinel FastPath] Max reconnect attempts reached - IPC disabled');
    });
  }

  /**
   * Connect to the execution engine
   */
  async connect(): Promise<void> {
    await this.client.connect();
  }

  /**
   * Disconnect from the execution engine
   */
  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.client.isConnected();
  }

  /**
   * Execute a single order via IPC
   */
  async executeOrder(order: Order): Promise<OrderResult> {
    if (!this.client.isConnected()) {
      return {
        orderId: '',
        status: 'FAILED',
        filledSize: 0,
        avgPrice: 0,
        fees: 0,
        timestamp: Date.now(),
      };
    }

    const signalId = `sentinel-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Convert Order to IntentSignal
    const intentSignal: IntentSignal = {
      signal_id: signalId,
      source: 'sentinel',
      symbol: order.symbol,
      direction: order.side === 'BUY' ? 'LONG' : 'SHORT',
      entry_zone: {
        min: order.price ? order.price * 0.999 : 0,
        max: order.price ? order.price * 1.001 : 0,
      },
      stop_loss: 0, // Sentinel handles its own risk
      take_profits: [],
      confidence: 0.9, // Basis trades are high confidence
      leverage: 1, // Sentinel uses no leverage (spot + perp hedge)
      timestamp: Date.now(),
    };

    try {
      // PREPARE phase
      const prepareResult = await this.client.sendPrepare(intentSignal);

      if (!prepareResult.prepared) {
        return {
          orderId: signalId,
          status: 'FAILED',
          filledSize: 0,
          avgPrice: 0,
          fees: 0,
          timestamp: Date.now(),
        };
      }

      // CONFIRM phase
      const confirmResult = await this.client.sendConfirm(signalId);

      if (confirmResult.executed) {
        return {
          orderId: signalId,
          status: 'FILLED',
          filledSize: order.size,
          avgPrice: confirmResult.fill_price || order.price || 0,
          fees: 0, // Would come from execution engine
          timestamp: Date.now(),
        };
      } else {
        return {
          orderId: signalId,
          status: 'FAILED',
          filledSize: 0,
          avgPrice: 0,
          fees: 0,
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      // ABORT on error
      try {
        await this.client.sendAbort(signalId);
      } catch {
        // Ignore abort errors
      }

      return {
        orderId: signalId,
        status: 'FAILED',
        filledSize: 0,
        avgPrice: 0,
        fees: 0,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get current market price (from cache or estimate)
   */
  async getPrice(symbol: string): Promise<number> {
    const cached = this.priceCache.get(symbol);
    if (cached && Date.now() - cached.timestamp < this.PRICE_CACHE_TTL) {
      return cached.price;
    }

    // In production, this would query the execution engine or market data service
    // For now, return 0 to indicate price should be fetched from exchange
    return 0;
  }

  /**
   * Update price cache (called from external market data)
   */
  updatePriceCache(symbol: string, price: number): void {
    // eslint-disable-next-line functional/immutable-data
    this.priceCache.set(symbol, { price, timestamp: Date.now() });
  }

  /**
   * Get IPC client status
   */
  getStatus() {
    return this.client.getStatus();
  }

  /**
   * Get IPC metrics
   */
  getMetrics() {
    return this.client.getMetrics();
  }
}
