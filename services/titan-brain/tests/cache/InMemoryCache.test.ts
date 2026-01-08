/**
 * Unit tests for InMemoryCache
 */

import { InMemoryCache } from '../../src/cache/InMemoryCache';

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache(5, 1000); // Max 5 items, 1 second TTL
    cache.initialize();
  });

  afterEach(() => {
    cache.shutdown();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      
      expect(cache.get('key1')).toBe('value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.size()).toBe(1);
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('missing')).toBeUndefined();
      expect(cache.has('missing')).toBe(false);
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.has('key1')).toBe(false);
      expect(cache.size()).toBe(0);
    });

    it('should return false when deleting non-existent key', () => {
      expect(cache.delete('missing')).toBe(false);
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      cache.clear();
      
      expect(cache.size()).toBe(0);
      expect(cache.isEmpty()).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('TTL functionality', () => {
    it('should expire values after TTL', (done) => {
      cache.set('key1', 'value1', 100); // 100ms TTL
      
      expect(cache.get('key1')).toBe('value1');
      
      setTimeout(() => {
        expect(cache.get('key1')).toBeUndefined();
        expect(cache.has('key1')).toBe(false);
        done();
      }, 150);
    });

    it('should use default TTL when not specified', () => {
      cache.set('key1', 'value1'); // Uses default 1000ms TTL
      
      expect(cache.get('key1')).toBe('value1');
      
      // Should still be available after a short time
      setTimeout(() => {
        expect(cache.get('key1')).toBe('value1');
      }, 100);
    });

    it('should update TTL for existing entries', () => {
      cache.set('key1', 'value1', 100);
      
      expect(cache.updateTTL('key1', 2000)).toBe(true);
      expect(cache.getTTL('key1')).toBeGreaterThan(1900);
    });

    it('should return false when updating TTL for non-existent key', () => {
      expect(cache.updateTTL('missing', 1000)).toBe(false);
    });

    it('should return null TTL for non-existent key', () => {
      expect(cache.getTTL('missing')).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used items when full', () => {
      // Fill cache to capacity with some delay to ensure different access times
      for (let i = 1; i <= 5; i++) {
        cache.set(`key${i}`, `value${i}`);
        // Small delay to ensure different lastAccessed times
        if (i < 5) {
          const start = Date.now();
          while (Date.now() - start < 1) {} // 1ms delay
        }
      }
      
      expect(cache.size()).toBe(5);
      expect(cache.isFull()).toBe(true);
      
      // Access key5 to make it recently used (it was the last one added)
      cache.get('key5');
      
      // Add new item, should evict key1 (least recently used)
      cache.set('key6', 'value6');
      
      expect(cache.size()).toBe(5);
      expect(cache.get('key1')).toBeUndefined(); // Should be evicted (oldest)
      expect(cache.get('key5')).toBe('value5'); // Should still exist (recently accessed)
      expect(cache.get('key6')).toBe('value6'); // Should exist (just added)
    });

    it('should evict multiple items when needed', () => {
      const largeCache = new InMemoryCache(10, 1000);
      largeCache.initialize();
      
      // Fill cache
      for (let i = 1; i <= 10; i++) {
        largeCache.set(`key${i}`, `value${i}`);
      }
      
      expect(largeCache.size()).toBe(10);
      
      // Add new item, should evict 10% (1 item minimum)
      largeCache.set('key11', 'value11');
      
      expect(largeCache.size()).toBe(10); // Should still be at capacity
      expect(largeCache.get('key11')).toBe('value11');
      
      largeCache.shutdown();
    });
  });

  describe('multiple operations', () => {
    it('should get multiple values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      const result = cache.getMultiple(['key1', 'key2', 'missing']);
      
      expect(result.size).toBe(2);
      expect(result.get('key1')).toBe('value1');
      expect(result.get('key2')).toBe('value2');
      expect(result.has('missing')).toBe(false);
    });

    it('should set multiple values', () => {
      const entries = new Map([
        ['key1', 'value1'],
        ['key2', 'value2'],
        ['key3', 'value3']
      ]);
      
      cache.setMultiple(entries, 500);
      
      expect(cache.size()).toBe(3);
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
    });

    it('should delete multiple values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      const deletedCount = cache.deleteMultiple(['key1', 'key3', 'missing']);
      
      expect(deletedCount).toBe(2);
      expect(cache.size()).toBe(1);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBeUndefined();
    });
  });

  describe('statistics and monitoring', () => {
    it('should track hit and miss statistics', () => {
      cache.set('key1', 'value1');
      
      // Generate hits
      cache.get('key1');
      cache.get('key1');
      
      // Generate misses
      cache.get('missing1');
      cache.get('missing2');
      
      const stats = cache.getStats();
      
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(50); // 2 hits out of 4 total requests
    });

    it('should provide cache statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      
      const stats = cache.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.hitRate).toBeGreaterThanOrEqual(0);
    });

    it('should get expiring entries', (done) => {
      cache.set('key1', 'value1', 200); // Expires in 200ms
      cache.set('key2', 'value2', 2000); // Expires in 2s
      
      setTimeout(() => {
        const expiring = cache.getExpiringEntries(300); // Within 300ms
        
        expect(expiring.length).toBe(1);
        expect(expiring[0].key).toBe('key1');
        expect(expiring[0].timeLeft).toBeLessThan(200);
        done();
      }, 50);
    });

    it('should get most accessed entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      
      // Access key2 multiple times
      cache.get('key2');
      cache.get('key2');
      cache.get('key2');
      
      // Access key1 once
      cache.get('key1');
      
      const mostAccessed = cache.getMostAccessed(2);
      
      expect(mostAccessed.length).toBe(2);
      expect(mostAccessed[0].key).toBe('key2');
      expect(mostAccessed[0].accessCount).toBe(3);
      expect(mostAccessed[1].key).toBe('key1');
      expect(mostAccessed[1].accessCount).toBe(1);
    });

    it('should get all valid keys', (done) => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3', 50); // Will expire soon
      
      const keys = cache.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
      
      // Wait for key3 to expire
      setTimeout(() => {
        const keysAfterExpiry = cache.keys();
        expect(keysAfterExpiry).toContain('key1');
        expect(keysAfterExpiry).toContain('key2');
        expect(keysAfterExpiry).not.toContain('key3');
        done();
      }, 100);
    });
  });

  describe('event emission', () => {
    it('should emit set event', () => {
      const setSpy = jest.fn();
      cache.on('set', setSpy);
      
      cache.set('key1', 'value1', 500);
      
      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({
        key: 'key1',
        ttlMs: 500,
        size: 1,
        expiresAt: expect.any(String)
      }));
    });

    it('should emit hit event', () => {
      const hitSpy = jest.fn();
      cache.on('hit', hitSpy);
      
      cache.set('key1', 'value1');
      cache.get('key1');
      
      expect(hitSpy).toHaveBeenCalledWith(expect.objectContaining({
        key: 'key1',
        accessCount: 1
      }));
    });

    it('should emit miss event', () => {
      const missSpy = jest.fn();
      cache.on('miss', missSpy);
      
      cache.get('missing');
      
      expect(missSpy).toHaveBeenCalledWith({ key: 'missing' });
    });

    it('should emit delete event', () => {
      const deleteSpy = jest.fn();
      cache.on('delete', deleteSpy);
      
      cache.set('key1', 'value1');
      cache.delete('key1');
      
      expect(deleteSpy).toHaveBeenCalledWith(expect.objectContaining({
        key: 'key1',
        remainingSize: 0
      }));
    });

    it('should emit clear event', () => {
      const clearSpy = jest.fn();
      cache.on('clear', clearSpy);
      
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      
      expect(clearSpy).toHaveBeenCalledWith({ previousSize: 2 });
    });

    it('should emit eviction event', () => {
      const evictionSpy = jest.fn();
      cache.on('eviction', evictionSpy);
      
      // Fill cache to capacity
      for (let i = 1; i <= 5; i++) {
        cache.set(`key${i}`, `value${i}`);
      }
      
      // Add one more to trigger eviction
      cache.set('key6', 'value6');
      
      expect(evictionSpy).toHaveBeenCalledWith(expect.objectContaining({
        evictedCount: 1, // Should evict exactly 1 item
        remainingSize: 4 // Size before adding the new item
      }));
    });

    it('should emit expired event', (done) => {
      const expiredSpy = jest.fn();
      cache.on('expired', expiredSpy);
      
      cache.set('key1', 'value1', 50); // 50ms TTL
      
      setTimeout(() => {
        cache.get('key1'); // This should trigger expiration
        
        expect(expiredSpy).toHaveBeenCalledWith({ key: 'key1' });
        done();
      }, 100);
    });
  });

  describe('edge cases', () => {
    it('should handle empty cache operations', () => {
      expect(cache.isEmpty()).toBe(true);
      expect(cache.size()).toBe(0);
      expect(cache.keys()).toEqual([]);
      expect(cache.getStats().size).toBe(0);
    });

    it('should handle complex data types', () => {
      const complexData = {
        array: [1, 2, 3],
        nested: { a: 1, b: { c: 2 } },
        date: new Date(),
        null: null,
        undefined: undefined
      };
      
      cache.set('complex', complexData);
      const retrieved = cache.get('complex');
      
      expect(retrieved).toEqual(complexData);
    });

    it('should handle zero TTL', () => {
      cache.set('key1', 'value1', 0);
      
      // Should expire immediately (zero TTL means expire at current time)
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should handle very large TTL', () => {
      const largeTTL = 365 * 24 * 60 * 60 * 1000; // 1 year
      cache.set('key1', 'value1', largeTTL);
      
      expect(cache.get('key1')).toBe('value1');
      expect(cache.getTTL('key1')).toBeGreaterThan(largeTTL - 1000);
    });
  });
});