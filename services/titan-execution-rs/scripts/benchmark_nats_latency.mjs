#!/usr/bin/env node

import { connect, StringCodec } from "nats";

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split("=");
  if (key?.startsWith("--")) {
    args.set(key.replace(/^--/, ""), value ?? "true");
  }
}

const count = Number.parseInt(args.get("count") || "500", 10);
const symbol = args.get("symbol") || "BTCUSDT";
const source = args.get("source") || "bench";
const natsUrl = args.get("nats") || process.env.NATS_URL || "nats://localhost:4222";
const timeoutMs = Number.parseInt(args.get("timeoutMs") || "30000", 10);

if (!Number.isFinite(count) || count <= 0) {
  console.error("Invalid --count value");
  process.exit(1);
}

const venue = args.get("venue") || "auto";
const account = args.get("account") || "main";
const symbolToken = symbol.replace("/", "_");
const subject = `titan.cmd.exec.place.v1.${venue}.${account}.${symbolToken}`;
const shadowSubject = `titan.execution.shadow_fill.${symbol}`;

const sc = StringCodec();
const pending = new Map();
const latencies = [];
let received = 0;

const nowMs = () => Date.now();
const quantile = (values, q) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
};

const run = async () => {
  const nc = await connect({ servers: [natsUrl] });

  const sub = nc.subscribe(shadowSubject);
  const startWall = nowMs();

  const timeout = setTimeout(() => {
    sub.unsubscribe();
  }, timeoutMs);

  const reader = (async () => {
    for await (const msg of sub) {
      const payload = JSON.parse(sc.decode(msg.data));
      const signalId = payload.signal_id;
      const tSignal = payload.t_signal ?? pending.get(signalId);
      if (signalId && tSignal) {
        const latency = nowMs() - tSignal;
        latencies.push(latency);
        pending.delete(signalId);
        received += 1;
      }
      if (received >= count) {
        sub.unsubscribe();
        break;
      }
    }
  })();

  for (let i = 0; i < count; i += 1) {
    const signalId = `bench-${nowMs()}-${i}-${Math.random().toString(16).slice(2, 8)}`;
    const tSignal = nowMs();
    pending.set(signalId, tSignal);

    const payload = {
      signal_id: signalId,
      source,
      symbol,
      t_signal: tSignal,
      timestamp: tSignal,
      direction: 1,
      type: "BUY_SETUP",
      entry_zone: [30000],
      stop_loss: 29000,
      take_profits: [31000],
      size: 0.01,
      status: "VALIDATED",
      metadata: { source, benchmark: true },
    };

    nc.publish(subject, sc.encode(JSON.stringify(payload)));
  }

  await nc.flush();
  await reader;
  clearTimeout(timeout);

  const durationSec = (nowMs() - startWall) / 1000;
  const p50 = quantile(latencies, 0.5);
  const p95 = quantile(latencies, 0.95);
  const p99 = quantile(latencies, 0.99);
  const avg = latencies.reduce((a, b) => a + b, 0) / Math.max(latencies.length, 1);
  const min = Math.min(...latencies, 0);
  const max = Math.max(...latencies, 0);
  const throughput = latencies.length / Math.max(durationSec, 0.001);

  console.log("Titan Execution - NATS Shadow Fill Benchmark");
  console.log(`Subject: ${subject}`);
  console.log(`Shadow Subject: ${shadowSubject}`);
  console.log(`Requested: ${count}, Received: ${latencies.length}`);
  console.log(`Duration: ${durationSec.toFixed(2)}s, Throughput: ${throughput.toFixed(2)} msg/s`);
  console.log(`Latency ms (min/avg/p50/p95/p99/max): ${min.toFixed(2)} / ${avg.toFixed(2)} / ${p50.toFixed(2)} / ${p95.toFixed(2)} / ${p99.toFixed(2)} / ${max.toFixed(2)}`);

  if (latencies.length < count) {
    console.error("Benchmark incomplete: not all shadow fills received. Ensure market data is flowing.");
    process.exit(1);
  }

  await nc.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
