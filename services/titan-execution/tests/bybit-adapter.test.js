/**
 * BybitAdapter Unit Tests
 * 
 * Tests the BybitAdapter implementation for:
 * - Order placement
 * - Order status polling
 * - Leverage setting
 * - Stop loss and take profit
 * - Position management
 * 
 * Requirements: 3.1-3.7 (Real Broker Integration)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BybitAdapter } from '../adapters/BybitAdapter.js';

describe('BybitAdapter', () => {
  let adapter;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    adapter = new BybitAdapter({
      apiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      testnet: true,
      logger: mockLogger,
    });
  });

  describe('Constructor', () => {
    it('should throw error if API key is missing', () => {
      expect(() => {
        new BybitAdapter({ apiSecret: 'secret' });
      }).toThrow('Bybit API key and secret are required');
    });

    it('should throw error if API secret is missing', () => {
      expect(() => {
        new BybitAdapter({ apiKey: 'key' });
      }).toThrow('Bybit API key and secret are required');
    });

    it('should use testnet URL when testnet is true', () => {
      const testnetAdapter = new BybitAdapter({
        apiKey: 'key',
        apiSecret: 'secret',
        testnet: true,
      });

      expect(testnetAdapter.baseUrl).toBe('https://api-testnet.bybit.com');
    });

    it('should use mainnet URL when testnet is false', () => {
      const mainnetAdapter = new BybitAdapter({
        apiKey: 'key',
        apiSecret: 'secret',
        testnet: false,
      });

      expect(mainnetAdapter.baseUrl).toBe('https://api.bybit.com');
    });
  });

  describe('Order Placement', () => {
    it('should format LIMIT order correctly', async () => {
      // Mock fetch to capture request
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 0,
          result: {
            orderId: '12345',
            orderLinkId: 'client-123',
            orderStatus: 'New',
            price: '50000',
            qty: '0.1',
          },
        }),
      });

      const result = await adapter.sendOrder({
        symbol: 'BTC/USDT',
        side: 'BUY',
        size: 0.1,
        limit_price: 50000,
        order_type: 'LIMIT',
        post_only: true,
        client_order_id: 'client-123',
      });

      expect(result.success).toBe(true);
      expect(result.broker_order_id).toBe('12345');
      expect(result.client_order_id).toBe('client-123');
    });

    it('should format MARKET order correctly', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 0,
          result: {
            orderId: '12346',
            orderLinkId: 'client-124',
            orderStatus: 'Filled',
            avgPrice: '50100',
            cumExecQty: '0.1',
          },
        }),
      });

      const result = await adapter.sendOrder({
        symbol: 'BTC/USDT',
        side: 'SELL',
        size: 0.1,
        order_type: 'MARKET',
        client_order_id: 'client-124',
      });

      expect(result.success).toBe(true);
      expect(result.filled).toBe(true);
      expect(result.fill_price).toBe(50100);
      expect(result.fill_size).toBe(0.1);
    });

    it('should handle API errors gracefully', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 10001,
          retMsg: 'Invalid API key',
        }),
      });

      const result = await adapter.sendOrder({
        symbol: 'BTC/USDT',
        side: 'BUY',
        size: 0.1,
        order_type: 'MARKET',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid API key'); // Match actual error message
    });
  });

  describe('Order Status Polling', () => {
    it('should poll until order is filled', async () => {
      let callCount = 0;

      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;

        if (callCount < 3) {
          // First 2 calls: order is pending
          return Promise.resolve({
            json: async () => ({
              retCode: 0,
              result: {
                list: [{
                  orderStatus: 'New',
                  avgPrice: '0',
                  cumExecQty: '0',
                  qty: '0.1',
                }],
              },
            }),
          });
        } else {
          // 3rd call: order is filled
          return Promise.resolve({
            json: async () => ({
              retCode: 0,
              result: {
                list: [{
                  orderStatus: 'Filled',
                  avgPrice: '50000',
                  cumExecQty: '0.1',
                  qty: '0.1',
                }],
              },
            }),
          });
        }
      });

      const result = await adapter.pollOrderStatus('12345', 'BTCUSDT', 5, 100);

      expect(result.success).toBe(true);
      expect(result.status).toBe('Filled');
      expect(result.fill_price).toBe(50000);
      expect(callCount).toBe(3);
    });

    it('should stop polling after max retries', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 0,
          result: {
            list: [{
              orderStatus: 'New',
              avgPrice: '0',
              cumExecQty: '0',
              qty: '0.1',
            }],
          },
        }),
      });

      const result = await adapter.pollOrderStatus('12345', 'BTCUSDT', 3, 50);

      expect(result.success).toBe(true);
      expect(result.status).toBe('New');
      expect(global.fetch).toHaveBeenCalledTimes(4); // 3 retries + 1 final check
    });
  });

  describe('Leverage Management', () => {
    it('should set leverage correctly', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 0,
          result: {},
        }),
      });

      const result = await adapter.setLeverage('BTCUSDT', 20);

      expect(result.success).toBe(true);
      expect(result.leverage).toBe(20);
    });

    it('should handle leverage errors', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 10001,
          retMsg: 'Leverage too high',
        }),
      });

      const result = await adapter.setLeverage('BTCUSDT', 200);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Leverage too high'); // Match actual error message
    });
  });

  describe('Stop Loss and Take Profit', () => {
    it('should set stop loss correctly', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 0,
          result: {},
        }),
      });

      const result = await adapter.setStopLoss('BTCUSDT', 49000);

      expect(result.success).toBe(true);
      expect(result.stop_loss).toBe(49000);
    });

    it('should set take profit correctly', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 0,
          result: {},
        }),
      });

      const result = await adapter.setTakeProfit('BTCUSDT', 51000);

      expect(result.success).toBe(true);
      expect(result.take_profit).toBe(51000);
    });
  });

  describe('Position Management', () => {
    it('should get positions correctly', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 0,
          result: {
            list: [
              {
                symbol: 'BTCUSDT',
                side: 'Buy',
                size: '0.1',
                avgPrice: '50000',
                unrealisedPnl: '100',
                leverage: '20',
              },
              {
                symbol: 'ETHUSDT',
                side: 'Sell',
                size: '1.5',
                avgPrice: '3000',
                unrealisedPnl: '-50',
                leverage: '10',
              },
            ],
          },
        }),
      });

      const positions = await adapter.getPositions();

      expect(positions).toHaveLength(2);
      expect(positions[0].symbol).toBe('BTCUSDT');
      expect(positions[0].side).toBe('LONG');
      expect(positions[0].size).toBe(0.1);
      expect(positions[1].symbol).toBe('ETHUSDT');
      expect(positions[1].side).toBe('SHORT');
    });

    it('should filter out zero-size positions', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 0,
          result: {
            list: [
              {
                symbol: 'BTCUSDT',
                side: 'Buy',
                size: '0.1',
                avgPrice: '50000',
                unrealisedPnl: '100',
                leverage: '20',
              },
              {
                symbol: 'ETHUSDT',
                side: 'Sell',
                size: '0',
                avgPrice: '0',
                unrealisedPnl: '0',
                leverage: '1',
              },
            ],
          },
        }),
      });

      const positions = await adapter.getPositions();

      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('BTCUSDT');
    });
  });

  describe('Account Management', () => {
    it('should get account balance correctly', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 0,
          result: {
            list: [{
              coin: [
                {
                  coin: 'USDT',
                  walletBalance: '10000',
                  availableToWithdraw: '9500',
                },
              ],
            }],
          },
        }),
      });

      const account = await adapter.getAccount();

      expect(account.success).toBe(true);
      expect(account.balance).toBe(10000);
      expect(account.available_balance).toBe(9500);
    });

    it('should get equity correctly', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: async () => ({
          retCode: 0,
          result: {
            list: [{
              coin: [
                {
                  coin: 'USDT',
                  walletBalance: '10000',
                  availableToWithdraw: '9500',
                },
              ],
            }],
          },
        }),
      });

      const equity = await adapter.getEquity();

      expect(equity).toBe(10000);
    });
  });
});
