import { z } from 'zod';
/**
 * Fee Tier Definition
 * Represents a volume-based fee tier on an exchange.
 */
export declare const FeeTierSchema: z.ZodObject<{
    tierName: z.ZodString;
    minVolume30d: z.ZodNumber;
    makerFeeBps: z.ZodNumber;
    takerFeeBps: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    tierName: string;
    minVolume30d: number;
    makerFeeBps: number;
    takerFeeBps: number;
}, {
    tierName: string;
    minVolume30d: number;
    makerFeeBps: number;
    takerFeeBps: number;
}>;
export type FeeTier = z.infer<typeof FeeTierSchema>;
/**
 * Exchange Fee Configuration
 * Defines default and tiered fees for a specific exchange.
 */
export declare const ExchangeFeeConfigSchema: z.ZodObject<{
    exchange: z.ZodString;
    defaultMakerFeeBps: z.ZodNumber;
    defaultTakerFeeBps: z.ZodNumber;
    tiers: z.ZodOptional<z.ZodArray<z.ZodObject<{
        tierName: z.ZodString;
        minVolume30d: z.ZodNumber;
        makerFeeBps: z.ZodNumber;
        takerFeeBps: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        tierName: string;
        minVolume30d: number;
        makerFeeBps: number;
        takerFeeBps: number;
    }, {
        tierName: string;
        minVolume30d: number;
        makerFeeBps: number;
        takerFeeBps: number;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    exchange: string;
    defaultMakerFeeBps: number;
    defaultTakerFeeBps: number;
    tiers?: {
        tierName: string;
        minVolume30d: number;
        makerFeeBps: number;
        takerFeeBps: number;
    }[] | undefined;
}, {
    exchange: string;
    defaultMakerFeeBps: number;
    defaultTakerFeeBps: number;
    tiers?: {
        tierName: string;
        minVolume30d: number;
        makerFeeBps: number;
        takerFeeBps: number;
    }[] | undefined;
}>;
export type ExchangeFeeConfig = z.infer<typeof ExchangeFeeConfigSchema>;
/**
 * Master Fee Schedule Schema
 * The canonical source of truth for fee assumptions across the system.
 */
export declare const FeeScheduleSchema: z.ZodObject<{
    version: z.ZodString;
    lastUpdated: z.ZodNumber;
    exchanges: z.ZodRecord<z.ZodString, z.ZodObject<{
        exchange: z.ZodString;
        defaultMakerFeeBps: z.ZodNumber;
        defaultTakerFeeBps: z.ZodNumber;
        tiers: z.ZodOptional<z.ZodArray<z.ZodObject<{
            tierName: z.ZodString;
            minVolume30d: z.ZodNumber;
            makerFeeBps: z.ZodNumber;
            takerFeeBps: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            tierName: string;
            minVolume30d: number;
            makerFeeBps: number;
            takerFeeBps: number;
        }, {
            tierName: string;
            minVolume30d: number;
            makerFeeBps: number;
            takerFeeBps: number;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        exchange: string;
        defaultMakerFeeBps: number;
        defaultTakerFeeBps: number;
        tiers?: {
            tierName: string;
            minVolume30d: number;
            makerFeeBps: number;
            takerFeeBps: number;
        }[] | undefined;
    }, {
        exchange: string;
        defaultMakerFeeBps: number;
        defaultTakerFeeBps: number;
        tiers?: {
            tierName: string;
            minVolume30d: number;
            makerFeeBps: number;
            takerFeeBps: number;
        }[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    exchanges: Record<string, {
        exchange: string;
        defaultMakerFeeBps: number;
        defaultTakerFeeBps: number;
        tiers?: {
            tierName: string;
            minVolume30d: number;
            makerFeeBps: number;
            takerFeeBps: number;
        }[] | undefined;
    }>;
    version: string;
    lastUpdated: number;
}, {
    exchanges: Record<string, {
        exchange: string;
        defaultMakerFeeBps: number;
        defaultTakerFeeBps: number;
        tiers?: {
            tierName: string;
            minVolume30d: number;
            makerFeeBps: number;
            takerFeeBps: number;
        }[] | undefined;
    }>;
    version: string;
    lastUpdated: number;
}>;
export type FeeSchedule = z.infer<typeof FeeScheduleSchema>;
/**
 * Default Fee Schedule
 * Based on standard VIP 0 tiers for major exchanges.
 */
export declare const DEFAULT_FEE_SCHEDULE: FeeSchedule;
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
export declare const getCanonicalFeeSchedule: () => FeeSchedule;
/**
 * Compute deterministic hash of fee schedule for simulation/audit parity
 * Uses JSON.stringify with sorted keys for determinism
 */
export declare const computeFeeScheduleHash: (schedule: FeeSchedule) => string;
/**
 * Get fee schedule with venue-level overrides applied
 * Overrides take precedence over default exchange fees
 */
export declare const getFeeScheduleWithOverrides: (overrides: VenueFeeOverride[]) => {
    schedule: FeeSchedule;
    hash: string;
};
/**
 * Get current fee schedule hash for audit/simulation parity
 */
export declare const getCanonicalFeeScheduleHash: () => string;
//# sourceMappingURL=FeeSchedule.d.ts.map