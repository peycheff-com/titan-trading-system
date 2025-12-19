/**
 * InputValidator Tests
 * 
 * Tests for input validation and sanitization functionality
 */

import { InputValidator } from '../../src/security/InputValidator.js';

describe('InputValidator', () => {
  describe('String Validation', () => {
    it('should validate required strings', () => {
      const result = InputValidator.validateString('test', 'field', { required: true });
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('test');
    });

    it('should reject empty required strings', () => {
      const result = InputValidator.validateString('', 'field', { required: true });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('field is required');
    });

    it('should validate string length', () => {
      const result = InputValidator.validateString('ab', 'field', { minLength: 3, maxLength: 10 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('field must be at least 3 characters long');
    });

    it('should validate against pattern', () => {
      const result = InputValidator.validateString('invalid!', 'field', { pattern: /^[a-zA-Z0-9]+$/ });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('field format is invalid');
    });

    it('should validate allowed values', () => {
      const result = InputValidator.validateString('invalid', 'field', { allowedValues: ['valid1', 'valid2'] });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('field must be one of: valid1, valid2');
    });

    it('should sanitize strings when requested', () => {
      const result = InputValidator.validateString('  test\x00string  ', 'field', { sanitize: true });
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe('teststring');
    });
  });

  describe('Number Validation', () => {
    it('should validate numbers', () => {
      const result = InputValidator.validateNumber(42, 'field', { required: true });
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(42);
    });

    it('should convert string numbers', () => {
      const result = InputValidator.validateNumber('42.5', 'field', { required: true });
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(42.5);
    });

    it('should reject invalid number strings', () => {
      const result = InputValidator.validateNumber('not-a-number', 'field', { required: true });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('field must be a valid number');
    });

    it('should validate number ranges', () => {
      const result = InputValidator.validateNumber(150, 'field', { min: 0, max: 100 });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('field must be at most 100');
    });

    it('should reject infinity and NaN', () => {
      const result1 = InputValidator.validateNumber(Infinity, 'field', { required: true });
      expect(result1.isValid).toBe(false);
      expect(result1.errors).toContain('field must be a finite number');

      const result2 = InputValidator.validateNumber(NaN, 'field', { required: true });
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('field must be a finite number');
    });
  });

  describe('Boolean Validation', () => {
    it('should validate boolean values', () => {
      const result = InputValidator.validateBoolean(true, 'field', { required: true });
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toBe(true);
    });

    it('should convert string booleans', () => {
      const result1 = InputValidator.validateBoolean('true', 'field', { required: true });
      expect(result1.isValid).toBe(true);
      expect(result1.sanitizedValue).toBe(true);

      const result2 = InputValidator.validateBoolean('false', 'field', { required: true });
      expect(result2.isValid).toBe(true);
      expect(result2.sanitizedValue).toBe(false);
    });

    it('should convert number booleans', () => {
      const result1 = InputValidator.validateBoolean(1, 'field', { required: true });
      expect(result1.isValid).toBe(true);
      expect(result1.sanitizedValue).toBe(true);

      const result2 = InputValidator.validateBoolean(0, 'field', { required: true });
      expect(result2.isValid).toBe(true);
      expect(result2.sanitizedValue).toBe(false);
    });
  });

  describe('Trading-Specific Validations', () => {
    it('should validate signal IDs', () => {
      const result1 = InputValidator.validateSignalId('valid-signal_123');
      expect(result1.isValid).toBe(true);

      const result2 = InputValidator.validateSignalId('invalid signal!');
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('signalId format is invalid');
    });

    it('should validate phase IDs', () => {
      const result1 = InputValidator.validatePhaseId('phase1');
      expect(result1.isValid).toBe(true);

      const result2 = InputValidator.validatePhaseId('invalid-phase');
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('phaseId must be one of: phase1, phase2, phase3');
    });

    it('should validate trading symbols', () => {
      const result1 = InputValidator.validateSymbol('BTCUSDT');
      expect(result1.isValid).toBe(true);

      const result2 = InputValidator.validateSymbol('btc-usdt');
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('symbol format is invalid');
    });

    it('should validate trade sides', () => {
      const result1 = InputValidator.validateSide('BUY');
      expect(result1.isValid).toBe(true);

      const result2 = InputValidator.validateSide('LONG');
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('side must be one of: BUY, SELL');
    });

    it('should validate position sizes', () => {
      const result1 = InputValidator.validatePositionSize(0.1);
      expect(result1.isValid).toBe(true);

      const result2 = InputValidator.validatePositionSize(-1);
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('requestedSize must be at least 0.000001');

      const result3 = InputValidator.validatePositionSize(2000000);
      expect(result3.isValid).toBe(false);
      expect(result3.errors).toContain('requestedSize must be at most 1000000');
    });

    it('should validate leverage', () => {
      const result1 = InputValidator.validateLeverage(20);
      expect(result1.isValid).toBe(true);

      const result2 = InputValidator.validateLeverage(150);
      expect(result2.isValid).toBe(false);
      expect(result2.errors).toContain('leverage must be at most 100');
    });
  });

  describe('Allocation Weights Validation', () => {
    it('should validate correct allocation weights', () => {
      const allocation = { w1: 0.5, w2: 0.3, w3: 0.2 };
      const result = InputValidator.validateAllocationWeights(allocation);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toEqual(allocation);
    });

    it('should reject allocation weights that do not sum to 1.0', () => {
      const allocation = { w1: 0.5, w2: 0.3, w3: 0.3 }; // Sum = 1.1
      const result = InputValidator.validateAllocationWeights(allocation);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('allocation weights must sum to 1.0, got 1.100');
    });

    it('should reject negative allocation weights', () => {
      const allocation = { w1: -0.1, w2: 0.6, w3: 0.5 };
      const result = InputValidator.validateAllocationWeights(allocation);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('w1 must be at least 0');
    });

    it('should reject allocation weights greater than 1.0', () => {
      const allocation = { w1: 1.5, w2: 0, w3: 0 };
      const result = InputValidator.validateAllocationWeights(allocation);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('w1 must be at most 1');
    });
  });

  describe('Signal Request Validation', () => {
    it('should validate complete signal request', () => {
      const signalRequest = {
        signalId: 'test-signal-123',
        phaseId: 'phase1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        requestedSize: 0.1,
        leverage: 20,
        timestamp: Date.now()
      };

      const result = InputValidator.validateSignalRequest(signalRequest);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toMatchObject({
        signalId: 'test-signal-123',
        phaseId: 'phase1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        requestedSize: 0.1,
        leverage: 20
      });
    });

    it('should reject invalid signal request', () => {
      const signalRequest = {
        signalId: '',
        phaseId: 'invalid-phase',
        symbol: 'btc',
        side: 'LONG',
        requestedSize: -1
      };

      const result = InputValidator.validateSignalRequest(signalRequest);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle missing optional fields', () => {
      const signalRequest = {
        signalId: 'test-signal-123',
        phaseId: 'phase1',
        symbol: 'BTCUSDT',
        side: 'BUY',
        requestedSize: 0.1
        // leverage and timestamp are optional
      };

      const result = InputValidator.validateSignalRequest(signalRequest);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Permissions Validation', () => {
    it('should validate correct permissions', () => {
      const permissions = ['override:create', 'breaker:reset'];
      const result = InputValidator.validatePermissions(permissions);
      expect(result.isValid).toBe(true);
      expect(result.sanitizedValue).toEqual(permissions);
    });

    it('should reject invalid permissions', () => {
      const permissions = ['invalid:permission', 'override:create'];
      const result = InputValidator.validatePermissions(permissions);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('permission must be one of: override:create, override:deactivate, breaker:reset, operator:create, config:update');
    });

    it('should reject empty permissions array', () => {
      const result = InputValidator.validatePermissions([]);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('permissions must have at least 1 items');
    });
  });
});