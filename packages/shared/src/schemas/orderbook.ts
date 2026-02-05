/**
 * OrderBookDeltaV1 - Market Depth Data Schema
 *
 * Represents incremental or snapshot updates to an orderbook.
 * Consumed by Brain for strategy execution and Sentinel for risk checks.
 */
import { z } from 'zod';
import { VenueId } from '../types/venues.js';

/**
 * OrderBookDeltaV1 Zod Schema
 */
export const OrderBookDeltaV1Schema = z
  .object({
    // Schema version
    v: z.literal(1),

    // Timestamp when event was generated (ISO8601)
    ts: z.string().datetime(),

    // Venue identifier
    venue: z.nativeEnum(VenueId),

    // Normalized symbol (e.g., BTC/USDT)
    symbol: z.string(),

    // Bids: Array of [price, size] tuples
    // Sorted best to worst (descending price) typically, but not strictly enforced by schema
    bids: z.array(z.tuple([z.string(), z.string()])),

    // Asks: Array of [price, size] tuples
    // Sorted best to worst (ascending price) typically, but not strictly enforced by schema
    asks: z.array(z.tuple([z.string(), z.string()])),

    // Sequence number for gap detection (venue specific)
    sequence: z.number().int(),

    // Whether this is a full snapshot or an incremental delta
    is_snapshot: z.boolean(),

    // Publisher metadata
    meta: z.object({
      hunter_instance_id: z.string(),
    }),
  })
  .strict();

export type OrderBookDeltaV1 = z.infer<typeof OrderBookDeltaV1Schema>;

/**
 * Safe parse helper
 */
export function safeParseOrderBookDeltaV1(
  data: unknown,
): z.SafeParseReturnType<unknown, OrderBookDeltaV1> {
  return OrderBookDeltaV1Schema.safeParse(data);
}
