import { BacktestEngine } from "../src/engine/BacktestEngine";
import { SimulationConfig } from "../src/types";

// Mock dependencies
// Mock dependencies
jest.mock("titan-phase1-scavenger/src/engine/TitanTrap.js", () => {
    return {
        TitanTrap: jest.fn().mockImplementation(() => ({
            start: jest.fn(),
            stop: jest.fn(),
        })),
    };
}, { virtual: true });

jest.mock(
    "titan-phase1-scavenger/src/calculators/TripwireCalculators.js",
    () => ({
        TripwireCalculators: {},
    }),
    { virtual: true },
);

jest.mock(
    "titan-phase1-scavenger/src/calculators/VelocityCalculator.js",
    () => ({
        VelocityCalculator: jest.fn(),
    }),
    { virtual: true },
);

// Mock the internal mocks used by BacktestEngine
jest.mock("../src/mocks/MockBinanceSpotClient.js", () => ({
    MockBinanceSpotClient: jest.fn().mockImplementation(() => ({
        pushTrade: jest.fn(),
    })),
}));

jest.mock("../src/mocks/MockBybitPerpsClient.js", () => ({
    MockBybitPerpsClient: jest.fn().mockImplementation(() => ({
        setPrice: jest.fn(),
        getFilledOrders: jest.fn().mockReturnValue([]),
        getEquity: jest.fn().mockResolvedValue(10000),
    })),
}));

describe("BacktestEngine", () => {
    let engine: BacktestEngine;
    const mockConfig: SimulationConfig = {
        symbol: "BTCUSDT",
        initialCapital: 10000,
        startDate: 1600000000000,
        endDate: 1600100000000,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        engine = new BacktestEngine(mockConfig);
    });

    it("should initialize correctly", () => {
        expect(engine).toBeTruthy();
    });

    it("should run simulation", async () => {
        const candles = [
            {
                timestamp: 1600000000000,
                open: 10000,
                high: 10100,
                low: 9900,
                close: 10050,
                volume: 100,
                symbol: "BTCUSDT",
                timeframe: "1h",
            },
            {
                timestamp: 1600000060000,
                open: 10050,
                high: 10200,
                low: 10000,
                close: 10150,
                volume: 150,
                symbol: "BTCUSDT",
                timeframe: "1h",
            },
        ];

        const result = await engine.runSimulation({ candles });

        expect(result).toBeDefined();
        expect(result.metrics.tradesCount).toBe(0);
        expect(result.metrics.totalReturn).toBe(0);
    });
});
