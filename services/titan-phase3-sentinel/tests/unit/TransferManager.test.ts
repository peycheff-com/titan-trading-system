/* Jest globals: describe, it, expect, beforeEach */
import { TransferManager } from "../../src/portfolio/TransferManager.js";
import type { IExchangeGateway } from "../../src/exchanges/interfaces.js";

describe("TransferManager", () => {
    const createMockGateway = (): IExchangeGateway => ({
        name: "mock",
        initialize: jest.fn().mockResolvedValue(undefined),
        executeOrder: jest.fn() as any,
        getPrice: jest.fn().mockResolvedValue(50000),
        getTicker: jest
            .fn()
            .mockResolvedValue({ price: 50000, bid: 49990, ask: 50010 }),
        getBalance: jest.fn().mockResolvedValue(15000),
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
            consoleSpy = jest.spyOn(console, "info").mockImplementation(
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
                expect.stringContaining(
                    "[TransferManager] Transferring 500 USD from SPOT to PERP",
                ),
            );
        });

        it("should transfer from PERP to SPOT", async () => {
            const result = await manager.transfer(300, "PERP", "SPOT");
            expect(result).toBe(true);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining(
                    "[TransferManager] Transferring 300 USD from PERP to SPOT",
                ),
            );
        });
    });

    describe("executeTopUp", () => {
        let manager: TransferManager;
        let consoleSpy: jest.SpyInstance;

        beforeEach(() => {
            const gateway = createMockGateway();
            manager = new TransferManager(gateway);
            consoleSpy = jest.spyOn(console, "info").mockImplementation(
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
                expect.stringContaining(
                    "[TransferManager] Transferring 1000 USD from SPOT to PERP",
                ),
            );
        });

        it("should handle zero amount in top-up", async () => {
            const result = await manager.executeTopUp("ETHUSDT", 0);
            expect(result).toBe(false);
        });
    });
});
