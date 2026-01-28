import { z } from 'zod';

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

export const DefaultRiskPolicyV1: RiskPolicyV1 = {
  // Solvency
  maxAccountLeverage: 10.0,
  maxPositionNotional: 50000.0,
  maxDailyLoss: -1000.0,
  maxOpenOrdersPerSymbol: 5,
  symbolWhitelist: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'],
  maxSlippageBps: 100,
  maxStalenessMs: 5000,

  // Strategy
  maxCorrelation: 0.7,
  correlationPenalty: 0.5,
  minConfidenceScore: 0.7,
  minStopDistanceMultiplier: 1.5,

  // Metadata
  version: 1,
  lastUpdated: 0,
};
