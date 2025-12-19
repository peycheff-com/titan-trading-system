/**
 * PartialFillHandler Tests
 * 
 * Tests for the Partial Fill Handler implementation.
 * Requirements: 68.1-68.7
 */

import { jest } from '@jest/globals';
import { PartialFillHandler, CONFIG } from './PartialFillHandler.js';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock ShadowState
function createMockShadowState(options = {}) {
  return {
    confirmExecution: jest.fn().mockReturnValue({
      symbol: 'BTCUSDT',
      side: 'LONG',
      size: options.positionSize ?? 0.5,
      entry_price: 50000,
    }),
    getPosition: jest.fn().mockReturnValue(
      options.hasPosition !== false ? {
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: options.positionSize ?? 0.5,
        entry_price: 50000,
      } : null
    ),
  };
}

describe('PartialFillHandler', () => {
  let handler;
  let mockShadowState;

  beforeEach(() => {
    jest.clearAllMocks();
    mockShadowState = createMockShadowState();
    
    handler = new PartialFillHandler({
      shadowState: mockShadowState,
      minFillRatioToChase: 0.5,
      cancelTimeoutMs: 5000,
      logger: mockLogger,
    });
  });

  describe('constructor', () => {
    it('should throw if shadowState is not provided', () => {
      expect(() => new PartialFillHandler({}))
        .toThrow('ShadowState instance is required');
    });

    it('should use default config values', () => {
      const h = new PartialFillHandler({ shadowState: mockShadowState });
      expect(h.minFillRatioToChase).toBe(CONFIG.MIN_FILL_RATIO_TO_CHASE);
      expect(h.cancelTimeoutMs).toBe(CONFIG.CANCEL_TIMEOUT_MS);
    });
  });

  describe('calculateFillUpdate', () => {
    it('should calculate fill ratio correctly', () => {
      const update = handler.calculateFillUpdate('test', 1.0, 0.5, 50000, 1000);
      
      expect(update.signal_id).toBe('test');
      expect(update.requested_size).toBe(1.0);
      expect(update.filled_size).toBe(0.5);
      expect(update.fill_price).toBe(50000);
      expect(update.remaining_size).toBe(0.5);
      expect(update.fill_ratio).toBe(0.5);
      expect(update.elapsed_ms).toBe(1000);
    });

    it('should handle zero requested size', () => {
      const update = handler.calculateFillUpdate('test', 0, 0, 50000, 1000);
      expect(update.fill_ratio).toBe(0);
    });

    it('should handle full fill', () => {
      const update = handler.calculateFillUpdate('test', 1.0, 1.0, 50000, 1000);
      expect(update.remaining_size).toBe(0);
      expect(update.fill_ratio).toBe(1);
    });
  });

  describe('decideAction', () => {
    it('should return COMPLETE when fully filled', () => {
      const fillUpdate = {
        signal_id: 'test',
        fill_ratio: 1.0,
        remaining_size: 0,
        elapsed_ms: 1000,
      };

      const decision = handler.decideAction(fillUpdate);
      expect(decision.action).toBe('COMPLETE');
    });

    /**
     * Property 48: Partial fill cancellation
     * Requirements: 68.3 - If fill_ratio < 0.5 AND time_elapsed > 5000ms: cancel remaining
     */
    it('should return CANCEL when fill_ratio < 0.5 and timeout exceeded', () => {
      const fillUpdate = {
        signal_id: 'test',
        fill_ratio: 0.3,
        remaining_size: 0.7,
        elapsed_ms: 6000,
      };

      const decision = handler.decideAction(fillUpdate);
      expect(decision.action).toBe('CANCEL');
      expect(decision.reason).toContain('fill_ratio');
    });

    it('should return CHASE when fill_ratio >= 0.5', () => {
      const fillUpdate = {
        signal_id: 'test',
        fill_ratio: 0.6,
        remaining_size: 0.4,
        elapsed_ms: 6000,
      };

      const decision = handler.decideAction(fillUpdate);
      expect(decision.action).toBe('CHASE');
      expect(decision.chase_size).toBe(0.4);
    });

    it('should return CHASE when within timeout even with low fill ratio', () => {
      const fillUpdate = {
        signal_id: 'test',
        fill_ratio: 0.3,
        remaining_size: 0.7,
        elapsed_ms: 3000, // Within 5000ms timeout
      };

      const decision = handler.decideAction(fillUpdate);
      expect(decision.action).toBe('CHASE');
      expect(decision.reason).toContain('Within timeout');
    });
  });

  describe('handlePartialFill', () => {
    it('should update Shadow State with actual filled_size', () => {
      const brokerResponse = {
        broker_order_id: 'BROKER_123',
        fill_size: 0.3,
        fill_price: 50000,
      };

      handler.handlePartialFill(
        'test_signal',
        'BTCUSDT',
        brokerResponse,
        1.0, // requested size
        Date.now() - 1000 // order start time
      );

      // Requirements: 68.2 - Update Shadow State with actual filled_size
      expect(mockShadowState.confirmExecution).toHaveBeenCalledWith(
        'test_signal',
        expect.objectContaining({
          fill_size: 0.3, // Actual filled size, not requested
          fill_price: 50000,
          filled: true,
        })
      );
    });

    it('should emit fill:partial event for partial fills', () => {
      const partialHandler = jest.fn();
      handler.on('fill:partial', partialHandler);

      const brokerResponse = {
        broker_order_id: 'BROKER_123',
        fill_size: 0.3,
        fill_price: 50000,
      };

      handler.handlePartialFill(
        'test_signal',
        'BTCUSDT',
        brokerResponse,
        1.0,
        Date.now() - 1000
      );

      expect(partialHandler).toHaveBeenCalled();
    });

    it('should emit fill:complete event for full fills', () => {
      const completeHandler = jest.fn();
      handler.on('fill:complete', completeHandler);

      const brokerResponse = {
        broker_order_id: 'BROKER_123',
        fill_size: 1.0,
        fill_price: 50000,
      };

      handler.handlePartialFill(
        'test_signal',
        'BTCUSDT',
        brokerResponse,
        1.0,
        Date.now() - 1000
      );

      expect(completeHandler).toHaveBeenCalled();
    });

    it('should emit fill:cancel event when cancelling', () => {
      const cancelHandler = jest.fn();
      handler.on('fill:cancel', cancelHandler);

      const brokerResponse = {
        broker_order_id: 'BROKER_123',
        fill_size: 0.2, // Low fill ratio
        fill_price: 50000,
      };

      handler.handlePartialFill(
        'test_signal',
        'BTCUSDT',
        brokerResponse,
        1.0,
        Date.now() - 6000 // Past timeout
      );

      expect(cancelHandler).toHaveBeenCalled();
    });

    it('should emit fill:chase event when chasing', () => {
      const chaseHandler = jest.fn();
      handler.on('fill:chase', chaseHandler);

      const brokerResponse = {
        broker_order_id: 'BROKER_123',
        fill_size: 0.6, // Good fill ratio
        fill_price: 50000,
      };

      handler.handlePartialFill(
        'test_signal',
        'BTCUSDT',
        brokerResponse,
        1.0,
        Date.now() - 1000
      );

      expect(chaseHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test_signal',
          symbol: 'BTCUSDT',
          chase_size: 0.4,
        })
      );
    });

    it('should log fill details', () => {
      const brokerResponse = {
        broker_order_id: 'BROKER_123',
        fill_size: 0.5,
        fill_price: 50000,
      };

      handler.handlePartialFill(
        'test_signal',
        'BTCUSDT',
        brokerResponse,
        1.0,
        Date.now() - 1000
      );

      // Requirements: 68.7 - Log: signal_id, requested_size, filled_size, fill_ratio, action_taken
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test_signal',
          requested_size: 1.0,
          filled_size: 0.5,
          fill_ratio: 0.5,
        }),
        expect.any(String)
      );
    });
  });

  describe('getExitSize', () => {
    /**
     * Requirements: 68.5 - Exit signals use size = current_position_size
     */
    it('should return current position size', () => {
      mockShadowState = createMockShadowState({ positionSize: 0.75 });
      handler = new PartialFillHandler({
        shadowState: mockShadowState,
        logger: mockLogger,
      });

      const size = handler.getExitSize('BTCUSDT');
      expect(size).toBe(0.75);
    });

    it('should return 0 when no position exists', () => {
      mockShadowState = createMockShadowState({ hasPosition: false });
      handler = new PartialFillHandler({
        shadowState: mockShadowState,
        logger: mockLogger,
      });

      const size = handler.getExitSize('BTCUSDT');
      expect(size).toBe(0);
    });
  });

  describe('order tracking', () => {
    it('should track active orders', () => {
      handler.trackOrder('test_signal', {
        symbol: 'BTCUSDT',
        size: 1.0,
      });

      const tracked = handler.getTrackedOrder('test_signal');
      expect(tracked).toBeDefined();
      expect(tracked.symbol).toBe('BTCUSDT');
      expect(tracked.start_time).toBeDefined();
    });

    it('should remove tracked orders', () => {
      handler.trackOrder('test_signal', { symbol: 'BTCUSDT' });
      handler.removeTrackedOrder('test_signal');

      const tracked = handler.getTrackedOrder('test_signal');
      expect(tracked).toBeNull();
    });

    it('should return all active orders', () => {
      handler.trackOrder('signal1', { symbol: 'BTCUSDT' });
      handler.trackOrder('signal2', { symbol: 'ETHUSDT' });

      const orders = handler.getActiveOrders();
      expect(orders.size).toBe(2);
    });
  });

  describe('getStatus', () => {
    it('should return handler status', () => {
      handler.trackOrder('test', { symbol: 'BTCUSDT' });
      
      const status = handler.getStatus();
      expect(status.active_orders).toBe(1);
      expect(status.min_fill_ratio_to_chase).toBe(0.5);
      expect(status.cancel_timeout_ms).toBe(5000);
    });
  });
});
