import { OHLCV, OrderParams, OrderResult } from 'titan-phase1-scavenger/dist/types/index.js';

export class MockBybitPerpsClient {
  private equity: number = 10000;
  private orders: OrderResult[] = [];

  // Simulation State
  private currentPrices: Map<string, number> = new Map();

  constructor(initialEquity: number = 10000) {
    this.equity = initialEquity;
  }

  async getEquity(): Promise<number> {
    return this.equity;
  }

  async getCurrentPrice(symbol: string): Promise<number> {
    return this.currentPrices.get(symbol) || 0;
  }

  async getOpenInterest(symbol: string): Promise<number> {
    return 1000000; // Mock stable OI
  }

  async placeOrder(params: OrderParams): Promise<OrderResult> {
    const order: OrderResult = {
      orderId: `mock-${Date.now()}-${Math.random()}`,
      symbol: params.symbol,
      side: params.side === 'Buy' ? 'Buy' : 'Sell',
      qty: params.qty,
      price: params.price || (await this.getCurrentPrice(params.symbol)),
      status: 'FILLED',
      timestamp: Date.now(),
    };

    this.orders.push(order);
    console.log(
      `[MockBybit] Order Placed: ${params.side} ${params.qty} ${params.symbol} @ ${order.price}`,
    );
    return order;
  }

  async get24hVolume(symbol: string): Promise<number> {
    return 50000000;
  }

  async getFundingRate(symbol: string): Promise<number> {
    return 0.0001;
  }

  async fetchOHLCV(symbol: string, interval: string, limit: number): Promise<OHLCV[]> {
    return []; // Should be injected or handled by data engine if needed
  }

  public close() {}

  // Helper to set price for simulation
  public setPrice(symbol: string, price: number) {
    this.currentPrices.set(symbol, price);
  }

  public getFilledOrders(): OrderResult[] {
    return this.orders;
  }
}
