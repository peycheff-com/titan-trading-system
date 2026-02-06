/**
 * Canonical Venue Registry - Single Source of Truth
 *
 * Defines venue identifiers and capabilities used by Hunter (telemetry producer)
 * and Brain (telemetry consumer). No dual-truth: both services import from here.
 */
/**
 * Supported exchange/venue identifiers
 */
export declare const VenueId: {
    readonly BINANCE: "binance";
    readonly BYBIT: "bybit";
    readonly COINBASE: "coinbase";
    readonly KRAKEN: "kraken";
    readonly MEXC: "mexc";
    readonly HYPERLIQUID: "hyperliquid";
    readonly DERIBIT: "deribit";
};
export type VenueId = (typeof VenueId)[keyof typeof VenueId];
/**
 * All venue IDs as an array for iteration
 */
export declare const ALL_VENUE_IDS: readonly VenueId[];
/**
 * Capabilities per venue
 */
export interface VenueCapabilities {
    readonly spot: boolean;
    readonly perps: boolean;
    readonly futures: boolean;
    readonly options: boolean;
    readonly dex?: boolean;
    readonly enabled: boolean;
}
/**
 * Canonical venue capabilities registry
 */
export declare const VENUE_CAPABILITIES: Record<VenueId, VenueCapabilities>;
/**
 * WebSocket connection state
 */
export declare const VenueWsState: {
    readonly CONNECTED: "connected";
    readonly DEGRADED: "degraded";
    readonly DISCONNECTED: "disconnected";
};
export type VenueWsState = (typeof VenueWsState)[keyof typeof VenueWsState];
/**
 * Recommended action based on venue health
 */
export declare const VenueRecommendedAction: {
    readonly ALLOCATE: "allocate";
    readonly THROTTLE: "throttle";
    readonly HALT: "halt";
};
export type VenueRecommendedAction = (typeof VenueRecommendedAction)[keyof typeof VenueRecommendedAction];
/**
 * Instrument types supported across venues
 */
export declare const InstrumentType: {
    readonly SPOT: "spot";
    readonly PERP: "perp";
    readonly FUTURE: "future";
    readonly OPTION: "option";
};
export type InstrumentType = (typeof InstrumentType)[keyof typeof InstrumentType];
/**
 * Staleness thresholds (ms) - can be per-venue if needed
 */
export declare const DEFAULT_STALE_THRESHOLD_MS = 5000;
//# sourceMappingURL=venues.d.ts.map