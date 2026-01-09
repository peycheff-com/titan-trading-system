/**
 * WebSocket Status Channel Tests
 * 
 * Tests for the WebSocket status channel that pushes order status updates.
 * 
 * Requirements: 23.4 - Push status update via WebSocket /ws/status channel
 */

import { jest } from '@jest/globals';
import { WebSocketStatus, calculateSlippage, calculateFillPercent, generateClientId } from './WebSocketStatus.js';

//─────────────────────────────────────────────────────────────────────────────
// TEST SETUP
//─────────────────────────────────────────────────────────────────────────────

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

//─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTION TESTS
//─────────────────────────────────────────────────────────────────────────────

describe('Helper Functions', () => {
  describe('calculateSlippage', () => {
    test('should return 0 for missing prices', () => {
      expect(calculateSlippage(null, 100, 'BUY')).toBe(0);
      expect(calculateSlippage(100, null, 'BUY')).toBe(0);
      expect(calculateSlippage(0, 100, 'BUY')).toBe(0);
    });

    test('should calculate positive slippage for BUY when fill price is higher', () => {
      // Expected 100, filled at 101 = 1% unfavorable slippage
      const slippage = calculateSlippage(100, 101, 'BUY');
      expect(slippage).toBeCloseTo(1, 2);
    });

    test('should calculate negative slippage for BUY when fill price is lower', () => {
      // Expected 100, filled at 99 = -1% favorable slippage
      const slippage = calculateSlippage(100, 99, 'BUY');
      expect(slippage).toBeCloseTo(-1, 2);
    });

    test('should calculate positive slippage for SELL when fill price is lower', () => {
      // Expected 100, filled at 99 = 1% unfavorable slippage for SELL
      const slippage = calculateSlippage(100, 99, 'SELL');
      expect(slippage).toBeCloseTo(1, 2);
    });

    test('should calculate negative slippage for SELL when fill price is higher', () => {
      // Expected 100, filled at 101 = -1% favorable slippage for SELL
      const slippage = calculateSlippage(100, 101, 'SELL');
      expect(slippage).toBeCloseTo(-1, 2);
    });

    test('should return 0 for same prices', () => {
      expect(calculateSlippage(100, 100, 'BUY')).toBe(0);
      expect(calculateSlippage(100, 100, 'SELL')).toBe(0);
    });
  });

  describe('calculateFillPercent', () => {
    test('should return 0 for missing sizes', () => {
      expect(calculateFillPercent(null, 100)).toBe(0);
      expect(calculateFillPercent(50, null)).toBe(0);
      expect(calculateFillPercent(50, 0)).toBe(0);
    });

    test('should calculate correct fill percentage', () => {
      expect(calculateFillPercent(50, 100)).toBe(50);
      expect(calculateFillPercent(100, 100)).toBe(100);
      expect(calculateFillPercent(25, 100)).toBe(25);
    });

    test('should cap at 100%', () => {
      expect(calculateFillPercent(150, 100)).toBe(100);
    });
  });

  describe('generateClientId', () => {
    test('should generate unique IDs', () => {
      const id1 = generateClientId();
      const id2 = generateClientId();
      expect(id1).not.toBe(id2);
    });

    test('should start with "client_"', () => {
      const id = generateClientId();
      expect(id.startsWith('client_')).toBe(true);
    });
  });
});

//─────────────────────────────────────────────────────────────────────────────
// WEBSOCKET STATUS CLASS TESTS
//─────────────────────────────────────────────────────────────────────────────

