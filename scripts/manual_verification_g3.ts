
import { NatsConnection, connect, StringCodec } from "nats";
import { randomUUID } from "crypto";

const sc = StringCodec();

async function runVerification() {
    console.log("🚀 Starting G3 Execution Verification...");

    // 1. Connect to NATS
    const nc = await connect({ servers: "nats://localhost:4222" });
    console.log("✅ Connected to NATS");

    // 2. Inject Mock Signal (Brain -> Execution)
    const signalId = randomUUID();
    const symbol = "BTC/USDT";
    const size = 0.1;

    console.log(`Injecting Signal: ${signalId} for ${symbol} size ${size}`);

    const intent = {
        signal_id: signalId,
        symbol: symbol,
        intent_type: "Market",
        size: size,
        direction: 1, // Buy
        timestamp: Date.now()
    };

    // Publish to subject that Execution Engine listens to
    // Adjust subject based on actual system config (assuming titan.execution.intent)
    nc.publish("titan.execution.intent", sc.encode(JSON.stringify(intent)));

    // 3. Listen for Fill (Execution -> Brain)
    console.log("👂 Listening for Fill Report on titan.execution.fill.*");
    const sub = nc.subscribe("titan.execution.fill.*");

    (async () => {
        for await (const m of sub) {
            const data = JSON.parse(sc.decode(m.data));
            console.log("📩 Received Fill Report:", data);

            if (data.signal_id === signalId) {
                console.log("✅ Fill matched Signal ID!");
                if (data.status === "FILLED") {
                    console.log("✅ Status Verified: FILLED");
                    process.exit(0);
                } else {
                    console.error("❌ Unexpected Status:", data.status);
                    process.exit(1);
                }
            }
        }
    })();

    // Timeout
    setTimeout(() => {
        console.error("❌ Timeout waiting for fill.");
        process.exit(1);
    }, 10000);
}

runVerification().catch((err) => {
    console.error(err);
    process.exit(1);
});
