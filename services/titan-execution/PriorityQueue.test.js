/**
 * PriorityQueue Tests
 * 
 * Tests for Priority Queue with Rate Limiting
 * Requirements: 69.1-69.7
 */

import { jest } from '@jest/globals';
import { PriorityQueue, TokenBucket, PRIORITY } from './PriorityQueue.js';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('PriorityQueue', () => {
  let queue;

  beforeEach(() => {
    jest.clearAllMocks();
    queue = new PriorityQueue({
      maxQueueDepth: 10,
      maxRequestsPerSecond: 5,
      logger: mockLogger,
    });
  });

  afterEach(() => {
    if (queue) {
      queue.destroy();
    }
  });

  describe('enqueue', () => {
    test('should enqueue signal with correct priority', () => {
      const payload = { signal_id: 'test_1', type: 'BUY_SETUP' };
      const item = queue.enqueue(payload);

      expect(item.signal_id).toBe('test_1');
      expect(item.type).toBe('BUY_SETUP');
      expect(item.priority).toBe(PRIORITY.OPEN);
      expect(queue.getQueueDepth()).toBe(1);
    });

    test('should throw error if signal_id is missing', () => {
      expect(() => queue.enqueue({ type: 'BUY_SETUP' })).toThrow('signal_id is required');
    });

    test('should prioritize CLOSE signals over OPEN signals', () => {
      // Requirements: 69.2 - Process CLOSE before OPEN
      queue.enqueue({ signal_id: 'open_1', type: 'BUY_SETUP' });
      queue.enqueue({ signal_id: 'close_1', type: 'CLOSE' });
      queue.enqueue({ signal_id: 'open_2', type: 'SELL_SETUP' });

      const first = queue.peek();
      expect(first.signal_id).toBe('close_1');
      expect(first.priority).toBe(PRIORITY.CLOSE);
    });

    test('should handle CLOSE_LONG and CLOSE_SHORT with same priority as CLOSE', () => {
      queue.enqueue({ signal_id: 'open_1', type: 'BUY_SETUP' });
      queue.enqueue({ signal_id: 'close_long', type: 'CLOSE_LONG' });
      queue.enqueue({ signal_id: 'close_short', type: 'CLOSE_SHORT' });

      const first = queue.peek();
      expect(first.priority).toBe(PRIORITY.CLOSE);
    });

    test('should maintain FIFO order for same priority', () => {
      queue.enqueue({ signal_id: 'open_1', type: 'BUY_SETUP' });
      queue.enqueue({ signal_id: 'open_2', type: 'BUY_SETUP' });
      queue.enqueue({ signal_id: 'open_3', type: 'BUY_SETUP' });

      const first = queue.peek();
      expect(first.signal_id).toBe('open_1');
    });

    test('should emit signal:enqueued event', () => {
      const handler = jest.fn();
      queue.on('signal:enqueued', handler);

      queue.enqueue({ signal_id: 'test_1', type: 'BUY_SETUP' });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        signal_id: 'test_1',
        type: 'BUY_SETUP',
        queue_depth: 1,
      }));
    });
  });

  describe('queue overflow', () => {
    test('should drop lowest priority OPEN signals when queue exceeds max depth', () => {
      // Requirements: 69.4 - Drop lowest-priority OPEN signals when queue depth > 50
      const dropHandler = jest.fn();
      queue.on('signal:dropped', dropHandler);

      // Fill queue with OPEN signals
      for (let i = 0; i < 12; i++) {
        queue.enqueue({ signal_id: `open_${i}`, type: 'BUY_SETUP' });
      }

      // Should have dropped 2 signals (12 - 10 = 2)
      expect(queue.getQueueDepth()).toBe(10);
      expect(dropHandler).toHaveBeenCalledTimes(2);
    });

    test('should not drop CLOSE signals during overflow', () => {
      // Add CLOSE signals first
      queue.enqueue({ signal_id: 'close_1', type: 'CLOSE' });
      queue.enqueue({ signal_id: 'close_2', type: 'CLOSE' });

      // Fill rest with OPEN signals
      for (let i = 0; i < 12; i++) {
        queue.enqueue({ signal_id: `open_${i}`, type: 'BUY_SETUP' });
      }

      // CLOSE signals should still be in queue
      const metrics = queue.getMetrics();
      expect(metrics.signals_dropped).toBe(4); // 14 total - 10 max = 4 dropped
      
      // Verify CLOSE signals are preserved
      const first = queue.peek();
      expect(first.type).toBe('CLOSE');
    });
  });

  describe('processing', () => {
    test('should process signals through handler', async () => {
      const handler = jest.fn().mockResolvedValue({ success: true });
      queue.setHandler(handler);

      const processedHandler = jest.fn();
      queue.on('signal:processed', processedHandler);

      queue.enqueue({ signal_id: 'test_1', type: 'BUY_SETUP' });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        signal_id: 'test_1',
      }));
      expect(processedHandler).toHaveBeenCalled();
    });

    test('should throw error if handler is not a function', () => {
      expect(() => queue.setHandler('not a function')).toThrow('Handler must be a function');
    });
  });

  describe('rate limiting', () => {
    test('should handle HTTP 429 with exponential backoff', async () => {
      // Requirements: 69.5-69.6 - Pause on 429, exponential backoff
      const handler = jest.fn()
        .mockResolvedValueOnce({ statusCode: 429 })
        .mockResolvedValue({ success: true });
      
      queue.setHandler(handler);

      const retryHandler = jest.fn();
      queue.on('signal:retry', retryHandler);

      queue.enqueue({ signal_id: 'test_1', type: 'BUY_SETUP' });

      // Wait for backoff and retry
      await new Promise(resolve => setTimeout(resolve, 1500));

      expect(retryHandler).toHaveBeenCalledWith(expect.objectContaining({
        signal_id: 'test_1',
        retries: 1,
        backoff_ms: 1000, // Initial backoff
      }));
    });
  });

  describe('metrics', () => {
    test('should track metrics correctly', () => {
      // Requirements: 69.7 - Emit metrics
      queue.enqueue({ signal_id: 'test_1', type: 'BUY_SETUP' });
      queue.enqueue({ signal_id: 'test_2', type: 'CLOSE' });

      const metrics = queue.getMetrics();

      expect(metrics.queue_depth).toBe(2);
      expect(metrics.signals_enqueued).toBe(2);
      expect(metrics.signals_processed).toBe(0);
      expect(metrics.signals_dropped).toBe(0);
    });

    test('should reset metrics', () => {
      queue.enqueue({ signal_id: 'test_1', type: 'BUY_SETUP' });
      queue.resetMetrics();

      const metrics = queue.getMetrics();
      expect(metrics.signals_enqueued).toBe(0);
    });
  });

  describe('status', () => {
    test('should return correct status', () => {
      const status = queue.getStatus();

      expect(status).toEqual({
        queue_depth: 0,
        is_processing: false,
        in_backoff: false,
        backoff_remaining_ms: 0,
        has_handler: false,
      });
    });
  });

  describe('clear', () => {
    test('should clear all items from queue', () => {
      queue.enqueue({ signal_id: 'test_1', type: 'BUY_SETUP' });
      queue.enqueue({ signal_id: 'test_2', type: 'CLOSE' });

      const cleared = queue.clear();

      expect(cleared).toBe(2);
      expect(queue.getQueueDepth()).toBe(0);
    });
  });

  describe('destroy', () => {
    test('should prevent further operations after destroy', () => {
      queue.destroy();

      expect(() => queue.enqueue({ signal_id: 'test_1', type: 'BUY_SETUP' }))
        .toThrow('PriorityQueue has been destroyed');
    });
  });
});

