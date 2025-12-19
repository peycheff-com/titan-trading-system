/**
 * Unified Execution Service for Titan Trading System
 *
 * Provides centralized order execution with rate limiting, broker abstraction,
 * and comprehensive order management across multiple exchanges.
 *
 * Requirements: 3.1 - Centralized order execution
 */
import { EventEmitter } from 'eventemitter3';
/**
 * Order parameters
 */
export interface OrderParams {
    phase: 'phase1' | 'phase2' | 'phase3';
    symbol: string;
    side: 'Buy' | 'Sell';
    type: 'MARKET' | 'LIMIT' | 'POST_ONLY';
    price?: number;
    qty: number;
    leverage?: number;
    stopLoss?: number;
    takeProfit?: number;
    timeInForce?: 'GTC' | 'IOC' | 'FOK';
    clientOrderId?: string;
}
/**
 * Order result
 */
export interface OrderResult {
    orderId: string;
    clientOrderId?: string;
    symbol: string;
    side: 'Buy' | 'Sell';
    type: string;
    qty: number;
    price?: number;
    status: OrderStatus;
    timestamp: number;
    exchange: string;
    phase: string;
}
/**
 * Order status
 */
export type OrderStatus = 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED' | 'EXPIRED';
/**
 * Exchange configuration
 */
export interface ExchangeConfig {
    name: string;
    apiKey: string;
    apiSecret: string;
    testnet: boolean;
    rateLimit: number;
    endpoints: {
        rest: string;
        websocket: string;
    };
}
/**
 * Order tracking and management
 */
interface TrackedOrder extends OrderResult {
    retryCount: number;
    lastUpdate: number;
}
/**
 * Unified Execution Service
 */
export declare class ExecutionService extends EventEmitter {
    private brokers;
    private orders;
    private defaultExchange;
    constructor();
    /**
     * Add exchange broker
     */
    addExchange(config: ExchangeConfig): void;
    /**
     * Set default exchange
     */
    setDefaultExchange(exchange: string): void;
    /**
     * Place order with automatic exchange selection
     */
    placeOrder(params: OrderParams, exchange?: string): Promise<OrderResult>;
    /**
     * Cancel order
     */
    cancelOrder(orderId: string, exchange?: string): Promise<void>;
    /**
     * Get order status
     */
    getOrderStatus(orderId: string, exchange?: string): Promise<OrderResult>;
    /**
     * Get account balance from exchange
     */
    getBalance(exchange?: string): Promise<Record<string, number>>;
    /**
     * Get all balances from all exchanges
     */
    getAllBalances(): Promise<Record<string, Record<string, number>>>;
    /**
     * Get tracked orders
     */
    getTrackedOrders(): TrackedOrder[];
    /**
     * Get orders by phase
     */
    getOrdersByPhase(phase: string): TrackedOrder[];
    /**
     * Get available exchanges
     */
    getAvailableExchanges(): string[];
    /**
     * Check exchange health
     */
    checkExchangeHealth(exchange: string): Promise<boolean>;
    /**
     * Track order for management
     */
    private trackOrder;
    /**
     * Get fallback exchange
     */
    private getFallbackExchange;
    /**
     * Cleanup old orders
     */
    cleanupOldOrders(maxAgeMs?: number): void;
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Get or create the global Execution Service instance
 */
export declare function getExecutionService(): ExecutionService;
/**
 * Reset the global Execution Service instance (for testing)
 */
export declare function resetExecutionService(): void;
export {};
//# sourceMappingURL=ExecutionService.d.ts.map