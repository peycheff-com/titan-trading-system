/**
 * Unit tests for WebSocket Manager
 */

import { WebSocketManager, WebSocketConfig } from '../../dist/WebSocketManager';

describe('WebSocketManager Unit Tests', () => {
  let wsManager: WebSocketManager;

  beforeEach(() => {
    wsManager = new WebSocketManager();
  });

  afterEach(() => {
    wsManager.shutdown();
  });

  describe('Basic Functionality', () => {
    it('should initialize correctly', () => {
      expect(wsManager).toBeDefined();
      expect(wsManager.getGlobalStats().totalConnections).toBe(0);
    });

    it('should add exchange connections', () => {
      const config: WebSocketConfig = {
        url: 'wss://stream.binance.com:9443/ws/btcusdt@ticker',
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

      wsManager.addExchange('binance', config);
      
      expect(wsManager.getGlobalStats().totalConnections).toBe(1);
      expect(wsManager.getConnectionStatus('binance')).toBe('disconnected');
    });

    it('should handle duplicate exchange additions', () => {
      const config: WebSocketConfig = {
        url: 'wss://stream.binance.com:9443/ws/btcusdt@ticker',
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

      wsManager.addExchange('binance', config);
      wsManager.addExchange('binance', config); // Duplicate

      expect(wsManager.getGlobalStats().totalConnections).toBe(1);
    });

    it('should manage subscriptions', () => {
      const config: WebSocketConfig = {
        url: 'wss://stream.binance.com:9443/ws/btcusdt@ticker',
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

      wsManager.addExchange('binance', config);
      
      const callback = jest.fn();
      wsManager.subscribe('binance', 'BTCUSDT', callback);
      
      const subscriptions = wsManager.getAllSubscriptions();
      expect(subscriptions.binance).toContain('BTCUSDT');
      
      wsManager.unsubscribe('binance', 'BTCUSDT', callback);
      
      const updatedSubscriptions = wsManager.getAllSubscriptions();
      expect(updatedSubscriptions.binance).toHaveLength(0);
    });

    it('should handle invalid exchange operations', () => {
      expect(wsManager.getConnectionStatus('nonexistent')).toBeNull();
      expect(wsManager.getConnectionStats('nonexistent')).toBeNull();
      
      expect(() => {
        wsManager.disconnect('nonexistent');
      }).not.toThrow();
      
      expect(() => {
        const callback = jest.fn();
        wsManager.subscribe('nonexistent', 'BTCUSDT', callback);
      }).toThrow();
    });

    it('should shutdown gracefully', () => {
      const config: WebSocketConfig = {
        url: 'wss://stream.binance.com:9443/ws/btcusdt@ticker',
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

      wsManager.addExchange('binance', config);
      
      const callback = jest.fn();
      wsManager.subscribe('binance', 'BTCUSDT', callback);
      
      expect(wsManager.getGlobalStats().totalConnections).toBe(1);
      
      wsManager.shutdown();
      
      expect(wsManager.getGlobalStats().totalConnections).toBe(0);
      expect(Object.keys(wsManager.getAllSubscriptions())).toHaveLength(0);
    });
  });
});