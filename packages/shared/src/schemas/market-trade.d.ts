/**
 * MarketTradeV1 - Normalized trade event schema
 *
 * Published by Hunter from all venue WebSocket feeds.
 * Used for market data aggregation, analytics, and downstream consumers.
 */
import { z } from 'zod';
/**
 * Taker side of the trade
 */
export declare const TakerSideSchema: z.ZodEnum<["buy", "sell", "unknown"]>;
export type TakerSide = z.infer<typeof TakerSideSchema>;
/**
 * MarketTradeV1 Zod Schema
 *
 * Canonical normalized trade event format across all venues.
 */
export declare const MarketTradeV1Schema: z.ZodObject<{
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
    raw_symbol: z.ZodString;
    exchange_ts: z.ZodNumber;
    price: z.ZodString;
    size: z.ZodString;
    taker_side: z.ZodEnum<["buy", "sell", "unknown"]>;
    trade_id: z.ZodOptional<z.ZodString>;
    instrument_type: z.ZodNativeEnum<{
        readonly SPOT: "spot";
        readonly PERP: "perp";
        readonly FUTURE: "future";
        readonly OPTION: "option";
    }>;
    quote_asset: z.ZodOptional<z.ZodString>;
    base_asset: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    symbol: string;
    ts: string;
    size: string;
    venue: "binance" | "bybit" | "mexc" | "coinbase" | "kraken" | "hyperliquid" | "deribit";
    v: 1;
    raw_symbol: string;
    exchange_ts: number;
    price: string;
    taker_side: "unknown" | "buy" | "sell";
    instrument_type: "spot" | "perp" | "future" | "option";
    trade_id?: string | undefined;
    quote_asset?: string | undefined;
    base_asset?: string | undefined;
}, {
    symbol: string;
    ts: string;
    size: string;
    venue: "binance" | "bybit" | "mexc" | "coinbase" | "kraken" | "hyperliquid" | "deribit";
    v: 1;
    raw_symbol: string;
    exchange_ts: number;
    price: string;
    taker_side: "unknown" | "buy" | "sell";
    instrument_type: "spot" | "perp" | "future" | "option";
    trade_id?: string | undefined;
    quote_asset?: string | undefined;
    base_asset?: string | undefined;
}>;
export type MarketTradeV1 = z.infer<typeof MarketTradeV1Schema>;
/**
 * Parse and validate a MarketTradeV1 message
 * @throws ZodError if validation fails
 */
export declare function parseMarketTradeV1(data: unknown): MarketTradeV1;
/**
 * Safe parse that returns success/error result
 */
export declare function safeParseMarketTradeV1(data: unknown): z.SafeParseReturnType<unknown, MarketTradeV1>;
//# sourceMappingURL=market-trade.d.ts.map