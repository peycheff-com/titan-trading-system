import { connect } from "nats";
async function main() {
    console.log('🏛️  Starting "The Bulgaria Tax" Execution Simulator...');
    // Connect to NATS
    const natsUrl = process.env.NATS_URL || "nats://localhost:4222";
    const nc = await connect({ servers: natsUrl });
    console.log(`✅ Connected to NATS at ${natsUrl}`);
    const js = nc.jetstream();
    // Subscribe to placement commands
    const sub = nc.subscribe("titan.cmd.exec.place.>");
    console.log("🎧 Listening for execution commands on titan.cmd.exec.place.>");
    (async () => {
        for await (const msg of sub) {
            try {
                const payload = JSON.parse(msg.string());
                console.log(`\n📩 Received Order: ${payload.symbol} ${payload.type} Size: ${payload.size}`);
                // Simulate Latency (The "Bulgaria" routing delay)
                const latency = Math.floor(Math.random() * 200) + 50; // 50-250ms
                await new Promise((r) => setTimeout(r, latency));
                // 2. Publish Fill Confirmation
                // We mock a full fill at entry price (slippage later?)
                const fillPrice = payload.entry_zone?.[0] || 1000; // Mock price if market
                const fillPayload = {
                    signalId: payload.signal_id,
                    orderId: `ord_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                    symbol: payload.symbol,
                    side: payload.direction === 1 ? "BUY" : "SELL",
                    fillPrice: fillPrice,
                    fillSize: payload.size,
                    requestedSize: payload.size,
                    timestamp: Date.now(),
                    fees: payload.size * 0.001, // 0.1% fee
                    slippage: 0,
                };
                // The subject execution engine usually publishes fills to:
                // titan.execution.fill (for public consumption)
                // or reply to request if it was a request.
                // Brain likely listens to a specific subject.
                // TitanBrain.ts: executionEngineClient.onFillConfirmation...
                // ExecutionEngineClient.ts: Not fully implemented listener manually, likely part of NatsConsumer or just listening to fills.
                // Let's assume Brain listens to 'titan.execution.fill' or similar.
                // Re-checking TitanBrain -> ExecutionEngineClient -> handleFillConfirmation.
                // Wait, ExecutionEngineClient doesn't seem to subscribe to fills in the snippet I saw?
                // It emits 'fill:confirmed' but who calls handleFillConfirmation?
                // Ah, NatsConsumer often routes these.
                // Let's assume standard event subject:
                // titan.execution.fill
                const subject = `titan.execution.fill`;
                nc.publish(subject, JSON.stringify(fillPayload));
                console.log(`✅ Filled ${payload.symbol}: ${fillPayload.fillSize} @ ${fillPayload.fillPrice} (Latency: ${latency}ms)`);
            }
            catch (err) {
                console.error("❌ Error processing message:", err);
            }
        }
    })();
}
main().catch(console.error);
//# sourceMappingURL=simulate_execution.js.map