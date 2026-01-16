const { connect, StringCodec } = require("nats");

async function run() {
  const nc = await connect({ servers: "nats://localhost:4222" });
  const sc = StringCodec();

  const intent = {
    signal_id: "test-signal-001",
    symbol: "BTC/USD",
    direction: 1, // Long
    type: "BUY_SETUP",
    entry_zone: ["95000", "94500"],
    stop_loss: "94000",
    take_profits: ["96000", "97000"],
    size: "0.5",
    status: "PENDING",
    received_at: new Date().toISOString()
  };

  const subject = "titan.execution.intent.test";
  nc.publish(subject, sc.encode(JSON.stringify(intent)));
  
  console.log(`Published intent to ${subject}`);
  await nc.drain();
}

run().catch((err) => {
  console.error(`Error publishing: ${err.message}`);
});
