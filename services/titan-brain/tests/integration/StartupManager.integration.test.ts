/**
 * StartupManager Integration Tests
 * 
 * Tests the complete startup sequence with real components
 */

import { StartupManager } from '../../src/startup/StartupManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import { DatabaseManager } from '../../src/database/DatabaseManager';
import { CacheManager } from '../../src/cache/CacheManager';
import { Logger } from '../../src/logging/Logger';
import { BrainConfig } from '../../src/config/BrainConfig';
import { EventEmitter } from 'events';

// Test configuration
const testConfig: BrainConfig = {
  server: {
    port: 0,
    host: '127.0.0.1',
    cors: {
      origin: true,
      credentials: true
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100
    }
  },
  database: {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'test_titan_brain',
    username: process.env.TEST_DB_USER || 'test_user',
    password: process.env.TEST_DB_PASSWORD || 'test_password',
    ssl: false,
    poolMin: 1,
    poolMax: 3,
    connectionTimeoutMs: 5000,
    idleTimeoutMs: 30000,
    healthCheckIntervalMs: 30000
  },
  cache: {
    redis: {
      host: process.env.TEST_REDIS_HOST || 'localhost',
      port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
      password: process.env.TEST_REDIS_PASSWORD,
      db: 14, // Use DB 14 for startup tests
      connectTimeout: 5000,
      commandTimeout: 3000
    },
    enableInMemoryFallback: true,
    inMemoryMaxSize: 50,
    inMemoryTtlMs: 60000,
    healthCheckIntervalMs: 30000,
    healthCheckTimeoutMs: 5000,
    maxReconnectAttempts: 3,
    reconnectDelayMs: 1000
  },
  logging: {
    level: 'info',
    format: 'json',
    enableConsole: true,
    enableFile: false
  },
  security: {
    hmacSecret: 'test-startup-secret',
    timestampToleranceMs: 300000
  },
  services: {
    discovery: {
      healthCheckIntervalMs: 30000,
      healthCheckTimeoutMs: 5000
    },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeoutMs: 60000,
      monitoringPeriodMs: 10000
    },
    client: {
      timeoutMs: 30000,
      retryAttempts: 3,
      retryDelayMs: 1000,
      retryBackoffMultiplier: 2
    }
  },
  metrics: {
    enablePrometheus: true,
    collectDefaultMetrics: true,
    defaultMetricsIntervalMs: 10000
  }
};

