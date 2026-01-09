/**
 * Phase Logic Integration Tests
 * 
 * Tests webhook handler integration with PhaseManager
 * Requirements: 93.1-93.5, 94.1-94.6
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { PhaseManager } from './PhaseManager.js';
import { BrokerGateway, MockBrokerAdapter } from './BrokerGateway.js';
import { ShadowState } from './ShadowState.js';

describe('Webhook Handler - Phase Logic Integration', () => {
  let phaseManager;
  let brokerGateway;
  let shadowState;
  let mockAdapter;
  
  beforeEach(() => {
    // Create mock adapter
    mockAdapter = new MockBrokerAdapter();
    
    // Create broker gateway
    brokerGateway = new BrokerGateway({
      adapter: mockAdapter,
    });
    
    // Create shadow state
    shadowState = new ShadowState({});
    
    // Create phase manager
    phaseManager = new PhaseManager({
      brokerGateway,
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
  
  describe('Phase Determination', () => {
    test('should determine phase based on equity', () => {
      // Set equity to Phase 1 range
      phaseManager.setEquity(500);
      
      expect(phaseManager.getCurrentPhase()).toBe(1);
      expect(phaseManager.getLastKnownEquity()).toBe(500);
    });
    
    test('should transition to Phase 2 when equity exceeds threshold', () => {
      // Start in Phase 1
      phaseManager.setEquity(800);
      expect(phaseManager.getCurrentPhase()).toBe(1);
      
      // Transition to Phase 2
      phaseManager.setEquity(1200);
      expect(phaseManager.getCurrentPhase()).toBe(2);
      expect(phaseManager.getPhaseLabel()).toBe('TREND RIDER');
    });
    
    test('should get phase configuration', () => {
      phaseManager.setEquity(800);
      
      const config = phaseManager.getPhaseConfig();
      expect(config).toBeDefined();
      expect(config.label).toBe('KICKSTARTER');
      expect(config.signalFilter).toEqual(['SCALP']);
      expect(config.executionMode).toBe('MAKER');
      expect(config.riskPct).toBe(0.10);
      expect(config.maxLeverage).toBe(30);
    });
  });
  
  describe('Signal Type Validation', () => {
    test('should accept SCALP signal in Phase 1', () => {
      phaseManager.setEquity(500); // Phase 1
      
      const isValid = phaseManager.validateSignal('SCALP');
      expect(isValid).toBe(true);
    });
    
    test('should reject DAY signal in Phase 1', () => {
      phaseManager.setEquity(500); // Phase 1
      
      const isValid = phaseManager.validateSignal('DAY');
      expect(isValid).toBe(false);
    });
    
    test('should accept DAY signal in Phase 2', () => {
      phaseManager.setEquity(1500); // Phase 2
      
      const isValid = phaseManager.validateSignal('DAY');
      expect(isValid).toBe(true);
    });
    
    test('should accept SWING signal in Phase 2', () => {
      phaseManager.setEquity(1500); // Phase 2
      
      const isValid = phaseManager.validateSignal('SWING');
      expect(isValid).toBe(true);
    });
    
    test('should reject SCALP signal in Phase 2', () => {
      phaseManager.setEquity(1500); // Phase 2
      
      const isValid = phaseManager.validateSignal('SCALP');
      expect(isValid).toBe(false);
    });
  });
  
  describe('Phase-Specific Configuration', () => {
    test('should return MAKER execution mode for Phase 1', () => {
      phaseManager.setEquity(500); // Phase 1
      
      const executionMode = phaseManager.getExecutionMode();
      expect(executionMode).toBe('MAKER');
    });
    
    test('should return TAKER execution mode for Phase 2', () => {
      phaseManager.setEquity(1500); // Phase 2
      
      const executionMode = phaseManager.getExecutionMode();
      expect(executionMode).toBe('TAKER');
    });
    
    test('should return correct risk parameters for Phase 1', () => {
      phaseManager.setEquity(500); // Phase 1
      
      const riskParams = phaseManager.getRiskParameters();
      expect(riskParams).toEqual({
        riskMult: 5.0,
        riskPct: 0.10,
        maxLeverage: 30,
      });
    });
    
    test('should return correct risk parameters for Phase 2', () => {
      phaseManager.setEquity(1500); // Phase 2
      
      const riskParams = phaseManager.getRiskParameters();
      expect(riskParams).toEqual({
        riskMult: 2.5,
        riskPct: 0.05,
        maxLeverage: 15,
      });
    });
    
    test('should allow pyramiding in Phase 2 only', () => {
      phaseManager.setEquity(500); // Phase 1
      expect(phaseManager.isPyramidingAllowed()).toBe(false);
      
      phaseManager.setEquity(1500); // Phase 2
      expect(phaseManager.isPyramidingAllowed()).toBe(true);
    });
  });
  
  describe('Phase Transitions', () => {
    test('should track phase transitions', () => {
      // Start in Phase 1
      phaseManager.setEquity(500);
      expect(phaseManager.getCurrentPhase()).toBe(1);
      
      // Transition to Phase 2
      phaseManager.setEquity(1200);
      expect(phaseManager.getCurrentPhase()).toBe(2);
      
      // Check transition history
      const history = phaseManager.getTransitionHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        oldPhase: 1,
        newPhase: 2,
        equityAtTransition: 1200,
      });
      expect(history[0].timestamp).toBeDefined();
    });
    
    test('should emit phase transition event', (done) => {
      phaseManager.setEquity(500);
      
      phaseManager.once('phase:transition', (transition) => {
        expect(transition.oldPhase).toBe(1);
        expect(transition.newPhase).toBe(2);
        expect(transition.equityAtTransition).toBe(1200);
        done();
      });
      
      phaseManager.setEquity(1200);
    });
    
    test('should emit signal rejected event', (done) => {
      phaseManager.setEquity(500); // Phase 1
      
      phaseManager.once('signal:rejected', (data) => {
        expect(data.signal_type).toBe('DAY');
        expect(data.phase).toBe(1);
        expect(data.phase_label).toBe('KICKSTARTER');
        expect(data.allowed_signals).toEqual(['SCALP']);
        done();
      });
      
      phaseManager.validateSignal('DAY');
    });
  });
});
