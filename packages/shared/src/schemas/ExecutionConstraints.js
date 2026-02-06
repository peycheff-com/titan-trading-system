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
export const RiskModeSchema = z.enum(['NORMAL', 'CAUTION', 'DEFENSIVE', 'EMERGENCY']);
export const PolicyModeSchema = z.enum(['SHADOW', 'ADVISORY', 'ENFORCEMENT']);
export const TifTypeSchema = z.enum(['GTC', 'IOC', 'FOK']);
export const SlicingProfileSchema = z.object({
    max_slice_notional: z.number().min(0),
    min_slice_notional: z.number().min(0),
    cadence_ms: z.number().int().min(0),
});
export const TifProfileSchema = z.object({
    type: TifTypeSchema,
    ttl_ms: z.number().int().min(0),
});
export const CancelOnBurstSchema = z.object({
    enabled: z.boolean(),
    timeout_ms: z.number().int().min(0),
});
export const ConstraintLimitsSchema = z.object({
    max_pos_notional: z.number().min(0), // Max total position notional
    max_order_notional: z.number().min(0), // Max single order notional
    max_leverage: z.number().min(0), // Max account leverage
    reduce_only: z.boolean(), // If true, only reduce positions allowed
});
export const ExecutionProfileSchema = z.object({
    slicing: SlicingProfileSchema, // Order slicing parameters
    maker_bias: z.number().min(0).max(1), // 0 = taker, 1 = maker only
    cancel_on_burst: CancelOnBurstSchema,
    price_band_bps: z.number().int().min(0), // Max deviation from mid
    tif: TifProfileSchema,
});
export const ConstraintOriginSchema = z.object({
    derived_from_metrics: z.object({
        provenance_hash: z.string(), // Hash of the PowerLawMetrics provenance
        window_end_ts: z.number().int(),
        model_id: z.string(),
    }),
    brain_decision_id: z.string(), // UUID of the Brain decision
    reason_codes: z.array(z.string()), // e.g. ["ALPHA_LOW", "VOL_EXPANDING"]
});
export const ConstraintProvenanceSchema = z.object({
    code_hash: z.string(),
    config_hash: z.string(),
    calc_ts: z.number().int(),
    trace_id: z.string(),
});
export const ExecutionConstraintsSchemaV1 = z.object({
    schema_version: z.literal('1'),
    // Identity
    venue: z.string().min(1),
    account: z.string().min(1),
    symbol: z.string().min(1),
    // Lifecycle
    ttl_ms: z.number().int().min(0), // Constraint validity period
    issued_ts: z.number().int(), // When this was issued
    // Modes
    risk_mode: RiskModeSchema, // Current risk level
    mode: PolicyModeSchema, // Enforcement mode (SHADOW/ADVISORY/ENFORCEMENT)
    // Limits - The core constraints
    limits: ConstraintLimitsSchema,
    // Execution Profile - How to execute within limits
    execution_profile: ExecutionProfileSchema,
    // Traceability - Link back to source metrics
    origin: ConstraintOriginSchema,
    // Provenance
    provenance: ConstraintProvenanceSchema,
});
/**
 * Default (defensive) constraints when canonical constraints are missing or stale.
 * This implements FAIL-CLOSED behavior.
 */
export function getDefensiveConstraints(venue, account, symbol, trace_id) {
    const now = Date.now();
    return {
        schema_version: '1',
        venue,
        account,
        symbol,
        ttl_ms: 60000, // 1 minute
        issued_ts: now,
        risk_mode: 'DEFENSIVE',
        mode: 'ENFORCEMENT',
        limits: {
            max_pos_notional: 0, // No new positions
            max_order_notional: 0,
            max_leverage: 0,
            reduce_only: true, // Only allow position reduction
        },
        execution_profile: {
            slicing: {
                max_slice_notional: 0,
                min_slice_notional: 0,
                cadence_ms: 0,
            },
            maker_bias: 1.0, // Maker only
            cancel_on_burst: {
                enabled: true,
                timeout_ms: 1000,
            },
            price_band_bps: 10, // Tight band
            tif: {
                type: 'IOC',
                ttl_ms: 5000,
            },
        },
        origin: {
            derived_from_metrics: {
                provenance_hash: 'defensive-fallback',
                window_end_ts: now,
                model_id: 'defensive-fallback',
            },
            brain_decision_id: 'defensive-fallback',
            reason_codes: ['CONSTRAINTS_MISSING_OR_STALE'],
        },
        provenance: {
            code_hash: 'defensive-fallback',
            config_hash: 'defensive-fallback',
            calc_ts: now,
            trace_id,
        },
    };
}
/**
 * Check if constraints are still valid (not expired).
 */
export function isConstraintValid(constraints) {
    const now = Date.now();
    return now < constraints.issued_ts + constraints.ttl_ms;
}
//# sourceMappingURL=ExecutionConstraints.js.map