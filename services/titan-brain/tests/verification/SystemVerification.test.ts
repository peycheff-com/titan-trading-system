import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { SafetySessionManager } from "../../src/services/SafetySessionManager.js";
import { ActiveInferenceEngine } from "../../src/engine/ActiveInferenceEngine.js";
import { ActiveInferenceConfig } from "../../src/types/index.js";
import { Redis } from "ioredis";

// Mock Redis
const mockRedis = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    setex: jest.fn(),
} as unknown as Redis;

describe("System Verification", () => {
    describe("SafetySessionManager", () => {
        let sessionManager: SafetySessionManager;

        const mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            logSecurityEvent: jest.fn(),
        } as any;

        beforeEach(() => {
            // Constructor accepts Redis instance or URL string
            sessionManager = new SafetySessionManager(mockLogger, mockRedis);
            jest.clearAllMocks();
        });

        it("should create a valid session", async () => {
            (mockRedis.setex as jest.Mock<any>).mockResolvedValue("OK");
            const session = await sessionManager.armConsole(
                "op-123",
                "risk_officer",
                "Test Reason",
            );

            expect(session).toBeDefined();
            expect(session.actorId).toBe("op-123");
            expect(session.role).toBe("risk_officer");
            // setex is used in source
            expect(mockRedis.setex).toHaveBeenCalled();
        });

        it("should validate a session", async () => {
            const sessionData = JSON.stringify({
                id: "sess-123",
                actorId: "op-123",
                role: "risk_officer",
                createdAt: Date.now(),
                expiresAt: Date.now() + 300000,
            });
            (mockRedis.get as jest.Mock<any>).mockResolvedValue(sessionData);

            const isValid = await sessionManager.validateSession("sess-123");
            expect(isValid).toBeTruthy();
        });
    });

    describe("ActiveInferenceEngine (Self-Healing)", () => {
        let engine: ActiveInferenceEngine;
        const config: ActiveInferenceConfig = {
            windowSize: 10,
            minHistory: 5,
            distributionBins: 10,
            sensitivity: 5,
            surpriseOffset: 0.5,
            // cortisolDecay removed
        };

        beforeEach(() => {
            engine = new ActiveInferenceEngine(config);
        });

        it("should start with low cortisol", () => {
            expect(engine.getCortisol()).toBe(0);
        });

        it("should increase cortisol on high surprise (sudden price jump)", () => {
            // Train with stable data
            for (let i = 0; i < 10; i++) {
                engine.processUpdate({
                    price: 100,
                    volume: 100,
                    timestamp: Date.now() + i * 1000,
                });
            }
            expect(engine.getCortisol()).toBeLessThan(0.2);

            // Shock
            engine.processUpdate({
                price: 150,
                volume: 100,
                timestamp: Date.now() + 11000,
            });

            // Should be high
            const cortisol = engine.getCortisol();
            // High surprise due to 50% jump compared to 0% variance
            expect(cortisol).toBeGreaterThan(0.5);
        });
    });
});
