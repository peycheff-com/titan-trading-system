import { SentinelConfig, SentinelCore } from "../../src/engine/SentinelCore";
import { ExchangeGateway } from "../../src/exchanges/ExchangeGateway";
import { Order, OrderSide, OrderType } from "../../src/types/orders";

// Mock Gateway
class MockGateway implements ExchangeGateway {
    name: string;
    constructor(public id: string) {
        this.name = id;
    }

    async getPrice(symbol: string): Promise<number> {
        if (this.id === "binance_spot") return 10000;
        if (this.id === "bybit_perp") return 10010; // +0.1% basis
        return 10000;
    }

    async getOrderBook(symbol: string) {
        return { bids: [], asks: [], timestamp: Date.now() };
    }

    async executeOrder(order: Order) {
        return {
            success: true,
            orderId: "mock-id",
            filledSize: order.size,
            avgPrice: 10000,
        };
    }

    async getBalance() {
        return { free: 10000, used: 0, total: 10000 };
    }

    async getPosition(symbol: string) {
        return null;
    }
}

describe("Sentinel Core Integration", () => {
    let core: SentinelCore;
    let gateways: ExchangeGateway[];

    const config: SentinelConfig = {
        symbol: "BTC",
        updateIntervalMs: 100, // fast
        initialCapital: 10000,
        riskLimits: {
            maxDrawdown: 0.10,
            maxLeverage: 2.0,
            maxDelta: 1000,
        },
    };

    beforeEach(() => {
        gateways = [
            new MockGateway("binance_spot"),
            new MockGateway("bybit_perp"),
        ];
        core = new SentinelCore(config, gateways);
    });

    afterEach(async () => {
        await core.stop();
    });

    it("should initialize all components", () => {
        expect(core.router).toBeDefined();
        expect(core.portfolio).toBeDefined();
        expect(core.risk).toBeDefined();
        expect(core.vacuum).toBeDefined();
        expect(core.performance).toBeDefined();
        expect(core.signals).toBeDefined();
    });

    it("should start and stop without errors", async () => {
        await core.start();
        await new Promise((r) => setTimeout(r, 200)); // Let it tick
        await core.stop();
    });

    it("should process risk checks on tick", async () => {
        // Spy on risk module
        const riskSpy = jest.spyOn(core.risk, "evaluate");

        await core.start();
        console.log("[TEST] Calling onTick manually");
        // Manually trigger tick to avoid timing issues
        await (core as any).onTick();

        // Should have called evaluate
        expect(riskSpy).toHaveBeenCalled();
        await core.stop();
    });

    it("should generate signals when price diverges", async () => {
        const sigSpy = jest.spyOn(core.signals, "updateBasis");

        await core.start();
        await (core as any).onTick();

        expect(sigSpy).toHaveBeenCalled();
        await core.stop();
    });
});
