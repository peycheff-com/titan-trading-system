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

export const ImpactActionSchema = z.enum([
  'NO_CHANGE', // Metrics checked but no action taken
  'SIZE_THROTTLE', // Order size reduced due to alpha
  'LEVERAGE_CAP', // Leverage capped due to tail risk
  'VETO', // Trade blocked entirely
  'MODE_TRANSITION', // Risk mode changed
  'PROFILE_SHIFT', // Execution profile changed
]);
export type ImpactAction = z.infer<typeof ImpactActionSchema>;

export const PowerLawImpactSchemaV1 = z.object({
  schema_version: z.literal('1'),

  // Identity
  venue: z.string().min(1),
  symbol: z.string().min(1),
  account: z.string().min(1),

  // What happened
  action: ImpactActionSchema,
  severity: z.number().min(0).max(1), // 0 = minor, 1 = critical

  // Before/After state
  before: z.object({
    risk_mode: RiskModeSchema,
    policy_mode: PolicyModeSchema,
    alpha: z.number().nullable(),
    vol_state: z.string(),
  }),
  after: z.object({
    risk_mode: RiskModeSchema,
    policy_mode: PolicyModeSchema,
    alpha: z.number().nullable(),
    vol_state: z.string(),
  }),

  // Decision details
  decision: z.object({
    decision_id: z.string(), // UUID
    reason_codes: z.array(z.string()), // e.g. ["ALPHA_BELOW_2", "VOL_EXPANDING"]
    explanation: z.string(), // Human-readable
  }),

  // If this affected a specific order/signal
  affected_entity: z
    .object({
      type: z.enum(['order', 'signal', 'position']),
      id: z.string(),
      original_size: z.number().nullable(),
      adjusted_size: z.number().nullable(),
    })
    .nullable(),

  // Source metrics that drove this decision
  source_metrics: z.object({
    provenance_hash: z.string(),
    model_id: z.string(),
    window_end_ts: z.number().int(),
    alpha: z.number().nullable(),
    confidence: z.number().min(0).max(1),
    vol_state: z.string(),
  }),

  // Timing
  ts: z.number().int(),

  // Provenance
  provenance: z.object({
    brain_version: z.string(),
    policy_hash: z.string(),
    trace_id: z.string(),
  }),
});

export type PowerLawImpactV1 = z.infer<typeof PowerLawImpactSchemaV1>;

/**
 * Helper to create a NO_CHANGE impact event (common case).
 */
export function createNoChangeImpact(params: {
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
}): PowerLawImpactV1 {
  const now = Date.now();
  return {
    schema_version: '1',
    venue: params.venue,
    symbol: params.symbol,
    account: params.account,
    action: 'NO_CHANGE',
    severity: 0,
    before: {
      risk_mode: params.risk_mode,
      policy_mode: params.policy_mode,
      alpha: params.alpha,
      vol_state: params.vol_state,
    },
    after: {
      risk_mode: params.risk_mode,
      policy_mode: params.policy_mode,
      alpha: params.alpha,
      vol_state: params.vol_state,
    },
    decision: {
      decision_id: crypto.randomUUID(),
      reason_codes: [],
      explanation: 'Metrics within acceptable bounds',
    },
    affected_entity: null,
    source_metrics: {
      provenance_hash: params.provenance_hash,
      model_id: params.model_id,
      window_end_ts: params.window_end_ts,
      alpha: params.alpha,
      confidence: params.confidence,
      vol_state: params.vol_state,
    },
    ts: now,
    provenance: {
      brain_version: params.brain_version,
      policy_hash: params.policy_hash,
      trace_id: params.trace_id,
    },
  };
}
