import { z } from 'zod';
export declare const RiskPolicySchemaV1: z.ZodObject<{
    maxAccountLeverage: z.ZodNumber;
    maxPositionNotional: z.ZodNumber;
    maxDailyLoss: z.ZodNumber;
    maxOpenOrdersPerSymbol: z.ZodNumber;
    symbolWhitelist: z.ZodArray<z.ZodString, "many">;
    maxSlippageBps: z.ZodNumber;
    maxStalenessMs: z.ZodNumber;
    maxCorrelation: z.ZodNumber;
    correlationPenalty: z.ZodNumber;
    minConfidenceScore: z.ZodNumber;
    minStopDistanceMultiplier: z.ZodNumber;
    version: z.ZodLiteral<1>;
    lastUpdated: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    version: 1;
    maxAccountLeverage: number;
    maxPositionNotional: number;
    maxDailyLoss: number;
    maxOpenOrdersPerSymbol: number;
    symbolWhitelist: string[];
    maxSlippageBps: number;
    maxStalenessMs: number;
    maxCorrelation: number;
    correlationPenalty: number;
    minConfidenceScore: number;
    minStopDistanceMultiplier: number;
    lastUpdated: number;
}, {
    version: 1;
    maxAccountLeverage: number;
    maxPositionNotional: number;
    maxDailyLoss: number;
    maxOpenOrdersPerSymbol: number;
    symbolWhitelist: string[];
    maxSlippageBps: number;
    maxStalenessMs: number;
    maxCorrelation: number;
    correlationPenalty: number;
    minConfidenceScore: number;
    minStopDistanceMultiplier: number;
    lastUpdated: number;
}>;
export type RiskPolicyV1 = z.infer<typeof RiskPolicySchemaV1>;
/**
 * Returns the canonical Risk Policy and its SHA256 hash.
 * This ensures that the policy used by the application matches the source of truth.
 */
export declare function getCanonicalRiskPolicy(): {
    policy: {
        version: 1;
        maxAccountLeverage: number;
        maxPositionNotional: number;
        maxDailyLoss: number;
        maxOpenOrdersPerSymbol: number;
        symbolWhitelist: string[];
        maxSlippageBps: number;
        maxStalenessMs: number;
        maxCorrelation: number;
        correlationPenalty: number;
        minConfidenceScore: number;
        minStopDistanceMultiplier: number;
        lastUpdated: number;
    };
    hash: string;
    version: 1;
};
export declare const DefaultRiskPolicyV1: RiskPolicyV1;
//# sourceMappingURL=RiskPolicy.d.ts.map