/**
 * Reconciliation Unit Tests
 * 
 * Tests for the Broker State Reconciliation Loop.
 * Requirements: 32.1-32.5
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Reconciliation } from './Reconciliation.js';
import { ShadowState } from './ShadowState.js';

describe('Reconciliation', () => {
  let reconciliation;
  let shadowState;
  let mockBrokerGateway;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    shadowState = new ShadowState({ logger: mockLogger });

    mockBrokerGateway = {
      getPositions: jest.fn().mockResolvedValue([]),
      closeAllPositions: jest.fn().mockResolvedValue({ success: true }),
    };

    reconciliation = new Reconciliation({
      shadowState,
      brokerGateway: mockBrokerGateway,
      logger: mockLogger,
      intervalMs: 1000, // 1 second for testing
      getPriceForSymbol: () => 100,
    });
  });

  afterEach(() => {
    if (reconciliation) {
      reconciliation.stop();
    }
    if (shadowState) {
      shadowState.clear();
    }
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw error if shadowState is not provided', () => {
      expect(() => new Reconciliation({
        brokerGateway: mockBrokerGateway,
      })).toThrow('shadowState is required');
    });

    it('should throw error if brokerGateway is not provided', () => {
      expect(() => new Reconciliation({
        shadowState,
      })).toThrow('brokerGateway is required');
    });

    it('should use default interval of 60 seconds', () => {
      const recon = new Reconciliation({
        shadowState,
        brokerGateway: mockBrokerGateway,
      });
      expect(recon.intervalMs).toBe(60000);
    });

    it('should use default max consecutive mismatches of 3', () => {
      const recon = new Reconciliation({
        shadowState,
        brokerGateway: mockBrokerGateway,
      });
      expect(recon.maxConsecutiveMismatches).toBe(3);
    });
  });

  describe('start/stop', () => {
    // Requirement 32.1: Execute every 60 seconds
    it('should start the reconciliation loop', () => {
      reconciliation.start();
      expect(reconciliation.isRunning()).toBe(true);
    });

    it('should stop the reconciliation loop', () => {
      reconciliation.start();
      reconciliation.stop();
      expect(reconciliation.isRunning()).toBe(false);
    });

    it('should not start if already running', () => {
      reconciliation.start();
      reconciliation.start(); // Second call should be ignored
      expect(mockLogger.warn).toHaveBeenCalledWith(
        {},
        'Reconciliation loop already running'
      );
    });

    it('should run reconciliation immediately on start', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([]);
      reconciliation.start();
      
      // Wait for async reconciliation to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockBrokerGateway.getPositions).toHaveBeenCalled();
    });
  });

  describe('reconcile', () => {
    // Requirement 32.2: Call GET /account/positions from broker API
    it('should call broker getPositions', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([]);
      
      await reconciliation.reconcile();
      
      expect(mockBrokerGateway.getPositions).toHaveBeenCalled();
    });

    // Requirement 32.3: Trigger ALARM when broker position differs from Shadow State
    it('should detect when broker has position but Shadow State does not', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      const result = await reconciliation.reconcile();

      expect(result.in_sync).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].mismatch_type).toBe('MISSING_IN_SHADOW');
      expect(result.mismatches[0].symbol).toBe('BTCUSDT');
    });

    it('should detect when Shadow State has position but broker does not', async () => {
      // Create position in Shadow State
      shadowState.processIntent({
        signal_id: 'test_1',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_1', {
        broker_order_id: 'broker_1',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      mockBrokerGateway.getPositions.mockResolvedValue([]);

      const result = await reconciliation.reconcile();

      expect(result.in_sync).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].mismatch_type).toBe('MISSING_IN_BROKER');
    });

    it('should detect size mismatch', async () => {
      // Create position in Shadow State
      shadowState.processIntent({
        signal_id: 'test_1',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_1', {
        broker_order_id: 'broker_1',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 1.0, entry_price: 50000 },
      ]);

      const result = await reconciliation.reconcile();

      expect(result.in_sync).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].mismatch_type).toBe('SIZE_MISMATCH');
    });

    it('should detect side mismatch', async () => {
      // Create LONG position in Shadow State
      shadowState.processIntent({
        signal_id: 'test_1',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_1', {
        broker_order_id: 'broker_1',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      // Broker has SHORT position
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'SHORT', size: 0.5, entry_price: 50000 },
      ]);

      const result = await reconciliation.reconcile();

      expect(result.in_sync).toBe(false);
      expect(result.mismatches).toHaveLength(1);
      expect(result.mismatches[0].mismatch_type).toBe('SIDE_MISMATCH');
    });

    it('should return in_sync=true when states match', async () => {
      // Create position in Shadow State
      shadowState.processIntent({
        signal_id: 'test_1',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_1', {
        broker_order_id: 'broker_1',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      // Broker has matching position
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      const result = await reconciliation.reconcile();

      expect(result.in_sync).toBe(true);
      expect(result.mismatches).toHaveLength(0);
    });

    it('should return in_sync=true when both states are empty', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([]);

      const result = await reconciliation.reconcile();

      expect(result.in_sync).toBe(true);
      expect(result.shadow_position_count).toBe(0);
      expect(result.broker_position_count).toBe(0);
    });
  });

  describe('mismatch logging', () => {
    // Requirement 32.4: Log shadow_state, broker_state, mismatch_type, timestamp
    it('should log mismatch details', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      await reconciliation.reconcile();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          mismatch_type: 'MISSING_IN_SHADOW',
          shadow_state: null,
          broker_state: expect.objectContaining({
            symbol: 'BTCUSDT',
            side: 'LONG',
            size: 0.5,
          }),
        }),
        'Mismatch detail'
      );
    });
  });

  describe('consecutive mismatch tracking', () => {
    it('should increment consecutive mismatch count on mismatch', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      await reconciliation.reconcile();
      expect(reconciliation.getConsecutiveMismatchCount()).toBe(1);

      await reconciliation.reconcile();
      expect(reconciliation.getConsecutiveMismatchCount()).toBe(2);
    });

    it('should reset consecutive mismatch count on sync', async () => {
      // First, create a mismatch
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);
      await reconciliation.reconcile();
      expect(reconciliation.getConsecutiveMismatchCount()).toBe(1);

      // Then sync
      mockBrokerGateway.getPositions.mockResolvedValue([]);
      await reconciliation.reconcile();
      expect(reconciliation.getConsecutiveMismatchCount()).toBe(0);
    });
  });

  describe('emergency flatten', () => {
    // Requirement 32.5: Auto-flatten after 3 consecutive mismatches
    it('should trigger emergency flatten after 3 consecutive mismatches', async () => {
      const flattenHandler = jest.fn();
      reconciliation.on('emergency_flatten', flattenHandler);

      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      // Run 3 reconciliation cycles
      await reconciliation.reconcile();
      await reconciliation.reconcile();
      await reconciliation.reconcile();

      expect(flattenHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'CONSECUTIVE_MISMATCHES',
          consecutive_count: 3,
        })
      );
    });

    it('should disable auto-execution after emergency flatten', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      // Run 3 reconciliation cycles
      await reconciliation.reconcile();
      await reconciliation.reconcile();
      await reconciliation.reconcile();

      expect(reconciliation.isAutoExecutionDisabled()).toBe(true);
    });

    it('should call broker closeAllPositions on emergency flatten', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      // Run 3 reconciliation cycles
      await reconciliation.reconcile();
      await reconciliation.reconcile();
      await reconciliation.reconcile();

      expect(mockBrokerGateway.closeAllPositions).toHaveBeenCalled();
    });

    it('should close Shadow State positions on emergency flatten', async () => {
      // Create position in Shadow State
      shadowState.processIntent({
        signal_id: 'test_1',
        type: 'PREPARE',
        symbol: 'ETHUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_1', {
        broker_order_id: 'broker_1',
        fill_price: 3000,
        fill_size: 1.0,
        filled: true,
      });

      expect(shadowState.hasPosition('ETHUSDT')).toBe(true);

      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      // Run 3 reconciliation cycles
      await reconciliation.reconcile();
      await reconciliation.reconcile();
      await reconciliation.reconcile();

      expect(shadowState.hasPosition('ETHUSDT')).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset consecutive mismatch count', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      await reconciliation.reconcile();
      await reconciliation.reconcile();
      expect(reconciliation.getConsecutiveMismatchCount()).toBe(2);

      reconciliation.reset();
      expect(reconciliation.getConsecutiveMismatchCount()).toBe(0);
    });

    it('should re-enable auto-execution', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      // Trigger emergency flatten
      await reconciliation.reconcile();
      await reconciliation.reconcile();
      await reconciliation.reconcile();
      expect(reconciliation.isAutoExecutionDisabled()).toBe(true);

      reconciliation.reset();
      expect(reconciliation.isAutoExecutionDisabled()).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit sync_ok event when states match', async () => {
      const syncHandler = jest.fn();
      reconciliation.on('sync_ok', syncHandler);

      mockBrokerGateway.getPositions.mockResolvedValue([]);

      await reconciliation.reconcile();

      expect(syncHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          in_sync: true,
        })
      );
    });

    it('should emit mismatch event when states differ', async () => {
      const mismatchHandler = jest.fn();
      reconciliation.on('mismatch', mismatchHandler);

      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);

      await reconciliation.reconcile();

      expect(mismatchHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          in_sync: false,
          mismatches: expect.arrayContaining([
            expect.objectContaining({
              mismatch_type: 'MISSING_IN_SHADOW',
            }),
          ]),
        })
      );
    });
  });

  describe('getLastResult', () => {
    it('should return null before first reconciliation', () => {
      expect(reconciliation.getLastResult()).toBeNull();
    });

    it('should return last reconciliation result', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([]);

      await reconciliation.reconcile();

      const result = reconciliation.getLastResult();
      expect(result).not.toBeNull();
      expect(result.in_sync).toBe(true);
    });
  });

  describe('forceReconcile', () => {
    it('should run reconciliation immediately', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([]);

      const result = await reconciliation.forceReconcile();

      expect(result.in_sync).toBe(true);
      expect(mockBrokerGateway.getPositions).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw error when broker API fails', async () => {
      mockBrokerGateway.getPositions.mockRejectedValue(new Error('API Error'));

      await expect(reconciliation.reconcile()).rejects.toThrow('API Error');
    });

    it('should log error when broker closeAllPositions fails during flatten', async () => {
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5, entry_price: 50000 },
      ]);
      mockBrokerGateway.closeAllPositions.mockRejectedValue(new Error('Close failed'));

      // Run 3 reconciliation cycles
      await reconciliation.reconcile();
      await reconciliation.reconcile();
      await reconciliation.reconcile();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Close failed' }),
        'Failed to close broker positions'
      );
    });
  });

  describe('float comparison', () => {
    it('should consider very small differences as equal', async () => {
      // Create position in Shadow State
      shadowState.processIntent({
        signal_id: 'test_1',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_1', {
        broker_order_id: 'broker_1',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      // Broker has position with tiny floating point difference
      mockBrokerGateway.getPositions.mockResolvedValue([
        { symbol: 'BTCUSDT', side: 'LONG', size: 0.5 + 1e-12, entry_price: 50000 },
      ]);

      const result = await reconciliation.reconcile();

      expect(result.in_sync).toBe(true);
    });
  });
});
