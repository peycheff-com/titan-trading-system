import crypto from 'crypto';
import stringify from 'fast-json-stable-stringify';
/**
 * Calculates the HMAC signature for an OpsCommand.
 * The signature covers the entire command object EXCEPT meta.signature.
 */
export function calculateOpsSignature(command, secret) {
    const { meta, ...payload } = command;
    // Reconstruct the signable payload
    // We explicitly preserve order or structure if needed, but fast-json-stable-stringify handles key sorting.
    // The essential part is that meta.signature is EXCLUDED.
    const signable = {
        ...payload,
        meta: {
            initiator_id: meta.initiator_id,
            reason: meta.reason,
        },
    };
    const str = stringify(signable);
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(str);
    return hmac.digest('hex');
}
/**
 * Verify an OpsCommand signature.
 */
export function verifyOpsCommand(command, secret) {
    if (!command.meta?.signature)
        return false;
    const expected = calculateOpsSignature(command, secret);
    const sigBuffer = Buffer.from(command.meta.signature);
    const expBuffer = Buffer.from(expected);
    if (sigBuffer.length !== expBuffer.length) {
        return false;
    }
    return crypto.timingSafeEqual(sigBuffer, expBuffer);
}
//# sourceMappingURL=ops-security.js.map