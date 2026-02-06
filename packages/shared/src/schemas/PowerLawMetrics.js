import { z } from 'zod';
/**
 * Canonical Power Law Metrics Schema V1
 *
 * Subject: titan.signal.powerlaw.metrics.v1.{venue}.{symbol}.{tf}
 *
 * This is the SINGLE SOURCE OF TRUTH for all power-law tail risk metrics.
 * Published by canonical-powerlaw-service, consumed by Brain for policy.
 */
export const VolClusterStateSchema = z.enum(['stable', 'expanding', 'contracting', 'unknown']);
export const HealthStatusSchema = z.enum(['ok', 'unknown', 'stale', 'low_sample', 'fit_failed']);
export const TailMethodSchema = z.enum(['hill', 'pot', 'hill+pot']);
export const PowerLawMetricsSchemaV1 = z.object({
    // Schema version for forward compatibility
    schema_version: z.literal('1'),
    // Identity
    venue: z.string().min(1),
    symbol: z.string().min(1),
    tf: z.string().min(1), // Timeframe: "1m", "5m", "1h", etc.
    // Observation Window
    window: z.object({
        start_ts: z.number().int(),
        end_ts: z.number().int(),
        n: z.number().int().min(0), // Sample count
    }),
    // Model Info
    model: z.object({
        model_id: z.string(), // e.g. "hill-v1.2.0"
        params: z.record(z.unknown()), // Model-specific parameters (k for Hill, u for POT, etc.)
    }),
    // Tail Estimation
    tail: z.object({
        alpha: z.number().nullable(), // Hill exponent (null if fit failed)
        ci_low: z.number().nullable(), // 95% CI lower bound
        ci_high: z.number().nullable(), // 95% CI upper bound
        confidence: z.number().min(0).max(1), // Fit quality score
        method: TailMethodSchema,
        k: z.number().int().nullable(), // # of order statistics used (Hill)
        u: z.number().nullable(), // Threshold (POT)
    }),
    // Exceedance Probability (POT)
    exceedance: z.object({
        prob: z.number().min(0).max(1).nullable(), // P(X > threshold)
    }),
    // Volatility Clustering
    vol_cluster: z.object({
        state: VolClusterStateSchema,
        persistence: z.number().min(0).max(1), // GARCH-style persistence
        sigma: z.number().nullable(), // Current volatility estimate
    }),
    // Health Status - CRITICAL for fail-closed behavior
    health: z.object({
        status: HealthStatusSchema,
        reason: z.string(), // Human-readable explanation
    }),
    // Provenance - For audit trail and reproducibility
    provenance: z.object({
        code_hash: z.string(), // Git SHA or build hash
        config_hash: z.string(), // Hash of model config
        data_fingerprint: z.string(), // Hash of input data window
        calc_ts: z.number().int(), // When this was calculated
        trace_id: z.string(), // Distributed tracing ID
    }),
});
/**
 * Converts legacy PowerLawMetrics to the canonical V1 format.
 * Used during migration period.
 */
export function upgradeToV1(legacy, defaults) {
    const now = Date.now();
    return {
        schema_version: '1',
        venue: defaults.venue,
        symbol: legacy.symbol,
        tf: defaults.tf,
        window: {
            start_ts: legacy.timestamp - 3600000, // Assume 1h window
            end_ts: legacy.timestamp,
            n: 0, // Unknown
        },
        model: {
            model_id: 'legacy-upgrade',
            params: {},
        },
        tail: {
            alpha: legacy.tailExponent,
            ci_low: null,
            ci_high: null,
            confidence: legacy.tailConfidence,
            method: 'hill',
            k: null,
            u: null,
        },
        exceedance: {
            prob: legacy.exceedanceProbability,
        },
        vol_cluster: {
            state: legacy.volatilityCluster.state || 'unknown',
            persistence: legacy.volatilityCluster.persistence,
            sigma: legacy.volatilityCluster.sigma,
        },
        health: {
            status: 'unknown',
            reason: 'Upgraded from legacy format',
        },
        provenance: {
            code_hash: defaults.code_hash,
            config_hash: 'legacy',
            data_fingerprint: 'unknown',
            calc_ts: now,
            trace_id: defaults.trace_id,
        },
    };
}
//# sourceMappingURL=PowerLawMetrics.js.map