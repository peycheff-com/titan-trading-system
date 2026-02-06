/**
 * OrderBookDeltaV1 - Market Depth Data Schema
 *
 * Represents incremental or snapshot updates to an orderbook.
 * Consumed by Brain for strategy execution and Sentinel for risk checks.
 */
import { z } from 'zod';
/**
 * OrderBookDeltaV1 Zod Schema
 */
export declare const OrderBookDeltaV1Schema: z.ZodObject<{
    v: z.ZodLiteral<1>;
    ts: z.ZodString;
    venue: z.ZodNativeEnum<{
        readonly BINANCE: "binance";
        readonly BYBIT: "bybit";
        readonly COINBASE: "coinbase";
        readonly KRAKEN: "kraken";
        readonly MEXC: "mexc";
        readonly HYPERLIQUID: "hyperliquid";
        readonly DERIBIT: "deribit";
    }>;
    symbol: z.ZodString;
    bids: z.ZodArray<z.ZodTuple<[z.ZodString, z.ZodString], null>, "many">;
    asks: z.ZodArray<z.ZodTuple<[z.ZodString, z.ZodString], null>, "many">;
    sequence: z.ZodNumber;
    is_snapshot: z.ZodBoolean;
    meta: z.ZodObject<{
        hunter_instance_id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        hunter_instance_id: string;
    }, {
        hunter_instance_id: string;
    }>;
}, "strict", z.ZodTypeAny, {
    symbol: string;
    ts: string;
    venue: "binance" | "bybit" | "mexc" | "coinbase" | "kraken" | "hyperliquid" | "deribit";
    v: 1;
    meta: {
        hunter_instance_id: string;
    };
    bids: [string, string][];
    asks: [string, string][];
    sequence: number;
    is_snapshot: boolean;
}, {
    symbol: string;
    ts: string;
    venue: "binance" | "bybit" | "mexc" | "coinbase" | "kraken" | "hyperliquid" | "deribit";
    v: 1;
    meta: {
        hunter_instance_id: string;
    };
    bids: [string, string][];
    asks: [string, string][];
    sequence: number;
    is_snapshot: boolean;
}>;
export type OrderBookDeltaV1 = z.infer<typeof OrderBookDeltaV1Schema>;
/**
 * Safe parse helper
 */
export declare function safeParseOrderBookDeltaV1(data: unknown): z.SafeParseReturnType<unknown, OrderBookDeltaV1>;
//# sourceMappingURL=orderbook.d.ts.map