describe('WebSocketStatus', () => {
  describe('Initialization', () => {
    test('should initialize with default options', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      const status = wsStatus.getStatus();
      expect(status.path).toBe('/ws/status');
      expect(status.connected_clients).toBe(0);
      expect(status.max_clients).toBe(100);
      
      wsStatus.close();
    });

    test('should initialize with custom options', () => {
      const wsStatus = new WebSocketStatus({
        path: '/custom/path',
        maxClients: 50,
        heartbeatIntervalMs: 60000,
        logger: mockLogger,
      });
      
      const status = wsStatus.getStatus();
      expect(status.path).toBe('/custom/path');
      expect(status.max_clients).toBe(50);
      expect(status.heartbeat_interval_ms).toBe(60000);
      
      wsStatus.close();
    });
  });

  describe('Status Tracking', () => {
    test('should track message count on broadcast', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      // Broadcast without clients (should still increment count)
      wsStatus.broadcast({ type: 'TEST', data: 1 });
      wsStatus.broadcast({ type: 'TEST', data: 2 });
      
      const status = wsStatus.getStatus();
      expect(status.messages_broadcast).toBe(2);
      
      wsStatus.close();
    });

    test('should emit status:broadcast event', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      const broadcastHandler = jest.fn();
      wsStatus.on('status:broadcast', broadcastHandler);
      
      wsStatus.broadcast({ type: 'TEST', signal_id: 'test_1' });
      
      expect(broadcastHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ type: 'TEST', signal_id: 'test_1' }),
          clients_sent: 0,
        })
      );
      
      wsStatus.close();
    });
  });

  describe('Order Fill Updates', () => {
    test('should calculate fill_percent correctly', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      const broadcastHandler = jest.fn();
      wsStatus.on('status:broadcast', broadcastHandler);
      
      wsStatus.pushOrderFill({
        signal_id: 'test_fill_1',
        broker_order_id: 'BROKER_123',
        symbol: 'BTCUSDT',
        side: 'BUY',
        fill_price: 50100,
        fill_size: 0.5,
        requested_size: 1.0,
        expected_price: 50000,
      });
      
      expect(broadcastHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            type: 'ORDER_PARTIALLY_FILLED',
            fill_percent: 50,
            fill_price: 50100,
            slippage_pct: expect.any(Number),
          }),
        })
      );
      
      // Check slippage calculation
      const update = broadcastHandler.mock.calls[0][0].update;
      expect(update.slippage_pct).toBeCloseTo(0.2, 1);
      
      wsStatus.close();
    });

    test('should mark as ORDER_FILLED when fill_percent is 100', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      const broadcastHandler = jest.fn();
      wsStatus.on('status:broadcast', broadcastHandler);
      
      wsStatus.pushOrderFill({
        signal_id: 'test_fill_2',
        broker_order_id: 'BROKER_456',
        symbol: 'BTCUSDT',
        side: 'BUY',
        fill_price: 50000,
        fill_size: 1.0,
        requested_size: 1.0,
        expected_price: 50000,
      });
      
      expect(broadcastHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            type: 'ORDER_FILLED',
            fill_percent: 100,
          }),
        })
      );
      
      wsStatus.close();
    });
  });

  describe('Order Rejection Updates', () => {
    test('should push order rejection', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      const broadcastHandler = jest.fn();
      wsStatus.on('status:broadcast', broadcastHandler);
      
      wsStatus.pushOrderRejection({
        signal_id: 'test_reject_1',
        symbol: 'BTCUSDT',
        reason: 'INSUFFICIENT_LIQUIDITY',
        recommendation: 'Use limit order',
      });
      
      expect(broadcastHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            type: 'ORDER_REJECTED',
            reason: 'INSUFFICIENT_LIQUIDITY',
            recommendation: 'Use limit order',
          }),
        })
      );
      
      wsStatus.close();
    });
  });

  describe('Order Cancellation Updates', () => {
    test('should push order cancellation', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      const broadcastHandler = jest.fn();
      wsStatus.on('status:broadcast', broadcastHandler);
      
      wsStatus.pushOrderCancellation({
        signal_id: 'test_cancel_1',
        broker_order_id: 'BROKER_789',
        symbol: 'BTCUSDT',
        reason: 'TIMEOUT',
      });
      
      expect(broadcastHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            type: 'ORDER_CANCELED',
            reason: 'TIMEOUT',
          }),
        })
      );
      
      wsStatus.close();
    });
  });

  describe('Position Updates', () => {
    test('should push position updates', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      const broadcastHandler = jest.fn();
      wsStatus.on('status:broadcast', broadcastHandler);
      
      wsStatus.pushPositionUpdate({
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0.5,
        entry_price: 50000,
        unrealized_pnl: 100,
        action: 'OPENED',
      });
      
      expect(broadcastHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            type: 'POSITION_OPENED',
            symbol: 'BTCUSDT',
            side: 'LONG',
            size: 0.5,
          }),
        })
      );
      
      wsStatus.close();
    });
  });

  describe('Emergency Flatten', () => {
    test('should push emergency flatten notification', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      const broadcastHandler = jest.fn();
      wsStatus.on('status:broadcast', broadcastHandler);
      
      wsStatus.pushEmergencyFlatten({
        closed_count: 3,
        reason: 'DRAWDOWN_VELOCITY',
      });
      
      expect(broadcastHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            type: 'EMERGENCY_FLATTEN',
            closed_count: 3,
            reason: 'DRAWDOWN_VELOCITY',
          }),
        })
      );
      
      wsStatus.close();
    });
  });

  describe('Client Management', () => {
    test('should return false when disconnecting non-existent client', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      const result = wsStatus.disconnectClient('non_existent_client');
      expect(result).toBe(false);
      
      wsStatus.close();
    });

    test('should return empty array when no clients connected', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      const clients = wsStatus.getConnectedClients();
      expect(clients).toEqual([]);
      
      wsStatus.close();
    });
  });

  describe('Cleanup', () => {
    test('should clean up on close()', () => {
      const wsStatus = new WebSocketStatus({
        logger: mockLogger,
      });
      
      wsStatus.close();
      
      const status = wsStatus.getStatus();
      expect(status.connected_clients).toBe(0);
    });
  });
});
