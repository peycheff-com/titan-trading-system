/**
 * ReplayGuard Tests
 * 
 * Tests for timestamp validation and replay attack prevention.
 * Requirements: 65.1-65.8
 */

import { jest } from '@jest/globals';
import { ReplayGuard, LRUCache } from './ReplayGuard.js';
import fc from 'fast-check';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('ReplayGuard', () => {
  let replayGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    replayGuard = new ReplayGuard({
      maxDriftMs: 5000,
      signalTtlMs: 300000,
      lruCacheSize: 100,
      logger: mockLogger,
    });
  });

  afterEach(async () => {
    await replayGuard.close();
  });

  describe('LRUCache', () => {
    it('should store and retrieve values', () => {
      const cache = new LRUCache(10);
      cache.set('key1', 'value1', 60000);
      expect(cache.has('key1')).toBe(true);
      expect(cache.get('key1').value).toBe('value1');
    });

    it('should evict oldest entries when at capacity', () => {
      const cache = new LRUCache(3);
      cache.set('key1', 'value1', 60000);
      cache.set('key2', 'value2', 60000);
      cache.set('key3', 'value3', 60000);
      cache.set('key4', 'value4', 60000); // Should evict key1
      
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });

    it('should expire entries after TTL', async () => {
      const cache = new LRUCache(10);
      cache.set('key1', 'value1', 50); // 50ms TTL
      
      expect(cache.has('key1')).toBe(true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(cache.has('key1')).toBe(false);
    });

    it('should update LRU order on get', () => {
      const cache = new LRUCache(3);
      cache.set('key1', 'value1', 60000);
      cache.set('key2', 'value2', 60000);
      cache.set('key3', 'value3', 60000);
      
      // Access key1 to make it most recently used
      cache.get('key1');
      
      // Add new key, should evict key2 (oldest)
      cache.set('key4', 'value4', 60000);
      
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);
    });
  });

  describe('validateTimestamp', () => {
    it('should accept timestamps within drift threshold', () => {
      const now = new Date().toISOString();
      const result = replayGuard.validateTimestamp(now);
      
      expect(result.valid).toBe(true);
      expect(result.driftMs).toBeLessThanOrEqual(5000);
    });

    it('should reject timestamps exceeding drift threshold', () => {
      const oldTimestamp = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago
      const result = replayGuard.validateTimestamp(oldTimestamp);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TIMESTAMP_DRIFT_EXCEEDED');
      expect(result.driftMs).toBeGreaterThan(5000);
    });

    it('should reject missing timestamp', () => {
      const result = replayGuard.validateTimestamp(null);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('MISSING_TIMESTAMP');
    });

    it('should reject invalid timestamp format', () => {
      const result = replayGuard.validateTimestamp('not-a-date');
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('INVALID_TIMESTAMP');
    });

    it('should reject future timestamps exceeding drift', () => {
      const futureTimestamp = new Date(Date.now() + 10000).toISOString(); // 10 seconds in future
      const result = replayGuard.validateTimestamp(futureTimestamp);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('TIMESTAMP_DRIFT_EXCEEDED');
    });
  });


  describe('checkDuplicate', () => {
    it('should return false for new signal_id', async () => {
      const result = await replayGuard.checkDuplicate('new_signal_123');
      expect(result.isDuplicate).toBe(false);
    });

    it('should return true for duplicate signal_id', async () => {
      const signalId = 'duplicate_signal_456';
      
      // Record the signal first
      await replayGuard.recordSignal(signalId);
      
      // Check for duplicate
      const result = await replayGuard.checkDuplicate(signalId);
      expect(result.isDuplicate).toBe(true);
      expect(result.error).toBe('DUPLICATE_SIGNAL_ID');
    });

    it('should handle missing signal_id', async () => {
      const result = await replayGuard.checkDuplicate(null);
      expect(result.isDuplicate).toBe(false);
      expect(result.error).toBe('MISSING_SIGNAL_ID');
    });
  });

  describe('validate', () => {
    it('should accept valid request', async () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12345_15',
        timestamp: new Date().toISOString(),
        type: 'PREPARE',
      };
      
      const result = await replayGuard.validate(payload, '192.168.1.1');
      
      expect(result.valid).toBe(true);
      expect(result.drift_ms).toBeDefined();
    });

    it('should reject request with timestamp drift', async () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12346_15',
        timestamp: new Date(Date.now() - 10000).toISOString(), // 10 seconds ago
        type: 'PREPARE',
      };
      
      const result = await replayGuard.validate(payload, '192.168.1.1');
      
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.error).toBe('TIMESTAMP_DRIFT_EXCEEDED');
    });

    it('should reject duplicate signal_id as replay attack', async () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12347_15',
        timestamp: new Date().toISOString(),
        type: 'PREPARE',
      };
      
      // First request should succeed
      const result1 = await replayGuard.validate(payload, '192.168.1.1');
      expect(result1.valid).toBe(true);
      
      // Second request with same signal_id should fail
      payload.timestamp = new Date().toISOString(); // Update timestamp
      const result2 = await replayGuard.validate(payload, '192.168.1.2');
      
      expect(result2.valid).toBe(false);
      expect(result2.statusCode).toBe(409);
      expect(result2.error).toBe('DUPLICATE_SIGNAL_ID');
    });

    it('should log rejections with required details', async () => {
      const payload = {
        signal_id: 'titan_BTCUSDT_12348_15',
        timestamp: new Date(Date.now() - 10000).toISOString(),
        type: 'PREPARE',
      };
      
      await replayGuard.validate(payload, '10.0.0.1');
      
      expect(mockLogger.warn).toHaveBeenCalled();
      const logCall = mockLogger.warn.mock.calls[0][0];
      expect(logCall.signal_id).toBe('titan_BTCUSDT_12348_15');
      expect(logCall.source_ip).toBe('10.0.0.1');
      expect(logCall.rejection_reason).toBe('TIMESTAMP_DRIFT_EXCEEDED');
      expect(logCall.drift_ms).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      const status = replayGuard.getStatus();
      
      expect(status.redisConnected).toBe(false);
      expect(status.lruCacheSize).toBe(0);
      expect(status.maxDriftMs).toBe(5000);
      expect(status.signalTtlMs).toBe(300000);
    });
  });

  describe('clearCache', () => {
    it('should clear LRU cache', async () => {
      await replayGuard.recordSignal('signal_1');
      await replayGuard.recordSignal('signal_2');
      
      expect(replayGuard.getStatus().lruCacheSize).toBe(2);
      
      await replayGuard.clearCache();
      
      expect(replayGuard.getStatus().lruCacheSize).toBe(0);
    });
  });
});