describe('StartupManager Integration Tests', () => {
  let startupManager: StartupManager;
  let logger: Logger;
  let configManager: ConfigManager;
  let databaseManager: DatabaseManager;
  let cacheManager: CacheManager;

  beforeEach(() => {
    logger = new Logger(testConfig.logging);
    configManager = new ConfigManager(testConfig, logger);
    databaseManager = new DatabaseManager(testConfig.database, logger);
    cacheManager = new CacheManager(testConfig.cache, logger);
    
    startupManager = new StartupManager({
      configManager,
      databaseManager,
      cacheManager,
      logger
    });
  });

  afterEach(async () => {
    if (startupManager) {
      await startupManager.shutdown();
    }
    if (databaseManager) {
      await databaseManager.disconnect();
    }
    if (cacheManager) {
      await cacheManager.disconnect();
    }
  });

  describe('Startup Sequence', () => {
    it('should complete full startup sequence successfully', async () => {
      const events: string[] = [];
      
      startupManager.on('step:start', (data) => {
        events.push(`start:${data.step}`);
      });
      
      startupManager.on('step:complete', (data) => {
        events.push(`complete:${data.step}`);
      });
      
      startupManager.on('startup:complete', () => {
        events.push('startup:complete');
      });
      
      const result = await startupManager.startup();
      
      expect(result.success).toBe(true);
      expect(result.completedSteps).toContain('validateEnvironment');
      expect(result.completedSteps).toContain('initializeDatabase');
      expect(result.completedSteps).toContain('initializeCache');
      expect(result.completedSteps).toContain('validateDependencies');
      
      expect(events).toContain('startup:complete');
    }, 30000);

    it('should handle startup step failures gracefully', async () => {
      // Create a startup manager with invalid database config
      const invalidConfig = {
        ...testConfig,
        database: {
          ...testConfig.database,
          host: 'invalid-host-that-does-not-exist',
          port: 9999
        }
      };
      
      const invalidConfigManager = new ConfigManager(invalidConfig, logger);
      const invalidDatabaseManager = new DatabaseManager(invalidConfig.database, logger);
      
      const invalidStartupManager = new StartupManager({
        configManager: invalidConfigManager,
        databaseManager: invalidDatabaseManager,
        cacheManager,
        logger
      });
      
      try {
        const result = await invalidStartupManager.startup();
        
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.failedStep).toBe('initializeDatabase');
      } finally {
        await invalidStartupManager.shutdown();
        await invalidDatabaseManager.disconnect();
      }
    }, 15000);

    it('should emit progress events during startup', async () => {
      const progressEvents: any[] = [];
      
      startupManager.on('startup:progress', (data) => {
        progressEvents.push(data);
      });
      
      await startupManager.startup();
      
      expect(progressEvents.length).toBeGreaterThan(0);
      progressEvents.forEach(event => {
        expect(event).toHaveProperty('step');
        expect(event).toHaveProperty('progress');
        expect(event).toHaveProperty('total');
        expect(typeof event.progress).toBe('number');
        expect(typeof event.total).toBe('number');
      });
    }, 30000);

    it('should validate environment variables', async () => {
      // Temporarily remove required environment variable
      const originalNodeEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      
      try {
        const result = await startupManager.startup();
        
        // Should still succeed but with warnings
        expect(result.success).toBe(true);
      } finally {
        // Restore environment variable
        if (originalNodeEnv !== undefined) {
          process.env.NODE_ENV = originalNodeEnv;
        }
      }
    }, 15000);
  });

  describe('Shutdown Sequence', () => {
    it('should complete graceful shutdown', async () => {
      // First startup
      await startupManager.startup();
      
      const shutdownEvents: string[] = [];
      
      startupManager.on('shutdown:start', () => {
        shutdownEvents.push('shutdown:start');
      });
      
      startupManager.on('shutdown:complete', () => {
        shutdownEvents.push('shutdown:complete');
      });
      
      const result = await startupManager.shutdown();
      
      expect(result.success).toBe(true);
      expect(shutdownEvents).toContain('shutdown:start');
      expect(shutdownEvents).toContain('shutdown:complete');
    }, 15000);

    it('should handle shutdown timeouts', async () => {
      await startupManager.startup();
      
      // Create a mock component that takes too long to shutdown
      const slowComponent = new EventEmitter();
      (startupManager as any).components = {
        ...((startupManager as any).components || {}),
        slowComponent: {
          disconnect: () => new Promise(resolve => setTimeout(resolve, 10000)) // 10 second delay
        }
      };
      
      const startTime = Date.now();
      const result = await startupManager.shutdown(5000); // 5 second timeout
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(7000); // Should timeout before 7 seconds
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    }, 15000);

    it('should handle component shutdown errors gracefully', async () => {
      await startupManager.startup();
      
      // Mock a component that throws during shutdown
      const errorComponent = {
        disconnect: () => Promise.reject(new Error('Shutdown error'))
      };
      
      (startupManager as any).components = {
        ...((startupManager as any).components || {}),
        errorComponent
      };
      
      const result = await startupManager.shutdown();
      
      // Should complete despite component errors
      expect(result.success).toBe(false);
      expect(result.error).toContain('Shutdown error');
    }, 15000);
  });

  describe('Health Monitoring', () => {
    it('should monitor component health during startup', async () => {
      const healthEvents: any[] = [];
      
      startupManager.on('health:check', (data) => {
        healthEvents.push(data);
      });
      
      await startupManager.startup();
      
      expect(healthEvents.length).toBeGreaterThan(0);
      healthEvents.forEach(event => {
        expect(event).toHaveProperty('component');
        expect(event).toHaveProperty('healthy');
        expect(typeof event.healthy).toBe('boolean');
      });
    }, 30000);

    it('should detect unhealthy components', async () => {
      await startupManager.startup();
      
      // Simulate component becoming unhealthy
      await databaseManager.disconnect();
      
      const healthStatus = await startupManager.getHealthStatus();
      
      expect(healthStatus.overall).toBe(false);
      expect(healthStatus.components).toHaveProperty('database');
      expect(healthStatus.components.database.healthy).toBe(false);
    }, 15000);

    it('should provide detailed health information', async () => {
      await startupManager.startup();
      
      const healthStatus = await startupManager.getHealthStatus();
      
      expect(healthStatus).toHaveProperty('overall');
      expect(healthStatus).toHaveProperty('components');
      expect(healthStatus).toHaveProperty('timestamp');
      
      expect(typeof healthStatus.overall).toBe('boolean');
      expect(typeof healthStatus.timestamp).toBe('number');
      
      // Should have health info for each component
      expect(healthStatus.components).toHaveProperty('config');
      expect(healthStatus.components).toHaveProperty('database');
      expect(healthStatus.components).toHaveProperty('cache');
    }, 15000);
  });

  describe('Error Recovery', () => {
    it('should retry failed startup steps', async () => {
      let attemptCount = 0;
      
      // Mock a component that fails first time but succeeds on retry
      const flakyComponent = {
        connect: () => {
          attemptCount++;
          if (attemptCount === 1) {
            return Promise.reject(new Error('Temporary failure'));
          }
          return Promise.resolve();
        },
        isHealthy: () => Promise.resolve(true),
        disconnect: () => Promise.resolve()
      };
      
      (startupManager as any).components = {
        ...((startupManager as any).components || {}),
        flakyComponent
      };
      
      const result = await startupManager.startup();
      
      expect(result.success).toBe(true);
      expect(attemptCount).toBeGreaterThan(1);
    }, 15000);

    it('should handle partial startup failures', async () => {
      // Create a startup manager where cache fails but database succeeds
      const partialFailConfig = {
        ...testConfig,
        cache: {
          ...testConfig.cache,
          redis: {
            ...testConfig.cache.redis,
            host: 'invalid-cache-host',
            port: 9999
          }
        }
      };
      
      const partialConfigManager = new ConfigManager(partialFailConfig, logger);
      const partialCacheManager = new CacheManager(partialFailConfig.cache, logger);
      
      const partialStartupManager = new StartupManager({
        configManager: partialConfigManager,
        databaseManager,
        cacheManager: partialCacheManager,
        logger
      });
      
      try {
        const result = await partialStartupManager.startup();
        
        // Should succeed with fallback cache
        expect(result.success).toBe(true);
        expect(result.warnings).toBeDefined();
        expect(result.warnings!.length).toBeGreaterThan(0);
      } finally {
        await partialStartupManager.shutdown();
        await partialCacheManager.disconnect();
      }
    }, 15000);
  });

  describe('Performance', () => {
    it('should complete startup within reasonable time', async () => {
      const startTime = Date.now();
      
      const result = await startupManager.startup();
      
      const duration = Date.now() - startTime;
      
      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(15000); // Should complete within 15 seconds
      
      console.log(`Startup completed in ${duration}ms`);
    }, 20000);

    it('should handle concurrent startup attempts', async () => {
      // Start multiple startup attempts concurrently
      const startupPromises = [
        startupManager.startup(),
        startupManager.startup(),
        startupManager.startup()
      ];
      
      const results = await Promise.all(startupPromises);
      
      // All should succeed (or at least not fail due to concurrency)
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    }, 30000);
  });

  describe('Configuration Validation', () => {
    it('should validate required configuration', async () => {
      // Create config with missing required fields
      const incompleteConfig = {
        ...testConfig,
        security: undefined as any
      };
      
      const incompleteConfigManager = new ConfigManager(incompleteConfig, logger);
      
      const incompleteStartupManager = new StartupManager({
        configManager: incompleteConfigManager,
        databaseManager,
        cacheManager,
        logger
      });
      
      try {
        const result = await incompleteStartupManager.startup();
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('configuration');
      } finally {
        await incompleteStartupManager.shutdown();
      }
    }, 15000);

    it('should validate configuration values', async () => {
      // Create config with invalid values
      const invalidConfig = {
        ...testConfig,
        server: {
          ...testConfig.server,
          port: -1 // Invalid port
        }
      };
      
      const invalidConfigManager = new ConfigManager(invalidConfig, logger);
      
      const invalidStartupManager = new StartupManager({
        configManager: invalidConfigManager,
        databaseManager,
        cacheManager,
        logger
      });
      
      try {
        const result = await invalidStartupManager.startup();
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('port');
      } finally {
        await invalidStartupManager.shutdown();
      }
    }, 15000);
  });
});