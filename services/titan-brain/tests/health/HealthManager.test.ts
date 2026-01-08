/**
 * Unit tests for HealthManager
 */

import {
  HealthManager,
  HealthStatus,
  HealthComponent,
  ComponentHealth,
  DatabaseHealthComponent,
  ConfigHealthComponent,
  MemoryHealthComponent,
  RedisHealthComponent
} from '../../src/health/HealthManager';

// Mock database manager
const mockDatabaseManager = {
  isHealthy: jest.fn(),
  getMetrics: jest.fn()
};

// Mock cache manager
const mockCacheManager = {
  isHealthy: jest.fn()
};

// Mock config
const mockConfig = {
  port: 3000,
  nodeEnv: 'test'
};

describe('HealthManager', () => {
  let healthManager: HealthManager;

  beforeEach(() => {
    jest.clearAllMocks();
    healthManager = new HealthManager();
  });

  afterEach(() => {
    healthManager.shutdown();
  });

  describe('component registration', () => {
    it('should register and unregister components', () => {
      const component: HealthComponent = {
        name: 'test',
        check: jest.fn(),
        isRequired: true,
        timeout: 1000
      };

      const registerSpy = jest.fn();
      const unregisterSpy = jest.fn();
      
      healthManager.on('component:registered', registerSpy);
      healthManager.on('component:unregistered', unregisterSpy);

      healthManager.registerComponent(component);
      expect(registerSpy).toHaveBeenCalledWith({ name: 'test' });

      healthManager.unregisterComponent('test');
      expect(unregisterSpy).toHaveBeenCalledWith({ name: 'test' });
    });
  });

  describe('health checks', () => {
    it('should perform health check on all components', async () => {
      const mockComponent: HealthComponent = {
        name: 'test',
        check: jest.fn().mockResolvedValue({
          name: 'test',
          status: HealthStatus.HEALTHY,
          message: 'Test component healthy',
          duration: 10,
          timestamp: Date.now()
        }),
        isRequired: true,
        timeout: 1000
      };

      healthManager.registerComponent(mockComponent);
      
      const health = await healthManager.checkHealth();
      
      expect(health.status).toBe(HealthStatus.HEALTHY);
      expect(health.components).toHaveLength(1);
      expect(health.components[0].name).toBe('test');
      expect(health.version).toBeDefined();
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should handle component timeout', async () => {
      const slowComponent: HealthComponent = {
        name: 'slow',
        check: jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 2000))
        ),
        isRequired: true,
        timeout: 100
      };

      healthManager.registerComponent(slowComponent);
      
      const health = await healthManager.checkHealth();
      
      expect(health.status).toBe(HealthStatus.UNHEALTHY);
      expect(health.components[0].status).toBe(HealthStatus.UNHEALTHY);
      expect(health.components[0].message).toContain('timeout');
    });

    it('should determine overall status correctly', async () => {
      const healthyComponent: HealthComponent = {
        name: 'healthy',
        check: jest.fn().mockResolvedValue({
          name: 'healthy',
          status: HealthStatus.HEALTHY,
          message: 'OK',
          duration: 10,
          timestamp: Date.now()
        }),
        isRequired: true,
        timeout: 1000
      };

      const unhealthyComponent: HealthComponent = {
        name: 'unhealthy',
        check: jest.fn().mockResolvedValue({
          name: 'unhealthy',
          status: HealthStatus.UNHEALTHY,
          message: 'Failed',
          duration: 10,
          timestamp: Date.now()
        }),
        isRequired: true,
        timeout: 1000
      };

      healthManager.registerComponent(healthyComponent);
      healthManager.registerComponent(unhealthyComponent);
      
      const health = await healthManager.checkHealth();
      
      expect(health.status).toBe(HealthStatus.UNHEALTHY);
    });

    it('should cache health results', async () => {
      const component: HealthComponent = {
        name: 'test',
        check: jest.fn().mockResolvedValue({
          name: 'test',
          status: HealthStatus.HEALTHY,
          message: 'OK',
          duration: 10,
          timestamp: Date.now()
        }),
        isRequired: true,
        timeout: 1000
      };

      healthManager.registerComponent(component);
      
      // First call
      const health1 = await healthManager.checkHealth();
      // Second call (should use cache)
      const health2 = await healthManager.checkHealth();
      
      expect(component.check).toHaveBeenCalledTimes(1);
      expect(health1.timestamp).toBe(health2.timestamp);
    });
  });

  describe('periodic checks', () => {
    it('should start and stop periodic checks', () => {
      const startSpy = jest.fn();
      const stopSpy = jest.fn();
      
      healthManager.on('periodic:started', startSpy);
      healthManager.on('periodic:stopped', stopSpy);

      healthManager.startPeriodicChecks();
      expect(startSpy).toHaveBeenCalled();

      healthManager.stopPeriodicChecks();
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should return uptime', async () => {
      // Wait a small amount to ensure uptime > 0
      await new Promise(resolve => setTimeout(resolve, 1));
      const uptime = healthManager.getUptime();
      expect(uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return last health check', async () => {
      expect(healthManager.getLastHealthCheck()).toBeNull();
      
      await healthManager.checkHealth();
      
      expect(healthManager.getLastHealthCheck()).not.toBeNull();
    });

    it('should check if system is healthy', async () => {
      const healthyComponent: HealthComponent = {
        name: 'test',
        check: jest.fn().mockResolvedValue({
          name: 'test',
          status: HealthStatus.HEALTHY,
          message: 'OK',
          duration: 10,
          timestamp: Date.now()
        }),
        isRequired: true,
        timeout: 1000
      };

      healthManager.registerComponent(healthyComponent);
      await healthManager.checkHealth();
      
      expect(healthManager.isHealthy()).toBe(true);
    });
  });
});

