/**
 * BrokerGateway Tests
 * 
 * Tests for the Broker Gateway module.
 * Requirements: 23.1-23.4
 */

import { jest } from '@jest/globals';
import { 
  BrokerGateway, 
  MockBrokerAdapter,
  generateClientOrderId,
  generateIdempotencyKey,
  validateOrderParams,
} from './BrokerGateway.js';

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
 * Create valid order params for testing
 */
function createValidOrderParams(overrides = {}) {
  return {
    symbol: 'BTCUSDT',
    side: 'BUY',
    size: 0.1,
    limit_price: 50000,
    stop_loss: 49000,
    take_profits: [51000, 52000, 53000],
    order_type: 'LIMIT',
    ...overrides,
  };
}

//─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTION TESTS
//─────────────────────────────────────────────────────────────────────────────

describe('Helper Functions', () => {
  describe('generateClientOrderId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateClientOrderId('BTCUSDT', 'BUY');
      const id2 = generateClientOrderId('BTCUSDT', 'BUY');
      
      expect(id1).not.toBe(id2);
    });

    it('should include symbol and side in ID', () => {
      const id = generateClientOrderId('ETHUSDT', 'SELL');
      
      expect(id).toContain('titan_');
      expect(id).toContain('ETHUSDT');
      expect(id).toContain('SELL');
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate consistent keys for same signal ID', () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      const key1 = generateIdempotencyKey(signalId);
      const key2 = generateIdempotencyKey(signalId);
      
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different signal IDs', () => {
      const key1 = generateIdempotencyKey('signal_1');
      const key2 = generateIdempotencyKey('signal_2');
      
      expect(key1).not.toBe(key2);
    });

    it('should return 32-character hex string', () => {
      const key = generateIdempotencyKey('test_signal');
      
      expect(key).toHaveLength(32);
      expect(key).toMatch(/^[a-f0-9]+$/);
    });
  });

  describe('validateOrderParams', () => {
    it('should accept valid params', () => {
      const params = createValidOrderParams();
      
      expect(() => validateOrderParams(params)).not.toThrow();
    });

    it('should reject null params', () => {
      expect(() => validateOrderParams(null)).toThrow('Order parameters are required');
    });

    it('should reject missing symbol', () => {
      const params = createValidOrderParams({ symbol: undefined });
      
      expect(() => validateOrderParams(params)).toThrow('symbol is required');
    });

    it('should reject invalid side', () => {
      const params = createValidOrderParams({ side: 'INVALID' });
      
      expect(() => validateOrderParams(params)).toThrow('side must be BUY or SELL');
    });

    it('should reject invalid size', () => {
      const params = createValidOrderParams({ size: -1 });
      
      expect(() => validateOrderParams(params)).toThrow('size must be a positive finite number');
    });

    it('should reject zero size', () => {
      const params = createValidOrderParams({ size: 0 });
      
      expect(() => validateOrderParams(params)).toThrow('size must be a positive finite number');
    });

    it('should reject invalid order type', () => {
      const params = createValidOrderParams({ order_type: 'INVALID' });
      
      expect(() => validateOrderParams(params)).toThrow('order_type must be');
    });

    it('should reject LIMIT order without price', () => {
      const params = createValidOrderParams({ order_type: 'LIMIT', limit_price: undefined });
      
      expect(() => validateOrderParams(params)).toThrow('limit_price is required for LIMIT orders');
    });
  });
});

//─────────────────────────────────────────────────────────────────────────────
// MOCK BROKER ADAPTER TESTS
//─────────────────────────────────────────────────────────────────────────────

