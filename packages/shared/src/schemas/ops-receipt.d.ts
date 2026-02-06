import { z } from 'zod';
import { OpsCommandType } from './ops-command.js';
export declare enum OpsReceiptStatus {
    SUCCESS = "success",
    FAILURE = "failure",
    PENDING = "pending"
}
export declare const OpsReceiptSchemaV1: z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    command_id: z.ZodString;
    ts: z.ZodString;
    type: z.ZodNativeEnum<typeof OpsCommandType>;
    status: z.ZodNativeEnum<typeof OpsReceiptStatus>;
    result: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    error: z.ZodOptional<z.ZodString>;
    meta: z.ZodObject<{
        executor_id: z.ZodString;
        duration_ms: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        executor_id: string;
        duration_ms: number;
    }, {
        executor_id: string;
        duration_ms: number;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: OpsCommandType;
    status: OpsReceiptStatus;
    ts: string;
    v: 1;
    meta: {
        executor_id: string;
        duration_ms: number;
    };
    command_id: string;
    error?: string | undefined;
    result?: Record<string, unknown> | undefined;
}, {
    id: string;
    type: OpsCommandType;
    status: OpsReceiptStatus;
    ts: string;
    v: 1;
    meta: {
        executor_id: string;
        duration_ms: number;
    };
    command_id: string;
    error?: string | undefined;
    result?: Record<string, unknown> | undefined;
}>;
export type OpsReceiptV1 = z.infer<typeof OpsReceiptSchemaV1>;
//# sourceMappingURL=ops-receipt.d.ts.map