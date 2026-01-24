import { Trade } from 'titan-phase1-scavenger/dist/exchanges/BinanceSpotClient.js';
import { EventEmitter } from 'events';

// Mock interface matching the real client's public surface
export class MockBinanceSpotClient {
  private callbacks: Map<string, (trades: Trade[]) => void> = new Map();
  public eventEmitter = new EventEmitter();

  constructor() {}

  async subscribeAggTrades(symbols: string[]): Promise<void> {
    console.log(`[MockBinance] Subscribed to ${symbols.join(', ')}`);
  }

  onTrade(symbol: string, callback: (trades: Trade[]) => void): void {
    this.callbacks.set(symbol, callback);
  }

  offTrade(symbol: string): void {
    this.callbacks.delete(symbol);
  }

  async getSpotPrice(symbol: string): Promise<number> {
    // This should be driven by the simulation clock/data
    // For now, return a dummy or cached value if set
    return 0;
  }

  close(): void {
    this.callbacks.clear();
  }

  // Helper to inject data during simulation
  public pushTrade(symbol: string, trade: Trade) {
    const callback = this.callbacks.get(symbol);
    if (callback) {
      callback([trade]);
    }
  }
}
