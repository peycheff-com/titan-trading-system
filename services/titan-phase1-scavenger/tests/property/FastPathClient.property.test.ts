/**
 * FastPathClient Property-Based Tests
 * 
 * Tests signal serialization and deserialization protocols with property-based testing
 * Requirements: 2.5, 5.1 (Signal serialization and deserialization protocols)
 */

import * as fc from 'fast-check';
import { FastPathClient, IntentSignal } from '../../src/ipc/FastPathClient';

/**
 * **Feature: titan-system-integration-review, Property 1: IPC Signal Delivery Reliability**
 * **Validates: Requirements 2.5**
 * 
 * For any valid IntentSignal, serialization followed by deserialization should preserve all signal data
 */
describe('FastPathClient Property Tests', () => {
  let client: FastPathClient;

  beforeEach(() => {
    client = new FastPathClient({
      socketPath: '/tmp/test-ipc.sock',
      hmacSecret: 'test-secret-key',
      maxReconnectAttempts: 3,
      baseReconnectDelay: 100,
      connectionTimeout: 1000,
      messageTimeout: 500,
      enableMetrics: true,
    });
  });

  afterEach(async () => {
    await client.disconnect();
  });

  /**
   * Property 1: Signal Serialization Round Trip
   * For any valid IntentSignal, serializing and then deserializing should preserve all data
   */
  it('should preserve signal data through serialization round trip', () => {
    fc.assert(
      fc.property(
        // Generate valid IntentSignal
        fc.record({
          signal_id: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length >= 1),
          source: fc.constantFrom('scavenger' as const, 'hunter' as const, 'sentinel' as const),
          symbol: fc.string({ minLength: 3, maxLength: 20 }).filter(s => s.trim().length >= 3).map(s => s.trim().toUpperCase()),
          direction: fc.constantFrom('LONG' as const, 'SHORT' as const),
          entry_zone: fc.record({
            min: fc.float({ min: 1, max: 100000, noNaN: true }),
            max: fc.float({ min: 1, max: 100000, noNaN: true })
          }).map(zone => ({
            min: Math.min(zone.min, zone.max),
            max: Math.max(zone.min, zone.max)
          })),
          stop_loss: fc.float({ min: 1, max: 100000, noNaN: true }),
          take_profits: fc.array(fc.float({ min: 1, max: 100000, noNaN: true }), { minLength: 1, maxLength: 5 }),
          confidence: fc.integer({ min: 0, max: 100 }),
          leverage: fc.integer({ min: 1, max: 100 }),
          velocity: fc.option(fc.float({ min: 0, max: 1, noNaN: true })),
          trap_type: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
          timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 })
        }) as fc.Arbitrary<IntentSignal>,
        (signal: IntentSignal) => {
          // Test serialization and deserialization
          const serialized = (client as any).serializeMessage({
            signal,
            signature: (client as any).sign(signal),
            correlationId: 'test-correlation-id',
            timestamp: Date.now()
          });

          // Parse the serialized message
          const parsed = JSON.parse(serialized.replace('\n', ''));

          // Verify all signal properties are preserved
          expect(parsed.signal.signal_id).toBe(signal.signal_id);
          expect(parsed.signal.source).toBe(signal.source);
          expect(parsed.signal.symbol).toBe(signal.symbol);
          expect(parsed.signal.direction).toBe(signal.direction);
          expect(parsed.signal.entry_zone.min).toBe(signal.entry_zone.min);
          expect(parsed.signal.entry_zone.max).toBe(signal.entry_zone.max);
          expect(parsed.signal.stop_loss).toBe(signal.stop_loss);
          expect(parsed.signal.take_profits).toEqual(signal.take_profits);
          expect(parsed.signal.confidence).toBe(signal.confidence);
          expect(parsed.signal.leverage).toBe(signal.leverage);
          expect(parsed.signal.velocity).toBe(signal.velocity);
          expect(parsed.signal.trap_type).toBe(signal.trap_type);
          expect(parsed.signal.timestamp).toBe(signal.timestamp);

          // Verify signature is present and valid format
          expect(parsed.signature).toBeDefined();
          expect(typeof parsed.signature).toBe('string');
          expect(parsed.signature).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex string

          // Verify correlation ID is preserved
          expect(parsed.correlationId).toBe('test-correlation-id');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: HMAC Signature Consistency
   * For any signal, generating the signature multiple times should produce the same result
   */
  it('should generate consistent HMAC signatures for identical signals', () => {
    fc.assert(
      fc.property(
        fc.record({
          signal_id: fc.string({ minLength: 1, maxLength: 50 }),
          signal_type: fc.constantFrom('PREPARE' as const, 'CONFIRM' as const, 'ABORT' as const),
          timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
          source: fc.constantFrom('scavenger' as const, 'hunter' as const, 'sentinel' as const)
        }),
        (signal) => {
          const signature1 = (client as any).sign(signal);
          const signature2 = (client as any).sign(signal);

          // Signatures should be identical for the same signal
          expect(signature1).toBe(signature2);
          
          // Signature should be valid SHA256 hex string
          expect(signature1).toMatch(/^[a-f0-9]{64}$/);
          expect(signature2).toMatch(/^[a-f0-9]{64}$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Signal Normalization for Signing
   * For any signal with different key orders, normalization should produce consistent signatures
   */
  it('should normalize signals consistently for signing', () => {
    fc.assert(
      fc.property(
        fc.record({
          signal_id: fc.string({ minLength: 1, maxLength: 50 }),
          timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 }),
          source: fc.constantFrom('scavenger' as const, 'hunter' as const, 'sentinel' as const),
          signal_type: fc.constantFrom('PREPARE' as const, 'CONFIRM' as const, 'ABORT' as const)
        }),
        (baseSignal) => {
          // Create two objects with same data but different key orders
          const signal1 = {
            signal_id: baseSignal.signal_id,
            timestamp: baseSignal.timestamp,
            source: baseSignal.source,
            signal_type: baseSignal.signal_type
          };

          const signal2 = {
            source: baseSignal.source,
            signal_type: baseSignal.signal_type,
            signal_id: baseSignal.signal_id,
            timestamp: baseSignal.timestamp
          };

          const signature1 = (client as any).sign(signal1);
          const signature2 = (client as any).sign(signal2);

          // Signatures should be identical despite different key orders
          expect(signature1).toBe(signature2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: Message Framing Integrity
   * For any message, serialization should include proper newline delimiter
   */
  it('should include proper message framing delimiters', () => {
    fc.assert(
      fc.property(
        fc.record({
          signal: fc.record({
            signal_id: fc.string({ minLength: 1, maxLength: 50 }),
            signal_type: fc.constantFrom('PREPARE' as const, 'CONFIRM' as const, 'ABORT' as const)
          }),
          correlationId: fc.string({ minLength: 1, maxLength: 50 }),
          timestamp: fc.integer({ min: 1000000000000, max: 9999999999999 })
        }),
        (message) => {
          const serialized = (client as any).serializeMessage(message);

          // Should end with newline delimiter
          expect(serialized).toMatch(/\n$/);

          // Should be valid JSON when delimiter is removed
          const jsonPart = serialized.replace(/\n$/, '');
          expect(() => JSON.parse(jsonPart)).not.toThrow();

          // Parsed message should contain original data
          const parsed = JSON.parse(jsonPart);
          expect(parsed.signal.signal_id).toBe(message.signal.signal_id);
          expect(parsed.correlationId).toBe(message.correlationId);
          expect(parsed.timestamp).toBe(message.timestamp);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Configuration Validation
   * For any valid configuration, the client should initialize without errors
   */
  it('should handle valid configuration parameters correctly', () => {
    fc.assert(
      fc.property(
        fc.record({
          socketPath: fc.string({ minLength: 1, maxLength: 100 }),
          hmacSecret: fc.string({ minLength: 8, maxLength: 64 }),
          maxReconnectAttempts: fc.integer({ min: 1, max: 20 }),
          baseReconnectDelay: fc.integer({ min: 100, max: 10000 }),
          maxReconnectDelay: fc.integer({ min: 1000, max: 60000 }),
          connectionTimeout: fc.integer({ min: 1000, max: 30000 }),
          messageTimeout: fc.integer({ min: 100, max: 10000 }),
          enableMetrics: fc.boolean()
        }),
        (config) => {
          // Ensure maxReconnectDelay >= baseReconnectDelay
          const validConfig = {
            ...config,
            maxReconnectDelay: Math.max(config.maxReconnectDelay, config.baseReconnectDelay)
          };

          // Should not throw when creating client with valid config
          expect(() => {
            const testClient = new FastPathClient(validConfig);
            testClient.disconnect(); // Clean up
          }).not.toThrow();
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 6: Correlation ID Generation
   * For any sequence of calls, correlation IDs should be unique
   */
  it('should generate unique correlation IDs', () => {
    const correlationIds = new Set<string>();
    
    // Generate 1000 correlation IDs
    for (let i = 0; i < 1000; i++) {
      const correlationId = (client as any).generateCorrelationId();
      
      // Should not have seen this ID before
      expect(correlationIds.has(correlationId)).toBe(false);
      
      // Should match expected format
      expect(correlationId).toMatch(/^scavenger-\d+-\d+$/);
      
      correlationIds.add(correlationId);
    }
    
    // All IDs should be unique
    expect(correlationIds.size).toBe(1000);
  });
});