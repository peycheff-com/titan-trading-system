/**
 * Tests for the server improvements
 */

import { jest } from '@jest/globals';
import { Container } from '../utils/Container.js';
import { ConfigUpdateHandler } from '../handlers/ConfigUpdateHandler.js';
import { MetricsService } from '../services/MetricsService.js';
import { GracefulShutdownService } from '../services/GracefulShutdownService.js';

describe('Server Improvements', () => {
  describe('Container', () => {
    let container;

    beforeEach(() => {
      container = new Container();
    });

    afterEach(() => {
      container.clear();
    });

    test('should register and retrieve services', () => {
      const mockService = { name: 'test' };
      container.register('testService', () => mockService);

      const retrieved = container.get('testService');
      expect(retrieved).toBe(mockService);
    });

    test('should cache singleton services', () => {
      let callCount = 0;
      container.register('testService', () => {
        callCount++;
        return { count: callCount };
      });

      const first = container.get('testService');
      const second = container.get('testService');

      expect(first).toBe(second);
      expect(callCount).toBe(1);
    });

    test('should reset services', () => {
      let callCount = 0;
      container.register('testService', () => {
        callCount++;
        return { count: callCount };
      });

      const first = container.get('testService');
      container.reset('testService');
      const second = container.get('testService');

      expect(first).not.toBe(second);
      expect(callCount).toBe(2);
    });

    test('should throw error for unregistered service', () => {
      expect(() => container.get('nonexistent')).toThrow('Service \'nonexistent\' not registered');
    });
  });

  describe('ConfigUpdateHandler', () => {
    let handler;
    let mockContainer;
    let mockLogger;
    let mockInitializeBrokerAdapter;
    let mockCreateBrokerGateway;

    beforeEach(() => {
      mockContainer = {
        get: jest.fn(),
        reset: jest.fn(),
        register: jest.fn(),
      };

      mockLogger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
      };

      mockInitializeBrokerAdapter = jest.fn();
      mockCreateBrokerGateway = jest.fn();

      handler = new ConfigUpdateHandler({
        container: mockContainer,
        loggerAdapter: mockLogger,
        initializeBrokerAdapter: mockInitializeBrokerAdapter,
        createBrokerGateway: mockCreateBrokerGateway,
      });
    });

    test('should handle live broker configuration', async () => {
      const mockConfigManager = {
        getConfig: jest.fn().mockResolvedValue({
          mode: 'LIVE',
          broker: 'bybit',
        }),
      };

      const mockDatabaseManager = { name: 'db' };
      const mockBrokerGateway = { name: 'gateway' };
      const mockOrderManager = { setBrokerGateway: jest.fn() };
      const mockPhaseManager = { setBrokerGateway: jest.fn() };

      mockContainer.get
        .mockReturnValueOnce(mockConfigManager)
        .mockReturnValueOnce(mockDatabaseManager)
        .mockReturnValueOnce(mockOrderManager)
        .mockReturnValueOnce(mockPhaseManager);

      mockInitializeBrokerAdapter.mockReturnValue({ adapter: { name: 'adapter' } });
      mockCreateBrokerGateway.mockReturnValue(mockBrokerGateway);

      // Mock environment variables
      process.env.BYBIT_API_KEY = 'test-key';
      process.env.BYBIT_API_SECRET = 'test-secret';

      await handler.handle({ type: 'broker-update' });

      expect(mockInitializeBrokerAdapter).toHaveBeenCalled();
      expect(mockCreateBrokerGateway).toHaveBeenCalled();
      expect(mockContainer.reset).toHaveBeenCalledWith('brokerGateway');
      expect(mockContainer.register).toHaveBeenCalledWith('brokerGateway', expect.any(Function));

      // Cleanup
      delete process.env.BYBIT_API_KEY;
      delete process.env.BYBIT_API_SECRET;
    });

    test('should handle mock broker configuration', async () => {
      const mockConfigManager = {
        getConfig: jest.fn().mockResolvedValue({
          mode: 'PAPER',
          broker: null,
        }),
      };

      mockContainer.get.mockReturnValueOnce(mockConfigManager);

      await handler.handle({ type: 'broker-update' });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ update: { type: 'broker-update' } }),
        'Configuration updated, reinitializing broker'
      );
    });
  });

  describe('MetricsService', () => {
    let metricsService;
    let mockContainer;
    let mockLogger;
    let mockMetrics;

    beforeEach(() => {
      mockContainer = {
        get: jest.fn(),
      };

      mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      mockMetrics = {
        updateEquity: jest.fn(),
        updateActivePositions: jest.fn(),
        updatePositionPnl: jest.fn(),
        updateTotalLeverage: jest.fn(),
        updateDrawdown: jest.fn(),
        updateHealth: jest.fn(),
      };

      metricsService = new MetricsService({
        container: mockContainer,
        loggerAdapter: mockLogger,
        metrics: mockMetrics,
      });
    });

    afterEach(() => {
      metricsService.stop();
    });

    test('should start and stop metrics updates', () => {
      expect(metricsService.isRunning).toBe(false);

      metricsService.start();
      expect(metricsService.isRunning).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Periodic metrics updates started')
      );

      metricsService.stop();
      expect(metricsService.isRunning).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Metrics updates stopped');
    });

    test('should not start if already running', () => {
      metricsService.start();
      metricsService.start();

      expect(mockLogger.warn).toHaveBeenCalledWith('Metrics service already running');
    });

    test('should update equity only when changed', async () => {
      const mockPhaseManager = {
        getLastKnownEquity: jest.fn().mockReturnValue(1000),
      };

      mockContainer.get.mockReturnValue(mockPhaseManager);

      // First update
      await metricsService.updateMetrics();
      expect(mockMetrics.updateEquity).toHaveBeenCalledWith(1000);

      // Second update with same value
      mockMetrics.updateEquity.mockClear();
      await metricsService.updateMetrics();
      expect(mockMetrics.updateEquity).not.toHaveBeenCalled();

      // Third update with different value
      mockPhaseManager.getLastKnownEquity.mockReturnValue(1100);
      await metricsService.updateMetrics();
      expect(mockMetrics.updateEquity).toHaveBeenCalledWith(1100);
    });

    test('should get current cache', () => {
      const cache = metricsService.getCache();
      expect(cache).toHaveProperty('equity');
      expect(cache).toHaveProperty('positionCount');
      expect(cache).toHaveProperty('totalLeverage');
      expect(cache).toHaveProperty('drawdown');
      expect(cache).toHaveProperty('healthStatus');
    });
  });

  describe('GracefulShutdownService', () => {
    let shutdownService;
    let mockContainer;
    let mockLogger;
    let mockFastify;
    let originalProcessExit;

    beforeEach(() => {
      // Mock process.exit to prevent test termination
      originalProcessExit = process.exit;
      process.exit = jest.fn();

      mockContainer = {
        get: jest.fn().mockReturnValue({
          stop: jest.fn(),
          close: jest.fn().mockResolvedValue(),
          isConnected: jest.fn().mockReturnValue(true),
        }),
      };

      mockLogger = {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };

      mockFastify = {
        close: jest.fn().mockResolvedValue(),
        httpRedirectServer: null,
      };

      shutdownService = new GracefulShutdownService({
        container: mockContainer,
        loggerAdapter: mockLogger,
        fastify: mockFastify,
      });
    });

    afterEach(() => {
      // Restore process.exit
      process.exit = originalProcessExit;
    });

    test('should register signal handlers', () => {
      const originalProcessOn = process.on;
      process.on = jest.fn();

      shutdownService.registerHandlers();

      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));

      process.on = originalProcessOn;
    });

    test('should prevent multiple shutdowns', async () => {
      // Start first shutdown (don't await)
      shutdownService.shutdown('SIGTERM');
      
      // Try to start second shutdown
      await shutdownService.shutdown('SIGINT');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Shutdown already in progress, ignoring SIGINT'
      );
    });

    test('should complete shutdown successfully', async () => {
      await shutdownService.shutdown('SIGTERM');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Received SIGTERM, shutting down gracefully...'
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Graceful shutdown completed'
      );
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });
});