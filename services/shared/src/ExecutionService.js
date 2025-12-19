"use strict";
/**
 * Unified Execution Service for Titan Trading System
 *
 * Provides centralized order execution with rate limiting, broker abstraction,
 * and comprehensive order management across multiple exchanges.
 *
 * Requirements: 3.1 - Centralized order execution
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionService = void 0;
exports.getExecutionService = getExecutionService;
exports.resetExecutionService = resetExecutionService;
const eventemitter3_1 = require("eventemitter3");
// Simple color logging utility
const colors = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
};
/**
 * Rate limiter for exchange requests
 */
class RateLimiter {
    maxRequests;
    windowMs;
    requests = [];
    constructor(maxRequests, windowMs = 1000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }
    /**
     * Check if request is allowed
     */
    isAllowed() {
        const now = Date.now();
        // Remove old requests outside the window
        this.requests = this.requests.filter(time => now - time < this.windowMs);
        // Check if we can make another request
        if (this.requests.length < this.maxRequests) {
            this.requests.push(now);
            return true;
        }
        return false;
    }
    /**
     * Get time until next request is allowed
     */
    getTimeUntilReset() {
        if (this.requests.length < this.maxRequests) {
            return 0;
        }
        const oldestRequest = Math.min(...this.requests);
        return this.windowMs - (Date.now() - oldestRequest);
    }
}
/**
 * Circuit breaker for exchange connections
 */
class CircuitBreaker {
    failureThreshold;
    recoveryTimeout;
    failures = 0;
    lastFailureTime = 0;
    state = 'CLOSED';
    constructor(failureThreshold = 5, recoveryTimeout = 60000) {
        this.failureThreshold = failureThreshold;
        this.recoveryTimeout = recoveryTimeout;
    }
    /**
     * Execute function with circuit breaker protection
     */
    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
                this.state = 'HALF_OPEN';
            }
            else {
                throw new Error('Circuit breaker is OPEN');
            }
        }
        try {
            const result = await fn();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }
    onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
        }
    }
    getState() {
        return this.state;
    }
}
/**
 * Exchange broker abstraction
 */
class ExchangeBroker extends eventemitter3_1.EventEmitter {
    config;
    rateLimiter;
    circuitBreaker;
    constructor(config) {
        super();
        this.config = config;
        this.rateLimiter = new RateLimiter(config.rateLimit);
        this.circuitBreaker = new CircuitBreaker();
    }
    /**
     * Execute with rate limiting and circuit breaker
     */
    async executeWithProtection(fn) {
        // Rate limiting
        if (!this.rateLimiter.isAllowed()) {
            const waitTime = this.rateLimiter.getTimeUntilReset();
            console.log(colors.yellow(`⏳ Rate limit reached for ${this.config.name}, waiting ${waitTime}ms`));
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        // Circuit breaker
        return this.circuitBreaker.execute(fn);
    }
}
/**
 * Bybit exchange broker
 */
class BybitBroker extends ExchangeBroker {
    async placeOrder(params) {
        return this.executeWithProtection(async () => {
            console.log(colors.blue(`📤 Placing ${params.side} order for ${params.qty} ${params.symbol} on Bybit`));
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 100));
            const orderId = `bybit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const result = {
                orderId,
                clientOrderId: params.clientOrderId,
                symbol: params.symbol,
                side: params.side,
                type: params.type,
                qty: params.qty,
                price: params.price,
                status: 'NEW',
                timestamp: Date.now(),
                exchange: 'bybit',
                phase: params.phase
            };
            // Emit order event
            this.emit('orderPlaced', result);
            return result;
        });
    }
    async cancelOrder(orderId) {
        return this.executeWithProtection(async () => {
            console.log(colors.yellow(`❌ Canceling order ${orderId} on Bybit`));
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 50));
            this.emit('orderCanceled', { orderId, exchange: 'bybit' });
        });
    }
    async getOrderStatus(orderId) {
        return this.executeWithProtection(async () => {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 50));
            // Mock order status
            return {
                orderId,
                symbol: 'BTCUSDT',
                side: 'Buy',
                type: 'MARKET',
                qty: 0.1,
                status: 'FILLED',
                timestamp: Date.now(),
                exchange: 'bybit',
                phase: 'phase1'
            };
        });
    }
    async getBalance() {
        return this.executeWithProtection(async () => {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 100));
            return {
                USDT: 10000,
                BTC: 0.5,
                ETH: 2.0
            };
        });
    }
}
/**
 * MEXC exchange broker
 */
class MexcBroker extends ExchangeBroker {
    async placeOrder(params) {
        return this.executeWithProtection(async () => {
            console.log(colors.blue(`📤 Placing ${params.side} order for ${params.qty} ${params.symbol} on MEXC`));
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 120));
            const orderId = `mexc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const result = {
                orderId,
                clientOrderId: params.clientOrderId,
                symbol: params.symbol,
                side: params.side,
                type: params.type,
                qty: params.qty,
                price: params.price,
                status: 'NEW',
                timestamp: Date.now(),
                exchange: 'mexc',
                phase: params.phase
            };
            // Emit order event
            this.emit('orderPlaced', result);
            return result;
        });
    }
    async cancelOrder(orderId) {
        return this.executeWithProtection(async () => {
            console.log(colors.yellow(`❌ Canceling order ${orderId} on MEXC`));
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 80));
            this.emit('orderCanceled', { orderId, exchange: 'mexc' });
        });
    }
    async getOrderStatus(orderId) {
        return this.executeWithProtection(async () => {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 80));
            // Mock order status
            return {
                orderId,
                symbol: 'BTCUSDT',
                side: 'Buy',
                type: 'MARKET',
                qty: 0.1,
                status: 'FILLED',
                timestamp: Date.now(),
                exchange: 'mexc',
                phase: 'phase1'
            };
        });
    }
    async getBalance() {
        return this.executeWithProtection(async () => {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 100));
            return {
                USDT: 5000,
                BTC: 0.2,
                ETH: 1.0
            };
        });
    }
}
/**
 * Unified Execution Service
 */
