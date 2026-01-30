/**
 * ConfigManager Unit Tests
 * Tests configuration management for AI-Quant service
 */
import { ConfigManager } from "../../src/config/ConfigManager.js";

// Mock the @titan/shared dependencies before importing
jest.mock("@titan/shared", () => ({
    ConfigManager: jest.fn(),
    getConfigManager: jest.fn().mockReturnValue({
        get: jest.fn(),
    }),
    loadSecretsFromFiles: jest.fn(),
}));

describe("ConfigManager", () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalEnv = { ...process.env };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe("get", () => {
        it("should return environment variable value", () => {
            process.env.TEST_KEY = "test_value";
            const configManager = new ConfigManager();
            expect(configManager.get("TEST_KEY")).toBe("test_value");
        });

        it("should return undefined for missing key", () => {
            const configManager = new ConfigManager();
            expect(configManager.get("NONEXISTENT_KEY")).toBeUndefined();
        });
    });

    describe("getRequired", () => {
        it("should return value for existing key", () => {
            process.env.REQUIRED_KEY = "required_value";
            const configManager = new ConfigManager();
            expect(configManager.getRequired("REQUIRED_KEY")).toBe(
                "required_value",
            );
        });

        it("should throw for missing required key", () => {
            delete process.env.MISSING_REQUIRED;
            const configManager = new ConfigManager();
            expect(() => configManager.getRequired("MISSING_REQUIRED")).toThrow(
                "Missing required configuration: MISSING_REQUIRED",
            );
        });
    });

    describe("getGeminiKey", () => {
        it("should return GEMINI_API_KEY env value", () => {
            process.env.GEMINI_API_KEY = "test-gemini-key";
            const configManager = new ConfigManager();
            expect(configManager.getGeminiKey()).toBe("test-gemini-key");
        });

        it("should return undefined if not set", () => {
            delete process.env.GEMINI_API_KEY;
            const configManager = new ConfigManager();
            expect(configManager.getGeminiKey()).toBeUndefined();
        });
    });

    describe("getPort", () => {
        it("should return PORT from env", () => {
            process.env.PORT = "3000";
            const configManager = new ConfigManager();
            expect(configManager.getPort()).toBe(3000);
        });

        it("should return default 8082 if PORT not set", () => {
            delete process.env.PORT;
            const configManager = new ConfigManager();
            expect(configManager.getPort()).toBe(8082);
        });
    });

    describe("getEnv", () => {
        it("should return NODE_ENV value", () => {
            process.env.NODE_ENV = "production";
            const configManager = new ConfigManager();
            expect(configManager.getEnv()).toBe("production");
        });

        it("should default to development if NODE_ENV not set", () => {
            delete process.env.NODE_ENV;
            const configManager = new ConfigManager();
            expect(configManager.getEnv()).toBe("development");
        });
    });
});
