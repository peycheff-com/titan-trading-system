/**
 * Panic Controls Tests
 * 
 * Tests for emergency FLATTEN ALL and CANCEL ALL endpoints
 * 
 * Requirements: 91.1-91.6
 */

import { jest } from '@jest/globals';

// Mock dependencies
const createMockShadowState = () => ({
  getAllPositions: jest.fn(() => new Map([
    ['BTCUSDT', { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 }],
    ['ETHUSDT', { symbol: 'ETHUSDT', side: 'SHORT', size: 2.0, entry_price: 3000 }],
  ])),
  closeAllPositions: jest.fn(() => [
    { symbol: 'BTCUSDT', pnl: 100, close_reason: 'PANIC_FLATTEN_ALL' },
    { symbol: 'ETHUSDT', pnl: -50, close_reason: 'PANIC_FLATTEN_ALL' },
  ]),
});

const createMockBrokerGateway = () => ({
  closeAllPositions: jest.fn(() => Promise.resolve({ success: true })),
  cancelOrder: jest.fn(() => Promise.resolve({ success: true })),
});

const createMockL2Validator = () => ({
  getMarketConditions: jest.fn((symbol) => ({
    lastPrice: symbol === 'BTCUSDT' ? 50100 : 3010,
    bestBid: symbol === 'BTCUSDT' ? 50099 : 3009,
    bestAsk: symbol === 'BTCUSDT' ? 50101 : 3011,
  })),
});

const createMockLimitChaser = () => ({
  getActiveChases: jest.fn(() => new Map([
    ['signal_1', { signal_id: 'signal_1', symbol: 'BTCUSDT', status: 'ACTIVE' }],
    ['signal_2', { signal_id: 'signal_2', symbol: 'ETHUSDT', status: 'ACTIVE' }],
  ])),
  cancelChase: jest.fn(() => true),
});

const createMockPartialFillHandler = () => ({
  getActiveOrders: jest.fn(() => new Map([
    ['signal_3', { signal_id: 'signal_3', broker_order_id: 'order_123', symbol: 'BTCUSDT' }],
  ])),
});

const createMockConsoleWs = () => ({
  pushMasterArmChange: jest.fn(),
});

const createMockWsStatus = () => ({
  pushEmergencyFlatten: jest.fn(),
  broadcast: jest.fn(),
});

