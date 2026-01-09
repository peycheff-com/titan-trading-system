/**
 * LimitOrKill Tests
 * 
 * Tests for the Limit-or-Kill execution module.
 * Requirements: 94.1-94.6
 */

import { jest } from '@jest/globals';
import { 
  LimitOrKill,
  MockLimitOrKillAdapter,
  validateParams,
} from './LimitOrKill.js';
import { BrokerGateway, MockBrokerAdapter } from './BrokerGateway.js';

//─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mock logger that captures log calls
 */
function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

/**
 * Create valid LimitOrKill params for testing
 */
function createValidParams(overrides = {}) {
  return {
    signal_id: 'titan_BTCUSDT_12345_15',
    symbol: 'BTCUSDT',
    side: 'BUY',
    size: 0.1,
    limit_price: 50000,
    stop_loss: 49000,
    take_profits: [51000, 52000],
    ...overrides,
  };
}

/**
 * Create a BrokerGateway with MockLimitOrKillAdapter
 */
function createTestBrokerGateway(logger) {
  const adapter = new MockLimitOrKillAdapter();
  const gateway = new BrokerGateway({ adapter, logger });
  return { gateway, adapter };
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

//─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTION TESTS
//─────────────────────────────────────────────────────────────────────────────

describe('Helper Functions', () => {
  describe('validateParams', () => {
    it('should accept valid params', () => {
      const params = createValidParams();
      
      expect(() => validateParams(params)).not.toThrow();
    });

    it('should reject missing params', () => {
      expect(() => validateParams(null)).toThrow('LimitOrKill parameters are required');
    });

    it('should reject missing signal_id', () => {
      const params = createValidParams({ signal_id: undefined });
      
      expect(() => validateParams(params)).toThrow('signal_id is required');
    });

    it('should reject invalid side', () => {
      const params = createValidParams({ side: 'INVALID' });
      
      expect(() => validateParams(params)).toThrow('side must be BUY or SELL');
    });

    it('should reject invalid size', () => {
      const params = createValidParams({ size: -1 });
      
      expect(() => validateParams(params)).toThrow('size must be a positive finite number');
    });

    it('should reject invalid limit_price', () => {
      const params = createValidParams({ limit_price: 0 });
      
      expect(() => validateParams(params)).toThrow('limit_price is required and must be positive');
    });
  });
});

//─────────────────────────────────────────────────────────────────────────────
// MOCK ADAPTER TESTS
//─────────────────────────────────────────────────────────────────────────────

describe('MockLimitOrKillAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new MockLimitOrKillAdapter();
  });

  describe('sendOrder', () => {
    it('should create order with NEW status', async () => {
      const order = {
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        limit_price: 50000,
      };
      
      const result = await adapter.sendOrder(order);
      
      expect(result.broker_order_id).toBeDefined();
      expect(result.status).toBe('NEW');
    });

    it('should simulate fill after delay', async () => {
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      
      const order = {
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        limit_price: 50000,
      };
      
      const result = await adapter.sendOrder(order);
      const orderId = result.broker_order_id;
      
      // Check status immediately
      let status = await adapter.getOrderStatus(orderId);
      expect(status.status).toBe('NEW');
      
      // Wait for fill
      await sleep(150);
      
      // Check status after fill
      status = await adapter.getOrderStatus(orderId);
      expect(status.status).toBe('FILLED');
      expect(status.fill_size).toBe(0.1);
    });

    it('should simulate partial fill', async () => {
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      adapter.partialFillRatio = 0.5; // 50% fill
      
      const order = {
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        limit_price: 50000,
      };
      
      const result = await adapter.sendOrder(order);
      const orderId = result.broker_order_id;
      
      // Wait for partial fill
      await sleep(150);
      
      const status = await adapter.getOrderStatus(orderId);
      expect(status.status).toBe('PARTIALLY_FILLED');
      expect(status.fill_size).toBe(0.05);
      expect(status.remaining_size).toBe(0.05);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel NEW order', async () => {
      adapter.simulateFill = false;
      
      const order = {
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        limit_price: 50000,
      };
      
      const result = await adapter.sendOrder(order);
      const orderId = result.broker_order_id;
      
      const cancelResult = await adapter.cancelOrder(orderId);
      
      expect(cancelResult.success).toBe(true);
      expect(cancelResult.order_id).toBe(orderId);
    });

    it('should not cancel FILLED order', async () => {
      adapter.fillDelayMs = 50;
      adapter.simulateFill = true;
      
      const order = {
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        limit_price: 50000,
      };
      
      const result = await adapter.sendOrder(order);
      const orderId = result.broker_order_id;
      
      // Wait for fill
      await sleep(100);
      
      const cancelResult = await adapter.cancelOrder(orderId);
      
      expect(cancelResult.success).toBe(false);
      expect(cancelResult.reason).toBe('ALREADY_FILLED');
    });
  });
});

