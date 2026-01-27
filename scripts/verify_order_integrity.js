import { getNatsClient } from "@titan/shared";
import { v4 as uuidv4 } from "uuid";
// Define types locally/manually to match Rust `model.rs` exactly
// This avoids mismatch with @titan/shared which seems IPC-focused
const IntentStatus = {
    PENDING: "PENDING",
    VALIDATED: "VALIDATED",
    REJECTED: "REJECTED",
    EXECUTED: "EXECUTED",
    EXPIRED: "EXPIRED",
};
const IntentType = {
    BUY_SETUP: "BUY_SETUP",
    SELL_SETUP: "SELL_SETUP",
    CLOSE_LONG: "CLOSE_LONG",
    CLOSE_SHORT: "CLOSE_SHORT",
    CLOSE: "CLOSE",
};
async function main() {
    const nats = getNatsClient();
    await nats.connect();
    console.log("🔌 Connected to NATS");
    const signalId = `test-integrity-${uuidv4()}`;
    const symbol = "BTC/USDT";
    console.log(`🧪 Starting Integrity Test for Signal ID: ${signalId}`);
    const handleFill = (fill, type) => {
        console.log(`✅ ${type} Received:`, fill);
        if (fill.signal_id === signalId) {
            console.log(`🎉 SUCCESS: signal_id matched in ${type}!`);
            console.log(`🆔 Client Order ID: ${fill.client_order_id}`);
            console.log(`🆔 Execution ID: ${fill.execution_id}`);
            console.info("Metrics:", {
                latency_ms: fill.t_exchange - fill.t_ingress,
            });
            process.exit(0);
        }
        else {
            console.warn(`⚠️ Received ${type} for different signal: ${fill.signal_id}`);
        }
    };
    // Subscribe to both Real and Shadow fills
    // Use > wildcard to match any symbol format (BTC/USDT or BTCUSDT)
    await nats.subscribe("titan.execution.fill.>", (fill) => handleFill(fill, "REAL FILL"));
    await nats.subscribe("titan.execution.shadow_fill.>", (fill) => handleFill(fill, "SHADOW FILL"));
    // Give subscription time to activate
    await new Promise((r) => setTimeout(r, 1000));
    // Publish Test Intent
    const intent = {
        signal_id: signalId,
        source: "scavenger", // Use scavenger to match router rules
        symbol: symbol,
        direction: 1, // Long
        type: IntentType.BUY_SETUP,
        entry_zone: [90000],
        stop_loss: 85000,
        take_profits: [100000],
        size: 0.001,
        status: IntentStatus.PENDING,
        t_signal: Date.now(),
        metadata: { test: true },
    };
    console.log(`🚀 Publishing Intent to titan.execution.intent.${symbol.replace("/", "")}...`, intent);
    // NATS engine likely expects subject with NO slashes for subscription if it uses standard mapping?
    // Checking nats_engine.rs: "titan.execution.intent.>"
    // It filters/switches inside.
    // Let's publish to BTCUSDT to be safe, or just use what works.
    await nats.publish(`titan.execution.intent.${symbol.replace("/", "")}`, intent);
    // Timeout
    setTimeout(() => {
        console.error("❌ TIMEOUT: No fill received after 10s");
        process.exit(1);
    }, 10000);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=verify_order_integrity.js.map