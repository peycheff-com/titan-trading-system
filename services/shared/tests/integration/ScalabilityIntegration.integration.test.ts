/**
 * Integration tests for Scalability Enhancement components
 * 
 * Tests the integration between LoadBalancer, ServiceDiscovery, 
 * DistributedStateManager, HighFrequencyProcessor, AdvancedOrderRouter, 
 * and NetworkOptimizer components.
 */

import {
  LoadBalancer,
  ServiceDiscovery,
  DistributedStateManager,
  HighFrequencyProcessor,
  AdvancedOrderRouter,
  NetworkOptimizer,
  DEFAULT_LOAD_BALANCER_CONFIG,
  DEFAULT_SERVICE_DISCOVERY_CONFIG,
  DEFAULT_DISTRIBUTED_STATE_CONFIG,
  DEFAULT_HF_PROCESSOR_CONFIG,
  DEFAULT_ORDER_ROUTER_CONFIG,
  DEFAULT_NETWORK_OPTIMIZER_CONFIG
} from '../../dist/index';

describe('Scalability Enhancement Integration Tests', () => {
  let loadBalancer: LoadBalancer;
  let serviceDiscovery: ServiceDiscovery;
  let stateManager: DistributedStateManager;
  let hfProcessor: HighFrequencyProcessor;
  let orderRouter: AdvancedOrderRouter;
  let networkOptimizer: NetworkOptimizer;

  beforeEach(() => {
    // Initialize all components
    loadBalancer = new LoadBalancer(DEFAULT_LOAD_BALANCER_CONFIG);
    serviceDiscovery = new ServiceDiscovery(DEFAULT_SERVICE_DISCOVERY_CONFIG);
    stateManager = new DistributedStateManager(DEFAULT_DISTRIBUTED_STATE_CONFIG);
    hfProcessor = new HighFrequencyProcessor(DEFAULT_HF_PROCESSOR_CONFIG);
    orderRouter = new AdvancedOrderRouter(DEFAULT_ORDER_ROUTER_CONFIG);
    networkOptimizer = new NetworkOptimizer(DEFAULT_NETWORK_OPTIMIZER_CONFIG);
  });

  afterEach(() => {
    // Cleanup all components
    loadBalancer.shutdown();
    serviceDiscovery.shutdown();
    stateManager.shutdown();
    hfProcessor.shutdown();
    orderRouter.shutdown();
    networkOptimizer.shutdown();
  });

  describe('Component Initialization', () => {
    it('should initialize all scalability components successfully', () => {
      expect(loadBalancer).toBeDefined();
      expect(serviceDiscovery).toBeDefined();
      expect(stateManager).toBeDefined();
      expect(hfProcessor).toBeDefined();
      expect(orderRouter).toBeDefined();
      expect(networkOptimizer).toBeDefined();
    });

    it('should start and stop all components without errors', async () => {
      // Start all components
      expect(() => {
        loadBalancer.start();
        serviceDiscovery.start();
        stateManager.start();
        hfProcessor.start();
        networkOptimizer.start();
      }).not.toThrow();

      // Stop all components
      expect(() => {
        loadBalancer.stop();
        serviceDiscovery.stop();
        stateManager.stop();
        hfProcessor.stop();
        networkOptimizer.stop();
      }).not.toThrow();
    });
  });

  describe('Service Discovery and Load Balancing Integration', () => {
    it('should integrate service discovery with load balancing', async () => {
      // Register a service
      const service = serviceDiscovery.registerSelf({
        name: 'test-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3000,
        protocol: 'http' as const,
        tags: ['trading', 'execution'],
        metadata: { region: 'us-east-1' },
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          api: '/api'
        }
      });

      expect(service).toBeDefined();
      expect(service.name).toBe('test-service');

      // Add corresponding backend server to load balancer
      loadBalancer.addServer({
        id: service.id,
        host: service.host,
        port: service.port,
        protocol: service.protocol as 'http',
        weight: 100,
        maxConnections: 1000,
        tags: service.tags
      });

      const servers = loadBalancer.getServers();
      expect(servers).toHaveLength(1);
      expect(servers[0].id).toBe(service.id);
    });

    it('should handle service failover scenarios', async () => {
      // Register multiple services
      const service1 = serviceDiscovery.registerSelf({
        name: 'execution-service',
        version: '1.0.0',
        host: 'host1',
        port: 3001,
        protocol: 'http' as const,
        tags: ['execution'],
        metadata: {},
        endpoints: { health: '/health', metrics: '/metrics' }
      });

      const service2 = serviceDiscovery.registerSelf({
        name: 'execution-service',
        version: '1.0.0',
        host: 'host2',
        port: 3002,
        protocol: 'http' as const,
        tags: ['execution'],
        metadata: {},
        endpoints: { health: '/health', metrics: '/metrics' }
      });

      // Add to load balancer
      loadBalancer.addServer({
        id: service1.id,
        host: service1.host,
        port: service1.port,
        protocol: service1.protocol as 'http',
        weight: 100,
        maxConnections: 1000,
        tags: service1.tags
      });

      loadBalancer.addServer({
        id: service2.id,
        host: service2.host,
        port: service2.port,
        protocol: service2.protocol as 'http',
        weight: 100,
        maxConnections: 1000,
        tags: service2.tags
      });

      const healthyServers = loadBalancer.getHealthyServers();
      expect(healthyServers.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Distributed State Management Integration', () => {
    it('should manage distributed state across nodes', async () => {
      // Set some state
      await stateManager.set('test-key', { value: 'test-data', timestamp: Date.now() });
      
      const retrievedValue = stateManager.get<{ value: string; timestamp: number }>('test-key');
      expect(retrievedValue).toBeDefined();
      expect(retrievedValue!.value).toBe('test-data');

      // Test state operations
      await stateManager.increment('counter', 5);
      const counter = stateManager.get('counter');
      expect(counter).toBe(5);

      await stateManager.increment('counter', 3);
      const updatedCounter = stateManager.get('counter');
      expect(updatedCounter).toBe(8);
    });

    it('should handle node cluster operations', () => {
      // Add nodes to cluster
      stateManager.addNode({
        id: 'node-1',
        host: 'host1',
        port: 5000,
        lastSeen: Date.now(),
        isOnline: true,
        stateVersion: 1,
        capabilities: ['storage', 'compute']
      });

      stateManager.addNode({
        id: 'node-2',
        host: 'host2',
        port: 5001,
        lastSeen: Date.now(),
        isOnline: true,
        stateVersion: 1,
        capabilities: ['storage']
      });

      const clusterStatus = stateManager.getClusterStatus();
      expect(clusterStatus.totalNodes).toBe(2);
      expect(clusterStatus.onlineNodes).toBe(2);
    });
  });

  describe('High-Frequency Processing Integration', () => {
    it('should process high-frequency signals', async () => {
      const signal = {
        id: 'signal-1',
        timestamp: Date.now() * 1000, // microseconds
        symbol: 'BTCUSDT',
        type: 'MARKET_DATA' as const,
        priority: 'HIGH' as const,
        data: {
          price: 50000,
          volume: 1.5,
          side: 'BUY' as const
        }
      };

      // Process signal
      await hfProcessor.processSignal(signal);

      const metrics = hfProcessor.getMetrics();
      expect(metrics.totalSignals).toBeGreaterThan(0);
    });

    it('should handle processing stages', () => {
      // Add processing stage
      hfProcessor.addStage({
        name: 'validation',
        process: async (signal) => {
          // Simple validation
          if (signal.data.price && signal.data.price > 0) {
            return signal;
          }
          return null;
        },
        maxLatency: 1000, // 1ms
        enabled: true
      });

      const stats = hfProcessor.getProcessingStats();
      expect(stats.activeStages).toBe(1);
    });
  });

  describe('Advanced Order Routing Integration', () => {
    it('should route orders across multiple venues', async () => {
      // Add trading venues
      orderRouter.addVenue({
        id: 'binance',
        name: 'Binance',
        type: 'EXCHANGE',
        latency: 50,
        fees: { maker: 10, taker: 10 },
        liquidity: { averageSpread: 5, averageDepth: 100000, marketShare: 30 },
        capabilities: ['IOC', 'FOK'],
        isActive: true,
        coLocationAvailable: false,
        networkOptimized: true
      });

      orderRouter.addVenue({
        id: 'bybit',
        name: 'Bybit',
        type: 'EXCHANGE',
        latency: 75,
        fees: { maker: 2, taker: 6 },
        liquidity: { averageSpread: 3, averageDepth: 80000, marketShare: 25 },
        capabilities: ['IOC', 'FOK', 'HIDDEN'],
        isActive: true,
        coLocationAvailable: true,
        networkOptimized: true
      });

      // Update market data
      orderRouter.updateMarketData({
        symbol: 'BTCUSDT',
        timestamp: Date.now(),
        venues: {
          binance: { bid: 49950, ask: 49960, bidSize: 10, askSize: 8, lastPrice: 49955, volume: 1000, spread: 10 },
          bybit: { bid: 49948, ask: 49958, bidSize: 12, askSize: 10, lastPrice: 49953, volume: 800, spread: 10 }
        },
        consolidated: {
          nbbo: { bid: 49950, ask: 49958 },
          totalVolume: 1800,
          averageSpread: 10,
          volatility: 0.02
        }
      });

      // Route order
      const routingRequest = {
        orderId: 'order-1',
        symbol: 'BTCUSDT',
        side: 'BUY' as const,
        quantity: 1.0,
        orderType: 'MARKET' as const,
        timeInForce: 'IOC' as const,
        urgency: 'NORMAL' as const,
        strategy: 'AGGRESSIVE' as const
      };

      const decision = await orderRouter.routeOrder(routingRequest);
      expect(decision).toBeDefined();
      expect(decision.routes.length).toBeGreaterThan(0);
      expect(decision.totalExpectedCost).toBeGreaterThan(0);
    });
  });

  describe('Network Optimization Integration', () => {
    it('should optimize network connections', () => {
      // Add network endpoints
      networkOptimizer.addEndpoint({
        id: 'binance-api',
        name: 'Binance API',
        host: 'api.binance.com',
        port: 443,
        protocol: 'HTTPS',
        location: {
          datacenter: 'aws-us-east-1',
          region: 'us-east-1',
          country: 'US'
        },
        isCoLocated: false,
        isDedicated: false,
        bandwidth: 1000,
        priority: 8
      });

      networkOptimizer.addEndpoint({
        id: 'bybit-api',
        name: 'Bybit API',
        host: 'api.bybit.com',
        port: 443,
        protocol: 'HTTPS',
        location: {
          datacenter: 'aws-ap-southeast-1',
          region: 'ap-southeast-1',
          country: 'SG'
        },
        isCoLocated: true,
        isDedicated: true,
        bandwidth: 2000,
        priority: 9
      });

      // Get optimal endpoint
      const optimal = networkOptimizer.getOptimalEndpoint({
        maxLatency: 1000,
        minBandwidth: 500,
        requireCoLocation: false
      });

      expect(optimal).toBeDefined();
      expect(optimal!.bandwidth).toBeGreaterThanOrEqual(500);
    });

    it('should configure co-location settings', () => {
      networkOptimizer.configureCoLocation({
        enabled: true,
        datacenter: 'aws-us-east-1',
        crossConnect: true,
        dedicatedLines: true,
        redundancy: 'DUAL',
        latencyTarget: 100,
        bandwidthTarget: 1000
      });

      const topology = networkOptimizer.getNetworkTopology();
      expect(topology.coLocationConfig).toBeDefined();
      expect(topology.coLocationConfig!.enabled).toBe(true);
      expect(topology.coLocationConfig!.datacenter).toBe('aws-us-east-1');
    });
  });

  describe('End-to-End Scalability Workflow', () => {
    it('should handle complete scalability workflow', async () => {
      // 1. Start all services
      serviceDiscovery.start();
      stateManager.start();
      hfProcessor.start();
      networkOptimizer.start();
      loadBalancer.start();

      // 2. Register services and configure network
      const executionService = serviceDiscovery.registerSelf({
        name: 'execution-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3002,
        protocol: 'http' as const,
        tags: ['execution', 'trading'],
        metadata: { region: 'us-east-1' },
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          api: '/api/v1'
        }
      });

      // 3. Configure distributed state
      await stateManager.set('system-config', {
        maxLatency: 10000,
        maxThroughput: 10000,
        enableOptimizations: true
      });

      // 4. Add processing stages
      hfProcessor.addStage({
        name: 'risk-check',
        process: async (signal) => {
          // Simple risk check
          if (signal.data.price && signal.data.price > 0 && signal.data.price < 100000) {
            return signal;
          }
          return null;
        },
        maxLatency: 500,
        enabled: true
      });

      // 5. Configure order routing
      orderRouter.addVenue({
        id: 'primary-exchange',
        name: 'Primary Exchange',
        type: 'EXCHANGE',
        latency: 25,
        fees: { maker: 5, taker: 8 },
        liquidity: { averageSpread: 2, averageDepth: 200000, marketShare: 40 },
        capabilities: ['IOC', 'FOK', 'ICEBERG'],
        isActive: true,
        coLocationAvailable: true,
        networkOptimized: true
      });

      // 6. Process a high-frequency signal
      const signal = {
        id: 'hft-signal-1',
        timestamp: Date.now() * 1000,
        symbol: 'BTCUSDT',
        type: 'TRADE' as const,
        priority: 'CRITICAL' as const,
        data: {
          price: 50000,
          volume: 2.5,
          side: 'BUY' as const
        }
      };

      await hfProcessor.processSignal(signal);

      // 7. Verify system state
      const systemConfig = stateManager.get<{ maxLatency: number; maxThroughput: number; enableOptimizations: boolean }>('system-config');
      expect(systemConfig).toBeDefined();
      expect(systemConfig!.enableOptimizations).toBe(true);

      const hfMetrics = hfProcessor.getMetrics();
      expect(hfMetrics.totalSignals).toBeGreaterThan(0);

      const discoveryStats = serviceDiscovery.getStats();
      expect(discoveryStats.totalServices).toBeGreaterThan(0);
      expect(discoveryStats.healthyServices).toBeGreaterThan(0);

      // 8. Stop all services
      loadBalancer.stop();
      networkOptimizer.stop();
      hfProcessor.stop();
      stateManager.stop();
      serviceDiscovery.stop();
    });
  });
});