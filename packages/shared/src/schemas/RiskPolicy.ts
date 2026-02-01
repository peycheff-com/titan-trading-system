import { z } from "zod";
import { createHash } from "crypto";
import riskPolicyJson from "../../risk_policy.json";

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
  const policyString = JSON.stringify(riskPolicyJson);
  const hash = createHash("sha256").update(policyString).digest("hex");

  return {
    policy: validatedPolicy,
    hash,
    version: validatedPolicy.version,
  };
}

// Re-export for backward compatibility during migration, but ideally use getCanonicalRiskPolicy
export const DefaultRiskPolicyV1: RiskPolicyV1 = validatedPolicy;
