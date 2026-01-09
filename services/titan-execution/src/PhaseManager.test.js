/**
 * PhaseManager Tests
 * 
 * Tests for phase-based execution strategy management.
 * 
 * @module PhaseManager.test
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PhaseManager } from './PhaseManager.js';
import { BrokerGateway, MockBrokerAdapter } from './BrokerGateway.js';

describe('PhaseManager', () => {
  let phaseManager;
  let brokerGateway;
  let mockAdapter;
  let logger;

  beforeEach(() => {
    // Create mock adapter
    mockAdapter = new MockBrokerAdapter();
    
    // Create broker gateway
    brokerGateway = new BrokerGateway({
      adapter: mockAdapter,
    });
    
    // Create logger that captures logs
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    
    // Create phase manager
    phaseManager = new PhaseManager({
      brokerGateway,
      logger,
    });
  });

  afterEach(() => {
    if (phaseManager) {
      phaseManager.reset();
    }
    if (brokerGateway) {
      brokerGateway.destroy();
    }
  });

  //─────────────────────────────────────────────────────────────────────────────
  // CONSTRUCTOR TESTS
  //─────────────────────────────────────────────────────────────────────────────

  describe('Constructor', () => {
    test('should throw error if brokerGateway is not provided', () => {
      expect(() => new PhaseManager({})).toThrow('brokerGateway is required');
    });

    test('should initialize with null phase', () => {
      expect(phaseManager.getCurrentPhase()).toBeNull();
    });

    test('should initialize with null equity', () => {
      expect(phaseManager.getLastKnownEquity()).toBeNull();
    });

    test('should initialize with empty transition history', () => {
      expect(phaseManager.getTransitionHistory()).toEqual([]);
    });

    test('should have phase configurations defined', () => {
      const phase1Config = phaseManager.getPhaseConfig(1);
      expect(phase1Config).toBeDefined();
      expect(phase1Config.label).toBe('KICKSTARTER');
      
      const phase2Config = phaseManager.getPhaseConfig(2);
      expect(phase2Config).toBeDefined();
      expect(phase2Config.label).toBe('TREND RIDER');
    });
  });

  //─────────────────────────────────────────────────────────────────────────────
  // PHASE DETERMINATION TESTS
  //─────────────────────────────────────────────────────────────────────────────

  describe('determinePhase', () => {
    test('should determine Phase 1 when equity is below $1,000', async () => {
      // Set equity to $500
      phaseManager.setEquity(500);
      
      expect(phaseManager.getCurrentPhase()).toBe(1);
    });

    test('should determine Phase 2 when equity is $1,000 or above', async () => {
      // Set equity to $1,500
      phaseManager.setEquity(1500);
      
      expect(phaseManager.getCurrentPhase()).toBe(2);
    });

    test('should determine Phase 1 at exactly $999', async () => {
      phaseManager.setEquity(999);
      
      expect(phaseManager.getCurrentPhase()).toBe(1);
    });

    test('should determine Phase 2 at exactly $1,000', async () => {
      phaseManager.setEquity(1000);
      
      expect(phaseManager.getCurrentPhase()).toBe(2);
    });

    test('should update lastKnownEquity', async () => {
      phaseManager.setEquity(750);
      
      expect(phaseManager.getLastKnownEquity()).toBe(750);
    });

    test('should log phase determination', async () => {
      phaseManager.setEquity(500);
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          phase: 1,
          equity: 500,
        }),
        'Equity set manually'
      );
    });

    test('should get equity from broker when determinePhase is called', async () => {
      // Add a position with unrealized PnL to simulate equity growth
      mockAdapter.addPosition({
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 1.0,
        entry_price: 50000,
        unrealized_pnl: 1000, // This will push equity to 1200
        leverage: 1,
      });
      
      const phase = await phaseManager.determinePhase();
      
      expect(phase).toBe(2); // 200 base + 1000 PnL = 1200 -> Phase 2
      expect(phaseManager.getLastKnownEquity()).toBe(1200);
    });
  });

  //─────────────────────────────────────────────────────────────────────────────
  // PHASE TRANSITION TESTS
  //─────────────────────────────────────────────────────────────────────────────

  describe('Phase Transitions', () => {
    test('should detect transition from Phase 1 to Phase 2', async () => {
      // Start in Phase 1
      phaseManager.setEquity(500);
      
      // Transition to Phase 2
      phaseManager.setEquity(1200);
      
      expect(phaseManager.getCurrentPhase()).toBe(2);
      expect(phaseManager.getTransitionHistory()).toHaveLength(1);
      
      const transition = phaseManager.getTransitionHistory()[0];
      expect(transition.oldPhase).toBe(1);
      expect(transition.newPhase).toBe(2);
      expect(transition.equityAtTransition).toBe(1200);
    });

    test('should detect transition from Phase 2 to Phase 1', async () => {
      // Start in Phase 2
      phaseManager.setEquity(1500);
      
      // Transition to Phase 1 (drawdown scenario)
      phaseManager.setEquity(800);
      
      expect(phaseManager.getCurrentPhase()).toBe(1);
      expect(phaseManager.getTransitionHistory()).toHaveLength(1);
      
      const transition = phaseManager.getTransitionHistory()[0];
      expect(transition.oldPhase).toBe(2);
      expect(transition.newPhase).toBe(1);
      expect(transition.equityAtTransition).toBe(800);
    });

    test('should log phase transition', async () => {
      phaseManager.setEquity(500);
      
      phaseManager.setEquity(1200);
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          old_phase: 1,
          old_phase_label: 'KICKSTARTER',
          new_phase: 2,
          new_phase_label: 'TREND RIDER',
          equity_at_transition: 1200,
        }),
        'Phase transition occurred'
      );
    });

    test('should emit phase:transition event', async () => {
      const transitionHandler = jest.fn();
      phaseManager.on('phase:transition', transitionHandler);
      
      phaseManager.setEquity(500);
      
      phaseManager.setEquity(1200);
      
      expect(transitionHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          oldPhase: 1,
          newPhase: 2,
          equityAtTransition: 1200,
        })
      );
    });

    test('should not trigger transition if phase remains the same', async () => {
      phaseManager.setEquity(500);
      
      phaseManager.setEquity(700);
      
      expect(phaseManager.getTransitionHistory()).toHaveLength(0);
    });
  });

  //─────────────────────────────────────────────────────────────────────────────
  // SIGNAL VALIDATION TESTS
  //─────────────────────────────────────────────────────────────────────────────

  describe('validateSignal', () => {
    test('should accept SCALP signal in Phase 1', async () => {
      phaseManager.setEquity(500);
      
      const isValid = phaseManager.validateSignal('SCALP');
      
      expect(isValid).toBe(true);
    });

    test('should reject DAY signal in Phase 1', async () => {
      phaseManager.setEquity(500);
      
      const isValid = phaseManager.validateSignal('DAY');
      
      expect(isValid).toBe(false);
    });

    test('should reject SWING signal in Phase 1', async () => {
      phaseManager.setEquity(500);
      
      const isValid = phaseManager.validateSignal('SWING');
      
      expect(isValid).toBe(false);
    });

    test('should accept DAY signal in Phase 2', async () => {
      phaseManager.setEquity(1500);
      
      const isValid = phaseManager.validateSignal('DAY');
      
      expect(isValid).toBe(true);
    });

    test('should accept SWING signal in Phase 2', async () => {
      phaseManager.setEquity(1500);
      
      const isValid = phaseManager.validateSignal('SWING');
      
      expect(isValid).toBe(true);
    });

    test('should reject SCALP signal in Phase 2', async () => {
      phaseManager.setEquity(1500);
      
      const isValid = phaseManager.validateSignal('SCALP');
      
      expect(isValid).toBe(false);
    });

    test('should log rejection when signal type not allowed', async () => {
      phaseManager.setEquity(500);
      
      phaseManager.validateSignal('DAY');
      
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_type: 'DAY',
          current_phase: 1,
          phase_label: 'KICKSTARTER',
          allowed_signals: ['SCALP'],
        }),
        'Signal rejected: type not allowed in current phase'
      );
    });

    test('should emit signal:rejected event', async () => {
      const rejectionHandler = jest.fn();
      phaseManager.on('signal:rejected', rejectionHandler);
      
      phaseManager.setEquity(500);
      
      phaseManager.validateSignal('DAY');
      
      expect(rejectionHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_type: 'DAY',
          phase: 1,
          phase_label: 'KICKSTARTER',
          allowed_signals: ['SCALP'],
        })
      );
    });

    test('should return false if phase not determined', () => {
      const isValid = phaseManager.validateSignal('SCALP');
      
      expect(isValid).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_type: 'SCALP',
        }),
        'Cannot validate signal: phase not determined yet'
      );
    });

    test('should validate against specific phase when provided', async () => {
      phaseManager.setEquity(500);
      
      // Validate against Phase 2 explicitly
      const isValid = phaseManager.validateSignal('DAY', 2);
      
      expect(isValid).toBe(true);
    });
  });

  //─────────────────────────────────────────────────────────────────────────────
  // CONFIGURATION ACCESS TESTS
  //─────────────────────────────────────────────────────────────────────────────

  describe('getPhaseConfig', () => {
    test('should return Phase 1 configuration', () => {
      const config = phaseManager.getPhaseConfig(1);
      
      expect(config).toEqual({
        label: 'KICKSTARTER',
        equityRange: [200, 1000],
        riskMult: 5.0,
        riskPct: 0.10,
        maxLeverage: 30,
        signalFilter: ['SCALP'],
        executionMode: 'MAKER',
        allowPyramiding: false,
      });
    });

    test('should return Phase 2 configuration', () => {
      const config = phaseManager.getPhaseConfig(2);
      
      expect(config).toEqual({
        label: 'TREND RIDER',
        equityRange: [1000, 5000],
        riskMult: 2.5,
        riskPct: 0.05,
        maxLeverage: 15,
        signalFilter: ['DAY', 'SWING'],
        executionMode: 'TAKER',
        allowPyramiding: true,
        maxPyramidLayers: 4,
      });
    });

    test('should return current phase config when no phase specified', async () => {
      phaseManager.setEquity(500);
      await phaseManager.determinePhase();
      
      const config = phaseManager.getPhaseConfig();
      
      expect(config.label).toBe('KICKSTARTER');
    });

    test('should return null if phase not determined', () => {
      const config = phaseManager.getPhaseConfig();
      
      expect(config).toBeNull();
    });
  });

  describe('Utility Methods', () => {
    test('getPhaseLabel should return phase label', async () => {
      phaseManager.setEquity(500);
      
      expect(phaseManager.getPhaseLabel()).toBe('KICKSTARTER');
    });

    test('isPyramidingAllowed should return false in Phase 1', async () => {
      phaseManager.setEquity(500);
      
      expect(phaseManager.isPyramidingAllowed()).toBe(false);
    });

    test('isPyramidingAllowed should return true in Phase 2', async () => {
      phaseManager.setEquity(1500);
      
      expect(phaseManager.isPyramidingAllowed()).toBe(true);
    });

    test('getExecutionMode should return MAKER in Phase 1', async () => {
      phaseManager.setEquity(500);
      
      expect(phaseManager.getExecutionMode()).toBe('MAKER');
    });

    test('getExecutionMode should return TAKER in Phase 2', async () => {
      phaseManager.setEquity(1500);
      
      expect(phaseManager.getExecutionMode()).toBe('TAKER');
    });

    test('getRiskParameters should return risk parameters', async () => {
      phaseManager.setEquity(500);
      
      const riskParams = phaseManager.getRiskParameters();
      
      expect(riskParams).toEqual({
        riskMult: 5.0,
        riskPct: 0.10,
        maxLeverage: 30,
      });
    });

    test('reset should clear all state', async () => {
      phaseManager.setEquity(500);
      
      phaseManager.reset();
      
      expect(phaseManager.getCurrentPhase()).toBeNull();
      expect(phaseManager.getLastKnownEquity()).toBeNull();
      expect(phaseManager.getTransitionHistory()).toEqual([]);
    });
  });

  //─────────────────────────────────────────────────────────────────────────────
  // EDGE CASES
  //─────────────────────────────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    test('should handle broker error gracefully', async () => {
      // Simulate broker failure
      mockAdapter.simulateFailure = true;
      mockAdapter.failureReason = 'Broker API unavailable';
      
      const phase = await phaseManager.determinePhase();
      
      // Should return Phase 1 as default (starting equity = 200)
      expect(phase).toBe(1);
      expect(logger.error).toHaveBeenCalled();
    });

    test('should use last known equity if broker fails', async () => {
      // Set initial equity
      phaseManager.setEquity(1500);
      
      // Simulate broker failure
      mockAdapter.simulateFailure = true;
      
      const phase = await phaseManager.determinePhase();
      
      // Should use last known equity (1500) -> Phase 2
      expect(phase).toBe(2);
    });

    test('should handle multiple rapid transitions', async () => {
      phaseManager.setEquity(500);
      
      phaseManager.setEquity(1200);
      
      phaseManager.setEquity(800);
      
      phaseManager.setEquity(1500);
      
      expect(phaseManager.getTransitionHistory()).toHaveLength(3);
      expect(phaseManager.getCurrentPhase()).toBe(2);
    });
  });
});
