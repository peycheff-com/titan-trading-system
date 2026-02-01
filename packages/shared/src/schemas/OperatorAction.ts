import { z } from "zod";

export const OperatorActionTypeEnum = z.enum([
    "ARM_SYSTEM",
    "DISARM_SYSTEM",
    "FLATTEN_ALL",
    "UPDATE_CONFIG",
]);

export type OperatorActionType = z.infer<typeof OperatorActionTypeEnum>;

export const OperatorActionSchema = z.object({
    id: z.string().uuid(),
    type: OperatorActionTypeEnum,
    payload: z.record(z.any()).optional(),
    reason: z.string().min(1),
    operator_id: z.string().min(1),
    timestamp: z.number(),
    signature: z.string().optional(), // For future P2 signed actions
});

export type OperatorAction = z.infer<typeof OperatorActionSchema>;
