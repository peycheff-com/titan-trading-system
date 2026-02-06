import { OpsCommandV1 } from '../schemas/ops-command.js';
/**
 * Calculates the HMAC signature for an OpsCommand.
 * The signature covers the entire command object EXCEPT meta.signature.
 */
export declare function calculateOpsSignature(command: OpsCommandV1, secret: string): string;
/**
 * Verify an OpsCommand signature.
 */
export declare function verifyOpsCommand(command: OpsCommandV1, secret: string): boolean;
//# sourceMappingURL=ops-security.d.ts.map