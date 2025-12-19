/**
 * ScavengerHandler Unit Tests
 * 
 * Tests for the Scavenger Handler - handles PREPARE/CONFIRM/ABORT signals from Phase 1
 * Requirements: 1.2, 1.3, 6.1-6.7
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ScavengerHandler } from './ScavengerHandler.js';

//─────────────────────────────────────────────────────────────────────────────
// TEST HELPERS
//─────────────────────────────────────────────────────────────────────────────

/**
 * Create mock dependencies
 */
function createMocks() {
  return {
    brokerGateway: {
      placeOrder: jest.fn(),
      getEquity: jest.fn().mockResolvedValue(1000),
    },
    shadowState: {
      processIntent: jest.fn().mockReturnValue({
        signal_id: 'test_signal_1',
        status: 'PENDING',
      }),
      getIntent: jest.fn().mockReturnValue({
        signal_id: 'test_signal_1',
        status: 'VALIDATED',
      }),
      validateIntent: jest.fn(),
      rejectIntent: jest.fn(),
      openPosition: jest.fn(),
    },
    l2Validator: {
      getMarketConditions: jest.fn().mockReturnValue({
        bestBid: 50000,
        bestAsk: 50001,
        spread: 1,
        depth: 100,
      }),
      validate: jest.fn().mockReturnValue({
        valid: true,
      }),
    },
    orderManager: {},
    safetyGates: {
      processSignal: jest.fn().mockResolvedValue({
        blocked: false,
      }),
    },
    phaseManager: {
      getLastKnownEquity: jest.fn().mockReturnValue(1000),
    },
    configManager: {
      getConfig: jest.fn().mockReturnValue({
        masterArm: true,
      }),
    },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    wsStatus: {
      pushEvent: jest.fn(),
    },
  };
}

/**
 * Create a valid PREPARE signal
 */
function createPrepareSignal(overrides = {}) {
  return {
    signal_id: 'test_signal_1',
    signal_type: 'PREPARE',
    symbol: 'BTCUSDT',
    direction: 'LONG',
    entry_zone: [50000, 49950],
    stop_loss: 49500,
    take_profits: [50500, 51000],
    confidence: 85,
    leverage: 20,
    velocity: 0.002,
    trap_type: 'LIQUIDATION',
    ...overrides,
  };
}

/**
 * Create a valid CONFIRM signal
 */
function createConfirmSignal(overrides = {}) {
  return {
    signal_id: 'test_signal_1',
    signal_type: 'CONFIRM',
    symbol: 'BTCUSDT',
    ...overrides,
  };
}

/**
 * Create a valid ABORT signal
 */
function createAbortSignal(overrides = {}) {
  return {
    signal_id: 'test_signal_1',
    signal_type: 'ABORT',
    symbol: 'BTCUSDT',
    ...overrides,
  };
}

//─────────────────────────────────────────────────────────────────────────────
// TESTS
//─────────────────────────────────────────────────────────────────────────────

