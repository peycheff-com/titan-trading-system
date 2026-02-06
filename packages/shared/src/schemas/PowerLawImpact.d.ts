import { z } from 'zod';
import { PolicyModeSchema, RiskModeSchema } from './ExecutionConstraints.js';
/**
 * PowerLaw Impact Event Schema V1
 *
 * Subject: titan.evt.powerlaw.impact.v1.{venue}.{symbol}
 *
 * Emitted by Brain when power-law metrics influence a decision.
 * Used for audit trail, operator visibility, and impact analysis.
 */
export declare const ImpactActionSchema: z.ZodEnum<["NO_CHANGE", "SIZE_THROTTLE", "LEVERAGE_CAP", "VETO", "MODE_TRANSITION", "PROFILE_SHIFT"]>;
export type ImpactAction = z.infer<typeof ImpactActionSchema>;
export declare const PowerLawImpactSchemaV1: z.ZodObject<{
    schema_version: z.ZodLiteral<"1">;
    venue: z.ZodString;
    symbol: z.ZodString;
    account: z.ZodString;
    action: z.ZodEnum<["NO_CHANGE", "SIZE_THROTTLE", "LEVERAGE_CAP", "VETO", "MODE_TRANSITION", "PROFILE_SHIFT"]>;
    severity: z.ZodNumber;
    before: z.ZodObject<{
        risk_mode: z.ZodEnum<["NORMAL", "CAUTION", "DEFENSIVE", "EMERGENCY"]>;
        policy_mode: z.ZodEnum<["SHADOW", "ADVISORY", "ENFORCEMENT"]>;
        alpha: z.ZodNullable<z.ZodNumber>;
        vol_state: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        alpha: number | null;
        risk_mode: "NORMAL" | "CAUTION" | "DEFENSIVE" | "EMERGENCY";
        policy_mode: "SHADOW" | "ADVISORY" | "ENFORCEMENT";
        vol_state: string;
    }, {
        alpha: number | null;
        risk_mode: "NORMAL" | "CAUTION" | "DEFENSIVE" | "EMERGENCY";
        policy_mode: "SHADOW" | "ADVISORY" | "ENFORCEMENT";
        vol_state: string;
    }>;
    after: z.ZodObject<{
        risk_mode: z.ZodEnum<["NORMAL", "CAUTION", "DEFENSIVE", "EMERGENCY"]>;
        policy_mode: z.ZodEnum<["SHADOW", "ADVISORY", "ENFORCEMENT"]>;
        alpha: z.ZodNullable<z.ZodNumber>;
        vol_state: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        alpha: number | null;
        risk_mode: "NORMAL" | "CAUTION" | "DEFENSIVE" | "EMERGENCY";
        policy_mode: "SHADOW" | "ADVISORY" | "ENFORCEMENT";
        vol_state: string;
    }, {
        alpha: number | null;
        risk_mode: "NORMAL" | "CAUTION" | "DEFENSIVE" | "EMERGENCY";
        policy_mode: "SHADOW" | "ADVISORY" | "ENFORCEMENT";
        vol_state: string;
    }>;
    decision: z.ZodObject<{
        decision_id: z.ZodString;
        reason_codes: z.ZodArray<z.ZodString, "many">;
        explanation: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        reason_codes: string[];
        decision_id: string;
        explanation: string;
    }, {
        reason_codes: string[];
        decision_id: string;
        explanation: string;
    }>;
    affected_entity: z.ZodNullable<z.ZodObject<{
        type: z.ZodEnum<["order", "signal", "position"]>;
        id: z.ZodString;
        original_size: z.ZodNullable<z.ZodNumber>;
        adjusted_size: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        type: "signal" | "order" | "position";
        original_size: number | null;
        adjusted_size: number | null;
    }, {
        id: string;
        type: "signal" | "order" | "position";
        original_size: number | null;
        adjusted_size: number | null;
    }>>;
    source_metrics: z.ZodObject<{
        provenance_hash: z.ZodString;
        model_id: z.ZodString;
        window_end_ts: z.ZodNumber;
        alpha: z.ZodNullable<z.ZodNumber>;
        confidence: z.ZodNumber;
        vol_state: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        confidence: number;
        model_id: string;
        alpha: number | null;
        provenance_hash: string;
        window_end_ts: number;
        vol_state: string;
    }, {
        confidence: number;
        model_id: string;
        alpha: number | null;
        provenance_hash: string;
        window_end_ts: number;
        vol_state: string;
    }>;
    ts: z.ZodNumber;
    provenance: z.ZodObject<{
        brain_version: z.ZodString;
        policy_hash: z.ZodString;
        trace_id: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        policy_hash: string;
        trace_id: string;
        brain_version: string;
    }, {
        policy_hash: string;
        trace_id: string;
        brain_version: string;
    }>;
}, "strip", z.ZodTypeAny, {
    symbol: string;
    action: "NO_CHANGE" | "SIZE_THROTTLE" | "LEVERAGE_CAP" | "VETO" | "MODE_TRANSITION" | "PROFILE_SHIFT";
    ts: number;
    schema_version: "1";
    severity: number;
    venue: string;
    account: string;
    provenance: {
        policy_hash: string;
        trace_id: string;
        brain_version: string;
    };
    before: {
        alpha: number | null;
        risk_mode: "NORMAL" | "CAUTION" | "DEFENSIVE" | "EMERGENCY";
        policy_mode: "SHADOW" | "ADVISORY" | "ENFORCEMENT";
        vol_state: string;
    };
    after: {
        alpha: number | null;
        risk_mode: "NORMAL" | "CAUTION" | "DEFENSIVE" | "EMERGENCY";
        policy_mode: "SHADOW" | "ADVISORY" | "ENFORCEMENT";
        vol_state: string;
    };
    decision: {
        reason_codes: string[];
        decision_id: string;
        explanation: string;
    };
    affected_entity: {
        id: string;
        type: "signal" | "order" | "position";
        original_size: number | null;
        adjusted_size: number | null;
    } | null;
    source_metrics: {
        confidence: number;
        model_id: string;
        alpha: number | null;
        provenance_hash: string;
        window_end_ts: number;
        vol_state: string;
    };
}, {
    symbol: string;
    action: "NO_CHANGE" | "SIZE_THROTTLE" | "LEVERAGE_CAP" | "VETO" | "MODE_TRANSITION" | "PROFILE_SHIFT";
    ts: number;
    schema_version: "1";
    severity: number;
    venue: string;
    account: string;
    provenance: {
        policy_hash: string;
        trace_id: string;
        brain_version: string;
    };
    before: {
        alpha: number | null;
        risk_mode: "NORMAL" | "CAUTION" | "DEFENSIVE" | "EMERGENCY";
        policy_mode: "SHADOW" | "ADVISORY" | "ENFORCEMENT";
        vol_state: string;
    };
    after: {
        alpha: number | null;
        risk_mode: "NORMAL" | "CAUTION" | "DEFENSIVE" | "EMERGENCY";
        policy_mode: "SHADOW" | "ADVISORY" | "ENFORCEMENT";
        vol_state: string;
    };
    decision: {
        reason_codes: string[];
        decision_id: string;
        explanation: string;
    };
    affected_entity: {
        id: string;
        type: "signal" | "order" | "position";
        original_size: number | null;
        adjusted_size: number | null;
    } | null;
    source_metrics: {
        confidence: number;
        model_id: string;
        alpha: number | null;
        provenance_hash: string;
        window_end_ts: number;
        vol_state: string;
    };
}>;
export type PowerLawImpactV1 = z.infer<typeof PowerLawImpactSchemaV1>;
/**
 * Helper to create a NO_CHANGE impact event (common case).
 */
export declare function createNoChangeImpact(params: {
    venue: string;
    symbol: string;
    account: string;
    risk_mode: z.infer<typeof RiskModeSchema>;
    policy_mode: z.infer<typeof PolicyModeSchema>;
    alpha: number | null;
    vol_state: string;
    provenance_hash: string;
    model_id: string;
    window_end_ts: number;
    confidence: number;
    brain_version: string;
    policy_hash: string;
    trace_id: string;
}): PowerLawImpactV1;
//# sourceMappingURL=PowerLawImpact.d.ts.map