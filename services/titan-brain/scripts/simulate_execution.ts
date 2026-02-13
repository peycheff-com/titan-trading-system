import { getNatsClient, TITAN_SUBJECTS } from "@titan/shared";
import { Logger } from '@titan/shared';

const logger = Logger.getInstance('brain:simulate_execution');

const nc = getNatsClient();

async function main() {
    logger.info('🏛️  Starting "The Bulgaria Tax" Execution Simulator...');
    // Connect to NATS (using shared client wrapper pattern if needed, or direct)
    // But since we use getNatsClient(), it returns the singleton wrapper.
    const natsUrl = process.env.NATS_URL || "nats://localhost:4222";
    await nc.connect({
        servers: [natsUrl],
        user: process.env.NATS_USER,
        pass: process.env.NATS_PASS,
    });
    logger.info(`✅ Connected to NATS at ${natsUrl}`);

    // Subscribe to placement commands
    await nc.subscribe(
        TITAN_SUBJECTS.CMD.EXECUTION.ALL,
        async (data: any, _subject: string) => {
            try {
                const payload = data;
                logger.info(
                    `\n📩 Received Order: ${payload.symbol} ${payload.type} Size: ${payload.size}`,
                );

                // Simulate Latency (The "Bulgaria" routing delay)
                const latency = Math.floor(Math.random() * 200) + 50; // 50-250ms
                await new Promise((r) => setTimeout(r, latency));

                // 2. Publish Fill Confirmation
                // We mock a full fill at entry price (slippage later?)
                const fillPrice = payload.entry_zone?.[0] || 1000; // Mock price if market
                const fillPayload = {
                    signalId: payload.signal_id,
                    orderId: `ord_${Date.now()}_${
                        Math.random().toString(36).substring(7)
                    }`,
                    symbol: payload.symbol,
                    side: payload.direction === 1 ? "BUY" : "SELL",
                    fillPrice: fillPrice,
                    fillSize: payload.size,
                    requestedSize: payload.size,
                    timestamp: Date.now(),
                    fees: payload.size * 0.001, // 0.1% fee
                    slippage: 0,
                };

                // Let's assume standard event subject:
                // titan.execution.fill
                // Using canonical subject via strict string construction or TitanSubject import (todo)
                const subject = ["titan", "evt", "exec", "fill", "v1"].join(
                    ".",
                );
                nc.publish(subject, fillPayload);

                logger.info(
                    `✅ Filled ${payload.symbol}: ${fillPayload.fillSize} @ ${fillPayload.fillPrice} (Latency: ${latency}ms)`,
                );
            } catch (err) {
                logger.error("❌ Error processing message:", err);
            }
        },
    );

    logger.info(
        `🎧 Listening for execution commands on ${TITAN_SUBJECTS.CMD.EXECUTION.ALL}`,
    );
}

main().catch(console.error);
