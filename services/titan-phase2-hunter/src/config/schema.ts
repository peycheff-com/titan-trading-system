import { z } from "zod";
import { PhaseConfigBaseSchema } from "@titan/shared";

/**
 * Hunter (Phase 2) Specific Schemas
 */

export const AlignmentWeightsSchema = z.object({
    daily: z.number().min(30).max(60), // 30-60%
    h4: z.number().min(20).max(40), // 20-40%
    m15: z.number().min(10).max(30), // 10-30%
}).refine((data) => Math.abs(data.daily + data.h4 + data.m15 - 100) <= 0.1, {
    message: "Alignment weights must sum to 100%",
    path: ["daily"], // Highlight "daily" but applies to the whole object
});

export const RSConfigSchema = z.object({
    threshold: z.number().min(0).max(5), // 0-5%
    lookbackPeriod: z.number().min(2).max(8), // 2-8 hours
});

export const RiskConfigSchema = z.object({
    maxLeverage: z.number().min(3).max(5), // 3-5x
    stopLossPercent: z.number().min(1).max(3), // 1-3%
    targetPercent: z.number().min(3).max(6), // 3-6%
}); // R:R check can be added as a superRefine if needed, but warning is fine in logic

export const PortfolioConfigSchema = z.object({
    maxConcurrentPositions: z.number().min(3).max(8), // 3-8
    maxPortfolioHeat: z.number().min(10).max(20), // 10-20%
    correlationThreshold: z.number().min(0.6).max(0.9), // 0.6-0.9
});

export const ForwardTestConfigSchema = z.object({
    enabled: z.boolean(),
    duration: z.number().min(1).max(168), // 1-168 hours
    logSignalsOnly: z.boolean(),
    compareToBacktest: z.boolean(),
});

/**
 * Complete Hunter Configuration Schema
 * Extends basic shared PhaseConfig with specific validation rules
 */
export const HunterConfigSchema = PhaseConfigBaseSchema.extend({
    alignmentWeights: AlignmentWeightsSchema,
    rsConfig: RSConfigSchema,
    riskConfig: RiskConfigSchema,
    portfolioConfig: PortfolioConfigSchema,
    forwardTestConfig: ForwardTestConfigSchema,
    version: z.number().optional(),
    lastModified: z.number().optional(),
});

export type HunterConfig = z.infer<typeof HunterConfigSchema>;
