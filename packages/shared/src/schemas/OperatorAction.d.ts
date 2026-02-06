import { z } from 'zod';
export declare const OperatorActionTypeEnum: z.ZodEnum<["ARM_SYSTEM", "DISARM_SYSTEM", "FLATTEN_ALL", "UPDATE_CONFIG"]>;
export type OperatorActionType = z.infer<typeof OperatorActionTypeEnum>;
export declare const OperatorActionSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["ARM_SYSTEM", "DISARM_SYSTEM", "FLATTEN_ALL", "UPDATE_CONFIG"]>;
    payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
    reason: z.ZodString;
    operator_id: z.ZodString;
    timestamp: z.ZodNumber;
    signature: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "ARM_SYSTEM" | "DISARM_SYSTEM" | "FLATTEN_ALL" | "UPDATE_CONFIG";
    reason: string;
    timestamp: number;
    operator_id: string;
    payload?: Record<string, any> | undefined;
    signature?: string | undefined;
}, {
    id: string;
    type: "ARM_SYSTEM" | "DISARM_SYSTEM" | "FLATTEN_ALL" | "UPDATE_CONFIG";
    reason: string;
    timestamp: number;
    operator_id: string;
    payload?: Record<string, any> | undefined;
    signature?: string | undefined;
}>;
export type OperatorAction = z.infer<typeof OperatorActionSchema>;
//# sourceMappingURL=OperatorAction.d.ts.map