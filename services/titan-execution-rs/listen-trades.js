const { connect, StringCodec } = require("nats");

(async () => {
    try {
        const nc = await connect({ servers: "nats://localhost:4222" });
        console.log("✅ Connected to NATS");
        const sc = StringCodec();
        const sub = nc.subscribe("execution.trade.closed");
        console.log("🚀 Listening for 'execution.trade.closed'...");

        for await (const m of sub) {
            const data = JSON.parse(sc.decode(m.data));
            console.log("-----------------------------------------");
            console.log("📦 CLOSED TRADE RECEIVED:");
            console.log(JSON.stringify(data, null, 2));
            console.log("-----------------------------------------");
        }
    } catch (err) {
        console.error("Error:", err);
    }
})();
