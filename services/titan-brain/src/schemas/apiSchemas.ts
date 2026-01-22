import { z } from 'zod';

// Common Schemas
export const TimestampSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .default(() => Date.now());
export const PhaseIdSchema = z.enum(['phase1', 'phase2', 'phase3']);
export const SideSchema = z.enum(['BUY', 'SELL']);
export const DirectionSchema = z.enum(['LONG', 'SHORT']);
export const SymbolSchema = z
  .string()
  .min(3)
  .max(20)
  .regex(/^[A-Z0-9]+$/);

// Signal Request Body
export const SignalRequestSchema = z.object({
  signalId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/),
  phaseId: PhaseIdSchema,
  symbol: SymbolSchema,
  side: SideSchema,
  requestedSize: z.number().positive().min(0.000001).max(1000000),
  leverage: z.number().min(1).max(100).optional(),
  trap_type: z.string().optional(),
  timestamp: TimestampSchema,
});

// Manual Override Request Body
export const AllocationWeightsSchema = z
  .object({
    w1: z.number().min(0).max(1),
    w2: z.number().min(0).max(1),
    w3: z.number().min(0).max(1),
  })
  .refine((data) => Math.abs(data.w1 + data.w2 + data.w3 - 1.0) <= 0.001, {
    message: 'Allocation weights must sum to 1.0',
  });

export const OverrideRequestSchema = z.object({
  operatorId: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  allocation: AllocationWeightsSchema,
  reason: z.string().min(1),
  durationHours: z.number().positive().optional(),
});

// Deactivate Override
export const DeactivateOverrideSchema = z.object({
  operatorId: z.string().min(1),
  password: z.string().min(1),
});

// Create Operator
export const CreateOperatorSchema = z.object({
  operatorId: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  permissions: z.array(z.string()).min(1).max(20), // Could make strict enum if known
});

// Phase Notification / Raw Signal
export const PhaseSignalSchema = z.object({
  signal_id: z.string().min(1),
  symbol: z.string().min(1),
  direction: DirectionSchema,
  size: z.number().min(0).optional().default(0),
  entry_price: z.number().optional(),
  stop_loss: z.number().optional(),
  take_profit: z.array(z.number()).optional(),
  leverage: z.number().optional(),
  confidence: z.number().optional(),
  trap_type: z.string().optional(),
  timestamp: TimestampSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Phase Register
export const PhaseRegisterSchema = z.object({
  phaseId: PhaseIdSchema,
  webhookUrl: z.string().url(),
});

// Circuit Breaker Reset
export const BreakerResetSchema = z.object({
  operatorId: z.string().min(1),
});

// Manual Trade Request
export const ManualTradeSchema = z.object({
  symbol: SymbolSchema,
  side: SideSchema,
  size: z.number().positive().min(0.000001).max(1000000),
  leverage: z.number().min(1).max(100).optional(),
  exchange: z.string().optional(),
  bypassRisk: z.boolean().optional(),
  timestamp: TimestampSchema,
});

// Types inferred from schemas for usage in handlers
export type SignalRequestBody = z.infer<typeof SignalRequestSchema>;
export type OverrideRequestBody = z.infer<typeof OverrideRequestSchema>;
export type DeactivateOverrideRequestBody = z.infer<typeof DeactivateOverrideSchema>;
export type CreateOperatorRequestBody = z.infer<typeof CreateOperatorSchema>;
export type RawPhaseSignalBody = z.infer<typeof PhaseSignalSchema>;
export type PhaseRegisterBody = z.infer<typeof PhaseRegisterSchema>;
// Login Request
export const LoginSchema = z.object({
  operatorId: z.string().min(1),
  password: z.string().min(1),
});

export type BreakerResetBody = z.infer<typeof BreakerResetSchema>;
export type ManualTradeRequestBody = z.infer<typeof ManualTradeSchema>;
export type LoginRequestBody = z.infer<typeof LoginSchema>;
