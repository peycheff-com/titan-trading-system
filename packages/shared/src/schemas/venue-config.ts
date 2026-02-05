/**
 * VenueConfigV1 - Dynamic venue configuration schema
 *
 * Stored in NATS KV (titan-config) to allow runtime tuning of
 * venue-specific parameters like staleness thresholds.
 */
import { z } from 'zod';
import { VenueId } from '../types/venues.js';

/**
 * VenueConfigV1 Zod Schema
 */
export const VenueConfigV1Schema = z
  .object({
    // Schema version
    v: z.literal(1),

    // Venue identifier
    venue: z.nativeEnum(VenueId),

    // Staleness threshold in milliseconds
    // If not present, system default is used
    staleness_threshold_ms: z.number().int().positive().optional(),
  })
  .strict();

export type VenueConfigV1 = z.infer<typeof VenueConfigV1Schema>;

/**
 * Safe parse helper
 */
export function safeParseVenueConfigV1(
  data: unknown,
): z.SafeParseReturnType<unknown, VenueConfigV1> {
  return VenueConfigV1Schema.safeParse(data);
}
