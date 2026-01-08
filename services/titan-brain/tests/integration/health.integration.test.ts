/**
 * Integration tests for health endpoint
 */

import { HealthManager, ConfigHealthComponent, MemoryHealthComponent } from '../../src/health/HealthManager';

describe('Health Integration Tests', () => {
  let healthManager: HealthManager;
  const originalEnv = process.env;

  beforeEach(() => {
    // Set up required environment variables
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SERVER_PORT: '3100',
      DB_HOST: 'localhost',
      DB_NAME: 'test_db',
      DB_USER: 'test_user',
      DB_PASSWORD: 'test_password'
    };

    healthManager = new HealthManager();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('End-to-end health check', () => {
    it('should perform complete health check with all components', async () => {
      healthManager.markStartupComplete();
      
      const health = await healthManager.checkHealth();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('code');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('errors');
      
      // Should have configuration and memory components
      expect(health.components).toHaveProperty('configuration');
      expect(health.components).toHaveProperty('memory');
      
      // Each component should have required fields
      Object.values(health.components).forEach(component => {
        expect(component).toHaveProperty('healthy');
        expect(component).toHaveProperty('message');
        expect(component).toHaveProperty('lastCheck');
        expect(component).toHaveProperty('responseTime');
      });
    });

    it('should return starting status when startup not complete', async () => {
      const health = await healthManager.checkHealth();
      
      expect(health.status).toBe('starting');
      expect(health.code).toBe(503);
      expect(health.errors).toContain('Service is starting up');
    });

    it('should handle component failures gracefully', async () => {
      // Remove required environment variable to cause config component failure
      delete process.env.DB_PASSWORD;
      
      const healthManagerWithFailure = new HealthManager();
      healthManagerWithFailure.markStartupComplete();
      
      const health = await healthManagerWithFailure.checkHealth();
      
      expect(health.status).toBe('unhealthy');
      expect(health.code).toBe(503);
      expect(health.errors.length).toBeGreaterThan(0);
      expect(health.components.configuration.healthy).toBe(false);
    });

    it('should complete health check within reasonable time', async () => {
      healthManager.markStartupComplete();
      
      const startTime = Date.now();
      await healthManager.checkHealth();
      const duration = Date.now() - startTime;
      
      // Health check should complete within 5 seconds (Railway requirement)
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Component integration', () => {
    it('should integrate ConfigHealthComponent correctly', async () => {
      const configComponent = new ConfigHealthComponent();
      const health = await configComponent.check();
      
      expect(health.healthy).toBe(true);
      expect(health.message).toBe('Configuration valid');
      expect(health.responseTime).toBeGreaterThan(0);
    });

    it('should integrate MemoryHealthComponent correctly', async () => {
      const memoryComponent = new MemoryHealthComponent();
      const health = await memoryComponent.check();
      
      expect(health.healthy).toBe(true);
      expect(health.message).toContain('Memory usage:');
      expect(health.responseTime).toBeGreaterThan(0);
    });
  });

  describe('Performance requirements', () => {
    it('should handle multiple concurrent health checks', async () => {
      healthManager.markStartupComplete();
      
      const promises = Array.from({ length: 10 }, () => 
        healthManager.checkHealth()
      );
      
      const results = await Promise.all(promises);
      
      // All health checks should complete successfully
      results.forEach(health => {
        expect(health).toHaveProperty('status');
        expect(health).toHaveProperty('components');
      });
    });

    it('should maintain consistent response format', async () => {
      healthManager.markStartupComplete();
      
      const health1 = await healthManager.checkHealth();
      const health2 = await healthManager.checkHealth();
      
      // Response structure should be consistent
      expect(Object.keys(health1).sort()).toEqual(Object.keys(health2).sort());
      expect(Object.keys(health1.components).sort()).toEqual(Object.keys(health2.components).sort());
    });
  });
});