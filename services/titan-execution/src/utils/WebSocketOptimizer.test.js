/**
 * WebSocket Optimizer Tests
 * 
 * Tests for batching, compression, and delta updates.
 * Requirements: System Integration 3.1-3.5
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WebSocketOptimizer } from './WebSocketOptimizer.js';

describe('WebSocketOptimizer', () => {
  let optimizer;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    
    optimizer = new WebSocketOptimizer({
      batchIntervalMs: 50,
      maxBatchSize: 5,
      compressionThreshold: 100, // Low threshold for testing
      enableDeltaUpdates: true,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    optimizer.close();
  });

  describe('constructor', () => {
    it('should create optimizer with default config', () => {
      const defaultOptimizer = new WebSocketOptimizer();
      expect(defaultOptimizer).toBeDefined();
      defaultOptimizer.close();
    });

    it('should accept custom config', () => {
      expect(optimizer.config.batchIntervalMs).toBe(50);
      expect(optimizer.config.maxBatchSize).toBe(5);
      expect(optimizer.config.compressionThreshold).toBe(100);
    });
  });

  describe('batching', () => {
    it('should batch messages and send after interval', async () => {
      const sendFn = jest.fn();
      
      optimizer.queueMessage('test', { type: 'UPDATE', value: 1 }, sendFn);
      optimizer.queueMessage('test', { type: 'UPDATE', value: 2 }, sendFn);
      
      // Not sent yet
      expect(sendFn).not.toHaveBeenCalled();
      
      // Wait for batch interval
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have sent batch
      expect(sendFn).toHaveBeenCalledTimes(1);
      const call = sendFn.mock.calls[0][0];
      expect(call.type).toBe('BATCH');
      expect(call.messages).toHaveLength(2);
      expect(call.count).toBe(2);
    });

    it('should send single message without batch wrapper', async () => {
      const sendFn = jest.fn();
      
      optimizer.queueMessage('test', { type: 'UPDATE', value: 1 }, sendFn);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(sendFn).toHaveBeenCalledTimes(1);
      const call = sendFn.mock.calls[0][0];
      expect(call.type).toBe('UPDATE');
      expect(call.value).toBe(1);
    });

    it('should flush immediately when batch is full', () => {
      const sendFn = jest.fn();
      
      // Queue more than maxBatchSize
      for (let i = 0; i < 6; i++) {
        optimizer.queueMessage('test', { type: 'UPDATE', value: i }, sendFn);
      }
      
      // Should have flushed at least once
      expect(sendFn).toHaveBeenCalled();
    });

    it('should flush all pending batches', async () => {
      const sendFn = jest.fn();
      
      optimizer.queueMessage('channel1', { type: 'A' }, sendFn);
      optimizer.queueMessage('channel2', { type: 'B' }, sendFn);
      
      optimizer.flushAll(sendFn);
      
      expect(sendFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('compression', () => {
    it('should not compress small payloads', async () => {
      const smallMessage = { type: 'UPDATE', value: 1 };
      const result = await optimizer.compressIfNeeded(smallMessage);
      
      expect(result).toEqual(smallMessage);
      expect(optimizer.isCompressed(result)).toBe(false);
    });

    it('should compress large payloads', async () => {
      // Create a large message
      const largeMessage = {
        type: 'UPDATE',
        data: 'x'.repeat(500), // Large enough to exceed threshold
      };
      
      const result = await optimizer.compressIfNeeded(largeMessage);
      
      expect(optimizer.isCompressed(result)).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.originalSize).toBeGreaterThan(result.compressedSize);
    });

    it('should decompress compressed payloads', async () => {
      const originalMessage = {
        type: 'UPDATE',
        data: 'x'.repeat(500),
      };
      
      const compressed = await optimizer.compressIfNeeded(originalMessage);
      const decompressed = await optimizer.decompress(compressed);
      
      expect(decompressed).toEqual(originalMessage);
    });

    it('should return original if not compressed', async () => {
      const message = { type: 'UPDATE', value: 1 };
      const result = await optimizer.decompress(message);
      
      expect(result).toEqual(message);
    });
  });

  describe('delta updates', () => {
    it('should return full state on first call', () => {
      const state = { equity: 1000, phase: 1, positions: [] };
      const delta = optimizer.generateDelta('test', state);
      
      expect(delta._delta).toBe(false);
      expect(delta.equity).toBe(1000);
    });

    it('should return delta on subsequent calls', () => {
      const state1 = { equity: 1000, phase: 1, positions: [] };
      const state2 = { equity: 1050, phase: 1, positions: [] };
      
      optimizer.generateDelta('test', state1);
      const delta = optimizer.generateDelta('test', state2);
      
      expect(delta._delta).toBe(true);
      expect(delta.equity).toBe(1050);
      expect(delta.phase).toBeUndefined(); // Unchanged
    });

    it('should return null if no changes', () => {
      const state = { equity: 1000, phase: 1 };
      
      optimizer.generateDelta('test', state);
      const delta = optimizer.generateDelta('test', { ...state });
      
      expect(delta).toBeNull();
    });

    it('should mark removed fields as null', () => {
      const state1 = { equity: 1000, phase: 1, extra: 'value' };
      const state2 = { equity: 1000, phase: 1 };
      
      optimizer.generateDelta('test', state1);
      const delta = optimizer.generateDelta('test', state2);
      
      expect(delta._delta).toBe(true);
      expect(delta.extra).toBeNull();
    });

    it('should return full state if delta is too large', () => {
      const state1 = { a: 1, b: 2, c: 3 };
      const state2 = { a: 10, b: 20, c: 30 }; // All changed
      
      optimizer.generateDelta('test', state1);
      const delta = optimizer.generateDelta('test', state2);
      
      // Should be full update since all fields changed
      expect(delta._delta).toBe(false);
    });

    it('should apply delta to state', () => {
      const state = { equity: 1000, phase: 1, positions: [] };
      const delta = { equity: 1050, _delta: true };
      
      const newState = optimizer.applyDelta(state, delta);
      
      expect(newState.equity).toBe(1050);
      expect(newState.phase).toBe(1);
      expect(newState.positions).toEqual([]);
    });

    it('should handle full update in applyDelta', () => {
      const state = { equity: 1000, phase: 1 };
      const fullUpdate = { equity: 2000, phase: 2, _delta: false };
      
      const newState = optimizer.applyDelta(state, fullUpdate);
      
      expect(newState.equity).toBe(2000);
      expect(newState.phase).toBe(2);
    });

    it('should clear state cache', () => {
      const state = { equity: 1000 };
      optimizer.generateDelta('test', state);
      
      optimizer.clearState('test');
      
      // Next call should be full update
      const delta = optimizer.generateDelta('test', { equity: 1050 });
      expect(delta._delta).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should track batching stats', async () => {
      const sendFn = jest.fn();
      
      optimizer.queueMessage('test', { type: 'A' }, sendFn);
      optimizer.queueMessage('test', { type: 'B' }, sendFn);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = optimizer.getStats();
      expect(stats.messagesBatched).toBe(2);
      expect(stats.batchesSent).toBe(1);
    });

    it('should track compression stats', async () => {
      const largeMessage = { data: 'x'.repeat(500) };
      await optimizer.compressIfNeeded(largeMessage);
      
      const stats = optimizer.getStats();
      expect(stats.bytesBeforeCompression).toBeGreaterThan(0);
      expect(stats.bytesAfterCompression).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeDefined();
    });

    it('should track delta stats', () => {
      // First call is always full update
      optimizer.generateDelta('test', { a: 1, b: 2, c: 3 });
      // Second call with one field changed should be delta
      optimizer.generateDelta('test', { a: 2, b: 2, c: 3 });
      
      const stats = optimizer.getStats();
      expect(stats.fullUpdatesGenerated).toBe(1);
      expect(stats.deltaUpdatesGenerated).toBe(1);
    });

    it('should reset stats', async () => {
      const sendFn = jest.fn();
      optimizer.queueMessage('test', { type: 'A' }, sendFn);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      optimizer.resetStats();
      
      const stats = optimizer.getStats();
      expect(stats.messagesBatched).toBe(0);
      expect(stats.batchesSent).toBe(0);
    });
  });

  describe('deep equality', () => {
    it('should detect equal primitives', () => {
      const state1 = { a: 1, b: 'test', c: true };
      const state2 = { a: 1, b: 'test', c: true };
      
      optimizer.generateDelta('test', state1);
      const delta = optimizer.generateDelta('test', state2);
      
      expect(delta).toBeNull(); // No changes
    });

    it('should detect equal arrays', () => {
      const state1 = { arr: [1, 2, 3] };
      const state2 = { arr: [1, 2, 3] };
      
      optimizer.generateDelta('test', state1);
      const delta = optimizer.generateDelta('test', state2);
      
      expect(delta).toBeNull();
    });

    it('should detect changed arrays', () => {
      // Need multiple fields so delta is < 70% of full state
      const state1 = { arr: [1, 2, 3], other: 'unchanged', more: 123 };
      const state2 = { arr: [1, 2, 4], other: 'unchanged', more: 123 };
      
      optimizer.generateDelta('test', state1);
      const delta = optimizer.generateDelta('test', state2);
      
      expect(delta._delta).toBe(true);
      expect(delta.arr).toEqual([1, 2, 4]);
    });

    it('should detect equal nested objects', () => {
      const state1 = { obj: { a: 1, b: 2 } };
      const state2 = { obj: { a: 1, b: 2 } };
      
      optimizer.generateDelta('test', state1);
      const delta = optimizer.generateDelta('test', state2);
      
      expect(delta).toBeNull();
    });

    it('should detect changed nested objects', () => {
      // Need multiple fields so delta is < 70% of full state
      const state1 = { obj: { a: 1, b: 2 }, other: 'unchanged', more: 123 };
      const state2 = { obj: { a: 1, b: 3 }, other: 'unchanged', more: 123 };
      
      optimizer.generateDelta('test', state1);
      const delta = optimizer.generateDelta('test', state2);
      
      expect(delta._delta).toBe(true);
      expect(delta.obj).toEqual({ a: 1, b: 3 });
    });
  });

  describe('cleanup', () => {
    it('should clear all resources on close', () => {
      optimizer.queueMessage('test', { type: 'A' }, jest.fn());
      optimizer.generateDelta('test', { a: 1 });
      
      optimizer.close();
      
      const stats = optimizer.getStats();
      expect(stats.pendingBatches).toBe(0);
      expect(stats.cachedStates).toBe(0);
    });
  });
});
