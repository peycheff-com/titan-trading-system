/**
 * ConfigValidator Tests
 * 
 * Comprehensive unit tests for the ConfigValidator class covering
 * environment variable validation, type checking, and error handling.
 */

import { ConfigValidator, ValidationRule } from '../../src/config/ConfigValidator.js';
import { Logger } from '../../src/logging/Logger.js';

// Mock Logger
jest.mock('../../src/logging/Logger.js');

describe('ConfigValidator', () => {
  let configValidator: ConfigValidator;
  let mockLogger: jest.Mocked<Logger>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Create mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      logSecurityEvent: jest.fn()
    } as any;

    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);

    configValidator = new ConfigValidator();
    
    // Clear all default rules for isolated testing
    const defaultRules = configValidator.getRules();
    for (const rule of defaultRules) {
      configValidator.removeRule(rule.name);
    }
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Rule Management', () => {
    it('should add custom validation rules', () => {
      const customRule: ValidationRule = {
        name: 'CUSTOM_VAR',
        required: true,
        type: 'string',
        description: 'Custom variable'
      };

      configValidator.addRule(customRule);

      const rule = configValidator.getRule('CUSTOM_VAR');
      expect(rule).toEqual(customRule);
    });

    it('should remove validation rules', () => {
      const customRule: ValidationRule = {
        name: 'CUSTOM_VAR',
        required: true,
        type: 'string',
        description: 'Custom variable'
      };

      configValidator.addRule(customRule);
      expect(configValidator.getRule('CUSTOM_VAR')).toBeDefined();

      configValidator.removeRule('CUSTOM_VAR');
      expect(configValidator.getRule('CUSTOM_VAR')).toBeUndefined();
    });

    it('should get all validation rules', () => {
      // Add some test rules since we cleared defaults
      const rule1: ValidationRule = {
        name: 'TEST_RULE_1',
        required: true,
        type: 'string',
        description: 'Test rule 1'
      };
      
      const rule2: ValidationRule = {
        name: 'TEST_RULE_2',
        required: false,
        type: 'number',
        description: 'Test rule 2'
      };

      configValidator.addRule(rule1);
      configValidator.addRule(rule2);

      const rules = configValidator.getRules();
      expect(rules.length).toBe(2);
      expect(rules.some(rule => rule.name === 'TEST_RULE_1')).toBe(true);
      expect(rules.some(rule => rule.name === 'TEST_RULE_2')).toBe(true);
    });
  });

  describe('String Validation', () => {
    it('should validate string values', () => {
      process.env.TEST_STRING = 'test-value';

      const rule: ValidationRule = {
        name: 'TEST_STRING',
        required: true,
        type: 'string',
        description: 'Test string'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(true);
      const variable = result.variables.find(v => v.name === 'TEST_STRING');
      expect(variable?.valid).toBe(true);
      expect(variable?.value).toBe('test-value');
    });

    it('should validate string patterns', () => {
      process.env.TEST_PATTERN = 'invalid-pattern';

      const rule: ValidationRule = {
        name: 'TEST_PATTERN',
        required: true,
        type: 'string',
        pattern: /^valid-/,
        description: 'Test pattern'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(false);
      const variable = result.variables.find(v => v.name === 'TEST_PATTERN');
      expect(variable?.valid).toBe(false);
      expect(variable?.error).toContain('does not match required pattern');
    });
  });

  describe('Number Validation', () => {
    it('should validate number values', () => {
      process.env.TEST_NUMBER = '42';

      const rule: ValidationRule = {
        name: 'TEST_NUMBER',
        required: true,
        type: 'number',
        description: 'Test number'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(true);
      const variable = result.variables.find(v => v.name === 'TEST_NUMBER');
      expect(variable?.valid).toBe(true);
      expect(variable?.value).toBe(42);
    });

    it('should validate number ranges', () => {
      process.env.TEST_RANGE = '150';

      const rule: ValidationRule = {
        name: 'TEST_RANGE',
        required: true,
        type: 'number',
        minValue: 1,
        maxValue: 100,
        description: 'Test range'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(false);
      const variable = result.variables.find(v => v.name === 'TEST_RANGE');
      expect(variable?.valid).toBe(false);
      expect(variable?.error).toContain('must be <= 100');
    });

    it('should reject invalid numbers', () => {
      process.env.TEST_INVALID_NUMBER = 'not-a-number';

      const rule: ValidationRule = {
        name: 'TEST_INVALID_NUMBER',
        required: true,
        type: 'number',
        description: 'Test invalid number'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(false);
      const variable = result.variables.find(v => v.name === 'TEST_INVALID_NUMBER');
      expect(variable?.valid).toBe(false);
      expect(variable?.error).toContain('must be a valid number');
    });
  });

  describe('Boolean Validation', () => {
    it('should validate true boolean values', () => {
      const testCases = ['true', '1', 'yes', 'on', 'TRUE', 'YES'];

      for (const testValue of testCases) {
        process.env.TEST_BOOLEAN = testValue;

        const rule: ValidationRule = {
          name: 'TEST_BOOLEAN',
          required: true,
          type: 'boolean',
          description: 'Test boolean'
        };

        configValidator.removeRule('TEST_BOOLEAN');
        configValidator.addRule(rule);
        const result = configValidator.validate();

        const variable = result.variables.find(v => v.name === 'TEST_BOOLEAN');
        expect(variable?.valid).toBe(true);
        expect(variable?.value).toBe(true);
      }
    });

    it('should validate false boolean values', () => {
      const testCases = ['false', '0', 'no', 'off', 'FALSE', 'NO'];

      for (const testValue of testCases) {
        process.env.TEST_BOOLEAN = testValue;

        const rule: ValidationRule = {
          name: 'TEST_BOOLEAN',
          required: true,
          type: 'boolean',
          description: 'Test boolean'
        };

        configValidator.removeRule('TEST_BOOLEAN');
        configValidator.addRule(rule);
        const result = configValidator.validate();

        const variable = result.variables.find(v => v.name === 'TEST_BOOLEAN');
        expect(variable?.valid).toBe(true);
        expect(variable?.value).toBe(false);
      }
    });

    it('should reject invalid boolean values', () => {
      process.env.TEST_INVALID_BOOLEAN = 'maybe';

      const rule: ValidationRule = {
        name: 'TEST_INVALID_BOOLEAN',
        required: true,
        type: 'boolean',
        description: 'Test invalid boolean'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(false);
      const variable = result.variables.find(v => v.name === 'TEST_INVALID_BOOLEAN');
      expect(variable?.valid).toBe(false);
      expect(variable?.error).toContain('must be a boolean value');
    });
  });

  describe('URL Validation', () => {
    it('should validate valid URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://localhost:3000',
        'postgresql://user:pass@host:5432/db',
        'redis://localhost:6379'
      ];

      for (const url of validUrls) {
        process.env.TEST_URL = url;

        const rule: ValidationRule = {
          name: 'TEST_URL',
          required: true,
          type: 'url',
          description: 'Test URL'
        };

        configValidator.removeRule('TEST_URL');
        configValidator.addRule(rule);
        const result = configValidator.validate();

        const variable = result.variables.find(v => v.name === 'TEST_URL');
        expect(variable?.valid).toBe(true);
        expect(variable?.value).toBe(url);
      }
    });

    it('should reject invalid URLs', () => {
      process.env.TEST_INVALID_URL = 'not-a-url';

      const rule: ValidationRule = {
        name: 'TEST_INVALID_URL',
        required: true,
        type: 'url',
        description: 'Test invalid URL'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(false);
      const variable = result.variables.find(v => v.name === 'TEST_INVALID_URL');
      expect(variable?.valid).toBe(false);
      expect(variable?.error).toContain('must be a valid URL');
    });
  });

  describe('Port Validation', () => {
    it('should validate valid port numbers', () => {
      const validPorts = ['80', '443', '3000', '8080', '65535'];

      for (const port of validPorts) {
        process.env.TEST_PORT = port;

        const rule: ValidationRule = {
          name: 'TEST_PORT',
          required: true,
          type: 'port',
          description: 'Test port'
        };

        configValidator.removeRule('TEST_PORT');
        configValidator.addRule(rule);
        const result = configValidator.validate();

        const variable = result.variables.find(v => v.name === 'TEST_PORT');
        expect(variable?.valid).toBe(true);
        expect(variable?.value).toBe(parseInt(port, 10));
      }
    });

    it('should reject invalid port numbers', () => {
      const invalidPorts = ['0', '65536', '-1', 'not-a-port'];

      for (const port of invalidPorts) {
        process.env.TEST_INVALID_PORT = port;

        const rule: ValidationRule = {
          name: 'TEST_INVALID_PORT',
          required: true,
          type: 'port',
          description: 'Test invalid port'
        };

        configValidator.removeRule('TEST_INVALID_PORT');
        configValidator.addRule(rule);
        const result = configValidator.validate();

        const variable = result.variables.find(v => v.name === 'TEST_INVALID_PORT');
        expect(variable?.valid).toBe(false);
        expect(variable?.error).toContain('must be a valid port number');
      }
    });
  });

  describe('Enum Validation', () => {
    it('should validate enum values', () => {
      process.env.TEST_ENUM = 'production';

      const rule: ValidationRule = {
        name: 'TEST_ENUM',
        required: true,
        type: 'enum',
        enumValues: ['development', 'production', 'test'],
        description: 'Test enum'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(true);
      const variable = result.variables.find(v => v.name === 'TEST_ENUM');
      expect(variable?.valid).toBe(true);
      expect(variable?.value).toBe('production');
    });

    it('should reject invalid enum values', () => {
      process.env.TEST_INVALID_ENUM = 'invalid-value';

      const rule: ValidationRule = {
        name: 'TEST_INVALID_ENUM',
        required: true,
        type: 'enum',
        enumValues: ['development', 'production', 'test'],
        description: 'Test invalid enum'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(false);
      const variable = result.variables.find(v => v.name === 'TEST_INVALID_ENUM');
      expect(variable?.valid).toBe(false);
      expect(variable?.error).toContain('must be one of: development, production, test');
    });
  });

  describe('Required vs Optional Variables', () => {
    it('should fail validation for missing required variables', () => {
      delete process.env.TEST_REQUIRED;

      const rule: ValidationRule = {
        name: 'TEST_REQUIRED',
        required: true,
        type: 'string',
        description: 'Test required'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(false);
      const variable = result.variables.find(v => v.name === 'TEST_REQUIRED');
      expect(variable?.valid).toBe(false);
      expect(variable?.error).toContain('Required environment variable TEST_REQUIRED is not set');
    });

    it('should pass validation for missing optional variables', () => {
      delete process.env.TEST_OPTIONAL;

      const rule: ValidationRule = {
        name: 'TEST_OPTIONAL',
        required: false,
        type: 'string',
        description: 'Test optional'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      const variable = result.variables.find(v => v.name === 'TEST_OPTIONAL');
      expect(variable?.valid).toBe(true);
      expect(variable?.value).toBeUndefined();
    });

    it('should use default values for missing variables', () => {
      delete process.env.TEST_DEFAULT;

      const rule: ValidationRule = {
        name: 'TEST_DEFAULT',
        required: true,
        type: 'string',
        defaultValue: 'default-value',
        description: 'Test default'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(true);
      const variable = result.variables.find(v => v.name === 'TEST_DEFAULT');
      expect(variable?.valid).toBe(true);
      expect(variable?.value).toBe('default-value');
      expect(variable?.usingDefault).toBe(true);
      expect(variable?.warning).toContain('Using default value');
    });
  });

  describe('Default Rules', () => {
    beforeEach(() => {
      // Re-create validator with default rules for this test suite
      configValidator = new ConfigValidator();
    });

    it('should validate NODE_ENV', () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '3000';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

      const result = configValidator.validate();
      const variable = result.variables.find(v => v.name === 'NODE_ENV');

      expect(variable?.valid).toBe(true);
      expect(variable?.value).toBe('production');
    });

    it('should validate PORT', () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '3000';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

      const result = configValidator.validate();
      const variable = result.variables.find(v => v.name === 'PORT');

      expect(variable?.valid).toBe(true);
      expect(variable?.value).toBe(3000);
    });

    it('should validate DATABASE_URL', () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '3000';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

      const result = configValidator.validate();
      const variable = result.variables.find(v => v.name === 'DATABASE_URL');

      expect(variable?.valid).toBe(true);
      expect(variable?.value).toBe('postgresql://user:pass@localhost:5432/db');
    });

    it('should handle missing required variables with defaults', () => {
      // Clear all environment variables
      for (const rule of configValidator.getRules()) {
        delete process.env[rule.name];
      }

      const result = configValidator.validate();

      // Should still be valid due to default values
      expect(result.valid).toBe(false); // DATABASE_URL has no default
      expect(result.summary.usingDefaults).toBeGreaterThan(0);
    });
  });

  describe('Configuration Summary', () => {
    beforeEach(() => {
      // Re-create validator with default rules for this test suite
      configValidator = new ConfigValidator();
    });

    it('should provide configuration summary with masked sensitive values', () => {
      process.env.NODE_ENV = 'production';
      process.env.PORT = '3000';
      process.env.HMAC_SECRET = 'super-secret-key';
      process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

      const summary = configValidator.getConfigSummary();

      expect(summary.NODE_ENV).toBe('production');
      expect(summary.PORT).toBe('3000');
      expect(summary.HMAC_SECRET).toBe('[CONFIGURED]');
      expect(summary.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
    });

    it('should show [NOT SET] for missing variables', () => {
      delete process.env.REDIS_URL;

      const summary = configValidator.getConfigSummary();

      expect(summary.REDIS_URL).toBe('[NOT SET]');
    });
  });

  describe('Validation Summary', () => {
    it('should provide validation summary', () => {
      // Set up mixed validation results
      process.env.TEST_VALID = 'valid-value';
      process.env.TEST_INVALID = 'invalid-port';

      const validRule: ValidationRule = {
        name: 'TEST_VALID',
        required: true,
        type: 'string',
        description: 'Valid test'
      };

      const invalidRule: ValidationRule = {
        name: 'TEST_INVALID',
        required: true,
        type: 'port',
        description: 'Invalid test'
      };

      const missingRule: ValidationRule = {
        name: 'TEST_MISSING',
        required: true,
        type: 'string',
        description: 'Missing test'
      };

      configValidator.addRule(validRule);
      configValidator.addRule(invalidRule);
      configValidator.addRule(missingRule);

      const result = configValidator.validate();

      expect(result.summary.total).toBe(3);
      expect(result.summary.valid).toBe(1);
      expect(result.summary.invalid).toBe(2);
      expect(result.summary.total).toBe(
        result.summary.valid + result.summary.invalid
      );
    });

    it('should track warnings and defaults', () => {
      // Clear optional variable to trigger default
      delete process.env.TEST_DEFAULT;

      const rule: ValidationRule = {
        name: 'TEST_DEFAULT',
        required: false,
        type: 'string',
        defaultValue: 'default-value',
        description: 'Test default'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.summary.usingDefaults).toBe(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle unknown validation types', () => {
      const rule: ValidationRule = {
        name: 'TEST_UNKNOWN_TYPE',
        required: true,
        type: 'unknown' as any,
        description: 'Test unknown type'
      };

      process.env.TEST_UNKNOWN_TYPE = 'test-value';

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(false);
      const variable = result.variables.find(v => v.name === 'TEST_UNKNOWN_TYPE');
      expect(variable?.valid).toBe(false);
      expect(variable?.error).toContain('Unknown validation type');
    });

    it('should handle empty string values', () => {
      process.env.TEST_EMPTY = '';

      const rule: ValidationRule = {
        name: 'TEST_EMPTY',
        required: true,
        type: 'string',
        description: 'Test empty'
      };

      configValidator.addRule(rule);
      const result = configValidator.validate();

      expect(result.valid).toBe(false);
      const variable = result.variables.find(v => v.name === 'TEST_EMPTY');
      expect(variable?.valid).toBe(false);
      expect(variable?.error).toContain('Required environment variable TEST_EMPTY is not set');
    });
  });
});