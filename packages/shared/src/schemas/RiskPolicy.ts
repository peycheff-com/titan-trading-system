import { z } from 'zod';
import { createHash } from 'crypto';
import riskPolicyJson from '../../risk_policy.json';

export const RiskPolicySchemaV1 = z.object({
  // --- Solvency Constraints (Rust Veto) ---
  maxAccountLeverage: z.number().min(0).max(100),
  maxPositionNotional: z.number().min(0),
  maxDailyLoss: z.number().max(0), // Negative value (e.g. -1000)
  maxOpenOrdersPerSymbol: z.number().int().min(0),
  symbolWhitelist: z.array(z.string()),
  maxSlippageBps: z.number().int().min(0),
  maxStalenessMs: z.number().int().min(0),

  // --- Strategy Constraints (Brain Veto) ---
  maxCorrelation: z.number().min(-1).max(1),
  correlationPenalty: z.number().min(0).max(1),
  minConfidenceScore: z.number().min(0).max(1),
  minStopDistanceMultiplier: z.number().min(0),

  // --- Metadata ---
  version: z.literal(1),
  lastUpdated: z.number(),
});

export type RiskPolicyV1 = z.infer<typeof RiskPolicySchemaV1>;

// Validate the JSON against the schema at runtime/import time to ensure it matches
const validatedPolicy = RiskPolicySchemaV1.parse(riskPolicyJson);

/**
 * Returns the canonical Risk Policy and its SHA256 hash.
 * This ensures that the policy used by the application matches the source of truth.
 */
export function getCanonicalRiskPolicy() {
  // Canonicalize JSON (sort keys recursively) so TS and Rust compute identical hashes.
  const canonicalize = (obj: unknown): unknown => {
    if (typeof obj !== 'object' || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(canonicalize);
    return Object.keys(obj as object)
      .sort()
      .reduce((sorted: Record<string, unknown>, key) => {
        // eslint-disable-next-line functional/immutable-data
        sorted[key] = canonicalize((obj as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  };

  const policyString = JSON.stringify(canonicalize(riskPolicyJson));
  const hash = createHash('sha256').update(policyString).digest('hex');

  return {
    policy: validatedPolicy,
    hash,
    version: validatedPolicy.version,
  };
}

// Re-export for backward compatibility during migration, but ideally use getCanonicalRiskPolicy
export const DefaultRiskPolicyV1: RiskPolicyV1 = validatedPolicy;
