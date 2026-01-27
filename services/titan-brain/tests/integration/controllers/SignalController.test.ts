import Fastify, { FastifyInstance } from "fastify";
import { SignalController } from "@/server/controllers/SignalController";
import { TitanBrain } from "@/engine/TitanBrain";
import { Logger } from "@/logging/Logger";

// Mock dependencies
jest.mock("@/engine/TitanBrain");
jest.mock("@/services/config/DynamicConfigService");
jest.mock("@/logging/Logger");

describe("SignalController Integration", () => {
    let app: FastifyInstance;
    let signalController: SignalController;
    let mockBrain: jest.Mocked<TitanBrain>;
    let mockConfigService: any;
    let mockLogger: any;

    beforeAll(async () => {
        app = Fastify();

        // Mocks
        mockBrain = {
            processSignal: jest.fn(),
        } as any;

        mockConfigService = {
            getConfig: jest.fn().mockReturnValue(null), // Default no config override
        };

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            child: jest.fn().mockReturnThis(),
        };
        (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

        // createCorrelationLogger mock if needed, or rely on Logger mock

        signalController = new SignalController(
            mockBrain,
            null, // no queue for direct test
            mockLogger,
            mockConfigService,
        );

        signalController.registerRoutes(app);

        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("POST /signal should accept valid signal and delegate to Brain", async () => {
        mockBrain.processSignal.mockResolvedValue({
            signalId: "sig-1",
            approved: true,
            authorizedSize: 100,
            timestamp: Date.now(),
            reason: "Test",
            allocation: { w1: 1, w2: 0, w3: 0, timestamp: Date.now() },
            performance: { winRate: 0.5 } as any,
            risk: { approved: true } as any,
        });

        const payload = {
            signalId: "sig-1",
            phaseId: "phase1",
            symbol: "BTCUSDT",
            side: "BUY",
            requestedSize: 100,
            leverage: 1,
        };

        const response = await app.inject({
            method: "POST",
            url: "/signal",
            payload,
        });

        expect(response.statusCode).toBe(200);
        expect(mockBrain.processSignal).toHaveBeenCalled();
        expect(JSON.parse(response.body)).toMatchObject({
            approved: true,
            authorizedSize: 100,
        });
    });

    it("POST /signal should reject invalid payload (validation)", async () => {
        const payload = {
            // missing signalId, phaseId, etc
            symbol: "BTC/USD",
        };

        const response = await app.inject({
            method: "POST",
            url: "/signal",
            payload,
        });

        expect(response.statusCode).toBe(400);
        expect(mockBrain.processSignal).not.toHaveBeenCalled();
    });

    it("POST /webhook/phase1 should handle phase specific signals", async () => {
        mockBrain.processSignal.mockResolvedValue({
            signalId: "sig-p1",
            approved: true,
            authorizedSize: 50,
            timestamp: Date.now(),
            reason: "Test Phase",
            allocation: { w1: 1, w2: 0, w3: 0, timestamp: Date.now() },
            performance: { winRate: 0.5 } as any,
            risk: { approved: true } as any,
        });

        const payload = {
            signal_id: "sig-p1",
            symbol: "ETHUSDT",
            direction: "LONG",
            size: 50,
            confidence: 0.9,
            source: "scavenger", // implies phase1
            metadata: {
                order_book_imbalance: 0.5,
                trade_size_mean: 100,
                trade_size_std_dev: 10,
            },
        };

        const response = await app.inject({
            method: "POST",
            url: "/webhook/phase1",
            payload,
        });

        expect(response.statusCode).toBe(200);
        expect(mockBrain.processSignal).toHaveBeenCalled();
        // Check argument mapping if necessary
    });
});
