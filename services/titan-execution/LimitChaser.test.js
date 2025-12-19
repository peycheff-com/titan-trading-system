/**
 * LimitChaser Tests
 * 
 * Tests for the Limit Chaser algorithm implementation.
 * Requirements: 13.7-13.8, 79.1-79.6
 */

import { jest } from '@jest/globals';
import { 
  LimitChaser, 
  CONFIG, 
  validateChaseParams,
  getDefaultAlphaHalfLife,
  calculateRemainingAlpha,
  applyUrgencyExtension,
  isOBIWorsening,
} from './LimitChaser.js';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock WebSocketCache
function createMockWsCache(options = {}) {
  return {
    getBestBid: jest.fn().mockReturnValue(options.bestBid ?? 50000),
    getBestAsk: jest.fn().mockReturnValue(options.bestAsk ?? 50010),
    getSpread: jest.fn().mockReturnValue(options.spread ?? 10),
    getSpreadPct: jest.fn().mockReturnValue(options.spreadPct ?? 0.02),
    calculateOBI: jest.fn().mockReturnValue(options.obi ?? 1.0),
    getCacheAge: jest.fn().mockReturnValue(options.cacheAge ?? 50),
  };
}

// Mock BrokerGateway
function createMockBrokerGateway(options = {}) {
  let orderCount = 0;
  const fillOnTick = options.fillOnTick ?? 0; // Fill immediately by default
  
  return {
    sendOrder: jest.fn().mockImplementation(async (signalId, params) => {
      orderCount++;
      const shouldFill = orderCount > fillOnTick;
      
      if (options.failOrder) {
        throw new Error('Order failed');
      }
      
      return {
        success: true,
        broker_order_id: `BROKER_${orderCount}`,
        fill_price: shouldFill ? params.limit_price : null,
        fill_size: shouldFill ? params.size : 0,
        filled: shouldFill,
        status: shouldFill ? 'FILLED' : 'NEW',
      };
    }),
    cancelOrder: jest.fn().mockResolvedValue({ success: true }),
    _resetOrderCount: () => { orderCount = 0; },
  };
}

