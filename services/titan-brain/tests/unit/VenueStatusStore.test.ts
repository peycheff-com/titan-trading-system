import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VenueStatusStore } from "../../src/services/venues/VenueStatusStore.js";
import {
    VenueId,
    VenueRecommendedAction,
    VenueStatusV1,
    VenueWsState,
} from "@titan/shared";
import { EventEmitter } from "events";

// Mock dependencies
const mockNats = {
    isConnected: vi.fn(),
    connect: vi.fn(),
    subscribe: vi.fn(),
    kvWatch: vi.fn(),
    kvKeys: vi.fn(),
    kvGet: vi.fn(),
};

vi.mock("@titan/shared", async () => {
    const actual = await vi.importActual("@titan/shared");
    return {
        ...actual,
        getNatsClient: () => mockNats,
        TITAN_KV_BUCKETS: {
            CONFIG: { bucket: "titan-config" },
            VENUE_STATUS: { bucket: "titan-venue-status" },
        },
        // Mock the new parser since it might not be in the built artifact yet
        safeParseVenueConfigV1: (data: any) => ({ success: true, data }),
    };
});

describe("VenueStatusStore Configurable Staleness", () => {
    let store: VenueStatusStore;
    const now = new Date("2026-02-05T12:00:00Z");

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(now);
        mockNats.isConnected.mockReturnValue(true);
        mockNats.kvWatch.mockResolvedValue(undefined);
        store = new VenueStatusStore({ staleThresholdMs: 5000 }); // 5s default
    });

    afterEach(() => {
        store.stop();
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it("should use default threshold when no config exists", () => {
        const status: VenueStatusV1 = {
            v: 1,
            ts: now.toISOString(),
            venue: VenueId.BINANCE,
            capabilities: {
                spot: true,
                perps: true,
                futures: false,
                options: false,
                enabled: true,
            },
            ws: {
                state: VenueWsState.CONNECTED,
                url: "wss://stream.binance.com",
                since_ts: now.toISOString(),
                last_msg_ts: now.toISOString(),
                last_trade_ts: null,
                ping_rtt_ms: 50,
                reconnects_15m: 0,
                parse_errors_5m: 0,
            },
            meta: { hunter_instance_id: "test", build_sha: "abc" },
        };

        // Initialize with data
        (store as any).handleMessage(status);

        const venueStatus = store.getVenueStatus(VenueId.BINANCE);
        expect(venueStatus).toBeDefined();
        expect(venueStatus?.effectiveThresholdMs).toBe(5000);
        expect(venueStatus?.isStale).toBe(false);

        // fast forward 6s (stale)
        vi.advanceTimersByTime(6000);
        const staleStatus = store.getVenueStatus(VenueId.BINANCE);
        expect(staleStatus?.isStale).toBe(true);
    });

    it("should apply custom threshold from KV config", async () => {
        await store.start();

        // simulate KV config update callback
        const watchCallback = mockNats.kvWatch.mock.calls[0][2];
        await watchCallback("config.venue.binance", {
            staleness_threshold_ms: 10000,
        }, "PUT");

        const status: VenueStatusV1 = {
            v: 1,
            ts: now.toISOString(),
            venue: VenueId.BINANCE,
            capabilities: {
                spot: true,
                perps: true,
                futures: false,
                options: false,
                enabled: true,
            },
            ws: {
                state: VenueWsState.CONNECTED,
                url: "wss://stream.binance.com",
                since_ts: now.toISOString(),
                last_msg_ts: now.toISOString(),
                last_trade_ts: null,
                ping_rtt_ms: 50,
                reconnects_15m: 0,
                parse_errors_5m: 0,
            },
            meta: { hunter_instance_id: "test", build_sha: "abc" },
        };

        // Initialize with data
        (store as any).handleMessage(status);

        const venueStatus = store.getVenueStatus(VenueId.BINANCE);
        expect(venueStatus?.effectiveThresholdMs).toBe(10000); // Updated threshold

        // fast forward 6s (should NOT be stale yet, limit is 10s)
        vi.advanceTimersByTime(6000);
        const notStaleStatus = store.getVenueStatus(VenueId.BINANCE);
        expect(notStaleStatus?.isStale).toBe(false);

        // fast forward another 5s (total 11s) -> Stale
        vi.advanceTimersByTime(5000);
        const staleStatus = store.getVenueStatus(VenueId.BINANCE);
        expect(staleStatus?.isStale).toBe(true);
    });

    it("should revert to default if config is deleted", async () => {
        await store.start();
        const watchCallback = mockNats.kvWatch.mock.calls[0][2];

        // Set custom config
        await watchCallback("config.venue.binance", {
            staleness_threshold_ms: 10000,
        }, "PUT");

        const status: VenueStatusV1 = {
            v: 1,
            ts: now.toISOString(),
            venue: VenueId.BINANCE,
            capabilities: {
                spot: true,
                perps: true,
                futures: false,
                options: false,
                enabled: true,
            },
            ws: {
                state: VenueWsState.CONNECTED,
                url: "wss://stream.binance.com",
                since_ts: now.toISOString(),
                last_msg_ts: now.toISOString(),
                last_trade_ts: null,
                ping_rtt_ms: 50,
                reconnects_15m: 0,
                parse_errors_5m: 0,
            },
            meta: { hunter_instance_id: "test", build_sha: "abc" },
        };
        (store as any).handleMessage(status);

        expect(store.getVenueStatus(VenueId.BINANCE)?.effectiveThresholdMs)
            .toBe(10000);

        // Delete config
        await watchCallback("config.venue.binance", null, "DEL");

        expect(store.getVenueStatus(VenueId.BINANCE)?.effectiveThresholdMs)
            .toBe(5000);
    });
});
