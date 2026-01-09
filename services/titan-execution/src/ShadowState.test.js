/**
 * ShadowState Unit Tests
 * 
 * Tests for the Shadow State tracker - Master of Truth for position state.
 * Requirements: 31.1-31.6
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ShadowState } from './ShadowState.js';

describe('ShadowState', () => {
  let shadowState;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    shadowState = new ShadowState({ logger: mockLogger });
  });

  afterEach(() => {
    if (shadowState) {
      shadowState.clear();
    }
  });

  describe('processIntent', () => {
    // Requirement 31.1: Pine sends Intent Signals, not position commands
    it('should process BUY_SETUP intent correctly', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
        entry_zone: [50100, 50050, 50000],
        stop_loss: 49500,
        take_profits: [50500, 51000, 52000],
        size: 0.5,
      };

      const intent = shadowState.processIntent(payload);

      expect(intent.signal_id).toBe('titan_BTCUSDT_12345_15');
      expect(intent.type).toBe('BUY_SETUP');
      expect(intent.symbol).toBe('BTCUSDT');
      expect(intent.direction).toBe(1);
      expect(intent.status).toBe('PENDING');
      expect(intent.entry_zone).toEqual([50100, 50050, 50000]);
    });

    it('should process SELL_SETUP intent correctly', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12346_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: -1,
        entry_zone: [50100],
        stop_loss: 50600,
        take_profits: [49500, 49000],
        size: 0.5,
      };

      const intent = shadowState.processIntent(payload);

      expect(intent.type).toBe('SELL_SETUP');
      expect(intent.direction).toBe(-1);
    });

    it('should process CLOSE intent correctly', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12347_15',
        type: 'CLOSE',
        symbol: 'BTCUSDT',
        direction: 1,
      };

      const intent = shadowState.processIntent(payload);

      expect(intent.type).toBe('CLOSE_LONG');
    });

    it('should store intent in pendingIntents map', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      };

      shadowState.processIntent(payload);

      expect(shadowState.getIntent('titan_BTCUSDT_12345_15')).toBeDefined();
    });
  });

  describe('rejectIntent', () => {
    // Requirement 31.2: When Node.js rejects a trade, log "REJECTED" and NOT update position state
    it('should mark intent as REJECTED and log warning', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      };

      shadowState.processIntent(payload);
      const rejected = shadowState.rejectIntent('titan_BTCUSDT_12345_15', 'L2_VALIDATION_FAILED');

      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejection_reason).toBe('L2_VALIDATION_FAILED');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'titan_BTCUSDT_12345_15',
          reason: 'L2_VALIDATION_FAILED',
        }),
        expect.stringContaining('REJECTED')
      );
    });

    it('should NOT update position state when rejected', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      };

      shadowState.processIntent(payload);
      shadowState.rejectIntent('titan_BTCUSDT_12345_15', 'L2_VALIDATION_FAILED');

      expect(shadowState.hasPosition('BTCUSDT')).toBe(false);
    });

    it('should return null for non-existent intent', () => {
      const result = shadowState.rejectIntent('non_existent_id', 'reason');
      expect(result).toBeNull();
    });
  });

  describe('confirmExecution', () => {
    // Requirement 31.3: Maintain Shadow State independent of Pine's strategy.position_size
    it('should create position when broker confirms fill', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
        stop_loss: 49500,
        take_profits: [50500, 51000, 52000],
      };

      shadowState.processIntent(payload);
      shadowState.validateIntent('titan_BTCUSDT_12345_15');
      
      const position = shadowState.confirmExecution('titan_BTCUSDT_12345_15', {
        broker_order_id: 'broker_123',
        fill_price: 50100,
        fill_size: 0.5,
        filled: true,
      });

      expect(position).toBeDefined();
      expect(position.symbol).toBe('BTCUSDT');
      expect(position.side).toBe('LONG');
      expect(position.size).toBe(0.5);
      expect(position.entry_price).toBe(50100);
      expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
    });

    it('should NOT create position when broker does not fill', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      };

      shadowState.processIntent(payload);
      
      const position = shadowState.confirmExecution('titan_BTCUSDT_12345_15', {
        broker_order_id: 'broker_123',
        fill_price: 0,
        fill_size: 0,
        filled: false,
      });

      expect(position).toBeNull();
      expect(shadowState.hasPosition('BTCUSDT')).toBe(false);
    });

    it('should handle pyramiding (adding to existing position)', () => {
      // First position
      const payload1 = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
        stop_loss: 49500,
        take_profits: [50500],
      };

      shadowState.processIntent(payload1);
      shadowState.confirmExecution('titan_BTCUSDT_12345_15', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      // Second position (pyramid)
      const payload2 = {
        signal_id: 'titan_BTCUSDT_12346_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
        stop_loss: 49500,
        take_profits: [50500],
      };

      shadowState.processIntent(payload2);
      const position = shadowState.confirmExecution('titan_BTCUSDT_12346_15', {
        broker_order_id: 'broker_124',
        fill_price: 50200,
        fill_size: 0.5,
        filled: true,
      });

      expect(position.size).toBe(1.0);
      expect(position.entry_price).toBe(50100); // Average of 50000 and 50200
    });
  });

  describe('hasPosition', () => {
    // Requirement 31.4: When receiving a "Close" signal, query: "Do I have an open position?"
    it('should return true when position exists', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      };

      shadowState.processIntent(payload);
      shadowState.confirmExecution('titan_BTCUSDT_12345_15', {
        broker_order_id: 'broker_123',
        fill_price: 50100,
        fill_size: 0.5,
        filled: true,
      });

      expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
    });

    it('should return false when position does not exist', () => {
      expect(shadowState.hasPosition('BTCUSDT')).toBe(false);
    });
  });

  describe('isZombieSignal', () => {
    // Requirement 31.5: When no matching position exists for Close signal, ignore as Zombie Signal
    it('should return true and log warning for zombie signal', () => {
      const isZombie = shadowState.isZombieSignal('BTCUSDT', 'titan_BTCUSDT_12345_15');

      expect(isZombie).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'titan_BTCUSDT_12345_15',
          symbol: 'BTCUSDT',
        }),
        expect.stringContaining('ZOMBIE_SIGNAL')
      );
    });

    it('should return false when position exists', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      };

      shadowState.processIntent(payload);
      shadowState.confirmExecution('titan_BTCUSDT_12345_15', {
        broker_order_id: 'broker_123',
        fill_price: 50100,
        fill_size: 0.5,
        filled: true,
      });

      const isZombie = shadowState.isZombieSignal('BTCUSDT', 'close_signal_123');
      expect(isZombie).toBe(false);
    });
  });

  describe('PnL calculation', () => {
    // Requirement 31.6: Use Node.js Shadow State for PnL calculation
    it('should calculate PnL correctly for winning long trade', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      };

      shadowState.processIntent(payload);
      shadowState.confirmExecution('titan_BTCUSDT_12345_15', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 1.0,
        filled: true,
      });

      const tradeRecord = shadowState.closePosition('BTCUSDT', 51000, 'TP1');

      expect(tradeRecord.pnl).toBe(1000); // (51000 - 50000) * 1.0
      expect(tradeRecord.pnl_pct).toBe(2); // 2%
    });

    it('should calculate PnL correctly for losing short trade', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: -1,
      };

      shadowState.processIntent(payload);
      shadowState.confirmExecution('titan_BTCUSDT_12345_15', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 1.0,
        filled: true,
      });

      const tradeRecord = shadowState.closePosition('BTCUSDT', 51000, 'SL');

      expect(tradeRecord.pnl).toBe(-1000); // (50000 - 51000) * 1.0
      expect(tradeRecord.pnl_pct).toBe(-2); // -2%
    });

    it('should calculate rolling PnL statistics', () => {
      // Create some trades
      for (let i = 0; i < 5; i++) {
        const payload = {
          signal_id: `titan_BTCUSDT_${i}_15`,
          type: 'PREPARE',
          symbol: `SYM${i}`,
          direction: 1,
        };

        shadowState.processIntent(payload);
        shadowState.confirmExecution(`titan_BTCUSDT_${i}_15`, {
          broker_order_id: `broker_${i}`,
          fill_price: 100,
          fill_size: 1.0,
          filled: true,
        });

        // Close with alternating win/loss
        const exitPrice = i % 2 === 0 ? 110 : 90;
        shadowState.closePosition(`SYM${i}`, exitPrice, 'TEST');
      }

      const stats = shadowState.calculatePnLStats(5);

      expect(stats.trade_count).toBe(5);
      expect(stats.win_rate).toBe(0.6); // 3 wins out of 5
      expect(stats.total_pnl).toBe(10); // 3*10 - 2*10 = 10
    });
  });

  describe('closeAllPositions', () => {
    it('should close all positions and return trade records', () => {
      // Open multiple positions
      const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
      
      symbols.forEach((symbol, i) => {
        const payload = {
          signal_id: `titan_${symbol}_${i}_15`,
          type: 'PREPARE',
          symbol,
          direction: 1,
        };

        shadowState.processIntent(payload);
        shadowState.confirmExecution(`titan_${symbol}_${i}_15`, {
          broker_order_id: `broker_${i}`,
          fill_price: 100,
          fill_size: 1.0,
          filled: true,
        });
      });

      expect(shadowState.getAllPositions().size).toBe(3);

      const getPriceForSymbol = (symbol) => 110;
      const records = shadowState.closeAllPositions(getPriceForSymbol, 'REGIME_KILL');

      expect(records.length).toBe(3);
      expect(shadowState.getAllPositions().size).toBe(0);
      records.forEach(record => {
        expect(record.close_reason).toBe('REGIME_KILL');
        expect(record.pnl).toBe(10);
      });
    });
  });

  describe('getStateSnapshot', () => {
    it('should return complete state snapshot', () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        type: 'PREPARE',
        symbol: 'BTCUSDT',
        direction: 1,
      };

      shadowState.processIntent(payload);
      shadowState.confirmExecution('titan_BTCUSDT_12345_15', {
        broker_order_id: 'broker_123',
        fill_price: 50100,
        fill_size: 0.5,
        filled: true,
      });

      const snapshot = shadowState.getStateSnapshot();

      expect(snapshot.positions).toBeDefined();
      expect(snapshot.positions.BTCUSDT).toBeDefined();
      expect(snapshot.pending_intents_count).toBe(1);
      expect(snapshot.timestamp).toBeDefined();
    });
  });
});

describe('ShadowState - Enhanced Features', () => {
  let shadowState;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    shadowState = new ShadowState({ logger: mockLogger });
  });

  afterEach(() => {
    if (shadowState) {
      shadowState.removeAllListeners();
      shadowState.clear();
    }
  });

  describe('Input Validation', () => {
    it('should throw error when signal_id is missing', () => {
      const payload = {
        symbol: 'BTCUSDT',
        direction: 1,
      };

      expect(() => shadowState.processIntent(payload)).toThrow('signal_id is required');
    });

    it('should throw error when symbol is missing', () => {
      const payload = {
        signal_id: 'test_123',
        direction: 1,
      };

      expect(() => shadowState.processIntent(payload)).toThrow('symbol is required');
    });

    it('should throw error when direction is invalid', () => {
      const payload = {
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 0,
      };

      expect(() => shadowState.processIntent(payload)).toThrow('direction must be 1 (long) or -1 (short)');
    });

    it('should throw error when direction is not a number', () => {
      const payload = {
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 'long',
      };

      expect(() => shadowState.processIntent(payload)).toThrow('direction must be 1 (long) or -1 (short)');
    });

    it('should throw error when payload is null', () => {
      expect(() => shadowState.processIntent(null)).toThrow('Intent payload is required');
    });
  });

  describe('EventEmitter Integration', () => {
    it('should emit intent:processed event when processing intent', (done) => {
      shadowState.on('intent:processed', (intent) => {
        expect(intent.signal_id).toBe('test_123');
        expect(intent.type).toBe('BUY_SETUP');
        done();
      });

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
    });

    it('should emit intent:validated event when validating intent', (done) => {
      shadowState.on('intent:validated', (intent) => {
        expect(intent.signal_id).toBe('test_123');
        expect(intent.status).toBe('VALIDATED');
        done();
      });

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.validateIntent('test_123');
    });

    it('should emit intent:rejected event when rejecting intent', (done) => {
      shadowState.on('intent:rejected', (intent) => {
        expect(intent.signal_id).toBe('test_123');
        expect(intent.status).toBe('REJECTED');
        expect(intent.rejection_reason).toBe('TEST_REASON');
        done();
      });

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.rejectIntent('test_123', 'TEST_REASON');
    });

    it('should emit position:opened event when opening position', (done) => {
      shadowState.on('position:opened', (position) => {
        expect(position.symbol).toBe('BTCUSDT');
        expect(position.side).toBe('LONG');
        expect(position.size).toBe(0.5);
        done();
      });

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });
    });

    it('should emit position:updated event when pyramiding', (done) => {
      shadowState.on('position:updated', (position) => {
        expect(position.size).toBe(1.0);
        done();
      });

      // First position
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      // Pyramid
      shadowState.processIntent({
        signal_id: 'test_124',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_124', {
        broker_order_id: 'broker_124',
        fill_price: 50200,
        fill_size: 0.5,
        filled: true,
      });
    });

    it('should emit position:closed and trade:recorded events when closing', (done) => {
      let closedEmitted = false;
      let recordedEmitted = false;

      const checkDone = () => {
        if (closedEmitted && recordedEmitted) done();
      };

      shadowState.on('position:closed', (record) => {
        expect(record.symbol).toBe('BTCUSDT');
        expect(record.pnl).toBe(500);
        closedEmitted = true;
        checkDone();
      });

      shadowState.on('trade:recorded', (record) => {
        expect(record.close_reason).toBe('TP1');
        recordedEmitted = true;
        checkDone();
      });

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });
      shadowState.closePosition('BTCUSDT', 51000, 'TP1');
    });
  });

  describe('Immutability', () => {
    it('should return immutable copy from getPosition', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
        take_profits: [51000, 52000],
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      const position = shadowState.getPosition('BTCUSDT');
      position.size = 999;
      position.take_profits.push(99999);

      const originalPosition = shadowState.getPosition('BTCUSDT');
      expect(originalPosition.size).toBe(0.5);
      expect(originalPosition.take_profits).not.toContain(99999);
    });

    it('should return immutable copy from getIntent', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
        entry_zone: [50000, 49900],
      });

      const intent = shadowState.getIntent('test_123');
      intent.status = 'HACKED';
      intent.entry_zone.push(99999);

      const originalIntent = shadowState.getIntent('test_123');
      expect(originalIntent.status).toBe('PENDING');
      expect(originalIntent.entry_zone).not.toContain(99999);
    });

    it('should return immutable copy from processIntent', () => {
      const returned = shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });

      returned.status = 'HACKED';

      const stored = shadowState.getIntent('test_123');
      expect(stored.status).toBe('PENDING');
    });
  });

  describe('Serialization / Deserialization', () => {
    it('should serialize state to JSON string', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      const serialized = shadowState.serialize();
      const parsed = JSON.parse(serialized);

      expect(parsed.positions).toBeDefined();
      expect(parsed.positions.BTCUSDT).toBeDefined();
      expect(parsed.pendingIntents).toBeDefined();
      expect(parsed.tradeHistory).toBeDefined();
      expect(parsed.serializedAt).toBeDefined();
    });

    it('should deserialize state from JSON string', () => {
      const data = JSON.stringify({
        positions: {
          BTCUSDT: {
            symbol: 'BTCUSDT',
            side: 'LONG',
            size: 0.5,
            entry_price: 50000,
            stop_loss: 49000,
            take_profits: [51000],
            signal_id: 'test_123',
            opened_at: '2025-01-01T00:00:00.000Z',
          },
        },
        pendingIntents: {
          test_456: {
            signal_id: 'test_456',
            type: 'BUY_SETUP',
            symbol: 'ETHUSDT',
            direction: 1,
            status: 'PENDING',
          },
        },
        tradeHistory: [
          { signal_id: 'old_trade', pnl: 100 },
        ],
        serializedAt: '2025-01-01T00:00:00.000Z',
      });

      shadowState.deserialize(data);

      expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
      expect(shadowState.getPosition('BTCUSDT').size).toBe(0.5);
      expect(shadowState.getIntent('test_456')).toBeDefined();
      expect(shadowState.tradeCount).toBe(1);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => shadowState.deserialize('not valid json')).toThrow('Invalid JSON');
    });

    it('should throw error for null data', () => {
      expect(() => shadowState.deserialize(null)).toThrow('Invalid serialized data');
    });

    it('should handle empty state gracefully', () => {
      const data = JSON.stringify({});
      shadowState.deserialize(data);

      expect(shadowState.positionCount).toBe(0);
      expect(shadowState.pendingIntentCount).toBe(0);
      expect(shadowState.tradeCount).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero-size position gracefully', () => {
      // Manually create a zero-size position (edge case)
      shadowState.positions.set('BTCUSDT', {
        symbol: 'BTCUSDT',
        side: 'LONG',
        size: 0,
        entry_price: 50000,
        stop_loss: 49000,
        take_profits: [],
        signal_id: 'test_123',
        opened_at: new Date().toISOString(),
      });

      const result = shadowState.closePosition('BTCUSDT', 51000, 'TEST');
      
      expect(result).toBeNull();
      expect(shadowState.hasPosition('BTCUSDT')).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('zero size')
      );
    });

    it('should handle closeAllPositions when getPriceForSymbol returns undefined', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      const getPriceForSymbol = () => undefined;
      const records = shadowState.closeAllPositions(getPriceForSymbol, 'EMERGENCY');

      expect(records.length).toBe(0);
      expect(shadowState.hasPosition('BTCUSDT')).toBe(true); // Position not closed
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'BTCUSDT' }),
        expect.stringContaining('Could not get valid price')
      );
    });

    it('should handle concurrent intent processing for same symbol', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.processIntent({
        signal_id: 'test_124',
        symbol: 'BTCUSDT',
        direction: 1,
      });

      expect(shadowState.getIntent('test_123')).toBeDefined();
      expect(shadowState.getIntent('test_124')).toBeDefined();
    });
  });

  describe('Getters', () => {
    it('should return correct positionCount', () => {
      expect(shadowState.positionCount).toBe(0);

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      expect(shadowState.positionCount).toBe(1);
    });

    it('should return correct pendingIntentCount', () => {
      expect(shadowState.pendingIntentCount).toBe(0);

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });

      expect(shadowState.pendingIntentCount).toBe(1);
    });

    it('should return correct tradeCount', () => {
      expect(shadowState.tradeCount).toBe(0);

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });
      shadowState.closePosition('BTCUSDT', 51000, 'TP1');

      expect(shadowState.tradeCount).toBe(1);
    });
  });

  describe('Trade History Trimming', () => {
    it('should trim trade history when exceeding maxTradeHistory', () => {
      const smallState = new ShadowState({ 
        logger: mockLogger,
        maxTradeHistory: 5,
      });

      // Create 10 trades
      for (let i = 0; i < 10; i++) {
        smallState.processIntent({
          signal_id: `test_${i}`,
          symbol: `SYM${i}`,
          direction: 1,
        });
        smallState.confirmExecution(`test_${i}`, {
          broker_order_id: `broker_${i}`,
          fill_price: 100,
          fill_size: 1.0,
          filled: true,
        });
        smallState.closePosition(`SYM${i}`, 110, 'TEST');
      }

      expect(smallState.tradeCount).toBe(5);
      // Should keep the last 5 trades (indices 5-9)
      const trades = smallState.getRecentTrades(10);
      expect(trades[0].signal_id).toBe('test_5');
      expect(trades[4].signal_id).toBe('test_9');

      smallState.clear();
    });
  });

  describe('Partial Position Close', () => {
    it('should partially close a position and emit partial_close event', () => {
      const partialCloseHandler = jest.fn();
      shadowState.on('position:partial_close', partialCloseHandler);

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 1.0,
        filled: true,
      });

      const record = shadowState.closePartialPosition('BTCUSDT', 51000, 0.5, 'TP1');

      expect(record).not.toBeNull();
      expect(record.size).toBe(0.5);
      expect(record.pnl).toBe(500); // (51000 - 50000) * 0.5
      expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
      expect(shadowState.getPosition('BTCUSDT').size).toBe(0.5);
      expect(partialCloseHandler).toHaveBeenCalled();
    });

    it('should throw error when closeSize exceeds position size', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      expect(() => {
        shadowState.closePartialPosition('BTCUSDT', 51000, 1.0, 'TP1');
      }).toThrow('closeSize (1) cannot exceed position size (0.5)');
    });

    it('should throw error when closeSize is invalid', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 1.0,
        filled: true,
      });

      expect(() => {
        shadowState.closePartialPosition('BTCUSDT', 51000, -0.5, 'TP1');
      }).toThrow('closeSize must be a positive finite number');
    });

    it('should return null when no position exists for partial close', () => {
      const record = shadowState.closePartialPosition('BTCUSDT', 51000, 0.5, 'TP1');
      expect(record).toBeNull();
    });
  });

  describe('Destroy', () => {
    it('should destroy instance and clear all state', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      shadowState.destroy();

      expect(shadowState.isDestroyed()).toBe(true);
      expect(shadowState.positionCount).toBe(0);
      expect(shadowState.pendingIntentCount).toBe(0);
    });

    it('should throw error when processing intent after destroy', () => {
      shadowState.destroy();

      expect(() => {
        shadowState.processIntent({
          signal_id: 'test_123',
          symbol: 'BTCUSDT',
          direction: 1,
        });
      }).toThrow('ShadowState has been destroyed');
    });

    it('should remove all event listeners on destroy', () => {
      const handler = jest.fn();
      shadowState.on('position:opened', handler);

      shadowState.destroy();

      expect(shadowState.listenerCount('position:opened')).toBe(0);
    });

    it('should be idempotent (multiple destroy calls are safe)', () => {
      shadowState.destroy();
      shadowState.destroy(); // Should not throw

      expect(shadowState.isDestroyed()).toBe(true);
    });
  });

  describe('Exit Price Validation', () => {
    it('should throw error when exitPrice is negative', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      expect(() => {
        shadowState.closePosition('BTCUSDT', -100, 'TEST');
      }).toThrow('exitPrice must be a positive finite number');
    });

    it('should throw error when exitPrice is zero', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      expect(() => {
        shadowState.closePosition('BTCUSDT', 0, 'TEST');
      }).toThrow('exitPrice must be a positive finite number');
    });

    it('should throw error when exitPrice is NaN', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      expect(() => {
        shadowState.closePosition('BTCUSDT', NaN, 'TEST');
      }).toThrow('exitPrice must be a positive finite number');
    });

    it('should throw error when exitPrice is Infinity', () => {
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      expect(() => {
        shadowState.closePosition('BTCUSDT', Infinity, 'TEST');
      }).toThrow('exitPrice must be a positive finite number');
    });
  });
});

describe('ShadowState - Database Integration & Crash Recovery', () => {
  let shadowState;
  let mockLogger;
  let mockDatabaseManager;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockDatabaseManager = {
      isInitialized: true,
      getActivePositions: jest.fn(),
      insertPosition: jest.fn(),
      updatePosition: jest.fn(),
      closePosition: jest.fn(),
    };
  });

  afterEach(() => {
    if (shadowState) {
      shadowState.removeAllListeners();
      shadowState.clear();
    }
  });

  describe('Crash Recovery', () => {
    // Requirement 97.10: Reconcile Shadow State from database positions table on restart
    it('should recover active positions from database on startup', async () => {
      const dbPositions = [
        {
          symbol: 'BTCUSDT',
          side: 'LONG',
          size: 0.5,
          avg_entry: 50000,
          current_stop: 49000,
          current_tp: 51000,
          opened_at: new Date('2025-01-01T00:00:00.000Z'),
        },
        {
          symbol: 'ETHUSDT',
          side: 'SHORT',
          size: 1.0,
          avg_entry: 3000,
          current_stop: 3100,
          current_tp: 2900,
          opened_at: new Date('2025-01-01T01:00:00.000Z'),
        },
      ];

      mockDatabaseManager.getActivePositions.mockResolvedValue(dbPositions);

      // Create ShadowState with database manager
      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify positions were recovered
      expect(shadowState.hasPosition('BTCUSDT')).toBe(true);
      expect(shadowState.hasPosition('ETHUSDT')).toBe(true);

      const btcPosition = shadowState.getPosition('BTCUSDT');
      expect(btcPosition.side).toBe('LONG');
      expect(btcPosition.size).toBe(0.5);
      expect(btcPosition.entry_price).toBe(50000);
      expect(btcPosition.stop_loss).toBe(49000);

      const ethPosition = shadowState.getPosition('ETHUSDT');
      expect(ethPosition.side).toBe('SHORT');
      expect(ethPosition.size).toBe(1.0);
      expect(ethPosition.entry_price).toBe(3000);

      // Verify logging
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          recovered_count: 2,
        }),
        expect.stringContaining('Shadow State recovered from database: 2 positions restored')
      );
    });

    it('should emit state:recovered event after recovery', async () => {
      const dbPositions = [
        {
          symbol: 'BTCUSDT',
          side: 'LONG',
          size: 0.5,
          avg_entry: 50000,
          current_stop: 49000,
          current_tp: 51000,
          opened_at: new Date('2025-01-01T00:00:00.000Z'),
        },
      ];

      mockDatabaseManager.getActivePositions.mockResolvedValue(dbPositions);

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      const recoveryHandler = jest.fn();
      shadowState.on('state:recovered', recoveryHandler);

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(recoveryHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          recovered_count: 1,
          positions: expect.any(Map),
        })
      );
    });

    it('should handle empty database gracefully', async () => {
      mockDatabaseManager.getActivePositions.mockResolvedValue([]);

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(shadowState.positionCount).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('No active positions found in database')
      );
    });

    it('should handle database errors gracefully (non-blocking)', async () => {
      mockDatabaseManager.getActivePositions.mockRejectedValue(
        new Error('Database connection failed')
      );

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery attempt to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not crash, just log error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Database connection failed',
        }),
        expect.stringContaining('Failed to recover Shadow State from database')
      );

      // Shadow State should still be usable
      expect(shadowState.positionCount).toBe(0);
    });

    it('should skip recovery when DatabaseManager is not initialized', async () => {
      mockDatabaseManager.isInitialized = false;

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery check to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockDatabaseManager.getActivePositions).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('DatabaseManager not initialized')
      );
    });

    it('should skip recovery when no DatabaseManager is provided', async () => {
      shadowState = new ShadowState({ 
        logger: mockLogger,
        // No databaseManager
      });

      // Wait for recovery check to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(shadowState.positionCount).toBe(0);
      // Should not log any warnings
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should handle positions with null take_profits gracefully', async () => {
      const dbPositions = [
        {
          symbol: 'BTCUSDT',
          side: 'LONG',
          size: 0.5,
          avg_entry: 50000,
          current_stop: 49000,
          current_tp: null, // No take profit
          opened_at: new Date('2025-01-01T00:00:00.000Z'),
        },
      ];

      mockDatabaseManager.getActivePositions.mockResolvedValue(dbPositions);

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const position = shadowState.getPosition('BTCUSDT');
      expect(position.take_profits).toEqual([]);
    });

    it('should convert database timestamps to ISO strings', async () => {
      const dbPositions = [
        {
          symbol: 'BTCUSDT',
          side: 'LONG',
          size: 0.5,
          avg_entry: 50000,
          current_stop: 49000,
          current_tp: 51000,
          opened_at: new Date('2025-01-01T00:00:00.000Z'),
        },
      ];

      mockDatabaseManager.getActivePositions.mockResolvedValue(dbPositions);

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const position = shadowState.getPosition('BTCUSDT');
      expect(typeof position.opened_at).toBe('string');
      expect(position.opened_at).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should handle string timestamps from database', async () => {
      const dbPositions = [
        {
          symbol: 'BTCUSDT',
          side: 'LONG',
          size: 0.5,
          avg_entry: 50000,
          current_stop: 49000,
          current_tp: 51000,
          opened_at: '2025-01-01T00:00:00.000Z', // String instead of Date
        },
      ];

      mockDatabaseManager.getActivePositions.mockResolvedValue(dbPositions);

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const position = shadowState.getPosition('BTCUSDT');
      expect(position.opened_at).toBe('2025-01-01T00:00:00.000Z');
    });

    it('should generate unique signal_id for recovered positions', async () => {
      const dbPositions = [
        {
          symbol: 'BTCUSDT',
          side: 'LONG',
          size: 0.5,
          avg_entry: 50000,
          current_stop: 49000,
          current_tp: 51000,
          opened_at: new Date('2025-01-01T00:00:00.000Z'),
        },
        {
          symbol: 'ETHUSDT',
          side: 'SHORT',
          size: 1.0,
          avg_entry: 3000,
          current_stop: 3100,
          current_tp: 2900,
          opened_at: new Date('2025-01-01T01:00:00.000Z'),
        },
      ];

      mockDatabaseManager.getActivePositions.mockResolvedValue(dbPositions);

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const btcPosition = shadowState.getPosition('BTCUSDT');
      const ethPosition = shadowState.getPosition('ETHUSDT');

      expect(btcPosition.signal_id).toMatch(/^recovered_BTCUSDT_\d+$/);
      expect(ethPosition.signal_id).toMatch(/^recovered_ETHUSDT_\d+$/);
      expect(btcPosition.signal_id).not.toBe(ethPosition.signal_id);
    });
  });

  describe('Database Integration - Fire-and-Forget Pattern', () => {
    beforeEach(() => {
      mockDatabaseManager.getActivePositions.mockResolvedValue([]);
    });

    it('should insert position record on position open', async () => {
      mockDatabaseManager.insertPosition.mockResolvedValue({ success: true });

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
        stop_loss: 49000,
        take_profits: [51000, 52000],
      });

      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      // Wait for async database call
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockDatabaseManager.insertPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'BTCUSDT',
          side: 'LONG',
          size: 0.5,
          avg_entry: 50000,
          current_stop: 49000,
          current_tp: 51000,
        })
      );
    });

    it('should not block execution when database insert fails', async () => {
      mockDatabaseManager.insertPosition.mockRejectedValue(
        new Error('Database write failed')
      );

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });

      const position = shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      // Position should still be created despite database failure
      expect(position).not.toBeNull();
      expect(shadowState.hasPosition('BTCUSDT')).toBe(true);

      // Wait for async database call
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should log error but not throw
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Database write failed',
        }),
        expect.stringContaining('Failed to insert position record')
      );
    });

    it('should update position record on pyramid', async () => {
      mockDatabaseManager.insertPosition.mockResolvedValue({ success: true });
      mockDatabaseManager.updatePosition.mockResolvedValue({ success: true });

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // First position
      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      // Wait for insert
      await new Promise(resolve => setTimeout(resolve, 100));

      // Pyramid
      shadowState.processIntent({
        signal_id: 'test_124',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_124', {
        broker_order_id: 'broker_124',
        fill_price: 50200,
        fill_size: 0.5,
        filled: true,
      });

      // Wait for update
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockDatabaseManager.updatePosition).toHaveBeenCalledWith(
        'BTCUSDT',
        expect.objectContaining({
          size: 1.0,
          avg_entry: 50100,
        })
      );
    });

    it('should close position record on position close', async () => {
      mockDatabaseManager.insertPosition.mockResolvedValue({ success: true });
      mockDatabaseManager.closePosition.mockResolvedValue({ success: true });

      shadowState = new ShadowState({ 
        logger: mockLogger,
        databaseManager: mockDatabaseManager,
      });

      // Wait for recovery to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      shadowState.processIntent({
        signal_id: 'test_123',
        symbol: 'BTCUSDT',
        direction: 1,
      });
      shadowState.confirmExecution('test_123', {
        broker_order_id: 'broker_123',
        fill_price: 50000,
        fill_size: 0.5,
        filled: true,
      });

      // Wait for insert
      await new Promise(resolve => setTimeout(resolve, 100));

      shadowState.closePosition('BTCUSDT', 51000, 'TP1');

      // Wait for close
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockDatabaseManager.closePosition).toHaveBeenCalledWith(
        'BTCUSDT',
        expect.objectContaining({
          close_price: 51000,
          realized_pnl: 500,
          close_reason: 'TP1',
        })
      );
    });
  });
});
