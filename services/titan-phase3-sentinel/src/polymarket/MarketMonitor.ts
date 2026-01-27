import { Market, PolymarketClient } from './PolymarketClient.js';
import { ArbEngine, ArbSignal } from './ArbEngine.js';
import { SignalClient } from '@titan/shared';
// import { v4 as uuidv4 } from 'uuid';

export class MarketMonitor {
  private client: PolymarketClient;
  private engine: ArbEngine;
  private signalClient: SignalClient;
  private isRunning: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor(private intervalMs: number = 5000) {
    this.client = new PolymarketClient();
    this.engine = new ArbEngine();
    this.signalClient = new SignalClient({ source: 'sentinel' });
  }

  async start() {
    if (this.isRunning) return;
    // eslint-disable-next-line functional/immutable-data
    this.isRunning = true;
    console.log('Starting Market Monitor...');

    this.poll(); // Initial poll
    // eslint-disable-next-line functional/immutable-data
    this.pollingInterval = setInterval(() => this.poll(), this.intervalMs);
  }

  async stop() {
    // eslint-disable-next-line functional/immutable-data
    this.isRunning = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      // eslint-disable-next-line functional/immutable-data
      this.pollingInterval = null;
    }
    console.log('Market Monitor stopped.');
  }

  private async poll() {
    try {
      // 1. Fetch top active markets
      const markets = await this.client.getMarkets(20);

      // 2. Analyze each market for signals
      if (markets && markets.length > 0) {
        for (const market of markets) {
          const signals = this.engine.evaluate(market);
          if (signals.length > 0) {
            await this.processSignals(signals, market);
          }
        }
      }
    } catch (error) {
      console.error('Error in poll loop:', error);
    }
  }

  private async processSignals(signals: ArbSignal[], market: Market) {
    // Connect Signal Client if needed
    if (!this.signalClient.isConnected()) {
      await this.signalClient.connect();
    }

    for (const signal of signals) {
      console.log(`[SIGNAL] ${signal.type} on ${market.slug} (${signal.outcomeId})`);

      // Dispatch to Titan Brain via SignalClient
      // signal_id generation can be handled here or in client
      const signalId = `sentinel-poly-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const prepareResp = await this.signalClient.sendPrepare({
        signal_id: signalId,
        source: 'sentinel',
        symbol: 'POLYMARKET', // Sentinel logic should resolve this or pass metadata
        direction: 'LONG',
        type: 'BUY_SETUP' as any, // Temporary cast until shared types updated
        entry_zone: { min: signal.price, max: signal.price * 1.05 },
        stop_loss: 0,
        take_profits: [],
        position_size: 0,
        leverage: 1,
        confidence: signal.confidence,
        timestamp: Date.now(),
        metadata: {
          market_id: market.id,
          outcome_id: signal.outcomeId,
          market_slug: market.slug,
        },
      });

      if (prepareResp.prepared) {
        const confirmResp = await this.signalClient.sendConfirm(signalId);
        if (confirmResp.executed) {
          console.log('  > Dispatched to Titan Brain (SignalClient) ✓');
        } else {
          console.log('  > Brain Rejected ✗: ' + confirmResp.reason);
        }
      } else {
        console.log('  > Prepare FAILED ✗: ' + prepareResp.reason);
      }
    }
  }
}
