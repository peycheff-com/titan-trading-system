import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { PortfolioManager } from "../../src/portfolio/PortfolioManager";
import { Rebalancer } from "../../src/portfolio/Rebalancer.js";
import { TransferManager } from "../../src/portfolio/TransferManager.js";

// Mock dependencies
jest.mock("../../src/portfolio/PositionTracker.js");
jest.mock("../../src/portfolio/Rebalancer.js");
jest.mock("../../src/portfolio/TransferManager.js");

const mockGateway = {
    name: "mock",
    initialize: jest.fn(),
    getPrice: jest.fn().mockReturnValue(Promise.resolve(100)) as any,
    getAccountInfo: jest.fn(),
    executeOrder: jest.fn(),
    transfer: jest.fn(),
    getHealth: jest.fn(),
    subscribePrice: jest.fn(),
    getBalance: jest.fn().mockResolvedValue(10000),
};

describe("PortfolioManager", () => {
    // eslint-disable-next-line functional/no-let
    let manager: PortfolioManager;
    // eslint-disable-next-line functional/no-let
    let mockRebalancer: any;
    // eslint-disable-next-line functional/no-let
    let mockTransferManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // cast to any for test injection
        manager = new PortfolioManager({ mock: mockGateway as any });

        // Get mock instances
        // @ts-expect-error accessing mock instances
        mockRebalancer = Rebalancer.mock.instances[0];
        // @ts-expect-error accessing mock instances
        mockTransferManager = TransferManager.mock.instances[0];

        // Setup default mock returns
        // @ts-expect-error accessing private property for test
        manager.tracker.updatePosition.mockResolvedValue({
            symbol: "BTC-USDT",
            unrealizedPnL: 0,
            spotSize: 0,
            perpSize: 0,
            spotEntry: 0,
            perpEntry: 0,
            entryBasis: 0,
            currentBasis: 0,
            type: "CORE",
        });
        // @ts-expect-error accessing private property for test
        manager.tracker.getHealthReport.mockReturnValue({});
    });

    describe("update", () => {
        it("should trigger rebalancing when rebalancer returns action", async () => {
            // Setup rebalancer to return TIER1 action
            mockRebalancer.evaluate.mockReturnValue({
                action: "TIER1",
                symbol: "BTC-USDT",
                amountTransferred: 1000,
                newMarginUtilization: 0.25,
                success: false,
            });

            await manager.update("BTC-USDT");

            expect(mockTransferManager.executeTopUp).toHaveBeenCalledWith(
                "BTC-USDT",
                1000,
            );
            expect(mockRebalancer.evaluate).toHaveBeenCalled();
        });

        it("should trigger rebalancing for TIER2 action", async () => {
            mockRebalancer.evaluate.mockReturnValue({
                action: "TIER2",
                symbol: "BTC-USDT",
                amountTransferred: 2000,
                newMarginUtilization: 0.35,
                success: false,
            });

            await manager.update("BTC-USDT");

            expect(mockTransferManager.executeTopUp).toHaveBeenCalledWith(
                "BTC-USDT",
                2000,
            );
        });

	    it("should handle COMPOUND action", async () => {
	        const consoleSpy = jest.spyOn(console, "info").mockImplementation(
	            () => {},
	        );
            mockRebalancer.evaluate.mockReturnValue({
                action: "COMPOUND",
                symbol: "BTC-USDT",
                amountTransferred: 500,
                newMarginUtilization: 0.1,
                success: false,
            });

            await manager.update("BTC-USDT");

            expect(mockTransferManager.executeTopUp).not.toHaveBeenCalled();
	        expect(consoleSpy).toHaveBeenCalledWith(
	            expect.stringContaining("Compounding not yet implemented"),
	        );
	        consoleSpy.mockRestore();
	    });

        it("should handle HARD_COMPOUND action", async () => {
            const consoleSpy = jest.spyOn(console, "log").mockImplementation(
                () => {},
            );
            mockRebalancer.evaluate.mockReturnValue({
                action: "HARD_COMPOUND",
                symbol: "BTC-USDT",
                amountTransferred: 1000,
                newMarginUtilization: 0.05,
                success: false,
            });

            await manager.update("BTC-USDT");

            expect(mockTransferManager.executeTopUp).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it("should handle transfer error gracefully", async () => {
            const errorSpy = jest.spyOn(console, "error").mockImplementation(
                () => {},
            );
            mockRebalancer.evaluate.mockReturnValue({
                action: "TIER1",
                symbol: "BTC-USDT",
                amountTransferred: 1000,
                newMarginUtilization: 0.25,
                success: false,
            });
            mockTransferManager.executeTopUp.mockRejectedValue(
                new Error("Transfer failed"),
            );

            await manager.update("BTC-USDT");

            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining("Rebalance Failed"),
            );
            errorSpy.mockRestore();
        });

        it("should not trigger rebalancing when rebalancer returns null", async () => {
            mockRebalancer.evaluate.mockReturnValue(null);

            await manager.update("BTC-USDT");

            expect(mockTransferManager.executeTopUp).not.toHaveBeenCalled();
        });
    });

    describe("checkHealth", () => {
        it("should return health report from tracker", async () => {
            const mockReport = { nav: 10000, positions: [] };
            // @ts-expect-error accessing private property
            manager.tracker.getHealthReport.mockReturnValue(mockReport);

            const report = await manager.checkHealth();

            expect(report).toEqual(mockReport);
        });
    });

    describe("getTracker", () => {
        it("should return tracker instance", () => {
            const tracker = manager.getTracker();
            expect(tracker).toBeDefined();
        });
    });

    describe("getHealthReport", () => {
        it("should return tracker health report", () => {
            const mockReport = { nav: 5000, delta: 0 };
            // @ts-expect-error accessing private property
            manager.tracker.getHealthReport.mockReturnValue(mockReport);

            const report = manager.getHealthReport();

            expect(report).toEqual(mockReport);
        });
    });

    describe("initialize", () => {
        it("should initialize all gateways", async () => {
            await manager.initialize();

            expect(mockGateway.initialize).toHaveBeenCalled();
        });
    });
});
