/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
import { connect, JetStreamClient, NatsConnection, StringCodec } from 'nats';
import { HillEstimator } from './tail-estimators.js';
import { POTEstimator } from './tail-estimators.js';
import { VolatilityClusterDetector } from './volatility-cluster.js';
import { TitanSubject } from '@titan/shared';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface PowerLawMetrics {
  symbol: string;
  tailExponent: number; // Hill alpha
  tailConfidence: number;
  exceedanceProbability: number; // POT
  volatilityCluster: {
    state: string;
    persistence: number;
    sigma: number;
  };
  timestamp: number;
}

export class PowerLawEstimator {
  private nats: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private histories = new Map<string, number[]>(); // Rolling close prices
  private sc = StringCodec();

  private hill = new HillEstimator();
  private pot = new POTEstimator();
  private volCluster = new VolatilityClusterDetector();

  // Persistence
  private readonly DATA_DIR = '/data';
  private readonly STATE_FILE = 'powerlaw_state.json';
  private saveInterval: NodeJS.Timeout | null = null;

  constructor(private natsUrl: string = 'nats://localhost:4222') {}

  async connect() {
    try {
      await this.loadState();

      this.nats = await connect({
        servers: this.natsUrl,
        user: process.env.NATS_USER,
        pass: process.env.NATS_PASS,
      });

      this.js = this.nats.jetstream();
      console.log(`Connected to NATS at ${this.natsUrl}`);

      // Start periodic persistence (every 60s)

      this.saveInterval = setInterval(() => this.saveState(), 60000);

      // Handle process termination to save state
      const exitHandler = async () => {
        await this.stop();
        process.exit(0);
      };
      process.on('SIGINT', exitHandler);
      process.on('SIGTERM', exitHandler);
    } catch (error) {
      console.error('Failed to connect to NATS:', error);
      throw error;
    }
  }

  async stop() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);

      this.saveInterval = null;
    }
    await this.saveState();
    if (this.nats) {
      await this.nats.drain();
      await this.nats.close();
    }
    console.log('PowerLawEstimator stopped cleanly.');
  }

  /**
   * Process a new trade/ticket to update rolling statistics
   */
  async onTick(venue: string, symbol: string, price: number) {
    const key = `${venue}:${symbol}`;
    this.updateHistory(key, price);

    const history = this.histories.get(key);
    if (!history || history.length < 100) return; // Warmup

    // Calculate returns: r_t = ln(p_t / p_{t-1})
    const returns = history.slice(1).map((price, i) => Math.log(price / history[i]));

    if (returns.length < 50) return;

    // Compute Metrics
    const tailEst = this.hill.estimate(returns);
    // Typical crypto "crash" threshold is daily vol, approx 3-4%?
    // Let's use 2.5 standard deviations as the threshold for POT
    const sigma = this.calculateSigma(returns);
    const potThreshold = sigma * 2.5;

    const exceedProb = this.pot.exceedanceProbability(returns, potThreshold);
    const volState = this.volCluster.getState(returns);

    const metrics: PowerLawMetrics = {
      symbol,
      tailExponent: tailEst.alpha,
      tailConfidence: tailEst.confidence,
      exceedanceProbability: exceedProb,
      volatilityCluster: volState,
      timestamp: Date.now(),
    };

    await this.publish(venue, symbol, metrics);
  }

  private updateHistory(key: string, price: number) {
    const existing = this.histories.get(key) || [];
    const updated = [...existing, price].slice(-1000); // Keep last 1000 points
    this.histories.set(key, updated);
  }

  private calculateSigma(returns: number[]): number {
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  private async publish(venue: string, symbol: string, metrics: PowerLawMetrics) {
    if (!this.nats) return;

    // Broadcast to Canonical Data Channel
    // Subject: titan.data.powerlaw.metrics.v1.{venue}.{symbol}
    const subject = `${TitanSubject.SIGNAL_POWERLAW_METRICS}.${venue}.${symbol}`;
    this.nats.publish(subject, this.sc.encode(JSON.stringify(metrics)));

    // Broadcast to Global Regime Channel (Legacy/Backup)
    this.nats.publish(TitanSubject.EVT_REGIME_UPDATE, this.sc.encode(JSON.stringify(metrics)));
  }

  // --- Persistence Methods ---

  private async saveState() {
    try {
      const data = Object.fromEntries(this.histories.entries());
      const filePath = path.join(this.DATA_DIR, this.STATE_FILE);

      // Ensure directory exists (recursive: true)
      await fs.mkdir(this.DATA_DIR, { recursive: true });

      await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
      console.log(`[PowerLaw] State saved to ${filePath} (${this.histories.size} symbols)`);
    } catch (error) {
      console.error('[PowerLaw] Failed to save state:', error);
    }
  }

  private async loadState() {
    try {
      const filePath = path.join(this.DATA_DIR, this.STATE_FILE);
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        console.log('[PowerLaw] No existing state file found. Starting fresh.');
        return;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, number[]>;

      const validEntries = Object.entries(data).filter(([, history]) => Array.isArray(history));
      this.histories = new Map(validEntries);
      const loadedSymbols = validEntries.length;
      console.log(`[PowerLaw] State loaded from ${filePath} (${loadedSymbols} symbols)`);
    } catch (error) {
      console.error('[PowerLaw] Failed to load state:', error);
    }
  }
}
