import { BacktestEngine } from "../src/engine/BacktestEngine";
import { HistoricalDataService } from "../src/data/HistoricalDataService";
import { ShippingGate } from "../src/gate/ShippingGate";
import { Logger } from "@titan/shared";
import { OHLCV } from "../src/types";

// Mock dependencies
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
} as unknown as Logger;

const mockDataService = {
    getCandles: jest.fn().mockResolvedValue([]),
    getRegimeSnapshots: jest.fn().mockResolvedValue([]),
} as unknown as HistoricalDataService;

const mockGate = new ShippingGate({
    maxDrawdown: 0.2, // 20%
    minSharpe: 1.0,
    minSortino: 1.0,
    minCalmar: 0.5,
});

describe("BacktestEngine", () => {
    let engine: BacktestEngine;

    beforeEach(() => {
        engine = new BacktestEngine(mockDataService, mockGate, mockLogger);
    });

    it("should initialize correctly", () => {
        expect(engine).toBeTruthy();
    });

    it("should run walk-forward analysis and return a validation report", async () => {
        // Mock strategy
        const mockStrategy = {};

        // Mock Config
        const config = {
            symbol: "BTCUSDT",
            timeframe: "1h",
            start: 1600000000000,
            end: 1600100000000,
            initialCapital: 10000,
        };

        // Run Walk-Forward
        const report = await engine.runWalkForward(mockStrategy, config, 2);

        expect(report).toBeDefined();
        // Since we returned a dummy result in the stub, it should fail the gate due to DD=1.0 (100%)
        expect(report.passed).toBe(false);
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.stringContaining("Starting Walk-Forward Analysis"),
        );
    });
});
