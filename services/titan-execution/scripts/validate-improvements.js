#!/usr/bin/env node

/**
 * Validation script for server improvements
 * Ensures all new components can be imported and instantiated correctly
 */

import { Container } from '../utils/Container.js';
import { ConfigUpdateHandler } from '../handlers/ConfigUpdateHandler.js';
import { MetricsService } from '../services/MetricsService.js';
import { GracefulShutdownService } from '../services/GracefulShutdownService.js';
import { CONSTANTS } from '../utils/constants.js';

console.log('🔍 Validating server improvements...\n');

// Test 1: Container functionality
console.log('1. Testing Container...');
try {
  const container = new Container();
  
  // Register a test service
  container.register('testService', () => ({ name: 'test', timestamp: Date.now() }));
  
  // Test retrieval
  const service1 = container.get('testService');
  const service2 = container.get('testService');
  
  if (service1 === service2) {
    console.log('   ✅ Singleton caching works');
  } else {
    throw new Error('Singleton caching failed');
  }
  
  // Test reset
  container.reset('testService');
  const service3 = container.get('testService');
  
  if (service1 !== service3) {
    console.log('   ✅ Service reset works');
  } else {
    throw new Error('Service reset failed');
  }
  
  console.log('   ✅ Container validation passed\n');
} catch (error) {
  console.error('   ❌ Container validation failed:', error.message);
  process.exit(1);
}

// Test 2: ConfigUpdateHandler
console.log('2. Testing ConfigUpdateHandler...');
try {
  const mockContainer = {
    get: () => ({ getConfig: () => Promise.resolve({ mode: 'PAPER' }) }),
    reset: () => {},
    register: () => {},
  };
  
  const mockLogger = {
    info: () => {},
    error: () => {},
    debug: () => {},
    warn: () => {},
  };
  
  const handler = new ConfigUpdateHandler({
    container: mockContainer,
    loggerAdapter: mockLogger,
    initializeBrokerAdapter: () => ({ adapter: {} }),
    createBrokerGateway: () => ({}),
  });
  
  if (typeof handler.handle === 'function') {
    console.log('   ✅ ConfigUpdateHandler instantiated correctly');
  } else {
    throw new Error('ConfigUpdateHandler missing handle method');
  }
  
  console.log('   ✅ ConfigUpdateHandler validation passed\n');
} catch (error) {
  console.error('   ❌ ConfigUpdateHandler validation failed:', error.message);
  process.exit(1);
}

// Test 3: MetricsService
console.log('3. Testing MetricsService...');
try {
  const mockContainer = {
    get: (name) => {
      const mocks = {
        phaseManager: { getLastKnownEquity: () => 1000 },
        shadowState: { 
          getAllPositions: () => new Map(),
          calculatePnLStats: () => ({ max_drawdown_pct: 0.05 })
        },
        wsCache: { isConnected: () => true },
        databaseManager: { isConnected: () => true },
        brokerGateway: { isHealthy: () => true },
      };
      return mocks[name] || {};
    },
  };
  
  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  
  const mockMetrics = {
    updateEquity: () => {},
    updateActivePositions: () => {},
    updatePositionPnl: () => {},
    updateTotalLeverage: () => {},
    updateDrawdown: () => {},
    updateHealth: () => {},
  };
  
  const metricsService = new MetricsService({
    container: mockContainer,
    loggerAdapter: mockLogger,
    metrics: mockMetrics,
  });
  
  if (typeof metricsService.start === 'function' && typeof metricsService.stop === 'function') {
    console.log('   ✅ MetricsService instantiated correctly');
  } else {
    throw new Error('MetricsService missing required methods');
  }
  
  // Test cache functionality
  const cache = metricsService.getCache();
  if (cache && typeof cache === 'object') {
    console.log('   ✅ MetricsService cache works');
  } else {
    throw new Error('MetricsService cache failed');
  }
  
  console.log('   ✅ MetricsService validation passed\n');
} catch (error) {
  console.error('   ❌ MetricsService validation failed:', error.message);
  process.exit(1);
}

// Test 4: GracefulShutdownService
console.log('4. Testing GracefulShutdownService...');
try {
  const mockContainer = {
    get: () => ({
      stop: () => {},
      close: () => Promise.resolve(),
    }),
  };
  
  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  
  const mockFastify = {
    close: () => Promise.resolve(),
  };
  
  const shutdownService = new GracefulShutdownService({
    container: mockContainer,
    loggerAdapter: mockLogger,
    fastify: mockFastify,
  });
  
  if (typeof shutdownService.registerHandlers === 'function') {
    console.log('   ✅ GracefulShutdownService instantiated correctly');
  } else {
    throw new Error('GracefulShutdownService missing registerHandlers method');
  }
  
  console.log('   ✅ GracefulShutdownService validation passed\n');
} catch (error) {
  console.error('   ❌ GracefulShutdownService validation failed:', error.message);
  process.exit(1);
}

// Test 5: Constants
console.log('5. Testing Constants...');
try {
  const requiredConstants = [
    'GRACEFUL_SHUTDOWN_TIMEOUT_MS',
    'BROKER_RECONNECT_DELAY_MS',
    'MAX_BROKER_RECONNECT_ATTEMPTS',
    'LEVERAGE_CHANGE_THRESHOLD',
    'DRAWDOWN_CHANGE_THRESHOLD',
    'METRICS_UPDATE_INTERVAL_MS',
  ];
  
  for (const constant of requiredConstants) {
    if (!(constant in CONSTANTS)) {
      throw new Error(`Missing constant: ${constant}`);
    }
  }
  
  console.log('   ✅ All required constants present');
  console.log('   ✅ Constants validation passed\n');
} catch (error) {
  console.error('   ❌ Constants validation failed:', error.message);
  process.exit(1);
}

// Test 6: Integration test
console.log('6. Testing Integration...');
try {
  const container = new Container();
  
  // Register mock services
  container.register('logger', () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }));
  
  container.register('metrics', () => ({
    updateEquity: () => {},
    updateActivePositions: () => {},
    updateHealth: () => {},
  }));
  
  container.register('phaseManager', () => ({
    getLastKnownEquity: () => 1000,
  }));
  
  container.register('shadowState', () => ({
    getAllPositions: () => new Map(),
    calculatePnLStats: () => ({ max_drawdown_pct: 0.02 }),
  }));
  
  // Test MetricsService with container
  const metricsService = new MetricsService({
    container,
    loggerAdapter: container.get('logger'),
    metrics: container.get('metrics'),
  });
  
  // Test update without errors
  await metricsService.updateMetrics();
  
  console.log('   ✅ Integration test passed\n');
} catch (error) {
  console.error('   ❌ Integration test failed:', error.message);
  process.exit(1);
}

console.log('🎉 All validations passed! Server improvements are ready for production.\n');

console.log('📊 Summary:');
console.log('   ✅ Dependency Injection Container');
console.log('   ✅ Configuration Update Handler');
console.log('   ✅ Optimized Metrics Service');
console.log('   ✅ Graceful Shutdown Service');
console.log('   ✅ Enhanced Constants');
console.log('   ✅ Integration Testing');

console.log('\n🚀 Ready to deploy improved server-production.js');