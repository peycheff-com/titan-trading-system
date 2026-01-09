import React from 'react';
import { render } from 'ink';
import { Dashboard } from "./dashboard/Dashboard.js";
import { SentinelConfig, SentinelCore } from "./engine/SentinelCore.js";
import { IExchangeGateway } from "./exchanges/interfaces.js";
import { BinanceGateway } from "./exchanges/BinanceGateway.js";
import { BybitGateway } from "./exchanges/BybitGateway.js";

async function main() {
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

  // 4. Start UI
  const { unmount } = render(<Dashboard core={core} />);

  // Handle Shutdown
  process.on("SIGINT", async () => {
    unmount();
    await core.stop();
    process.exit(0);
  });

  try {
    await core.start();
  } catch (e) {
    console.error("[Sentinel] Fatal Error starting core:", e);
    process.exit(1);
  }
}

main().catch(console.error);
