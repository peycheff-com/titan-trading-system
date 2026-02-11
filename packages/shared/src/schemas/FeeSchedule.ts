/* eslint-disable functional/immutable-data -- Stateful runtime: mutations architecturally required */
import { createHash } from 'crypto';
import { z } from 'zod';

/**
 * Fee Tier Definition
 * Represents a volume-based fee tier on an exchange.
 */
export const FeeTierSchema = z.object({
  tierName: z.string(),
  minVolume30d: z.number(),
  makerFeeBps: z.number(),
  takerFeeBps: z.number(),
});

export type FeeTier = z.infer<typeof FeeTierSchema>;

/**
 * Exchange Fee Configuration
 * Defines default and tiered fees for a specific exchange.
 */
export const ExchangeFeeConfigSchema = z.object({
  exchange: z.string(),
  defaultMakerFeeBps: z.number(),
  defaultTakerFeeBps: z.number(),
  tiers: z.array(FeeTierSchema).optional(),
});

export type ExchangeFeeConfig = z.infer<typeof ExchangeFeeConfigSchema>;

/**
 * Master Fee Schedule Schema
 * The canonical source of truth for fee assumptions across the system.
 */
export const FeeScheduleSchema = z.object({
  version: z.string(),
  lastUpdated: z.number(),
  // Keyed by exchange ID (e.g., 'binance', 'bybit')
  exchanges: z.record(ExchangeFeeConfigSchema),
});

export type FeeSchedule = z.infer<typeof FeeScheduleSchema>;

/**
 * Default Fee Schedule
 * Based on standard VIP 0 tiers for major exchanges.
 */
export const DEFAULT_FEE_SCHEDULE: FeeSchedule = {
  version: '1.0.0',
  lastUpdated: Date.now(),
  exchanges: {
    binance: {
      exchange: 'binance',
      defaultMakerFeeBps: 2.0, // 0.02%
      defaultTakerFeeBps: 4.0, // 0.04%
      tiers: [
        {
          tierName: 'VIP0',
          minVolume30d: 0,
          makerFeeBps: 2.0,
          takerFeeBps: 4.0,
        },
      ],
    },
    bybit: {
      exchange: 'bybit',
      defaultMakerFeeBps: 2.0, // 0.02% (Derivatives)
      defaultTakerFeeBps: 5.5, // 0.055% (Derivatives)
      tiers: [
        {
          tierName: 'VIP0',
          minVolume30d: 0,
          makerFeeBps: 2.0,
          takerFeeBps: 5.5,
        },
      ],
    },
    coinbase: {
      exchange: 'coinbase',
      defaultMakerFeeBps: 40.0, // 0.40%
      defaultTakerFeeBps: 60.0, // 0.60%
      tiers: [],
    },
  },
};

/**
 * Venue-level fee overrides (P1)
 * Allows account-specific fee agreements per venue
 */
export interface VenueFeeOverride {
  venue: string;
  makerFeeBps?: number;
  takerFeeBps?: number;
}

/**
 * Get the canonical fee schedule with computed hash
 */
export const getCanonicalFeeSchedule = (): FeeSchedule => {
  return DEFAULT_FEE_SCHEDULE;
};

/**
 * Compute deterministic hash of fee schedule for simulation/audit parity
 * Uses JSON.stringify with sorted keys for determinism
 */
export const computeFeeScheduleHash = (schedule: FeeSchedule): string => {
  const canonical = JSON.stringify({
    version: schedule.version,
    exchanges: Object.keys(schedule.exchanges)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = schedule.exchanges[key];
          return acc;
        },
        {} as Record<string, ExchangeFeeConfig>,
      ),
  });
  return createHash('sha256').update(canonical).digest('hex');
};

/**
 * Get fee schedule with venue-level overrides applied
 * Overrides take precedence over default exchange fees
 */
export const getFeeScheduleWithOverrides = (
  overrides: VenueFeeOverride[],
): { schedule: FeeSchedule; hash: string } => {
  const schedule = JSON.parse(JSON.stringify(DEFAULT_FEE_SCHEDULE)) as FeeSchedule;

  for (const override of overrides) {
    const exchangeConfig = schedule.exchanges[override.venue];
    if (exchangeConfig) {
      if (override.makerFeeBps !== undefined) {
        exchangeConfig.defaultMakerFeeBps = override.makerFeeBps;
      }
      if (override.takerFeeBps !== undefined) {
        exchangeConfig.defaultTakerFeeBps = override.takerFeeBps;
      }
    }
  }

  return {
    schedule,
    hash: computeFeeScheduleHash(schedule),
  };
};

/**
 * Get current fee schedule hash for audit/simulation parity
 */
export const getCanonicalFeeScheduleHash = (): string => {
  return computeFeeScheduleHash(DEFAULT_FEE_SCHEDULE);
};
