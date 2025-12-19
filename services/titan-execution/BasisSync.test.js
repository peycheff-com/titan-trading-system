/**
 * BasisSync Tests
 * 
 * Tests for Basis Tolerance & Feed Synchronization
 * 
 * Requirements: 82.1-82.7
 */

import { jest } from '@jest/globals';
import { BasisSync } from './BasisSync.js';

describe('BasisSync', () => {
  let basisSync;
  let mockGetBrokerPrice;
  let mockLogger;

  beforeEach(() => {
    // Mock broker price function
    mockGetBrokerPrice = jest.fn((symbol) => {
      if (symbol === 'BTCUSDT') return 50000;
      if (symbol === 'ETHUSDT') return 3000;
      return 100;
    });

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    basisSync = new BasisSync({
      getBrokerPrice: mockGetBrokerPrice,
      logger: mockLogger,
      maxBasisTolerancePct: 0.005, // 0.5%
      maxBasisWaitTimeMs: 5000,
    });
  });

  afterEach(() => {
    if (basisSync) {
      basisSync.shutdown();
    }
  });

  describe('calculateBasis', () => {
    test('should calculate basis spread correctly', () => {
      // Requirements: 82.1 - Calculate basis_spread = TV_price - Broker_price
      const tv_price = 50100;
      const trigger_price = 50100;
      const symbol = 'BTCUSDT';

      const result = basisSync.calculateBasis(symbol, tv_price, trigger_price);

      expect(result.tv_price).toBe(50100);
      expect(result.broker_price).toBe(50000);
      expect(result.basis_spread).toBe(100); // 50100 - 50000
      expect(result.basis_spread_pct).toBeCloseTo(0.002, 4); // 100/50000 = 0.2%
    });

    test('should adjust trigger price by basis spread', () => {
      // Requirements: 82.2 - Adjust trigger_price by basis_spread offset
      const tv_price = 50100;
      const trigger_price = 50050;
      const symbol = 'BTCUSDT';

      const result = basisSync.calculateBasis(symbol, tv_price, trigger_price);

      // basis_spread = 50100 - 50000 = 100
      // adjusted_trigger_price = 50050 + 100 = 50150
      expect(result.adjusted_trigger_price).toBe(50150);
    });

    test('should flag when basis exceeds tolerance', () => {
      // Requirements: 82.3 - Log warning when basis > max_basis_tolerance (0.5%)
      const tv_price = 50300; // 0.6% above broker price
      const trigger_price = 50300;
      const symbol = 'BTCUSDT';

      const result = basisSync.calculateBasis(symbol, tv_price, trigger_price);

      expect(result.exceeds_tolerance).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          basis_spread: 300,
        }),
        'HIGH_BASIS_SPREAD - Basis exceeds tolerance'
      );
    });

    test('should not flag when basis within tolerance', () => {
      const tv_price = 50100; // 0.2% above broker price
      const trigger_price = 50100;
      const symbol = 'BTCUSDT';

      const result = basisSync.calculateBasis(symbol, tv_price, trigger_price);

      expect(result.exceeds_tolerance).toBe(false);
    });

    test('should handle negative basis spread', () => {
      const tv_price = 49900; // Below broker price
      const trigger_price = 49900;
      const symbol = 'BTCUSDT';

      const result = basisSync.calculateBasis(symbol, tv_price, trigger_price);

      expect(result.basis_spread).toBe(-100);
      expect(result.basis_spread_pct).toBeCloseTo(0.002, 4);
      expect(result.adjusted_trigger_price).toBe(49800); // 49900 + (-100)
    });

    test('should throw error if getBrokerPrice not provided', () => {
      const basisSyncNoPrice = new BasisSync({ logger: mockLogger });

      expect(() => {
        basisSyncNoPrice.calculateBasis('BTCUSDT', 50100, 50100);
      }).toThrow('getBrokerPrice function not provided');

      basisSyncNoPrice.shutdown();
    });

    test('should throw error if broker price is invalid', () => {
      mockGetBrokerPrice.mockReturnValue(0);

      expect(() => {
        basisSync.calculateBasis('BTCUSDT', 50100, 50100);
      }).toThrow('Invalid broker price');
    });
  });

  describe('prepareBasisIntent', () => {
    test('should prepare basis intent with timeout', () => {
      // Requirements: 82.4 - Implement max_basis_wait_time (5s) timeout check
      const payload = {
        signal_id: 'test_signal_1',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
        close: 50100,
      };

      const intent = basisSync.prepareBasisIntent(payload);

      expect(intent.signal_id).toBe('test_signal_1');
      expect(intent.symbol).toBe('BTCUSDT');
      expect(intent.tv_price).toBe(50100);
      expect(intent.trigger_price).toBe(50100);
      expect(intent.basis_spread).toBe(100);
      expect(intent.adjusted_trigger_price).toBe(50200);
      expect(intent.timeout_timer).toBeDefined();
      expect(intent.force_filled).toBe(false);
      expect(intent.confirm_received).toBe(false);
    });

    test('should store intent in activeIntents', () => {
      const payload = {
        signal_id: 'test_signal_2',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
      };

      basisSync.prepareBasisIntent(payload);

      expect(basisSync.activeIntents.has('test_signal_2')).toBe(true);
    });

    test('should use trigger_price as tv_price if close not provided', () => {
      const payload = {
        signal_id: 'test_signal_3',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
      };

      const intent = basisSync.prepareBasisIntent(payload);

      expect(intent.tv_price).toBe(50100);
    });
  });

  describe('handleConfirm', () => {
    test('should mark CONFIRM as received', () => {
      const payload = {
        signal_id: 'test_signal_4',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
      };

      basisSync.prepareBasisIntent(payload);
      const result = basisSync.handleConfirm('test_signal_4');

      expect(result.should_force_fill).toBe(false);
      expect(result.intent.confirm_received).toBe(true);
    });

    test('should clear timeout and remove intent', () => {
      const payload = {
        signal_id: 'test_signal_5',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
      };

      basisSync.prepareBasisIntent(payload);
      basisSync.handleConfirm('test_signal_5');

      expect(basisSync.activeIntents.has('test_signal_5')).toBe(false);
    });

    test('should return false if no active intent', () => {
      const result = basisSync.handleConfirm('nonexistent_signal');

      expect(result.should_force_fill).toBe(false);
    });

    test('should not force fill if already force filled', () => {
      const payload = {
        signal_id: 'test_signal_6',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
      };

      const intent = basisSync.prepareBasisIntent(payload);
      intent.force_filled = true;

      const result = basisSync.handleConfirm('test_signal_6');

      expect(result.should_force_fill).toBe(false);
    });
  });

  describe('Force Fill on Timeout', () => {
    test('should trigger force fill when timeout AND CONFIRM received', (done) => {
      // Requirements: 82.5 - When timeout AND CONFIRM arrives: execute Force Fill
      jest.useFakeTimers();

      const payload = {
        signal_id: 'test_signal_7',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
      };

      basisSync.prepareBasisIntent(payload);

      // Mark CONFIRM as received before timeout
      const intent = basisSync.activeIntents.get('test_signal_7');
      intent.confirm_received = true;

      // Listen for force fill event
      basisSync.on('basis:force_fill', (data) => {
        // Requirements: 82.6 - Log "FORCE_FILL_BASIS_SYNC"
        expect(data.signal_id).toBe('test_signal_7');
        expect(data.symbol).toBe('BTCUSDT');
        expect(data.basis_spread).toBe(100);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            signal_id: 'test_signal_7',
            reason: 'CLIENT_TRIGGER_TIMEOUT_WITH_CONFIRM',
          }),
          'FORCE_FILL_BASIS_SYNC - Executing to sync with strategy'
        );
        done();
      });

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(5000);

      jest.useRealTimers();
    });

    test('should not force fill if CONFIRM not received', (done) => {
      jest.useFakeTimers();

      const payload = {
        signal_id: 'test_signal_8',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
      };

      basisSync.prepareBasisIntent(payload);

      // Don't mark CONFIRM as received

      // Fast-forward time to trigger timeout
      jest.advanceTimersByTime(5000);

      // Should log timeout but not force fill
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test_signal_8',
        }),
        'Basis timeout - waiting for CONFIRM'
      );

      // Intent should still be active
      expect(basisSync.activeIntents.has('test_signal_8')).toBe(true);

      jest.useRealTimers();
      done();
    });
  });

  describe('handleAbort', () => {
    test('should clear timeout and remove intent', () => {
      const payload = {
        signal_id: 'test_signal_9',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
      };

      basisSync.prepareBasisIntent(payload);
      basisSync.handleAbort('test_signal_9');

      expect(basisSync.activeIntents.has('test_signal_9')).toBe(false);
    });
  });

  describe('Critical Basis Monitoring', () => {
    test('should alert when basis > 1% for 5 minutes', (done) => {
      // Requirements: 82.7 - Alert when basis > 1% for 5 minutes
      jest.useFakeTimers();

      // Mock broker price to create 1.5% basis
      mockGetBrokerPrice.mockReturnValue(50000);
      const tv_price = 50750; // 1.5% above broker

      // Listen for critical alert
      basisSync.on('basis:critical', (data) => {
        expect(data.symbol).toBe('BTCUSDT');
        expect(data.avg_basis_spread_pct).toBeGreaterThan(0.01);
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            symbol: 'BTCUSDT',
          }),
          'FEED_DESYNC_CRITICAL - Basis consistently > 1% for 5 minutes'
        );
        jest.useRealTimers();
        done();
      });

      // Record high basis multiple times over 5 minutes
      for (let i = 0; i < 30; i++) {
        basisSync.calculateBasis('BTCUSDT', tv_price, tv_price);
        jest.advanceTimersByTime(10000); // Advance 10 seconds
      }

      // Trigger the critical check manually
      jest.advanceTimersByTime(10000);
    }, 10000);

    test('should emit normalized event when basis returns to normal', (done) => {
      jest.useFakeTimers();

      // First create critical condition
      mockGetBrokerPrice.mockReturnValue(50000);
      const high_tv_price = 50750; // 1.5% above

      // Record high basis
      for (let i = 0; i < 30; i++) {
        basisSync.calculateBasis('BTCUSDT', high_tv_price, high_tv_price);
        jest.advanceTimersByTime(10000);
      }

      // Mark as critical
      basisSync.criticalAlertsSent.set('BTCUSDT', true);

      // Now normalize basis
      const normal_tv_price = 50100; // 0.2% above

      basisSync.on('basis:normalized', (data) => {
        expect(data.symbol).toBe('BTCUSDT');
        jest.useRealTimers();
        done();
      });

      // Record normal basis
      for (let i = 0; i < 30; i++) {
        basisSync.calculateBasis('BTCUSDT', normal_tv_price, normal_tv_price);
        jest.advanceTimersByTime(10000);
      }

      // Trigger the critical check manually
      jest.advanceTimersByTime(10000);
    }, 10000);
  });

  describe('Helper Methods', () => {
    test('getAdjustedTriggerPrice should return adjusted price', () => {
      const adjusted = basisSync.getAdjustedTriggerPrice('BTCUSDT', 50100, 50050);

      expect(adjusted).toBe(50150); // 50050 + (50100 - 50000)
    });

    test('getCurrentBasis should return current basis spread', () => {
      const basis = basisSync.getCurrentBasis('BTCUSDT', 50100);

      expect(basis.basis_spread).toBe(100);
      expect(basis.basis_spread_pct).toBeCloseTo(0.002, 4);
    });

    test('getStatus should return status information', () => {
      const payload = {
        signal_id: 'test_signal_10',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
      };

      basisSync.prepareBasisIntent(payload);

      const status = basisSync.getStatus();

      expect(status.active_intents).toBe(1);
      expect(status.max_basis_tolerance_pct).toBe(0.005);
      expect(status.max_basis_wait_time_ms).toBe(5000);
    });

    test('getBasisHistory should return history for symbol', () => {
      basisSync.calculateBasis('BTCUSDT', 50100, 50100);

      const history = basisSync.getBasisHistory('BTCUSDT');

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].symbol).toBe('BTCUSDT');
    });

    test('clearBasisHistory should clear history for symbol', () => {
      basisSync.calculateBasis('BTCUSDT', 50100, 50100);
      basisSync.clearBasisHistory('BTCUSDT');

      const history = basisSync.getBasisHistory('BTCUSDT');

      expect(history.length).toBe(0);
    });
  });

  describe('Events', () => {
    test('should emit basis:high event when exceeds tolerance', (done) => {
      basisSync.on('basis:high', (data) => {
        expect(data.symbol).toBe('BTCUSDT');
        expect(data.basis_spread).toBe(300);
        done();
      });

      basisSync.calculateBasis('BTCUSDT', 50300, 50300);
    });
  });

  describe('Shutdown', () => {
    test('should clear all timers and intents on shutdown', () => {
      const payload = {
        signal_id: 'test_signal_11',
        symbol: 'BTCUSDT',
        trigger_price: 50100,
      };

      basisSync.prepareBasisIntent(payload);
      basisSync.shutdown();

      expect(basisSync.activeIntents.size).toBe(0);
    });
  });
});
