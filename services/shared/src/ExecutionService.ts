/**
 * Unified Execution Service for Titan Trading System
 *
 * Provides centralized order execution with rate limiting, broker abstraction,
 * and comprehensive order management across multiple exchanges.
 *
 * Requirements: 3.1 - Centralized order execution
 */

import { EventEmitter } from 'eventemitter3';
// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
};

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
export type OrderStatus =
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED'
  | 'EXPIRED';

/**
 * Exchange configuration
 */
export interface ExchangeConfig {
  name: string;
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  rateLimit: number; // requests per second
  endpoints: {
    rest: string;
    websocket: string;
  };
}

/**
 * Rate limiter for exchange requests
 */
class RateLimiter {
  private requests: number[] = [];

  constructor(
    private maxRequests: number,
    private windowMs: number = 1000,
  ) {}

  /**
   * Check if request is allowed
   */
  isAllowed(): boolean {
    const now = Date.now();

    // Remove old requests outside the window
    // eslint-disable-next-line functional/immutable-data
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    // Check if we can make another request
    if (this.requests.length < this.maxRequests) {
      // eslint-disable-next-line functional/immutable-data
      this.requests.push(now);
      return true;
    }

    return false;
  }

  /**
   * Get time until next request is allowed
   */
  getTimeUntilReset(): number {
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
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 60000,
  ) {}

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        // eslint-disable-next-line functional/immutable-data
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    // eslint-disable-next-line functional/immutable-data
    this.failures = 0;
    // eslint-disable-next-line functional/immutable-data
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    // eslint-disable-next-line functional/immutable-data
    this.failures++;
    // eslint-disable-next-line functional/immutable-data
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      // eslint-disable-next-line functional/immutable-data
      this.state = 'OPEN';
    }
  }

  getState(): string {
    return this.state;
  }
}

/**
 * Exchange broker abstraction
 */
abstract class ExchangeBroker extends EventEmitter {
  protected rateLimiter: RateLimiter;
  protected circuitBreaker: CircuitBreaker;

  constructor(protected config: ExchangeConfig) {
    super();
    this.rateLimiter = new RateLimiter(config.rateLimit);
    this.circuitBreaker = new CircuitBreaker();
  }

  /**
   * Place order on exchange
   */
  abstract placeOrder(params: OrderParams): Promise<OrderResult>;

  /**
   * Cancel order on exchange
   */
  abstract cancelOrder(orderId: string): Promise<void>;

  /**
   * Get order status
   */
  abstract getOrderStatus(orderId: string): Promise<OrderResult>;

  /**
   * Get account balance
   */
  abstract getBalance(): Promise<Record<string, number>>;

  /**
   * Execute with rate limiting and circuit breaker
   */
  protected async executeWithProtection<T>(fn: () => Promise<T>): Promise<T> {
    // Rate limiting
    if (!this.rateLimiter.isAllowed()) {
      const waitTime = this.rateLimiter.getTimeUntilReset();
      console.log(
        colors.yellow(`⏳ Rate limit reached for ${this.config.name}, waiting ${waitTime}ms`),
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    // Circuit breaker
    return this.circuitBreaker.execute(fn);
  }
}

/**
 * Bybit exchange broker
 */
class BybitBroker extends ExchangeBroker {
  async placeOrder(params: OrderParams): Promise<OrderResult> {
    return this.executeWithProtection(async () => {
      console.log(
        colors.blue(`📤 Placing ${params.side} order for ${params.qty} ${params.symbol} on Bybit`),
      );

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 100));

      const orderId = `bybit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const result: OrderResult = {
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
        phase: params.phase,
      };

      // Emit order event
      this.emit('orderPlaced', result);

      return result;
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    return this.executeWithProtection(async () => {
      console.log(colors.yellow(`❌ Canceling order ${orderId} on Bybit`));

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 50));

      this.emit('orderCanceled', { orderId, exchange: 'bybit' });
    });
  }

  async getOrderStatus(orderId: string): Promise<OrderResult> {
    return this.executeWithProtection(async () => {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 50));

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
        phase: 'phase1',
      };
    });
  }

  async getBalance(): Promise<Record<string, number>> {
    return this.executeWithProtection(async () => {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        USDT: 10000,
        BTC: 0.5,
        ETH: 2.0,
      };
    });
  }
}

/**
 * MEXC exchange broker
 */
class MexcBroker extends ExchangeBroker {
  async placeOrder(params: OrderParams): Promise<OrderResult> {
    return this.executeWithProtection(async () => {
      console.log(
        colors.blue(`📤 Placing ${params.side} order for ${params.qty} ${params.symbol} on MEXC`),
      );

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 120));

      const orderId = `mexc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const result: OrderResult = {
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
        phase: params.phase,
      };

      // Emit order event
      this.emit('orderPlaced', result);

      return result;
    });
  }

  async cancelOrder(orderId: string): Promise<void> {
    return this.executeWithProtection(async () => {
      console.log(colors.yellow(`❌ Canceling order ${orderId} on MEXC`));

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 80));

      this.emit('orderCanceled', { orderId, exchange: 'mexc' });
    });
  }

  async getOrderStatus(orderId: string): Promise<OrderResult> {
    return this.executeWithProtection(async () => {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 80));

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
        phase: 'phase1',
      };
    });
  }

  async getBalance(): Promise<Record<string, number>> {
    return this.executeWithProtection(async () => {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 100));

      return {
        USDT: 5000,
        BTC: 0.2,
        ETH: 1.0,
      };
    });
  }
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
export class ExecutionService extends EventEmitter {
  private brokers = new Map<string, ExchangeBroker>();
  private orders = new Map<string, TrackedOrder>();
  private defaultExchange = 'bybit';

