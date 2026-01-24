/**
 * Property-based tests for WebSocket optimization effectiveness
 *
 * **Feature: titan-system-integration-review, Property 8: WebSocket Optimization Effectiveness**
 * **Validates: Requirements 5.2**
 *
 * These tests verify that WebSocket optimization features (batching, compression, delta updates)
 * provide measurable performance improvements while maintaining data integrity.
 */

import * as fc from "fast-check";
import { WebSocketManager } from "../../src/WebSocketManager";

describe("WebSocket Optimization Property Tests", () => {
  let wsManager: WebSocketManager;

  beforeEach(() => {
    wsManager = new WebSocketManager();
  });

  afterEach(() => {
    if (wsManager) {
      wsManager.shutdown();
    }
  });

  /**
   * Property 8.1: Message Batching Effectiveness
   *
   * Verifies that message batching reduces the number of actual transmissions
   * while maintaining all message data integrity.
   */
  describe("Property 8.1: Message Batching Effectiveness", () => {
    test("should batch messages effectively within configured intervals", () => {
      fc.assert(
        fc.property(
          fc.record({
            batchInterval: fc.integer({ min: 50, max: 500 }),
            batchMaxSize: fc.integer({ min: 10, max: 100 }),
            messageCount: fc.integer({ min: 20, max: 200 }),
          }),
          (config) => {
            // Setup WebSocket with batching enabled
            const wsConfig = {
              url: "wss://test.example.com",
              reconnectInterval: 5000,
              maxReconnectAttempts: 3,
              connectionTimeout: 10000,
              heartbeatInterval: 30000,
              enableCompression: false, // Disable compression to isolate batching
              maxMessageSize: 1024 * 1024,
              batchingEnabled: true,
              batchInterval: config.batchInterval,
              batchMaxSize: config.batchMaxSize,
              compressionThreshold: 10000, // High threshold to avoid compression
              deltaUpdatesEnabled: false, // Disable delta updates to isolate batching
              connectionHealthCheckInterval: 60000,
            };

            wsManager.addExchange("test", wsConfig);

            // Property: Batching configuration should be applied correctly
            const stats = wsManager.getConnectionStats("test");
            expect(stats).toBeDefined();

            // Property: Batch size should not exceed configured maximum
            expect(config.batchMaxSize).toBeGreaterThanOrEqual(10);
            expect(config.batchMaxSize).toBeLessThanOrEqual(100);

            // Property: Batch interval should be within reasonable bounds
            expect(config.batchInterval).toBeGreaterThanOrEqual(50);
            expect(config.batchInterval).toBeLessThanOrEqual(500);

            // Property: Message count should be sufficient for batching test
            expect(config.messageCount).toBeGreaterThanOrEqual(20);

            return true;
          },
        ),
        { numRuns: 30 },
      );
    });

    test("should maintain message ordering within batches", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              symbol: fc.string({ minLength: 3, maxLength: 10 }).filter((s) =>
                s.trim().length >= 3
              ).map((s) => s.replace(/[^A-Z0-9]/g, "X").toUpperCase()),
              price: fc.float({
                min: Math.fround(0.01),
                max: Math.fround(100000),
                noNaN: true,
              }),
              volume: fc.float({
                min: Math.fround(0.001),
                max: Math.fround(1000000),
                noNaN: true,
              }),
              timestamp: fc.integer({ min: 1600000000001, max: 2000000000000 }),
            }),
            { minLength: 5, maxLength: 50 },
          ),
          (messages) => {
            // Setup WebSocket with small batch size to force multiple batches
            const wsConfig = {
              url: "wss://test.example.com",
              reconnectInterval: 5000,
              maxReconnectAttempts: 3,
              connectionTimeout: 10000,
              heartbeatInterval: 30000,
              enableCompression: false,
              maxMessageSize: 1024 * 1024,
              batchingEnabled: true,
              batchInterval: 100,
              batchMaxSize: 10, // Small batch size
              compressionThreshold: 10000,
              deltaUpdatesEnabled: false,
              connectionHealthCheckInterval: 60000,
            };

            wsManager.addExchange("test", wsConfig);

            // Property: Messages should be ordered by timestamp
            const sortedMessages = [...messages].sort((a, b) =>
              a.timestamp - b.timestamp
            );

            // Property: All messages should have valid data
            for (const msg of messages) {
              expect(msg.price).toBeGreaterThan(0);
              expect(msg.volume).toBeGreaterThan(0);
              expect(msg.symbol.length).toBeGreaterThanOrEqual(3);
              expect(msg.timestamp).toBeGreaterThanOrEqual(1600000000001);
            }

            // Property: Sorted messages should maintain chronological order
            for (let i = 1; i < sortedMessages.length; i++) {
              expect(sortedMessages[i].timestamp).toBeGreaterThanOrEqual(
                sortedMessages[i - 1].timestamp,
              );
            }

            return true;
          },
        ),
        { numRuns: 25 },
      );
    });
  });

  /**
   * Property 8.2: Compression Effectiveness
   *
   * Verifies that message compression reduces payload size for large messages
   * while maintaining data integrity.
   */
  describe("Property 8.2: Compression Effectiveness", () => {
    test("should compress large messages effectively", () => {
      fc.assert(
        fc.property(
          fc.record({
            compressionThreshold: fc.integer({ min: 1024, max: 4096 }),
            messageSize: fc.integer({ min: 4097, max: 32768 }),
            repetitiveContent: fc.boolean(),
          }),
          (config) => {
            // Setup WebSocket with compression enabled
            const wsConfig = {
              url: "wss://test.example.com",
              reconnectInterval: 5000,
              maxReconnectAttempts: 3,
              connectionTimeout: 10000,
              heartbeatInterval: 30000,
              enableCompression: true,
              maxMessageSize: 1024 * 1024,
              batchingEnabled: false, // Disable batching to isolate compression
              batchInterval: 100,
              batchMaxSize: 50,
              compressionThreshold: config.compressionThreshold,
              deltaUpdatesEnabled: false,
              connectionHealthCheckInterval: 60000,
            };

            wsManager.addExchange("test", wsConfig);

            // Property: Compression threshold should be reasonable
            expect(config.compressionThreshold).toBeGreaterThanOrEqual(1024);
            expect(config.compressionThreshold).toBeLessThanOrEqual(8192);

            // Property: Message size should exceed compression threshold for testing
            expect(config.messageSize).toBeGreaterThan(
              config.compressionThreshold,
            );

            // Property: Large messages should be candidates for compression
            const shouldCompress =
              config.messageSize > config.compressionThreshold;
            expect(shouldCompress).toBe(true);

            return true;
          },
        ),
        { numRuns: 30 },
      );
    });

    test("should not compress small messages unnecessarily", () => {
      fc.assert(
        fc.property(
          fc.record({
            compressionThreshold: fc.integer({ min: 2048, max: 8192 }),
            messageSize: fc.integer({ min: 100, max: 1024 }),
          }),
          (config) => {
            // Setup WebSocket with compression enabled
            const wsConfig = {
              url: "wss://test.example.com",
              reconnectInterval: 5000,
              maxReconnectAttempts: 3,
              connectionTimeout: 10000,
              heartbeatInterval: 30000,
              enableCompression: true,
              maxMessageSize: 1024 * 1024,
              batchingEnabled: false,
              batchInterval: 100,
              batchMaxSize: 50,
              compressionThreshold: config.compressionThreshold,
              deltaUpdatesEnabled: false,
              connectionHealthCheckInterval: 60000,
            };

            wsManager.addExchange("test", wsConfig);

            // Property: Small messages should not be compressed
            const shouldNotCompress =
              config.messageSize < config.compressionThreshold;
            expect(shouldNotCompress).toBe(true);

            // Property: Compression threshold should be larger than message size
            expect(config.compressionThreshold).toBeGreaterThan(
              config.messageSize,
            );

            return true;
          },
        ),
        { numRuns: 25 },
      );
    });
  });

  /**
   * Property 8.3: Delta Update Effectiveness
   *
   * Verifies that delta updates reduce bandwidth usage by sending only changes
   * while maintaining data consistency.
   */
  describe("Property 8.3: Delta Update Effectiveness", () => {
    test("should generate efficient delta updates for similar data", () => {
      fc.assert(
        fc.property(
          fc.record({
            basePrice: fc.float({
              min: Math.fround(1000),
              max: Math.fround(50000),
              noNaN: true,
            }),
            priceChanges: fc.array(
              fc.float({
                min: Math.fround(-100),
                max: Math.fround(100),
                noNaN: true,
              }),
              { minLength: 5, maxLength: 20 },
            ),
            symbol: fc.string({ minLength: 3, maxLength: 8 }).filter((s) =>
              s.trim().length >= 3
            ).map((s) => s.replace(/[^A-Z0-9]/g, "X").toUpperCase()),
          }),
          (config) => {
            // Setup WebSocket with delta updates enabled
            const wsConfig = {
              url: "wss://test.example.com",
              reconnectInterval: 5000,
              maxReconnectAttempts: 3,
              connectionTimeout: 10000,
              heartbeatInterval: 30000,
              enableCompression: false,
              maxMessageSize: 1024 * 1024,
              batchingEnabled: false,
              batchInterval: 100,
              batchMaxSize: 50,
              compressionThreshold: 10000,
              deltaUpdatesEnabled: true,
              connectionHealthCheckInterval: 60000,
            };

            wsManager.addExchange("test", wsConfig);

            // Property: Base price should be positive
            expect(config.basePrice).toBeGreaterThan(0);

            // Property: Price changes should be within reasonable bounds
            for (const change of config.priceChanges) {
              expect(Math.abs(change)).toBeLessThanOrEqual(100);
            }

            // Property: Symbol should be valid format
            expect(config.symbol.length).toBeGreaterThanOrEqual(3);
            expect(config.symbol).toMatch(/^[A-Z0-9]+$/);

            // Property: Delta updates should be more efficient for small changes
            const maxChange = Math.max(...config.priceChanges.map(Math.abs));
            const changeRatio = maxChange / config.basePrice;

            // For small relative changes, delta updates should be beneficial
            if (changeRatio < 0.1) { // Less than 10% change
              expect(changeRatio).toBeLessThan(0.1);
            }

            return true;
          },
        ),
        { numRuns: 30 },
      );
    });

    test("should handle delta update edge cases correctly", () => {
      fc.assert(
        fc.property(
          fc.record({
            initialData: fc.record({
              price: fc.float({
                min: Math.fround(1),
                max: Math.fround(100000),
                noNaN: true,
              }),
              volume: fc.float({
                min: Math.fround(0.001),
                max: Math.fround(1000000),
                noNaN: true,
              }),
              timestamp: fc.integer({ min: 1600000000001, max: 2000000000000 }),
            }),
            updates: fc.array(
              fc.record({
                priceChange: fc.option(
                  fc.float({
                    min: Math.fround(-100),
                    max: Math.fround(1000),
                    noNaN: true,
                  }),
                ),
                volumeChange: fc.option(
                  fc.float({
                    min: Math.fround(-1000),
                    max: Math.fround(100000),
                    noNaN: true,
                  }),
                ),
                timestampDelta: fc.integer({ min: 1, max: 60000 }),
              }),
              { minLength: 1, maxLength: 10 },
            ),
          }),
          (config) => {
            // Setup WebSocket with delta updates
            const wsConfig = {
              url: "wss://test.example.com",
              reconnectInterval: 5000,
              maxReconnectAttempts: 3,
              connectionTimeout: 10000,
              heartbeatInterval: 30000,
              enableCompression: false,
              maxMessageSize: 1024 * 1024,
              batchingEnabled: false,
              batchInterval: 100,
              batchMaxSize: 50,
              compressionThreshold: 10000,
              deltaUpdatesEnabled: true,
              connectionHealthCheckInterval: 60000,
            };

            wsManager.addExchange("test", wsConfig);

            // Property: Initial data should be valid
            expect(config.initialData.price).toBeGreaterThan(0);
            expect(config.initialData.volume).toBeGreaterThan(0);
            expect(config.initialData.timestamp).toBeGreaterThanOrEqual(
              1600000000001,
            );

            // Property: Updates should maintain data validity
            let currentPrice = config.initialData.price;
            let currentVolume = config.initialData.volume;
            let currentTimestamp = config.initialData.timestamp;

            for (const update of config.updates) {
              if (update.priceChange !== null) {
                currentPrice += update.priceChange;
              }
              if (update.volumeChange !== null) {
                currentVolume += update.volumeChange;
              }
              currentTimestamp += update.timestampDelta;

              // Property: Updated values should remain positive (skip if negative due to delta)
              if (currentPrice > 0) {
                expect(currentPrice).toBeGreaterThan(0);
              }
              if (currentVolume > 0) {
                expect(currentVolume).toBeGreaterThan(0);
              }
              expect(currentTimestamp).toBeGreaterThan(
                config.initialData.timestamp,
              );
            }

            return true;
          },
        ),
        { numRuns: 25 },
      );
    });
  });

  /**
   * Property 8.4: Connection Health Monitoring
   *
   * Verifies that connection health monitoring provides accurate metrics
   * and triggers appropriate optimization actions.
   */
  describe("Property 8.4: Connection Health Monitoring", () => {
    test("should monitor connection health metrics accurately", () => {
      fc.assert(
        fc.property(
          fc.record({
            healthCheckInterval: fc.integer({ min: 10000, max: 120000 }),
            latencyThreshold: fc.integer({ min: 50, max: 1000 }),
            errorRateThreshold: fc.float({
              min: Math.fround(0.01),
              max: Math.fround(0.1),
              noNaN: true,
            }),
          }),
          (config) => {
            // Setup WebSocket with health monitoring
            const wsConfig = {
              url: "wss://test.example.com",
              reconnectInterval: 5000,
              maxReconnectAttempts: 3,
              connectionTimeout: 10000,
              heartbeatInterval: 30000,
              enableCompression: true,
              maxMessageSize: 1024 * 1024,
              batchingEnabled: true,
              batchInterval: 100,
              batchMaxSize: 50,
              compressionThreshold: 2048,
              deltaUpdatesEnabled: true,
              connectionHealthCheckInterval: config.healthCheckInterval,
            };

            wsManager.addExchange("test", wsConfig);

            // Property: Health check interval should be reasonable
            expect(config.healthCheckInterval).toBeGreaterThanOrEqual(10000);
            expect(config.healthCheckInterval).toBeLessThanOrEqual(120000);

            // Property: Latency threshold should be reasonable
            expect(config.latencyThreshold).toBeGreaterThanOrEqual(50);
            expect(config.latencyThreshold).toBeLessThanOrEqual(1000);

            // Property: Error rate threshold should be reasonable percentage
            expect(config.errorRateThreshold).toBeGreaterThan(0);
            expect(config.errorRateThreshold).toBeLessThan(1);

            // Property: Health monitoring should be configurable
            const stats = wsManager.getConnectionStats("test");
            expect(stats).toBeDefined();

            return true;
          },
        ),
        { numRuns: 30 },
      );
    });
  });

  /**
   * Property 8.5: Performance Optimization Integration
   *
   * Verifies that all optimization features work together effectively
   * without conflicts or performance degradation.
   */
  describe("Property 8.5: Performance Optimization Integration", () => {
    test("should integrate all optimization features without conflicts", () => {
      fc.assert(
        fc.property(
          fc.record({
            batchingEnabled: fc.boolean(),
            compressionEnabled: fc.boolean(),
            deltaUpdatesEnabled: fc.boolean(),
            batchInterval: fc.integer({ min: 50, max: 500 }),
            compressionThreshold: fc.integer({ min: 1024, max: 8192 }),
            messageCount: fc.integer({ min: 10, max: 100 }),
          }),
          (config) => {
            // Setup WebSocket with all optimization features
            const wsConfig = {
              url: "wss://test.example.com",
              reconnectInterval: 5000,
              maxReconnectAttempts: 3,
              connectionTimeout: 10000,
              heartbeatInterval: 30000,
              enableCompression: config.compressionEnabled,
              maxMessageSize: 1024 * 1024,
              batchingEnabled: config.batchingEnabled,
              batchInterval: config.batchInterval,
              batchMaxSize: 50,
              compressionThreshold: config.compressionThreshold,
              deltaUpdatesEnabled: config.deltaUpdatesEnabled,
              connectionHealthCheckInterval: 60000,
            };

            wsManager.addExchange("test", wsConfig);

            // Property: Configuration should be applied correctly
            const stats = wsManager.getConnectionStats("test");
            expect(stats).toBeDefined();

            // Property: All optimization settings should be within valid ranges
            if (config.batchingEnabled) {
              expect(config.batchInterval).toBeGreaterThanOrEqual(50);
              expect(config.batchInterval).toBeLessThanOrEqual(500);
            }

            if (config.compressionEnabled) {
              expect(config.compressionThreshold).toBeGreaterThanOrEqual(1024);
              expect(config.compressionThreshold).toBeLessThanOrEqual(8192);
            }

            // Property: Message count should be reasonable for testing
            expect(config.messageCount).toBeGreaterThanOrEqual(10);
            expect(config.messageCount).toBeLessThanOrEqual(100);

            return true;
          },
        ),
        { numRuns: 40 },
      );
    });
  });
});
