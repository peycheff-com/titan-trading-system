import { BinanceGateway } from "../../src/exchanges/BinanceGateway";
import { BybitGateway } from "../../src/exchanges/BybitGateway";

describe("Exchange Gateways", () => {
    describe("BinanceGateway", () => {
        it("should implement initialize", async () => {
            const gateway = new BinanceGateway("key", "secret");
            await expect(gateway.initialize()).resolves.not.toThrow();
        });

        it("should execute order (stub)", async () => {
            const gateway = new BinanceGateway("key", "secret");
            await gateway.initialize();
            const result = await gateway.executeOrder({
                symbol: "BTCUSDT",
                side: "BUY",
                type: "MARKET",
                size: 1,
            });
            expect(result.status).toBe("FILLED");
            expect(result.filledSize).toBe(1);
        });
    });

    describe("BybitGateway", () => {
        it("should implement initialize", async () => {
            const gateway = new BybitGateway("key", "secret");
            await expect(gateway.initialize()).resolves.not.toThrow();
        });

        it("should execute order (stub)", async () => {
            const gateway = new BybitGateway("key", "secret");
            await gateway.initialize();
            const result = await gateway.executeOrder({
                symbol: "BTCUSDT",
                side: "BUY",
                type: "MARKET",
                size: 1,
            });
            expect(result.status).toBe("FILLED");
            expect(result.filledSize).toBe(1);
        });
    });
});
