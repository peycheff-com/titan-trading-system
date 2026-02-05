/**
 * Canonical Venue Registry - Single Source of Truth
 *
 * Defines venue identifiers and capabilities used by Hunter (telemetry producer)
 * and Brain (telemetry consumer). No dual-truth: both services import from here.
 */

/**
 * Supported exchange/venue identifiers
 */
export const VenueId = {
  BINANCE: 'binance',
  BYBIT: 'bybit',
  COINBASE: 'coinbase',
  KRAKEN: 'kraken',
  MEXC: 'mexc',
  HYPERLIQUID: 'hyperliquid',
  DERIBIT: 'deribit',
} as const;

export type VenueId = (typeof VenueId)[keyof typeof VenueId];

/**
 * All venue IDs as an array for iteration
 */
export const ALL_VENUE_IDS: readonly VenueId[] = Object.values(VenueId);

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
export const VENUE_CAPABILITIES: Record<VenueId, VenueCapabilities> = {
  binance: {
    spot: true,
    perps: true,
    futures: true,
    options: false,
    enabled: true,
  },
  bybit: {
    spot: true,
    perps: true,
    futures: true,
    options: false,
    enabled: true,
  },
  coinbase: {
    spot: true,
    perps: false,
    futures: false,
    options: false,
    enabled: true,
  },
  kraken: {
    spot: true,
    perps: true,
    futures: true,
    options: false,
    enabled: true,
  },
  mexc: {
    spot: true,
    perps: false,
    futures: false,
    options: false,
    enabled: true,
  },
  hyperliquid: {
    spot: false,
    perps: true,
    futures: false,
    options: false,
    dex: true,
    enabled: true,
  },
  deribit: {
    spot: false,
    perps: true,
    futures: false,
    options: true,
    enabled: false,
  }, // Options in progress
} as const;

/**
 * WebSocket connection state
 */
export const VenueWsState = {
  CONNECTED: 'connected',
  DEGRADED: 'degraded',
  DISCONNECTED: 'disconnected',
} as const;

export type VenueWsState = (typeof VenueWsState)[keyof typeof VenueWsState];

/**
 * Recommended action based on venue health
 */
export const VenueRecommendedAction = {
  ALLOCATE: 'allocate',
  THROTTLE: 'throttle',
  HALT: 'halt',
} as const;

export type VenueRecommendedAction =
  (typeof VenueRecommendedAction)[keyof typeof VenueRecommendedAction];

/**
 * Instrument types supported across venues
 */
export const InstrumentType = {
  SPOT: 'spot',
  PERP: 'perp',
  FUTURE: 'future',
  OPTION: 'option',
} as const;

export type InstrumentType = (typeof InstrumentType)[keyof typeof InstrumentType];

/**
 * Staleness thresholds (ms) - can be per-venue if needed
 */
export const DEFAULT_STALE_THRESHOLD_MS = 5000;
