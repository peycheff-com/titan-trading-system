import * as fs from "fs";
import * as crypto from "crypto";
import * as path from "path";

/**
 * Generates an Ed25519 keypair for signing.
 * Writes keys to files if paths provided, or prints to stdout.
 */
export function generateKeys(privateKeyPath?: string, publicKeyPath?: string) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519", {
        modulusLength: 4096,
        publicKeyEncoding: {
            type: "spki",
            format: "pem",
        },
        privateKeyEncoding: {
            type: "pkcs8",
            format: "pem",
        },
    });

    if (privateKeyPath && publicKeyPath) {
        fs.writeFileSync(privateKeyPath, privateKey);
        fs.writeFileSync(publicKeyPath, publicKey);
        console.log(`Keys generated at ${privateKeyPath} and ${publicKeyPath}`);
    } else {
        console.log("PRIVATE KEY:");
        console.log(privateKey);
        console.log("PUBLIC KEY:");
        console.log(publicKey);
    }
}

/**
 * Signs a file using a private key.
 * Returns the signature as a base64 string.
 */
export function signFile(filePath: string, privateKeyPem: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const sign = crypto.createSign("SHA256");
    sign.update(fileBuffer);
    sign.end();
    // For Ed25519 we usually use sign() directly but node's createSign supports it if key is correct type,
    // actually for Ed25519 use crypto.sign(null, data, privateKey)
    // But standardized way:
    return crypto.sign(null, fileBuffer, privateKeyPem).toString("base64");
}

/**
 * Verifies a file signature.
 * Returns true if valid, false otherwise.
 */
export function verifyFile(
    filePath: string,
    signatureBase64: string,
    publicKeyPem: string,
): boolean {
    const fileBuffer = fs.readFileSync(filePath);
    const signatureBuffer = Buffer.from(signatureBase64, "base64");
    return crypto.verify(null, fileBuffer, publicKeyPem, signatureBuffer);
}

// CLI Wrapper
import { fileURLToPath } from "url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const command = process.argv[2];
    const args = process.argv.slice(3);

    try {
        if (command === "keygen") {
            generateKeys(args[0], args[1]);
        } else if (command === "sign") {
            const [filePath, keyPath] = args;
            if (!filePath || !keyPath) {
                throw new Error("Usage: sign <file> <private_key_path>");
            }
            const key = fs.readFileSync(keyPath, "utf8");
            const sig = signFile(filePath, key);
            // Write signature to .sig file
            fs.writeFileSync(`${filePath}.sig`, sig);
            console.log(`Signed ${filePath} -> ${filePath}.sig`);
        } else if (command === "verify") {
            const [filePath, sigPath, pubKeyPath] = args;
            if (!filePath || !sigPath || !pubKeyPath) {
                throw new Error(
                    "Usage: verify <file> <sig_file> <public_key_path>",
                );
            }
            const sig = fs.readFileSync(sigPath, "utf8");
            const key = fs.readFileSync(pubKeyPath, "utf8");
            const valid = verifyFile(filePath, sig, key);
            if (valid) {
                console.log("✅ Signature Verified");
                process.exit(0);
            } else {
                console.error("❌ Signature Verification FAILED");
                process.exit(1);
            }
        } else {
            console.log("Usage: node provenance.js [keygen|sign|verify] ...");
        }
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