describe('MockBrokerAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new MockBrokerAdapter();
  });

  describe('sendOrder', () => {
    it('should create order and return broker_order_id', async () => {
      const order = {
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        limit_price: 50000,
      };

      const result = await adapter.sendOrder(order);

      expect(result.broker_order_id).toBeDefined();
      expect(result.broker_order_id).toContain('BROKER_');
      expect(result.status).toBe('FILLED');
      expect(result.fill_price).toBe(50000);
      expect(result.fill_size).toBe(0.1);
    });

    it('should create position for non-reduce_only orders', async () => {
      const order = {
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        limit_price: 50000,
      };

      await adapter.sendOrder(order);
      const positions = await adapter.getPositions();

      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('BTCUSDT');
      expect(positions[0].side).toBe('LONG');
      expect(positions[0].size).toBe(0.1);
    });

    it('should simulate failure when configured', async () => {
      adapter.simulateFailure = true;
      adapter.failureReason = 'Test failure';

      await expect(adapter.sendOrder({ symbol: 'BTCUSDT', side: 'BUY', size: 0.1 }))
        .rejects.toThrow('Test failure');
    });
  });

  describe('getPositions', () => {
    it('should return empty array when no positions', async () => {
      const positions = await adapter.getPositions();
      
      expect(positions).toEqual([]);
    });

    it('should return positions after orders', async () => {
      await adapter.sendOrder({ symbol: 'BTCUSDT', side: 'BUY', size: 0.1, limit_price: 50000 });
      await adapter.sendOrder({ symbol: 'ETHUSDT', side: 'SELL', size: 1.0, limit_price: 3000 });

      const positions = await adapter.getPositions();

      expect(positions).toHaveLength(2);
    });
  });

  describe('closeAllPositions', () => {
    it('should close all positions', async () => {
      await adapter.sendOrder({ symbol: 'BTCUSDT', side: 'BUY', size: 0.1, limit_price: 50000 });
      await adapter.sendOrder({ symbol: 'ETHUSDT', side: 'BUY', size: 1.0, limit_price: 3000 });

      const result = await adapter.closeAllPositions();
      const positions = await adapter.getPositions();

      expect(result.success).toBe(true);
      expect(result.closed_count).toBe(2);
      expect(positions).toHaveLength(0);
    });
  });
});

//─────────────────────────────────────────────────────────────────────────────
// BROKER GATEWAY TESTS
//─────────────────────────────────────────────────────────────────────────────

