/**
 * VenueStatusV1 - Venue telemetry event schema
 *
 * Published by Hunter, consumed by Brain for VenuesController.
 * Uses Zod for runtime validation at edges.
 */
import { z } from 'zod';
import { VenueId, VenueRecommendedAction, VenueWsState } from '../types/venues.js';
import { TITAN_SUBJECTS } from '../messaging/titan_subjects.js';

/**
 * VenueStatusV1 Zod Schema
 */
export const VenueStatusV1Schema = z
  .object({
    // Schema version for additive changes
    v: z.literal(1),

    // ISO8601 timestamp when event was generated
    ts: z.string().datetime(),

    // Venue identifier
    venue: z.enum([
      VenueId.BINANCE,
      VenueId.BYBIT,
      VenueId.COINBASE,
      VenueId.KRAKEN,
      VenueId.MEXC,
      VenueId.HYPERLIQUID,
      VenueId.DERIBIT,
    ]),

    // Embedded capabilities for convenience
    capabilities: z.object({
      spot: z.boolean(),
      perps: z.boolean(),
      futures: z.boolean(),
      options: z.boolean(),
      dex: z.boolean().optional(),
      enabled: z.boolean(),
    }),

    // WebSocket connection status
    ws: z.object({
      state: z.enum([VenueWsState.CONNECTED, VenueWsState.DEGRADED, VenueWsState.DISCONNECTED]),
      url: z.string(),
      since_ts: z.string().datetime().nullable(),
      last_msg_ts: z.string().datetime().nullable(),
      last_trade_ts: z.string().datetime().nullable(),
      ping_rtt_ms: z.number().nullable(),
      reconnects_15m: z.number().int().nonnegative(),
      parse_errors_5m: z.number().int().nonnegative(),
    }),

    // Publisher metadata
    meta: z.object({
      hunter_instance_id: z.string(),
      build_sha: z.string().optional(),
    }),
  })
  .strict(); // Reject unknown fields at edges

export type VenueStatusV1 = z.infer<typeof VenueStatusV1Schema>;

/**
 * Parse and validate VenueStatusV1
 * @throws ZodError if validation fails
 */
export function parseVenueStatusV1(data: unknown): VenueStatusV1 {
  return VenueStatusV1Schema.parse(data);
}

/**
 * Safe parse that returns success/error result
 */
export function safeParseVenueStatusV1(
  data: unknown,
): z.SafeParseReturnType<unknown, VenueStatusV1> {
  return VenueStatusV1Schema.safeParse(data);
}

/**
 * Calculate staleness for a venue status
 */
export function calculateStaleness(
  status: VenueStatusV1,
  nowMs: number = Date.now(),
): { staleness_ms: number; stale: boolean; threshold_ms: number } {
  const lastMsgTs = status.ws.last_msg_ts
    ? new Date(status.ws.last_msg_ts).getTime()
    : new Date(status.ts).getTime();

  const staleness_ms = nowMs - lastMsgTs;
  const threshold_ms = 5000; // 5 seconds default

  return {
    staleness_ms,
    stale: staleness_ms > threshold_ms,
    threshold_ms,
  };
}

/**
 * Derive recommended action from venue state and staleness
 */
export function deriveRecommendedAction(
  state: VenueWsState,
  stale: boolean,
): VenueRecommendedAction {
  if (state === VenueWsState.DISCONNECTED || stale) {
    return VenueRecommendedAction.HALT;
  }
  if (state === VenueWsState.DEGRADED) {
    return VenueRecommendedAction.THROTTLE;
  }
  return VenueRecommendedAction.ALLOCATE;
}

/**
 * NATS Subject for venue status events
 */
export const VENUE_STATUS_SUBJECT = TITAN_SUBJECTS.DATA.VENUES.STATUS;
