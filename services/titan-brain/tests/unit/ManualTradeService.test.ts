import { ManualTradeService } from "../../src/engine/ManualTradeService";
import { ExecutionEngineClient } from "../../src/types/execution";
import { IntentSignal } from "../../src/types/risk";
import { ManualTradeRequestBody } from "../../src/schemas/apiSchemas";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

describe("ManualTradeService", () => {
    let manualTradeService: ManualTradeService;
    let mockExecutionClient: jest.Mocked<ExecutionEngineClient>;
    let getExecutionClient: jest.Mock<() => ExecutionEngineClient | null>;

    beforeEach(() => {
        mockExecutionClient = {
            forwardSignal: jest.fn(),
            closeAllPositions: jest.fn(),
            getPositions: jest.fn(),
        } as unknown as jest.Mocked<ExecutionEngineClient>;

        getExecutionClient = jest.fn(() => mockExecutionClient);
        manualTradeService = new ManualTradeService(getExecutionClient);
    });

    describe("executeManualTrade", () => {
        const validRequest: ManualTradeRequestBody = {
            symbol: "BTCUSDT",
            side: "BUY",
            size: 1000,
            leverage: 10,
            timestamp: 1234567890,
            bypassRisk: false,
            exchange: "binance",
        };

        it("should forward a valid signal to the execution client", async () => {
            await manualTradeService.executeManualTrade(validRequest);

            expect(getExecutionClient).toHaveBeenCalled();
            expect(mockExecutionClient.forwardSignal).toHaveBeenCalledTimes(1);

            const [signal, size] =
                mockExecutionClient.forwardSignal.mock.calls[0];

            expect(size).toBe(1000);
            expect(signal).toMatchObject({
                phaseId: "manual",
                symbol: "BTCUSDT",
                side: "BUY",
                requestedSize: 1000,
                leverage: 10,
                exchange: "binance",
            });
            // Check signalId generates successfully (starts with manual-)
            expect(signal.signalId).toMatch(/^manual-/);
        });

        it("should throw error if execution client is not connected", async () => {
            getExecutionClient.mockReturnValue(null);

            await expect(manualTradeService.executeManualTrade(validRequest))
                .rejects
                .toThrow("Execution Engine not connected");

            expect(mockExecutionClient.forwardSignal).not.toHaveBeenCalled();
        });

        it("should handle execution errors gracefully", async () => {
            const error = new Error("Execution failed");
            mockExecutionClient.forwardSignal.mockRejectedValue(error);

            await expect(manualTradeService.executeManualTrade(validRequest))
                .rejects
                .toThrow("Execution failed");
        });

        // Test default leverage and timestamp logic if request omits them
        it("should set default leverage and timestamp if missing", async () => {
            const minimalRequest = {
                symbol: "ETHUSDT",
                side: "SELL",
                size: 500,
                bypassRisk: true,
            } as ManualTradeRequestBody;

            await manualTradeService.executeManualTrade(minimalRequest);

            const [signal] = mockExecutionClient.forwardSignal.mock.calls[0];
            expect(signal.leverage).toBe(1); // Default
            expect(signal.timestamp).toBeDefined(); // Should be roughly Date.now()
            expect(signal.exchange).toBeUndefined();
        });
    });

    describe("cancelAllTrades", () => {
        it("should call closeAllPositions on execution client", async () => {
            await manualTradeService.cancelAllTrades();

            expect(getExecutionClient).toHaveBeenCalled();
            expect(mockExecutionClient.closeAllPositions).toHaveBeenCalledTimes(
                1,
            );
        });

        it("should throw error if execution client is not connected", async () => {
            getExecutionClient.mockReturnValue(null);

            await expect(manualTradeService.cancelAllTrades())
                .rejects
                .toThrow("Execution Engine not connected");

            expect(mockExecutionClient.closeAllPositions).not
                .toHaveBeenCalled();
        });

        it("should propagate errors from closeAllPositions", async () => {
            const error = new Error("Panic close failed");
            mockExecutionClient.closeAllPositions.mockRejectedValue(error);

            await expect(manualTradeService.cancelAllTrades())
                .rejects
                .toThrow("Panic close failed");
        });
    });
});
