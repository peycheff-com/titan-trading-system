import type { Order, OrderResult } from "../types/orders.js";

/**
 * Interface for executing single orders
 */
export interface IOrderExecutor {
    /**
     * Execute a single order
     */
    executeOrder(order: Order): Promise<OrderResult>;

    /**
     * Get current market price (for slippage checks)
     */
    getPrice(symbol: string): Promise<number>;
}

/**
 * TWAP Execution Request
 */
export interface TwapRequest {
    symbol: string;
    side: "BUY" | "SELL";
    totalSize: number;
    /** Total duration in ms */
    duration: number;
}
