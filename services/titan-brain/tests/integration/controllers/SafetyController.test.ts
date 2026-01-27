import Fastify, { FastifyInstance } from "fastify";
import { SafetyController } from "../../../src/server/controllers/SafetyController";
import { SafetySessionManager } from "../../../src/services/SafetySessionManager";

// Mock dependencies
jest.mock("../../../src/services/SafetySessionManager");

describe("SafetyController Integration", () => {
    let app: FastifyInstance;
    let safetyController: SafetyController;
    let mockSafetyManager: jest.Mocked<SafetySessionManager>;

    beforeAll(async () => {
        app = Fastify();
        // Create mock instance
        mockSafetyManager = {
            armConsole: jest.fn(),
            disarmConsole: jest.fn(),
            validateSession: jest.fn(),
            // add other methods if needed
        } as any;

        safetyController = new SafetyController(mockSafetyManager);
        await safetyController.registerRoutes(app);

        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("POST /auth/arm should return session on success", async () => {
        const session = { id: "sess-1", active: true };
        mockSafetyManager.armConsole.mockResolvedValue(session as any);

        const response = await app.inject({
            method: "POST",
            url: "/auth/arm",
            payload: {
                actorId: "user-1",
                role: "owner",
                reason: "Routine check",
            },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ success: true, session });
        expect(mockSafetyManager.armConsole).toHaveBeenCalledWith(
            "user-1",
            "owner",
            "Routine check",
            expect.any(String), // client IP
            undefined,
        );
    });

    it("POST /auth/arm should fail with invalid role", async () => {
        const response = await app.inject({
            method: "POST",
            url: "/auth/arm",
            payload: {
                actorId: "user-1",
                role: "hacker",
                reason: "I want in",
            },
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toHaveProperty(
            "error",
            "Invalid role",
        );
    });

    it("POST /auth/check should validate session", async () => {
        const session = { id: "sess-1", active: true };
        mockSafetyManager.validateSession.mockResolvedValue(session as any);

        const response = await app.inject({
            method: "POST",
            url: "/auth/check",
            payload: { sessionId: "sess-1" },
        });

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({ active: true, session });
    });

    it("POST /auth/disarm should call manager", async () => {
        mockSafetyManager.disarmConsole.mockResolvedValue();

        const response = await app.inject({
            method: "POST",
            url: "/auth/disarm",
            payload: { sessionId: "sess-1" },
        });

        expect(response.statusCode).toBe(200);
        expect(mockSafetyManager.disarmConsole).toHaveBeenCalledWith("sess-1");
    });
});
