/**
 * Enhanced AI Integration Demo
 *
 * Demonstrates the real-time parameter optimization, predictive analytics,
 * and adaptive risk management capabilities.
 */

import { EnhancedAIIntegration } from "../ai/EnhancedAIIntegration.js";
import { TitanAnalyst } from "../ai/TitanAnalyst.js";
import { OHLCV, RegimeSnapshot, Trade } from "../types/index.js";

/**
 * Demo function to showcase Enhanced AI Integration
 */
async function runEnhancedAIDemo(): Promise<void> {
  console.log("🧠 Enhanced AI Integration Demo Starting...\n");

  // Initialize components
  const analyst = new TitanAnalyst();
  const aiIntegration = new EnhancedAIIntegration(analyst, {
    realTimeOptimizer: {
      optimizationInterval: 5000, // 5 seconds for demo
      minTradesForOptimization: 5,
      autoApplyThreshold: 0.8,
      enableABTesting: true,
    },
    predictiveAnalytics: {
      updateInterval: 3000, // 3 seconds for demo
      minDataPoints: 10,
      enableMLModels: true,
    },
    enableAutomatedStrategySelection: true,
    enableAdaptiveRiskManagement: true,
  });

  // Set up event listeners
  aiIntegration.on("started", () => {
    console.log("✅ Enhanced AI Integration started");
  });

  aiIntegration.on("parameterOptimized", (event) => {
    console.log(`🔧 Parameter optimized: ${event.proposal.targetKey}`);
    console.log(
      `   ${event.proposal.currentValue} → ${event.proposal.suggestedValue}`,
    );
    console.log(
      `   Expected improvement: ${event.proposal.expectedImpact.pnlImprovement}%\n`,
    );
  });

  aiIntegration.on("regimeChanged", (event) => {
    console.log(`🌍 Regime change detected: ${event.symbol} → ${event.regime}`);
  });

  aiIntegration.on("strategySelectionUpdated", (event) => {
    console.log(`🎯 Strategy selection updated for ${event.symbol}:`);
    event.selection.selectedStrategies.forEach((strategy) => {
      console.log(
        `   ${strategy.strategy}: ${
          (strategy.allocation * 100).toFixed(1)
        }% (conf: ${(strategy.confidence * 100).toFixed(0)}%)`,
      );
    });
    console.log();
  });

  aiIntegration.on("riskAdjusted", (event) => {
    console.log(
      `⚠️ Risk adjustment applied (score: ${event.riskScore.toFixed(1)}/100):`,
    );
    event.adjustments.forEach((adj) => {
      console.log(
        `   ${adj.trigger}: ${adj.currentRisk.toFixed(3)} → ${
          adj.recommendedRisk.toFixed(3)
        } (${adj.urgency})`,
      );
    });
    console.log();
  });

  aiIntegration.on("abTestCompleted", (event) => {
    console.log(`🧪 A/B test completed: ${event.test.name}`);
    console.log(`   Recommendation: ${event.result.recommendation}`);
    console.log(
      `   Confidence: ${(event.result.confidence * 100).toFixed(1)}%\n`,
    );
  });

  // Start the integration
  aiIntegration.start();

  // Simulate market data
  console.log("📊 Simulating market data...\n");

  const symbols = ["BTCUSDT", "ETHUSDT", "ADAUSDT"];

  // Add initial market data
  for (const symbol of symbols) {
    const ohlcvData: OHLCV[] = [];
    for (let i = 0; i < 50; i++) {
      const basePrice = symbol === "BTCUSDT"
        ? 50000
        : symbol === "ETHUSDT"
        ? 3000
        : 1;
      const trend = Math.sin(i * 0.1) * 0.02; // Trending pattern
      const volatility = 0.01 + Math.random() * 0.02; // Variable volatility

      ohlcvData.push({
        timestamp: Date.now() - (50 - i) * 60000,
        open: basePrice * (1 + trend),
        high: basePrice * (1 + trend + volatility),
        low: basePrice * (1 + trend - volatility),
        close: basePrice * (1 + trend + (Math.random() - 0.5) * volatility),
        volume: 1000 + Math.random() * 500,
      });
    }

    aiIntegration.addMarketData(symbol, ohlcvData);
  }

  // Add regime snapshots
  for (const symbol of symbols) {
    for (let i = 0; i < 20; i++) {
      const regimeSnapshot: RegimeSnapshot = {
        timestamp: Date.now() - (20 - i) * 60000,
        symbol,
        trendState: Math.random() > 0.5 ? 1 : -1,
        volState: Math.floor(Math.random() * 3) as 0 | 1 | 2,
        liquidityState: Math.floor(Math.random() * 3) as 0 | 1 | 2,
        regimeState: Math.random() > 0.5 ? 1 : -1,
      };

      aiIntegration.addRegimeSnapshot(regimeSnapshot);
    }
  }

  // Simulate trading activity
  console.log("💹 Simulating trading activity...\n");

  for (let i = 0; i < 30; i++) {
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const trapType = [
      "oi_wipeout",
      "funding_spike",
      "liquidity_sweep",
    ][Math.floor(Math.random() * 3)] as any;
    const isWinning = Math.random() > 0.4; // 60% win rate

    const trade: Trade = {
      id: `demo-trade-${i}`,
      timestamp: Date.now() - (30 - i) * 30000,
      symbol,
      trapType,
      side: Math.random() > 0.5 ? "long" : "short",
      entryPrice: 50000,
      exitPrice: isWinning ? 50100 : 49900,
      quantity: 0.1,
      leverage: 10,
      pnl: isWinning ? 10 : -10,
      pnlPercent: isWinning ? 0.002 : -0.002,
      duration: 300 + Math.random() * 600,
      slippage: 0.001,
      fees: 5,
      exitReason: isWinning ? "take_profit" : "stop_loss",
    };

    aiIntegration.addTrade(trade);
  }

  // Let the system run for a while
  console.log("⏱️ Running AI integration for 30 seconds...\n");

  const statusInterval = setInterval(() => {
    const status = aiIntegration.getStatus();
    console.log(
      `📈 Performance Score: ${
        status.performanceScore.toFixed(1)
      }/100 | Risk Level: ${status.riskLevel.toUpperCase()}`,
    );
    console.log(
      `🔄 Optimizations: ${status.realTimeOptimizer.optimizationCount} | A/B Tests: ${status.realTimeOptimizer.activeABTests}`,
    );
    console.log(
      `📊 Symbols Tracked: ${status.predictiveAnalytics.symbolsTracked} | Models Active: ${status.predictiveAnalytics.modelsActive}`,
    );
    console.log("---");
  }, 10000);

  // Run for 30 seconds
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Cleanup
  clearInterval(statusInterval);
  aiIntegration.shutdown();

  console.log("\n🏁 Enhanced AI Integration Demo completed!");
  console.log("\nKey Features Demonstrated:");
  console.log("✅ Real-time parameter optimization with live trading data");
  console.log("✅ Predictive analytics for market regime detection");
  console.log("✅ Adaptive risk management based on market conditions");
  console.log("✅ Automated strategy selection and optimization");
  console.log("✅ A/B testing for parameter changes");
  console.log("✅ Performance feedback loops");
  console.log("✅ Correlation analysis and portfolio optimization");
  console.log("✅ Volatility prediction and risk adjustment");
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runEnhancedAIDemo().catch(console.error);
}

export { runEnhancedAIDemo };
