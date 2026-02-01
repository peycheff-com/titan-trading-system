/**
 * Canonical Power Law Service
 *
 * Single source of truth for heavy-tail risk metrics.
 * Publishes to titan.signal.powerlaw.metrics.v1.{venue}.{symbol}
 *
 * NOTE: This is a stateful service class with mutable internal state
 * (Map, intervals, connections). Immutability rules are disabled.
 */

/* eslint-disable functional/immutable-data, functional/no-let */

import { connect, JetStreamClient, NatsConnection, StringCodec } from 'nats';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

import { type HealthStatus, POWER_LAW_SUBJECTS, type PowerLawMetricsV1 } from '@titan/shared';
import { HillEstimator, POTEstimator, VolatilityClusterDetector } from './estimators/index.js';
import { HealthTracker } from './health/index.js';
import { loadConfig, type ServiceConfig } from './config/index.js';

interface SymbolState {
  history: number[];
  lastUpdate: number;
  lastMetrics: PowerLawMetricsV1 | null;
}

export class CanonicalPowerLawService {
  private nats: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private sc = StringCodec();

  private readonly config: ServiceConfig;
  private readonly hill = new HillEstimator();
  private readonly pot = new POTEstimator();
  private readonly volCluster = new VolatilityClusterDetector();
  private readonly healthTracker = new HealthTracker();

  private readonly symbolStates = new Map<string, SymbolState>();
  private readonly codeHash: string;
  private configHash: string;

  private publishInterval: NodeJS.Timeout | null = null;
  private saveInterval: NodeJS.Timeout | null = null;

  private readonly DATA_DIR = '/data';
  private readonly STATE_FILE = 'canonical_powerlaw_state.json';

  constructor(config?: Partial<ServiceConfig>) {
    this.config = { ...loadConfig(), ...config };
    this.codeHash = this.computeCodeHash();
    this.configHash = this.computeConfigHash();
  }

  async start(): Promise<void> {
    console.log('[CanonicalPowerLaw] Starting service...');

    // Load persisted state
    await this.loadState();

    // Connect to NATS
    await this.connectNats();

    // Subscribe to market data
    await this.subscribeMarketData();

    // Start periodic publishing
    this.publishInterval = setInterval(
      () => this.publishAllMetrics(),
      this.config.updateIntervalMs,
    );

    // Start periodic state persistence
    this.saveInterval = setInterval(() => this.saveState(), 60000);

    // Graceful shutdown handlers
    const exitHandler = async () => {
      await this.stop();
      process.exit(0);
    };
    process.on('SIGINT', exitHandler);
    process.on('SIGTERM', exitHandler);

    console.log('[CanonicalPowerLaw] Service started successfully');
  }

  async stop(): Promise<void> {
    if (this.publishInterval) {
      clearInterval(this.publishInterval);
      this.publishInterval = null;
    }
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }

    await this.saveState();

    if (this.nats) {
      await this.nats.drain();
      await this.nats.close();
    }

