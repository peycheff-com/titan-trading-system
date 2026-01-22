import React from 'react';
import { render } from 'ink';
import { Dashboard } from './dashboard/Dashboard.js';
import { SentinelConfig, SentinelCore } from './engine/SentinelCore.js';
import { IExchangeGateway } from './exchanges/interfaces.js';
import { BinanceGateway } from './exchanges/BinanceGateway.js';
import { BybitGateway } from './exchanges/BybitGateway.js';
import { MarketMonitor } from './polymarket/MarketMonitor.js';
import { HealthServer } from './server/HealthServer.js';

// ... imports

async function main() {
  // 1. Configuration
  // Dynamic import if needed or use standard import if build allows.
  // Assuming @titan/shared is available as per checking NatsClient
  const { getConfigManager, TitanSubject, getNatsClient, loadSecretsFromFiles } =
    await import('@titan/shared');

  // Initialize shared manager to load environment variables/files
  loadSecretsFromFiles();
  getConfigManager();

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

  // 2. Initialize Gateways
  const binanceKey = configManager.get('BINANCE_API_KEY');
  const binanceSecret = configManager.get('BINANCE_API_SECRET');
  const bybitKey = configManager.get('BYBIT_API_KEY');
  const bybitSecret = configManager.get('BYBIT_API_SECRET');

  if (!binanceKey || !binanceSecret) {
    console.warn('⚠️ Missing BINANCE_API_KEY or BINANCE_API_SECRET. Gateway may fail.');
  }

  // We can check connection status if gateways expose it. Assuming they do or we track it.
  const binanceGateway = new BinanceGateway(binanceKey || '', binanceSecret || '');
  const bybitGateway = new BybitGateway(bybitKey || '', bybitSecret || '');

  const gateways: IExchangeGateway[] = [binanceGateway, bybitGateway];

  // 3. Start Core
  const core = new SentinelCore(config, gateways);

  // 3a. Start NATS Subscription (Regime & Budget Awareness)
  // eslint-disable-next-line functional/no-let
  let natsConnected = false;
  // eslint-disable-next-line functional/no-let
  let nats: any = null;

  try {
    nats = await getNatsClient();
    natsConnected = true;
    console.log('Connected to NATS for Regime & Budget Updates');

    const sub = nats.subscribe(TitanSubject.REGIME_UPDATE, (data: any) => {
      // Dual Read Strategy
      // eslint-disable-next-line functional/no-let
      let payload = data;
      if (data && typeof data === 'object' && 'payload' in data && 'type' in data) {
        payload = data.payload;
      }

      try {
        core.updateRegime(payload.regime, payload.alpha);
      } catch (err) {
        console.error('Error processing regime update:', err);
      }
    });

    // Subscribe to Budget Updates (Truth Layer)
    nats.subscribe('titan.ai.budget.update', (data: any) => {
      // eslint-disable-next-line functional/no-let
      let payload = data;
      if (data && typeof data === 'object' && 'payload' in data) {
        payload = data.payload;
      }

      if (payload.phaseId === 'phase3' && payload.allocatedEquity) {
        console.log(`[Sentinel] Received Budget Update: $${payload.allocatedEquity}`);
        core.updateBudget(payload.allocatedEquity);
      }
    });
  } catch (err) {
    console.warn('⚠️ Failed to connect to NATS. Sentinel will run in STABLE usage.', err);
  }

  // 3b. Start Market Monitor (Polymarket)
  const marketMonitor = new MarketMonitor();
  await marketMonitor.start();

  // 0. Start Health Check Server (Production Requirement)
  // MOVED AFTER CORE INIT to access core state
  const port = Number(process.env.PORT) || 8084;
  const healthServer = new HealthServer({
    port,
    getStatus: () => {
      const isHealthy = natsConnected; // && gateways connected?
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        service: 'titan-sentinel',
        version: '1.0.0',
        uptime: process.uptime(),
        dependencies: {
          nats: natsConnected ? 'connected' : 'disconnected',
          binance: 'connected', // TODO: Expose from gateway
          bybit: 'connected', // TODO: Expose from gateway
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
  // ... (rest of UI logic)

  // Handle Shutdown
  const shutdown = async () => {
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
    console.log('Starting in Headless Mode');
    core.on('log', (msg) => console.log(`[LOG] ${msg}`));
    core.on('error', (err) => console.error(`[ERROR] ${err}`));
    process.on('SIGINT', shutdown);
  }

  try {
    await core.start();
  } catch (e) {
    console.error('[Sentinel] Fatal Error starting core:', e);
    process.exit(1);
  }
}

main().catch(console.error);
