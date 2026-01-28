import { HMACValidator } from "../../src/security/HMACValidator";
import { AuthMiddleware } from "../../src/security/AuthMiddleware";
import { Logger } from "../../src/logging/Logger";

// Mock Logger
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
} as unknown as Logger;

describe("Security Enforcement Verification", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe("HMACValidator", () => {
        it("should throw in non-test env if secret is missing", () => {
            delete process.env.HMAC_SECRET;
            process.env.NODE_ENV = "production";

            expect(() => {
                HMACValidator.fromEnvironment(mockLogger);
            }).toThrow("HMAC_SECRET environment variable is required");
        });

        it("should allow valid signature with correct secret", () => {
            process.env.HMAC_SECRET = "verification-secret-123";
            process.env.NODE_ENV = "production";

            const validator = HMACValidator.fromEnvironment(mockLogger);
            const payload = JSON.stringify({ data: "safe code" });
            // Generate standard signature
            const headers = validator.createHeaders(payload);

            // Validate
            const result = validator.validateRequest(payload, headers);
            expect(result.valid).toBe(true);
        });

        it("should reject invalid signature", () => {
            process.env.HMAC_SECRET = "verification-secret-123";
            const validator = HMACValidator.fromEnvironment(mockLogger);
            const payload = "some data";
            const headers = {
                "x-signature": "badsignature",
                "x-timestamp": String(Date.now() / 1000),
            };

            const result = validator.validateRequest(payload, headers);
            expect(result.valid).toBe(false);
        });
    });

    describe("AuthMiddleware", () => {
        it("should throw in production if secrets are missing", () => {
            delete process.env.JWT_SECRET;
            delete process.env.HMAC_SECRET;
            process.env.NODE_ENV = "production";

            expect(() => {
                new AuthMiddleware(mockLogger);
            }).toThrow("FATAL: JWT_SECRET or HMAC_SECRET must be set");
        });

        it("should fallback to test secret in test env", () => {
            delete process.env.JWT_SECRET;
            delete process.env.HMAC_SECRET;
            process.env.NODE_ENV = "test";

            const auth = new AuthMiddleware(mockLogger);
            expect(auth).toBeDefined();
            // Should verify it generates signature with test secret
            const token = auth.generateToken("test-op", "admin");
            expect(token).toBeDefined();
        });
    });
});
