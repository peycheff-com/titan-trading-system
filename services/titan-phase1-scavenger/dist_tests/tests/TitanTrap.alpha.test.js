import { TitanTrap } from "../src/engine/TitanTrap";
import { TripwireCalculators } from "../src/calculators/TripwireCalculators";
import { VelocityCalculator } from "../src/calculators/VelocityCalculator";
import { CVDCalculator } from "../src/calculators/CVDCalculator";
import { EventEmitter } from "../src/events/EventEmitter";
// Mocks
jest.mock("../src/ipc/FastPathClient");
jest.mock("../src/calculators/TripwireCalculators");
jest.mock("../src/calculators/VelocityCalculator");
jest.mock("../src/calculators/CVDCalculator");
jest.mock("../src/calculators/VolatilityScaler");
describe("TitanTrap Alpha Logic", () => {
    let trap;
    let mockBinanceClient;
    let mockBybitClient;
    let mockLogger;
    let mockConfig;
    let mockEventEmitter;
    let mockTripwireCalculators;
    let mockVelocityCalculator;
    let mockPositionSizeCalculator;
    let mockCvdCalculator; // Add mock for CVD calculator
    beforeEach(() => {
        mockBinanceClient = { subscribeAggTrades: jest.fn() };
        mockBybitClient = {
            getCurrentPrice: jest.fn().mockResolvedValue(50000),
            fetchOHLCV: jest.fn(),
        };
        mockLogger = { log: jest.fn() };
        mockConfig = {
            getConfig: jest.fn().mockReturnValue({
                ghostMode: false,
                stopLossPercent: 0.01,
                targetPercent: 0.03,
            }),
        };
        mockEventEmitter = new EventEmitter();
        mockTripwireCalculators = new TripwireCalculators();
        mockVelocityCalculator = new VelocityCalculator();
        mockPositionSizeCalculator = {
            calcPositionSize: jest.fn().mockReturnValue(0.1),
        };
        mockCvdCalculator = new CVDCalculator();
        // Stub methods
        mockVelocityCalculator.calcVelocity.mockReturnValue(0.0005); // Low velocity
        mockVelocityCalculator.getAcceleration.mockReturnValue(-0.0001); // Decelerating (Safe)
        mockTripwireCalculators.calcADX.mockReturnValue(15); // Low trend (Safe)
        mockTripwireCalculators.calcSMA.mockReturnValue(50000); // Neutral trend
        mockCvdCalculator.calcCVD.mockResolvedValue(-100); // Selling -> Good for LONG (Counter-flow)
        trap = new TitanTrap({
            binanceClient: mockBinanceClient,
            bybitClient: mockBybitClient,
            logger: mockLogger,
            config: mockConfig,
            eventEmitter: mockEventEmitter,
            tripwireCalculators: mockTripwireCalculators,
            velocityCalculator: mockVelocityCalculator,
            positionSizeCalculator: mockPositionSizeCalculator,
        });
        // Inject specific mocks that might not be injected via constructor but are properties
        trap.cvdCalculator = mockCvdCalculator; // Force inject
        trap.velocityCalculator = mockVelocityCalculator;
        trap.tripwireCalculators = mockTripwireCalculators;
        // Mock FastPathClient methods
        trap.fastPathClient.isConnected = jest.fn().mockReturnValue(true);
        trap.fastPathClient.sendPrepare = jest.fn().mockResolvedValue({
            prepared: true,
        });
        trap.fastPathClient.sendConfirm = jest.fn().mockResolvedValue({
            executed: true,
            fill_price: 50000,
        });
        trap.cachedEquity = 1000;
    });
    const createMockTrap = (overrides = {}) => ({
        symbol: "BTCUSDT",
        triggerPrice: 50000,
        direction: "LONG",
        trapType: "LIQUIDATION",
        confidence: 90,
        leverage: 10,
        estimatedCascadeSize: 0.05,
        activated: false,
        volatilityMetrics: {
            atr: 100,
            regime: "NORMAL",
            stopLossMultiplier: 1,
            positionSizeMultiplier: 1,
        },
        ...overrides,
    });
    test("BASELINE: Should fire when all conditions are safe", async () => {
        const testTrap = createMockTrap();
        trap.isTrapStillValid = jest.fn().mockReturnValue(true);
        await trap.fire(testTrap);
        expect(mockCvdCalculator.calcCVD).toHaveBeenCalled();
        expect(mockVelocityCalculator.getAcceleration).toHaveBeenCalled();
        expect(trap.fastPathClient.sendPrepare).toHaveBeenCalled(); // Should fire
    });
    test("GHOST MODE: Should Log Only and skip IPC", async () => {
        mockConfig.getConfig.mockReturnValue({ ghostMode: true });
        const testTrap = createMockTrap();
        const consoleSpy = jest.spyOn(console, "log");
        await trap.fire(testTrap);
        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("👻 GHOST MODE ACTIVE"));
        expect(trap.fastPathClient.sendPrepare).not.toHaveBeenCalled(); // Should NOT fire IPC
    });
    test("ACCELERATION VETO: Should abort if Price is Accelerating (Falling Knife)", async () => {
        // Simulate "Falling Knife": High velocity that is INCREASING
        mockVelocityCalculator.getAcceleration.mockReturnValue(0.005); // Positive acceleration (Speeding up)
        const testTrap = createMockTrap();
        const warnSpy = jest.spyOn(console, "warn");
        await trap.fire(testTrap);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("🛑 KNIFE-CATCH VETO"));
        expect(trap.fastPathClient.sendPrepare).not.toHaveBeenCalled();
    });
    test("TREND VETO: Should abort if Strong Trend exists against the trade", async () => {
        const testTrap = createMockTrap({
            adx: 40, // Strong Trend (>25)
            trend: "DOWN", // Downtrend
            direction: "LONG", // Trying to buy (Counter-trend)
        });
        const warnSpy = jest.spyOn(console, "warn");
        await trap.fire(testTrap);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("🛑 TREND VETO"));
        expect(trap.fastPathClient.sendPrepare).not.toHaveBeenCalled();
    });
    test("TREND ALLOW: Should allow trade if Strong Trend is WITH the trade", async () => {
        const testTrap = createMockTrap({
            adx: 40, // Strong Trend
            trend: "UP", // Uptrend
            direction: "LONG", // Buying (With trend)
        });
        trap.isTrapStillValid = jest.fn().mockReturnValue(true);
        await trap.fire(testTrap);
        expect(trap.fastPathClient.sendPrepare).toHaveBeenCalled();
    });
});
//# sourceMappingURL=TitanTrap.alpha.test.js.map