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
};

describe("PortfolioManager", () => {
    let manager: PortfolioManager;
    let mockRebalancer: any;
    let mockTransferManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // cast to any for test injection
        manager = new PortfolioManager({ mock: mockGateway as any });

        // Get mock instances
        // @ts-ignore
        mockRebalancer = Rebalancer.mock.instances[0];
        // @ts-ignore
        mockTransferManager = TransferManager.mock.instances[0];

        // Setup default mock returns
        // @ts-ignore
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
        // @ts-ignore
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

        it("should not trigger rebalancing when rebalancer returns null", async () => {
            mockRebalancer.evaluate.mockReturnValue(null);

            await manager.update("BTC-USDT");

            expect(mockTransferManager.executeTopUp).not.toHaveBeenCalled();
        });
    });
});
