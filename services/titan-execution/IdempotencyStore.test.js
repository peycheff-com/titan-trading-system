/**
 * IdempotencyStore Tests
 * 
 * Tests for Idempotent Order Execution Store
 * Requirements: 21.1-21.4
 */

import { jest } from '@jest/globals';
import { IdempotencyStore, MemoryStore } from './IdempotencyStore.js';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('IdempotencyStore', () => {
  let store;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new IdempotencyStore({
      ttlMs: 1000, // 1 second for testing
      maxMemoryEntries: 100,
      logger: mockLogger,
    });
  });

  afterEach(async () => {
    if (store) {
      await store.close();
    }
  });

  describe('set and get', () => {
    test('should store and retrieve result by signal_id', async () => {
      // Requirements: 21.1 - Use signal_id as idempotency key
      const signalId = 'titan_BTCUSDT_12345_15';
      const result = { success: true, order_id: 'order_123' };

      await store.set(signalId, result);
      const retrieved = await store.get(signalId);

      expect(retrieved).toMatchObject(result);
      expect(retrieved.signal_id).toBe(signalId);
      expect(retrieved.cached_at).toBeDefined();
    });

    test('should return null for non-existent signal_id', async () => {
      const result = await store.get('non_existent_id');
      expect(result).toBeNull();
    });

    test('should return null for null/undefined signal_id', async () => {
      expect(await store.get(null)).toBeNull();
      expect(await store.get(undefined)).toBeNull();
    });
  });

  describe('has', () => {
    test('should return true for existing signal_id', async () => {
      // Requirements: 21.2 - Return cached result for duplicates
      const signalId = 'titan_BTCUSDT_12345_15';
      await store.set(signalId, { success: true });

      expect(await store.has(signalId)).toBe(true);
    });

    test('should return false for non-existent signal_id', async () => {
      expect(await store.has('non_existent_id')).toBe(false);
    });
  });

  describe('TTL expiration', () => {
    test('should expire entries after TTL', async () => {
      // Requirements: 21.3 - Use configurable TTL
      const signalId = 'titan_BTCUSDT_12345_15';
      await store.set(signalId, { success: true }, 100); // 100ms TTL

      // Should exist immediately
      expect(await store.has(signalId)).toBe(true);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      expect(await store.has(signalId)).toBe(false);
    });
  });

  describe('processWithIdempotency', () => {
    test('should process and cache new signal', async () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      const processor = jest.fn().mockResolvedValue({ success: true, order_id: 'order_123' });

      const { result, cached } = await store.processWithIdempotency(signalId, processor);

      expect(cached).toBe(false);
      expect(result.success).toBe(true);
      expect(processor).toHaveBeenCalledTimes(1);
    });

    test('should return cached result for duplicate signal', async () => {
      // Requirements: 21.2 - Return cached result for duplicates
      const signalId = 'titan_BTCUSDT_12345_15';
      const processor = jest.fn().mockResolvedValue({ success: true, order_id: 'order_123' });

      // First call - should process
      await store.processWithIdempotency(signalId, processor);

      // Second call - should return cached
      const { result, cached } = await store.processWithIdempotency(signalId, processor);

      expect(cached).toBe(true);
      expect(processor).toHaveBeenCalledTimes(1); // Only called once
    });
  });

  describe('delete', () => {
    test('should delete cached result', async () => {
      const signalId = 'titan_BTCUSDT_12345_15';
      await store.set(signalId, { success: true });

      expect(await store.has(signalId)).toBe(true);

      await store.delete(signalId);

      expect(await store.has(signalId)).toBe(false);
    });
  });

  describe('clear', () => {
    test('should clear all cached results', async () => {
      await store.set('signal_1', { success: true });
      await store.set('signal_2', { success: true });
      await store.set('signal_3', { success: true });

      await store.clear();

      expect(await store.has('signal_1')).toBe(false);
      expect(await store.has('signal_2')).toBe(false);
      expect(await store.has('signal_3')).toBe(false);
    });
  });

  describe('getStatus', () => {
    test('should return correct status', async () => {
      await store.set('signal_1', { success: true });

      const status = store.getStatus();

      expect(status.redis_connected).toBe(false);
      expect(status.memory_store_size).toBe(1);
      expect(status.ttl_ms).toBe(1000);
    });
  });

  describe('cleanup', () => {
    test('should remove expired entries from memory store', async () => {
      await store.set('signal_1', { success: true }, 50); // 50ms TTL
      await store.set('signal_2', { success: true }, 5000); // 5s TTL

      // Wait for first to expire
      await new Promise(resolve => setTimeout(resolve, 100));

      const removed = store.cleanup();

      expect(removed).toBe(1);
      expect(await store.has('signal_1')).toBe(false);
      expect(await store.has('signal_2')).toBe(true);
    });
  });
});

describe('MemoryStore', () => {
  let memStore;

  beforeEach(() => {
    memStore = new MemoryStore(10);
  });

  describe('basic operations', () => {
    test('should set and get values', () => {
      memStore.set('key1', { data: 'test' }, 10000);
      expect(memStore.get('key1')).toEqual({ data: 'test' });
    });

    test('should return null for non-existent keys', () => {
      expect(memStore.get('non_existent')).toBeNull();
    });

    test('should check existence with has()', () => {
      memStore.set('key1', { data: 'test' }, 10000);
      expect(memStore.has('key1')).toBe(true);
      expect(memStore.has('non_existent')).toBe(false);
    });

    test('should delete values', () => {
      memStore.set('key1', { data: 'test' }, 10000);
      expect(memStore.delete('key1')).toBe(true);
      expect(memStore.has('key1')).toBe(false);
    });
  });

  describe('TTL expiration', () => {
    test('should expire entries after TTL', async () => {
      memStore.set('key1', { data: 'test' }, 50); // 50ms TTL

      expect(memStore.has('key1')).toBe(true);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(memStore.has('key1')).toBe(false);
    });
  });

  describe('capacity management', () => {
    test('should evict oldest entry when at capacity', () => {
      // Requirements: 21.4 - Fallback to in-memory for testing
      for (let i = 0; i < 10; i++) {
        memStore.set(`key_${i}`, { index: i }, 10000);
      }

      expect(memStore.size()).toBe(10);

      // Add one more - should evict oldest
      memStore.set('key_new', { index: 'new' }, 10000);

      expect(memStore.size()).toBe(10);
      expect(memStore.has('key_0')).toBe(false); // Oldest evicted
      expect(memStore.has('key_new')).toBe(true);
    });
  });

  describe('cleanup', () => {
    test('should remove expired entries', async () => {
      memStore.set('key1', { data: 'test' }, 50);
      memStore.set('key2', { data: 'test' }, 5000);

      await new Promise(resolve => setTimeout(resolve, 100));

      const removed = memStore.cleanup();

      expect(removed).toBe(1);
      expect(memStore.size()).toBe(1);
    });
  });

  describe('clear', () => {
    test('should clear all entries', () => {
      memStore.set('key1', { data: 'test' }, 10000);
      memStore.set('key2', { data: 'test' }, 10000);

      memStore.clear();

      expect(memStore.size()).toBe(0);
    });
  });
});
