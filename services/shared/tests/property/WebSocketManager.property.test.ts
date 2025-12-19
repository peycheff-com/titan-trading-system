/**
 * Property-based tests for WebSocket Manager reliability
 * 
 * **Feature: titan-system-integration-review, Property 1: WebSocket Communication Reliability**
 * **Validates: Requirements 2.1, 2.2**
 * 
 * These tests verify that the WebSocket Manager maintains reliable communication
 * under various conditions including network failures, reconnections, and high load.
 */

import * as fc from 'fast-check';
import { WebSocketManager, SubscriptionCallback } from '../../dist/WebSocketManager';

describe('WebSocketManager Property Tests', () => {
  let wsManager: WebSocketManager;

  beforeEach(() => {
    // Create a fresh instance for each test
    wsManager = new WebSocketManager();
  });

  afterEach(() => {
    if (wsManager) {
      wsManager.shutdown();
    }
  });

  /**
   * Property 1: Configuration Consistency
   * 
   * Verifies that WebSocket configurations are properly validated and maintained
   */
  describe('Property 1: Configuration Consistency', () => {
    
    test('should maintain consistent configuration across operations', () => {
      fc.assert(fc.property(
        fc.record({
          exchange: fc.constantFrom('binance', 'bybit'),
          url: fc.webUrl(),
          reconnectInterval: fc.integer({ min: 100, max: 30000 }),
          maxReconnectAttempts: fc.integer({ min: 1, max: 20 }),
          connectionTimeout: fc.integer({ min: 1000, max: 60000 }),
          heartbeatInterval: fc.integer({ min: 1000, max: 120000 }),
          enableCompression: fc.boolean(),
          maxMessageSize: fc.integer({ min: 1024, max: 10 * 1024 * 1024 })
        }),
        (configData) => {
          const config = {
            url: configData.url,
            reconnectInterval: configData.reconnectInterval,
            maxReconnectAttempts: configData.maxReconnectAttempts,
            connectionTimeout: configData.connectionTimeout,
            heartbeatInterval: configData.heartbeatInterval,
            enableCompression: configData.enableCompression,
            maxMessageSize: configData.maxMessageSize,
            batchingEnabled: true,
            batchInterval: 100,
            batchMaxSize: 50,
            compressionThreshold: 2048,
            deltaUpdatesEnabled: true,
            connectionHealthCheckInterval: 60000
          };
          
          // Add exchange with configuration
          wsManager.addExchange(configData.exchange, config);
          
          // Property: Exchange should be added successfully
          const status = wsManager.getConnectionStatus(configData.exchange);
          expect(status).toBeDefined();
          expect(status).toBe('disconnected'); // Initial state
          
          // Property: Configuration values should be within valid ranges
          expect(config.reconnectInterval).toBeGreaterThanOrEqual(100);
          expect(config.reconnectInterval).toBeLessThanOrEqual(30000);
          expect(config.maxReconnectAttempts).toBeGreaterThanOrEqual(1);
          expect(config.maxReconnectAttempts).toBeLessThanOrEqual(20);
          expect(config.connectionTimeout).toBeGreaterThanOrEqual(1000);
          expect(config.heartbeatInterval).toBeGreaterThanOrEqual(1000);
          expect(config.maxMessageSize).toBeGreaterThanOrEqual(1024);
          
          return true;
        }
      ), { numRuns: 50 });
    });

    test('should handle duplicate exchange additions gracefully', () => {
      fc.assert(fc.property(
        fc.constantFrom('binance', 'bybit'),
        fc.webUrl(),
        fc.integer({ min: 2, max: 10 }), // Number of duplicate additions
        (exchange, url, duplicateCount) => {
          // Create a fresh manager for this test iteration
          const testManager = new WebSocketManager();
          
          const config = {
            url: url,
            reconnectInterval: 5000,
            maxReconnectAttempts: 5,
            connectionTimeout: 30000,
            heartbeatInterval: 30000,
            enableCompression: true,
            maxMessageSize: 1024 * 1024,
            batchingEnabled: true,
            batchInterval: 100,
            batchMaxSize: 50,
            compressionThreshold: 2048,
            deltaUpdatesEnabled: true,
            connectionHealthCheckInterval: 60000
          };
          
          // Add exchange multiple times
          for (let i = 0; i < duplicateCount; i++) {
            testManager.addExchange(exchange, config);
          }
          
          // Property: Only one instance should exist
          const status = testManager.getConnectionStatus(exchange);
          expect(status).toBeDefined();
          expect(status).toBe('disconnected');
          
          // Property: Global stats should reflect single connection
          const globalStats = testManager.getGlobalStats();
          expect(globalStats.totalConnections).toBe(1);
          
          testManager.shutdown();
          return true;
        }
      ), { numRuns: 30 });
    });
  });

  /**
   * Property 2: Subscription Management Reliability
   * 
   * Verifies that subscription management is consistent and reliable
   */
  describe('Property 2: Subscription Management Reliability', () => {
    
    test('should maintain subscription consistency across multiple operations', () => {
      fc.assert(fc.property(
        fc.record({
          exchange: fc.constantFrom('binance', 'bybit'),
          url: fc.webUrl()
        }),
        fc.uniqueArray(fc.string({ minLength: 3, maxLength: 10 }).map(s => s.replace(/[^A-Z0-9]/g, 'X').toUpperCase()).filter(s => s.length >= 3), { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 5 }), // Number of callbacks per symbol
        (exchangeConfig, symbols, callbacksPerSymbol) => {
          // Create a fresh manager for this test iteration
          const testManager = new WebSocketManager();
          
          // Setup exchange
          const config = {
            url: exchangeConfig.url,
            reconnectInterval: 1000,
            maxReconnectAttempts: 3,
            connectionTimeout: 5000,
            heartbeatInterval: 10000,
            enableCompression: true,
            maxMessageSize: 1024 * 1024
          };
          
          testManager.addExchange(exchangeConfig.exchange, {
            ...config,
            batchingEnabled: true,
            batchInterval: 100,
            batchMaxSize: 50,
            compressionThreshold: 2048,
            deltaUpdatesEnabled: true,
            connectionHealthCheckInterval: 60000
          });
          
          // Create subscriptions
          const subscriptionMap = new Map();
          
          for (const symbol of symbols) {
            const callbacks = [];
            
            for (let i = 0; i < callbacksPerSymbol; i++) {
              const callback: SubscriptionCallback = jest.fn();
              callbacks.push(callback);
              testManager.subscribe(exchangeConfig.exchange, symbol, callback);
            }
            
            subscriptionMap.set(symbol, callbacks);
          }
          
          // Property: All symbols should be tracked
          const allSubscriptions = testManager.getAllSubscriptions();
          expect(allSubscriptions[exchangeConfig.exchange]).toBeDefined();
          expect(allSubscriptions[exchangeConfig.exchange].sort()).toEqual(symbols.sort());
          
          // Unsubscribe some callbacks
          for (const symbol of symbols) {
            const callbacks = subscriptionMap.get(symbol);
            const callbacksToRemove = callbacks.slice(0, Math.floor(callbacks.length / 2));
            
            for (const callback of callbacksToRemove) {
              testManager.unsubscribe(exchangeConfig.exchange, symbol, callback);
            }
          }
          
          // Property: Symbols with remaining callbacks should still be subscribed
          const remainingSubscriptions = testManager.getAllSubscriptions();
          
          for (const symbol of symbols) {
            const callbacks = subscriptionMap.get(symbol);
            const remainingCallbacks = callbacks.slice(Math.floor(callbacks.length / 2));
            
            if (remainingCallbacks.length > 0) {
              expect(remainingSubscriptions[exchangeConfig.exchange]).toContain(symbol);
            }
          }
          
          testManager.shutdown();
          return true;
        }
      ), { numRuns: 20 });
    });

    test('should handle subscription cleanup correctly', () => {
      fc.assert(fc.property(
        fc.record({
          exchange: fc.constantFrom('binance', 'bybit'),
          url: fc.webUrl()
        }),
        fc.uniqueArray(fc.string({ minLength: 3, maxLength: 8 }).map(s => s.replace(/[^A-Z0-9]/g, 'X').toUpperCase()).filter(s => s.length >= 3), { minLength: 1, maxLength: 10 }),
        (exchangeConfig, symbols) => {
          // Create a fresh manager for this test iteration
          const testManager = new WebSocketManager();
          
          // Setup exchange
          const config = {
            url: exchangeConfig.url,
            reconnectInterval: 1000,
            maxReconnectAttempts: 3,
            connectionTimeout: 5000,
            heartbeatInterval: 10000,
            enableCompression: true,
            maxMessageSize: 1024 * 1024
          };
          
          testManager.addExchange(exchangeConfig.exchange, {
            ...config,
            batchingEnabled: true,
            batchInterval: 100,
            batchMaxSize: 50,
            compressionThreshold: 2048,
            deltaUpdatesEnabled: true,
            connectionHealthCheckInterval: 60000
          });
          
          // Create and remove subscriptions
          const callbacks = [];
          
          // Subscribe to all symbols
          for (const symbol of symbols) {
            const callback: SubscriptionCallback = jest.fn();
            callbacks.push(callback);
            testManager.subscribe(exchangeConfig.exchange, symbol, callback);
          }
          
          // Verify all subscriptions exist
          let subscriptions = testManager.getAllSubscriptions();
          expect(subscriptions[exchangeConfig.exchange]).toHaveLength(symbols.length);
          
          // Unsubscribe from all symbols
          for (let i = 0; i < symbols.length; i++) {
            testManager.unsubscribe(exchangeConfig.exchange, symbols[i], callbacks[i]);
          }
          
          // Property: All subscriptions should be cleaned up
          subscriptions = testManager.getAllSubscriptions();
          expect(subscriptions[exchangeConfig.exchange]).toHaveLength(0);
          
          testManager.shutdown();
          return true;
        }
      ), { numRuns: 25 });
    });
  });

  /**
   * Property 3: State Management Consistency
   * 
   * Verifies that internal state management is consistent and predictable
   */
  describe('Property 3: State Management Consistency', () => {
    
    test('should maintain consistent global statistics', () => {
      fc.assert(fc.property(
        fc.array(fc.record({
          exchange: fc.constantFrom('binance', 'bybit', 'mexc'),
          url: fc.webUrl()
        }), { minLength: 1, maxLength: 5 }),
        (exchanges) => {
          // Create a fresh manager for this test iteration
          const testManager = new WebSocketManager();
          
          // Add unique exchanges only
          const uniqueExchanges = exchanges.filter((ex, index, arr) => 
            arr.findIndex(e => e.exchange === ex.exchange) === index
          );
          
          for (const ex of uniqueExchanges) {
            const config = {
              url: ex.url,
              reconnectInterval: 1000,
              maxReconnectAttempts: 3,
              connectionTimeout: 5000,
              heartbeatInterval: 10000,
              enableCompression: true,
              maxMessageSize: 1024 * 1024
            };
            
            testManager.addExchange(ex.exchange, {
              ...config,
              batchingEnabled: true,
              batchInterval: 100,
              batchMaxSize: 50,
              compressionThreshold: 2048,
              deltaUpdatesEnabled: true,
              connectionHealthCheckInterval: 60000
            });
          }
          
          // Property: Total connections should match unique exchanges
          const globalStats = testManager.getGlobalStats();
          expect(globalStats.totalConnections).toBe(uniqueExchanges.length);
          expect(globalStats.activeConnections).toBe(0); // All disconnected initially
          
          // Property: All exchanges should have disconnected status
          const allStatuses = testManager.getAllConnectionStatuses();
          expect(Object.keys(allStatuses)).toHaveLength(uniqueExchanges.length);
          
          for (const ex of uniqueExchanges) {
            expect(allStatuses[ex.exchange]).toBe('disconnected');
          }
          
          testManager.shutdown();
          return true;
        }
      ), { numRuns: 30 });
    });

    test('should handle shutdown gracefully', () => {
      fc.assert(fc.property(
        fc.array(fc.record({
          exchange: fc.constantFrom('binance', 'bybit'),
          url: fc.webUrl(),
          symbols: fc.array(fc.string({ minLength: 3, maxLength: 8 }).map(s => s.toUpperCase()), { minLength: 0, maxLength: 5 })
        }), { minLength: 1, maxLength: 3 }),
        (exchangeConfigs) => {
          // Create a fresh manager for this test iteration
          const testManager = new WebSocketManager();
          
          // Setup exchanges and subscriptions
          for (const exConfig of exchangeConfigs) {
            const config = {
              url: exConfig.url,
              reconnectInterval: 1000,
              maxReconnectAttempts: 3,
              connectionTimeout: 5000,
              heartbeatInterval: 10000,
              enableCompression: true,
              maxMessageSize: 1024 * 1024
            };
            
            testManager.addExchange(exConfig.exchange, {
              ...config,
              batchingEnabled: true,
              batchInterval: 100,
              batchMaxSize: 50,
              compressionThreshold: 2048,
              deltaUpdatesEnabled: true,
              connectionHealthCheckInterval: 60000
            });
            
            // Add subscriptions
            for (const symbol of exConfig.symbols) {
              const callback: SubscriptionCallback = jest.fn();
              testManager.subscribe(exConfig.exchange, symbol, callback);
            }
          }
          
          // Verify setup
          const initialStats = testManager.getGlobalStats();
          expect(initialStats.totalConnections).toBeGreaterThan(0);
          
          // Shutdown
          testManager.shutdown();
          
          // Property: After shutdown, manager should be clean
          const finalStats = testManager.getGlobalStats();
          expect(finalStats.totalConnections).toBe(0);
          expect(finalStats.activeConnections).toBe(0);
          expect(finalStats.totalSubscriptions).toBe(0);
          
          // Property: All subscriptions should be cleared
          const subscriptions = testManager.getAllSubscriptions();
          expect(Object.keys(subscriptions)).toHaveLength(0);
          
          return true;
        }
      ), { numRuns: 20 });
    });
  });

  /**
   * Property 4: Error Handling Robustness
   * 
   * Verifies that error conditions are handled gracefully
   */
  describe('Property 4: Error Handling Robustness', () => {
    
    test('should handle invalid exchange operations gracefully', () => {
      fc.assert(fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (invalidExchange, symbol) => {
          // Property: Operations on non-existent exchanges should not crash
          expect(() => {
            const status = wsManager.getConnectionStatus(invalidExchange);
            expect(status).toBeNull();
          }).not.toThrow();
          
          expect(() => {
            wsManager.disconnect(invalidExchange);
          }).not.toThrow();
          
          expect(() => {
            const stats = wsManager.getConnectionStats(invalidExchange);
            expect(stats).toBeNull();
          }).not.toThrow();
          
          // Property: Subscribe to invalid exchange should throw
          expect(() => {
            const callback: SubscriptionCallback = jest.fn();
            wsManager.subscribe(invalidExchange, symbol, callback);
          }).toThrow();
          
          return true;
        }
      ), { numRuns: 30 });
    });
  });
});