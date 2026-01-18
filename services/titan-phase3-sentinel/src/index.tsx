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
  // Dynamic import if needed or use standard import if build allows. 
  // Assuming @titan/shared is available as per checking NatsClient
  const { getConfigManager, TitanSubject, getNatsClient } = await import("@titan/shared");
  
  // Initialize shared manager to load environment variables/files
  getConfigManager();
  
  const configManager = {
    get: (key: string) => process.env[key]
  };
  
  const config: SentinelConfig = {
    symbol: configManager.get("SYMBOL") || "BTCUSDT",
    updateIntervalMs: Number(configManager.get("UPDATE_INTERVAL_MS")) || 1000,
    initialCapital: Number(configManager.get("INITIAL_CAPITAL")) || 10000,
    riskLimits: {
      maxDrawdown: Number(configManager.get("MAX_DRAWDOWN")) || 0.15,
      maxLeverage: Number(configManager.get("MAX_LEVERAGE")) || 3.0,
      maxDelta: Number(configManager.get("MAX_DELTA")) || 5000,
    },
  };

    // 2. Initialize Gateways
    const binanceKey = configManager.get("BINANCE_API_KEY");
    const binanceSecret = configManager.get("BINANCE_API_SECRET");
    const bybitKey = configManager.get("BYBIT_API_KEY");
    const bybitSecret = configManager.get("BYBIT_API_SECRET");

    if (!binanceKey || !binanceSecret) {
        console.warn("⚠️ Missing BINANCE_API_KEY or BINANCE_API_SECRET. Gateway may fail.");
    }
    
    const gateways: IExchangeGateway[] = [
        new BinanceGateway(binanceKey || "", binanceSecret || ""), 
        new BybitGateway(bybitKey || "", bybitSecret || ""), 
    ];


  // 3. Start Core
  const core = new SentinelCore(config, gateways);

  // 3a. Start NATS Subscription (Regime Awareness)
  try {
      const nats = await getNatsClient();
      console.log("Connected to NATS for Regime Updates");
      
      const sub = nats.subscribe<{ regime: string; alpha: number }>(
          TitanSubject.REGIME_UPDATE,
          (data) => {
              try {
                  core.updateRegime(data.regime, data.alpha);
              } catch (err) {
                  console.error("Error processing regime update:", err);
              }
          }
      );
  } catch (err) {
      console.warn("⚠️ Failed to connect to NATS. Sentinel will run in STABLE usage.", err);
  }

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
      core.on("log", (msg) => console.log(`[LOG] ${msg}`));
      core.on("error", (err) => console.error(`[ERROR] ${err}`));
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
