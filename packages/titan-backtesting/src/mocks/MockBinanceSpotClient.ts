import { Trade } from 'titan-phase1-scavenger/dist/exchanges/BinanceSpotClient.js';
import { EventEmitter } from 'events';
import { Logger } from '@titan/shared';

const logger = Logger.getInstance('backtesting');

// Mock interface matching the real client's public surface
export class MockBinanceSpotClient {
  private callbacks: Map<string, (trades: Trade[]) => void> = new Map();
  public eventEmitter = new EventEmitter();

  constructor() {}

  async subscribeAggTrades(symbols: string[]): Promise<void> {
    logger.debug(`MockBinance subscribed to ${symbols.join(', ')}`);
  }

  onTrade(symbol: string, callback: (trades: Trade[]) => void): void {
    // eslint-disable-next-line functional/immutable-data
    this.callbacks.set(symbol, callback);
  }

  offTrade(symbol: string): void {
    // eslint-disable-next-line functional/immutable-data
    this.callbacks.delete(symbol);
  }

  async getSpotPrice(_symbol: string): Promise<number> {
    // This should be driven by the simulation clock/data
    // For now, return a dummy or cached value if set
    return 0;
  }

  close(): void {
    // eslint-disable-next-line functional/immutable-data
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
