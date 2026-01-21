import { TitanBrain } from "../../src/engine/TitanBrain";
import { StateRecoveryService } from "../../src/engine/StateRecoveryService";
import { PositionManager } from "../../src/engine/PositionManager";
import { CapitalFlowManager } from "../../src/engine/CapitalFlowManager";
import { logger } from "../../src/utils/Logger";
import { Position } from "../../src/types";

// Mock dependencies
jest.mock("uuid", () => ({ v4: () => "mock-uuid" }));

// Mock Logger
jest.mock("../../src/utils/Logger", () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
    },
}));

describe("State Recovery Integration", () => {
    let context: any;
    let recoverStateMock: jest.Mock;
    let recoverPositionsMock: jest.Mock;
    let updatePositionMock: jest.Mock;
    let setHwmMock: jest.Mock;
    let recalcMetricsMock: jest.Mock;

    const mockPosition: Position = {
        symbol: "BTCUSDT",
        side: "LONG",
        size: 50000,
        entryPrice: 50000,
        leverage: 1,
        unrealizedPnL: 0,
        positionMode: "ONE_WAY",
        phaseId: "phase2", // Required by Position interface
    };

    beforeEach(() => {
        jest.clearAllMocks();

        recoverStateMock = jest.fn().mockResolvedValue({
            allocation: null,
            performance: null,
            highWatermark: 100000,
        });

        recoverPositionsMock = jest.fn().mockResolvedValue([mockPosition]);
        updatePositionMock = jest.fn();
        setHwmMock = jest.fn().mockResolvedValue(undefined);
        recalcMetricsMock = jest.fn().mockReturnValue({
            currentLeverage: 1.5,
            projectedLeverage: 1.5,
            correlation: 0.1,
            portfolioDelta: 50000,
            portfolioBeta: 0.8,
        });

        // Mock Context mimicking TitanBrain
        context = {
            stateRecoveryService: {
                recoverState: recoverStateMock,
                recoverPositionsFromStream: recoverPositionsMock,
                recalculateRiskMetrics: recalcMetricsMock,
            } as unknown as StateRecoveryService,
            capitalFlowManager: {
                setHighWatermark: setHwmMock,
            } as unknown as CapitalFlowManager,
            positionManager: {
                updatePosition: updatePositionMock,
                getPositions: jest.fn().mockReturnValue([mockPosition]),
            } as unknown as PositionManager,
            currentPositions: [],
            currentEquity: 100000,
        };
    });

    it("should orchestrate state recovery successfully on start", async () => {
        // Execute start() logic
        await TitanBrain.prototype.start.call(context);

        // 1. Verify Metadata Recovery
        expect(recoverStateMock).toHaveBeenCalledTimes(1);
        expect(setHwmMock).toHaveBeenCalledWith(100000);
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining("Restoring High Watermark: $100000"),
        );

        // 2. Verify Position Replay
        expect(recoverPositionsMock).toHaveBeenCalledTimes(1);
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining("Replaying positions from JetStream"),
        );

        // 3. Verify Position Manager Updates
        expect(updatePositionMock).toHaveBeenCalledWith(mockPosition);
        expect(updatePositionMock).toHaveBeenCalledTimes(1);

        // 4. Verify Local State & Metrics
        expect(context.currentPositions).toEqual([mockPosition]);
        expect(recalcMetricsMock).toHaveBeenCalledWith(
            [mockPosition],
            100000,
        );
        expect(logger.info).toHaveBeenCalledWith(
            expect.stringContaining(
                "Initial Risk State: Leverage=1.50x, Beta=0.80",
            ),
        );
    });

    it("should handle empty stream gracefully", async () => {
        recoverPositionsMock.mockResolvedValue([]);
        context.positionManager.getPositions.mockReturnValue([]);

        await TitanBrain.prototype.start.call(context);

        expect(recoverPositionsMock).toHaveBeenCalled();
        expect(updatePositionMock).not.toHaveBeenCalled();
        expect(recalcMetricsMock).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
            "No active positions found in stream replay.",
        );
    });

    it("should fail closed if recovery errors", async () => {
        const error = new Error("JetStream connection failed");
        recoverPositionsMock.mockRejectedValue(error);

        await expect(TitanBrain.prototype.start.call(context)).rejects.toThrow(
            error,
        );

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining("Critical State Recovery Failure"),
            error,
        );
    });

    it("should warn and continue if StateRecoveryService is missing", async () => {
        context.stateRecoveryService = undefined;

        await TitanBrain.prototype.start.call(context);

        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining("StateRecoveryService not available"),
        );
    });
});
