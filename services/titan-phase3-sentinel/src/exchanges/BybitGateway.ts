import type { Order, OrderResult } from "../types/orders.js";
import type { IExchangeGateway } from "./interfaces.js";

export class BybitGateway implements IExchangeGateway {
    private apiKey: string;
    private apiSecret: string;
    private isTestnet: boolean;

    public name = "bybit";

    constructor(apiKey: string, apiSecret: string, isTestnet: boolean = false) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.isTestnet = isTestnet;
    }

    async initialize(): Promise<void> {
        // Connect to Bybit API
        return Promise.resolve();
    }

    async executeOrder(order: Order): Promise<OrderResult> {
        // Implement Bybit order execution stub
        return {
            orderId: "bybit-stub-" + Date.now(),
            status: "FILLED",
            filledSize: order.size,
            avgPrice: await this.getPrice(order.symbol),
            fees: 0,
            timestamp: Date.now(),
        };
    }

    async getPrice(symbol: string): Promise<number> {
        return 50000; // Stub
    }

    async getBalance(asset: string): Promise<number> {
        return 10000; // Stub
    }
}
