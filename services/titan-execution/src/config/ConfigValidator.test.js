/**
 * Tests for ConfigValidator
 * 
 * Tests validation, migration, and error handling
 */

import { jest } from '@jest/globals';
import {
  validateConfiguration,
  migrateConfiguration,
  CONFIG_VERSIONS
} from './ConfigValidator.js';

describe('ConfigValidator', () => {
  describe('validateConfiguration', () => {
    it('should validate a valid configuration', () => {
      const config = {
        port: 8080,
        host: 'localhost',
        hmacSecret: 'a'.repeat(32),
        masterPassword: 'b'.repeat(16),
        bybit: {
          apiKey: 'test-key',
          apiSecret: 'test-secret',
          testnet: true
        },
        risk: {
          maxRiskPct: 2.0
        },
        database: {
          path: './test.db'
        },
        version: '2.0.0'
      };
      
      const result = validateConfiguration(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
    
    it('should reject null configuration', () => {
      const result = validateConfiguration(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('non-null object');
    });
    
    it('should reject array configuration', () => {
      const result = validateConfiguration([]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('non-null object');
    });
    
    it('should reject configuration with missing required fields', () => {
      const config = {
        port: 8080
      };
      
      const result = validateConfiguration(config);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
    
    it('should reject configuration with invalid port', () => {
      const config = {
        port: 99999,
        host: 'localhost',
        hmacSecret: 'a'.repeat(32),
        bybit: {
          apiKey: 'test',
          apiSecret: 'test'
        },
        risk: {
          maxRiskPct: 2.0
        },
        database: {
          path: './test.db'
        }
      };
      
      const result = validateConfiguration(config);
      expect(result.valid).toBe(false);
    });
    
    it('should reject configuration with short hmacSecret', () => {
      const config = {
        port: 8080,
        host: 'localhost',
        hmacSecret: 'short',
        bybit: {
          apiKey: 'test',
          apiSecret: 'test'
        },
        risk: {
          maxRiskPct: 2.0
        },
        database: {
          path: './test.db'
        }
      };
      
      const result = validateConfiguration(config);
      expect(result.valid).toBe(false);
    });
  });
  
  describe('migrateConfiguration', () => {
    it('should not migrate if already at current version', () => {
      const config = {
        port: 8080,
        host: 'localhost',
        hmacSecret: 'a'.repeat(32),
        bybit: {
          apiKey: 'test',
          apiSecret: 'test'
        },
        risk: {
          maxRiskPct: 2.0
        },
        database: {
          path: './test.db'
        },
        monitoring: {
          prometheusEnabled: true,
          logLevel: 'info'
        },
        safety: {
          zscoreSafetyThreshold: 2.5,
          drawdownVelocityThreshold: 0.05,
          minStructureThreshold: 0.3,
          maxSpreadPct: 0.5,
          maxSlippagePct: 0.3
        },
        performance: {
          wsCacheMaxAgeMs: 1000,
          signalCacheTtlMs: 60000,
          idempotencyTtl: 300,
          heartbeatTimeoutMs: 300000
        },
        version: CONFIG_VERSIONS.CURRENT
      };
      
      const migrated = migrateConfiguration(config);
      expect(migrated.version).toBe(CONFIG_VERSIONS.CURRENT);
    });
    
    it('should migrate from 1.0.0 to 2.0.0', () => {
      const config = {
        port: 8080,
        host: 'localhost',
        hmacSecret: 'a'.repeat(32),
        broker: {
          apiKey: 'test',
          apiSecret: 'test'
        },
        risk: {
          maxRiskPct: 2.0
        },
        database: {
          path: './test.db'
        },
        version: '1.0.0'
      };
      
      const migrated = migrateConfiguration(config);
      
      // Should rename broker to bybit
      expect(migrated.bybit).toBeDefined();
      expect(migrated.broker).toBeUndefined();
      
      // Should add monitoring
      expect(migrated.monitoring).toBeDefined();
      expect(migrated.monitoring.prometheusEnabled).toBe(true);
      
      // Should add safety
      expect(migrated.safety).toBeDefined();
      expect(migrated.safety.zscoreSafetyThreshold).toBe(2.5);
      
      // Should add performance
      expect(migrated.performance).toBeDefined();
      expect(migrated.performance.wsCacheMaxAgeMs).toBe(1000);
      
      // Should update version
      expect(migrated.version).toBe(CONFIG_VERSIONS.CURRENT);
    });
    
    it('should migrate from 1.5.0 to 2.0.0', () => {
      const config = {
        port: 8080,
        host: 'localhost',
        hmacSecret: 'a'.repeat(32),
        bybit: {
          apiKey: 'test',
          apiSecret: 'test'
        },
        risk: {
          maxRiskPct: 2.0
        },
        database: {
          path: './test.db'
        },
        version: '1.5.0'
      };
      
      const migrated = migrateConfiguration(config);
      
      // Should add monitoring, safety, performance
      expect(migrated.monitoring).toBeDefined();
      expect(migrated.safety).toBeDefined();
      expect(migrated.performance).toBeDefined();
      
      // Should update version
      expect(migrated.version).toBe(CONFIG_VERSIONS.CURRENT);
    });
    
    it('should throw error for unknown version', () => {
      const config = {
        port: 8080,
        host: 'localhost',
        hmacSecret: 'a'.repeat(32),
        bybit: {
          apiKey: 'test',
          apiSecret: 'test'
        },
        risk: {
          maxRiskPct: 2.0
        },
        database: {
          path: './test.db'
        },
        version: '0.5.0'
      };
      
      expect(() => migrateConfiguration(config)).toThrow('No migration path');
    });
    
    it('should produce valid configuration after migration', () => {
      const config = {
        port: 8080,
        host: 'localhost',
        hmacSecret: 'a'.repeat(32),
        broker: {
          apiKey: 'test',
          apiSecret: 'test'
        },
        risk: {
          maxRiskPct: 2.0
        },
        database: {
          path: './test.db'
        },
        version: '1.0.0'
      };
      
      const migrated = migrateConfiguration(config);
      const result = validateConfiguration(migrated);
      
      expect(result.valid).toBe(true);
    });
  });
});