    console.log('[CanonicalPowerLaw] Service stopped cleanly');
  }

  /**
   * Process incoming tick and update symbol history
   */
  async onTick(symbol: string, price: number, _venue: string = 'binance'): Promise<void> {
    let state = this.symbolStates.get(symbol);
    if (!state) {
      state = { history: [], lastUpdate: 0, lastMetrics: null };
      this.symbolStates.set(symbol, state);
    }

    state.history.push(price);
    if (state.history.length > this.config.maxHistoryLength) {
      state.history.shift();
    }
  }

  /**
   * Compute and publish metrics for a single symbol
   */
  async computeAndPublish(
    symbol: string,
    venue: string = 'binance',
  ): Promise<PowerLawMetricsV1 | null> {
    const state = this.symbolStates.get(symbol);
    if (!state || state.history.length < this.config.minSampleSize) {
      return null;
    }

    const metrics = this.computeMetrics(symbol, state, venue);
    await this.publishMetrics(metrics, venue);

    state.lastMetrics = metrics;
    state.lastUpdate = Date.now();

    return metrics;
  }

  /**
   * Compute canonical metrics for a symbol
   */
  private computeMetrics(symbol: string, state: SymbolState, venue: string): PowerLawMetricsV1 {
    const history = state.history;

    // Calculate returns
    const returns: number[] = [];
    for (let i = 1; i < history.length; i++) {
      returns.push(Math.log(history[i] / history[i - 1]));
    }

    // Hill Estimation
    const hillEst = this.hill.estimate(returns);

    // POT Estimation
    const threshold = this.pot.autoThreshold(returns, this.config.potThresholdMultiplier);
    const potEst = this.pot.estimate(returns, threshold);

    // Volatility Clustering
    const volState = this.volCluster.getState(returns);

    // Determine health status
    const healthStatus = this.healthTracker.determineStatus({
      sampleSize: returns.length,
      minSampleSize: this.config.minSampleSize,
      fitQuality: potEst.fitQuality,
      minFitQuality: this.config.minFitQuality,
      lastUpdateMs: state.lastUpdate || Date.now(),
      maxStalenessMs: this.config.staleThresholdMs,
    });

    // Build data fingerprint
    const dataFingerprint = this.computeDataFingerprint(returns);

    const now = Date.now();
    const windowStart =
      state.lastUpdate > 0 ? state.lastUpdate - this.config.updateIntervalMs : now - 3600000;

    const metrics: PowerLawMetricsV1 = {
      schema_version: '1',

      // Identity
      venue,
      symbol,
      tf: '1m', // Default timeframe

      // Observation Window
      window: {
        start_ts: windowStart,
        end_ts: now,
        n: returns.length,
      },

      // Model Info
      model: {
        model_id: 'hill-v1.0.0',
        params: {
          k_optimal: hillEst.kOptimal,
          pot_threshold: threshold,
        },
      },

      // Tail Estimation
      tail: {
        alpha: hillEst.alpha > 0 ? hillEst.alpha : null,
        ci_low: hillEst.ciLower > 0 ? hillEst.ciLower : null,
        ci_high: hillEst.ciUpper > 0 ? hillEst.ciUpper : null,
        confidence: hillEst.confidence,
        method:
          hillEst.alpha > 0 && potEst.fitQuality > 0
            ? 'hill+pot'
            : hillEst.alpha > 0
              ? 'hill'
              : 'pot',
        k: hillEst.kOptimal > 0 ? hillEst.kOptimal : null,
        u: threshold > 0 ? threshold : null,
      },

      // Exceedance Probability (POT)
      exceedance: {
        prob: potEst.exceedanceProbability > 0 ? potEst.exceedanceProbability : null,
      },

      // Volatility Clustering
      vol_cluster: {
        state: volState.state,
        persistence: volState.persistence,
        sigma: volState.sigma > 0 ? volState.sigma : null,
      },

      // Health Status
      health: {
        status: healthStatus,
        reason: this.getHealthReason(healthStatus, returns.length),
      },

      // Provenance
      provenance: {
        code_hash: this.codeHash,
        config_hash: this.configHash,
        data_fingerprint: dataFingerprint,
        calc_ts: now,
        trace_id: `cpl-${now}-${symbol}`,
      },
    };

    return metrics;
  }

  /**
   * Get human-readable health reason
   */
  private getHealthReason(status: HealthStatus, sampleSize: number): string {
    switch (status) {
      case 'ok':
        return `Healthy: ${sampleSize} samples`;
      case 'low_sample':
        return `Low sample size: ${sampleSize} < ${this.config.minSampleSize}`;
      case 'stale':
        return 'Data is stale';
      case 'fit_failed':
        return 'Model fit failed quality check';
      case 'unknown':
      default:
        return 'Status unknown';
    }
  }

  /**
   * Publish metrics to NATS
   */
  private async publishMetrics(metrics: PowerLawMetricsV1, venue: string): Promise<void> {
    if (!this.nats) return;

    // Publish to canonical subject
    const subject = POWER_LAW_SUBJECTS.metricsV1(venue, metrics.symbol);
    this.nats.publish(subject, this.sc.encode(JSON.stringify(metrics)));

    console.log(
      `[CanonicalPowerLaw] Published ${metrics.symbol}: α=${
        metrics.tail.alpha?.toFixed(2) ?? 'null'
      }, health=${metrics.health.status}`,
    );
  }

  /**
   * Publish metrics for all tracked symbols
   */
  private async publishAllMetrics(): Promise<void> {
    for (const [symbol] of this.symbolStates) {
      try {
        await this.computeAndPublish(symbol);
      } catch (err) {
        console.error(`[CanonicalPowerLaw] Error publishing ${symbol}:`, err);
      }
    }
  }

  /**
   * Get current metrics (for HTTP API)
   */
  getMetrics(symbol: string): PowerLawMetricsV1 | null {
    const state = this.symbolStates.get(symbol);
    return state?.lastMetrics ?? null;
  }

  /**
   * Get all tracked symbols
   */
  getSymbols(): string[] {
    return Array.from(this.symbolStates.keys());
  }

  /**
   * Get service health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    symbols: number;
    message: string;
  } {
    const symbols = this.symbolStates.size;
    if (!this.nats) {
      return {
        status: 'unhealthy',
        symbols,
        message: 'NATS not connected',
      };
    }
    if (symbols === 0) {
      return {
        status: 'degraded',
        symbols,
        message: 'No symbols tracked',
      };
    }
    return { status: 'healthy', symbols, message: 'OK' };
  }

  // --- Private Methods ---

  private async connectNats(): Promise<void> {
    this.nats = await connect({
      servers: this.config.natsUrl,
      user: this.config.natsUser,
      pass: this.config.natsPass,
      name: 'canonical-powerlaw-service',
    });

    this.js = this.nats.jetstream();
    console.log(`[CanonicalPowerLaw] Connected to NATS at ${this.nats.getServer()}`);
  }

  private async subscribeMarketData(): Promise<void> {
    if (!this.nats) return;

    const subject = 'titan.data.market.ticker.>';
    const sub = this.nats.subscribe(subject);
    console.log(`[CanonicalPowerLaw] Subscribed to ${subject}`);

    (async () => {
      for await (const m of sub) {
        try {
          const parts = m.subject.split('.');
          // titan.data.market.ticker.{venue}.{symbol}
          const venue = parts[4] || 'binance';
          const symbol = parts[5];
          if (!symbol) continue;

          const data = JSON.parse(this.sc.decode(m.data));
          const price = data.price || data.c || data.last;

          if (price) {
            await this.onTick(symbol, Number(price), venue);
          }
        } catch {
          // Ignore parse errors
        }
      }
    })();
  }

  private computeCodeHash(): string {
    // In production, this would hash the actual source code
    // For now, use package version
    return createHash('sha256')
      .update('canonical-powerlaw-service:1.0.0')
      .digest('hex')
      .slice(0, 16);
  }

  private computeConfigHash(): string {
    const configStr = JSON.stringify(this.config);
    return createHash('sha256').update(configStr).digest('hex').slice(0, 16);
  }

  private computeDataFingerprint(returns: number[]): string {
    // Simple fingerprint: hash of last N returns
    const recent = returns.slice(-50);
    const str = recent.map((r) => r.toFixed(8)).join(',');
    return createHash('sha256').update(str).digest('hex').slice(0, 16);
  }

  private async saveState(): Promise<void> {
    try {
      const data: Record<string, number[]> = {};
      for (const [symbol, state] of this.symbolStates) {
        data[symbol] = state.history;
      }

      await fs.mkdir(this.DATA_DIR, { recursive: true });
      const filePath = path.join(this.DATA_DIR, this.STATE_FILE);
      await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');

      console.log(`[CanonicalPowerLaw] State saved (${this.symbolStates.size} symbols)`);
    } catch (err) {
      console.error('[CanonicalPowerLaw] Failed to save state:', err);
    }
  }

  private async loadState(): Promise<void> {
    try {
      const filePath = path.join(this.DATA_DIR, this.STATE_FILE);

      try {
        await fs.access(filePath);
      } catch {
        console.log('[CanonicalPowerLaw] No existing state file found');
        return;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, number[]>;

      let loaded = 0;
      for (const [symbol, history] of Object.entries(data)) {
        if (Array.isArray(history)) {
          this.symbolStates.set(symbol, {
            history,
            lastUpdate: 0,
            lastMetrics: null,
          });
          loaded++;
        }
      }

      console.log(`[CanonicalPowerLaw] State loaded (${loaded} symbols)`);
    } catch (err) {
      console.error('[CanonicalPowerLaw] Failed to load state:', err);
    }
  }
}
