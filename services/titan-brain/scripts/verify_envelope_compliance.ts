// @ts-nocheck
// eslint-disable @typescript-eslint/no-unused-vars
import {
    AIOptimizationRequest,
    getNatsPublisher,
} from "../src/server/NatsPublisher.js";
import { EnvelopeSchema, getNatsClient, TitanSubject } from "@titan/shared";

async function verify() {
    const nats = getNatsClient();
    const publisher = getNatsPublisher();

    await nats.connect();
    await publisher.connect();

    console.log("Connected to NATS...");

    // Subscribe to verify
    const sub = nats.subscribe(
        TitanSubject.AI_OPTIMIZATION_REQUESTS,
        (data: any, subject) => {
            console.log(
                `Received message on ${subject}:`,
                JSON.stringify(data, null, 2),
            );

            try {
                const parsed = EnvelopeSchema.parse(data);
                console.log("✅ Message is a VALID Envelope!");
                console.log(`   Type: ${parsed.type}`);
                console.log(`   Version: ${parsed.version}`);
                console.log(`   Detailed Validation Passed.`);
            } catch (e) {
                console.error("❌ Message is NOT a valid Envelope:", e);
                // Log validation errors
            }

            // Clean up and exit
            setTimeout(() => {
                nats.close();
                process.exit(0);
            }, 500);
        },
    );

    console.log("Publishing AI Optimization Request...");
    const request: AIOptimizationRequest = {
        reason: "Verification Test",
        triggeredBy: "verify-script",
        timestamp: Date.now(),
        metrics: {
            sharpeRatio: 2.5,
        },
    };

    await publisher.triggerAIOptimization(request);
}

verify().catch((e) => {
    console.error(e);
    process.exit(1);
});
