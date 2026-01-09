/**
 * OrderManager Tests
 * 
 * Tests for the Fee-Aware Order Manager implementation.
 * Requirements: 67.1-67.7
 */

import { jest } from '@jest/globals';
import { OrderManager, validateOrderParams, isExitSignal, CONFIG } from './OrderManager.js';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('OrderManager', () => {
  let orderManager;

  beforeEach(() => {
    jest.clearAllMocks();
    orderManager = new OrderManager({
      makerFeePct: 0.02,
      takerFeePct: 0.05,
      chaseTimeoutMs: 2000,
      logger: mockLogger,
    });
  });

  describe('constructor', () => {
    it('should use default fee values from config', () => {
      const manager = new OrderManager({});
      expect(manager.makerFeePct).toBe(CONFIG.DEFAULT_MAKER_FEE_PCT);
      expect(manager.takerFeePct).toBe(CONFIG.DEFAULT_TAKER_FEE_PCT);
    });

    it('should use provided fee values', () => {
      const manager = new OrderManager({
        makerFeePct: 0.01,
        takerFeePct: 0.03,
      });
      expect(manager.makerFeePct).toBe(0.01);
      expect(manager.takerFeePct).toBe(0.03);
    });
  });

  describe('validateOrderParams', () => {
    it('should throw if params is null', () => {
      expect(() => validateOrderParams(null)).toThrow('Order parameters are required');
    });

    it('should throw if symbol is missing', () => {
      expect(() => validateOrderParams({ side: 'BUY', size: 1 }))
        .toThrow('symbol is required');
    });

    it('should throw if side is invalid', () => {
      expect(() => validateOrderParams({ symbol: 'BTCUSDT', side: 'INVALID', size: 1 }))
        .toThrow('side must be BUY or SELL');
    });

    it('should throw if size is invalid', () => {
      expect(() => validateOrderParams({ symbol: 'BTCUSDT', side: 'BUY', size: -1 }))
        .toThrow('size must be a positive finite number');
    });

    it('should pass for valid params', () => {
      expect(() => validateOrderParams({
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 1,
      })).not.toThrow();
    });
  });

  describe('isExitSignal', () => {
    it('should return true for CLOSE signals', () => {
      expect(isExitSignal('CLOSE')).toBe(true);
      expect(isExitSignal('CLOSE_LONG')).toBe(true);
      expect(isExitSignal('CLOSE_SHORT')).toBe(true);
    });

    it('should return true for EXIT signals', () => {
      expect(isExitSignal('EXIT')).toBe(true);
    });

    it('should return true for STOP_LOSS and TAKE_PROFIT', () => {
      expect(isExitSignal('STOP_LOSS')).toBe(true);
      expect(isExitSignal('TAKE_PROFIT')).toBe(true);
    });

    it('should return false for entry signals', () => {
      expect(isExitSignal('BUY_SETUP')).toBe(false);
      expect(isExitSignal('SELL_SETUP')).toBe(false);
      expect(isExitSignal('OPEN')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isExitSignal(null)).toBe(false);
      expect(isExitSignal(undefined)).toBe(false);
    });
  });

  describe('analyzeFees', () => {
    it('should calculate profit after fees correctly', () => {
      const analysis = orderManager.analyzeFees(0.5); // 0.5% expected profit
      
      expect(analysis.maker_fee_pct).toBe(0.02);
      expect(analysis.taker_fee_pct).toBe(0.05);
      expect(analysis.expected_profit_pct).toBe(0.5);
      expect(analysis.profit_after_maker).toBeCloseTo(0.48);
      expect(analysis.profit_after_taker).toBeCloseTo(0.45);
      expect(analysis.taker_profitable).toBe(true);
    });

    it('should flag taker as not profitable when profit is too low', () => {
      const analysis = orderManager.analyzeFees(0.05); // 0.05% expected profit
      
      expect(analysis.taker_profitable).toBe(false);
    });
  });

  describe('decideOrderType', () => {
    /**
     * Property 46: Maker order default
     * Requirements: 67.1 - Default to Limit Orders with post_only=true
     */
    it('should default to LIMIT order with post_only=true', () => {
      const decision = orderManager.decideOrderType({
        signal_id: 'test',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 1,
        limit_price: 50000,
      });

      expect(decision.order_type).toBe('LIMIT');
      expect(decision.post_only).toBe(true);
      expect(decision.reason).toBe('DEFAULT_MAKER');
    });

    /**
     * Property 47: Exit order reduce_only invariant
     * Requirements: 67.6 - Always use reduce_only=true for exit orders
     */
    it('should set reduce_only=true for exit signals', () => {
      const exitTypes = ['CLOSE', 'CLOSE_LONG', 'CLOSE_SHORT', 'EXIT', 'STOP_LOSS', 'TAKE_PROFIT'];
      
      for (const signalType of exitTypes) {
        const decision = orderManager.decideOrderType({
          signal_id: 'test',
          symbol: 'BTCUSDT',
          side: 'SELL',
          size: 1,
          limit_price: 50000,
          signal_type: signalType,
        });

        expect(decision.reduce_only).toBe(true);
      }
    });

    it('should set reduce_only=false for entry signals', () => {
      const decision = orderManager.decideOrderType({
        signal_id: 'test',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 1,
        limit_price: 50000,
        signal_type: 'BUY_SETUP',
      });

      expect(decision.reduce_only).toBe(false);
    });

    it('should emit order:decision event', () => {
      const decisionHandler = jest.fn();
      orderManager.on('order:decision', decisionHandler);

      orderManager.decideOrderType({
        signal_id: 'test',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 1,
        limit_price: 50000,
      });

      expect(decisionHandler).toHaveBeenCalled();
    });

    it('should emit order:maker event for maker orders', () => {
      const makerHandler = jest.fn();
      orderManager.on('order:maker', makerHandler);

      orderManager.decideOrderType({
        signal_id: 'test',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 1,
        limit_price: 50000,
      });

      expect(makerHandler).toHaveBeenCalled();
    });
  });

  describe('evaluateTakerConversion', () => {
    it('should return WAIT if chase timeout not reached', () => {
      const result = orderManager.evaluateTakerConversion('test', 0.5, 1000);
      
      expect(result.action).toBe('WAIT');
      expect(result.reason).toContain('Chase timeout not reached');
    });

    it('should return CONVERT_TO_TAKER if profitable after timeout', () => {
      const result = orderManager.evaluateTakerConversion('test', 0.5, 3000);
      
      expect(result.action).toBe('CONVERT_TO_TAKER');
      expect(result.fee_analysis.taker_profitable).toBe(true);
    });

    it('should return CANCEL if not profitable after timeout', () => {
      const result = orderManager.evaluateTakerConversion('test', 0.05, 3000);
      
      expect(result.action).toBe('CANCEL');
      expect(result.reason).toContain('INSUFFICIENT_PROFIT_FOR_TAKER');
    });

    it('should emit order:taker event when converting', () => {
      const takerHandler = jest.fn();
      orderManager.on('order:taker', takerHandler);

      orderManager.evaluateTakerConversion('test', 0.5, 3000);

      expect(takerHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test',
          reason: 'TAKER_PROFITABLE',
        })
      );
    });

    it('should emit order:cancelled event when cancelling', () => {
      const cancelHandler = jest.fn();
      orderManager.on('order:cancelled', cancelHandler);

      orderManager.evaluateTakerConversion('test', 0.05, 3000);

      expect(cancelHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          signal_id: 'test',
          reason: 'INSUFFICIENT_PROFIT_FOR_TAKER',
        })
      );
    });
  });

  describe('buildOrderPayload', () => {
    it('should build correct payload for LIMIT order', () => {
      const params = {
        signal_id: 'test',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
        stop_loss: 49000,
        take_profits: [51000, 52000],
      };

      const decision = {
        order_type: 'LIMIT',
        post_only: true,
        reduce_only: false,
        limit_price: 50000,
      };

      const payload = orderManager.buildOrderPayload(params, decision);

      expect(payload.symbol).toBe('BTCUSDT');
      expect(payload.side).toBe('BUY');
      expect(payload.size).toBe(0.5);
      expect(payload.order_type).toBe('LIMIT');
      expect(payload.limit_price).toBe(50000);
      expect(payload.post_only).toBe(true);
      expect(payload.reduce_only).toBe(false);
      expect(payload.stop_loss).toBe(49000);
      expect(payload.take_profits).toEqual([51000, 52000]);
      expect(payload.client_order_id).toContain('titan_test_');
    });

    it('should not include limit_price for MARKET orders', () => {
      const params = {
        signal_id: 'test',
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.5,
      };

      const decision = {
        order_type: 'MARKET',
        post_only: false,
        reduce_only: false,
      };

      const payload = orderManager.buildOrderPayload(params, decision);

      expect(payload.order_type).toBe('MARKET');
      expect(payload.limit_price).toBeUndefined();
    });
  });

  describe('updateFees', () => {
    it('should update fee configuration', () => {
      orderManager.updateFees(0.01, 0.03);
      
      const config = orderManager.getFeeConfig();
      expect(config.maker_fee_pct).toBe(0.01);
      expect(config.taker_fee_pct).toBe(0.03);
    });
  });

  describe('getFeeConfig', () => {
    it('should return current fee configuration', () => {
      const config = orderManager.getFeeConfig();
      
      expect(config).toHaveProperty('maker_fee_pct');
      expect(config).toHaveProperty('taker_fee_pct');
      expect(config).toHaveProperty('chase_timeout_ms');
      expect(config).toHaveProperty('min_profit_margin');
    });
  });
});
