/**
 * L2Validator Unit Tests
 * 
 * Tests for the L2 Validator with Zero-IO validation.
 * Requirements: 22.1-22.9, 36.1-36.5
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { L2Validator, ASSET_PRESETS } from './L2Validator.js';
import { WebSocketCache } from './WebSocketCache.js';

describe('L2Validator', () => {
  let l2Validator;
  let wsCache;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    
    wsCache = new WebSocketCache({ logger: mockLogger });
    l2Validator = new L2Validator({ 
      wsCache,
      logger: mockLogger,
      minStructureThreshold: 60,
    });
  });

  afterEach(() => {
    if (wsCache) {
      wsCache.disconnect();
      wsCache.clear();
    }
  });

  describe('constructor', () => {
    it('should throw error without wsCache', () => {
      expect(() => new L2Validator({})).toThrow('WebSocketCache instance is required');
    });

    it('should initialize with default values', () => {
      expect(l2Validator.minStructureThreshold).toBe(60);
      expect(l2Validator.maxCacheAgeMs).toBe(100);
    });
  });


  describe('getAssetPreset', () => {
    it('should return crypto preset for USDT pairs', () => {
      const preset = l2Validator.getAssetPreset('BTCUSDT');
      expect(preset).toEqual(ASSET_PRESETS.crypto);
    });

    it('should return crypto preset for BTC pairs', () => {
      const preset = l2Validator.getAssetPreset('ETHBTC');
      expect(preset).toEqual(ASSET_PRESETS.crypto);
    });

    it('should return equity preset by default', () => {
      const preset = l2Validator.getAssetPreset('AAPL');
      expect(preset).toEqual(ASSET_PRESETS.equity);
    });
  });

  describe('applyDynamicThresholds', () => {
    // Requirements: 36.1-36.2 - Dynamic validation threshold adjustment
    it('should relax thresholds by 50% when momentum > 90', () => {
      const preset = { max_spread_pct: 0.1, max_slippage_pct: 0.2 };
      const adjusted = l2Validator.applyDynamicThresholds(preset, 95);
      
      expect(adjusted.max_spread_pct).toBeCloseTo(0.15, 10);
      expect(adjusted.max_slippage_pct).toBeCloseTo(0.3, 10);
    });

    it('should relax thresholds by 25% when momentum > 80', () => {
      const preset = { max_spread_pct: 0.1, max_slippage_pct: 0.2 };
      const adjusted = l2Validator.applyDynamicThresholds(preset, 85);
      
      expect(adjusted.max_spread_pct).toBe(0.125);
      expect(adjusted.max_slippage_pct).toBe(0.25);
    });

    it('should not adjust thresholds when momentum <= 80', () => {
      const preset = { max_spread_pct: 0.1, max_slippage_pct: 0.2 };
      const adjusted = l2Validator.applyDynamicThresholds(preset, 70);
      
      expect(adjusted.max_spread_pct).toBe(0.1);
      expect(adjusted.max_slippage_pct).toBe(0.2);
    });
  });

  describe('checkDepth', () => {
    it('should fail when no orderbook data', () => {
      const result = l2Validator.checkDepth('BTCUSDT', 10000);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('NO_ORDERBOOK_DATA');
    });

    it('should fail when depth is insufficient', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '0.1']],
        asks: [['50001', '0.1']],
      });

      const result = l2Validator.checkDepth('BTCUSDT', 100000);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('INSUFFICIENT_DEPTH');
    });

    it('should pass when depth is sufficient', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '10']],
        asks: [['50001', '10']],
      });

      const result = l2Validator.checkDepth('BTCUSDT', 10000);
      expect(result.valid).toBe(true);
    });
  });

  describe('checkSpread', () => {
    // Requirements: 22.3 - Check spread_pct <= max_spread_pct
    it('should fail when spread exceeds max', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1']],
        asks: [['50100', '1']], // 0.2% spread
      });

      const result = l2Validator.checkSpread('BTCUSDT', 0.1);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('SPREAD_EXCEEDED');
    });

    it('should pass when spread is within limit', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1']],
        asks: [['50010', '1']], // 0.02% spread
      });

      const result = l2Validator.checkSpread('BTCUSDT', 0.1);
      expect(result.valid).toBe(true);
    });
  });

  describe('calculateSlippage', () => {
    // Requirements: 22.4 - Compute expected slippage
    it('should calculate slippage for BUY order', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1']],
        asks: [['50001', '0.5'], ['50010', '0.5'], ['50020', '1']],
      });

      const result = l2Validator.calculateSlippage('BTCUSDT', 'BUY', 1);
      expect(result.slippagePct).toBeGreaterThan(0);
      expect(result.avgPrice).toBeGreaterThan(50001);
      expect(result.levels).toBe(2);
    });

    it('should return Infinity when order cannot be filled', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1']],
        asks: [['50001', '0.1']],
      });

      const result = l2Validator.calculateSlippage('BTCUSDT', 'BUY', 10);
      expect(result.slippagePct).toBe(Infinity);
    });

    it('should return zero slippage for small orders', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '10']],
        asks: [['50001', '10']],
      });

      const result = l2Validator.calculateSlippage('BTCUSDT', 'BUY', 0.1);
      expect(result.slippagePct).toBe(0);
      expect(result.avgPrice).toBe(50001);
    });
  });

  describe('validateOBI', () => {
    // Requirements: 22.5-22.7 - OBI validation
    it('should reject BUY when OBI < 0.5 (heavy sell wall)', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1']],
        asks: [['50001', '10']], // Heavy asks
      });

      const result = l2Validator.validateOBI('BTCUSDT', 'BUY');
      expect(result.valid).toBe(false);
      expect(result.recommendation).toBe('LIMIT');
      expect(result.reason).toContain('HEAVY_SELL_WALL');
    });

    it('should allow MARKET for BUY when OBI > 2.0 (heavy bid support)', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '10']],
        asks: [['50001', '1']], // Light asks
      });

      const result = l2Validator.validateOBI('BTCUSDT', 'BUY');
      expect(result.valid).toBe(true);
      expect(result.recommendation).toBe('MARKET');
    });

    it('should recommend LIMIT for neutral OBI', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '5']],
        asks: [['50001', '5']],
      });

      const result = l2Validator.validateOBI('BTCUSDT', 'BUY');
      expect(result.valid).toBe(true);
      expect(result.recommendation).toBe('LIMIT');
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      // Set up a valid order book
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '100'], ['49999', '100']],
        asks: [['50001', '100'], ['50002', '100']],
      });
    });

    // Requirements: 22.9 - Abort validation and log "STALE_L2_CACHE"
    it('should reject when cache is stale', () => {
      wsCache.isStale = true;

      const result = l2Validator.validate({
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 1,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('STALE_L2_CACHE_DISCONNECTED');
      expect(result.recommendation).toBe('ABORT');
    });

    // Requirements: 22.1 - Check market_structure_score >= threshold
    it('should reject when structure score below threshold', () => {
      const result = l2Validator.validate({
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 1,
        market_structure_score: 50,
      });

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('STRUCTURE_BELOW_THRESHOLD');
    });

    it('should pass full validation with valid params', () => {
      const result = l2Validator.validate({
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        market_structure_score: 80,
        momentum_score: 70,
      });

      expect(result.valid).toBe(true);
      expect(result.details).toBeDefined();
      expect(result.details.checks.cache.valid).toBe(true);
      expect(result.details.checks.spread.valid).toBe(true);
    });

    it('should apply dynamic thresholds based on momentum', () => {
      const result = l2Validator.validate({
        symbol: 'BTCUSDT',
        side: 'BUY',
        size: 0.1,
        market_structure_score: 80,
        momentum_score: 95,
      });

      expect(result.valid).toBe(true);
      expect(result.details.preset.max_spread_pct).toBeGreaterThan(ASSET_PRESETS.crypto.max_spread_pct);
    });
  });

  describe('isCacheValid', () => {
    it('should return false when cache is stale', () => {
      wsCache.isStale = true;
      expect(l2Validator.isCacheValid('BTCUSDT')).toBe(false);
    });

    it('should return true when cache is fresh', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1']],
        asks: [['50001', '1']],
      });
      expect(l2Validator.isCacheValid('BTCUSDT')).toBe(true);
    });
  });

  describe('getMarketConditions', () => {
    it('should return null when cache is invalid', () => {
      wsCache.isStale = true;
      expect(l2Validator.getMarketConditions('BTCUSDT')).toBeNull();
    });

    it('should return market conditions when cache is valid', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1']],
        asks: [['50001', '1']],
      });

      const conditions = l2Validator.getMarketConditions('BTCUSDT');
      expect(conditions).not.toBeNull();
      expect(conditions.symbol).toBe('BTCUSDT');
      expect(conditions.bestBid).toBe(50000);
      expect(conditions.bestAsk).toBe(50001);
      expect(conditions.spread).toBe(1);
    });
  });

  describe('setMinStructureThreshold', () => {
    it('should update threshold', () => {
      l2Validator.setMinStructureThreshold(70);
      expect(l2Validator.minStructureThreshold).toBe(70);
    });
  });

  describe('updateAssetPreset', () => {
    it('should update asset preset', () => {
      l2Validator.updateAssetPreset('crypto', { max_spread_pct: 0.2 });
      expect(l2Validator.assetPresets.crypto.max_spread_pct).toBe(0.2);
    });
  });
});
