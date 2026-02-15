/* eslint-disable functional/no-let, functional/immutable-data -- Startup entrypoint: NATS connection state requires let + mutations */
import React from 'react';
import { render } from 'ink';
import { Dashboard } from './dashboard/Dashboard.js';
import { SentinelConfig, SentinelCore } from './engine/SentinelCore.js';
import { IExchangeGateway } from './exchanges/interfaces.js';
import { TitanExecutionGateway } from './exchanges/TitanExecutionGateway.js';
import { MarketMonitor } from './polymarket/MarketMonitor.js';
import { HealthServer } from './server/HealthServer.js';
import { JSONCodec } from 'nats';

async function main() {
  // 1. Configuration
  const { getConfigManager, TITAN_SUBJECTS, getNatsClient, loadSecretsFromFiles, Logger } =
    await import('@titan/shared');

  loadSecretsFromFiles();
  getConfigManager();
  
  const logger = Logger.getInstance('titan-sentinel');

  const configManager = {
    get: (key: string) => process.env[key],
  };

  const config: SentinelConfig = {
    symbol: configManager.get('SYMBOL') || 'BTCUSDT',
    updateIntervalMs: Number(configManager.get('UPDATE_INTERVAL_MS')) || 1000,
    initialCapital: Number(configManager.get('INITIAL_CAPITAL')) || 10000,
    riskLimits: {
      maxDrawdown: Number(configManager.get('MAX_DRAWDOWN')) || 0.15,
      maxLeverage: Number(configManager.get('MAX_LEVERAGE')) || 3.0,
      maxDelta: Number(configManager.get('MAX_DELTA')) || 5000,
    },
  };

  // 2. Connect to NATS (Critical for Execution)
  let nats: any = null;
  let natsConnected = false;

  try {
    nats = getNatsClient();
    await nats.connect({
      servers: [process.env.NATS_URL || 'nats://localhost:4222'],
      user: process.env.NATS_USER,
      pass: process.env.NATS_PASS,
    });
    natsConnected = true;
    logger.info('✅ Connected to NATS (Execution & Regime)');
  } catch (err) {
    logger.error('❌ Failed to connect to NATS. Sentinel cannot function.', err instanceof Error ? err : new Error(String(err)));
    process.exit(1);
  }

  // 3. Initialize Gateways (Truth Layer via NATS)
  const hmacSecret = configManager.get('TITAN_HMAC_SECRET');
  if (!hmacSecret) {
      logger.error('❌ TITAN_HMAC_SECRET is required. Refusing to start with insecure fallback.');
      process.exit(1);
  }

  // Get the raw NatsConnection for components that need it (gateway, subscriptions)
  const rawNc = nats.getConnection();
  if (!rawNc) {
    logger.error('❌ NATS connection established but raw connection unavailable.');
    process.exit(1);
  }

  // Replace legacy gateways with TitanExecutionGateway
  const binanceGateway = new TitanExecutionGateway('binance', rawNc, hmacSecret);
  await binanceGateway.initialize();

  const bybitGateway = new TitanExecutionGateway('bybit', rawNc, hmacSecret);
  await bybitGateway.initialize();

  const gateways: IExchangeGateway[] = [binanceGateway, bybitGateway];

  // 4. Start Core
  const core = new SentinelCore(config, gateways);

  // 5. NATS Subscriptions (Regime & Budget)
  // Re-implementing subscriptions using async iterator pattern
  (async () => {
      try {
        const regimeSub = rawNc.subscribe(TITAN_SUBJECTS.EVT.BRAIN.REGIME);
        const jc = JSONCodec();
        for await (const m of regimeSub) {
            try {
                const data = jc.decode(m.data) as any;
                let payload = data;
                if (data && typeof data === 'object' && 'payload' in data && 'type' in data) {
                    payload = data.payload;
                }
                core.updateRegime(payload.regime, payload.alpha);
            } catch (e) { logger.error('Regime update error', e instanceof Error ? e : new Error(String(e))); }
        }
      } catch (err) { logger.error('Failed to subscribe to REGIME', err instanceof Error ? err : new Error(String(err))); }
  })();

  (async () => {
      try {
        const budgetSub = rawNc.subscribe(TITAN_SUBJECTS.EVT.BUDGET.UPDATE);
        const jc = JSONCodec();
        for await (const m of budgetSub) {
            try {
                const data = jc.decode(m.data) as any;
                let payload = data;
                if (data && typeof data === 'object' && 'payload' in data) {
                    payload = data.payload;
                }
                if (payload.phaseId === 'phase3' && payload.allocatedEquity) {
                    logger.info(`[Sentinel] Received Budget Update: $${payload.allocatedEquity}`);
                    core.updateBudget(payload.allocatedEquity);
                }
            } catch (e) { logger.error('Budget update error', e instanceof Error ? e : new Error(String(e))); }
        }
      } catch (err) { logger.error('Failed to subscribe to BUDGET', err instanceof Error ? err : new Error(String(err))); }
  })();

  // 3b. Start Market Monitor (Polymarket)
  const marketMonitor = new MarketMonitor();
  await marketMonitor.start();

  // 0. Start Health Check Server (Production Requirement)
  const port = Number(process.env.PORT) || 8084;
  const healthServer = new HealthServer({
    port,
    getStatus: () => {
      const isHealthy = natsConnected;
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        service: 'titan-sentinel',
        version: '1.0.0',
        uptime: process.uptime(),
        dependencies: {
          nats: natsConnected ? 'connected' : 'disconnected',
          binance: 'connected', // Via NATS
          bybit: 'connected', // Via NATS
        },
        metrics: {
          regime: core.getRegime(),
          budget: core.getBudget(),
        },
        timestamp: new Date().toISOString(),
      };
    },
    getDetailedStatus: () => {
      const regime = core.getRegime();
      const mode = regime === 'CRASH' ? 'DEFENSIVE' : regime === 'VOLATILE' ? 'CAUTIOUS' : 'NORMAL';
      return {
        mode: mode as any,
        reasons: [`Regime: ${regime}`],
        actions: ['Monitor Arbitrage Spreads'],
        unsafe_actions: [],
      };
    },
  });

  await healthServer.start();

  // 4. Start UI
  // Handle Shutdown
  const shutdown = async () => {
    logger.info('Shutting down Sentinel...');
    await healthServer.stop();
    await core.stop();
    await marketMonitor.stop();
    process.exit(0);
  };

  if (process.env.HEADLESS !== 'true') {
    const { unmount } = render(<Dashboard core={core} />);
    process.on('SIGINT', async () => {
      unmount();
      await shutdown();
    });
  } else {
    logger.info('Starting in Headless Mode');
    core.on('log', (msg) => logger.info(`[CORE] ${msg}`));
    core.on('error', (err) => logger.error(`[CORE ERROR]`, err instanceof Error ? err : new Error(String(err))));
    process.on('SIGINT', shutdown);
  }

  try {
    await core.start();
  } catch (e) {
    logger.error('Fatal Error starting core', e instanceof Error ? e : new Error(String(e)));
    process.exit(1);
  }
}

main().catch(console.error);
