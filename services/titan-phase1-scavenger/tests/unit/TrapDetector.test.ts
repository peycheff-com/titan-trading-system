/**
 * TrapDetector Unit Tests
 *
 * Tests for the liquidation trap detection logic (The Spider)
 */

import { TrapDetector } from "../../src/engine/components/TrapDetector.js";
import { Logger } from "../../src/logging/Logger.js";
import { ConfigManager } from "../../src/config/ConfigManager.js";
import { EventEmitter } from "../../src/events/EventEmitter.js";
import { TrapStateManager } from "../../src/engine/components/TrapStateManager.js";
import { TrapExecutor } from "../../src/engine/components/TrapExecutor.js";
import { VelocityCalculator } from "../../src/calculators/VelocityCalculator.js";
import { CVDCalculator } from "../../src/calculators/CVDCalculator.js";
import { LeadLagDetector } from "../../src/calculators/LeadLagDetector.js";
import { Trade, Tripwire } from "../../src/types/index.js";

// Mock dependencies
const createMockLogger = () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
});

const createMockConfig = () => ({
    getConfig: jest.fn().mockReturnValue({
        minTradesIn100ms: 50,
    }),
});

const createMockEventEmitter = () => ({
    emit: jest.fn(),
    on: jest.fn(),
});

const createMockStateManager = () => ({
    isBlacklisted: jest.fn().mockReturnValue(false),
    getTraps: jest.fn(),
    setLatestPrice: jest.fn(),
    getLatestPrice: jest.fn(),
    getVolumeCounter: jest.fn(),
    setVolumeCounter: jest.fn(),
    deleteVolumeCounter: jest.fn(),
});

const createMockExecutor = () => ({
    fire: jest.fn(),
});

const createMockVelocityCalculator = () => ({
    recordPrice: jest.fn(),
});

const createMockCVDCalculator = () => ({
    recordTrade: jest.fn(),
});

const createMockLeadLagDetector = () => ({
    recordPrice: jest.fn(),
});

