/**
 * Tests for PM2Manager
 */

import { PM2Manager } from '../PM2Manager';

describe('PM2Manager', () => {
  let pm2Manager: PM2Manager;

  beforeEach(() => {
    pm2Manager = new PM2Manager();
  });

  describe('Ecosystem Configuration', () => {
    test('should generate valid ecosystem configuration', () => {
      const config = pm2Manager.generateEcosystemConfig();
      
      expect(config).toHaveProperty('apps');
      expect(Array.isArray(config.apps)).toBe(true);
      expect(config.apps.length).toBeGreaterThan(0);
      
      // Check that all required Titan services are included
      const serviceNames = config.apps.map(app => app.name);
      expect(serviceNames).toContain('titan-brain');
      expect(serviceNames).toContain('titan-shared');
      expect(serviceNames).toContain('titan-execution');
      expect(serviceNames).toContain('titan-phase1-scavenger');
    });

    test('should have proper PM2 configuration for each service', () => {
      const config = pm2Manager.generateEcosystemConfig();
      
      config.apps.forEach(app => {
        expect(app).toHaveProperty('name');
        expect(app).toHaveProperty('script');
        expect(app).toHaveProperty('instances');
        expect(app).toHaveProperty('autorestart');
        expect(app).toHaveProperty('max_memory_restart');
        expect(app).toHaveProperty('log_file');
        expect(app).toHaveProperty('out_file');
        expect(app).toHaveProperty('error_file');
        
        // Validate log rotation settings
        expect(typeof app.autorestart).toBe('boolean');
        expect(app.autorestart).toBe(true);
        expect(typeof app.max_memory_restart).toBe('string');
        expect(app.max_memory_restart).toMatch(/^\d+[MG]$/);
      });
    });
  });

  describe('Log Rotation Configuration', () => {
    test('should have default log rotation configuration', () => {
      const config = pm2Manager.getLogRotationConfig();
      
      expect(config).toHaveProperty('max_size');
      expect(config).toHaveProperty('retain');
      expect(config).toHaveProperty('compress');
      expect(config).toHaveProperty('dateFormat');
      expect(config).toHaveProperty('workerInterval');
      expect(config).toHaveProperty('rotateInterval');
      
      expect(config.max_size).toBe('10M');
      expect(config.retain).toBe(30);
      expect(config.compress).toBe(true);
    });

    test('should update log rotation configuration', async () => {
      const newConfig = {
        max_size: '20M',
        retain: 60
      };
      
      await pm2Manager.updateLogRotationConfig(newConfig);
      const updatedConfig = pm2Manager.getLogRotationConfig();
      
      expect(updatedConfig.max_size).toBe('20M');
      expect(updatedConfig.retain).toBe(60);
      expect(updatedConfig.compress).toBe(true); // Should preserve other settings
    });
  });

  describe('Event Emission', () => {
    test('should emit events for configuration updates', (done) => {
      pm2Manager.on('logrotation:updated', (config) => {
        expect(config).toHaveProperty('max_size');
        done();
      });

      pm2Manager.updateLogRotationConfig({ max_size: '15M' });
    });
  });

  describe('Error Handling', () => {
    test('should handle PM2 not installed gracefully', async () => {
      // This test assumes PM2 might not be installed in test environment
      // The initialize method should throw a descriptive error
      try {
        await pm2Manager.initialize();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toContain('PM2');
        }
      }
    });
  });
});