describe('BrokerGateway', () => {
  let gateway;
  let mockLogger;
  let mockAdapter;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockAdapter = new MockBrokerAdapter();
    mockAdapter.latencyMs = 0; // Speed up tests
    
    gateway = new BrokerGateway({
      adapter: mockAdapter,
      logger: mockLogger,
      timeoutMs: 1000,
      maxRetries: 2,
      retryDelayMs: 10,
    });
  });

  describe('constructor', () => {
    it('should create with default adapter if none provided', () => {
      const gw = new BrokerGateway();
      
      expect(gw.adapter).toBeInstanceOf(MockBrokerAdapter);
    });

    it('should use provided adapter', () => {
      expect(gateway.adapter).toBe(mockAdapter);
    });
  });

  describe('sendOrder', () => {
    /**
     * Requirements: 23.1 - Include idempotency_key and client_order_id
     */
    it('should include idempotency_key and client_order_id', async () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      const params = createValidOrderParams();

      const result = await gateway.sendOrder(signalId, params);

      expect(result.idempotency_key).toBeDefined();
      expect(result.idempotency_key).toHaveLength(32);
      expect(result.client_order_id).toBeDefined();
      expect(result.client_order_id).toContain('titan_');
    });

    /**
     * Requirements: 23.2 - Include side, limit_price, size, stop_loss, and take_profits array
     */
    it('should send order with all required fields', async () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      const params = createValidOrderParams();

      const result = await gateway.sendOrder(signalId, params);

      expect(result.success).toBe(true);
      expect(result.filled).toBe(true);
    });

    /**
     * Requirements: 23.3 - Return broker_order_id and estimated_fill_price
     */
    it('should return broker_order_id and fill_price', async () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      const params = createValidOrderParams();

      const result = await gateway.sendOrder(signalId, params);

      expect(result.broker_order_id).toBeDefined();
      expect(result.broker_order_id).toContain('BROKER_');
      expect(result.fill_price).toBe(50000);
      expect(result.fill_size).toBe(0.1);
    });

    it('should return cached result for duplicate signal ID (idempotency)', async () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      const params = createValidOrderParams();

      const result1 = await gateway.sendOrder(signalId, params);
      const result2 = await gateway.sendOrder(signalId, params);

      expect(result1.broker_order_id).toBe(result2.broker_order_id);
      expect(result1.idempotency_key).toBe(result2.idempotency_key);
    });

    it('should emit order:sent event', async () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      const params = createValidOrderParams();
      const sentHandler = jest.fn();
      
      gateway.on('order:sent', sentHandler);
      await gateway.sendOrder(signalId, params);

      expect(sentHandler).toHaveBeenCalledTimes(1);
      expect(sentHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: signalId,
          symbol: 'BTCUSDT',
          side: 'BUY',
        })
      );
    });

    it('should emit order:filled event on successful fill', async () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      const params = createValidOrderParams();
      const filledHandler = jest.fn();
      
      gateway.on('order:filled', filledHandler);
      await gateway.sendOrder(signalId, params);

      expect(filledHandler).toHaveBeenCalledTimes(1);
      expect(filledHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          filled: true,
          broker_order_id: expect.any(String),
        })
      );
    });

    it('should emit order:rejected event on failure', async () => {
      mockAdapter.simulateFailure = true;
      mockAdapter.failureReason = 'Broker error';
      
      const signalId = 'titan_BTCUSDT_12345_15';
      const params = createValidOrderParams();
      const rejectedHandler = jest.fn();
      
      gateway.on('order:rejected', rejectedHandler);
      const result = await gateway.sendOrder(signalId, params);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Broker error');
      expect(rejectedHandler).toHaveBeenCalledTimes(1);
    });

    /**
     * Requirements: 23.4 - Push status update via WebSocket /ws/status channel
     */
    it('should emit status:update event', async () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      const params = createValidOrderParams();
      const statusHandler = jest.fn();
      
      gateway.on('status:update', statusHandler);
      await gateway.sendOrder(signalId, params);

      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ORDER_UPDATE',
          signal_id: signalId,
          channel: '/ws/status',
        })
      );
    });

    it('should reject invalid order params', async () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      const params = { symbol: 'BTCUSDT' }; // Missing required fields

      await expect(gateway.sendOrder(signalId, params))
        .rejects.toThrow('side must be BUY or SELL');
    });
  });

  describe('getPositions', () => {
    it('should return positions from broker', async () => {
      // Create a position first
      await gateway.sendOrder('signal_1', createValidOrderParams());
      
      const positions = await gateway.getPositions();

      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('BTCUSDT');
    });

    it('should throw on broker error', async () => {
      mockAdapter.simulateFailure = true;
      mockAdapter.failureReason = 'Connection error';

      await expect(gateway.getPositions()).rejects.toThrow('Connection error');
    });
  });

  describe('closeAllPositions', () => {
    it('should close all positions', async () => {
      // Create positions
      await gateway.sendOrder('signal_1', createValidOrderParams({ symbol: 'BTCUSDT' }));
      await gateway.sendOrder('signal_2', createValidOrderParams({ symbol: 'ETHUSDT' }));

      const result = await gateway.closeAllPositions();
      const positions = await gateway.getPositions();

      expect(result.success).toBe(true);
      expect(result.closed_count).toBe(2);
      expect(positions).toHaveLength(0);
    });

    it('should emit positions:flattened event', async () => {
      await gateway.sendOrder('signal_1', createValidOrderParams());
      
      const flattenHandler = jest.fn();
      gateway.on('positions:flattened', flattenHandler);
      
      await gateway.closeAllPositions();

      expect(flattenHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          closed_count: 1,
        })
      );
    });

    it('should push EMERGENCY_FLATTEN status update', async () => {
      await gateway.sendOrder('signal_1', createValidOrderParams());
      
      const statusHandler = jest.fn();
      gateway.on('status:update', statusHandler);
      
      await gateway.closeAllPositions();

      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EMERGENCY_FLATTEN',
          channel: '/ws/status',
        })
      );
    });
  });

  describe('closePosition', () => {
    it('should close specific position', async () => {
      await gateway.sendOrder('signal_1', createValidOrderParams({ symbol: 'BTCUSDT' }));
      await gateway.sendOrder('signal_2', createValidOrderParams({ symbol: 'ETHUSDT' }));

      const result = await gateway.closePosition('BTCUSDT');
      const positions = await gateway.getPositions();

      expect(result.success).toBe(true);
      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('ETHUSDT');
    });

    it('should emit position:closed event', async () => {
      await gateway.sendOrder('signal_1', createValidOrderParams());
      
      const closedHandler = jest.fn();
      gateway.on('position:closed', closedHandler);
      
      await gateway.closePosition('BTCUSDT');

      expect(closedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          success: true,
        })
      );
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order', async () => {
      const result = await gateway.sendOrder('signal_1', createValidOrderParams());
      
      const cancelResult = await gateway.cancelOrder(result.broker_order_id);

      expect(cancelResult.success).toBe(true);
    });

    it('should emit order:canceled event', async () => {
      const result = await gateway.sendOrder('signal_1', createValidOrderParams());
      
      const cancelHandler = jest.fn();
      gateway.on('order:canceled', cancelHandler);
      
      await gateway.cancelOrder(result.broker_order_id);

      expect(cancelHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: result.broker_order_id,
          success: true,
        })
      );
    });
  });

  describe('idempotency cache', () => {
    it('should track cache size', async () => {
      expect(gateway.getIdempotencyCacheSize()).toBe(0);
      
      await gateway.sendOrder('signal_1', createValidOrderParams());
      expect(gateway.getIdempotencyCacheSize()).toBe(1);
      
      await gateway.sendOrder('signal_2', createValidOrderParams());
      expect(gateway.getIdempotencyCacheSize()).toBe(2);
    });

    it('should check if signal is processed', async () => {
      expect(gateway.isSignalProcessed('signal_1')).toBe(false);
      
      await gateway.sendOrder('signal_1', createValidOrderParams());
      
      expect(gateway.isSignalProcessed('signal_1')).toBe(true);
    });

    it('should get cached result', async () => {
      await gateway.sendOrder('signal_1', createValidOrderParams());
      
      const cached = gateway.getCachedResult('signal_1');
      
      expect(cached).toBeDefined();
      expect(cached.success).toBe(true);
      expect(cached.broker_order_id).toBeDefined();
    });

    it('should clear cache', async () => {
      await gateway.sendOrder('signal_1', createValidOrderParams());
      expect(gateway.getIdempotencyCacheSize()).toBe(1);
      
      gateway.clearIdempotencyCache();
      
      expect(gateway.getIdempotencyCacheSize()).toBe(0);
    });
  });

  describe('WebSocket integration', () => {
    it('should broadcast to WebSocket server when configured', async () => {
      const mockWsServer = {
        broadcast: jest.fn(),
      };
      
      gateway.setWebSocketServer(mockWsServer);
      await gateway.sendOrder('signal_1', createValidOrderParams());

      expect(mockWsServer.broadcast).toHaveBeenCalled();
      
      const broadcastCall = mockWsServer.broadcast.mock.calls[0][0];
      const parsed = JSON.parse(broadcastCall);
      
      expect(parsed.channel).toBe('/ws/status');
      expect(parsed.type).toBe('ORDER_UPDATE');
    });

    it('should handle WebSocket broadcast errors gracefully', async () => {
      const mockWsServer = {
        broadcast: jest.fn().mockImplementation(() => {
          throw new Error('WebSocket error');
        }),
      };
      
      gateway.setWebSocketServer(mockWsServer);
      
      // Should not throw
      const result = await gateway.sendOrder('signal_1', createValidOrderParams());
      
      expect(result.success).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });
});
