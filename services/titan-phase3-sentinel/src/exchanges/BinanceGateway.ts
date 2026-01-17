import type { Order, OrderResult } from '../types/orders.js';
import type { IExchangeGateway } from './interfaces.js';

export class BinanceGateway implements IExchangeGateway {
  private apiKey: string;
  private apiSecret: string;
  private isTestnet: boolean;

  public name = 'binance_spot';

  constructor(apiKey: string, apiSecret: string, isTestnet: boolean = false) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.isTestnet = isTestnet;
  }

  async initialize(): Promise<void> {
    // Connect to Binance API
    // Verify credentials
    return Promise.resolve();
  }

  async executeOrder(order: Order): Promise<OrderResult> {
    // Implement Binance order execution
    // Stub for now
    return {
      orderId: 'binance-stub-' + Date.now(),
      status: 'FILLED',
      filledSize: order.size,
      avgPrice: await this.getPrice(order.symbol),
      fees: 0,
      timestamp: Date.now(),
    };
  }

  async getPrice(symbol: string): Promise<number> {
    // Implement price fetch
    return 50000; // Stub
  }

  async getTicker(symbol: string): Promise<{ price: number; bid: number; ask: number }> {
    return {
      price: 50000,
      bid: 49995,
      ask: 50005,
    };
  }

  async getBalance(asset: string): Promise<number> {
    // Implement balance fetch
    return 10000; // Stub
  }
}
