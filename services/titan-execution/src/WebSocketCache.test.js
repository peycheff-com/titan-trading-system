/**
 * WebSocketCache Unit Tests
 * 
 * Tests for the WebSocket Order Book Cache.
 * Requirements: 56.1-56.6
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WebSocketCache } from './WebSocketCache.js';

describe('WebSocketCache', () => {
  let wsCache;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    wsCache = new WebSocketCache({ 
      logger: mockLogger,
      maxCacheAgeMs: 100,
    });
  });

  afterEach(() => {
    if (wsCache) {
      wsCache.disconnect();
      wsCache.clear();
    }
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const cache = new WebSocketCache();
      expect(cache.maxCacheAgeMs).toBe(100);
      expect(cache.isStale).toBe(true);
      expect(cache.cache.size).toBe(0);
      cache.disconnect();
    });

    it('should accept custom configuration', () => {
      const cache = new WebSocketCache({
        wsUrl: 'wss://test.example.com',
        symbols: ['BTCUSDT', 'ETHUSDT'],
        maxCacheAgeMs: 200,
        depth: 50,
      });
      expect(cache.wsUrl).toBe('wss://test.example.com');
      expect(cache.symbols).toEqual(['BTCUSDT', 'ETHUSDT']);
      expect(cache.maxCacheAgeMs).toBe(200);
      expect(cache.depth).toBe(50);
      cache.disconnect();
    });
  });

  describe('injectMockData', () => {
    it('should inject mock order book data', () => {
      const mockOrderbook = {
        bids: [['50000', '1.5'], ['49999', '2.0']],
        asks: [['50001', '1.0'], ['50002', '1.5']],
      };

      wsCache.injectMockData('BTCUSDT', mockOrderbook);

      const orderbook = wsCache.getOrderbook('BTCUSDT');
      expect(orderbook).toBeDefined();
      expect(orderbook.symbol).toBe('BTCUSDT');
      expect(orderbook.bids.length).toBe(2);
      expect(orderbook.asks.length).toBe(2);
    });

    it('should mark cache as not stale after injection', () => {
      expect(wsCache.isStale).toBe(true);
      
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.5']],
        asks: [['50001', '1.0']],
      });

      expect(wsCache.isStale).toBe(false);
    });
  });

  describe('getOrderbook', () => {
    it('should return null for uncached symbol', () => {
      expect(wsCache.getOrderbook('UNKNOWN')).toBeNull();
    });

    it('should return order book for cached symbol', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.5']],
        asks: [['50001', '1.0']],
      });

      const orderbook = wsCache.getOrderbook('BTCUSDT');
      expect(orderbook).not.toBeNull();
      expect(orderbook.symbol).toBe('BTCUSDT');
    });
  });

  describe('getBestBid / getBestAsk', () => {
    beforeEach(() => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.5'], ['49999', '2.0']],
        asks: [['50001', '1.0'], ['50002', '1.5']],
      });
    });

    it('should return best bid price', () => {
      expect(wsCache.getBestBid('BTCUSDT')).toBe(50000);
    });

    it('should return best ask price', () => {
      expect(wsCache.getBestAsk('BTCUSDT')).toBe(50001);
    });

    it('should return null for uncached symbol', () => {
      expect(wsCache.getBestBid('UNKNOWN')).toBeNull();
      expect(wsCache.getBestAsk('UNKNOWN')).toBeNull();
    });
  });

  describe('getSpread / getSpreadPct', () => {
    beforeEach(() => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.5']],
        asks: [['50010', '1.0']],
      });
    });

    it('should calculate spread correctly', () => {
      expect(wsCache.getSpread('BTCUSDT')).toBe(10);
    });

    it('should calculate spread percentage correctly', () => {
      const spreadPct = wsCache.getSpreadPct('BTCUSDT');
      expect(spreadPct).toBeCloseTo(0.02, 4); // 10/50000 * 100 = 0.02%
    });

    it('should return null for uncached symbol', () => {
      expect(wsCache.getSpread('UNKNOWN')).toBeNull();
      expect(wsCache.getSpreadPct('UNKNOWN')).toBeNull();
    });
  });

  describe('calculateOBI', () => {
    it('should calculate OBI correctly with balanced book', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.0'], ['49999', '1.0']],
        asks: [['50001', '1.0'], ['50002', '1.0']],
      });

      const obi = wsCache.calculateOBI('BTCUSDT');
      expect(obi).toBeCloseTo(1.0, 1);
    });

    it('should calculate OBI correctly with heavy bids', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '10.0'], ['49999', '10.0']],
        asks: [['50001', '1.0'], ['50002', '1.0']],
      });

      const obi = wsCache.calculateOBI('BTCUSDT');
      expect(obi).toBeGreaterThan(1.0);
    });

    it('should calculate OBI correctly with heavy asks', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.0'], ['49999', '1.0']],
        asks: [['50001', '10.0'], ['50002', '10.0']],
      });

      const obi = wsCache.calculateOBI('BTCUSDT');
      expect(obi).toBeLessThan(1.0);
    });

    it('should return null for uncached symbol', () => {
      expect(wsCache.calculateOBI('UNKNOWN')).toBeNull();
    });
  });

  describe('getCacheAge', () => {
    it('should return Infinity for uncached symbol', () => {
      expect(wsCache.getCacheAge('UNKNOWN')).toBe(Infinity);
    });

    it('should return age in milliseconds', async () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.0']],
        asks: [['50001', '1.0']],
      });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const age = wsCache.getCacheAge('BTCUSDT');
      expect(age).toBeGreaterThanOrEqual(10);
      expect(age).toBeLessThan(1000);
    });
  });

  describe('isCacheStale', () => {
    it('should return true when globally stale', () => {
      wsCache.isStale = true;
      expect(wsCache.isCacheStale('BTCUSDT')).toBe(true);
    });

    it('should return true for uncached symbol', () => {
      wsCache.isStale = false;
      expect(wsCache.isCacheStale('UNKNOWN')).toBe(true);
    });

    it('should return false for fresh cache', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.0']],
        asks: [['50001', '1.0']],
      });

      expect(wsCache.isCacheStale('BTCUSDT')).toBe(false);
    });

    it('should return true when cache exceeds max age', async () => {
      wsCache.maxCacheAgeMs = 10;
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.0']],
        asks: [['50001', '1.0']],
      });

      // Wait for cache to become stale
      await new Promise(resolve => setTimeout(resolve, 20));

      expect(wsCache.isCacheStale('BTCUSDT')).toBe(true);
    });
  });

  describe('validateCacheForSymbol', () => {
    // Requirements: 56.4 - Mark cache as stale and reject all validations until reconnected
    it('should reject when globally stale', () => {
      wsCache.isStale = true;
      const result = wsCache.validateCacheForSymbol('BTCUSDT');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('STALE_L2_CACHE_DISCONNECTED');
    });

    it('should reject when symbol not cached', () => {
      wsCache.isStale = false;
      const result = wsCache.validateCacheForSymbol('UNKNOWN');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('SYMBOL_NOT_CACHED');
    });

    // Requirements: 56.5 - Flag cache as potentially stale if age exceeds 100ms
    it('should reject when cache age exceeds max', async () => {
      wsCache.maxCacheAgeMs = 10;
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.0']],
        asks: [['50001', '1.0']],
      });

      await new Promise(resolve => setTimeout(resolve, 20));

      const result = wsCache.validateCacheForSymbol('BTCUSDT');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('STALE_L2_CACHE');
    });

    it('should pass for fresh cache', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.0']],
        asks: [['50001', '1.0']],
      });

      const result = wsCache.validateCacheForSymbol('BTCUSDT');
      expect(result.valid).toBe(true);
    });
  });

  describe('addSymbol / removeSymbol', () => {
    it('should add symbol to subscription list', () => {
      wsCache.addSymbol('ETHUSDT');
      expect(wsCache.symbols).toContain('ETHUSDT');
    });

    it('should not add duplicate symbols', () => {
      wsCache.addSymbol('ETHUSDT');
      wsCache.addSymbol('ETHUSDT');
      expect(wsCache.symbols.filter(s => s === 'ETHUSDT').length).toBe(1);
    });

    it('should remove symbol from subscription list', () => {
      wsCache.symbols = ['BTCUSDT', 'ETHUSDT'];
      wsCache.removeSymbol('ETHUSDT');
      expect(wsCache.symbols).not.toContain('ETHUSDT');
    });

    it('should remove symbol from cache', () => {
      wsCache.injectMockData('ETHUSDT', {
        bids: [['3000', '1.0']],
        asks: [['3001', '1.0']],
      });
      wsCache.symbols = ['ETHUSDT'];
      
      wsCache.removeSymbol('ETHUSDT');
      
      expect(wsCache.getOrderbook('ETHUSDT')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.0'], ['49999', '2.0']],
        asks: [['50001', '1.0']],
      });

      const stats = wsCache.getStats();
      
      expect(stats.connected).toBe(false);
      expect(stats.isStale).toBe(false);
      expect(stats.symbolCount).toBe(1);
      expect(stats.symbols.BTCUSDT).toBeDefined();
      expect(stats.symbols.BTCUSDT.bidLevels).toBe(2);
      expect(stats.symbols.BTCUSDT.askLevels).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all cached data', () => {
      wsCache.injectMockData('BTCUSDT', {
        bids: [['50000', '1.0']],
        asks: [['50001', '1.0']],
      });

      wsCache.clear();

      expect(wsCache.cache.size).toBe(0);
      expect(wsCache.isStale).toBe(true);
    });
  });
});
