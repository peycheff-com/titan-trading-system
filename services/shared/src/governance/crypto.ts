import nacl from "tweetnacl";
import { decodeUTF8 } from "tweetnacl-util";

/**
 * Governance Crypto Utilities
 * Wraps tweetnacl for simpler usage in creating and verifying SignedProposals.
 */

// Hex helpers (signatures often stored as Hex)
function toHex(uint8arr: Uint8Array): string {
    return Array.from(uint8arr)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

function fromHex(hexStr: string): Uint8Array {
    // eslint-disable-next-line functional/no-let
    const bytes = new Uint8Array(hexStr.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        // eslint-disable-next-line functional/immutable-data
        bytes[i] = parseInt(hexStr.substr(i * 2, 2), 16);
    }
    return bytes;
}

/**
 * Sign a JSON object.
 * 1. Stringify (canonical-ish)
 * 2. Sign
 * 3. Return signature as Hex
 */
export function signObject(obj: unknown, privateKeyHex: string): string {
    const msgStr = JSON.stringify(obj);
    const msgBytes = decodeUTF8(msgStr);
    const keyBytes = fromHex(privateKeyHex);

    const signatureBytes = nacl.sign.detached(msgBytes, keyBytes);
    return toHex(signatureBytes);
}

/**
 * Verify a signature for a JSON object.
 */
export function verifyObjectSignature(
    obj: unknown,
    signatureHex: string,
    publicKeyHex: string,
): boolean {
    try {
        const msgStr = JSON.stringify(obj);
        const msgBytes = decodeUTF8(msgStr);
        const signatureBytes = fromHex(signatureHex);
        const publicKeyBytes = fromHex(publicKeyHex);

        return nacl.sign.detached.verify(
            msgBytes,
            signatureBytes,
            publicKeyBytes,
        );
    } catch (err) {
        console.error(
            "Signature verification failed due to encoding error:",
            err,
        );
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