class ExecutionService extends eventemitter3_1.EventEmitter {
    brokers = new Map();
    orders = new Map();
    defaultExchange = 'bybit';
    constructor() {
        super();
        console.log(colors.blue('🚀 Execution Service initialized'));
    }
    /**
     * Add exchange broker
     */
    addExchange(config) {
        let broker;
        switch (config.name.toLowerCase()) {
            case 'bybit':
                broker = new BybitBroker(config);
                break;
            case 'mexc':
                broker = new MexcBroker(config);
                break;
            default:
                throw new Error(`Unsupported exchange: ${config.name}`);
        }
        // Forward broker events
        broker.on('orderPlaced', (order) => {
            this.trackOrder(order);
            this.emit('orderPlaced', order);
        });
        broker.on('orderCanceled', (data) => {
            this.emit('orderCanceled', data);
        });
        this.brokers.set(config.name.toLowerCase(), broker);
        console.log(colors.green(`✅ Added ${config.name} exchange broker`));
    }
    /**
     * Set default exchange
     */
    setDefaultExchange(exchange) {
        if (!this.brokers.has(exchange.toLowerCase())) {
            throw new Error(`Exchange ${exchange} not found`);
        }
        this.defaultExchange = exchange.toLowerCase();
        console.log(colors.blue(`🔄 Default exchange set to ${exchange}`));
    }
    /**
     * Place order with automatic exchange selection
     */
    async placeOrder(params, exchange) {
        const targetExchange = exchange?.toLowerCase() || this.defaultExchange;
        const broker = this.brokers.get(targetExchange);
        if (!broker) {
            throw new Error(`Exchange ${targetExchange} not available`);
        }
        try {
            console.log(colors.blue(`🎯 Executing ${params.phase} order: ${params.side} ${params.qty} ${params.symbol} on ${targetExchange}`));
            const result = await broker.placeOrder(params);
            console.log(colors.green(`✅ Order placed successfully: ${result.orderId}`));
            return result;
        }
        catch (error) {
            console.error(colors.red(`❌ Order placement failed on ${targetExchange}:`), error);
            // Try fallback exchange if available
            if (!exchange && this.brokers.size > 1) {
                const fallbackExchange = this.getFallbackExchange(targetExchange);
                if (fallbackExchange) {
                    console.log(colors.yellow(`🔄 Retrying on fallback exchange: ${fallbackExchange}`));
                    return this.placeOrder(params, fallbackExchange);
                }
            }
            throw error;
        }
    }
    /**
     * Cancel order
     */
    async cancelOrder(orderId, exchange) {
        // Find order if exchange not specified
        if (!exchange) {
            const trackedOrder = this.orders.get(orderId);
            if (trackedOrder) {
                exchange = trackedOrder.exchange;
            }
        }
        if (!exchange) {
            throw new Error(`Cannot determine exchange for order ${orderId}`);
        }
        const broker = this.brokers.get(exchange.toLowerCase());
        if (!broker) {
            throw new Error(`Exchange ${exchange} not available`);
        }
        await broker.cancelOrder(orderId);
        // Update tracked order
        const trackedOrder = this.orders.get(orderId);
        if (trackedOrder) {
            trackedOrder.status = 'CANCELED';
            trackedOrder.lastUpdate = Date.now();
        }
    }
    /**
     * Get order status
     */
    async getOrderStatus(orderId, exchange) {
        // Try to get from tracked orders first
        const trackedOrder = this.orders.get(orderId);
        if (trackedOrder && !exchange) {
            exchange = trackedOrder.exchange;
        }
        if (!exchange) {
            throw new Error(`Cannot determine exchange for order ${orderId}`);
        }
        const broker = this.brokers.get(exchange.toLowerCase());
        if (!broker) {
            throw new Error(`Exchange ${exchange} not available`);
        }
        const result = await broker.getOrderStatus(orderId);
        // Update tracked order
        if (trackedOrder) {
            Object.assign(trackedOrder, result);
            trackedOrder.lastUpdate = Date.now();
        }
        return result;
    }
    /**
     * Get account balance from exchange
     */
    async getBalance(exchange) {
        const targetExchange = exchange?.toLowerCase() || this.defaultExchange;
        const broker = this.brokers.get(targetExchange);
        if (!broker) {
            throw new Error(`Exchange ${targetExchange} not available`);
        }
        return broker.getBalance();
    }
    /**
     * Get all balances from all exchanges
     */
    async getAllBalances() {
        const balances = {};
        for (const [exchange, broker] of this.brokers) {
            try {
                balances[exchange] = await broker.getBalance();
            }
            catch (error) {
                console.error(colors.red(`❌ Failed to get balance from ${exchange}:`), error);
                balances[exchange] = {};
            }
        }
        return balances;
    }
    /**
     * Get tracked orders
     */
    getTrackedOrders() {
        return Array.from(this.orders.values());
    }
    /**
     * Get orders by phase
     */
    getOrdersByPhase(phase) {
        return Array.from(this.orders.values()).filter(order => order.phase === phase);
    }
    /**
     * Get available exchanges
     */
    getAvailableExchanges() {
        return Array.from(this.brokers.keys());
    }
    /**
     * Check exchange health
     */
    async checkExchangeHealth(exchange) {
        const broker = this.brokers.get(exchange.toLowerCase());
        if (!broker) {
            return false;
        }
        try {
            await broker.getBalance();
            return true;
        }
        catch (error) {
            console.error(colors.red(`❌ Exchange ${exchange} health check failed:`), error);
            return false;
        }
    }
    /**
     * Track order for management
     */
    trackOrder(order) {
        const trackedOrder = {
            ...order,
            retryCount: 0,
            lastUpdate: Date.now()
        };
        this.orders.set(order.orderId, trackedOrder);
    }
    /**
     * Get fallback exchange
     */
    getFallbackExchange(currentExchange) {
        const exchanges = Array.from(this.brokers.keys()).filter(ex => ex !== currentExchange);
        return exchanges.length > 0 ? exchanges[0] : null;
    }
    /**
     * Cleanup old orders
     */
    cleanupOldOrders(maxAgeMs = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        const toRemove = [];
        for (const [orderId, order] of this.orders) {
            if (now - order.lastUpdate > maxAgeMs) {
                toRemove.push(orderId);
            }
        }
        toRemove.forEach(orderId => this.orders.delete(orderId));
        if (toRemove.length > 0) {
            console.log(colors.blue(`🧹 Cleaned up ${toRemove.length} old orders`));
        }
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
        console.log(colors.blue('🛑 Shutting down Execution Service...'));
        this.brokers.clear();
        this.orders.clear();
        this.removeAllListeners();
    }
}
exports.ExecutionService = ExecutionService;
/**
 * Singleton Execution Service instance
 */
let executionServiceInstance = null;
/**
 * Get or create the global Execution Service instance
 */
function getExecutionService() {
    if (!executionServiceInstance) {
        executionServiceInstance = new ExecutionService();
    }
    return executionServiceInstance;
}
/**
 * Reset the global Execution Service instance (for testing)
 */
function resetExecutionService() {
    if (executionServiceInstance) {
        executionServiceInstance.shutdown();
    }
    executionServiceInstance = null;
}
//# sourceMappingURL=ExecutionService.js.map