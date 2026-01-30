/* Jest globals: describe, it, expect, beforeEach */
import { TransferManager } from "../../src/portfolio/TransferManager.js";
import type { IExchangeGateway } from "../../src/exchanges/interfaces.js";

describe("TransferManager", () => {
    const createMockGateway = (): IExchangeGateway => ({
        exchangeName: "MockExchange",
        getSpotPrice: jest.fn().mockResolvedValue(50000),
        getPerpPrice: jest.fn().mockResolvedValue(50100),
        getBalance: jest.fn().mockResolvedValue({
            free: 10000,
            used: 5000,
            total: 15000,
        }),
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        isConnected: jest.fn().mockReturnValue(true),
    });

    describe("constructor", () => {
        it("should create instance with gateway", () => {
            const gateway = createMockGateway();
            const manager = new TransferManager(gateway);
            expect(manager).toBeDefined();
        });
    });

    describe("transfer", () => {
        let manager: TransferManager;
        let consoleSpy: jest.SpyInstance;

        beforeEach(() => {
            const gateway = createMockGateway();
            manager = new TransferManager(gateway);
            consoleSpy = jest.spyOn(console, "log").mockImplementation(
                () => {},
            );
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        it("should return false for zero amount", async () => {
            const result = await manager.transfer(0, "SPOT", "PERP");
            expect(result).toBe(false);
        });

        it("should return false for negative amount", async () => {
            const result = await manager.transfer(-100, "SPOT", "PERP");
            expect(result).toBe(false);
        });

        it("should return true for same source and destination", async () => {
            const result = await manager.transfer(100, "SPOT", "SPOT");
            expect(result).toBe(true);
        });

        it("should transfer from SPOT to PERP", async () => {
            const result = await manager.transfer(500, "SPOT", "PERP");
            expect(result).toBe(true);
            expect(consoleSpy).toHaveBeenCalledWith(
                "[TransferManager] Transferring 500 USD from SPOT to PERP",
            );
        });

        it("should transfer from PERP to SPOT", async () => {
            const result = await manager.transfer(300, "PERP", "SPOT");
            expect(result).toBe(true);
            expect(consoleSpy).toHaveBeenCalledWith(
                "[TransferManager] Transferring 300 USD from PERP to SPOT",
            );
        });
    });

    describe("executeTopUp", () => {
        let manager: TransferManager;
        let consoleSpy: jest.SpyInstance;

        beforeEach(() => {
            const gateway = createMockGateway();
            manager = new TransferManager(gateway);
            consoleSpy = jest.spyOn(console, "log").mockImplementation(
                () => {},
            );
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        it("should execute top-up from SPOT to PERP", async () => {
            const result = await manager.executeTopUp("BTCUSDT", 1000);
            expect(result).toBe(true);
            expect(consoleSpy).toHaveBeenCalledWith(
                "[TransferManager] Transferring 1000 USD from SPOT to PERP",
            );
        });

        it("should handle zero amount in top-up", async () => {
            const result = await manager.executeTopUp("ETHUSDT", 0);
            expect(result).toBe(false);
        });
    });
});
