/* eslint-disable @typescript-eslint/no-unused-vars */
import {
    AIOptimizationRequest,
    getNatsPublisher,
} from "../src/server/NatsPublisher.js";
import { EnvelopeSchema, getNatsClient, TitanSubject } from "@titan/shared";
import { Logger } from '@titan/shared';
const logger = Logger.getInstance('brain:verify_envelope_compliance');

async function verify() {
    const nats = getNatsClient();
    const publisher = getNatsPublisher();

    await nats.connect();
    await publisher.connect();

    logger.info("Connected to NATS...");

    // Subscribe to verify
    const _sub = nats.subscribe(
        TitanSubject.AI_OPTIMIZATION_REQUESTS,
        (data: unknown, subject) => {
            logger.info(
                `Received message on ${subject}:`,
                JSON.stringify(data, null, 2),
            );

            try {
                const parsed = EnvelopeSchema.parse(data);
                logger.info("✅ Message is a VALID Envelope!");
                logger.info(`   Type: ${parsed.type}`);
                logger.info(`   Version: ${parsed.version}`);
                logger.info(`   Detailed Validation Passed.`);
            } catch (e) {
                logger.error("❌ Message is NOT a valid Envelope:", e);
                // Log validation errors
            }

            // Clean up and exit
            setTimeout(() => {
                nats.close();
                process.exit(0);
            }, 500);
        },
    );

    logger.info("Publishing AI Optimization Request...");
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
    logger.error(e);
    process.exit(1);
});
