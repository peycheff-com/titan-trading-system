/**
 * Unit tests for Execution Service
 */

import { ExecutionService, ExchangeConfig, OrderParams } from '../../dist/ExecutionService';

describe('ExecutionService Unit Tests', () => {
  let executionService: ExecutionService;

  beforeEach(() => {
    executionService = new ExecutionService();
  });

  afterEach(() => {
    executionService.shutdown();
  });

  describe('Basic Functionality', () => {
    it('should initialize correctly', () => {
      expect(executionService).toBeDefined();
      expect(executionService.getAvailableExchanges()).toHaveLength(0);
    });

    it('should add exchange brokers', () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);
      
      expect(executionService.getAvailableExchanges()).toContain('bybit');
    });

    it('should set default exchange', () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);
      executionService.setDefaultExchange('bybit');
      
      expect(executionService.getAvailableExchanges()).toContain('bybit');
    });

    it('should handle unsupported exchanges', () => {
      const config: ExchangeConfig = {
        name: 'unsupported',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api.unsupported.com',
          websocket: 'wss://stream.unsupported.com'
        }
      };

      expect(() => {
        executionService.addExchange(config);
      }).toThrow('Unsupported exchange: unsupported');
    });

    it('should place orders', async () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);
      executionService.setDefaultExchange('bybit');

      const orderParams: OrderParams = {
        phase: 'phase1',
        symbol: 'BTCUSDT',
        side: 'Buy',
        type: 'MARKET',
        qty: 0.1,
        leverage: 20
      };

      const result = await executionService.placeOrder(orderParams);
      
      expect(result).toBeDefined();
      expect(result.symbol).toBe('BTCUSDT');
      expect(result.side).toBe('Buy');
      expect(result.qty).toBe(0.1);
      expect(result.exchange).toBe('bybit');
      expect(result.phase).toBe('phase1');
    });

    it('should cancel orders', async () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);
      
      // Place an order first
      const orderParams: OrderParams = {
        phase: 'phase1',
        symbol: 'BTCUSDT',
        side: 'Buy',
        type: 'MARKET',
        qty: 0.1
      };

      const result = await executionService.placeOrder(orderParams, 'bybit');
      
      // Cancel the order
      await expect(executionService.cancelOrder(result.orderId, 'bybit')).resolves.not.toThrow();
    });

    it('should get order status', async () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);
      
      const status = await executionService.getOrderStatus('test-order-id', 'bybit');
      
      expect(status).toBeDefined();
      expect(status.orderId).toBe('test-order-id');
      expect(status.exchange).toBe('bybit');
    });

    it('should get account balance', async () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);
      
      const balance = await executionService.getBalance('bybit');
      
      expect(balance).toBeDefined();
      expect(typeof balance.USDT).toBe('number');
    });

    it('should get all balances', async () => {
      const bybitConfig: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      const mexcConfig: ExchangeConfig = {
        name: 'mexc',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api.mexc.com',
          websocket: 'wss://stream.mexc.com'
        }
      };

      executionService.addExchange(bybitConfig);
      executionService.addExchange(mexcConfig);
      
      const balances = await executionService.getAllBalances();
      
      expect(balances).toBeDefined();
      expect(balances.bybit).toBeDefined();
      expect(balances.mexc).toBeDefined();
    });

    it('should track orders', async () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);

      const orderParams: OrderParams = {
        phase: 'phase1',
        symbol: 'BTCUSDT',
        side: 'Buy',
        type: 'MARKET',
        qty: 0.1
      };

      await executionService.placeOrder(orderParams, 'bybit');
      
      const trackedOrders = executionService.getTrackedOrders();
      expect(trackedOrders).toHaveLength(1);
      expect(trackedOrders[0].phase).toBe('phase1');
    });

    it('should get orders by phase', async () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);

      const orderParams1: OrderParams = {
        phase: 'phase1',
        symbol: 'BTCUSDT',
        side: 'Buy',
        type: 'MARKET',
        qty: 0.1
      };

      const orderParams2: OrderParams = {
        phase: 'phase2',
        symbol: 'ETHUSDT',
        side: 'Sell',
        type: 'MARKET',
        qty: 1.0
      };

      await executionService.placeOrder(orderParams1, 'bybit');
      await executionService.placeOrder(orderParams2, 'bybit');
      
      const phase1Orders = executionService.getOrdersByPhase('phase1');
      const phase2Orders = executionService.getOrdersByPhase('phase2');
      
      expect(phase1Orders).toHaveLength(1);
      expect(phase2Orders).toHaveLength(1);
      expect(phase1Orders[0].symbol).toBe('BTCUSDT');
      expect(phase2Orders[0].symbol).toBe('ETHUSDT');
    });

    it('should check exchange health', async () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);
      
      const isHealthy = await executionService.checkExchangeHealth('bybit');
      expect(typeof isHealthy).toBe('boolean');
    });

    it('should cleanup old orders', async () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);

      const orderParams: OrderParams = {
        phase: 'phase1',
        symbol: 'BTCUSDT',
        side: 'Buy',
        type: 'MARKET',
        qty: 0.1
      };

      await executionService.placeOrder(orderParams, 'bybit');
      
      expect(executionService.getTrackedOrders()).toHaveLength(1);
      
      // Wait a bit then cleanup with very short age
      await new Promise(resolve => setTimeout(resolve, 10));
      executionService.cleanupOldOrders(5); // 5ms age limit
      
      expect(executionService.getTrackedOrders()).toHaveLength(0);
    });

    it('should shutdown gracefully', () => {
      const config: ExchangeConfig = {
        name: 'bybit',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        testnet: true,
        rateLimit: 10,
        endpoints: {
          rest: 'https://api-testnet.bybit.com',
          websocket: 'wss://stream-testnet.bybit.com'
        }
      };

      executionService.addExchange(config);
      
      expect(executionService.getAvailableExchanges()).toHaveLength(1);
      
      executionService.shutdown();
      
      expect(executionService.getAvailableExchanges()).toHaveLength(0);
      expect(executionService.getTrackedOrders()).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing exchange for order placement', async () => {
      const orderParams: OrderParams = {
        phase: 'phase1',
        symbol: 'BTCUSDT',
        side: 'Buy',
        type: 'MARKET',
        qty: 0.1
      };

      await expect(executionService.placeOrder(orderParams, 'nonexistent')).rejects.toThrow('Exchange nonexistent not available');
    });

    it('should handle missing exchange for order cancellation', async () => {
      await expect(executionService.cancelOrder('test-id', 'nonexistent')).rejects.toThrow('Exchange nonexistent not available');
    });

    it('should handle missing exchange for order status', async () => {
      await expect(executionService.getOrderStatus('test-id', 'nonexistent')).rejects.toThrow('Exchange nonexistent not available');
    });

    it('should handle missing exchange for balance', async () => {
      await expect(executionService.getBalance('nonexistent')).rejects.toThrow('Exchange nonexistent not available');
    });

    it('should handle invalid default exchange', () => {
      expect(() => {
        executionService.setDefaultExchange('nonexistent');
      }).toThrow('Exchange nonexistent not found');
    });
  });
});