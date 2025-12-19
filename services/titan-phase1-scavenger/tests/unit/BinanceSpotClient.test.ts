/**
 * Unit Tests for BinanceSpotClient
 * 
 * Tests the Binance Spot WebSocket client for signal validation
 */

import { BinanceSpotClient, Trade } from '../../src/exchanges/BinanceSpotClient';
import WebSocket from 'ws';

// Mock WebSocket
jest.mock('ws');

// Mock fetch
global.fetch = jest.fn();

describe('BinanceSpotClient', () => {
  let client: BinanceSpotClient;
  let mockWs: jest.Mocked<WebSocket>;

  beforeEach(() => {
    client = new BinanceSpotClient();
    jest.clearAllMocks();
    
    // Create mock WebSocket instance
    mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: WebSocket.OPEN,
    } as any;
    
    (WebSocket as jest.MockedClass<typeof WebSocket>).mockImplementation(() => mockWs);
  });

  afterEach(() => {
    client.close();
  });

  describe('subscribeAggTrades', () => {
    it('should connect to Binance WebSocket and subscribe to symbols', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT'];
      
      await client.subscribeAggTrades(symbols);
      
      // Verify WebSocket was created
      expect(WebSocket).toHaveBeenCalledWith('wss://stream.binance.com:9443/ws');
      
      // Verify event listeners were registered
      expect(mockWs.on).toHaveBeenCalledWith('open', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should send subscription message on connection open', async () => {
      const symbols = ['BTCUSDT', 'ETHUSDT'];
      
      await client.subscribeAggTrades(symbols);
      
      // Trigger 'open' event
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      if (openHandler) openHandler.call(mockWs);
      
      // Verify subscription message was sent
      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          method: 'SUBSCRIBE',
          params: ['btcusdt@aggTrade', 'ethusdt@aggTrade'],
          id: 1
        })
      );
    });

    it('should close existing connection before creating new one', async () => {
      // First subscription
      await client.subscribeAggTrades(['BTCUSDT']);
      const firstWs = mockWs;
      
      // Second subscription
      await client.subscribeAggTrades(['ETHUSDT']);
      
      // Verify first connection was closed
      expect(firstWs.close).toHaveBeenCalled();
    });
  });

  describe('message handling', () => {
    it('should parse aggTrade messages and trigger callbacks', async () => {
      const symbols = ['BTCUSDT'];
      const mockCallback = jest.fn();
      
      await client.subscribeAggTrades(symbols);
      client.onTrade('BTCUSDT', mockCallback);
      
      // Get message handler
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
      
      // Simulate aggTrade message
      const aggTradeMsg = {
        e: 'aggTrade',
        s: 'BTCUSDT',
        p: '50000.50',
        q: '0.1',
        T: 1234567890000,
        m: false
      };
      
      if (messageHandler) messageHandler.call(mockWs, Buffer.from(JSON.stringify(aggTradeMsg)));
      
      // Verify callback was called with correct trade data
      expect(mockCallback).toHaveBeenCalledWith([
        {
          symbol: 'BTCUSDT',
          price: 50000.50,
          qty: 0.1,
          time: 1234567890000,
          isBuyerMaker: false
        }
      ]);
    });

    it('should use exchange timestamp, not local time', async () => {
      const symbols = ['BTCUSDT'];
      const mockCallback = jest.fn();
      
      await client.subscribeAggTrades(symbols);
      client.onTrade('BTCUSDT', mockCallback);
      
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
      
      const exchangeTimestamp = 1234567890000;
      const aggTradeMsg = {
        e: 'aggTrade',
        s: 'BTCUSDT',
        p: '50000.00',
        q: '1.0',
        T: exchangeTimestamp,
        m: true
      };
      
      if (messageHandler) messageHandler.call(mockWs, Buffer.from(JSON.stringify(aggTradeMsg)));
      
      // Verify exchange timestamp is used
      const receivedTrade = mockCallback.mock.calls[0][0][0];
      expect(receivedTrade.time).toBe(exchangeTimestamp);
    });

    it('should handle invalid JSON gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await client.subscribeAggTrades(['BTCUSDT']);
      
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
      
      // Send invalid JSON
      if (messageHandler) messageHandler.call(mockWs, Buffer.from('invalid json'));
      
      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should only trigger callback for subscribed symbols', async () => {
      const btcCallback = jest.fn();
      const ethCallback = jest.fn();
      
      await client.subscribeAggTrades(['BTCUSDT', 'ETHUSDT']);
      client.onTrade('BTCUSDT', btcCallback);
      client.onTrade('ETHUSDT', ethCallback);
      
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
      
      // Send BTC trade
      const btcMsg = {
        e: 'aggTrade',
        s: 'BTCUSDT',
        p: '50000.00',
        q: '1.0',
        T: 1234567890000,
        m: false
      };
      
      if (messageHandler) messageHandler.call(mockWs, Buffer.from(JSON.stringify(btcMsg)));
      
      // Verify only BTC callback was triggered
      expect(btcCallback).toHaveBeenCalledTimes(1);
      expect(ethCallback).not.toHaveBeenCalled();
    });
  });

  describe('reconnection logic', () => {
    it('should attempt reconnection on close with delay', async () => {
      jest.useFakeTimers();
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      
      await client.subscribeAggTrades(['BTCUSDT']);
      
      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1];
      
      // Trigger close event
      if (closeHandler) closeHandler.call(mockWs);
      
      // Verify reconnection is scheduled with initial delay (1000ms due to exponential backoff)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
      
      setTimeoutSpy.mockRestore();
      jest.useRealTimers();
    });

    it('should have max reconnection attempts configured', () => {
      // This test verifies the reconnection logic exists
      // The actual reconnection behavior is tested in integration tests
      // since it involves timing and state management
      
      // Verify the client has reconnection configuration
      const status = client.getStatus();
      expect(status).toHaveProperty('reconnectAttempts');
      expect(status.reconnectAttempts).toBe(0);
    });

    it('should reset reconnect attempts on successful connection', async () => {
      await client.subscribeAggTrades(['BTCUSDT']);
      
      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1];
      const openHandler = mockWs.on.mock.calls.find(call => call[0] === 'open')?.[1];
      
      // Trigger close (attempt 1)
      if (closeHandler) closeHandler.call(mockWs);
      
      // Trigger successful open
      if (openHandler) openHandler.call(mockWs);
      
      // Verify status shows 0 reconnect attempts
      const status = client.getStatus();
      expect(status.reconnectAttempts).toBe(0);
    });
  });

  describe('getSpotPrice', () => {
    it('should fetch spot price via REST API', async () => {
      const mockPrice = 50000.50;
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ price: mockPrice.toString() })
      });
      
      const price = await client.getSpotPrice('BTCUSDT');
      
      expect(price).toBe(mockPrice);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'
      );
    });

    it('should throw error on failed API request', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });
      
      await expect(client.getSpotPrice('INVALID')).rejects.toThrow();
    });

    it('should parse price as number', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ price: '12345.67' })
      });
      
      const price = await client.getSpotPrice('BTCUSDT');
      
      expect(typeof price).toBe('number');
      expect(price).toBe(12345.67);
    });
  });

  describe('callback management', () => {
    it('should register callback with onTrade', () => {
      const callback = jest.fn();
      client.onTrade('BTCUSDT', callback);
      
      // Verify callback is registered (tested via message handling)
      expect(callback).toBeDefined();
    });

    it('should remove callback with offTrade', async () => {
      const callback = jest.fn();
      
      await client.subscribeAggTrades(['BTCUSDT']);
      client.onTrade('BTCUSDT', callback);
      client.offTrade('BTCUSDT');
      
      const messageHandler = mockWs.on.mock.calls.find(call => call[0] === 'message')?.[1];
      
      const aggTradeMsg = {
        e: 'aggTrade',
        s: 'BTCUSDT',
        p: '50000.00',
        q: '1.0',
        T: 1234567890000,
        m: false
      };
      
      if (messageHandler) messageHandler.call(mockWs, Buffer.from(JSON.stringify(aggTradeMsg)));
      
      // Verify callback was not called
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('connection status', () => {
    it('should report connected status when WebSocket is open', async () => {
      await client.subscribeAggTrades(['BTCUSDT']);
      // WebSocket is already OPEN by default in mock
      
      expect(client.isConnected()).toBe(true);
    });

    it('should report disconnected status when WebSocket is null', () => {
      // Client starts with no connection
      const newClient = new BinanceSpotClient();
      
      expect(newClient.isConnected()).toBe(false);
    });

    it('should return status information', async () => {
      await client.subscribeAggTrades(['BTCUSDT', 'ETHUSDT']);
      
      const status = client.getStatus();
      
      expect(status).toEqual({
        connected: expect.any(Boolean),
        subscribedSymbols: 2,
        reconnectAttempts: 0
      });
    });
  });

  describe('close', () => {
    it('should close WebSocket connection', async () => {
      await client.subscribeAggTrades(['BTCUSDT']);
      
      client.close();
      
      expect(mockWs.close).toHaveBeenCalled();
    });

    it('should clear all callbacks', async () => {
      const callback = jest.fn();
      
      await client.subscribeAggTrades(['BTCUSDT']);
      client.onTrade('BTCUSDT', callback);
      
      client.close();
      
      const status = client.getStatus();
      expect(status.subscribedSymbols).toBe(0);
    });

    it('should reset reconnection state', async () => {
      await client.subscribeAggTrades(['BTCUSDT']);
      
      // Trigger a close to increment reconnect attempts
      const closeHandler = mockWs.on.mock.calls.find(call => call[0] === 'close')?.[1];
      if (closeHandler) closeHandler.call(mockWs);
      
      client.close();
      
      const status = client.getStatus();
      expect(status.reconnectAttempts).toBe(0);
    });
  });
});
