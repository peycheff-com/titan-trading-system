import { z } from 'zod';
export declare enum OpsCommandType {
    RESTART = "restart",
    DEPLOY = "deploy",
    CANCEL_ALL = "cancel_all",
    SET_RISK = "set_risk",
    HALT = "halt",
    DISARM = "disarm",
    ARM = "arm",
    EXPORT_EVIDENCE = "export_evidence"
}
export declare const OpsCommandSchemaV1: z.ZodObject<{
    v: z.ZodLiteral<1>;
    id: z.ZodString;
    ts: z.ZodString;
    type: z.ZodNativeEnum<typeof OpsCommandType>;
    target: z.ZodString;
    params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    meta: z.ZodObject<{
        initiator_id: z.ZodString;
        reason: z.ZodString;
        signature: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        signature: string;
        initiator_id: string;
    }, {
        reason: string;
        signature: string;
        initiator_id: string;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: OpsCommandType;
    ts: string;
    target: string;
    v: 1;
    meta: {
        reason: string;
        signature: string;
        initiator_id: string;
    };
    params?: Record<string, unknown> | undefined;
}, {
    id: string;
    type: OpsCommandType;
    ts: string;
    target: string;
    v: 1;
    meta: {
        reason: string;
        signature: string;
        initiator_id: string;
    };
    params?: Record<string, unknown> | undefined;
}>;
export type OpsCommandV1 = z.infer<typeof OpsCommandSchemaV1>;
//# sourceMappingURL=ops-command.d.ts.map