import { z } from 'zod';
/**
 * Canonical Power Law Metrics Schema V1
 *
 * Subject: titan.signal.powerlaw.metrics.v1.{venue}.{symbol}.{tf}
 *
 * This is the SINGLE SOURCE OF TRUTH for all power-law tail risk metrics.
 * Published by canonical-powerlaw-service, consumed by Brain for policy.
 */
export declare const VolClusterStateSchema: z.ZodEnum<["stable", "expanding", "contracting", "unknown"]>;
export type VolClusterState = z.infer<typeof VolClusterStateSchema>;
export declare const HealthStatusSchema: z.ZodEnum<["ok", "unknown", "stale", "low_sample", "fit_failed"]>;
export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export declare const TailMethodSchema: z.ZodEnum<["hill", "pot", "hill+pot"]>;
export type TailMethod = z.infer<typeof TailMethodSchema>;
export declare const PowerLawMetricsSchemaV1: z.ZodObject<{
    schema_version: z.ZodLiteral<"1">;
    venue: z.ZodString;
    symbol: z.ZodString;
    tf: z.ZodString;
    window: z.ZodObject<{
        start_ts: z.ZodNumber;
        end_ts: z.ZodNumber;
        n: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        start_ts: number;
        end_ts: number;
        n: number;
    }, {
        start_ts: number;
        end_ts: number;
        n: number;
    }>;
    model: z.ZodObject<{
        model_id: z.ZodString;
        params: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        params: Record<string, unknown>;
        model_id: string;
    }, {
        params: Record<string, unknown>;
        model_id: string;
    }>;
    tail: z.ZodObject<{
        alpha: z.ZodNullable<z.ZodNumber>;
        ci_low: z.ZodNullable<z.ZodNumber>;
        ci_high: z.ZodNullable<z.ZodNumber>;
        confidence: z.ZodNumber;
        method: z.ZodEnum<["hill", "pot", "hill+pot"]>;
        k: z.ZodNullable<z.ZodNumber>;
        u: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        confidence: number;
        method: "hill" | "pot" | "hill+pot";
        alpha: number | null;
        ci_low: number | null;
        ci_high: number | null;
        k: number | null;
        u: number | null;
    }, {
        confidence: number;
        method: "hill" | "pot" | "hill+pot";
        alpha: number | null;
        ci_low: number | null;
        ci_high: number | null;
        k: number | null;
        u: number | null;
    }>;
    exceedance: z.ZodObject<{
        prob: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        prob: number | null;
    }, {
        prob: number | null;
    }>;
    vol_cluster: z.ZodObject<{
        state: z.ZodEnum<["stable", "expanding", "contracting", "unknown"]>;
        persistence: z.ZodNumber;
        sigma: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        state: "unknown" | "stable" | "expanding" | "contracting";
        persistence: number;
        sigma: number | null;
    }, {
        state: "unknown" | "stable" | "expanding" | "contracting";
        persistence: number;
        sigma: number | null;
    }>;
    health: z.ZodObject<{
        status: z.ZodEnum<["ok", "unknown", "stale", "low_sample", "fit_failed"]>;
        reason: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        status: "unknown" | "ok" | "stale" | "low_sample" | "fit_failed";
    }, {
        reason: string;
        status: "unknown" | "ok" | "stale" | "low_sample" | "fit_failed";
    }>;
    provenance: z.ZodObject<{
        code_hash: z.ZodString;
        config_hash: z.ZodString;
        data_fingerprint: z.ZodString;
        calc_ts: z.ZodNumber;
        trace_id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        code_hash: string;
        config_hash: string;
        data_fingerprint: string;
        calc_ts: number;
        trace_id: string;
    }, {
        code_hash: string;
        config_hash: string;
        data_fingerprint: string;
        calc_ts: number;
        trace_id: string;
    }>;
}, "strip", z.ZodTypeAny, {
    symbol: string;
    health: {
        reason: string;
        status: "unknown" | "ok" | "stale" | "low_sample" | "fit_failed";
    };
    schema_version: "1";
    venue: string;
    model: {
        params: Record<string, unknown>;
        model_id: string;
    };
    tf: string;
    window: {
        start_ts: number;
        end_ts: number;
        n: number;
    };
    tail: {
        confidence: number;
        method: "hill" | "pot" | "hill+pot";
        alpha: number | null;
        ci_low: number | null;
        ci_high: number | null;
        k: number | null;
        u: number | null;
    };
    exceedance: {
        prob: number | null;
    };
    vol_cluster: {
        state: "unknown" | "stable" | "expanding" | "contracting";
        persistence: number;
        sigma: number | null;
    };
    provenance: {
        code_hash: string;
        config_hash: string;
        data_fingerprint: string;
        calc_ts: number;
        trace_id: string;
    };
}, {
    symbol: string;
    health: {
        reason: string;
        status: "unknown" | "ok" | "stale" | "low_sample" | "fit_failed";
    };
    schema_version: "1";
    venue: string;
    model: {
        params: Record<string, unknown>;
        model_id: string;
    };
    tf: string;
    window: {
        start_ts: number;
        end_ts: number;
        n: number;
    };
    tail: {
        confidence: number;
        method: "hill" | "pot" | "hill+pot";
        alpha: number | null;
        ci_low: number | null;
        ci_high: number | null;
        k: number | null;
        u: number | null;
    };
    exceedance: {
        prob: number | null;
    };
    vol_cluster: {
        state: "unknown" | "stable" | "expanding" | "contracting";
        persistence: number;
        sigma: number | null;
    };
    provenance: {
        code_hash: string;
        config_hash: string;
        data_fingerprint: string;
        calc_ts: number;
        trace_id: string;
    };
}>;
export type PowerLawMetricsV1 = z.infer<typeof PowerLawMetricsSchemaV1>;
/**
 * Legacy PowerLawMetrics interface for backward compatibility.
 * @deprecated Use PowerLawMetricsV1 instead. This will be removed in v2.
 */
export interface PowerLawMetricsLegacy {
    symbol: string;
    tailExponent: number;
    tailConfidence: number;
    exceedanceProbability: number;
    volatilityCluster: {
        state: string;
        persistence: number;
        sigma: number;
    };
    timestamp: number;
}
/**
 * Converts legacy PowerLawMetrics to the canonical V1 format.
 * Used during migration period.
 */
export declare function upgradeToV1(legacy: PowerLawMetricsLegacy, defaults: {
    venue: string;
    tf: string;
    code_hash: string;
    trace_id: string;
}): PowerLawMetricsV1;
//# sourceMappingURL=PowerLawMetrics.d.ts.map