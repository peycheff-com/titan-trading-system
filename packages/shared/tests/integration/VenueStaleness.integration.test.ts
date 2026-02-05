/**
 * Venue Staleness Integration Tests
 *
 * Tests staleness detection and health status propagation.
 * Requires: docker compose -f docker-compose.test.yml up -d
 *
 * @group integration
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
    connect,
    JetStreamClient,
    JetStreamManager,
    NatsConnection,
} from "nats";
import { VenueStatusV1 } from "../../src/schemas/venue-status.js";
import { VenueId } from "../../src/types/venues.js";

const NATS_URL = process.env.NATS_URL || "nats://localhost:4222";
const TEST_TIMEOUT = 30000;
const STALENESS_THRESHOLD_MS = 5000;

describe("Venue Staleness Detection", () => {
    let nc: NatsConnection;
    let js: JetStreamClient;
    let jsm: JetStreamManager;

    beforeAll(async () => {
        try {
            nc = await connect({ servers: NATS_URL });
            js = nc.jetstream();
            jsm = await nc.jetstreamManager();

            try {
                await jsm.streams.add({
                    name: "TITAN_STALENESS_TEST",
                    subjects: ["titan.test.staleness.v1"],
                    retention: "limits" as any,
                    max_age: 60_000_000_000,
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
                await jsm.streams.delete("TITAN_STALENESS_TEST");
            } catch {
                // Ignore cleanup errors
            }
        }
        if (nc) {
            await nc.drain();
        }
    });

    /**
     * Helper to check if a venue status is stale
     */
    function isStale(
        status: VenueStatusV1,
        thresholdMs: number = STALENESS_THRESHOLD_MS,
    ): boolean {
        const lastMsgTs = status.ws.last_msg_ts
            ? new Date(status.ws.last_msg_ts).getTime()
            : new Date(status.ts).getTime();
        const age = Date.now() - lastMsgTs;
        return age > thresholdMs;
    }

    it("should detect freshness when lastMessageTime is recent", () => {
        const freshStatus: VenueStatusV1 = {
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
                last_msg_ts: new Date(Date.now() - 1000).toISOString(), // 1 second ago
                last_trade_ts: new Date().toISOString(),
                ping_rtt_ms: 15,
                reconnects_15m: 0,
                parse_errors_5m: 0,
            },
            meta: { hunter_instance_id: "test" },
        };

        expect(isStale(freshStatus)).toBe(false);
    });

    it("should detect staleness when lastMessageTime exceeds threshold", () => {
        const staleStatus: VenueStatusV1 = {
            v: 1,
            venue: VenueId.BINANCE,
            ts: new Date(Date.now() - 10000).toISOString(),
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
                since_ts: new Date(Date.now() - 20000).toISOString(),
                last_msg_ts: new Date(Date.now() - 10000).toISOString(), // 10s ago
                last_trade_ts: new Date().toISOString(),
                ping_rtt_ms: 15,
                reconnects_15m: 0,
                parse_errors_5m: 0,
            },
            meta: { hunter_instance_id: "test" },
        };

        expect(isStale(staleStatus)).toBe(true);
    });

    it("should track multiple venues independently", () => {
        const now = Date.now();
        const venues: VenueStatusV1[] = [
            {
                v: 1,
                venue: VenueId.BINANCE,
                ts: new Date(now).toISOString(),
                capabilities: {
                    spot: true,
                    perps: true,
                    futures: true,
                    options: false,
                    enabled: true,
                },
                ws: {
                    state: "connected",
                    url: "wss://binance.com",
                    since_ts: new Date(now - 10000).toISOString(),
                    last_msg_ts: new Date(now - 1000).toISOString(), // Fresh
                    last_trade_ts: new Date(now).toISOString(),
                    ping_rtt_ms: 10,
                    reconnects_15m: 0,
                    parse_errors_5m: 0,
                },
                meta: { hunter_instance_id: "test" },
            },
            {
                v: 1,
                venue: VenueId.BYBIT,
                ts: new Date(now).toISOString(),
                capabilities: {
                    spot: true,
                    perps: true,
                    futures: true,
                    options: false,
                    enabled: true,
                },
                ws: {
                    state: "connected",
                    url: "wss://bybit.com",
                    since_ts: new Date(now - 20000).toISOString(),
                    last_msg_ts: new Date(now - 10000).toISOString(), // Stale
                    last_trade_ts: new Date(now - 10000).toISOString(),
                    ping_rtt_ms: 20,
                    reconnects_15m: 0,
                    parse_errors_5m: 0,
                },
                meta: { hunter_instance_id: "test" },
            },
            {
                v: 1,
                venue: VenueId.KRAKEN,
                ts: new Date(now).toISOString(),
                capabilities: {
                    spot: true,
                    perps: true,
                    futures: true,
                    options: false,
                    enabled: true,
                },
                ws: {
                    state: "degraded",
                    url: "wss://kraken.com",
                    since_ts: new Date(now - 3000).toISOString(),
                    last_msg_ts: new Date(now - 3000).toISOString(), // Fresh (< 5000ms)
                    last_trade_ts: new Date(now - 3000).toISOString(),
                    ping_rtt_ms: 100,
                    reconnects_15m: 1,
                    parse_errors_5m: 2,
                },
                meta: { hunter_instance_id: "test" },
            },
        ];

        const staleCount = venues.filter((v) => isStale(v)).length;
        const freshCount = venues.filter((v) => !isStale(v)).length;

        expect(staleCount).toBe(1); // Only Bybit is stale
        expect(freshCount).toBe(2);
    });

    it("should simulate staleness progression over time", async () => {
        vi.useFakeTimers();

        const status: VenueStatusV1 = {
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
                since_ts: new Date().toISOString(),
                last_msg_ts: new Date().toISOString(), // Now
                last_trade_ts: new Date().toISOString(),
                ping_rtt_ms: 15,
                reconnects_15m: 0,
                parse_errors_5m: 0,
            },
            meta: { hunter_instance_id: "test" },
        };

        // Initially fresh
        expect(isStale(status)).toBe(false);

        // Advance time past threshold
        vi.advanceTimersByTime(STALENESS_THRESHOLD_MS + 1000);

        // Now stale (current time increased, last_msg_ts stayed same)
        expect(isStale(status)).toBe(true);

        vi.useRealTimers();
    });

    it("should publish staleness events to NATS", async () => {
        const staleStatus: VenueStatusV1 = {
            v: 1,
            venue: VenueId.KRAKEN,
            ts: new Date(Date.now() - 60000).toISOString(),
            capabilities: {
                spot: true,
                perps: true,
                futures: true,
                options: false,
                enabled: true,
            },
            ws: {
                state: "disconnected",
                url: "wss://test.venue.com",
                since_ts: new Date(Date.now() - 70000).toISOString(),
                last_msg_ts: new Date(Date.now() - 60000).toISOString(),
                last_trade_ts: new Date(Date.now() - 60000).toISOString(),
                ping_rtt_ms: null,
                reconnects_15m: 5,
                parse_errors_5m: 0,
            },
            meta: { hunter_instance_id: "test" },
        };

        // Publish the stale status
        const pubAck = await js.publish(
            "titan.test.staleness.v1",
            JSON.stringify({ ...staleStatus, stale: true }),
        );

        expect(pubAck.seq).toBeGreaterThan(0);
    }, TEST_TIMEOUT);
});
