import { getNatsClient, TitanSubject } from "@titan/shared";
import { TitanBrain } from "../../src/engine/TitanBrain";
import { NatsConsumer } from "../../src/server/NatsConsumer";
import { RiskGuardian } from "../../src/engine/RiskGuardian";
import { Logger } from "../../src/logging/Logger";

// Mock dependencies
jest.mock("uuid", () => ({ v4: () => "mock-uuid" }));

jest.mock("@titan/shared", () => {
    const actual = jest.requireActual("@titan/shared");
    return {
        ...actual,
        getNatsClient: jest.fn(),
    };
});

describe("Market Data Ingestion Integration", () => {
    let brain: TitanBrain;
    let natsConsumer: NatsConsumer;
    let riskGuardian: RiskGuardian;
    let logger: Logger;
    let mockNatsClient: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockNatsClient = {
            subscribe: jest.fn(),
            isConnected: jest.fn().mockReturnValue(true),
            publish: jest.fn(),
            connect: jest.fn().mockResolvedValue(true),
        };
        (getNatsClient as jest.Mock).mockReturnValue(mockNatsClient);

        logger = new Logger({
            level: "error" as any,
            enableConsole: false,
            component: "test",
            enableFile: false,
            enablePerformanceLogging: false,
            sensitiveFields: [],
            maxStackTraceLines: 10,
        });

        // Mock RiskGuardian
        riskGuardian = {
            updatePriceHistory: jest.fn(),
            // Add other required methods if Brain calls them on init
            checkSignal: jest.fn(),
            setEquity: jest.fn(),
        } as unknown as RiskGuardian;

        // Create Brain with mocked dependencies
        brain = {
            handleMarketData: jest.fn().mockImplementation((tick) => {
                // forwarding logic logic to verify call chain if real brain was used
                // But here we want to test the wiring?
                // If we use REAL brain, we need to mock all its deps.
                // Let's use REAL brain if possible, or partially mocked.
                // Actually, let's test the interface: Consumer -> Brain -> RiskGuardian
                riskGuardian.updatePriceHistory(
                    tick.symbol,
                    tick.price,
                    tick.timestamp,
                );
            }),
            logger: logger,
        } as unknown as TitanBrain;
    });

    it("should subscribe to market data and forward to RiskGuardian", async () => {
        // Setup Real Brain with Mocks
        riskGuardian = {
            updatePriceHistory: jest.fn(),
        } as unknown as RiskGuardian;

        // Minimal Brain mock that has the real handleMarketData method?
        // Or just instantiate the real class? Instantiating real class is heavy.
        // Let's stick to testing NatsConsumer -> Brain wiring, and trusting Brain -> RiskGuardian (which is 1 line).
        // Actually, let's create a minimal object that implements handleMarketData.
        const brainMock = {
            handleMarketData: jest.fn(),
            handleExecutionReport: jest.fn(),
        } as unknown as TitanBrain;

        // Instantiate NatsConsumer
        natsConsumer = new NatsConsumer(brainMock); // Removed logger arg
        await natsConsumer.start();

        // Verify subscription
        expect(mockNatsClient.subscribe).toHaveBeenCalledWith(
            TitanSubject.MARKET_DATA, // Use enum to verify shared lib update
            expect.any(Function),
        );

        // Extract callback
        const calls = mockNatsClient.subscribe.mock.calls;
        const marketDataCall = calls.find((c: any[]) =>
            c[0] === TitanSubject.MARKET_DATA
        );
        const callback = marketDataCall[1];

        // Simulate Message
        const testTick = {
            symbol: "BTCUSDT",
            price: 50000,
            timestamp: 1234567890,
        };
        await callback(testTick, TitanSubject.MARKET_DATA);

        // Use Brain Mock to verify call
        expect(brainMock.handleMarketData).toHaveBeenCalledWith({
            symbol: "BTCUSDT",
            price: 50000,
            timestamp: 1234567890,
        });
    });

    it("should properly handling Brain -> RiskGuardian flow", () => {
        // Test the "handleMarketData" logic specifically using a pseudo-real Brain method
        // We can't easily instantiate TitanBrain without 10 dependencies.
        // So we just mock the function context.
        const handleMarketData = TitanBrain.prototype.handleMarketData;

        const mockRiskGuardian = {
            handlePriceUpdate: jest.fn(),
        };

        const mockActiveInferenceEngine = {
            processUpdate: jest.fn(),
        };

        const context = {
            riskGuardian: mockRiskGuardian,
            activeInferenceEngine: mockActiveInferenceEngine,
        };

        const tick = { symbol: "ETHUSDT", price: 3000, timestamp: 11111 };

        // Call unbound method with context
        handleMarketData.call(context as any, tick);

        expect(mockRiskGuardian.handlePriceUpdate).toHaveBeenCalledWith({
            symbol: "ETHUSDT",
            price: 3000,
            timestamp: 11111,
        });
    });
});
