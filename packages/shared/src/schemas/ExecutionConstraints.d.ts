import { z } from 'zod';
/**
 * Execution Constraints Schema V1
 *
 * Subject: titan.signal.execution.constraints.v1.{venue}.{account}.{symbol}
 *
 * Published by Brain's PowerLawPolicyModule, consumed by Execution Engine.
 * The Execution Engine MUST NOT understand power laws - it only enforces
 * these pre-computed constraints mechanically.
 */
export declare const RiskModeSchema: z.ZodEnum<["NORMAL", "CAUTION", "DEFENSIVE", "EMERGENCY"]>;
export type RiskMode = z.infer<typeof RiskModeSchema>;
export declare const PolicyModeSchema: z.ZodEnum<["SHADOW", "ADVISORY", "ENFORCEMENT"]>;
export type PolicyMode = z.infer<typeof PolicyModeSchema>;
export declare const TifTypeSchema: z.ZodEnum<["GTC", "IOC", "FOK"]>;
export type TifType = z.infer<typeof TifTypeSchema>;
export declare const SlicingProfileSchema: z.ZodObject<{
    max_slice_notional: z.ZodNumber;
    min_slice_notional: z.ZodNumber;
    cadence_ms: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    max_slice_notional: number;
    min_slice_notional: number;
    cadence_ms: number;
}, {
    max_slice_notional: number;
    min_slice_notional: number;
    cadence_ms: number;
}>;
export type SlicingProfile = z.infer<typeof SlicingProfileSchema>;
export declare const TifProfileSchema: z.ZodObject<{
    type: z.ZodEnum<["GTC", "IOC", "FOK"]>;
    ttl_ms: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    type: "GTC" | "IOC" | "FOK";
    ttl_ms: number;
}, {
    type: "GTC" | "IOC" | "FOK";
    ttl_ms: number;
}>;
export type TifProfile = z.infer<typeof TifProfileSchema>;
export declare const CancelOnBurstSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    timeout_ms: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    timeout_ms: number;
}, {
    enabled: boolean;
    timeout_ms: number;
}>;
export type CancelOnBurst = z.infer<typeof CancelOnBurstSchema>;
export declare const ConstraintLimitsSchema: z.ZodObject<{
    max_pos_notional: z.ZodNumber;
    max_order_notional: z.ZodNumber;
    max_leverage: z.ZodNumber;
    reduce_only: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    max_pos_notional: number;
    max_order_notional: number;
    max_leverage: number;
    reduce_only: boolean;
}, {
    max_pos_notional: number;
    max_order_notional: number;
    max_leverage: number;
    reduce_only: boolean;
}>;
export type ConstraintLimits = z.infer<typeof ConstraintLimitsSchema>;
export declare const ExecutionProfileSchema: z.ZodObject<{
    slicing: z.ZodObject<{
        max_slice_notional: z.ZodNumber;
        min_slice_notional: z.ZodNumber;
        cadence_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        max_slice_notional: number;
        min_slice_notional: number;
        cadence_ms: number;
    }, {
        max_slice_notional: number;
        min_slice_notional: number;
        cadence_ms: number;
    }>;
    maker_bias: z.ZodNumber;
    cancel_on_burst: z.ZodObject<{
        enabled: z.ZodBoolean;
        timeout_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        timeout_ms: number;
    }, {
        enabled: boolean;
        timeout_ms: number;
    }>;
    price_band_bps: z.ZodNumber;
    tif: z.ZodObject<{
        type: z.ZodEnum<["GTC", "IOC", "FOK"]>;
        ttl_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: "GTC" | "IOC" | "FOK";
        ttl_ms: number;
    }, {
        type: "GTC" | "IOC" | "FOK";
        ttl_ms: number;
    }>;
}, "strip", z.ZodTypeAny, {
    slicing: {
        max_slice_notional: number;
        min_slice_notional: number;
        cadence_ms: number;
    };
    maker_bias: number;
    cancel_on_burst: {
        enabled: boolean;
        timeout_ms: number;
    };
    price_band_bps: number;
    tif: {
        type: "GTC" | "IOC" | "FOK";
        ttl_ms: number;
    };
}, {
    slicing: {
        max_slice_notional: number;
        min_slice_notional: number;
        cadence_ms: number;
    };
    maker_bias: number;
    cancel_on_burst: {
        enabled: boolean;
        timeout_ms: number;
    };
    price_band_bps: number;
    tif: {
        type: "GTC" | "IOC" | "FOK";
        ttl_ms: number;
    };
}>;
export type ExecutionProfile = z.infer<typeof ExecutionProfileSchema>;
export declare const ConstraintOriginSchema: z.ZodObject<{
    derived_from_metrics: z.ZodObject<{
        provenance_hash: z.ZodString;
        window_end_ts: z.ZodNumber;
        model_id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        model_id: string;
        provenance_hash: string;
        window_end_ts: number;
    }, {
        model_id: string;
        provenance_hash: string;
        window_end_ts: number;
    }>;
    brain_decision_id: z.ZodString;
    reason_codes: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    derived_from_metrics: {
        model_id: string;
        provenance_hash: string;
        window_end_ts: number;
    };
    brain_decision_id: string;
    reason_codes: string[];
}, {
    derived_from_metrics: {
        model_id: string;
        provenance_hash: string;
        window_end_ts: number;
    };
    brain_decision_id: string;
    reason_codes: string[];
}>;
export type ConstraintOrigin = z.infer<typeof ConstraintOriginSchema>;
export declare const ConstraintProvenanceSchema: z.ZodObject<{
    code_hash: z.ZodString;
    config_hash: z.ZodString;
    calc_ts: z.ZodNumber;
    trace_id: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code_hash: string;
    config_hash: string;
    calc_ts: number;
    trace_id: string;
}, {
    code_hash: string;
    config_hash: string;
    calc_ts: number;
    trace_id: string;
}>;
export type ConstraintProvenance = z.infer<typeof ConstraintProvenanceSchema>;
export declare const ExecutionConstraintsSchemaV1: z.ZodObject<{
    schema_version: z.ZodLiteral<"1">;
    venue: z.ZodString;
    account: z.ZodString;
    symbol: z.ZodString;
    ttl_ms: z.ZodNumber;
    issued_ts: z.ZodNumber;
    risk_mode: z.ZodEnum<["NORMAL", "CAUTION", "DEFENSIVE", "EMERGENCY"]>;
    mode: z.ZodEnum<["SHADOW", "ADVISORY", "ENFORCEMENT"]>;
    limits: z.ZodObject<{
        max_pos_notional: z.ZodNumber;
        max_order_notional: z.ZodNumber;
        max_leverage: z.ZodNumber;
        reduce_only: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        max_pos_notional: number;
        max_order_notional: number;
        max_leverage: number;
        reduce_only: boolean;
    }, {
        max_pos_notional: number;
        max_order_notional: number;
        max_leverage: number;
        reduce_only: boolean;
    }>;
    execution_profile: z.ZodObject<{
        slicing: z.ZodObject<{
            max_slice_notional: z.ZodNumber;
            min_slice_notional: z.ZodNumber;
            cadence_ms: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            max_slice_notional: number;
            min_slice_notional: number;
            cadence_ms: number;
        }, {
            max_slice_notional: number;
            min_slice_notional: number;
            cadence_ms: number;
        }>;
        maker_bias: z.ZodNumber;
        cancel_on_burst: z.ZodObject<{
            enabled: z.ZodBoolean;
            timeout_ms: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            timeout_ms: number;
        }, {
            enabled: boolean;
            timeout_ms: number;
        }>;
        price_band_bps: z.ZodNumber;
        tif: z.ZodObject<{
            type: z.ZodEnum<["GTC", "IOC", "FOK"]>;
            ttl_ms: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            type: "GTC" | "IOC" | "FOK";
            ttl_ms: number;
        }, {
            type: "GTC" | "IOC" | "FOK";
            ttl_ms: number;
        }>;
    }, "strip", z.ZodTypeAny, {
        slicing: {
            max_slice_notional: number;
            min_slice_notional: number;
            cadence_ms: number;
        };
        maker_bias: number;
        cancel_on_burst: {
            enabled: boolean;
            timeout_ms: number;
        };
        price_band_bps: number;
        tif: {
            type: "GTC" | "IOC" | "FOK";
            ttl_ms: number;
        };
    }, {
        slicing: {
            max_slice_notional: number;
            min_slice_notional: number;
            cadence_ms: number;
        };
        maker_bias: number;
        cancel_on_burst: {
            enabled: boolean;
            timeout_ms: number;
        };
        price_band_bps: number;
        tif: {
            type: "GTC" | "IOC" | "FOK";
            ttl_ms: number;
        };
    }>;
    origin: z.ZodObject<{
        derived_from_metrics: z.ZodObject<{
            provenance_hash: z.ZodString;
            window_end_ts: z.ZodNumber;
            model_id: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            model_id: string;
            provenance_hash: string;
            window_end_ts: number;
        }, {
            model_id: string;
            provenance_hash: string;
            window_end_ts: number;
        }>;
        brain_decision_id: z.ZodString;
        reason_codes: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        derived_from_metrics: {
            model_id: string;
            provenance_hash: string;
            window_end_ts: number;
        };
        brain_decision_id: string;
        reason_codes: string[];
    }, {
        derived_from_metrics: {
            model_id: string;
            provenance_hash: string;
            window_end_ts: number;
        };
        brain_decision_id: string;
        reason_codes: string[];
    }>;
    provenance: z.ZodObject<{
        code_hash: z.ZodString;
        config_hash: z.ZodString;
        calc_ts: z.ZodNumber;
        trace_id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        code_hash: string;
        config_hash: string;
        calc_ts: number;
        trace_id: string;
    }, {
        code_hash: string;
        config_hash: string;
        calc_ts: number;
        trace_id: string;
    }>;
}, "strip", z.ZodTypeAny, {
    symbol: string;
    origin: {
        derived_from_metrics: {
            model_id: string;
            provenance_hash: string;
            window_end_ts: number;
        };
        brain_decision_id: string;
        reason_codes: string[];
    };
    schema_version: "1";
    limits: {
        max_pos_notional: number;
        max_order_notional: number;
        max_leverage: number;
        reduce_only: boolean;
    };
    venue: string;
    account: string;
    provenance: {
        code_hash: string;
        config_hash: string;
        calc_ts: number;
        trace_id: string;
    };
    ttl_ms: number;
    issued_ts: number;
    risk_mode: "NORMAL" | "CAUTION" | "DEFENSIVE" | "EMERGENCY";
    mode: "SHADOW" | "ADVISORY" | "ENFORCEMENT";
    execution_profile: {
        slicing: {
            max_slice_notional: number;
            min_slice_notional: number;
            cadence_ms: number;
        };
        maker_bias: number;
        cancel_on_burst: {
            enabled: boolean;
            timeout_ms: number;
        };
        price_band_bps: number;
        tif: {
            type: "GTC" | "IOC" | "FOK";
            ttl_ms: number;
        };
    };
}, {
    symbol: string;
    origin: {
        derived_from_metrics: {
            model_id: string;
            provenance_hash: string;
            window_end_ts: number;
        };
        brain_decision_id: string;
        reason_codes: string[];
    };
    schema_version: "1";
    limits: {
        max_pos_notional: number;
        max_order_notional: number;
        max_leverage: number;
        reduce_only: boolean;
    };
    venue: string;
    account: string;
    provenance: {
        code_hash: string;
        config_hash: string;
        calc_ts: number;
        trace_id: string;
    };
    ttl_ms: number;
    issued_ts: number;
    risk_mode: "NORMAL" | "CAUTION" | "DEFENSIVE" | "EMERGENCY";
    mode: "SHADOW" | "ADVISORY" | "ENFORCEMENT";
    execution_profile: {
        slicing: {
            max_slice_notional: number;
            min_slice_notional: number;
            cadence_ms: number;
        };
        maker_bias: number;
        cancel_on_burst: {
            enabled: boolean;
            timeout_ms: number;
        };
        price_band_bps: number;
        tif: {
            type: "GTC" | "IOC" | "FOK";
            ttl_ms: number;
        };
    };
}>;
export type ExecutionConstraintsV1 = z.infer<typeof ExecutionConstraintsSchemaV1>;
/**
 * Default (defensive) constraints when canonical constraints are missing or stale.
 * This implements FAIL-CLOSED behavior.
 */
export declare function getDefensiveConstraints(venue: string, account: string, symbol: string, trace_id: string): ExecutionConstraintsV1;
/**
 * Check if constraints are still valid (not expired).
 */
export declare function isConstraintValid(constraints: ExecutionConstraintsV1): boolean;
//# sourceMappingURL=ExecutionConstraints.d.ts.map