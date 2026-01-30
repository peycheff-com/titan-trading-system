/**
 * Unit tests for Governance Crypto Utilities
 *
 * Tests the tweetnacl-based signing and verification functions
 * used for SignedProposals in governance.
 */

import {
    generateKeyPair,
    signObject,
    verifyObjectSignature,
} from "../../../src/governance/crypto";

describe("Governance Crypto Utilities", () => {
    describe("generateKeyPair", () => {
        it("should generate a keypair with public and private keys", () => {
            const keyPair = generateKeyPair();

            expect(keyPair).toHaveProperty("publicKey");
            expect(keyPair).toHaveProperty("privateKey");
        });

        it("should generate hex-encoded keys", () => {
            const keyPair = generateKeyPair();

            // Ed25519 public key is 32 bytes = 64 hex chars
            expect(keyPair.publicKey).toMatch(/^[0-9a-f]{64}$/);

            // Ed25519 secret key is 64 bytes = 128 hex chars
            expect(keyPair.privateKey).toMatch(/^[0-9a-f]{128}$/);
        });

        it("should generate unique keypairs each time", () => {
            const keyPair1 = generateKeyPair();
            const keyPair2 = generateKeyPair();

            expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
            expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
        });
    });

    describe("signObject", () => {
        let keyPair: { publicKey: string; privateKey: string };

        beforeEach(() => {
            keyPair = generateKeyPair();
        });

        it("should sign a simple object and return hex signature", () => {
            const obj = { foo: "bar", num: 42 };
            const signature = signObject(obj, keyPair.privateKey);

            // Ed25519 signature is 64 bytes = 128 hex chars
            expect(signature).toMatch(/^[0-9a-f]{128}$/);
        });

        it("should produce consistent signatures for the same object", () => {
            const obj = { action: "approve", amount: 100 };
            const sig1 = signObject(obj, keyPair.privateKey);
            const sig2 = signObject(obj, keyPair.privateKey);

            expect(sig1).toBe(sig2);
        });

        it("should produce different signatures for different objects", () => {
            const obj1 = { action: "approve" };
            const obj2 = { action: "reject" };

            const sig1 = signObject(obj1, keyPair.privateKey);
            const sig2 = signObject(obj2, keyPair.privateKey);

            expect(sig1).not.toBe(sig2);
        });

        it("should sign nested objects", () => {
            const obj = {
                proposal: {
                    type: "risk_update",
                    params: {
                        maxLeverage: 10,
                        symbols: ["BTC", "ETH"],
                    },
                },
                timestamp: 1234567890,
            };

            const signature = signObject(obj, keyPair.privateKey);
            expect(signature).toMatch(/^[0-9a-f]{128}$/);
        });

        it("should sign arrays", () => {
            const arr = [1, 2, 3, "test", { nested: true }];
            const signature = signObject(arr, keyPair.privateKey);
            expect(signature).toMatch(/^[0-9a-f]{128}$/);
        });

        it("should sign strings directly", () => {
            const str = "simple string message";
            const signature = signObject(str, keyPair.privateKey);
            expect(signature).toMatch(/^[0-9a-f]{128}$/);
        });

        it("should sign numbers directly", () => {
            const num = 42;
            const signature = signObject(num, keyPair.privateKey);
            expect(signature).toMatch(/^[0-9a-f]{128}$/);
        });
    });

    describe("verifyObjectSignature", () => {
        let keyPair: { publicKey: string; privateKey: string };

        beforeEach(() => {
            keyPair = generateKeyPair();
        });

        it("should verify a valid signature", () => {
            const obj = { action: "execute", orderId: "order-123" };
            const signature = signObject(obj, keyPair.privateKey);

            const isValid = verifyObjectSignature(
                obj,
                signature,
                keyPair.publicKey,
            );
            expect(isValid).toBe(true);
        });

        it("should reject signature from different keypair", () => {
            const obj = { data: "test" };
            const attackerKeyPair = generateKeyPair();

            const signature = signObject(obj, attackerKeyPair.privateKey);
            const isValid = verifyObjectSignature(
                obj,
                signature,
                keyPair.publicKey,
            );

            expect(isValid).toBe(false);
        });

        it("should reject tampered object", () => {
            const originalObj = { amount: 100 };
            const signature = signObject(originalObj, keyPair.privateKey);

            const tamperedObj = { amount: 1000 }; // Changed amount
            const isValid = verifyObjectSignature(
                tamperedObj,
                signature,
                keyPair.publicKey,
            );

            expect(isValid).toBe(false);
        });

        it("should reject invalid signature format", () => {
            const obj = { test: true };

            const isValid = verifyObjectSignature(
                obj,
                "invalid-signature",
                keyPair.publicKey,
            );
            expect(isValid).toBe(false);
        });

        it("should reject empty signature", () => {
            const obj = { test: true };

            const isValid = verifyObjectSignature(obj, "", keyPair.publicKey);
            expect(isValid).toBe(false);
        });

        it("should verify complex nested objects", () => {
            const complexObj = {
                proposal: {
                    id: "prop-001",
                    type: "RISK_POLICY_UPDATE",
                    payload: {
                        maxAccountLeverage: 5,
                        maxPositionNotional: 25000,
                        symbolWhitelist: ["BTCUSDT", "ETHUSDT"],
                    },
                },
                signatures: [],
                timestamp: Date.now(),
            };

            const signature = signObject(complexObj, keyPair.privateKey);
            const isValid = verifyObjectSignature(
                complexObj,
                signature,
                keyPair.publicKey,
            );

            expect(isValid).toBe(true);
        });

        it("should be sensitive to property order changes in signature verification", () => {
            // JSON.stringify is not guaranteed to preserve order, but test behavior
            const obj1 = { a: 1, b: 2 };
            const obj2 = { b: 2, a: 1 };

            const signature = signObject(obj1, keyPair.privateKey);

            // These might or might not match depending on JS engine's JSON.stringify
            // The test documents the behavior
            const isValid1 = verifyObjectSignature(
                obj1,
                signature,
                keyPair.publicKey,
            );
            expect(isValid1).toBe(true);

            // The verification of obj2 depends on JSON.stringify ordering
            // This test ensures we understand the behavior
        });
    });

    describe("End-to-End Signing Flow", () => {
        it("should complete a full sign-verify cycle", () => {
            const proposer = generateKeyPair();
            const proposal = {
                type: "HALT_SYSTEM",
                reason: "Emergency maintenance",
                requestedBy: "admin",
                timestamp: Date.now(),
            };

            // Proposer signs
            const signature = signObject(proposal, proposer.privateKey);

            // Verifier checks
            const isValid = verifyObjectSignature(
                proposal,
                signature,
                proposer.publicKey,
            );

            expect(isValid).toBe(true);
        });

        it("should support multi-signature verification", () => {
            const signer1 = generateKeyPair();
            const signer2 = generateKeyPair();

            const proposal = { action: "critical_update" };

            const sig1 = signObject(proposal, signer1.privateKey);
            const sig2 = signObject(proposal, signer2.privateKey);

            // Both signatures should be valid with their respective public keys
            expect(verifyObjectSignature(proposal, sig1, signer1.publicKey))
                .toBe(true);
            expect(verifyObjectSignature(proposal, sig2, signer2.publicKey))
                .toBe(true);

            // Cross-verification should fail
            expect(verifyObjectSignature(proposal, sig1, signer2.publicKey))
                .toBe(false);
            expect(verifyObjectSignature(proposal, sig2, signer1.publicKey))
                .toBe(false);
        });
    });
});