  constructor() {
    super();
    console.log(colors.blue('🚀 Execution Service initialized'));
  }

  /**
   * Add exchange broker
   */
  addExchange(config: ExchangeConfig): void {
    // eslint-disable-next-line functional/no-let
    let broker: ExchangeBroker;

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

    // eslint-disable-next-line functional/immutable-data
    this.brokers.set(config.name.toLowerCase(), broker);
    console.log(colors.green(`✅ Added ${config.name} exchange broker`));
  }

  /**
   * Set default exchange
   */
  setDefaultExchange(exchange: string): void {
    if (!this.brokers.has(exchange.toLowerCase())) {
      throw new Error(`Exchange ${exchange} not found`);
    }
    // eslint-disable-next-line functional/immutable-data
    this.defaultExchange = exchange.toLowerCase();
    console.log(colors.blue(`🔄 Default exchange set to ${exchange}`));
  }

  /**
   * Place order with automatic exchange selection
   */
  async placeOrder(params: OrderParams, exchange?: string): Promise<OrderResult> {
    const targetExchange = exchange?.toLowerCase() || this.defaultExchange;
    const broker = this.brokers.get(targetExchange);

    if (!broker) {
      throw new Error(`Exchange ${targetExchange} not available`);
    }

    try {
      console.log(
        colors.blue(
          `🎯 Executing ${params.phase} order: ${params.side} ${params.qty} ${params.symbol} on ${targetExchange}`,
        ),
      );

      const result = await broker.placeOrder(params);

      console.log(colors.green(`✅ Order placed successfully: ${result.orderId}`));
      return result;
    } catch (error) {
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
  async cancelOrder(orderId: string, exchange?: string): Promise<void> {
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
      // eslint-disable-next-line functional/immutable-data
      trackedOrder.status = 'CANCELED';
      // eslint-disable-next-line functional/immutable-data
      trackedOrder.lastUpdate = Date.now();
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId: string, exchange?: string): Promise<OrderResult> {
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
      // eslint-disable-next-line functional/immutable-data
      Object.assign(trackedOrder, result);
      // eslint-disable-next-line functional/immutable-data
      trackedOrder.lastUpdate = Date.now();
    }

    return result;
  }

  /**
   * Get account balance from exchange
   */
  async getBalance(exchange?: string): Promise<Record<string, number>> {
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
  async getAllBalances(): Promise<Record<string, Record<string, number>>> {
    const balances: Record<string, Record<string, number>> = {};

    for (const [exchange, broker] of this.brokers) {
      try {
        // eslint-disable-next-line functional/immutable-data
        balances[exchange] = await broker.getBalance();
      } catch (error) {
        console.error(colors.red(`❌ Failed to get balance from ${exchange}:`), error);
        // eslint-disable-next-line functional/immutable-data
        balances[exchange] = {};
      }
    }

    return balances;
  }

  /**
   * Get tracked orders
   */
  getTrackedOrders(): TrackedOrder[] {
    return Array.from(this.orders.values());
  }

  /**
   * Get orders by phase
   */
  getOrdersByPhase(phase: string): TrackedOrder[] {
    return Array.from(this.orders.values()).filter((order) => order.phase === phase);
  }

  /**
   * Get available exchanges
   */
  getAvailableExchanges(): string[] {
    return Array.from(this.brokers.keys());
  }

  /**
   * Check exchange health
   */
  async checkExchangeHealth(exchange: string): Promise<boolean> {
    const broker = this.brokers.get(exchange.toLowerCase());
    if (!broker) {
      return false;
    }

    try {
      await broker.getBalance();
      return true;
    } catch (error) {
      console.error(colors.red(`❌ Exchange ${exchange} health check failed:`), error);
      return false;
    }
  }

  /**
   * Track order for management
   */
  private trackOrder(order: OrderResult): void {
    const trackedOrder: TrackedOrder = {
      ...order,
      retryCount: 0,
      lastUpdate: Date.now(),
    };

    // eslint-disable-next-line functional/immutable-data
    this.orders.set(order.orderId, trackedOrder);
  }

  /**
   * Get fallback exchange
   */
  private getFallbackExchange(currentExchange: string): string | null {
    const exchanges = Array.from(this.brokers.keys()).filter((ex) => ex !== currentExchange);
    return exchanges.length > 0 ? exchanges[0] : null;
  }

  /**
   * Cleanup old orders
   */
  cleanupOldOrders(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [orderId, order] of this.orders) {
      if (now - order.lastUpdate > maxAgeMs) {
        // eslint-disable-next-line functional/immutable-data
        toRemove.push(orderId);
      }
    }

    // eslint-disable-next-line functional/immutable-data
    toRemove.forEach((orderId) => this.orders.delete(orderId));

    if (toRemove.length > 0) {
      console.log(colors.blue(`🧹 Cleaned up ${toRemove.length} old orders`));
    }
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down Execution Service...'));
    // eslint-disable-next-line functional/immutable-data
    this.brokers.clear();
    // eslint-disable-next-line functional/immutable-data
    this.orders.clear();
    this.removeAllListeners();
  }
}

/**
 * Singleton Execution Service instance
 */
// eslint-disable-next-line functional/no-let
let executionServiceInstance: ExecutionService | null = null;

/**
 * Get or create the global Execution Service instance
 */
export function getExecutionService(): ExecutionService {
  if (!executionServiceInstance) {
    executionServiceInstance = new ExecutionService();
  }
  return executionServiceInstance;
}

/**
 * Reset the global Execution Service instance (for testing)
 */
export function resetExecutionService(): void {
  if (executionServiceInstance) {
    executionServiceInstance.shutdown();
  }
  executionServiceInstance = null;
}
