import React from 'react';
import { render } from 'ink';
import { Dashboard } from "./dashboard/Dashboard.js";
import { SentinelConfig, SentinelCore } from "./engine/SentinelCore.js";
import { IExchangeGateway } from "./exchanges/interfaces.js";
import { BinanceGateway } from "./exchanges/BinanceGateway.js";
import { BybitGateway } from "./exchanges/BybitGateway.js";
import { MarketMonitor } from "./polymarket/MarketMonitor.js";

// ... imports
import http from 'http';

async function main() {
  // 0. Start Health Check Server (Production Requirement)
  const port = process.env.PORT || 8080;
  const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Sentinel OK');
  });
  server.listen(port, () => {
    console.log(`Health check server listening on port ${port}`);
  });

  // 1. Configuration
  const config: SentinelConfig = {
    symbol: process.env.SYMBOL || "BTCUSDT",
    updateIntervalMs: Number(process.env.UPDATE_INTERVAL_MS) || 1000,
    initialCapital: Number(process.env.INITIAL_CAPITAL) || 10000,
    riskLimits: {
      maxDrawdown: Number(process.env.MAX_DRAWDOWN) || 0.15,
      maxLeverage: Number(process.env.MAX_LEVERAGE) || 3.0,
      maxDelta: Number(process.env.MAX_DELTA) || 5000,
    },
  };

  // 2. Initialize Gateways
  const gateways: IExchangeGateway[] = [
    new BinanceGateway("key", "secret"), // TODO: Load from env
    new BybitGateway("key", "secret"),   // TODO: Load from env
  ];


  // 3. Start Core
  const core = new SentinelCore(config, gateways);

  // 3b. Start Market Monitor (Polymarket)
  const marketMonitor = new MarketMonitor();
  await marketMonitor.start();

  // 4. Start UI
  // ... (rest of UI logic)

  // Handle Shutdown
  const shutdown = async () => {
    await core.stop();
    await marketMonitor.stop();
    server.close();
    process.exit(0);
  };

  if (process.env.HEADLESS !== 'true') {
      const { unmount } = render(<Dashboard core={core} />);
      process.on("SIGINT", async () => {
        unmount();
        await shutdown();
      });
  } else {
      console.log("Starting in Headless Mode");
      process.on("SIGINT", shutdown);
  }

  try {
    await core.start();
  } catch (e) {
    console.error("[Sentinel] Fatal Error starting core:", e);
    process.exit(1);
  }
}

main().catch(console.error);
