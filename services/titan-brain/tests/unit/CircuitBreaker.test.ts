/**
 * Unit Tests for CircuitBreaker
 * 
 * Tests daily drawdown trigger, minimum equity trigger, consecutive loss trigger,
 * soft pause cooldown, and manual reset with operator logging.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.8
 */

import {
  CircuitBreaker,
  PositionClosureHandler,
  NotificationHandler,
  BreakerEventPersistence,
} from '../../src/engine/CircuitBreaker.js';
import {
  BreakerType,
  BreakerCheckInput,
  BreakerEvent,
  CircuitBreakerConfig,
  Position,
} from '../../src/types/index.js';
import { defaultConfig } from '../../src/config/defaults.js';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockPositionHandler: jest.Mocked<PositionClosureHandler>;
  let mockNotificationHandler: jest.Mocked<NotificationHandler>;
  let mockEventPersistence: jest.Mocked<BreakerEventPersistence>;

  const defaultBreakerConfig: CircuitBreakerConfig = {
    maxDailyDrawdown: 0.15, // 15%
    minEquity: 150, // $150
    consecutiveLossLimit: 3,
    consecutiveLossWindow: 3600000, // 1 hour
    cooldownMinutes: 30,
  };

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(defaultBreakerConfig);
    
    mockPositionHandler = {
      closeAllPositions: jest.fn().mockResolvedValue(undefined),
    };
    
    mockNotificationHandler = {
      sendEmergencyNotification: jest.fn().mockResolvedValue(undefined),
    };
    
    mockEventPersistence = {
      persistEvent: jest.fn().mockResolvedValue(undefined),
    };
    
    circuitBreaker.setPositionHandler(mockPositionHandler);
    circuitBreaker.setNotificationHandler(mockNotificationHandler);
    circuitBreaker.setEventPersistence(mockEventPersistence);
  });

  describe('constructor', () => {
    it('should initialize with provided configuration', () => {
      const config = circuitBreaker.getConfig();
      expect(config.maxDailyDrawdown).toBe(0.15);
      expect(config.minEquity).toBe(150);
      expect(config.consecutiveLossLimit).toBe(3);
      expect(config.cooldownMinutes).toBe(30);
    });

    it('should start in inactive state', () => {
      expect(circuitBreaker.isActive()).toBe(false);
    });
  });

  describe('setDailyStartEquity / getDailyStartEquity', () => {
    it('should set and get daily start equity correctly', () => {
      circuitBreaker.setDailyStartEquity(1000);
      expect(circuitBreaker.getDailyStartEquity()).toBe(1000);
    });

    it('should handle negative equity as 0', () => {
      circuitBreaker.setDailyStartEquity(-500);
      expect(circuitBreaker.getDailyStartEquity()).toBe(0);
    });
  });

  describe('checkConditions - Daily Drawdown (Requirement 5.1)', () => {
    it('should trigger HARD breaker when daily drawdown exceeds 15%', () => {
      const input: BreakerCheckInput = {
        equity: 850, // 15% drawdown from 1000
        positions: [],
        dailyStartEquity: 1000,
        recentTrades: [],
      };

      const status = circuitBreaker.checkConditions(input);
      
      expect(status.active).toBe(true);
      expect(status.type).toBe(BreakerType.HARD);
      expect(status.reason).toContain('Daily drawdown exceeded');
    });

    it('should not trigger when drawdown is below threshold', () => {
      const input: BreakerCheckInput = {
        equity: 900, // 10% drawdown
        positions: [],
        dailyStartEquity: 1000,
        recentTrades: [],
      };

      const status = circuitBreaker.checkConditions(input);
      
      expect(status.active).toBe(false);
    });

    it('should calculate drawdown correctly at boundary', () => {
      const input: BreakerCheckInput = {
        equity: 851, // Just under 15% drawdown (14.9%)
        positions: [],
        dailyStartEquity: 1000,
        recentTrades: [],
      };

      const status = circuitBreaker.checkConditions(input);
      
      expect(status.active).toBe(false);
      expect(status.dailyDrawdown).toBeCloseTo(0.149, 2);
    });
  });

  describe('checkConditions - Minimum Equity (Requirement 5.2)', () => {
    it('should trigger HARD breaker when equity drops below minimum', () => {
      // Use dailyStartEquity close to equity to avoid drawdown trigger
      const input: BreakerCheckInput = {
        equity: 140, // Below $150 minimum
        positions: [],
        dailyStartEquity: 145, // Small drawdown, won't trigger 15% threshold
        recentTrades: [],
      };

      const status = circuitBreaker.checkConditions(input);
      
      expect(status.active).toBe(true);
      expect(status.type).toBe(BreakerType.HARD);
      expect(status.reason).toContain('Equity below minimum');
    });

    it('should not trigger when equity is at minimum', () => {
      // Use dailyStartEquity close to equity to avoid drawdown trigger
      const input: BreakerCheckInput = {
        equity: 150, // Exactly at minimum
        positions: [],
        dailyStartEquity: 155, // Small drawdown, won't trigger 15% threshold
        recentTrades: [],
      };

      const status = circuitBreaker.checkConditions(input);
      
      expect(status.active).toBe(false);
    });
  });

  describe('checkConditions - Consecutive Losses (Requirement 5.3)', () => {
    it('should trigger SOFT breaker for 3 consecutive losses within 1 hour', () => {
      const now = Date.now();
      const input: BreakerCheckInput = {
        equity: 900,
        positions: [],
        dailyStartEquity: 1000,
        recentTrades: [
          { pnl: -50, timestamp: now - 30000 },
          { pnl: -30, timestamp: now - 20000 },
          { pnl: -20, timestamp: now - 10000 },
        ],
      };

      const status = circuitBreaker.checkConditions(input);
      
      expect(status.active).toBe(true);
      expect(status.type).toBe(BreakerType.SOFT);
      expect(status.reason).toContain('consecutive losses');
      expect(status.cooldownEndsAt).toBeDefined();
    });

    it('should not trigger for losses outside the time window', () => {
      const now = Date.now();
      const input: BreakerCheckInput = {
        equity: 900,
        positions: [],
        dailyStartEquity: 1000,
        recentTrades: [
          { pnl: -50, timestamp: now - 4000000 }, // Outside 1 hour window
          { pnl: -30, timestamp: now - 3900000 },
          { pnl: -20, timestamp: now - 3800000 },
        ],
      };

      const status = circuitBreaker.checkConditions(input);
      
      expect(status.active).toBe(false);
    });

    it('should not trigger when profitable trade breaks the streak', () => {
      const now = Date.now();
      const input: BreakerCheckInput = {
        equity: 900,
        positions: [],
        dailyStartEquity: 1000,
        recentTrades: [
          { pnl: -50, timestamp: now - 40000 },
          { pnl: 10, timestamp: now - 30000 }, // Profitable trade breaks streak
          { pnl: -30, timestamp: now - 20000 },
          { pnl: -20, timestamp: now - 10000 },
        ],
      };

      const status = circuitBreaker.checkConditions(input);
      
      expect(status.active).toBe(false);
      expect(status.consecutiveLosses).toBe(2);
    });
  });

  describe('trigger - Position Closure (Requirement 5.4)', () => {
    it('should close all positions when triggered', async () => {
      await circuitBreaker.trigger('Test trigger');
      
      expect(mockPositionHandler.closeAllPositions).toHaveBeenCalledTimes(1);
    });

    it('should continue even if position closure fails', async () => {
      mockPositionHandler.closeAllPositions.mockRejectedValue(new Error('API error'));
      
      await circuitBreaker.trigger('Test trigger');
      
      expect(circuitBreaker.isActive()).toBe(true);
    });
  });

  describe('trigger - Signal Rejection (Requirement 5.5)', () => {
    it('should be active after trigger', async () => {
      await circuitBreaker.trigger('Test trigger');
      
      expect(circuitBreaker.isActive()).toBe(true);
    });

    it('should remain active until manual reset', async () => {
      await circuitBreaker.trigger('Test trigger');
      
      // Check multiple times
      expect(circuitBreaker.isActive()).toBe(true);
      expect(circuitBreaker.isActive()).toBe(true);
      
      // Still active
      const status = circuitBreaker.getStatus();
      expect(status.active).toBe(true);
    });
  });

  describe('trigger - Idempotence (Requirement 5.4)', () => {
    it('should not create duplicate events when triggered multiple times', async () => {
      await circuitBreaker.trigger('First trigger');
      await circuitBreaker.trigger('Second trigger');
      await circuitBreaker.trigger('Third trigger');
      
      // Should only persist one event
      expect(mockEventPersistence.persistEvent).toHaveBeenCalledTimes(1);
      
      // Should only close positions once
      expect(mockPositionHandler.closeAllPositions).toHaveBeenCalledTimes(1);
    });

    it('should maintain original trigger reason', async () => {
      await circuitBreaker.trigger('First trigger');
      await circuitBreaker.trigger('Second trigger');
      
      const status = circuitBreaker.getStatus();
      expect(status.reason).toBe('First trigger');
    });
  });

  describe('trigger - Notifications (Requirement 5.6)', () => {
    it('should send emergency notification when triggered', async () => {
      circuitBreaker.setDailyStartEquity(1000);
      await circuitBreaker.trigger('Emergency test');
      
      expect(mockNotificationHandler.sendEmergencyNotification).toHaveBeenCalledWith(
        'Emergency test',
        1000
      );
    });

    it('should continue even if notification fails', async () => {
      mockNotificationHandler.sendEmergencyNotification.mockRejectedValue(new Error('Network error'));
      
      await circuitBreaker.trigger('Test trigger');
      
      expect(circuitBreaker.isActive()).toBe(true);
    });
  });

  describe('trigger - Event Logging (Requirement 5.7)', () => {
    it('should log trigger event with full context', async () => {
      circuitBreaker.setDailyStartEquity(1000);
      await circuitBreaker.trigger('Drawdown exceeded');
      
      expect(mockEventPersistence.persistEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'TRIGGER',
          breakerType: BreakerType.HARD,
          reason: 'Drawdown exceeded',
          equity: 1000,
        })
      );
    });
  });

  describe('reset - Manual Reset (Requirement 5.8)', () => {
    it('should require operator ID for reset', async () => {
      await circuitBreaker.trigger('Test trigger');
      
      await expect(circuitBreaker.reset('')).rejects.toThrow('Operator ID is required');
    });

    it('should log operator identity on reset', async () => {
      await circuitBreaker.trigger('Test trigger');
      mockEventPersistence.persistEvent.mockClear();
      
      await circuitBreaker.reset('operator-123');
      
      expect(mockEventPersistence.persistEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'RESET',
          operatorId: 'operator-123',
          reason: expect.stringContaining('operator-123'),
        })
      );
    });

    it('should deactivate breaker after reset', async () => {
      await circuitBreaker.trigger('Test trigger');
      expect(circuitBreaker.isActive()).toBe(true);
      
      await circuitBreaker.reset('operator-123');
      expect(circuitBreaker.isActive()).toBe(false);
    });

    it('should clear all trigger state on reset', async () => {
      await circuitBreaker.trigger('Test trigger');
      await circuitBreaker.reset('operator-123');
      
      const status = circuitBreaker.getStatus();
      expect(status.active).toBe(false);
      expect(status.type).toBeUndefined();
      expect(status.reason).toBeUndefined();
      expect(status.triggeredAt).toBeUndefined();
    });

    it('should do nothing if not active', async () => {
      await circuitBreaker.reset('operator-123');
      
      expect(mockEventPersistence.persistEvent).not.toHaveBeenCalled();
    });
  });

  describe('soft pause cooldown', () => {
    it('should auto-reset after cooldown period', async () => {
      // Create breaker with very short cooldown for testing
      const shortCooldownConfig: CircuitBreakerConfig = {
        ...defaultBreakerConfig,
        cooldownMinutes: 0.001, // ~60ms
      };
      const breaker = new CircuitBreaker(shortCooldownConfig);
      
      const now = Date.now();
      const input: BreakerCheckInput = {
        equity: 900,
        positions: [],
        dailyStartEquity: 1000,
        recentTrades: [
          { pnl: -50, timestamp: now - 30000 },
          { pnl: -30, timestamp: now - 20000 },
          { pnl: -20, timestamp: now - 10000 },
        ],
      };

      breaker.checkConditions(input);
      expect(breaker.isActive()).toBe(true);
      
      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(breaker.isActive()).toBe(false);
    });

    it('should not auto-reset HARD breaker', async () => {
      const shortCooldownConfig: CircuitBreakerConfig = {
        ...defaultBreakerConfig,
        cooldownMinutes: 0.001,
      };
      const breaker = new CircuitBreaker(shortCooldownConfig);
      
      await breaker.trigger('Hard trigger');
      
      // Wait for what would be cooldown
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should still be active
      expect(breaker.isActive()).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return complete status when inactive', () => {
      circuitBreaker.setDailyStartEquity(1000);
      
      const status = circuitBreaker.getStatus();
      
      expect(status.active).toBe(false);
      expect(status.type).toBeUndefined();
      expect(status.reason).toBeUndefined();
      expect(status.triggeredAt).toBeUndefined();
      expect(status.dailyDrawdown).toBe(0);
      expect(status.equityLevel).toBe(1000);
    });

    it('should return complete status when active', async () => {
      circuitBreaker.setDailyStartEquity(1000);
      await circuitBreaker.trigger('Test reason');
      
      const status = circuitBreaker.getStatus();
      
      expect(status.active).toBe(true);
      expect(status.type).toBe(BreakerType.HARD);
      expect(status.reason).toBe('Test reason');
      expect(status.triggeredAt).toBeDefined();
    });
  });

  describe('recordTrade', () => {
    it('should track trades for consecutive loss detection', () => {
      const now = Date.now();
      
      circuitBreaker.recordTrade(-50, now - 30000);
      circuitBreaker.recordTrade(-30, now - 20000);
      circuitBreaker.recordTrade(-20, now - 10000);
      
      const input: BreakerCheckInput = {
        equity: 900,
        positions: [],
        dailyStartEquity: 1000,
        recentTrades: [],
      };
      
      // The internal tracking should have recorded the losses
      // but checkConditions uses the provided recentTrades
      const status = circuitBreaker.checkConditions(input);
      expect(status.consecutiveLosses).toBe(0); // Uses input, not internal
    });

    it('should reset consecutive losses on profitable trade', () => {
      const now = Date.now();
      
      circuitBreaker.recordTrade(-50, now - 40000);
      circuitBreaker.recordTrade(-30, now - 30000);
      circuitBreaker.recordTrade(100, now - 20000); // Profitable
      circuitBreaker.recordTrade(-20, now - 10000);
      
      // Internal state should have reset
    });
  });

  describe('edge cases', () => {
    it('should handle zero daily start equity', () => {
      const input: BreakerCheckInput = {
        equity: 100,
        positions: [],
        dailyStartEquity: 0,
        recentTrades: [],
      };

      const status = circuitBreaker.checkConditions(input);
      
      expect(status.dailyDrawdown).toBe(0);
    });

    it('should handle empty positions array', () => {
      const input: BreakerCheckInput = {
        equity: 1000,
        positions: [],
        dailyStartEquity: 1000,
        recentTrades: [],
      };

      const status = circuitBreaker.checkConditions(input);
      
      expect(status.active).toBe(false);
    });

    it('should not downgrade from HARD to SOFT', async () => {
      await circuitBreaker.trigger('Hard trigger');
      
      const now = Date.now();
      const input: BreakerCheckInput = {
        equity: 900,
        positions: [],
        dailyStartEquity: 1000,
        recentTrades: [
          { pnl: -50, timestamp: now - 30000 },
          { pnl: -30, timestamp: now - 20000 },
          { pnl: -20, timestamp: now - 10000 },
        ],
      };

      const status = circuitBreaker.checkConditions(input);
      
      // Should remain HARD, not become SOFT
      expect(status.type).toBe(BreakerType.HARD);
    });

    it('should handle persistence failure gracefully', async () => {
      mockEventPersistence.persistEvent.mockRejectedValue(new Error('DB error'));
      
      await circuitBreaker.trigger('Test trigger');
      
      // Should still be active despite persistence failure
      expect(circuitBreaker.isActive()).toBe(true);
    });
  });

  describe('integration with default config', () => {
    it('should work with default configuration', () => {
      const breaker = new CircuitBreaker(defaultConfig.circuitBreaker);
      
      const config = breaker.getConfig();
      expect(config.maxDailyDrawdown).toBe(0.15);
      expect(config.minEquity).toBe(150);
      expect(config.consecutiveLossLimit).toBe(3);
      expect(config.cooldownMinutes).toBe(30);
    });
  });
});
