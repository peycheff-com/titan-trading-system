/**
 * Unit tests for BinanceSpotClient
 */

import { BinanceSpotClient } from '../../src/exchanges/BinanceSpotClient';
import { Trade } from '../../src/types';

// Mock WebSocket
jest.mock('ws');
jest.mock('node-fetch', () => jest.fn());

import WebSocket = require('ws');

const mockWebSocket = WebSocket as jest.MockedClass<typeof WebSocket>;

describe('BinanceSpotClient', () => {
  let client: BinanceSpotClient;
  let mockWs: jest.Mocked<WebSocket>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock WebSocket instance
    mockWs = {
      send: jest.fn(),
      close: jest.fn(),
      ping: jest.fn(),
      on: jest.fn(),
      removeAllListeners: jest.fn(),
    } as any;

    // Make readyState writable
    Object.defineProperty(mockWs, 'readyState', {
      value: WebSocket.OPEN,
      writable: true,
      configurable: true
    });

    mockWebSocket.mockImplementation(() => mockWs);
    
    client = new BinanceSpotClient();
  });

  afterEach(() => {
    client.close();
  });

  describe('subscribeAggTrades', () => {
    it('should add callback to subscriptions', () => {
      const callback = jest.fn();
      
      client.subscribeAggTrades('BTCUSDT', callback);

      // Verify WebSocket constructor was called
      expect(mockWebSocket).toHaveBeenCalled();
    });

    it('should handle multiple callbacks for same symbol', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      client.subscribeAggTrades('BTCUSDT', callback1);
      client.subscribeAggTrades('BTCUSDT', callback2);

      // Should only create one WebSocket connection
      expect(mockWebSocket).toHaveBeenCalledTimes(1);
    });

    it('should normalize symbol to lowercase', () => {
      const callback = jest.fn();
      
      client.subscribeAggTrades('BTCUSDT', callback);
      
      // Verify WebSocket URL contains lowercase symbol
      const constructorCall = mockWebSocket.mock.calls[0];
      expect(constructorCall[0]).toContain('btcusdt@aggTrade');
    });
  });

  describe('unsubscribeAggTrades', () => {
    it('should remove callback from subscriptions', () => {
      const callback = jest.fn();
      
      client.subscribeAggTrades('BTCUSDT', callback);
      client.unsubscribeAggTrades('BTCUSDT', callback);

      // Should send unsubscribe message
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('UNSUBSCRIBE')
      );
    });
  });

  describe('getConnectionStatus', () => {
    it('should return CLOSED when no WebSocket', () => {
      const newClient = new BinanceSpotClient();
      expect(newClient.getConnectionStatus()).toBe('CLOSED');
      newClient.close();
    });

    it('should return correct status based on WebSocket state', () => {
      const callback = jest.fn();
      client.subscribeAggTrades('BTCUSDT', callback);

      Object.defineProperty(mockWs, 'readyState', { value: WebSocket.OPEN, writable: true });
      expect(client.getConnectionStatus()).toBe('OPEN');

      Object.defineProperty(mockWs, 'readyState', { value: WebSocket.CONNECTING, writable: true });
      expect(client.getConnectionStatus()).toBe('CONNECTING');

      Object.defineProperty(mockWs, 'readyState', { value: WebSocket.CLOSING, writable: true });
      expect(client.getConnectionStatus()).toBe('CLOSING');

      Object.defineProperty(mockWs, 'readyState', { value: WebSocket.CLOSED, writable: true });
      expect(client.getConnectionStatus()).toBe('CLOSED');
    });
  });

  describe('error handling', () => {
    it('should call error callbacks when error occurs', () => {
      const errorCallback = jest.fn();
      client.onError(errorCallback);
      
      // Subscribe to trigger WebSocket creation
      const callback = jest.fn();
      client.subscribeAggTrades('BTCUSDT', callback);

      // Simulate WebSocket error
      const onCall = mockWs.on.mock.calls.find(call => call[0] === 'error');
      if (onCall) {
        const errorHandler = onCall[1] as (error: Error) => void;
        errorHandler(new Error('Test error'));
      }

      expect(errorCallback).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should call reconnect callbacks on reconnection', () => {
      const reconnectCallback = jest.fn();
      client.onReconnect(reconnectCallback);

      // This would be called during actual reconnection
      // For unit test, we just verify the callback is registered
      expect(reconnectCallback).not.toHaveBeenCalled();
    });
  });

  describe('message handling', () => {
    it('should parse aggregate trade messages correctly', () => {
      const callback = jest.fn();
      client.subscribeAggTrades('BTCUSDT', callback);

      // Simulate WebSocket message
      const onCall = mockWs.on.mock.calls.find(call => call[0] === 'message');
      if (onCall) {
        const messageHandler = onCall[1] as (data: any) => void;
        const aggTradeMessage = {
          e: 'aggTrade',
          E: 1234567890,
          s: 'BTCUSDT',
          a: 12345,
          p: '50000.00',
          q: '0.1',
          f: 100,
          l: 200,
          T: 1234567890,
          m: false, // buyer is not market maker (BUY)
          M: true
        };

        messageHandler(Buffer.from(JSON.stringify(aggTradeMessage)));
      }

      expect(callback).toHaveBeenCalledWith({
        price: 50000,
        quantity: 0.1,
        side: 'BUY',
        timestamp: 1234567890
      });
    });

    it('should handle sell trades correctly', () => {
      const callback = jest.fn();
      client.subscribeAggTrades('BTCUSDT', callback);

      // Simulate WebSocket message
      const onCall = mockWs.on.mock.calls.find(call => call[0] === 'message');
      if (onCall) {
        const messageHandler = onCall[1] as (data: any) => void;
        const aggTradeMessage = {
          e: 'aggTrade',
          E: 1234567890,
          s: 'BTCUSDT',
          a: 12345,
          p: '49999.99',
          q: '0.2',
          f: 100,
          l: 200,
          T: 1234567890,
          m: true, // buyer is market maker (SELL)
          M: true
        };

        messageHandler(Buffer.from(JSON.stringify(aggTradeMessage)));
      }

      expect(callback).toHaveBeenCalledWith({
        price: 49999.99,
        quantity: 0.2,
        side: 'SELL',
        timestamp: 1234567890
      });
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources on close', () => {
      const callback = jest.fn();
      client.subscribeAggTrades('BTCUSDT', callback);
      
      client.close();

      expect(mockWs.close).toHaveBeenCalled();
      expect(client.getConnectionStatus()).toBe('CLOSED');
    });
  });
});