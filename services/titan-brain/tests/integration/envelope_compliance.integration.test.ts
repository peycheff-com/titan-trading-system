import {
    AIOptimizationRequest,
    getNatsPublisher,
} from "../../src/server/NatsPublisher";
import { EnvelopeSchema, getNatsClient, TitanSubject } from "@titan/shared";

describe("Titan Brain Envelope Compliance", () => {
    const nats = getNatsClient();
    const publisher = getNatsPublisher();

    beforeAll(async () => {
        // Assuming NATS is running in docker
        await nats.connect({
            servers: [process.env.NATS_URL || "nats://localhost:4222"],
        });
        await publisher.connect();
    });

    afterAll(async () => {
        await publisher.close();
        if (nats.isConnected()) {
            await nats.close();
        }
    });

    it(
        "should publish AI Optimization requests wrapped in a valid Envelope",
        async () => {
            const receivedPromise = new Promise<void>((resolve, reject) => {
                nats.subscribe(
                    TitanSubject.AI_OPTIMIZATION_REQUESTS,
                    (data: any, subject) => {
                        try {
                            console.log("Received data:", data);
                            const parsed = EnvelopeSchema.parse(data);

                            // Assertions on the FLAT Envelope structure
                            expect(parsed.type).toBe(
                                "titan.control.ai.optimize.v1",
                            );
                            expect(parsed.version).toBe(1);
                            expect(parsed.producer).toBe("titan-brain");
                            expect(parsed.id).toEqual(expect.any(String)); // Should have a ULID
                            expect(parsed.ts).toEqual(expect.any(Number));

                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    },
                );
            });

            const request: AIOptimizationRequest = {
                reason: "Integration Test",
                triggeredBy: "jest",
                timestamp: Date.now(),
                metrics: {
                    sharpeRatio: 3.0,
                },
            };

            await publisher.triggerAIOptimization(request);

            // Wait for message with timeout
            await expect(receivedPromise).resolves.not.toThrow();
        },
        10000,
    );
});