describe('ScavengerHandler', () => {
  let handler;
  let mocks;

  beforeEach(() => {
    mocks = createMocks();
    handler = new ScavengerHandler(mocks);
  });

  afterEach(() => {
    if (handler) {
      handler.destroy();
    }
  });

  describe('handle()', () => {
    it('should route PREPARE signals to handlePrepare', async () => {
      const signal = createPrepareSignal();
      const result = await handler.handle(signal);

      expect(result.status).toBe('prepared');
      expect(result.signal_id).toBe('test_signal_1');
    });

    it('should route CONFIRM signals to handleConfirm', async () => {
      // First prepare
      const prepareSignal = createPrepareSignal();
      await handler.handle(prepareSignal);

      // Mock successful order execution
      mocks.brokerGateway.placeOrder.mockResolvedValue({
        success: true,
        fill_price: 50000,
        order_id: 'order_123',
      });

      // Then confirm
      const confirmSignal = createConfirmSignal();
      const result = await handler.handle(confirmSignal);

      expect(result.executed).toBe(true);
      expect(result.signal_id).toBe('test_signal_1');
    });

    it('should route ABORT signals to handleAbort', async () => {
      // First prepare
      const prepareSignal = createPrepareSignal();
      await handler.handle(prepareSignal);

      // Then abort
      const abortSignal = createAbortSignal();
      const result = await handler.handle(abortSignal);

      expect(result.status).toBe('aborted');
    });

    it('should reject unknown signal types', async () => {
      const signal = {
        signal_id: 'test_signal_1',
        signal_type: 'UNKNOWN',
        symbol: 'BTCUSDT',
      };

      const result = await handler.handle(signal);

      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('UNKNOWN_SIGNAL_TYPE');
    });
  });

  describe('handlePrepare()', () => {
    it('should store prepared intent with correct data', async () => {
      const signal = createPrepareSignal();
      const result = await handler.handlePrepare(signal);

      expect(result.status).toBe('prepared');
      expect(result.signal_id).toBe('test_signal_1');
      expect(result.position_size).toBeGreaterThan(0);
      expect(result.order_type).toBeDefined();
      expect(result.has_l2_data).toBe(true);
    });

    it('should call shadowState.processIntent', async () => {
      const signal = createPrepareSignal();
      await handler.handlePrepare(signal);

      expect(mocks.shadowState.processIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test_signal_1',
          symbol: 'BTCUSDT',
          direction: 'LONG',
        })
      );
    });

    it('should check Safety Gates', async () => {
      const signal = createPrepareSignal();
      await handler.handlePrepare(signal);

      expect(mocks.safetyGates.processSignal).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test_signal_1',
          symbol: 'BTCUSDT',
          direction: 'LONG',
        })
      );
    });

    it('should block signal if Safety Gates block it', async () => {
      mocks.safetyGates.processSignal.mockResolvedValue({
        blocked: true,
        blockReason: 'DRAWDOWN_LIMIT_EXCEEDED',
      });

      const signal = createPrepareSignal();
      const result = await handler.handlePrepare(signal);

      expect(result.status).toBe('blocked');
      expect(result.reason).toBe('DRAWDOWN_LIMIT_EXCEEDED');
    });

    it('should pre-fetch L2 data from cache', async () => {
      const signal = createPrepareSignal();
      await handler.handlePrepare(signal);

      expect(mocks.l2Validator.getMarketConditions).toHaveBeenCalledWith('BTCUSDT');
    });

    it('should reject if no L2 data available', async () => {
      mocks.l2Validator.getMarketConditions.mockReturnValue(null);

      const signal = createPrepareSignal();
      const result = await handler.handlePrepare(signal);

      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('NO_L2_DATA');
    });

    it('should calculate position size using Kelly Criterion', async () => {
      // Use higher equity to avoid minimum position size clamp
      mocks.phaseManager.getLastKnownEquity.mockReturnValue(100000);
      
      const signal = createPrepareSignal({
        confidence: 80,
        leverage: 20,
      });

      const result = await handler.handlePrepare(signal);

      // Kelly Fraction = (80 / 100) * 0.25 = 0.2
      // Position Size = (100000 * 0.02 * 0.2) / 20 = 20
      expect(result.position_size).toBeCloseTo(20, 2);
    });

    it('should determine order type based on velocity', async () => {
      // High velocity - MARKET order
      const highVelocitySignal = createPrepareSignal({ velocity: 0.006 });
      const highResult = await handler.handlePrepare(highVelocitySignal);
      expect(highResult.order_type).toBe('MARKET');

      // Medium velocity - LIMIT order
      const mediumVelocitySignal = createPrepareSignal({ velocity: 0.002, signal_id: 'test_signal_2' });
      const mediumResult = await handler.handlePrepare(mediumVelocitySignal);
      expect(mediumResult.order_type).toBe('LIMIT');

      // Low velocity - POST_ONLY order
      const lowVelocitySignal = createPrepareSignal({ velocity: 0.0005, signal_id: 'test_signal_3' });
      const lowResult = await handler.handlePrepare(lowVelocitySignal);
      expect(lowResult.order_type).toBe('POST_ONLY');
    });

    it('should broadcast trap_prepared event to Console', async () => {
      const signal = createPrepareSignal();
      await handler.handlePrepare(signal);

      expect(mocks.wsStatus.pushEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trap_prepared',
          signal_id: 'test_signal_1',
          symbol: 'BTCUSDT',
          trap_type: 'LIQUIDATION',
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mocks.shadowState.processIntent.mockImplementation(() => {
        throw new Error('Shadow State error');
      });

      const signal = createPrepareSignal();
      const result = await handler.handlePrepare(signal);

      expect(result.error).toBeDefined();
      expect(mocks.logger.error).toHaveBeenCalled();
    });
  });

  describe('handleConfirm()', () => {
    beforeEach(async () => {
      // Prepare a signal first
      const prepareSignal = createPrepareSignal();
      await handler.handlePrepare(prepareSignal);

      // Mock successful order execution
      mocks.brokerGateway.placeOrder.mockResolvedValue({
        success: true,
        fill_price: 50000,
        order_id: 'order_123',
      });
    });

    it('should execute order via BrokerGateway', async () => {
      const signal = createConfirmSignal();
      await handler.handleConfirm(signal);

      expect(mocks.brokerGateway.placeOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test_signal_1',
          symbol: 'BTCUSDT',
          side: 'Buy',
          qty: expect.any(Number),
        })
      );
    });

    it('should update Shadow State with position', async () => {
      const signal = createConfirmSignal();
      await handler.handleConfirm(signal);

      expect(mocks.shadowState.openPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test_signal_1',
          symbol: 'BTCUSDT',
          side: 'LONG',
          entry: 50000,
        })
      );
    });

    it('should reject if prepared intent not found', async () => {
      const signal = createConfirmSignal({ signal_id: 'unknown_signal' });
      const result = await handler.handleConfirm(signal);

      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('PREPARE_NOT_FOUND');
    });

    it('should reject stale signals (> 10 seconds)', async () => {
      const signal = createConfirmSignal();

      // Manually set preparedAt to 11 seconds ago
      const prepared = handler.preparedIntents.get('test_signal_1');
      prepared.preparedAt = Date.now() - 11000;

      const result = await handler.handleConfirm(signal);

      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('STALE_SIGNAL');
    });

    it('should block if Master Arm is OFF', async () => {
      mocks.configManager.getConfig.mockReturnValue({
        masterArm: false,
      });

      const signal = createConfirmSignal();
      const result = await handler.handleConfirm(signal);

      expect(result.status).toBe('blocked');
      expect(result.reason).toBe('EXECUTION_DISABLED_BY_OPERATOR');
    });

    it('should reject if intent not found in Shadow State', async () => {
      mocks.shadowState.getIntent.mockReturnValue(null);

      const signal = createConfirmSignal();
      const result = await handler.handleConfirm(signal);

      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('INTENT_NOT_FOUND');
    });

    it('should re-validate with L2 before execution', async () => {
      const signal = createConfirmSignal();
      await handler.handleConfirm(signal);

      expect(mocks.l2Validator.validate).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          side: 'BUY',
        })
      );
    });

    it('should reject if L2 validation fails', async () => {
      mocks.l2Validator.validate.mockReturnValue({
        valid: false,
        reason: 'INSUFFICIENT_LIQUIDITY',
        recommendation: 'Use smaller size',
      });

      const signal = createConfirmSignal();
      const result = await handler.handleConfirm(signal);

      expect(result.status).toBe('rejected');
      expect(result.reason).toBe('INSUFFICIENT_LIQUIDITY');
    });

    it('should broadcast trap_sprung event to Console', async () => {
      const signal = createConfirmSignal();
      await handler.handleConfirm(signal);

      expect(mocks.wsStatus.pushEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trap_sprung',
          signal_id: 'test_signal_1',
          symbol: 'BTCUSDT',
          trap_type: 'LIQUIDATION',
          fill_price: 50000,
        })
      );
    });

    it('should clean up prepared intent after execution', async () => {
      const signal = createConfirmSignal();
      await handler.handleConfirm(signal);

      const stats = handler.getStats();
      expect(stats.prepared_count).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mocks.brokerGateway.placeOrder.mockRejectedValue(new Error('Broker error'));

      const signal = createConfirmSignal();
      const result = await handler.handleConfirm(signal);

      expect(result.error).toBeDefined();
      expect(mocks.logger.error).toHaveBeenCalled();
    });
  });

  describe('handleAbort()', () => {
    beforeEach(async () => {
      // Prepare a signal first
      const prepareSignal = createPrepareSignal();
      await handler.handlePrepare(prepareSignal);
    });

    it('should discard prepared order', async () => {
      const signal = createAbortSignal();
      const result = await handler.handleAbort(signal);

      expect(result.status).toBe('aborted');
      expect(result.signal_id).toBe('test_signal_1');
    });

    it('should remove from prepared intents', async () => {
      const signal = createAbortSignal();
      await handler.handleAbort(signal);

      const stats = handler.getStats();
      expect(stats.prepared_count).toBe(0);
    });

    it('should reject intent in Shadow State', async () => {
      const signal = createAbortSignal();
      await handler.handleAbort(signal);

      expect(mocks.shadowState.rejectIntent).toHaveBeenCalledWith(
        'test_signal_1',
        'Signal aborted by Scavenger'
      );
    });

    it('should broadcast trap_aborted event to Console', async () => {
      const signal = createAbortSignal();
      await handler.handleAbort(signal);

      expect(mocks.wsStatus.pushEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'trap_aborted',
          signal_id: 'test_signal_1',
          symbol: 'BTCUSDT',
          trap_type: 'LIQUIDATION',
        })
      );
    });

    it('should handle abort for non-existent signal gracefully', async () => {
      const signal = createAbortSignal({ signal_id: 'unknown_signal' });
      const result = await handler.handleAbort(signal);

      expect(result.status).toBe('aborted');
    });
  });

  describe('calculatePositionSize()', () => {
    it('should use Kelly Criterion formula', () => {
      const size = handler.calculatePositionSize({
        equity: 100000,
        confidence: 80,
        leverage: 20,
        riskPercent: 0.02,
      });

      // Kelly Fraction = (80 / 100) * 0.25 = 0.2
      // Position Size = (100000 * 0.02 * 0.2) / 20 = 20
      expect(size).toBeCloseTo(20, 2);
    });

    it('should apply 25% safety factor', () => {
      const size = handler.calculatePositionSize({
        equity: 100000,
        confidence: 100,
        leverage: 10,
        riskPercent: 0.02,
      });

      // Kelly Fraction = (100 / 100) * 0.25 = 0.25
      // Position Size = (100000 * 0.02 * 0.25) / 10 = 50
      expect(size).toBeCloseTo(50, 2);
    });

    it('should enforce minimum position size of $10', () => {
      const size = handler.calculatePositionSize({
        equity: 100,
        confidence: 50,
        leverage: 20,
        riskPercent: 0.02,
      });

      // Calculated size would be very small, but should be at least $10
      expect(size).toBeGreaterThanOrEqual(10);
    });

    it('should scale with equity', () => {
      const size1 = handler.calculatePositionSize({
        equity: 100000,
        confidence: 80,
        leverage: 20,
        riskPercent: 0.02,
      });

      const size2 = handler.calculatePositionSize({
        equity: 200000,
        confidence: 80,
        leverage: 20,
        riskPercent: 0.02,
      });

      expect(size2).toBeCloseTo(size1 * 2, 2);
    });
  });

  describe('determineOrderType()', () => {
    const baseParams = {
      signal_id: 'test_signal_1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      size: 0.1,
      entry_zone: [50000, 49950],
      marketConditions: {
        bestBid: 50000,
        bestAsk: 50001,
      },
    };

    it('should use MARKET order for high velocity (> 0.5%/s)', () => {
      const decision = handler.determineOrderType({
        ...baseParams,
        velocity: 0.006,
      });

      expect(decision.order_type).toBe('MARKET');
      expect(decision.reason).toBe('HIGH_VELOCITY');
    });

    it('should use LIMIT order for medium velocity (> 0.1%/s)', () => {
      const decision = handler.determineOrderType({
        ...baseParams,
        velocity: 0.002,
      });

      expect(decision.order_type).toBe('LIMIT');
      expect(decision.limit_price).toBe(50001); // bestAsk for BUY
      expect(decision.reason).toBe('MEDIUM_VELOCITY');
    });

    it('should use POST_ONLY order for low velocity', () => {
      const decision = handler.determineOrderType({
        ...baseParams,
        velocity: 0.0005,
      });

      expect(decision.order_type).toBe('POST_ONLY');
      expect(decision.reason).toBe('LOW_VELOCITY');
    });

    it('should use bestAsk for BUY side (medium velocity)', () => {
      const decision = handler.determineOrderType({
        ...baseParams,
        side: 'BUY',
        velocity: 0.002,
      });

      expect(decision.limit_price).toBe(50001); // bestAsk
    });

    it('should use bestBid for SELL side (medium velocity)', () => {
      const decision = handler.determineOrderType({
        ...baseParams,
        side: 'SELL',
        velocity: 0.002,
      });

      expect(decision.limit_price).toBe(50000); // bestBid
    });
  });

  describe('cleanupStaleIntents()', () => {
    it('should remove intents older than 10 seconds', async () => {
      // Prepare a signal
      const signal = createPrepareSignal();
      await handler.handlePrepare(signal);

      // Manually set preparedAt to 11 seconds ago
      const prepared = handler.preparedIntents.get('test_signal_1');
      prepared.preparedAt = Date.now() - 11000;

      // Trigger cleanup
      handler.cleanupStaleIntents();

      const stats = handler.getStats();
      expect(stats.prepared_count).toBe(0);
    });

    it('should reject stale intents in Shadow State', async () => {
      // Prepare a signal
      const signal = createPrepareSignal();
      await handler.handlePrepare(signal);

      // Manually set preparedAt to 11 seconds ago
      const prepared = handler.preparedIntents.get('test_signal_1');
      prepared.preparedAt = Date.now() - 11000;

      // Trigger cleanup
      handler.cleanupStaleIntents();

      expect(mocks.shadowState.rejectIntent).toHaveBeenCalledWith(
        'test_signal_1',
        'STALE_INTENT_CLEANUP'
      );
    });

    it('should not remove fresh intents', async () => {
      // Prepare a signal
      const signal = createPrepareSignal();
      await handler.handlePrepare(signal);

      // Manually set preparedAt to only 5 seconds ago
      const prepared = handler.preparedIntents.get('test_signal_1');
      prepared.preparedAt = Date.now() - 5000;

      // Trigger cleanup
      handler.cleanupStaleIntents();

      const stats = handler.getStats();
      expect(stats.prepared_count).toBe(1);
    });
  });

  describe('getStats()', () => {
    it('should return prepared count and signal IDs', async () => {
      // Prepare multiple signals
      await handler.handlePrepare(createPrepareSignal({ signal_id: 'signal_1' }));
      await handler.handlePrepare(createPrepareSignal({ signal_id: 'signal_2' }));
      await handler.handlePrepare(createPrepareSignal({ signal_id: 'signal_3' }));

      const stats = handler.getStats();

      expect(stats.prepared_count).toBe(3);
      expect(stats.prepared_signals).toContain('signal_1');
      expect(stats.prepared_signals).toContain('signal_2');
      expect(stats.prepared_signals).toContain('signal_3');
    });

    it('should return zero count when no prepared intents', () => {
      const stats = handler.getStats();

      expect(stats.prepared_count).toBe(0);
      expect(stats.prepared_signals).toEqual([]);
    });
  });

  describe('destroy()', () => {
    it('should clear cleanup interval', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      handler.destroy();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should clear all prepared intents', async () => {
      // Prepare a signal
      await handler.handlePrepare(createPrepareSignal());

      handler.destroy();

      const stats = handler.getStats();
      expect(stats.prepared_count).toBe(0);
    });
  });
});
