/**
 * Signal Router Integration Tests
 * 
 * Tests end-to-end signal routing from SignalRouter to ScavengerHandler
 * Verifies phase filtering and handler registration
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SignalRouter } from '../SignalRouter.js';
import { ScavengerHandler } from '../handlers/ScavengerHandler.js';

describe('Signal Router Integration', () => {
  let signalRouter;
  let scavengerHandler;
  let mockPhaseManager;
  let mockBrokerGateway;
  let mockShadowState;
  let mockL2Validator;
  let mockOrderManager;
  let mockSafetyGates;
  let mockConfigManager;
  let mockLogger;

  beforeEach(() => {
    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    // Mock PhaseManager
    mockPhaseManager = {
      getCurrentPhase: jest.fn().mockReturnValue(1), // Phase 1 active
      getLastKnownEquity: jest.fn().mockReturnValue(1000),
    };

    // Mock BrokerGateway
    mockBrokerGateway = {
      placeOrder: jest.fn().mockResolvedValue({
        success: true,
        order_id: 'order-123',
        fill_price: 50000,
      }),
    };

    // Mock ShadowState
    mockShadowState = {
      processIntent: jest.fn().mockReturnValue({
        signal_id: 'test-signal-1',
        status: 'pending',
      }),
      getIntent: jest.fn().mockReturnValue({
        signal_id: 'test-signal-1',
        status: 'pending',
      }),
      validateIntent: jest.fn(),
      rejectIntent: jest.fn(),
      openPosition: jest.fn().mockResolvedValue(true),
    };

    // Mock L2Validator
    mockL2Validator = {
      getMarketConditions: jest.fn().mockReturnValue({
        bestBid: 49990,
        bestAsk: 50010,
        spread: 20,
        depth: 1000000,
      }),
      validate: jest.fn().mockReturnValue({
        valid: true,
      }),
    };

    // Mock OrderManager
    mockOrderManager = {};

    // Mock SafetyGates
    mockSafetyGates = {
      processSignal: jest.fn().mockResolvedValue({
        blocked: false,
      }),
    };

    // Mock ConfigManager
    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        masterArm: true,
      }),
    };

    // Initialize SignalRouter
    signalRouter = new SignalRouter({
      phaseManager: mockPhaseManager,
      logger: mockLogger,
    });

    // Initialize ScavengerHandler
    scavengerHandler = new ScavengerHandler({
      brokerGateway: mockBrokerGateway,
      shadowState: mockShadowState,
      l2Validator: mockL2Validator,
      orderManager: mockOrderManager,
      safetyGates: mockSafetyGates,
      phaseManager: mockPhaseManager,
      configManager: mockConfigManager,
      logger: mockLogger,
      wsStatus: null,
    });

    // Register ScavengerHandler with SignalRouter
    signalRouter.registerHandler('scavenger', async (signal) => {
      return await scavengerHandler.handle(signal);
    });
  });

  afterEach(() => {
    if (scavengerHandler) {
      scavengerHandler.destroy();
    }
    if (signalRouter) {
      signalRouter.destroy();
    }
  });

  describe('Handler Registration', () => {
    it('should register scavenger handler successfully', () => {
      expect(signalRouter.hasHandler('scavenger')).toBe(true);
    });

    it('should return registered sources', () => {
      const sources = signalRouter.getRegisteredSources();
      expect(sources).toContain('scavenger');
    });

    it('should get correct phase for scavenger source', () => {
      const phase = signalRouter.getPhaseForSource('scavenger');
      expect(phase).toBe(1);
    });
  });

  describe('Phase Filtering', () => {
    it('should accept scavenger signal when phase is 1', async () => {
      mockPhaseManager.getCurrentPhase.mockReturnValue(1);

      const signal = {
        signal_id: 'test-signal-1',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      const result = await signalRouter.route(signal);

      expect(result.accepted).toBe(true);
      expect(mockShadowState.processIntent).toHaveBeenCalled();
    });

    it('should reject scavenger signal when phase is 2', async () => {
      mockPhaseManager.getCurrentPhase.mockReturnValue(2);

      const signal = {
        signal_id: 'test-signal-2',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      const result = await signalRouter.route(signal);

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('PHASE_MISMATCH');
      expect(mockShadowState.processIntent).not.toHaveBeenCalled();
    });

    it('should reject scavenger signal when phase is 3', async () => {
      mockPhaseManager.getCurrentPhase.mockReturnValue(3);

      const signal = {
        signal_id: 'test-signal-3',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      const result = await signalRouter.route(signal);

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('PHASE_MISMATCH');
    });

    it('should reject signal when phase is not determined', async () => {
      mockPhaseManager.getCurrentPhase.mockReturnValue(null);

      const signal = {
        signal_id: 'test-signal-4',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      const result = await signalRouter.route(signal);

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('Phase not determined yet');
    });
  });

  describe('End-to-End Signal Flow', () => {
    it('should route PREPARE signal to ScavengerHandler', async () => {
      const signal = {
        signal_id: 'test-signal-5',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      const result = await signalRouter.route(signal);

      expect(result.accepted).toBe(true);
      expect(result.result.status).toBe('prepared');
      expect(mockShadowState.processIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test-signal-5',
          symbol: 'BTCUSDT',
          direction: 'LONG',
        })
      );
    });

    it('should route PREPARE then CONFIRM signal successfully', async () => {
      // First, send PREPARE
      const prepareSignal = {
        signal_id: 'test-signal-6',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      const prepareResult = await signalRouter.route(prepareSignal);
      expect(prepareResult.accepted).toBe(true);

      // Then, send CONFIRM
      const confirmSignal = {
        signal_id: 'test-signal-6',
        signal_type: 'CONFIRM',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG', // Required for validation
      };

      const confirmResult = await signalRouter.route(confirmSignal);
      expect(confirmResult.accepted).toBe(true);
      expect(confirmResult.result.executed).toBe(true);
      expect(mockBrokerGateway.placeOrder).toHaveBeenCalled();
      expect(mockShadowState.openPosition).toHaveBeenCalled();
    });

    it('should route PREPARE then ABORT signal successfully', async () => {
      // First, send PREPARE
      const prepareSignal = {
        signal_id: 'test-signal-7',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      const prepareResult = await signalRouter.route(prepareSignal);
      expect(prepareResult.accepted).toBe(true);

      // Then, send ABORT
      const abortSignal = {
        signal_id: 'test-signal-7',
        signal_type: 'ABORT',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG', // Required for validation
      };

      const abortResult = await signalRouter.route(abortSignal);
      expect(abortResult.accepted).toBe(true);
      expect(abortResult.result.status).toBe('aborted');
      expect(mockBrokerGateway.placeOrder).not.toHaveBeenCalled();
      expect(mockShadowState.rejectIntent).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid signal source', async () => {
      const signal = {
        signal_id: 'test-signal-8',
        signal_type: 'PREPARE',
        source: 'invalid-source',
        symbol: 'BTCUSDT',
        direction: 'LONG',
      };

      const result = await signalRouter.route(signal);

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('Invalid source');
    });

    it('should handle missing signal_id', async () => {
      const signal = {
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
      };

      const result = await signalRouter.route(signal);

      expect(result.accepted).toBe(false);
      expect(result.reason).toContain('signal_id is required');
    });

    it('should handle handler errors gracefully', async () => {
      // Make handler throw error
      mockShadowState.processIntent.mockImplementation(() => {
        throw new Error('Shadow State error');
      });

      const signal = {
        signal_id: 'test-signal-9',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      const result = await signalRouter.route(signal);

      // Handler catches errors and returns error response
      expect(result.accepted).toBe(true);
      expect(result.result.status).toBe('error');
    });
  });

  describe('Event Emission', () => {
    it('should emit signal:routed event on successful routing', async () => {
      const routedHandler = jest.fn();
      signalRouter.on('signal:routed', routedHandler);

      const signal = {
        signal_id: 'test-signal-10',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      await signalRouter.route(signal);

      expect(routedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test-signal-10',
          source: 'scavenger',
          symbol: 'BTCUSDT',
        })
      );
    });

    it('should emit signal:rejected event on phase mismatch', async () => {
      const rejectedHandler = jest.fn();
      signalRouter.on('signal:rejected', rejectedHandler);

      mockPhaseManager.getCurrentPhase.mockReturnValue(2);

      const signal = {
        signal_id: 'test-signal-11',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      await signalRouter.route(signal);

      expect(rejectedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test-signal-11',
          source: 'scavenger',
          reason: expect.stringContaining('PHASE_MISMATCH'),
        })
      );
    });

    it('should emit signal:routed event even when handler has internal error', async () => {
      const routedHandler = jest.fn();
      signalRouter.on('signal:routed', routedHandler);

      mockShadowState.processIntent.mockImplementation(() => {
        throw new Error('Test error');
      });

      const signal = {
        signal_id: 'test-signal-12',
        signal_type: 'PREPARE',
        source: 'scavenger',
        symbol: 'BTCUSDT',
        direction: 'LONG',
        confidence: 85,
        leverage: 20,
        stop_loss: 49000,
        take_profits: [51000],
        trap_type: 'LIQUIDATION',
      };

      await signalRouter.route(signal);

      // Handler catches errors internally, so signal is still routed
      expect(routedHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test-signal-12',
          source: 'scavenger',
        })
      );
    });
  });
});
