import { JSONCodec } from "nats";

import { TitanExecutionGateway } from "../../src/exchanges/TitanExecutionGateway";

describe("Exchange Gateways", () => {
    const createMockNats = () => {
        const jc = JSONCodec();

        return {
            subscribe: jest.fn(() => (async function* () {})()),
            publish: jest.fn(),
            request: jest.fn().mockResolvedValue({
                data: jc.encode({ balances: [] }),
            }),
        } as any;
    };

    it("should initialize and subscribe to tickers", async () => {
        const nats = createMockNats();
        const gateway = new TitanExecutionGateway("binance", nats, "test-secret");

        await expect(gateway.initialize()).resolves.not.toThrow();
        expect(nats.subscribe).toHaveBeenCalledWith("titan.market.ticker.binance.>");
    });

    it("should publish an intent on executeOrder and return PENDING", async () => {
        const nats = createMockNats();
        const gateway = new TitanExecutionGateway("bybit", nats, "test-secret");

        const result = await gateway.executeOrder({
            symbol: "BTCUSDT",
            side: "BUY",
            type: "MARKET",
            size: 1,
        });

        expect(result.status).toBe("PENDING");
        expect(result.orderId).toEqual(expect.any(String));
        expect(nats.publish).toHaveBeenCalledWith(
            "titan.cmd.execution",
            expect.any(Uint8Array),
        );
    });
});

