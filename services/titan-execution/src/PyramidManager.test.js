/**
 * PyramidManager Tests
 * 
 * Tests for geometric pyramiding functionality in Phase 2.
 * 
 * Requirements: 87.1-87.6
 */

import { PyramidManager } from './PyramidManager.js';
import { ShadowState } from './ShadowState.js';
import { BrokerGateway, MockBrokerAdapter } from './BrokerGateway.js';

describe('PyramidManager', () => {
  let pyramidManager;
  let shadowState;
  let brokerGateway;
  let mockAdapter;

  beforeEach(() => {
    // Create mock adapter
    mockAdapter = new MockBrokerAdapter();
    
    // Create broker gateway
    brokerGateway = new BrokerGateway({
      adapter: mockAdapter,
    });
    
    // Create shadow state
    shadowState = new ShadowState();
    
    // Create pyramid manager
    pyramidManager = new PyramidManager({
      shadowState,
      brokerGateway,
    });
  });

  afterEach(() => {
    pyramidManager.reset();
    shadowState.destroy();
    brokerGateway.destroy();
  });

  describe('Constructor', () => {
    it('should require shadowState', () => {
      expect(() => {
        new PyramidManager({ brokerGateway });
      }).toThrow('shadowState is required');
    });

    it('should require brokerGateway', () => {
      expect(() => {
        new PyramidManager({ shadowState });
      }).toThrow('brokerGateway is required');
    });

    it('should use default configuration', () => {
      expect(pyramidManager.maxPyramidLayers).toBe(4);
      expect(pyramidManager.pyramidTriggerPct).toBe(0.02);
      expect(pyramidManager.autoTrailAfterLayer).toBe(2);
    });

    it('should accept custom configuration', () => {
      const customManager = new PyramidManager({
        shadowState,
        brokerGateway,
        maxPyramidLayers: 3,
        pyramidTriggerPct: 0.03,
        autoTrailAfterLayer: 3,
      });

      expect(customManager.maxPyramidLayers).toBe(3);
      expect(customManager.pyramidTriggerPct).toBe(0.03);
      expect(customManager.autoTrailAfterLayer).toBe(3);
    });
  });

  describe('checkPyramidOpportunity', () => {
    beforeEach(() => {
      // Create a position in Shadow State
      const intent = shadowState.processIntent({
        signal_id: 'test_signal_1',
        symbol: 'BTCUSDT',
        direction: 1,
        entry_zone: [50000],
        stop_loss: 49000,
        take_profits: [51000, 52000],
        size: 0.1,
      });

      shadowState.confirmExecution('test_signal_1', {
        broker_order_id: 'BROKER_1001',
        fill_price: 50000,
        fill_size: 0.1,
        filled: true,
      });
    });

    it('should return false when regime is not Risk-On', () => {
      // Requirement 87.2 - Require regime == Risk-On
      const opportunity = pyramidManager.checkPyramidOpportunity('BTCUSDT', 51000, 0);
      expect(opportunity).toBe(false);
    });

    it('should return false when no position exists', () => {
      const opportunity = pyramidManager.checkPyramidOpportunity('ETHUSDT', 3000, 1);
      expect(opportunity).toBe(false);
    });

    it('should return false when price has not moved 2%', () => {
      // Requirement 87.2 - Trigger when close > last_entry * 1.02
      const opportunity = pyramidManager.checkPyramidOpportunity('BTCUSDT', 50500, 1);
      expect(opportunity).toBe(false);
    });

    it('should return true when price > last_entry * 1.02 AND regime == Risk-On', () => {
      // Requirement 87.2 - Trigger when close > last_entry * 1.02 AND regime == Risk-On
      const opportunity = pyramidManager.checkPyramidOpportunity('BTCUSDT', 51100, 1);
      expect(opportunity).toBe(true);
    });

    it('should initialize pyramid state on first check', () => {
      pyramidManager.checkPyramidOpportunity('BTCUSDT', 51100, 1);
      
      const state = pyramidManager.getPyramidState('BTCUSDT');
      expect(state).toBeDefined();
      expect(state.symbol).toBe('BTCUSDT');
      expect(state.side).toBe('LONG');
      expect(state.layerCount).toBe(1);
      expect(state.lastEntryPrice).toBe(50000);
    });

    it('should return false when max layers reached', () => {
      // Requirement 87.3 - Limit to maximum 4 layers
      const state = pyramidManager.pyramidStates.get('BTCUSDT') || 
        pyramidManager._initializePyramidState(shadowState.getPosition('BTCUSDT'));
      
      state.layerCount = 4;
      pyramidManager.pyramidStates.set('BTCUSDT', state);
      
      const opportunity = pyramidManager.checkPyramidOpportunity('BTCUSDT', 51100, 1);
      expect(opportunity).toBe(false);
    });

    it('should emit pyramid:opportunity event', (done) => {
      pyramidManager.once('pyramid:opportunity', (event) => {
        expect(event.symbol).toBe('BTCUSDT');
        expect(event.side).toBe('LONG');
        expect(event.current_price).toBe(51100);
        expect(event.last_entry_price).toBe(50000);
        done();
      });

      pyramidManager.checkPyramidOpportunity('BTCUSDT', 51100, 1);
    });

    it('should emit pyramid:max_layers event when max reached', (done) => {
      const state = pyramidManager.pyramidStates.get('BTCUSDT') || 
        pyramidManager._initializePyramidState(shadowState.getPosition('BTCUSDT'));
      
      state.layerCount = 4;
      pyramidManager.pyramidStates.set('BTCUSDT', state);

      pyramidManager.once('pyramid:max_layers', (event) => {
        expect(event.symbol).toBe('BTCUSDT');
        expect(event.layer_count).toBe(4);
        expect(event.max_layers).toBe(4);
        done();
      });

      pyramidManager.checkPyramidOpportunity('BTCUSDT', 51100, 1);
    });

    it('should work for SHORT positions', () => {
      // Create SHORT position
      const intent = shadowState.processIntent({
        signal_id: 'test_signal_2',
        symbol: 'ETHUSDT',
        direction: -1,
        entry_zone: [3000],
        stop_loss: 3100,
        take_profits: [2900, 2800],
        size: 1.0,
      });

      shadowState.confirmExecution('test_signal_2', {
        broker_order_id: 'BROKER_1002',
        fill_price: 3000,
        fill_size: 1.0,
        filled: true,
      });

      // Price needs to move DOWN more than 2% for SHORT (3000 * 0.98 = 2940)
      // First check initializes pyramid state
      pyramidManager.checkPyramidOpportunity('ETHUSDT', 3000, 1);
      
      // Now check with lower price (2930 < 2940 trigger)
      const opportunity = pyramidManager.checkPyramidOpportunity('ETHUSDT', 2930, 1);
      expect(opportunity).toBe(true);
    });
  });

  describe('addPyramidLayer', () => {
    beforeEach(() => {
      // Create initial position
      const intent = shadowState.processIntent({
        signal_id: 'test_signal_1',
        symbol: 'BTCUSDT',
        direction: 1,
        entry_zone: [50000],
        stop_loss: 49000,
        take_profits: [51000, 52000],
        size: 0.1,
      });

      shadowState.confirmExecution('test_signal_1', {
        broker_order_id: 'BROKER_1001',
        fill_price: 50000,
        fill_size: 0.1,
        filled: true,
      });

      // Initialize pyramid state
      pyramidManager.checkPyramidOpportunity('BTCUSDT', 51100, 1);
    });

    it('should validate symbol parameter', async () => {
      await expect(pyramidManager.addPyramidLayer('', 0.1, 51000))
        .rejects.toThrow('symbol is required and must be a string');
    });

    it('should validate size parameter', async () => {
      await expect(pyramidManager.addPyramidLayer('BTCUSDT', 0, 51000))
        .rejects.toThrow('size must be a positive finite number');
      
      await expect(pyramidManager.addPyramidLayer('BTCUSDT', -0.1, 51000))
        .rejects.toThrow('size must be a positive finite number');
    });

    it('should validate price parameter', async () => {
      await expect(pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 0))
        .rejects.toThrow('price must be a positive finite number');
      
      await expect(pyramidManager.addPyramidLayer('BTCUSDT', 0.1, -51000))
        .rejects.toThrow('price must be a positive finite number');
    });

    it('should throw error if no pyramid state exists', async () => {
      await expect(pyramidManager.addPyramidLayer('ETHUSDT', 0.1, 3000))
        .rejects.toThrow('No pyramid state found for symbol: ETHUSDT');
    });

    it('should throw error if max layers reached', async () => {
      const state = pyramidManager.pyramidStates.get('BTCUSDT');
      state.layerCount = 4;

      await expect(pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 51000))
        .rejects.toThrow('Max pyramid layers (4) already reached for BTCUSDT');
    });

    it('should add pyramid layer successfully', async () => {
      const result = await pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 51000);
      
      expect(result.success).toBe(true);
      expect(result.pyramid_state.layerCount).toBe(2);
      expect(result.pyramid_state.totalSize).toBe(0.2);
      expect(result.pyramid_state.lastEntryPrice).toBe(51000);
    });

    it('should calculate average entry price correctly', async () => {
      await pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 51000);
      
      const state = pyramidManager.getPyramidState('BTCUSDT');
      // Avg = (50000 * 0.1 + 51000 * 0.1) / 0.2 = 50500
      expect(state.avgEntryPrice).toBe(50500);
    });

    it('should enable auto-trail after 2nd layer', async () => {
      // Requirement 87.4 - Auto-trail stop loss to avg_entry_price after 2nd layer
      await pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 51000);
      
      const state = pyramidManager.getPyramidState('BTCUSDT');
      expect(state.autoTrailEnabled).toBe(true);
      expect(state.currentStopLoss).toBe(50500); // avg entry price
    });

    it('should not enable auto-trail before 2nd layer', async () => {
      const customManager = new PyramidManager({
        shadowState,
        brokerGateway,
        autoTrailAfterLayer: 3,
      });

      // Initialize pyramid state
      customManager.checkPyramidOpportunity('BTCUSDT', 51100, 1);
      
      await customManager.addPyramidLayer('BTCUSDT', 0.1, 51000);
      
      const state = customManager.getPyramidState('BTCUSDT');
      expect(state.autoTrailEnabled).toBe(false);
      expect(state.currentStopLoss).toBe(49000); // original stop loss
    });

    it('should emit pyramid:added event', async () => {
      const eventPromise = new Promise((resolve) => {
        pyramidManager.once('pyramid:added', (event) => {
          expect(event.symbol).toBe('BTCUSDT');
          expect(event.layer_number).toBe(2);
          expect(event.entry_price).toBe(51000);
          expect(event.layer_size).toBe(0.1);
          expect(event.avg_entry_price).toBe(50500);
          expect(event.total_size).toBe(0.2);
          resolve();
        });
      });

      await pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 51000);
      await eventPromise;
    });

    it('should emit pyramid:trail_updated event when auto-trail enabled', async () => {
      const eventPromise = new Promise((resolve) => {
        pyramidManager.once('pyramid:trail_updated', (event) => {
          expect(event.symbol).toBe('BTCUSDT');
          expect(event.layer_number).toBe(2);
          expect(event.avg_entry_price).toBe(50500);
          expect(event.new_stop_loss).toBe(50500);
          resolve();
        });
      });

      await pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 51000);
      await eventPromise;
    });

    it('should emit stop_loss:update_required event', async () => {
      const eventPromise = new Promise((resolve) => {
        pyramidManager.once('stop_loss:update_required', (event) => {
          expect(event.symbol).toBe('BTCUSDT');
          expect(event.new_stop_loss).toBe(50500);
          resolve();
        });
      });

      await pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 51000);
      await eventPromise;
    });

    it('should log all required fields', async () => {
      // Requirement 87.5 - Log layer_number, entry_price, avg_entry_price, total_size, new_stop_loss
      const loggedData = [];
      const originalInfo = pyramidManager.logger.info;
      pyramidManager.logger.info = (data, message) => {
        loggedData.push({ data, message });
        originalInfo(data, message);
      };
      
      await pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 51000);
      
      const logCall = loggedData.find(log => 
        log.message === 'Pyramid layer added'
      );
      
      expect(logCall).toBeDefined();
      expect(logCall.data).toMatchObject({
        symbol: 'BTCUSDT',
        layer_number: 2,
        entry_price: 51000,
        avg_entry_price: 50500,
        total_size: 0.2,
        new_stop_loss: 50500,
      });
      
      // Restore original logger
      pyramidManager.logger.info = originalInfo;
    });

    it('should handle multiple pyramid layers', async () => {
      // Add 2nd layer
      await pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 51000);
      
      // Add 3rd layer
      await pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 52000);
      
      const state = pyramidManager.getPyramidState('BTCUSDT');
      expect(state.layerCount).toBe(3);
      expect(state.totalSize).toBeCloseTo(0.3, 10);
      expect(state.lastEntryPrice).toBe(52000);
      // Avg = (50000 * 0.1 + 51000 * 0.1 + 52000 * 0.1) / 0.3 = 51000
      expect(state.avgEntryPrice).toBeCloseTo(51000, 10);
    });
  });

  describe('State Queries', () => {
    beforeEach(() => {
      // Create position and pyramid state
      const intent = shadowState.processIntent({
        signal_id: 'test_signal_1',
        symbol: 'BTCUSDT',
        direction: 1,
        entry_zone: [50000],
        stop_loss: 49000,
        take_profits: [51000, 52000],
        size: 0.1,
      });

      shadowState.confirmExecution('test_signal_1', {
        broker_order_id: 'BROKER_1001',
        fill_price: 50000,
        fill_size: 0.1,
        filled: true,
      });

      pyramidManager.checkPyramidOpportunity('BTCUSDT', 51100, 1);
    });

    it('should get pyramid state', () => {
      const state = pyramidManager.getPyramidState('BTCUSDT');
      expect(state).toBeDefined();
      expect(state.symbol).toBe('BTCUSDT');
      expect(state.layerCount).toBe(1);
    });

    it('should return undefined for non-existent symbol', () => {
      const state = pyramidManager.getPyramidState('ETHUSDT');
      expect(state).toBeUndefined();
    });

    it('should get all pyramid states', () => {
      const states = pyramidManager.getAllPyramidStates();
      expect(states.size).toBe(1);
      expect(states.has('BTCUSDT')).toBe(true);
    });

    it('should check if pyramid state exists', () => {
      expect(pyramidManager.hasPyramidState('BTCUSDT')).toBe(true);
      expect(pyramidManager.hasPyramidState('ETHUSDT')).toBe(false);
    });

    it('should get layer count', () => {
      expect(pyramidManager.getLayerCount('BTCUSDT')).toBe(1);
      expect(pyramidManager.getLayerCount('ETHUSDT')).toBe(0);
    });

    it('should check if auto-trail is enabled', () => {
      expect(pyramidManager.isAutoTrailEnabled('BTCUSDT')).toBe(false);
      
      // Add layer to enable auto-trail
      pyramidManager.addPyramidLayer('BTCUSDT', 0.1, 51000);
      
      expect(pyramidManager.isAutoTrailEnabled('BTCUSDT')).toBe(true);
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      // Create position and pyramid state
      const intent = shadowState.processIntent({
        signal_id: 'test_signal_1',
        symbol: 'BTCUSDT',
        direction: 1,
        entry_zone: [50000],
        stop_loss: 49000,
        take_profits: [51000, 52000],
        size: 0.1,
      });

      shadowState.confirmExecution('test_signal_1', {
        broker_order_id: 'BROKER_1001',
        fill_price: 50000,
        fill_size: 0.1,
        filled: true,
      });

      pyramidManager.checkPyramidOpportunity('BTCUSDT', 51100, 1);
    });

    it('should remove pyramid state', () => {
      // Requirement 87.6 - Close all pyramid layers when regime changes to Risk-Off
      const removed = pyramidManager.removePyramidState('BTCUSDT');
      expect(removed).toBe(true);
      expect(pyramidManager.hasPyramidState('BTCUSDT')).toBe(false);
    });

    it('should return false when removing non-existent state', () => {
      const removed = pyramidManager.removePyramidState('ETHUSDT');
      expect(removed).toBe(false);
    });

    it('should clear all pyramid states', () => {
      pyramidManager.clearAllPyramidStates();
      expect(pyramidManager.pyramidStates.size).toBe(0);
    });

    it('should reset pyramid manager', () => {
      pyramidManager.reset();
      expect(pyramidManager.pyramidStates.size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle position with zero size', () => {
      // Create position with zero size (edge case)
      const intent = shadowState.processIntent({
        signal_id: 'test_signal_1',
        symbol: 'BTCUSDT',
        direction: 1,
        entry_zone: [50000],
        stop_loss: 49000,
        take_profits: [51000, 52000],
        size: 0,
      });

      shadowState.confirmExecution('test_signal_1', {
        broker_order_id: 'BROKER_1001',
        fill_price: 50000,
        fill_size: 0,
        filled: true,
      });

      // Position exists but with zero size - pyramid opportunity should still be detected
      // The actual execution would be handled by the caller
      const opportunity = pyramidManager.checkPyramidOpportunity('BTCUSDT', 51100, 1);
      expect(opportunity).toBe(true);
    });

    it('should handle very small price movements', () => {
      const intent = shadowState.processIntent({
        signal_id: 'test_signal_1',
        symbol: 'BTCUSDT',
        direction: 1,
        entry_zone: [50000],
        stop_loss: 49000,
        take_profits: [51000, 52000],
        size: 0.1,
      });

      shadowState.confirmExecution('test_signal_1', {
        broker_order_id: 'BROKER_1001',
        fill_price: 50000,
        fill_size: 0.1,
        filled: true,
      });

      // Price movement of 1.99% should not trigger
      const opportunity = pyramidManager.checkPyramidOpportunity('BTCUSDT', 50995, 1);
      expect(opportunity).toBe(false);
    });

    it('should handle very large price movements', () => {
      const intent = shadowState.processIntent({
        signal_id: 'test_signal_1',
        symbol: 'BTCUSDT',
        direction: 1,
        entry_zone: [50000],
        stop_loss: 49000,
        take_profits: [51000, 52000],
        size: 0.1,
      });

      shadowState.confirmExecution('test_signal_1', {
        broker_order_id: 'BROKER_1001',
        fill_price: 50000,
        fill_size: 0.1,
        filled: true,
      });

      // Price movement of 10% should trigger
      const opportunity = pyramidManager.checkPyramidOpportunity('BTCUSDT', 55000, 1);
      expect(opportunity).toBe(true);
    });
  });
});
