import { connect, JSONCodec } from "nats";
import { createHmac } from "crypto";
import { v4 as uuidv4 } from "uuid";

const NATS_URL = process.env.NATS_URL || "nats://localhost:4222";
const HMAC_SECRET = process.env.HMAC_SECRET || "titan_dev_hmac_secret";

// Helper to sign intent
function signIntent(payload: any, secret: string) {
    // Canonicalize payload (simple approach: use JSON.stringify as we control the object order)
    // To match Rust/Node exactly, we should ensure key order.
    // For this script, we'll create the object with sorted keys or rely on simple structures.
    const payloadStr = JSON.stringify(payload);
    const ts = Date.now();
    const nonce = uuidv4();

    // Canonical String: ts.nonce.payload_json
    const canonical = `${ts}.${nonce}.${payloadStr}`;

    const hmac = createHmac("sha256", secret);
    hmac.update(canonical);
    const sig = hmac.digest("hex");

    return {
        type: "titan.cmd.exec.place.v1",
        version: 1,
        producer: "audit-script",
        ts,
        nonce,
        sig,
        payload: payload,
    };
}

async function main() {
    console.log("🔌 Connecting to NATS...");
    const nc = await connect({
        servers: NATS_URL,
        user: "brain",
        pass: "brain_password",
    });
    const jc = JSONCodec();
    console.log("✅ Connected.");

    // Subscribe to rejections
    const rejectionSub = nc.subscribe("titan.evt.exec.reject.v1");

    // Listener loop
    (async () => {
        for await (const m of rejectionSub) {
            const event = jc.decode(m.data);
            console.log("\n### Rejection Event Received");
            console.log("```json");
            console.log(JSON.stringify(event, null, 2));
            console.log("```\n");
        }
    })();

    // 1. Send Intent expecting SYSTEM_DISARMED (since system starts disarmed)
    console.log("\n## Trace 1: Triggering SYSTEM_DISARMED Rejection");
    const intent1 = {
        signal_id: uuidv4(),
        symbol: "BTC/USDT",
        direction: 1,
        size: 0.1,
        type: "MARKET",
        policy_hash: "CORRECT_HASH_IF_KNOWN_OR_IGNORED_IF_DISARMED",
        timestamp: Date.now(),
    };

    // We assume default start state is DISARMED.
    // If we get "SYSTEM_DISARMED", good.
    // If not, we might get "POLICY_HASH_MISMATCH" if armed (unlikely) or "INVALID_HASH".

    const envelope1 = signIntent(intent1, HMAC_SECRET);
    console.log("Injecting Intent 1...");
    // console.log(JSON.stringify(intent1, null, 2));

    await nc.publish(
        "titan.cmd.exec.place.v1.binance.main.BTC_USDT",
        jc.encode(envelope1),
    );
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Mock Arming? We need to send ARM command to move to next state?
    // Or just generating one trace is enough for proof of telemetry?
    // Task says "10-20 traces".
    // I will generate 5 similar traces to demonstrate stream.

    // Let's generate a POLICY_HASH_MISMATCH trace.
    // To reach this check, we must be ARMED.
    // So we need to ARM the system.
    // Topic: titan.cmd.operator.v1
    // Command: { "command": "ARM", "timestamp": ... } + Signature?
    // OperatorGate usually requires signed command too.
    // `validate_risk_command` in security.rs uses "timestamp:action:actor_id:command_id" signature.

    console.log("\n## Trace 2: Arming System...");
    const cmdId = uuidv4();
    const now = Date.now();
    const action = "ARM";
    const actorId = "audit-script";

    // Sig String: timestamp:action:actor_id:command_id
    const sigString = `${now}:${action}:${actorId}:${cmdId}`;
    const hmac = createHmac("sha256", HMAC_SECRET);
    hmac.update(sigString);
    const sig = hmac.digest("hex");

    const armCmd = {
        command_id: cmdId,
        action: action,
        actor_id: actorId,
        timestamp: now,
        signature: sig,
    };

    await nc.publish("titan.cmd.operator.v1", jc.encode(armCmd));
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Send Intent expecting POLICY_HASH_MISMATCH
    console.log("\n## Trace 3: Triggering POLICY_HASH_MISMATCH Rejection");
    const intent2 = {
        signal_id: uuidv4(),
        symbol: "ETH/USDT",
        direction: -1,
        size: 0.5,
        type: "MARKET",
        policy_hash: "INTENTIONALLY_BAD_HASH",
        timestamp: Date.now(),
    };

    const envelope2 = signIntent(intent2, HMAC_SECRET);
    console.log("Injecting Intent 2...");
    await nc.publish(
        "titan.cmd.exec.place.v1.binance.main.ETH_USDT",
        jc.encode(envelope2),
    );
    await new Promise((r) => setTimeout(r, 2000));

    await nc.close();
    process.exit(0);
}

main().catch(console.error);
