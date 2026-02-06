/**
 * Sign a JSON object.
 * 1. Stringify (canonical-ish)
 * 2. Sign
 * 3. Return signature as Hex
 */
export declare function signObject(obj: unknown, privateKeyHex: string): string;
/**
 * Verify a signature for a JSON object.
 */
export declare function verifyObjectSignature(obj: unknown, signatureHex: string, publicKeyHex: string): boolean;
/**
 * Generate a new keypair (for testing/CLI)
 */
export declare function generateKeyPair(): {
    publicKey: string;
    privateKey: string;
};
//# sourceMappingURL=crypto.d.ts.map