import { z } from "zod";
import { createEnvelope } from "./envelope";
export const IntentTypeEnum = z.enum([
    "BUY_SETUP",
    "SELL_SETUP",
    "CLOSE_LONG",
    "CLOSE_SHORT",
    "CLOSE",
]);
export const IntentStatusEnum = z.enum([
    "PENDING",
    "VALIDATED",
    "REJECTED",
    "EXECUTED",
    "EXECUTED_PARTIAL",
    "EXPIRED",
    "FAILED",
]);
const RawIntentSchemaV1 = z
    .object({
    schema_version: z.string().optional(),
    signal_id: z.string().min(1),
    source: z.string().optional(),
    symbol: z.string().min(1),
    direction: z
        .number()
        .int()
        .refine((value) => [-1, 0, 1].includes(value), {
        message: "direction must be -1, 0, or 1",
    }),
    type: IntentTypeEnum,
    entry_zone: z.array(z.number()).optional(),
    stop_loss: z.number().optional(),
    // Correlation
    child_fills: z.array(z.string()).default([]), // IDs of child fills (if aggregated)
    // Risk & Governance (P0 Enforce)
    policy_hash: z.string().optional(),
    // Metadata
    take_profits: z.array(z.number()).optional(),
    size: z.number(),
    status: IntentStatusEnum,
    t_signal: z.number().int().optional(),
    timestamp: z.number().int().optional(),
    t_analysis: z.number().int().optional(),
    t_decision: z.number().int().optional(),
    t_ingress: z.number().int().optional(),
    t_exchange: z.number().int().optional(),
    max_slippage_bps: z.number().int().optional(),
    rejection_reason: z.string().optional(),
    regime_state: z.number().int().optional(),
    phase: z.number().int().optional(),
    exchange: z.string().optional(),
    position_mode: z.string().optional(),
    metadata: z.record(z.any()).optional(),
    confidence: z.number().optional(),
    leverage: z.number().optional(),
    expected_impact_bps: z.number().optional(),
    fill_feasibility: z.number().optional(),
    velocity: z.number().optional(),
    trap_type: z.string().optional(),
    parent_strategy: z.string().optional(),
})
    .passthrough();
export const IntentPayloadSchemaV1 = RawIntentSchemaV1.superRefine((data, ctx) => {
    if (data.t_signal === undefined && data.timestamp === undefined) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "t_signal is required (timestamp is accepted as legacy alias)",
            path: ["t_signal"],
        });
    }
}).transform((data) => ({
    ...data,
    t_signal: data.t_signal ?? data.timestamp ?? 0,
    entry_zone: data.entry_zone ?? [],
    take_profits: data.take_profits ?? [],
}));
// Legacy schema export removed to fix duplicate export warning
export function validateIntentPayload(payload) {
    const parsed = IntentPayloadSchemaV1.safeParse(payload);
    if (!parsed.success) {
        return {
            valid: false,
            errors: parsed.error.issues.map((issue) => issue.path.length
                ? `${issue.path.join(".")}: ${issue.message}`
                : issue.message),
        };
    }
    return {
        valid: true,
        errors: [],
        data: parsed.data,
    };
}
import { TITAN_SUBJECTS } from "../messaging/titan_subjects";
export function createIntentMessage(payload, producer, correlationId) {
    // Use Canonical Subject from standard
    return createEnvelope(TITAN_SUBJECTS.CMD.EXECUTION.PREFIX, payload, {
        version: 1,
        producer,
        correlation_id: correlationId,
        idempotency_key: payload.signal_id, // Signal ID doubles as idempotency key for intents
    });
}
//# sourceMappingURL=intentSchema.js.map