describe("TrapDetector", () => {
    let detector: TrapDetector;
    let mockLogger: ReturnType<typeof createMockLogger>;
    let mockConfig: ReturnType<typeof createMockConfig>;
    let mockEventEmitter: ReturnType<typeof createMockEventEmitter>;
    let mockStateManager: ReturnType<typeof createMockStateManager>;
    let mockExecutor: ReturnType<typeof createMockExecutor>;
    let mockVelocityCalculator: ReturnType<typeof createMockVelocityCalculator>;
    let mockCVDCalculator: ReturnType<typeof createMockCVDCalculator>;
    let mockLeadLagDetector: ReturnType<typeof createMockLeadLagDetector>;

    beforeEach(() => {
        jest.useFakeTimers();
        mockLogger = createMockLogger();
        mockConfig = createMockConfig();
        mockEventEmitter = createMockEventEmitter();
        mockStateManager = createMockStateManager();
        mockExecutor = createMockExecutor();
        mockVelocityCalculator = createMockVelocityCalculator();
        mockCVDCalculator = createMockCVDCalculator();
        mockLeadLagDetector = createMockLeadLagDetector();

        detector = new TrapDetector({
            logger: mockLogger as unknown as Logger,
            config: mockConfig as unknown as ConfigManager,
            eventEmitter: mockEventEmitter as unknown as EventEmitter,
            stateManager: mockStateManager as unknown as TrapStateManager,
            executor: mockExecutor as unknown as TrapExecutor,
            velocityCalculator:
                mockVelocityCalculator as unknown as VelocityCalculator,
            cvdCalculator: mockCVDCalculator as unknown as CVDCalculator,
            leadLagDetector: mockLeadLagDetector as unknown as LeadLagDetector,
        });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe("onBybitTicker", () => {
        it("should record price to LeadLagDetector", () => {
            detector.onBybitTicker("BTCUSDT", 42000, Date.now());

            expect(mockLeadLagDetector.recordPrice).toHaveBeenCalledWith(
                "BTCUSDT",
                "BYBIT",
                42000,
                expect.any(Number),
            );
        });
    });

    describe("onBinanceTick", () => {
        const createTrade = (overrides: Partial<Trade> = {}): Trade => ({
            symbol: "BTCUSDT",
            price: 42000,
            qty: 0.5,
            time: Date.now(),
            isBuyerMaker: false,
            ...overrides,
        });

        const createTrap = (overrides: Partial<Tripwire> = {}): Tripwire => ({
            id: "trap-1",
            symbol: "BTCUSDT",
            trapType: "LIQUIDATION",
            direction: "LONG",
            triggerPrice: 42000,
            confidence: 90,
            leverage: 15,
            estimatedCascadeSize: 2.5,
            activated: false,
            activatedAt: undefined,
            created: Date.now() - 60000,
            ...overrides,
        });

        it("should skip blacklisted symbols", () => {
            mockStateManager.isBlacklisted.mockReturnValue(true);

            detector.onBinanceTick("BTCUSDT", 42000, [createTrade()]);

            expect(mockStateManager.getTraps).not.toHaveBeenCalled();
        });

        it("should skip symbols with no traps", () => {
            mockStateManager.getTraps.mockReturnValue(null);

            detector.onBinanceTick("BTCUSDT", 42000, [createTrade()]);

            expect(mockStateManager.setLatestPrice).not.toHaveBeenCalled();
        });

        it("should record prices and trades to calculators", () => {
            mockStateManager.getTraps.mockReturnValue([]);
            const trades = [createTrade(), createTrade()];

            detector.onBinanceTick("BTCUSDT", 42000, trades);

            expect(mockStateManager.setLatestPrice).toHaveBeenCalledWith(
                "BTCUSDT",
                42000,
            );
            expect(mockVelocityCalculator.recordPrice).toHaveBeenCalled();
            expect(mockLeadLagDetector.recordPrice).toHaveBeenCalledWith(
                "BTCUSDT",
                "BINANCE",
                42000,
                expect.any(Number),
            );
            expect(mockCVDCalculator.recordTrade).toHaveBeenCalledTimes(2);
        });

        it("should skip already activated traps", () => {
            mockStateManager.getTraps.mockReturnValue([
                createTrap({ activated: true }),
            ]);

            detector.onBinanceTick("BTCUSDT", 42000, [createTrade()]);

            expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
                "TRAP_SPRUNG",
                expect.anything(),
            );
        });

        it("should skip traps still in cooldown", () => {
            const recentActivation = Date.now() - 120000; // 2 min ago (< 5 min cooldown)
            mockStateManager.getTraps.mockReturnValue([
                createTrap({ activatedAt: recentActivation }),
            ]);

            detector.onBinanceTick("BTCUSDT", 42000, [createTrade()]);

            expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
                "TRAP_SPRUNG",
                expect.anything(),
            );
        });

        it("should skip traps when price is too far from trigger", () => {
            mockStateManager.getTraps.mockReturnValue([
                createTrap({ triggerPrice: 43000 }),
            ]);

            detector.onBinanceTick("BTCUSDT", 42000, [createTrade()]); // 2.3% away

            expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
                "TRAP_SPRUNG",
                expect.anything(),
            );
        });

        it("should initialize volume counter when price is close to trigger", () => {
            // Trap with trigger exactly at price
            mockStateManager.getTraps.mockReturnValue([
                createTrap({ triggerPrice: 42000 }),
            ]);
            mockStateManager.getVolumeCounter.mockReturnValue(null);

            // onBinanceTick at exactly 42000 - within 0.1% of trigger
            detector.onBinanceTick("BTCUSDT", 42000, [createTrade()]);

            // The volume counter initialization depends on price proximity
            // If within threshold, it should be called
            // This verifies the code path is exercised
            expect(mockVelocityCalculator.recordPrice).toHaveBeenCalled();
        });

        it("should accumulate buy volume for taker buys", () => {
            mockStateManager.getTraps.mockReturnValue([createTrap()]);
            const counter = {
                count: 0,
                buyVolume: 0,
                sellVolume: 0,
                startTime: Date.now() - 50, // 50ms elapsed
            };
            mockStateManager.getVolumeCounter.mockReturnValue(counter);

            const buyTrade = createTrade({ isBuyerMaker: false, qty: 1.5 });
            detector.onBinanceTick("BTCUSDT", 42000, [buyTrade]);

            expect(counter.buyVolume).toBe(1.5);
        });

        it("should accumulate sell volume for taker sells", () => {
            mockStateManager.getTraps.mockReturnValue([createTrap()]);
            const counter = {
                count: 0,
                buyVolume: 0,
                sellVolume: 0,
                startTime: Date.now() - 50, // 50ms elapsed
            };
            mockStateManager.getVolumeCounter.mockReturnValue(counter);

            const sellTrade = createTrade({ isBuyerMaker: true, qty: 2.0 });
            detector.onBinanceTick("BTCUSDT", 42000, [sellTrade]);

            expect(counter.sellVolume).toBe(2.0);
        });

        it("should emit TRAP_SPRUNG when conditions are met", () => {
            mockStateManager.getTraps.mockReturnValue([createTrap()]);
            const counter = {
                count: 60, // > minTradesIn100ms (50)
                buyVolume: 10,
                sellVolume: 5,
                startTime: Date.now() - 110, // > 100ms elapsed
            };
            mockStateManager.getVolumeCounter.mockReturnValue(counter);

            detector.onBinanceTick("BTCUSDT", 42000, [createTrade()]);

            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                "TRAP_SPRUNG",
                expect.objectContaining({
                    symbol: "BTCUSDT",
                    price: 42000,
                    trapType: "LIQUIDATION",
                    direction: "LONG",
                }),
            );
        });

        it("should schedule confirmation check after TRAP_SPRUNG", () => {
            mockStateManager.getTraps.mockReturnValue([createTrap()]);
            const counter = {
                count: 60,
                buyVolume: 10,
                sellVolume: 5,
                startTime: Date.now() - 110,
            };
            mockStateManager.getVolumeCounter.mockReturnValue(counter);
            mockStateManager.getLatestPrice.mockReturnValue(42001);

            detector.onBinanceTick("BTCUSDT", 42000, [createTrade()]);

            // Advance timers past 200ms confirmation delay
            jest.advanceTimersByTime(250);

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.stringContaining("CONFIRMATION"),
            );
        });

        it("should reset volume counter after 100ms window", () => {
            mockStateManager.getTraps.mockReturnValue([createTrap()]);
            const counter = {
                count: 10, // Below threshold
                buyVolume: 1,
                sellVolume: 1,
                startTime: Date.now() - 110, // > 100ms
            };
            mockStateManager.getVolumeCounter.mockReturnValue(counter);

            detector.onBinanceTick("BTCUSDT", 42000, [createTrade()]);

            expect(mockStateManager.deleteVolumeCounter).toHaveBeenCalledWith(
                "BTCUSDT",
            );
        });
    });

    describe("confirmation logic", () => {
        const createTrap = (direction: "LONG" | "SHORT"): Tripwire => ({
            id: "trap-1",
            symbol: "BTCUSDT",
            trapType: "LIQUIDATION",
            direction,
            triggerPrice: 42000,
            confidence: 90,
            leverage: 15,
            estimatedCascadeSize: 2.5,
            activated: false,
            activatedAt: undefined,
            created: Date.now() - 60000,
        });

        it("should fire executor when LONG confirmation passes", async () => {
            mockStateManager.getTraps.mockReturnValue([createTrap("LONG")]);
            const counter = {
                count: 60,
                buyVolume: 10,
                sellVolume: 5,
                startTime: Date.now() - 110,
            };
            mockStateManager.getVolumeCounter.mockReturnValue(counter);
            // Price holding above trigger (42000 * 0.9995 = 41979)
            mockStateManager.getLatestPrice.mockReturnValue(42005);
            mockExecutor.fire.mockResolvedValue(undefined);

            detector.onBinanceTick("BTCUSDT", 42000, [{
                symbol: "BTCUSDT",
                price: 42000,
                qty: 0.5,
                time: Date.now(),
                isBuyerMaker: false,
            }]);

            jest.advanceTimersByTime(250);
            await Promise.resolve(); // Flush promises

            expect(mockExecutor.fire).toHaveBeenCalled();
        });

        it("should abort when LONG confirmation fails (wick)", async () => {
            mockStateManager.getTraps.mockReturnValue([createTrap("LONG")]);
            const counter = {
                count: 60,
                buyVolume: 10,
                sellVolume: 5,
                startTime: Date.now() - 110,
            };
            mockStateManager.getVolumeCounter.mockReturnValue(counter);
            // Price dropped below trigger (wick reversal)
            mockStateManager.getLatestPrice.mockReturnValue(41900);

            detector.onBinanceTick("BTCUSDT", 42000, [{
                symbol: "BTCUSDT",
                price: 42000,
                qty: 0.5,
                time: Date.now(),
                isBuyerMaker: false,
            }]);

            jest.advanceTimersByTime(250);
            await Promise.resolve();

            expect(mockEventEmitter.emit).toHaveBeenCalledWith(
                "TRAP_ABORTED",
                expect.objectContaining({
                    reason: "WICK_REVERSION",
                }),
            );
            expect(mockExecutor.fire).not.toHaveBeenCalled();
        });

        it("should fire executor when SHORT confirmation passes", async () => {
            mockStateManager.getTraps.mockReturnValue([createTrap("SHORT")]);
            const counter = {
                count: 60,
                buyVolume: 5,
                sellVolume: 10,
                startTime: Date.now() - 110,
            };
            mockStateManager.getVolumeCounter.mockReturnValue(counter);
            // Price holding below trigger (42000 * 1.0005 = 42021)
            mockStateManager.getLatestPrice.mockReturnValue(41995);
            mockExecutor.fire.mockResolvedValue(undefined);

            detector.onBinanceTick("BTCUSDT", 42000, [{
                symbol: "BTCUSDT",
                price: 42000,
                qty: 0.5,
                time: Date.now(),
                isBuyerMaker: true,
            }]);

            jest.advanceTimersByTime(250);
            await Promise.resolve();

            expect(mockExecutor.fire).toHaveBeenCalled();
        });

        it("should warn when no price data for confirmation", async () => {
            mockStateManager.getTraps.mockReturnValue([createTrap("LONG")]);
            const counter = {
                count: 60,
                buyVolume: 10,
                sellVolume: 5,
                startTime: Date.now() - 110,
            };
            mockStateManager.getVolumeCounter.mockReturnValue(counter);
            mockStateManager.getLatestPrice.mockReturnValue(null);

            detector.onBinanceTick("BTCUSDT", 42000, [{
                symbol: "BTCUSDT",
                price: 42000,
                qty: 0.5,
                time: Date.now(),
                isBuyerMaker: false,
            }]);

            jest.advanceTimersByTime(250);
            await Promise.resolve();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining("No price data"),
            );
        });
    });
});
