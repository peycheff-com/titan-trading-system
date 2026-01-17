import { HologramEngine } from "../services/titan-phase2-hunter/src/engine/HologramEngine";
import { BybitPerpsClient } from "../services/titan-phase2-hunter/src/exchanges/BybitPerpsClient";
import {
    OHLCV,
    TimeframeState,
} from "../services/titan-phase2-hunter/src/types";

// Mock Bybit Client
class MockBybitClient extends BybitPerpsClient {
    constructor() {
        super({ key: "test", secret: "test" });
    }

    async fetchOHLCV(
        symbol: string,
        interval: string,
        limit: number,
    ): Promise<OHLCV[]> {
        const candles: OHLCV[] = [];
        const basePrice = 50000;

        for (let i = 0; i < limit; i++) {
            // Generate ZigZag pattern for fractals (5 bars up, 5 bars down)
            const cyclePosition = i % 10;
            let trend = 1;
            if (cyclePosition >= 5) trend = -1;

            // Add some noise/volatility
            const volatility = (i % 20 === 0) ? 100 : 10;

            // Base movement
            const move = (i * 2) + (trend * (cyclePosition * 10));

            const open = basePrice + move;
            const close = open + (trend * 5);
            const high = Math.max(open, close) + volatility + 10;
            const low = Math.min(open, close) - volatility - 10;

            candles.push({
                timestamp: Date.now() - ((limit - i) * 60000), // 1 min intervals roughly
                open,
                high,
                low,
                close,
                volume: 1000 + (Math.random() * 500),
            });
        }
        return candles;
    }
}

async function runTest() {
    console.log("Starting Hologram Engine Phase 2 Verification...");

    // 1. Initialize Engine
    const client = new MockBybitClient();
    const engine = new HologramEngine(client);

    try {
        const state = await engine.analyze("BTCUSDT");
        console.log("Hologram Analysis Result:");
        console.log(`- Symbol: ${state.symbol}`);
        console.log(`- Status: ${state.status}`);
        console.log(`- Alignment Score: ${state.alignmentScore}`);
        console.log(`- Veto Details:`, state.veto);
        console.log(`- Realized Expectancy: ${state.realizedExpectancy}`);

        if (state.status === "NO_PLAY" && state.veto.vetoed) {
            console.log(`[INFO] Veto Triggered: ${state.veto.reason}`);
        }

        console.log("\n[SUCCESS] Phase 2 Logic Executed Successfully");
    } catch (e) {
        console.error("Test Failed:", e);
    }
}

runTest();
