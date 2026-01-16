const { connect, StringCodec } = require("nats");
const { v4: uuidv4 } = require('uuid');

(async () => {
  const nc = await connect({ servers: "nats://localhost:4222" });
  const sc = StringCodec();

  // 1. OPEN Intent
  const signalId = "sig-" + Date.now();
  const openIntent = {
    signal_id: signalId,
    symbol: "ETH/USD",
    direction: 1, // Long
    type: "BUY_SETUP",
    entry_zone: [2500.0],
    stop_loss: 2400.0,
    take_profits: [2600.0],
    size: 1.5,
    status: "PENDING",
    received_at: new Date().toISOString(),
    metadata: {
        trap_type: "liquidity_sweep",
        insight_id: "test-insight-123"
    }
  };

  console.log(`📤 Sending OPEN intent: ${signalId}`);
  await nc.publish("titan.execution.intent.buy", sc.encode(JSON.stringify(openIntent)));

  // Wait 2 seconds
  await new Promise(r => setTimeout(r, 2000));

  // 2. CLOSE Intent
  const closeIntent = {
    signal_id: signalId, // Same signal ID to close the existing position
    symbol: "ETH/USD",
    direction: -1, // Short (Close Long)
    type: "CLOSE_LONG",
    entry_zone: [2550.0], // Exit Price (Profit of 50.0 * 1.5 = 75.0)
    stop_loss: 0,
    take_profits: [],
    size: 1.5,
    status: "PENDING",
    received_at: new Date().toISOString(),
    metadata: {
        reason: "take_profit_hit"
    }
  };

  console.log(`📤 Sending CLOSE intent: ${signalId}`);
  await nc.publish("titan.execution.intent.close", sc.encode(JSON.stringify(closeIntent)));

  console.log("Done.");
  await nc.drain();
})();
