import { z } from 'zod';
import { OpsCommandType } from './ops-command.js';
export var OpsReceiptStatus;
(function (OpsReceiptStatus) {
    OpsReceiptStatus["SUCCESS"] = "success";
    OpsReceiptStatus["FAILURE"] = "failure";
    OpsReceiptStatus["PENDING"] = "pending";
})(OpsReceiptStatus || (OpsReceiptStatus = {}));
export const OpsReceiptSchemaV1 = z.object({
    v: z.literal(1),
    id: z.string().uuid(),
    command_id: z.string().uuid(),
    ts: z.string().datetime(),
    type: z.nativeEnum(OpsCommandType),
    status: z.nativeEnum(OpsReceiptStatus),
    result: z.record(z.string(), z.unknown()).optional(),
    error: z.string().optional(),
    meta: z.object({
        executor_id: z.string(), // Host/Pod ID
        duration_ms: z.number(),
    }),
});
//# sourceMappingURL=ops-receipt.js.map