//─────────────────────────────────────────────────────────────────────────────
// LIMIT-OR-KILL TESTS
//─────────────────────────────────────────────────────────────────────────────

describe('LimitOrKill', () => {
  let limitOrKill;
  let brokerGateway;
  let adapter;
  let logger;

  beforeEach(() => {
    logger = createMockLogger();
    const testGateway = createTestBrokerGateway(logger);
    brokerGateway = testGateway.gateway;
    adapter = testGateway.adapter;
    
    limitOrKill = new LimitOrKill({
      brokerGateway,
      logger,
      waitTimeMs: 1000, // Shorter wait time for tests
      pollIntervalMs: 50,
    });
  });

  afterEach(() => {
    brokerGateway.destroy();
    adapter.reset();
  });

  describe('constructor', () => {
    it('should require brokerGateway', () => {
      expect(() => new LimitOrKill({})).toThrow('brokerGateway is required');
    });

    it('should use default config values', () => {
      const lok = new LimitOrKill({ brokerGateway });
      
      expect(lok.waitTimeMs).toBe(5000);
      expect(lok.pollIntervalMs).toBe(100);
    });

    it('should accept custom config values', () => {
      const lok = new LimitOrKill({
        brokerGateway,
        waitTimeMs: 3000,
        pollIntervalMs: 200,
      });
      
      expect(lok.waitTimeMs).toBe(3000);
      expect(lok.pollIntervalMs).toBe(200);
    });
  });

  describe('execute - Full Fill', () => {
    it('should successfully execute when order fills immediately', async () => {
      // Requirements: 94.1, 94.5 - Place Limit Order and proceed with normal position management
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      adapter.partialFillRatio = 1.0;
      
      const params = createValidParams();
      const result = await limitOrKill.execute(params);
      
      expect(result.success).toBe(true);
      expect(result.status).toBe('FILLED');
      expect(result.broker_order_id).toBeDefined();
      expect(result.fill_price).toBe(50000);
      expect(result.fill_size).toBe(0.1);
      expect(result.requested_size).toBe(0.1);
    });

    it('should emit order:placed event', async () => {
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      
      const placedHandler = jest.fn();
      limitOrKill.on('order:placed', placedHandler);
      
      const params = createValidParams();
      await limitOrKill.execute(params);
      
      expect(placedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: params.signal_id,
          broker_order_id: expect.any(String),
          limit_price: params.limit_price,
          size: params.size,
        })
      );
    });

    it('should emit order:filled event', async () => {
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      
      const filledHandler = jest.fn();
      limitOrKill.on('order:filled', filledHandler);
      
      const params = createValidParams();
      await limitOrKill.execute(params);
      
      expect(filledHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          status: 'FILLED',
          fill_size: 0.1,
        })
      );
    });

    it('should place order with postOnly=true', async () => {
      // Requirements: 94.1 - Place Limit Order with postOnly=true (maker order)
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      
      const sendOrderSpy = jest.spyOn(brokerGateway, 'sendOrder');
      
      const params = createValidParams();
      await limitOrKill.execute(params);
      
      expect(sendOrderSpy).toHaveBeenCalledWith(
        params.signal_id,
        expect.objectContaining({
          post_only: true,
          order_type: 'LIMIT',
        })
      );
    });
  });

  describe('execute - Partial Fill', () => {
    it('should handle partial fill and cancel remaining', async () => {
      // Requirements: 94.6 - Handle partial fills: cancel remaining, keep partial position
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      adapter.partialFillRatio = 0.6; // 60% fill
      
      const params = createValidParams({ size: 1.0 });
      const result = await limitOrKill.execute(params);
      
      expect(result.success).toBe(true);
      expect(result.status).toBe('PARTIALLY_FILLED');
      expect(result.fill_size).toBe(0.6);
      expect(result.requested_size).toBe(1.0);
    });

    it('should emit order:partially_filled event', async () => {
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      adapter.partialFillRatio = 0.5;
      
      const partialHandler = jest.fn();
      limitOrKill.on('order:partially_filled', partialHandler);
      
      const params = createValidParams({ size: 1.0 });
      await limitOrKill.execute(params);
      
      expect(partialHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'PARTIALLY_FILLED',
          fill_size: 0.5,
          requested_size: 1.0,
        })
      );
    });

    it('should emit order:canceled event for remaining', async () => {
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      adapter.partialFillRatio = 0.4;
      
      const canceledHandler = jest.fn();
      limitOrKill.on('order:canceled', canceledHandler);
      
      const params = createValidParams({ size: 1.0 });
      await limitOrKill.execute(params);
      
      expect(canceledHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          broker_order_id: expect.any(String),
          remaining_size: 0.6,
        })
      );
    });
  });

  describe('execute - Missed Entry', () => {
    it('should cancel order after wait time expires', async () => {
      // Requirements: 94.2, 94.3 - Wait exactly 5 seconds, then CANCEL ORDER
      adapter.simulateFill = false; // No fill
      
      const params = createValidParams();
      const result = await limitOrKill.execute(params);
      
      expect(result.success).toBe(false);
      expect(result.status).toBe('MISSED_ENTRY');
      expect(result.reason).toBe('Price ran away');
    });

    it('should emit order:missed event', async () => {
      adapter.simulateFill = false;
      
      const missedHandler = jest.fn();
      limitOrKill.on('order:missed', missedHandler);
      
      const params = createValidParams();
      await limitOrKill.execute(params);
      
      expect(missedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: 'MISSED_ENTRY',
          reason: 'Price ran away',
        })
      );
    });

    it('should log missed entry with price movement', async () => {
      // Requirements: 94.4 - Log: "Missed Entry - Price ran away", signal_id, bid_at_entry, current_bid, price_movement
      adapter.simulateFill = false;
      
      const params = createValidParams({ limit_price: 50000 });
      const result = await limitOrKill.execute(params);
      
      expect(result.price_movement).toBeDefined();
      expect(result.price_movement.bid_at_entry).toBe(50000);
      expect(result.price_movement.current_bid).toBeDefined();
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: params.signal_id,
          bid_at_entry: 50000,
          current_bid: expect.any(Number),
          price_movement: expect.any(Object),
        }),
        'Missed Entry - Price ran away'
      );
    });

    it('should respect wait time', async () => {
      adapter.simulateFill = false;
      
      const startTime = Date.now();
      const params = createValidParams();
      await limitOrKill.execute(params);
      const elapsed = Date.now() - startTime;
      
      // Should wait approximately waitTimeMs (1000ms in tests)
      expect(elapsed).toBeGreaterThanOrEqual(1000);
      expect(elapsed).toBeLessThan(1200); // Allow some overhead
    });
  });

  describe('execute - Error Handling', () => {
    it('should handle order placement failure', async () => {
      const failingGateway = {
        sendOrder: jest.fn().mockResolvedValue({
          success: false,
          error: 'Broker unavailable',
        }),
        getAdapter: jest.fn(),
        cancelOrder: jest.fn(),
      };
      
      const lok = new LimitOrKill({
        brokerGateway: failingGateway,
        logger,
      });
      
      const params = createValidParams();
      const result = await lok.execute(params);
      
      expect(result.success).toBe(false);
      expect(result.status).toBe('MISSED_ENTRY');
    });

    it('should handle invalid parameters', async () => {
      const params = createValidParams({ size: -1 });
      
      await expect(limitOrKill.execute(params)).rejects.toThrow('size must be a positive finite number');
    });
  });

  describe('execute - Polling Behavior', () => {
    it('should poll order status at specified interval', async () => {
      adapter.fillDelayMs = 500;
      adapter.simulateFill = true;
      
      const getStatusSpy = jest.spyOn(adapter, 'getOrderStatus');
      
      const params = createValidParams();
      await limitOrKill.execute(params);
      
      // Should have polled multiple times (500ms fill / 50ms poll = ~10 polls)
      expect(getStatusSpy.mock.calls.length).toBeGreaterThan(5);
    });

    it('should stop polling after order fills', async () => {
      adapter.fillDelayMs = 200;
      adapter.simulateFill = true;
      
      const getStatusSpy = jest.spyOn(adapter, 'getOrderStatus');
      
      const params = createValidParams();
      await limitOrKill.execute(params);
      
      const pollCount = getStatusSpy.mock.calls.length;
      
      // Should stop polling after fill (not continue for full wait time)
      // 200ms fill / 50ms poll = ~4 polls, should be less than full wait time polls
      expect(pollCount).toBeLessThan(20); // 1000ms / 50ms = 20 max polls
    });
  });

  describe('execute - BUY vs SELL', () => {
    it('should handle BUY orders', async () => {
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      
      const params = createValidParams({ side: 'BUY' });
      const result = await limitOrKill.execute(params);
      
      expect(result.success).toBe(true);
      expect(result.status).toBe('FILLED');
    });

    it('should handle SELL orders', async () => {
      adapter.fillDelayMs = 100;
      adapter.simulateFill = true;
      
      const params = createValidParams({ side: 'SELL' });
      const result = await limitOrKill.execute(params);
      
      expect(result.success).toBe(true);
      expect(result.status).toBe('FILLED');
    });
  });
});