/**
 * Property-Based Tests for ReplayGuard
 * 
 * **Feature: titan-regime-engine, Property 43: Timestamp drift rejection**
 * **Validates: Requirements 65.3**
 */
describe('ReplayGuard Property Tests', () => {
  let replayGuard;

  beforeEach(() => {
    replayGuard = new ReplayGuard({
      maxDriftMs: 5000,
      signalTtlMs: 300000,
      lruCacheSize: 100,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
  });

  afterEach(async () => {
    await replayGuard.close();
  });

  /**
   * **Feature: titan-regime-engine, Property 43: Timestamp drift rejection**
   * *For any* webhook where abs(server_now - payload.timestamp) > 5000ms, 
   * the request SHALL be rejected.
   * **Validates: Requirements 65.3**
   */
  it('Property 43: Timestamp drift rejection - timestamps beyond threshold are always rejected', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5001, max: 3600000 }), // Drift from 5001ms to 1 hour
        fc.boolean(), // Direction: true = past, false = future
        (driftMs, isPast) => {
          const offset = isPast ? -driftMs : driftMs;
          const timestamp = new Date(Date.now() + offset).toISOString();
          
          const result = replayGuard.validateTimestamp(timestamp);
          
          // Property: Any timestamp with drift > 5000ms must be rejected
          return result.valid === false && 
                 result.error === 'TIMESTAMP_DRIFT_EXCEEDED' &&
                 result.driftMs >= 5000;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Timestamps within threshold are always accepted
   */
  it('Property: Timestamps within threshold are always accepted', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4999 }), // Drift from 0 to 4999ms
        fc.boolean(), // Direction: true = past, false = future
        (driftMs, isPast) => {
          const offset = isPast ? -driftMs : driftMs;
          const timestamp = new Date(Date.now() + offset).toISOString();
          
          const result = replayGuard.validateTimestamp(timestamp);
          
          // Property: Any timestamp with drift <= 5000ms must be accepted
          return result.valid === true && result.driftMs <= 5000;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: titan-regime-engine, Property 44: Replay attack prevention**
   * *For any* duplicate signal_id within 5 minutes, the request SHALL be rejected as replay attack.
   * **Validates: Requirements 65.5**
   */
  it('Property 44: Replay attack prevention - duplicate signal_ids are always rejected', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }), // Random signal IDs
        async (signalId) => {
          // Clear cache to start fresh
          await replayGuard.clearCache();
          
          // First check should not be duplicate
          const firstCheck = await replayGuard.checkDuplicate(signalId);
          if (firstCheck.isDuplicate) return false; // Should not be duplicate initially
          
          // Record the signal
          await replayGuard.recordSignal(signalId);
          
          // Second check should be duplicate
          const secondCheck = await replayGuard.checkDuplicate(signalId);
          
          // Property: After recording, the same signal_id must be detected as duplicate
          return secondCheck.isDuplicate === true && 
                 secondCheck.error === 'DUPLICATE_SIGNAL_ID';
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property: Different signal_ids are never detected as duplicates of each other
   */
  it('Property: Different signal_ids are independent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (signalId1, signalId2) => {
          // Skip if they happen to be the same
          if (signalId1 === signalId2) return true;
          
          // Clear cache
          await replayGuard.clearCache();
          
          // Record first signal
          await replayGuard.recordSignal(signalId1);
          
          // Check second signal - should not be duplicate
          const result = await replayGuard.checkDuplicate(signalId2);
          
          // Property: Recording one signal_id should not affect another
          return result.isDuplicate === false;
        }
      ),
      { numRuns: 50 }
    );
  });
});
