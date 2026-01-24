import type { Order, OrderResult } from '../types/orders.js';
import type { IExchangeGateway } from './interfaces.js';

export class BybitGateway implements IExchangeGateway {
  private apiKey: string;
  private apiSecret: string;
  private isTestnet: boolean;

  public name = 'bybit_perp';

  constructor(apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isTestnet = isTestnet;
  }

  async initialize(): Promise<void> {
    // Connect to Bybit API
    return Promise.resolve();
  }

  async executeOrder(order: Order): Promise<OrderResult> {
    // Implement Bybit order execution stub
    return {
      orderId: 'bybit-stub-' + Date.now(),
      status: 'FILLED',
      filledSize: order.size,
      avgPrice: await this.getPrice(order.symbol),
      fees: 0,
      timestamp: Date.now(),
    };
  }

  async getPrice(_symbol: string): Promise<number> {
    return 50000; // Stub
  }

  async getTicker(_symbol: string): Promise<{ price: number; bid: number; ask: number }> {
    return {
      price: 50000,
      bid: 49995,
      ask: 50005,
    };
  }

  async getBalance(_asset: string): Promise<number> {
    return 10000; // Stub
  }
}
