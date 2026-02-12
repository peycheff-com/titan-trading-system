import { Signal } from '../types/index.js';
import { Logger } from '@titan/shared';

const logger = Logger.getInstance('backtesting');

export class MockSignalClient {
  constructor() {}

  public async connect(): Promise<void> {
    // No-op
  }

  public async close(): Promise<void> {
    // No-op
  }

  public sendSignal(signal: Signal): void {
    logger.debug('MockSignalClient signal sent', undefined, {
      symbol: signal.symbol,
      action: signal.action,
    });
  }

  public async forceReconnect(): Promise<void> {
    // No-op
  }

  public getStatus(): Record<string, unknown> {
    return { connected: false, mock: true };
  }
}
