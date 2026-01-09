import type { Order, OrderResult } from "../types/orders.js";

/**
 * Standard interface for Exchange interaction
 */
export interface IExchangeGateway {
    /**
     * Execute order
     */
    executeOrder(order: Order): Promise<OrderResult>;

    /**
     * Get current price for symbol
     */
    getPrice(symbol: string): Promise<number>;

    /**
     * Get wallet balance for asset
     */
    getBalance(asset: string): Promise<number>;

    /**
     * Gateway name
     */
    name: string;

    /**
     * Initialize gateway (connect, auth)
     */
    initialize(): Promise<void>;
}
