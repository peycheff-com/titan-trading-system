/**
 * AI Integration Verification Script
 *
 * This script verifies the Active Inference Engine integration.
 * It simulates market data and verifies the engine processes it correctly.
 */
import {
    ActiveInferenceEngine,
    MarketState,
} from "../src/engine/ActiveInferenceEngine.js";
import { loadConfigFromEnvironment } from "../src/config/ConfigLoader.js";
import { Logger } from '@titan/shared';
const logger = Logger.getInstance('brain:verify_ai_integration');

async function main() {
    logger.info("Starting Active Inference Integration Verification...");

    // 1. Load Config
    process.env.BRAIN_SIGNAL_TIMEOUT = "100";
    process.env.BRAIN_AI_WINDOW_SIZE = "50";
    process.env.BRAIN_AI_SENSITIVITY = "5.0";
    const config = loadConfigFromEnvironment();
    logger.info(
        "Config loaded:",
        JSON.stringify(config.brain?.activeInference, null, 2),
    );

    if (!config.brain?.activeInference) {
        throw new Error("Failed to load Active Inference config");
    }

    // 2. Initialize Engine
    const engine = new ActiveInferenceEngine(config.brain.activeInference);
    logger.info("ActiveInferenceEngine initialized.");

    // 3. Simulate Market Data
    logger.info("Simulating market data...");
    const basePrice = 50000;

    for (let i = 0; i < 60; i++) {
        const price = basePrice + Math.sin(i * 0.1) * 100 +
            (Math.random() - 0.5) * 50;
        const state: MarketState = {
            price,
            volume: 100 + Math.random() * 50,
            timestamp: Date.now() + i * 1000,
        };

        // Process market state through engine
        engine.processUpdate(state);
        if (i % 10 === 0) process.stdout.write(".");
    }
    logger.info("\nMarket data simulation complete.");

    // 4. Verify Metrics
    const metrics = engine.getState();
    logger.info("Engine Metrics:", JSON.stringify(metrics, null, 2));

    if (metrics.historySize < 50) {
        throw new Error(
            `Expected at least 50 history points, got ${metrics.historySize}`,
        );
    }

    // 5. Verify Engine State
    const state = engine.getState();
    if (!state) {
        throw new Error("Engine state is null");
    }
    logger.info(
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

    logger.info("VERIFICATION SUCCESSFUL");
}

main().catch((err) => {
    logger.error("VERIFICATION FAILED:", err);
    process.exit(1);
});