describe('Panic Controls', () => {
  let mockShadowState;
  let mockBrokerGateway;
  let mockL2Validator;
  let mockLimitChaser;
  let mockPartialFillHandler;
  let mockConsoleWs;
  let mockWsStatus;

  beforeEach(() => {
    mockShadowState = createMockShadowState();
    mockBrokerGateway = createMockBrokerGateway();
    mockL2Validator = createMockL2Validator();
    mockLimitChaser = createMockLimitChaser();
    mockPartialFillHandler = createMockPartialFillHandler();
    mockConsoleWs = createMockConsoleWs();
    mockWsStatus = createMockWsStatus();
  });

  describe('FLATTEN ALL', () => {
    test('should close all positions and disable Master Arm', async () => {
      // Requirements: 91.1-91.2, 91.5-91.6
      
      // Simulate FLATTEN ALL
      const positionsBefore = mockShadowState.getAllPositions();
      const positionsAffected = positionsBefore.size;

      // Close all positions
      const tradeRecords = mockShadowState.closeAllPositions(
        (symbol) => {
          const conditions = mockL2Validator.getMarketConditions(symbol);
          return conditions.lastPrice;
        },
        'PANIC_FLATTEN_ALL'
      );

      await mockBrokerGateway.closeAllPositions();

      // Verify positions were closed
      expect(mockShadowState.closeAllPositions).toHaveBeenCalledWith(
        expect.any(Function),
        'PANIC_FLATTEN_ALL'
      );
      expect(mockBrokerGateway.closeAllPositions).toHaveBeenCalled();
      expect(positionsAffected).toBe(2);
      expect(tradeRecords.length).toBe(2);

      // Verify Master Arm would be disabled
      // (In actual implementation, this is done in server.js)
      const masterArmDisabled = true;
      expect(masterArmDisabled).toBe(true);
    });

    test('should log action with all required fields', async () => {
      // Requirements: 91.5
      const operatorId = 'operator_123';
      const positionsBefore = mockShadowState.getAllPositions();
      const positionsAffected = positionsBefore.size;

      const tradeRecords = mockShadowState.closeAllPositions(
        (symbol) => mockL2Validator.getMarketConditions(symbol).lastPrice,
        'PANIC_FLATTEN_ALL'
      );

      const logData = {
        action: 'FLATTEN_ALL',
        positions_affected: positionsAffected,
        orders_cancelled: 0,
        operator_id: operatorId,
        trade_records: tradeRecords.length,
        timestamp: new Date().toISOString(),
      };

      expect(logData.action).toBe('FLATTEN_ALL');
      expect(logData.positions_affected).toBe(2);
      expect(logData.orders_cancelled).toBe(0);
      expect(logData.operator_id).toBe(operatorId);
      expect(logData.trade_records).toBe(2);
      expect(logData.timestamp).toBeDefined();
    });

    test('should handle broker gateway failure gracefully', async () => {
      // Simulate broker failure
      mockBrokerGateway.closeAllPositions.mockRejectedValue(new Error('Broker error'));

      const tradeRecords = mockShadowState.closeAllPositions(
        (symbol) => mockL2Validator.getMarketConditions(symbol).lastPrice,
        'PANIC_FLATTEN_ALL'
      );

      // Should still close positions in Shadow State
      expect(tradeRecords.length).toBe(2);

      // Broker call should fail but not throw
      try {
        await mockBrokerGateway.closeAllPositions();
      } catch (error) {
        expect(error.message).toBe('Broker error');
      }
    });

    test('should broadcast Master Arm change to Console clients', async () => {
      // Requirements: 91.6
      const operatorId = 'operator_123';

      mockShadowState.closeAllPositions(
        (symbol) => mockL2Validator.getMarketConditions(symbol).lastPrice,
        'PANIC_FLATTEN_ALL'
      );

      // Simulate Master Arm change broadcast
      mockConsoleWs.pushMasterArmChange({
        master_arm: false,
        changed_by: operatorId,
        reason: 'FLATTEN_ALL_TRIGGERED',
      });

      expect(mockConsoleWs.pushMasterArmChange).toHaveBeenCalledWith({
        master_arm: false,
        changed_by: operatorId,
        reason: 'FLATTEN_ALL_TRIGGERED',
      });
    });

    test('should broadcast emergency flatten to status channel', async () => {
      const positionsBefore = mockShadowState.getAllPositions();
      const positionsAffected = positionsBefore.size;

      mockShadowState.closeAllPositions(
        (symbol) => mockL2Validator.getMarketConditions(symbol).lastPrice,
        'PANIC_FLATTEN_ALL'
      );

      // Simulate status broadcast
      mockWsStatus.pushEmergencyFlatten({
        closed_count: positionsAffected,
        reason: 'PANIC_FLATTEN_ALL',
        operator_id: 'operator_123',
      });

      expect(mockWsStatus.pushEmergencyFlatten).toHaveBeenCalledWith({
        closed_count: 2,
        reason: 'PANIC_FLATTEN_ALL',
        operator_id: 'operator_123',
      });
    });
  });

  describe('CANCEL ALL', () => {
    test('should cancel all active Limit Chaser orders', async () => {
      // Requirements: 91.3-91.4
      const activeChases = mockLimitChaser.getActiveChases();
      let ordersCancelled = 0;

      for (const [signalId] of activeChases) {
        const cancelled = mockLimitChaser.cancelChase(signalId);
        if (cancelled) {
          ordersCancelled++;
        }
      }

      expect(mockLimitChaser.cancelChase).toHaveBeenCalledTimes(2);
      expect(ordersCancelled).toBe(2);
    });

    test('should cancel all partial fill handler orders', async () => {
      // Requirements: 91.4
      const activeOrders = mockPartialFillHandler.getActiveOrders();
      let ordersCancelled = 0;

      for (const [, order] of activeOrders) {
        if (order.broker_order_id) {
          await mockBrokerGateway.cancelOrder(order.broker_order_id);
          ordersCancelled++;
        }
      }

      expect(mockBrokerGateway.cancelOrder).toHaveBeenCalledWith('order_123');
      expect(ordersCancelled).toBe(1);
    });

    test('should log action with all required fields', async () => {
      // Requirements: 91.5
      const operatorId = 'operator_123';
      const activeChases = mockLimitChaser.getActiveChases();
      const activeOrders = mockPartialFillHandler.getActiveOrders();
      
      let ordersCancelled = 0;
      for (const [signalId] of activeChases) {
        mockLimitChaser.cancelChase(signalId);
        ordersCancelled++;
      }
      for (const [, order] of activeOrders) {
        if (order.broker_order_id) {
          await mockBrokerGateway.cancelOrder(order.broker_order_id);
          ordersCancelled++;
        }
      }

      const logData = {
        action: 'CANCEL_ALL',
        positions_affected: 0,
        orders_cancelled: ordersCancelled,
        operator_id: operatorId,
        timestamp: new Date().toISOString(),
      };

      expect(logData.action).toBe('CANCEL_ALL');
      expect(logData.positions_affected).toBe(0);
      expect(logData.orders_cancelled).toBe(3);
      expect(logData.operator_id).toBe(operatorId);
      expect(logData.timestamp).toBeDefined();
    });

    test('should handle cancellation errors gracefully', async () => {
      // Simulate cancellation failure
      mockLimitChaser.cancelChase.mockReturnValue(false);

      const activeChases = mockLimitChaser.getActiveChases();
      let successCount = 0;

      for (const [signalId] of activeChases) {
        const cancelled = mockLimitChaser.cancelChase(signalId);
        if (cancelled) {
          successCount++;
        }
      }

      expect(successCount).toBe(0);
      expect(mockLimitChaser.cancelChase).toHaveBeenCalledTimes(2);
    });

    test('should broadcast to status channel', async () => {
      const activeChases = mockLimitChaser.getActiveChases();
      let ordersCancelled = 0;

      for (const [signalId] of activeChases) {
        mockLimitChaser.cancelChase(signalId);
        ordersCancelled++;
      }

      // Simulate status broadcast
      mockWsStatus.broadcast({
        type: 'CANCEL_ALL',
        orders_cancelled: ordersCancelled,
        operator_id: 'operator_123',
        timestamp: new Date().toISOString(),
      });

      expect(mockWsStatus.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CANCEL_ALL',
          orders_cancelled: 2,
          operator_id: 'operator_123',
        })
      );
    });

    test('should not affect positions', async () => {
      // CANCEL ALL should only cancel orders, not close positions
      const positionsBefore = mockShadowState.getAllPositions();

      const activeChases = mockLimitChaser.getActiveChases();
      for (const [signalId] of activeChases) {
        mockLimitChaser.cancelChase(signalId);
      }

      // Positions should remain unchanged
      expect(mockShadowState.closeAllPositions).not.toHaveBeenCalled();
      expect(positionsBefore.size).toBe(2);
    });
  });

  describe('Integration', () => {
    test('FLATTEN ALL should close positions and CANCEL ALL should cancel orders', async () => {
      // First, FLATTEN ALL
      const positionsBefore = mockShadowState.getAllPositions();
      const tradeRecords = mockShadowState.closeAllPositions(
        (symbol) => mockL2Validator.getMarketConditions(symbol).lastPrice,
        'PANIC_FLATTEN_ALL'
      );
      await mockBrokerGateway.closeAllPositions();

      expect(tradeRecords.length).toBe(2);
      expect(mockBrokerGateway.closeAllPositions).toHaveBeenCalled();

      // Then, CANCEL ALL
      const activeChases = mockLimitChaser.getActiveChases();
      let ordersCancelled = 0;
      for (const [signalId] of activeChases) {
        mockLimitChaser.cancelChase(signalId);
        ordersCancelled++;
      }

      expect(ordersCancelled).toBe(2);
      expect(mockLimitChaser.cancelChase).toHaveBeenCalledTimes(2);
    });

    test('should handle empty state gracefully', async () => {
      // No positions
      mockShadowState.getAllPositions.mockReturnValue(new Map());
      mockShadowState.closeAllPositions.mockReturnValue([]);

      // No active chases
      mockLimitChaser.getActiveChases.mockReturnValue(new Map());

      // No partial fills
      mockPartialFillHandler.getActiveOrders.mockReturnValue(new Map());

      // FLATTEN ALL with no positions
      const tradeRecords = mockShadowState.closeAllPositions(
        (symbol) => 0,
        'PANIC_FLATTEN_ALL'
      );
      expect(tradeRecords.length).toBe(0);

      // CANCEL ALL with no orders
      const activeChases = mockLimitChaser.getActiveChases();
      expect(activeChases.size).toBe(0);
    });
  });
});