describe('LimitChaser', () => {
  let limitChaser;
  let mockWsCache;
  let mockBrokerGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWsCache = createMockWsCache();
    mockBrokerGateway = createMockBrokerGateway();
    
    limitChaser = new LimitChaser({
      wsCache: mockWsCache,
      brokerGateway: mockBrokerGateway,
      logger: mockLogger,
      chaseIntervalMs: 10, // Fast for testing
      maxChaseTimeMs: 100,
    });
  });

  afterEach(() => {
    if (limitChaser) {
      limitChaser.destroy();
    }
  });

  describe('constructor', () => {
    it('should throw if wsCache is not provided', () => {
      expect(() => new LimitChaser({ brokerGateway: mockBrokerGateway }))
        .toThrow('WebSocketCache instance is required');
    });

    it('should throw if brokerGateway is not provided', () => {
      expect(() => new LimitChaser({ wsCache: mockWsCache }))
        .toThrow('BrokerGateway instance is required');
    });

    it('should use default config values', () => {
      const chaser = new LimitChaser({
        wsCache: mockWsCache,
        brokerGateway: mockBrokerGateway,
      });
      
      expect(chaser.chaseIntervalMs).toBe(CONFIG.CHASE_INTERVAL_MS);
      expect(chaser.maxChaseTimeMs).toBe(CONFIG.MAX_CHASE_TIME_MS);
      expect(chaser.maxChaseTicks).toBe(CONFIG.MAX_CHASE_TICKS);
      
      chaser.destroy();
    });
  });

  describe('validateChaseParams', () => {
    it('should throw if params is null', () => {
      expect(() => validateChaseParams(null)).toThrow('Chase parameters are required');
    });

    it('should throw if signal_id is missing', () => {
      expect(() => validateChaseParams({ symbol: 'BTCUSDT', side: 'BUY', size: 1 }))
        .toThrow('signal_id is required');
    });

    it('should throw if symbol is missing', () => {
      expect(() => validateChaseParams({ signal_id: 'test', side: 'BUY', size: 1 }))
        .toThrow('symbol is required');
    });

    it('should throw if side is invalid', () => {
      expect(() => validateChaseParams({ signal_id: 'test', symbol: 'BTCUSDT', side: 'INVALID', size: 1 }))
        .toThrow('side must be BUY or SELL');
    });

    it('should throw if size is invalid', () => {
      expect(() => validateChaseParams({ signal_id: 'test', symbol: 'BTCUSDT', side: 'BUY', size: -1 }))
        .toThrow('size must be a positive finite number');
    });

    it('should pass for valid params', () => {
      expect(() => validateChaseParams({
        signal_id: 'test',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 1,
      })).not.toThrow();
    });
  });

  describe('getInitialPrice', () => {
    it('should return best ask for BUY orders', () => {
      const price = limitChaser.getInitialPrice('BTCUSDT', 'BUY');
      expect(price).toBe(50010);
      expect(mockWsCache.getBestAsk).toHaveBeenCalledWith('BTCUSDT');
    });

    it('should return best bid for SELL orders', () => {
      const price = limitChaser.getInitialPrice('BTCUSDT', 'SELL');
      expect(price).toBe(50000);
      expect(mockWsCache.getBestBid).toHaveBeenCalledWith('BTCUSDT');
    });
  });

  describe('getNextChasePrice', () => {
    it('should increase price for BUY orders', () => {
      const nextPrice = limitChaser.getNextChasePrice(50010, 'BUY', 0.1);
      expect(nextPrice).toBe(50010.1);
    });

    it('should decrease price for SELL orders', () => {
      const nextPrice = limitChaser.getNextChasePrice(50000, 'SELL', 0.1);
      expect(nextPrice).toBe(49999.9);
    });
  });

  describe('chase', () => {
    it('should fill immediately when order is filled on first try', async () => {
      const result = await limitChaser.chase({
        signal_id: 'test_signal',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
      });

      expect(result.success).toBe(true);
      expect(result.reason).toBe('FILLED');
      expect(result.chase_ticks).toBe(0);
      expect(mockBrokerGateway.sendOrder).toHaveBeenCalled();
    });

    it('should chase and fill after multiple ticks', async () => {
      // Reset and create gateway that fills on 3rd tick
      mockBrokerGateway = createMockBrokerGateway({ fillOnTick: 2 });
      limitChaser = new LimitChaser({
        wsCache: mockWsCache,
        brokerGateway: mockBrokerGateway,
        logger: mockLogger,
        chaseIntervalMs: 5,
        maxChaseTimeMs: 500,
      });

      const result = await limitChaser.chase({
        signal_id: 'test_signal',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
      });

      expect(result.success).toBe(true);
      expect(result.reason).toBe('FILLED');
      expect(result.chase_ticks).toBeGreaterThan(0);
    });

    it('should timeout after maxChaseTimeMs', async () => {
      // Create gateway that never fills
      mockBrokerGateway = createMockBrokerGateway({ fillOnTick: 1000 });
      limitChaser = new LimitChaser({
        wsCache: mockWsCache,
        brokerGateway: mockBrokerGateway,
        logger: mockLogger,
        chaseIntervalMs: 20,
        maxChaseTimeMs: 50,
      });

      const result = await limitChaser.chase({
        signal_id: 'test_signal',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('FILL_TIMEOUT');
      expect(result.market_conditions).toBeDefined();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ signal_id: 'test_signal' }),
        expect.stringContaining('FILL_TIMEOUT')
      );
    });

    it('should return NO_PRICE_DATA when cache has no price', async () => {
      mockWsCache.getBestAsk.mockReturnValue(null);
      
      const result = await limitChaser.chase({
        signal_id: 'test_signal',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('NO_PRICE_DATA');
    });

    it('should emit chase:start event', async () => {
      const startHandler = jest.fn();
      limitChaser.on('chase:start', startHandler);

      await limitChaser.chase({
        signal_id: 'test_signal',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
      });

      expect(startHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test_signal',
          symbol: 'BTCUSDT',
          side: 'BUY',
        })
      );
    });

    it('should emit chase:filled event on success', async () => {
      const filledHandler = jest.fn();
      limitChaser.on('chase:filled', filledHandler);

      await limitChaser.chase({
        signal_id: 'test_signal',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
      });

      expect(filledHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test_signal',
          symbol: 'BTCUSDT',
        })
      );
    });

    it('should pass reduce_only and post_only to broker', async () => {
      await limitChaser.chase({
        signal_id: 'test_signal',
        symbol: 'BTCUSDT',
        side: 'SELL',
        size: 0.5,
        reduce_only: true,
        post_only: true,
      });

      expect(mockBrokerGateway.sendOrder).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          reduce_only: true,
          post_only: true,
        })
      );
    });
  });

  describe('cancelChase', () => {
    it('should cancel an active chase', async () => {
      // Start a chase that won't fill immediately
      mockBrokerGateway = createMockBrokerGateway({ fillOnTick: 1000 });
      limitChaser = new LimitChaser({
        wsCache: mockWsCache,
        brokerGateway: mockBrokerGateway,
        logger: mockLogger,
        chaseIntervalMs: 100,
        maxChaseTimeMs: 5000,
      });

      // Start chase without awaiting
      const chasePromise = limitChaser.chase({
        signal_id: 'test_signal',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
      });

      // Wait a bit then cancel
      await new Promise(resolve => setTimeout(resolve, 50));
      const cancelled = limitChaser.cancelChase('test_signal');
      
      expect(cancelled).toBe(true);
      expect(limitChaser.getActiveChases().size).toBe(0);
    });

    it('should return false for non-existent chase', () => {
      const cancelled = limitChaser.cancelChase('non_existent');
      expect(cancelled).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = limitChaser.getStatus();
      
      expect(status).toHaveProperty('active_chases');
      expect(status).toHaveProperty('chase_interval_ms');
      expect(status).toHaveProperty('max_chase_time_ms');
      expect(status).toHaveProperty('max_chase_ticks');
    });
  });

  describe('Alpha Decay - Requirements 79.1-79.6', () => {
    describe('getDefaultAlphaHalfLife', () => {
      it('should return 10s for scalp signals', () => {
        expect(getDefaultAlphaHalfLife('scalp')).toBe(10000);
        expect(getDefaultAlphaHalfLife('SCALP')).toBe(10000);
      });

      it('should return 30s for day signals', () => {
        expect(getDefaultAlphaHalfLife('day')).toBe(30000);
        expect(getDefaultAlphaHalfLife('DAY')).toBe(30000);
      });

      it('should return 120s for swing signals', () => {
        expect(getDefaultAlphaHalfLife('swing')).toBe(120000);
        expect(getDefaultAlphaHalfLife('SWING')).toBe(120000);
      });

      it('should default to day for unknown signal types', () => {
        expect(getDefaultAlphaHalfLife('unknown')).toBe(30000);
        expect(getDefaultAlphaHalfLife('')).toBe(30000);
        expect(getDefaultAlphaHalfLife(null)).toBe(30000);
      });
    });

    describe('calculateRemainingAlpha', () => {
      it('should return 1.0 at time 0', () => {
        const alpha = calculateRemainingAlpha(0, 10000, 1.0);
        expect(alpha).toBe(1.0);
      });

      it('should return 0.5 at exactly half-life', () => {
        const alpha = calculateRemainingAlpha(10000, 10000, 1.0);
        expect(alpha).toBeCloseTo(0.5, 5);
      });

      it('should return 0.25 at 2x half-life', () => {
        const alpha = calculateRemainingAlpha(20000, 10000, 1.0);
        expect(alpha).toBeCloseTo(0.25, 5);
      });

      it('should return initial alpha when half-life is 0', () => {
        const alpha = calculateRemainingAlpha(10000, 0, 1.0);
        expect(alpha).toBe(1.0);
      });

      it('should work with different initial alpha values', () => {
        const alpha = calculateRemainingAlpha(10000, 10000, 0.8);
        expect(alpha).toBeCloseTo(0.4, 5);
      });
    });

    describe('applyUrgencyExtension', () => {
      it('should extend half-life by 50% when urgency > 95', () => {
        const extended = applyUrgencyExtension(10000, 96);
        expect(extended).toBe(15000);
      });

      it('should not extend when urgency <= 95', () => {
        expect(applyUrgencyExtension(10000, 95)).toBe(10000);
        expect(applyUrgencyExtension(10000, 90)).toBe(10000);
        expect(applyUrgencyExtension(10000, 50)).toBe(10000);
      });

      it('should handle edge case at threshold', () => {
        // Values > 95 should extend
        expect(applyUrgencyExtension(10000, 95.1)).toBe(15000);
        expect(applyUrgencyExtension(10000, 95.9)).toBe(15000);
        // Exactly 95 should not extend
        expect(applyUrgencyExtension(10000, 95)).toBe(10000);
      });
    });

    describe('isOBIWorsening', () => {
      it('should detect worsening for BUY orders (OBI decreasing)', () => {
        expect(isOBIWorsening(0.8, 1.0, 'BUY')).toBe(true);
        expect(isOBIWorsening(0.5, 0.9, 'BUY')).toBe(true);
      });

      it('should detect improving for BUY orders (OBI increasing)', () => {
        expect(isOBIWorsening(1.2, 1.0, 'BUY')).toBe(false);
        expect(isOBIWorsening(0.9, 0.5, 'BUY')).toBe(false);
      });

      it('should detect worsening for SELL orders (OBI increasing)', () => {
        expect(isOBIWorsening(1.2, 1.0, 'SELL')).toBe(true);
        expect(isOBIWorsening(0.9, 0.5, 'SELL')).toBe(true);
      });

      it('should detect improving for SELL orders (OBI decreasing)', () => {
        expect(isOBIWorsening(0.8, 1.0, 'SELL')).toBe(false);
        expect(isOBIWorsening(0.5, 0.9, 'SELL')).toBe(false);
      });

      it('should return false when OBI is null', () => {
        expect(isOBIWorsening(null, 1.0, 'BUY')).toBe(false);
        expect(isOBIWorsening(1.0, null, 'BUY')).toBe(false);
        expect(isOBIWorsening(null, null, 'BUY')).toBe(false);
      });
    });

    describe('chase with alpha decay', () => {
      it('should cancel when alpha decays below threshold', async () => {
        // Create gateway that never fills
        mockBrokerGateway = createMockBrokerGateway({ fillOnTick: 1000 });
        limitChaser = new LimitChaser({
          wsCache: mockWsCache,
          brokerGateway: mockBrokerGateway,
          logger: mockLogger,
          chaseIntervalMs: 10,
          maxChaseTimeMs: 5000,
          maxChaseTicks: 100, // High enough to not hit max ticks first
        });

        const result = await limitChaser.chase({
          signal_id: 'test_signal',
          symbol: 'BTCUSDT',
          side: 'BUY',
          size: 0.5,
          alpha_half_life_ms: 50, // Very short half-life for testing
          min_alpha_threshold: 0.3,
        });

        expect(result.success).toBe(false);
        expect(result.reason).toBe('ALPHA_EXPIRED');
        expect(result.remaining_alpha).toBeDefined();
        expect(result.remaining_alpha).toBeLessThan(0.3);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ 
            signal_id: 'test_signal',
            remaining_alpha: expect.any(Number),
          }),
          expect.stringContaining('ALPHA_EXPIRED')
        );
      });

      it('should use default half-life based on signal type', async () => {
        mockBrokerGateway = createMockBrokerGateway({ fillOnTick: 0 }); // Fill immediately
        limitChaser = new LimitChaser({
          wsCache: mockWsCache,
          brokerGateway: mockBrokerGateway,
          logger: mockLogger,
          chaseIntervalMs: 10,
          maxChaseTimeMs: 5000,
        });

        await limitChaser.chase({
          signal_id: 'test_signal',
          symbol: 'BTCUSDT',
          side: 'BUY',
          size: 0.5,
          signal_type: 'scalp', // 10s default
          min_alpha_threshold: 0.3,
        });

        // Verify the half-life was set correctly in the log
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            alpha_half_life_ms: 10000,
          }),
          expect.stringContaining('Starting Limit Chaser')
        );
      });

      it('should extend alpha half-life when urgency_score > 95', async () => {
        mockBrokerGateway = createMockBrokerGateway({ fillOnTick: 1000 });
        limitChaser = new LimitChaser({
          wsCache: mockWsCache,
          brokerGateway: mockBrokerGateway,
          logger: mockLogger,
          chaseIntervalMs: 10,
          maxChaseTimeMs: 5000,
        });

        const result = await limitChaser.chase({
          signal_id: 'test_signal',
          symbol: 'BTCUSDT',
          side: 'BUY',
          size: 0.5,
          alpha_half_life_ms: 100,
          urgency_score: 96, // Should extend to 150ms
          min_alpha_threshold: 0.3,
        });

        expect(result.success).toBe(false);
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            alpha_half_life_ms: 150, // Extended by 50%
            urgency_score: 96,
          }),
          expect.stringContaining('Starting Limit Chaser')
        );
      });

      it('should cancel immediately when OBI worsens', async () => {
        // Create mock that returns worsening OBI
        let obiCallCount = 0;
        mockWsCache.calculateOBI.mockImplementation(() => {
          obiCallCount++;
          // Start at 1.0, then drop to 0.5 (worsening for BUY)
          return obiCallCount === 1 ? 1.0 : 0.5;
        });

        mockBrokerGateway = createMockBrokerGateway({ fillOnTick: 1000 });
        limitChaser = new LimitChaser({
          wsCache: mockWsCache,
          brokerGateway: mockBrokerGateway,
          logger: mockLogger,
          chaseIntervalMs: 10,
          maxChaseTimeMs: 5000,
        });

        const result = await limitChaser.chase({
          signal_id: 'test_signal',
          symbol: 'BTCUSDT',
          side: 'BUY',
          size: 0.5,
          alpha_half_life_ms: 10000, // Long half-life
          min_alpha_threshold: 0.3,
        });

        expect(result.success).toBe(false);
        expect(result.reason).toBe('OBI_WORSENING');
        expect(result.obi_trend).toBeLessThan(0); // Negative trend
        expect(mockLogger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            signal_id: 'test_signal',
            obi_trend: expect.any(Number),
          }),
          expect.stringContaining('OBI worsening')
        );
      });

      it('should emit chase:alpha_expired event', async () => {
        const alphaExpiredHandler = jest.fn();
        
        mockBrokerGateway = createMockBrokerGateway({ fillOnTick: 1000 });
        limitChaser = new LimitChaser({
          wsCache: mockWsCache,
          brokerGateway: mockBrokerGateway,
          logger: mockLogger,
          chaseIntervalMs: 10,
          maxChaseTimeMs: 5000,
          maxChaseTicks: 100, // High enough to not hit max ticks first
        });
        
        limitChaser.on('chase:alpha_expired', alphaExpiredHandler);

        await limitChaser.chase({
          signal_id: 'test_signal',
          symbol: 'BTCUSDT',
          side: 'BUY',
          size: 0.5,
          alpha_half_life_ms: 50,
          min_alpha_threshold: 0.3,
        });

        expect(alphaExpiredHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            signal_id: 'test_signal',
            remaining_alpha: expect.any(Number),
          })
        );
      });

      it('should emit chase:obi_worsening event', async () => {
        const obiWorseningHandler = jest.fn();
        
        let obiCallCount = 0;
        mockWsCache.calculateOBI.mockImplementation(() => {
          obiCallCount++;
          return obiCallCount === 1 ? 1.0 : 0.5;
        });

        mockBrokerGateway = createMockBrokerGateway({ fillOnTick: 1000 });
        limitChaser = new LimitChaser({
          wsCache: mockWsCache,
          brokerGateway: mockBrokerGateway,
          logger: mockLogger,
          chaseIntervalMs: 10,
          maxChaseTimeMs: 5000,
        });
        
        limitChaser.on('chase:obi_worsening', obiWorseningHandler);

        await limitChaser.chase({
          signal_id: 'test_signal',
          symbol: 'BTCUSDT',
          side: 'BUY',
          size: 0.5,
          alpha_half_life_ms: 10000,
        });

        expect(obiWorseningHandler).toHaveBeenCalledWith(
          expect.objectContaining({
            signal_id: 'test_signal',
            obi_trend: expect.any(Number),
          })
        );
      });
    });
  });
});
