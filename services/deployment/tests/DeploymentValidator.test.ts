/**
 * Tests for DeploymentValidator
 */

import { DeploymentValidator } from '../DeploymentValidator';

describe('DeploymentValidator', () => {
  let validator: DeploymentValidator;

  beforeEach(() => {
    validator = new DeploymentValidator();
  });

  describe('Configuration Management', () => {
    test('should initialize with default configuration', () => {
      const config = validator.getConfig();
      
      expect(config).toHaveProperty('services');
      expect(config).toHaveProperty('redis');
      expect(config).toHaveProperty('websockets');
      expect(config).toHaveProperty('timeout');
      
      expect(Array.isArray(config.services)).toBe(true);
      expect(Array.isArray(config.websockets)).toBe(true);
      expect(config.services.length).toBeGreaterThan(0);
    });

    test('should update configuration correctly', () => {
      const newConfig = {
        timeout: 60,
        redis: {
          host: 'redis.example.com',
          port: 6380,
          timeout: 10,
          testPubSub: false
        }
      };
      
      validator.updateConfig(newConfig);
      const updatedConfig = validator.getConfig();
      
      expect(updatedConfig.timeout).toBe(60);
      expect(updatedConfig.redis.host).toBe('redis.example.com');
      expect(updatedConfig.redis.port).toBe(6380);
      expect(updatedConfig.redis.testPubSub).toBe(false);
    });
  });

  describe('Service Validation Configuration', () => {
    test('should include all required Titan services', () => {
      const config = validator.getConfig();
      const serviceNames = config.services.map(s => s.name);
      
      expect(serviceNames).toContain('titan-brain');
      expect(serviceNames).toContain('titan-shared');
      expect(serviceNames).toContain('titan-execution');
      expect(serviceNames).toContain('titan-phase1-scavenger');
      expect(serviceNames).toContain('titan-console');
    });

    test('should have proper validation configuration for each service', () => {
      const config = validator.getConfig();
      
      config.services.forEach(service => {
        expect(service).toHaveProperty('name');
        expect(service).toHaveProperty('type');
        expect(service).toHaveProperty('timeout');
        expect(['http', 'tcp']).toContain(service.type);
        expect(typeof service.timeout).toBe('number');
        expect(service.timeout).toBeGreaterThan(0);
        
        if (service.type === 'http') {
          expect(service).toHaveProperty('endpoint');
          expect(typeof service.endpoint).toBe('string');
        } else if (service.type === 'tcp') {
          expect(service).toHaveProperty('port');
          expect(typeof service.port).toBe('number');
        }
      });
    });
  });

  describe('WebSocket Configuration', () => {
    test('should include exchange WebSocket configurations', () => {
      const config = validator.getConfig();
      const wsNames = config.websockets.map(ws => ws.name);
      
      expect(wsNames).toContain('binance-spot');
      expect(wsNames).toContain('bybit-perps');
    });

    test('should have valid WebSocket URLs', () => {
      const config = validator.getConfig();
      
      config.websockets.forEach(ws => {
        expect(ws).toHaveProperty('name');
        expect(ws).toHaveProperty('url');
        expect(ws).toHaveProperty('timeout');
        expect(typeof ws.url).toBe('string');
        expect(ws.url).toMatch(/^wss?:\/\//);
        expect(typeof ws.timeout).toBe('number');
        expect(ws.timeout).toBeGreaterThan(0);
      });
    });
  });

  describe('Quick Health Check', () => {
    test('should perform quick health check', async () => {
      const result = await validator.quickHealthCheck();
      
      expect(result).toHaveProperty('healthy');
      expect(result).toHaveProperty('issues');
      expect(typeof result.healthy).toBe('boolean');
      expect(Array.isArray(result.issues)).toBe(true);
    });

    test('should return issues when services are not running', async () => {
      // In test environment, services won't be running
      const result = await validator.quickHealthCheck();
      
      expect(result.healthy).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('Single Service Validation', () => {
    test('should validate single service configuration', async () => {
      const result = await validator.validateSingleService('titan-brain');
      
      expect(result).toHaveProperty('service');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('responseTime');
      expect(result.service).toBe('titan-brain');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.responseTime).toBe('number');
      
      // In test environment, service won't be running
      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
    });

    test('should throw error for non-existent service', async () => {
      await expect(validator.validateSingleService('non-existent-service'))
        .rejects.toThrow('Service configuration not found');
    });
  });

  describe('Event Emission', () => {
    test('should emit events during validation', (done) => {
      let eventEmitted = false;
      
      validator.on('config:updated', () => {
        eventEmitted = true;
        expect(eventEmitted).toBe(true);
        done();
      });

      validator.updateConfig({ timeout: 45 });
    });
  });
});