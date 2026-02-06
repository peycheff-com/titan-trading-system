import { z } from 'zod';
export var OpsCommandType;
(function (OpsCommandType) {
    OpsCommandType["RESTART"] = "restart";
    OpsCommandType["DEPLOY"] = "deploy";
    OpsCommandType["CANCEL_ALL"] = "cancel_all";
    OpsCommandType["SET_RISK"] = "set_risk";
    OpsCommandType["HALT"] = "halt";
    OpsCommandType["DISARM"] = "disarm";
    OpsCommandType["ARM"] = "arm";
    OpsCommandType["EXPORT_EVIDENCE"] = "export_evidence";
})(OpsCommandType || (OpsCommandType = {}));
export const OpsCommandSchemaV1 = z.object({
    v: z.literal(1),
    id: z.string().uuid(),
    ts: z.string().datetime(),
    type: z.nativeEnum(OpsCommandType),
    target: z.string(), // Service name or "all"
    params: z.record(z.string(), z.unknown()).optional(),
    meta: z.object({
        initiator_id: z.string(), // User ID
        reason: z.string(),
        signature: z.string(), // HMAC
    }),
});
//# sourceMappingURL=ops-command.js.map