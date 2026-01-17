import { MockAdapter } from "../src/engine/MockAdapter.js";
import { ActiveInferenceEngine } from "../src/engine/ActiveInferenceEngine.js";
import { loadConfigFromEnvironment } from "../src/config/ConfigLoader.js";
import { MarketSignal, SignalType } from "../src/types/index.js";

async function main() {
    console.log("Starting Active Inference Integration Verification...");

    // 1. Load Config
    process.env.BRAIN_SIGNAL_TIMEOUT = "100";
    process.env.BRAIN_AI_WINDOW_SIZE = "50";
    process.env.BRAIN_AI_SENSITIVITY = "5.0";
    const config = loadConfigFromEnvironment();
    console.log(
        "Config loaded:",
        JSON.stringify(config.brain?.activeInference, null, 2),
    );

    if (!config.brain?.activeInference) {
        throw new Error("Failed to load Active Inference config");
    }

    // 2. Initialize Engine
    const engine = new ActiveInferenceEngine(config.brain.activeInference);
    console.log("ActiveInferenceEngine initialized.");

    // 3. Setup Mock Adapter
    const adapter = new MockAdapter();
    adapter.registerEngine(engine);
    console.log("MockAdapter registered.");

    // 4. Simulate Market Data
    console.log("Simulating market data...");
    const basePrice = 50000;

    for (let i = 0; i < 60; i++) {
        const price = basePrice + Math.sin(i * 0.1) * 100 +
            (Math.random() - 0.5) * 50;
        const signal: MarketSignal = {
            id: `sig_${i}`,
            type: SignalType.PRICE_UPDATE,
            symbol: "BTCUSDT",
            timestamp: Date.now() + i * 1000,
            data: {
                price,
                volume: 100 + Math.random() * 50,
                orderBook: {
                    bids: [[price - 1, 1]],
                    asks: [[price + 1, 1]],
                },
            },
            source: "mock",
            confidence: 1.0,
        };

        await adapter.emitSignal(signal);
        if (i % 10 === 0) process.stdout.write(".");
    }
    console.log("\nMarket data simulation complete.");

    // 5. Verify Metrics
    const metrics = engine.getState();
    console.log("Engine Metrics:", JSON.stringify(metrics, null, 2));

    if (metrics.historySize < 50) {
        throw new Error(
            `Expected at least 50 history points, got ${metrics.historySize}`,
        );
    }

    // 6. Verify Mock Adapter Output
    // In a real scenario we'd check if the adapter received allocations back
    // For now we check if engine state is valid
    const state = engine.getState();
    if (!state) {
        throw new Error("Engine state is null");
    }
    console.log(
        "Final Inference State:",
        JSON.stringify(
            {
                cortisol: state.cortisol,
                surprise: state.surprise,
            },
            null,
            2,
        ),
    );

    console.log("VERIFICATION SUCCESSFUL");
}

main().catch((err) => {
    console.error("VERIFICATION FAILED:", err);
    process.exit(1);
});
