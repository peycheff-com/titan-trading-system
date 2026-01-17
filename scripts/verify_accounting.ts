import { connect, JSONCodec } from "nats";

async function main() {
    console.log("Connecting to NATS...");
    const nc = await connect({ servers: "nats://localhost:4222" });
    const jc = JSONCodec();

    const signalId = `sig-${Date.now()}`;
    const fillId = `fill-${Date.now()}`;
    const t_signal = Date.now() - 500; // 500ms ago

    // 1. Publish Intent (Simulate Brain sending signal)
    const intent = {
        signal_id: signalId,
        symbol: "BTCUSDT",
        direction: "LONG",
        timestamp: t_signal,
        entry_zone: { min: 60000, max: 60100 },
        stop_loss: 59000,
        take_profits: [61000, 62000],
        leverage: 10,
        confidence: 0.95,
    };

    console.log(`Publishing Intent: ${signalId}`);
    nc.publish("titan.execution.intent.BTCUSDT", jc.encode(intent));

    // Wait a bit to simulate processing time
    await new Promise((r) => setTimeout(r, 100));

    // 2. Publish Fill (Simulate Execution Service reporting fill)
    const t_ingress = t_signal + 10;
    const t_exchange = t_ingress + 50;

    const fill = {
        fill_id: fillId,
        signal_id: signalId,
        symbol: "BTCUSDT",
        side: "BUY",
        price: 60050,
        qty: 0.1,
        fee: 0.0001,
        fee_currency: "BNB",
        t_signal: t_signal,
        t_ingress: t_ingress,
        t_exchange: t_exchange,
    };

    console.log(`Publishing Fill confirmation: ${fillId}`);
    nc.publish("titan.execution.fill.BTCUSDT", jc.encode(fill));

    console.log(
        "Messages published. Check titan-brain logs for 'Trade Reconciled'.",
    );

    await nc.drain();
    process.exit(0);
}

main().catch(console.error);
