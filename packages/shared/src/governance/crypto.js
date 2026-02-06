import nacl from 'tweetnacl';
import { decodeUTF8 } from 'tweetnacl-util';
/**
 * Governance Crypto Utilities
 * Wraps tweetnacl for simpler usage in creating and verifying SignedProposals.
 */
// Hex helpers (signatures often stored as Hex)
function toHex(uint8arr) {
    return Array.from(uint8arr)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
function fromHex(hexStr) {
    return Uint8Array.from({ length: hexStr.length / 2 }, (_, i) => parseInt(hexStr.substring(i * 2, i * 2 + 2), 16));
}
/**
 * Sign a JSON object.
 * 1. Stringify (canonical-ish)
 * 2. Sign
 * 3. Return signature as Hex
 */
export function signObject(obj, privateKeyHex) {
    const msgStr = JSON.stringify(obj);
    const msgBytes = decodeUTF8(msgStr);
    const keyBytes = fromHex(privateKeyHex);
    const signatureBytes = nacl.sign.detached(msgBytes, keyBytes);
    return toHex(signatureBytes);
}
/**
 * Verify a signature for a JSON object.
 */
export function verifyObjectSignature(obj, signatureHex, publicKeyHex) {
    try {
        const msgStr = JSON.stringify(obj);
        const msgBytes = decodeUTF8(msgStr);
        const signatureBytes = fromHex(signatureHex);
        const publicKeyBytes = fromHex(publicKeyHex);
        return nacl.sign.detached.verify(msgBytes, signatureBytes, publicKeyBytes);
    }
    catch (err) {
        console.error('Signature verification failed due to encoding error:', err);
        return false;
    }
}
/**
 * Generate a new keypair (for testing/CLI)
 */
export function generateKeyPair() {
    const pair = nacl.sign.keyPair();
    return {
        publicKey: toHex(pair.publicKey),
        privateKey: toHex(pair.secretKey),
    };
}
//# sourceMappingURL=crypto.js.map