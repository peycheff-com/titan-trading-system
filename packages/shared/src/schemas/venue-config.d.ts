/**
 * VenueConfigV1 - Dynamic venue configuration schema
 *
 * Stored in NATS KV (titan-config) to allow runtime tuning of
 * venue-specific parameters like staleness thresholds.
 */
import { z } from 'zod';
/**
 * VenueConfigV1 Zod Schema
 */
export declare const VenueConfigV1Schema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    venue: z.ZodNativeEnum<{
        readonly BINANCE: "binance";
        readonly BYBIT: "bybit";
        readonly COINBASE: "coinbase";
        readonly KRAKEN: "kraken";
        readonly MEXC: "mexc";
        readonly HYPERLIQUID: "hyperliquid";
        readonly DERIBIT: "deribit";
    }>;
    staleness_threshold_ms: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    venue: "binance" | "bybit" | "mexc" | "coinbase" | "kraken" | "hyperliquid" | "deribit";
    v: 1;
    staleness_threshold_ms?: number | undefined;
}, {
    venue: "binance" | "bybit" | "mexc" | "coinbase" | "kraken" | "hyperliquid" | "deribit";
    v: 1;
    staleness_threshold_ms?: number | undefined;
}>;
export type VenueConfigV1 = z.infer<typeof VenueConfigV1Schema>;
/**
 * Safe parse helper
 */
export declare function safeParseVenueConfigV1(data: unknown): z.SafeParseReturnType<unknown, VenueConfigV1>;
//# sourceMappingURL=venue-config.d.ts.map