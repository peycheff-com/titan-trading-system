import { UltimateBulgariaProtocol } from "../src/detectors/UltimateBulgariaProtocol.js";

// Mock dependencies
const mockBybit = {
    fetchTopSymbols: async () => ["ALTUSDT"],
    fetchOHLCV: async (symbol: string) => {
        if (symbol === "BTCUSDT") {
            return [{ close: 50000 }, { close: 50000 }]; // Stable BTC
        }
        if (symbol === "ALTUSDT") {
            return [{ close: 100 }, { close: 96 }]; // 4% drop
        }
        return [];
    },
    getTicker: async () => ({
        bid1Price: "96",
        bid1Size: "1",
        ask1Price: "96.1",
        ask1Size: "1",
    }),
};

const mockBinance = {
    getSpotPrice: async () => 96,
};

// Mock OIWipeoutDetector
// We want to return something truthy so we proceed to logic,
// OR simpler: we assume `detectCrashes` calls `metrics.get`.
// Actually `scan()` calls `detectCrashes()`.
// `detectCrashes` checks thresholds and returns array.
// Then `scan()` loops and calls `detectWipeout`.

const mockDetector = {
    detectWipeout: async (symbol: string) => ({
        type: "OI_WIPEOUT",
        symbol,
        price: 96,
        wipeoutSize: 0.2,
    }),
};

async function run() {
    const mockLogger = {
        info: console.log,
        error: console.error,
        warn: console.warn,
        debug: console.log,
    };

    const protocol = new UltimateBulgariaProtocol(
        mockLogger as any,
        mockBybit as any,
        mockBinance as any,
        mockDetector as any,
    );

    console.log("--- Test 1: No Metrics (Default 3% threshold) ---");
    // Drop is 4%, default threshold 3%. Should detect.
    // detectCrashes is private, call scan()
    await protocol.scan();

    console.log("\n--- Test 2: High Alpha (Stable Regime) ---");
    protocol.updatePowerLawMetrics("ALTUSDT", {
        alpha: 3.5,
        volatility_cluster: false,
    });
    // Threshold becomes 2.5%. Drop is 4%. Should detect.
    await protocol.scan();

    console.log("\n--- Test 3: Low Alpha (Wild Regime) ---");
    protocol.updatePowerLawMetrics("ALTUSDT", {
        alpha: 1.5,
        volatility_cluster: false,
    });
    // Threshold becomes 5%. Drop is 4%. Should NOT detect (ignore noise).
    await protocol.scan();
}

run().catch(console.error);
