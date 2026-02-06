/**
 * Symbol Normalization - Canonical symbol format for Titan
 *
 * Titan Internal Format Standard:
 * - Spot:    BASE/QUOTE           (e.g., BTC/USDT)
 * - Perp:    BASE/QUOTE:PERP      (e.g., BTC/USDT:PERP)
 * - Future:  BASE/QUOTE:YYYYMMDD  (e.g., BTC/USDT:20260315)
 * - Option:  BASE/QUOTE:YYYYMMDD-STRIKE-C/P (e.g., BTC/USDT:20260315-80000-C)
 */
import { InstrumentType, VenueId } from '../types/venues.js';
/**
 * Result of symbol normalization
 */
export interface NormalizedSymbol {
    /** Normalized Titan symbol */
    symbol: string;
    /** Base asset */
    base: string;
    /** Quote asset */
    quote: string;
    /** Instrument type */
    type: InstrumentType;
    /** Expiry date (YYYYMMDD) for futures/options */
    expiry?: string;
    /** Strike price for options */
    strike?: string;
    /** Option type: C (call) or P (put) */
    optionType?: 'C' | 'P';
}
/**
 * Normalize a raw exchange symbol to Titan canonical format
 */
export declare function normalizeSymbol(venue: VenueId, rawSymbol: string, instrumentType: InstrumentType): NormalizedSymbol;
/**
 * Inverse of normalize - convert Titan symbol to exchange-specific format
 */
export declare function denormalizeSymbol(venue: VenueId, titanSymbol: string): string;
//# sourceMappingURL=symbol-normalization.d.ts.map