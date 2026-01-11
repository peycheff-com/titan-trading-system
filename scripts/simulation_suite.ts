import { fetch } from "undici";
import crypto from "crypto";

// --- Configuration ---
const EXECUTION_URL = "http://localhost:8080";
const BRAIN_URL = "http://localhost:3100";
const HMAC_SECRET = process.env.HMAC_SECRET || "mysecret";

// Replicated ExecutionClient logic to avoid import path issues in standalone script
class MockExecutionClient {
    constructor(private baseUrl: string, private secret: string) {}

    async sendSignal(payload: any): Promise<boolean> {
        const signature = crypto
            .createHmac("sha256", this.secret)
            .update(JSON.stringify(payload))
            .digest("hex");

        console.log(
            `Sending Signal to ${this.baseUrl} [Signature: ${
                signature.substring(0, 8)
            }...]`,
        );

        try {
            const response = await fetch(`${this.baseUrl}/webhook`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-source": "titan_sentinel",
                    "x-signature": signature,
                },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const text = await response.text();
                console.error(
                    `❌ Execution Server Error (${response.status}): ${text}`,
                );
                return false;
            }
            const json: any = await response.json();
            console.log(`✅ Signal Response:`, JSON.stringify(json));
            if (!json.success) {
                console.warn(
                    `⚠️ Signal processed but returned failure: ${
                        json.reason || json.error
                    }`,
                );
            }
            return true;
        } catch (error) {
            console.error("❌ Network Error:", error);
            return false;
        }
    }
}

async function getBrainEquity(): Promise<number> {
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const signature = crypto
            .createHmac("sha256", HMAC_SECRET)
            .update(`${timestamp}.`) // Empty body
            .digest("hex");

        const res = await fetch(`${BRAIN_URL}/dashboard`, {
            headers: {
                "x-signature": signature,
                "x-timestamp": timestamp.toString(),
                "x-source": "simulation_suite",
            },
        });

        if (!res.ok) throw new Error(`Brain Error ${res.status}`);
        const data: any = await res.json();
        return data.equity || 0;
    } catch (e) {
        console.warn(
            `⚠️ Could not fetch Brain equity: ${e}`,
        );
        return -1;
    }
}

async function main() {
    console.log("=== Titan End-to-End Simulation Suite ===");
    console.log(`Target: Execution @ ${EXECUTION_URL}, Brain @ ${BRAIN_URL}`);
    console.log(`HMAC Secret: ${HMAC_SECRET}`);

    // Pre-check
    const initialEquity = await getBrainEquity();
    if (initialEquity === -1) {
        console.error(
            "❌ Brain is not reachable. Please run './scripts/start-all.sh' first.",
        );
        process.exit(1);
    }
    console.log(`Initial Brain Equity: $${initialEquity}`);

    // 1. Simulate Sentinel Signal (Polymarket Arbitrage)
    const client = new MockExecutionClient(EXECUTION_URL, HMAC_SECRET);

    const arbSignal = {
        signal_id: `sim-arb-${Date.now()}`,
        type: "BUY_SETUP", // Using BUY_SETUP to trigger ProductionServer._processWebhook logic
        phaseId: "phase3", // Sentinel Phase
        symbol: "BTCUSDT", // Using a real symbol that BybitAdapter might accept (or use MOCK_SYMBOL if adapter supports it)
        side: "BUY",
        size: 0.001,
        limit_price: 100000, // High price to ensure fill (or use adapter logic)
        stop_loss: 90000,
        take_profits: 110000,
        // Sentinel specific metadata
        market_id: "polymarket-mock-1",
        outcome_id: "outcome-yes",
    };

    // 0. Configure & Enable Execution Server
    console.log("[Step 0] Configuring Execution Server...");
    try {
        // 0.1 Configure Mock Adapter
        console.log("   [0.1] Setting Adapter to MOCK...");
        const configRes = await fetch(`${EXECUTION_URL}/api/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                exchange: "mock",
                api_key: "mock-key",
                api_secret: "mock-secret",
                network: "mainnet",
            }),
        });

        if (!configRes.ok) {
            const txt = await configRes.text();
            console.error(`❌ Failed to configure Mock Adapter: ${txt}`);
        } else {
            const json: any = await configRes.json();
            console.log(`   ✅ Adapter Configured: ${json.message}`);
        }

        // 0.2 Enable Auto-Exec
        console.log("   [0.2] Enabling Auto-Execution...");
        const autoRes = await fetch(`${EXECUTION_URL}/api/auto-exec/enable`, {
            method: "POST",
        });
        if (autoRes.ok) {
            console.log("   ✅ Auto-Execution Enabled");
        } else {
            console.error(
                "❌ Failed to enable Auto-Execution:",
                await autoRes.text(),
            );
        }
    } catch (e) {
        console.error("❌ Failed to setup Execution Server:", e);
    }

    console.log("\n[Step 1] Sentinel dispatches Arb Signal...");
    // Update logic to print response
    const sent = await client.sendSignal(arbSignal);
    if (!sent) process.exit(1);

    // 2. Wait for Processing (Execution -> Adapter -> Brain)
    console.log(
        "\n[Step 2] Waiting for Execution -> Brain feedback loop (5s)...",
    );
    await new Promise((r) => setTimeout(r, 5000));

    // 3. Verify Brain Update
    const finalEquity = await getBrainEquity();
    console.log(`Final Brain Equity: $${finalEquity}`);

    if (finalEquity !== initialEquity) {
        console.log(
            `✅ SUCCESS: Brain Equity changed ($${initialEquity} -> $${finalEquity})`,
        );
        console.log(
            "   This confirms: Sentinel Signal -> Execution Order -> Execution Report -> Brain PnL.",
        );
    } else {
        console.log("⚠️  WARNING: Brain Equity did not change.");
        console.log("   Possible reasons:");
        console.log(
            "   - Execution did not broadcast fill (Auto-Execution disabled?)",
        );
        console.log("   - Adapter did not return success (Mock keys used?)");
        console.log("   - Execution Report failed HMAC at Brain?");
        console.log(
            "   Check '../../logs/execution.log' and '../../logs/brain.log' for details.",
        );
    }
}

main().catch(console.error);
