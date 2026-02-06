/**
 * VenueStatusV1 - Venue telemetry event schema
 *
 * Published by Hunter, consumed by Brain for VenuesController.
 * Uses Zod for runtime validation at edges.
 */
import { z } from 'zod';
import { VenueRecommendedAction, VenueWsState } from '../types/venues.js';
/**
 * VenueStatusV1 Zod Schema
 */
export declare const VenueStatusV1Schema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    ts: z.ZodString;
    venue: z.ZodEnum<["binance", "bybit", "coinbase", "kraken", "mexc", "hyperliquid", "deribit"]>;
    capabilities: z.ZodObject<{
        spot: z.ZodBoolean;
        perps: z.ZodBoolean;
        futures: z.ZodBoolean;
        options: z.ZodBoolean;
        dex: z.ZodOptional<z.ZodBoolean>;
        enabled: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        options: boolean;
        spot: boolean;
        perps: boolean;
        futures: boolean;
        dex?: boolean | undefined;
    }, {
        enabled: boolean;
        options: boolean;
        spot: boolean;
        perps: boolean;
        futures: boolean;
        dex?: boolean | undefined;
    }>;
    ws: z.ZodObject<{
        state: z.ZodEnum<["connected", "degraded", "disconnected"]>;
        url: z.ZodString;
        since_ts: z.ZodNullable<z.ZodString>;
        last_msg_ts: z.ZodNullable<z.ZodString>;
        last_trade_ts: z.ZodNullable<z.ZodString>;
        ping_rtt_ms: z.ZodNullable<z.ZodNumber>;
        reconnects_15m: z.ZodNumber;
        parse_errors_5m: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        url: string;
        state: "disconnected" | "connected" | "degraded";
        since_ts: string | null;
        last_msg_ts: string | null;
        last_trade_ts: string | null;
        ping_rtt_ms: number | null;
        reconnects_15m: number;
        parse_errors_5m: number;
    }, {
        url: string;
        state: "disconnected" | "connected" | "degraded";
        since_ts: string | null;
        last_msg_ts: string | null;
        last_trade_ts: string | null;
        ping_rtt_ms: number | null;
        reconnects_15m: number;
        parse_errors_5m: number;
    }>;
    meta: z.ZodObject<{
        hunter_instance_id: z.ZodString;
        build_sha: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        hunter_instance_id: string;
        build_sha?: string | undefined;
    }, {
        hunter_instance_id: string;
        build_sha?: string | undefined;
    }>;
}, "strict", z.ZodTypeAny, {
    ws: {
        url: string;
        state: "disconnected" | "connected" | "degraded";
        since_ts: string | null;
        last_msg_ts: string | null;
        last_trade_ts: string | null;
        ping_rtt_ms: number | null;
        reconnects_15m: number;
        parse_errors_5m: number;
    };
    ts: string;
    venue: "binance" | "bybit" | "mexc" | "coinbase" | "kraken" | "hyperliquid" | "deribit";
    v: 1;
    capabilities: {
        enabled: boolean;
        options: boolean;
        spot: boolean;
        perps: boolean;
        futures: boolean;
        dex?: boolean | undefined;
    };
    meta: {
        hunter_instance_id: string;
        build_sha?: string | undefined;
    };
}, {
    ws: {
        url: string;
        state: "disconnected" | "connected" | "degraded";
        since_ts: string | null;
        last_msg_ts: string | null;
        last_trade_ts: string | null;
        ping_rtt_ms: number | null;
        reconnects_15m: number;
        parse_errors_5m: number;
    };
    ts: string;
    venue: "binance" | "bybit" | "mexc" | "coinbase" | "kraken" | "hyperliquid" | "deribit";
    v: 1;
    capabilities: {
        enabled: boolean;
        options: boolean;
        spot: boolean;
        perps: boolean;
        futures: boolean;
        dex?: boolean | undefined;
    };
    meta: {
        hunter_instance_id: string;
        build_sha?: string | undefined;
    };
}>;
export type VenueStatusV1 = z.infer<typeof VenueStatusV1Schema>;
/**
 * Parse and validate VenueStatusV1
 * @throws ZodError if validation fails
 */
export declare function parseVenueStatusV1(data: unknown): VenueStatusV1;
/**
 * Safe parse that returns success/error result
 */
export declare function safeParseVenueStatusV1(data: unknown): z.SafeParseReturnType<unknown, VenueStatusV1>;
/**
 * Calculate staleness for a venue status
 */
export declare function calculateStaleness(status: VenueStatusV1, nowMs?: number): {
    staleness_ms: number;
    stale: boolean;
    threshold_ms: number;
};
/**
 * Derive recommended action from venue state and staleness
 */
export declare function deriveRecommendedAction(state: VenueWsState, stale: boolean): VenueRecommendedAction;
/**
 * NATS Subject for venue status events
 */
export declare const VENUE_STATUS_SUBJECT = "titan.data.venues.status.v1";
//# sourceMappingURL=venue-status.d.ts.map