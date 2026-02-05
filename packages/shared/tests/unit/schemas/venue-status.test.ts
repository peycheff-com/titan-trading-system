/**
 * VenueStatusV1 Schema Tests
 *
 * Validates the venue telemetry schema and utility functions.
 */
import {
    calculateStaleness,
    deriveRecommendedAction,
    parseVenueStatusV1,
    safeParseVenueStatusV1,
} from "../../../src/schemas/venue-status";
import {
    VenueId,
    VenueRecommendedAction,
    VenueWsState,
} from "../../../src/types/venues";

describe("VenueStatusV1Schema", () => {
    const validStatus = {
        v: 1 as const,
        ts: "2026-02-05T18:00:00.000Z",
        venue: VenueId.BINANCE,
        capabilities: {
            spot: true,
            perps: true,
            futures: true,
            options: false,
            dex: false,
            enabled: true,
        },
        ws: {
            state: VenueWsState.CONNECTED,
            url: "wss://stream.binance.com:9443/ws",
            since_ts: "2026-02-05T17:00:00.000Z",
            last_msg_ts: "2026-02-05T17:59:59.000Z",
            last_trade_ts: "2026-02-05T17:59:58.000Z",
            ping_rtt_ms: 45,
            reconnects_15m: 0,
            parse_errors_5m: 0,
        },
        meta: {
            hunter_instance_id: "hunter-abc123",
            build_sha: "v1.2.3",
        },
    };

    describe("parseVenueStatusV1", () => {
        it("should parse valid status", () => {
            const result = parseVenueStatusV1(validStatus);
            expect(result.v).toBe(1);
            expect(result.venue).toBe(VenueId.BINANCE);
            expect(result.ws.state).toBe(VenueWsState.CONNECTED);
        });

        it("should reject invalid version", () => {
            expect(() => parseVenueStatusV1({ ...validStatus, v: 2 }))
                .toThrow();
        });

        it("should reject unknown venue", () => {
            expect(() =>
                parseVenueStatusV1({ ...validStatus, venue: "unknown" })
            ).toThrow();
        });

        it("should reject invalid ws state", () => {
            expect(() =>
                parseVenueStatusV1({
                    ...validStatus,
                    ws: { ...validStatus.ws, state: "invalid" },
                })
            ).toThrow();
        });

        it("should allow null timestamps", () => {
            const statusWithNulls = {
                ...validStatus,
                ws: {
                    ...validStatus.ws,
                    since_ts: null,
                    last_msg_ts: null,
                    last_trade_ts: null,
                    ping_rtt_ms: null,
                },
            };
            const result = parseVenueStatusV1(statusWithNulls);
            expect(result.ws.since_ts).toBeNull();
            expect(result.ws.last_msg_ts).toBeNull();
        });

        it("should reject extra unknown fields in strict mode", () => {
            expect(() =>
                parseVenueStatusV1({
                    ...validStatus,
                    unknownField: "should fail",
                })
            ).toThrow();
        });
    });

    describe("safeParseVenueStatusV1", () => {
        it("should return success for valid status", () => {
            const result = safeParseVenueStatusV1(validStatus);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.venue).toBe(VenueId.BINANCE);
            }
        });

        it("should return error for invalid status", () => {
            const result = safeParseVenueStatusV1({ v: "wrong" });
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error).toBeDefined();
            }
        });
    });

    describe("calculateStaleness", () => {
        it("should calculate staleness from last_msg_ts", () => {
            const now = Date.now();
            const fiveSecondsAgo = new Date(now - 5000).toISOString();
            const status = {
                ...validStatus,
                ts: new Date(now).toISOString(),
                ws: { ...validStatus.ws, last_msg_ts: fiveSecondsAgo },
            };

            const result = calculateStaleness(status, now);
            expect(result.staleness_ms).toBeCloseTo(5000, -2); // Within 100ms
            expect(result.stale).toBe(false); // 5s < 5s threshold
        });

        it("should mark as stale when message is old", () => {
            const now = Date.now();
            const tenSecondsAgo = new Date(now - 10000).toISOString();
            const status = {
                ...validStatus,
                ts: new Date(now).toISOString(),
                ws: { ...validStatus.ws, last_msg_ts: tenSecondsAgo },
            };

            const result = calculateStaleness(status, now);
            expect(result.stale).toBe(true); // 10s > 5s threshold
        });
    });

    describe("deriveRecommendedAction", () => {
        it("should return ALLOCATE for connected and fresh", () => {
            expect(deriveRecommendedAction(VenueWsState.CONNECTED, false)).toBe(
                VenueRecommendedAction.ALLOCATE,
            );
        });

        it("should return THROTTLE for degraded", () => {
            expect(deriveRecommendedAction(VenueWsState.DEGRADED, false)).toBe(
                VenueRecommendedAction.THROTTLE,
            );
        });

        it("should return HALT for disconnected", () => {
            expect(deriveRecommendedAction(VenueWsState.DISCONNECTED, false))
                .toBe(
                    VenueRecommendedAction.HALT,
                );
        });

        it("should return HALT when stale even if connected", () => {
            expect(deriveRecommendedAction(VenueWsState.CONNECTED, true)).toBe(
                VenueRecommendedAction.HALT,
            );
        });
    });
});

describe("VenueId enum", () => {
    it("should have all expected venues", () => {
        expect(VenueId.BINANCE).toBe("binance");
        expect(VenueId.BYBIT).toBe("bybit");
        expect(VenueId.COINBASE).toBe("coinbase");
        expect(VenueId.KRAKEN).toBe("kraken");
        expect(VenueId.MEXC).toBe("mexc");
        expect(VenueId.HYPERLIQUID).toBe("hyperliquid");
        expect(VenueId.DERIBIT).toBe("deribit");
    });
});

describe("VenueWsState enum", () => {
    it("should have all expected states", () => {
        expect(VenueWsState.CONNECTED).toBe("connected");
        expect(VenueWsState.DEGRADED).toBe("degraded");
        expect(VenueWsState.DISCONNECTED).toBe("disconnected");
    });
});
