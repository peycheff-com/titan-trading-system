/**
 * NATS Flow Integration Tests
 *
 * Tests the end-to-end venue status telemetry flow via NATS JetStream.
 * Requires: docker compose -f docker-compose.test.yml up -d
 *
 * @group integration
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    connect,
    JetStreamClient,
    JetStreamManager,
    NatsConnection,
} from "nats";
import {
    VenueStatusV1,
    VenueStatusV1Schema,
} from "../../src/schemas/venue-status.js";
import { VenueId } from "../../src/types/venues.js";

const NATS_URL = process.env.NATS_URL || "nats://localhost:4222";
const TEST_TIMEOUT = 30000;

describe("NATS Venue Status Flow", () => {
    let nc: NatsConnection;
    let js: JetStreamClient;
    let jsm: JetStreamManager;

    beforeAll(async () => {
        try {
            nc = await connect({ servers: NATS_URL });
            js = nc.jetstream();
            jsm = await nc.jetstreamManager();

            // Ensure stream exists
            try {
                await jsm.streams.add({
                    name: "TITAN_VENUE_STATUS_TEST",
                    subjects: ["titan.test.venues.status.v1"],
                    retention: "limits" as any,
                    max_age: 60_000_000_000, // 1 minute in nanoseconds
                    storage: "memory" as any,
                });
            } catch (err: any) {
                if (!err.message?.includes("already in use")) throw err;
            }
        } catch (err) {
            console.warn("NATS not available, skipping integration tests");
            throw err;
        }
    }, TEST_TIMEOUT);

    afterAll(async () => {
        if (jsm) {
            try {
                await jsm.streams.delete("TITAN_VENUE_STATUS_TEST");
            } catch {
                // Ignore cleanup errors
            }
        }
        if (nc) {
            await nc.drain();
        }
    });

    it("should publish and consume VenueStatusV1 messages", async () => {
        const testStatus: VenueStatusV1 = {
            v: 1,
            venue: VenueId.BINANCE,
            ts: new Date().toISOString(),
            capabilities: {
                spot: true,
                perps: true,
                futures: true,
                options: false,
                enabled: true,
            },
            ws: {
                state: "connected",
                url: "wss://test.venue.com",
                since_ts: new Date(Date.now() - 10000).toISOString(),
                last_msg_ts: new Date().toISOString(),
                last_trade_ts: new Date().toISOString(),
                ping_rtt_ms: 15,
                reconnects_15m: 0,
                parse_errors_5m: 0,
            },
            meta: {
                hunter_instance_id: "test-hunter",
            },
        };

        // Validate schema
        const validated = VenueStatusV1Schema.parse(testStatus);
        expect(validated.venue).toBe("binance");

        // Publish to JetStream
        const pubAck = await js.publish(
            "titan.test.venues.status.v1",
            JSON.stringify(validated),
        );
        expect(pubAck.seq).toBeGreaterThan(0);

        // Consume using pull consumer
        const consumer = await jsm.consumers.add("TITAN_VENUE_STATUS_TEST", {
            durable_name: "test-consumer",
            ack_policy: "explicit" as any,
        });

        const sub = await js.consumers.get(
            "TITAN_VENUE_STATUS_TEST",
            "test-consumer",
        );
        const messages = await sub.fetch({ max_messages: 1, expires: 5000 });

        let receivedCount = 0;
        for await (const msg of messages) {
            const data = JSON.parse(msg.string());
            expect(data.venue).toBe("binance");
            expect(data.ws.state).toBe("connected");
            msg.ack();
            receivedCount++;
        }

        expect(receivedCount).toBe(1);

        // Cleanup consumer
        await jsm.consumers.delete("TITAN_VENUE_STATUS_TEST", "test-consumer");
    }, TEST_TIMEOUT);

    it("should reject invalid VenueStatusV1 messages", () => {
        const invalidStatus = {
            venue: "invalid_venue",
            ws: { state: "UNKNOWN" },
            ts: "not-a-date",
        };

        expect(() => VenueStatusV1Schema.parse(invalidStatus)).toThrow();
    });

    it("should handle multiple venues in parallel", async () => {
        const venues = [VenueId.BINANCE, VenueId.BYBIT, VenueId.KRAKEN];
        const publishPromises = venues.map((venue) => {
            const status: VenueStatusV1 = {
                v: 1,
                venue,
                ts: new Date().toISOString(),
                capabilities: {
                    spot: true,
                    perps: true,
                    futures: true,
                    options: false,
                    enabled: true,
                },
                ws: {
                    state: "connected",
                    url: `wss://${venue}.test.com`,
                    since_ts: new Date(Date.now() - 10000).toISOString(),
                    last_msg_ts: new Date().toISOString(),
                    last_trade_ts: new Date().toISOString(),
                    ping_rtt_ms: 15,
                    reconnects_15m: 0,
                    parse_errors_5m: 0,
                },
                meta: {
                    hunter_instance_id: "test-hunter",
                },
            };
            return js.publish(
                "titan.test.venues.status.v1",
                JSON.stringify(status),
            );
        });

        const acks = await Promise.all(publishPromises);
        expect(acks.every((ack) => ack.seq > 0)).toBe(true);
    }, TEST_TIMEOUT);
});
