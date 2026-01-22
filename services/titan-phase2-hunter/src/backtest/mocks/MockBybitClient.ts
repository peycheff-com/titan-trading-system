import { BybitPerpsClient } from '../../exchanges/BybitPerpsClient';
import { OHLCV, OrderParams, OrderResult, OrderStatus } from '../../types';

export class MockBybitClient extends BybitPerpsClient {
  private mockOHLCV: Map<string, OHLCV[]> = new Map();
  private mockPrice: Map<string, number> = new Map();
  private mockOrders: Map<string, OrderResult> = new Map();
  private shouldFail: boolean = false;
  private simulatedTime: number = Date.now();

  constructor() {
    super('mock-key', 'mock-secret');
  }

  public setSimulatedTime(time: number) {
    // eslint-disable-next-line functional/immutable-data
    this.simulatedTime = time;
  }

  public setMockOHLCV(symbol: string, data: OHLCV[]) {
    // eslint-disable-next-line functional/immutable-data
    this.mockOHLCV.set(symbol, data);
  }

  public setMockPrice(symbol: string, price: number) {
    // eslint-disable-next-line functional/immutable-data
    this.mockPrice.set(symbol, price);
  }

  public setShouldFail(fail: boolean) {
    // eslint-disable-next-line functional/immutable-data
    this.shouldFail = fail;
  }

  public async initialize(): Promise<void> {
    console.log('✅ Mock Bybit Client initialized');
  }

  public async fetchOHLCV(symbol: string, interval: string, limit: number = 200): Promise<OHLCV[]> {
    if (this.shouldFail) throw new Error('Mock API Failure');

    // Return mock data if available
    const data = this.mockOHLCV.get(symbol);
    if (data) {
      // Filter data relevant to simulated time
      const validData = data.filter(c => c.timestamp <= this.simulatedTime);
      return validData.slice(-limit); // Emulate limit
    }

    // Generate synthesized data if no mock data provided
    return this.generateMockCandles(limit);
  }

  public async getCurrentPrice(symbol: string): Promise<number> {
    if (this.shouldFail) throw new Error('Mock API Failure');
    return this.mockPrice.get(symbol) || 50000;
  }

  public async placeOrder(params: OrderParams): Promise<OrderResult> {
    if (this.shouldFail) throw new Error('Mock Order Failure');

    const orderId = `mock-${this.simulatedTime}-${Math.random().toString(36).substr(2, 5)}`;
    const result: OrderResult = {
      orderId,
      symbol: params.symbol,
      side: params.side,
      qty: params.qty,
      price: params.price || (await this.getCurrentPrice(params.symbol)),
      status: 'FILLED', // Auto-fill for backtest simplicity unless configured otherwise
      timestamp: this.simulatedTime,
    };

    // eslint-disable-next-line functional/immutable-data
    this.mockOrders.set(orderId, result);
    return result;
  }

  public async getOrderStatus(orderId: string, symbol: string): Promise<OrderStatus> {
    const order = this.mockOrders.get(orderId);
    if (!order) throw new Error('Order not found');
    return order.status;
  }

  private generateMockCandles(limit: number): OHLCV[] {
    const candles: OHLCV[] = [];
    // eslint-disable-next-line functional/no-let
    let price = 50000;
    const now = this.simulatedTime;

    // eslint-disable-next-line functional/no-let
    for (let i = limit; i > 0; i--) {
      const open = price;
      const change = (Math.random() - 0.5) * 100;
      const close = open + change;
      const high = Math.max(open, close) + Math.random() * 50;
      const low = Math.min(open, close) - Math.random() * 50;

      // eslint-disable-next-line functional/immutable-data
      candles.push({
        timestamp: now - i * 15 * 60 * 1000,
        open,
        high,
        low,
        close,
        volume: Math.random() * 1000,
      });

      price = close;
    }

    return candles;
  }
}