describe('DatabaseHealthComponent', () => {
  let component: DatabaseHealthComponent;

  beforeEach(() => {
    jest.clearAllMocks();
    component = new DatabaseHealthComponent(mockDatabaseManager);
  });

  it('should report healthy when database is healthy', async () => {
    mockDatabaseManager.isHealthy.mockReturnValue(true);
    mockDatabaseManager.getMetrics.mockReturnValue({
      totalConnections: 5,
      idleConnections: 3,
      successfulQueries: 100,
      failedQueries: 0
    });

    const result = await component.check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.name).toBe('database');
    expect(result.details).toEqual({
      totalConnections: 5,
      idleConnections: 3,
      successfulQueries: 100,
      failedQueries: 0
    });
  });

  it('should report unhealthy when database is unhealthy', async () => {
    mockDatabaseManager.isHealthy.mockReturnValue(false);
    mockDatabaseManager.getMetrics.mockReturnValue({
      connectionErrors: 5,
      lastHealthCheck: Date.now()
    });

    const result = await component.check();

    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toContain('unhealthy');
  });

  it('should report unhealthy when database manager is not initialized', async () => {
    const component = new DatabaseHealthComponent(null);
    
    const result = await component.check();

    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toContain('not initialized');
  });
});

describe('ConfigHealthComponent', () => {
  let component: ConfigHealthComponent;

  beforeEach(() => {
    component = new ConfigHealthComponent(mockConfig);
  });

  it('should report healthy when configuration is valid', async () => {
    const result = await component.check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.name).toBe('configuration');
    expect(result.details).toEqual({
      nodeEnv: 'test',
      port: 3000
    });
  });

  it('should report unhealthy when required fields are missing', async () => {
    const invalidConfig = { nodeEnv: 'test' }; // missing port
    const component = new ConfigHealthComponent(invalidConfig);
    
    const result = await component.check();

    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toContain('Missing required configuration');
    expect(result.details?.missingFields).toContain('port');
  });
});

describe('MemoryHealthComponent', () => {
  let component: MemoryHealthComponent;

  beforeEach(() => {
    component = new MemoryHealthComponent();
  });

  it('should report healthy when memory usage is normal', async () => {
    // Mock process.memoryUsage to return normal values
    const originalMemoryUsage = process.memoryUsage;
    (process as any).memoryUsage = jest.fn().mockReturnValue({
      heapUsed: 50 * 1024 * 1024, // 50MB
      heapTotal: 100 * 1024 * 1024, // 100MB (50% usage)
      external: 10 * 1024 * 1024,
      rss: 80 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024
    });

    const result = await component.check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.name).toBe('memory');
    expect(result.details?.usagePercentage).toBe(50);

    process.memoryUsage = originalMemoryUsage;
  });

  it('should report degraded when memory usage is high', async () => {
    const originalMemoryUsage = process.memoryUsage;
    (process as any).memoryUsage = jest.fn().mockReturnValue({
      heapUsed: 85 * 1024 * 1024, // 85MB
      heapTotal: 100 * 1024 * 1024, // 100MB (85% usage)
      external: 10 * 1024 * 1024,
      rss: 120 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024
    });

    const result = await component.check();

    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.message).toContain('High memory usage');

    process.memoryUsage = originalMemoryUsage;
  });

  it('should report unhealthy when memory usage is critical', async () => {
    const originalMemoryUsage = process.memoryUsage;
    (process as any).memoryUsage = jest.fn().mockReturnValue({
      heapUsed: 95 * 1024 * 1024, // 95MB
      heapTotal: 100 * 1024 * 1024, // 100MB (95% usage)
      external: 10 * 1024 * 1024,
      rss: 150 * 1024 * 1024,
      arrayBuffers: 5 * 1024 * 1024
    });

    const result = await component.check();

    expect(result.status).toBe(HealthStatus.UNHEALTHY);
    expect(result.message).toContain('Critical memory usage');

    process.memoryUsage = originalMemoryUsage;
  });
});

describe('RedisHealthComponent', () => {
  let component: RedisHealthComponent;

  beforeEach(() => {
    jest.clearAllMocks();
    component = new RedisHealthComponent(mockCacheManager);
  });

  it('should report healthy when Redis is available', async () => {
    mockCacheManager.isHealthy.mockResolvedValue(true);

    const result = await component.check();

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.name).toBe('redis');
    expect(result.message).toContain('healthy');
  });

  it('should report degraded when Redis is unavailable', async () => {
    mockCacheManager.isHealthy.mockResolvedValue(false);

    const result = await component.check();

    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.message).toContain('unavailable');
  });

  it('should report degraded when Redis is not configured', async () => {
    const component = new RedisHealthComponent();
    
    const result = await component.check();

    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.message).toContain('not configured');
  });

  it('should report degraded when Redis check fails', async () => {
    mockCacheManager.isHealthy.mockRejectedValue(new Error('Connection failed'));

    const result = await component.check();

    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.message).toContain('check failed');
  });
});