describe('TokenBucket', () => {
  test('should allow bursts up to capacity', () => {
    const bucket = new TokenBucket(5, 5);

    // Should allow 5 immediate requests
    for (let i = 0; i < 5; i++) {
      expect(bucket.tryConsume()).toBe(true);
    }

    // 6th should fail
    expect(bucket.tryConsume()).toBe(false);
  });

  test('should refill tokens over time', async () => {
    const bucket = new TokenBucket(5, 5);

    // Consume all tokens
    for (let i = 0; i < 5; i++) {
      bucket.tryConsume();
    }

    // Wait for refill (200ms = 1 token at 5/sec)
    await new Promise(resolve => setTimeout(resolve, 250));

    expect(bucket.tryConsume()).toBe(true);
  });

  test('should calculate wait time correctly', () => {
    const bucket = new TokenBucket(5, 5);

    // Consume all tokens
    for (let i = 0; i < 5; i++) {
      bucket.tryConsume();
    }

    const waitTime = bucket.getWaitTime();
    expect(waitTime).toBeGreaterThan(0);
    expect(waitTime).toBeLessThanOrEqual(200); // ~200ms for 1 token at 5/sec
  });
});

describe('PRIORITY constants', () => {
  test('should have correct priority values', () => {
    expect(PRIORITY.CLOSE).toBe(0);
    expect(PRIORITY.CLOSE_LONG).toBe(0);
    expect(PRIORITY.CLOSE_SHORT).toBe(0);
    expect(PRIORITY.ABORT).toBe(1);
    expect(PRIORITY.OPEN).toBe(2);
    expect(PRIORITY.BUY_SETUP).toBe(2);
    expect(PRIORITY.SELL_SETUP).toBe(2);
  });
});
