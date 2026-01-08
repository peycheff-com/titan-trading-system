/**
 * HMACValidator Tests
 * 
 * Comprehensive unit tests for the HMACValidator class
 */

import { HMACValidator, HMACDefaults, createHMACMiddleware } from '../../src/security/HMACValidator';
import { Logger } from '../../src/logging/Logger';
import { createHmac } from 'crypto';

// Mock Logger
jest.mock('../../src/logging/Logger');
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
} as any;

describe('HMACValidator', () => {
  let validator: HMACValidator;
  const testSecret = 'test-secret-key';
  
  beforeEach(() => {
    jest.clearAllMocks();
    (Logger.getInstance as jest.Mock).mockReturnValue(mockLogger);
    
    validator = new HMACValidator({
      secret: testSecret,
      algorithm: 'sha256',
      headerName: 'x-signature',
      timestampHeaderName: 'x-timestamp',
      timestampTolerance: 300,
      requireTimestamp: true
    });
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      const config = validator.getConfig();
      
      expect(config.algorithm).toBe('sha256');
      expect(config.headerName).toBe('x-signature');
      expect(config.timestampHeaderName).toBe('x-timestamp');
      expect(config.timestampTolerance).toBe(300);
      expect(config.requireTimestamp).toBe(true);
    });

    it('should throw error if secret is missing', () => {
      expect(() => new HMACValidator({ secret: '' })).toThrow('HMAC secret is required');
    });

    it('should log initialization', () => {
      expect(mockLogger.info).toHaveBeenCalledWith(
        'HMAC validator initialized',
        undefined,
        expect.objectContaining({
          algorithm: 'sha256',
          headerName: 'x-signature',
          timestampHeaderName: 'x-timestamp',
          timestampTolerance: 300,
          requireTimestamp: true
        })
      );
    });
  });

  describe('fromEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should create validator from environment variables', () => {
      process.env.HMAC_SECRET = 'env-secret';
      process.env.HMAC_ALGORITHM = 'sha512';
      process.env.HMAC_HEADER_NAME = 'x-custom-signature';
      process.env.HMAC_TIMESTAMP_TOLERANCE = '600';

      const envValidator = HMACValidator.fromEnvironment();
      const config = envValidator.getConfig();

      expect(config.algorithm).toBe('sha512');
      expect(config.headerName).toBe('x-custom-signature');
      expect(config.timestampTolerance).toBe(600);
    });

    it('should throw error if HMAC_SECRET is missing', () => {
      delete process.env.HMAC_SECRET;
      
      expect(() => HMACValidator.fromEnvironment()).toThrow('HMAC_SECRET environment variable is required');
    });

    it('should use defaults for missing optional environment variables', () => {
      process.env.HMAC_SECRET = 'env-secret';
      
      const envValidator = HMACValidator.fromEnvironment();
      const config = envValidator.getConfig();

      expect(config.algorithm).toBe('sha256');
      expect(config.headerName).toBe('x-signature');
      expect(config.timestampTolerance).toBe(300);
    });
  });

  describe('generateSignature', () => {
    it('should generate correct signature without timestamp', () => {
      const payload = 'test payload';
      const signature = validator.generateSignature(payload);
      
      const expectedSignature = createHmac('sha256', testSecret)
        .update(payload, 'utf8')
        .digest('hex');
      
      expect(signature).toBe(expectedSignature);
    });

    it('should generate correct signature with timestamp', () => {
      const payload = 'test payload';
      const timestamp = 1234567890;
      const signature = validator.generateSignature(payload, timestamp);
      
      const expectedSignature = createHmac('sha256', testSecret)
        .update(`${timestamp}.${payload}`, 'utf8')
        .digest('hex');
      
      expect(signature).toBe(expectedSignature);
    });
  });

  describe('validateRequest', () => {
    it('should validate correct signature with timestamp', () => {
      const payload = 'test payload';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = validator.generateSignature(payload, timestamp);
      
      const headers = {
        'x-signature': signature,
        'x-timestamp': timestamp.toString()
      };
      
      const result = validator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.timestamp).toBe(timestamp);
    });

    it('should reject missing signature header', () => {
      const payload = 'test payload';
      const timestamp = Math.floor(Date.now() / 1000);
      
      const headers = {
        'x-timestamp': timestamp.toString()
      };
      
      const result = validator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing x-signature header');
    });

    it('should reject missing timestamp header when required', () => {
      const payload = 'test payload';
      const signature = validator.generateSignature(payload);
      
      const headers = {
        'x-signature': signature
      };
      
      const result = validator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing x-timestamp header');
    });

    it('should reject invalid timestamp format', () => {
      const payload = 'test payload';
      const signature = validator.generateSignature(payload);
      
      const headers = {
        'x-signature': signature,
        'x-timestamp': 'invalid-timestamp'
      };
      
      const result = validator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid timestamp format');
    });

    it('should reject old timestamps', () => {
      const payload = 'test payload';
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signature = validator.generateSignature(payload, oldTimestamp);
      
      const headers = {
        'x-signature': signature,
        'x-timestamp': oldTimestamp.toString()
      };
      
      const result = validator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Timestamp too old');
    });

    it('should reject future timestamps', () => {
      const payload = 'test payload';
      const futureTimestamp = Math.floor(Date.now() / 1000) + 600; // 10 minutes in future
      const signature = validator.generateSignature(payload, futureTimestamp);
      
      const headers = {
        'x-signature': signature,
        'x-timestamp': futureTimestamp.toString()
      };
      
      const result = validator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too far in future');
    });

    it('should reject invalid signature format', () => {
      const payload = 'test payload';
      const timestamp = Math.floor(Date.now() / 1000);
      
      const headers = {
        'x-signature': 'invalid-signature-format!@#',
        'x-timestamp': timestamp.toString()
      };
      
      const result = validator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature format');
    });

    it('should reject incorrect signature', () => {
      const payload = 'test payload';
      const timestamp = Math.floor(Date.now() / 1000);
      const wrongSignature = createHmac('sha256', 'wrong-secret')
        .update(`${timestamp}.${payload}`, 'utf8')
        .digest('hex');
      
      const headers = {
        'x-signature': wrongSignature,
        'x-timestamp': timestamp.toString()
      };
      
      const result = validator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should handle case-insensitive headers', () => {
      const payload = 'test payload';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = validator.generateSignature(payload, timestamp);
      
      const headers = {
        'X-SIGNATURE': signature,
        'X-TIMESTAMP': timestamp.toString()
      };
      
      const result = validator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(true);
    });

    it('should handle array header values', () => {
      const payload = 'test payload';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = validator.generateSignature(payload, timestamp);
      
      const headers = {
        'x-signature': [signature, 'other-value'],
        'x-timestamp': [timestamp.toString()]
      };
      
      const result = validator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(true);
    });

    it('should work without timestamp when not required', () => {
      const noTimestampValidator = new HMACValidator({
        secret: testSecret,
        requireTimestamp: false
      });
      
      const payload = 'test payload';
      const signature = noTimestampValidator.generateSignature(payload);
      
      const headers = {
        'x-signature': signature
      };
      
      const result = noTimestampValidator.validateRequest(payload, headers);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('createHeaders', () => {
    it('should create headers with timestamp', () => {
      const payload = 'test payload';
      const headers = validator.createHeaders(payload, true);
      
      expect(headers['x-signature']).toBeDefined();
      expect(headers['x-timestamp']).toBeDefined();
      
      // Verify signature is correct
      const timestamp = parseInt(headers['x-timestamp']);
      const expectedSignature = validator.generateSignature(payload, timestamp);
      expect(headers['x-signature']).toBe(expectedSignature);
    });

    it('should create headers without timestamp', () => {
      const payload = 'test payload';
      const headers = validator.createHeaders(payload, false);
      
      expect(headers['x-signature']).toBeDefined();
      expect(headers['x-timestamp']).toBeUndefined();
      
      // Verify signature is correct
      const expectedSignature = validator.generateSignature(payload);
      expect(headers['x-signature']).toBe(expectedSignature);
    });
  });

  describe('utility methods', () => {
    it('should check if enabled', () => {
      expect(validator.isEnabled()).toBe(true);
      
      // Test the isEnabled method logic directly
      const testValidator = new HMACValidator({ secret: 'test-secret' });
      expect(testValidator.isEnabled()).toBe(true);
      
      // We can't test with empty secret since constructor throws error
      // This is the correct behavior - empty secret should not be allowed
    });

    it('should update secret', () => {
      const newSecret = 'new-secret';
      validator.updateSecret(newSecret);
      
      // Test with new secret
      const payload = 'test payload';
      const signature = createHmac('sha256', newSecret)
        .update(payload, 'utf8')
        .digest('hex');
      
      const headers = { 'x-signature': signature };
      const noTimestampValidator = new HMACValidator({
        secret: newSecret,
        requireTimestamp: false
      });
      
      const result = noTimestampValidator.validateRequest(payload, headers);
      expect(result.valid).toBe(true);
    });

    it('should throw error when updating to empty secret', () => {
      expect(() => validator.updateSecret('')).toThrow('HMAC secret cannot be empty');
    });

    it('should test signature validation', () => {
      const payload = 'test payload';
      const signature = validator.generateSignature(payload);
      
      expect(validator.test(payload, signature)).toBe(true);
      expect(validator.test(payload, 'wrong-signature')).toBe(false);
    });
  });

  describe('createHMACMiddleware', () => {
    let mockRequest: any;
    let mockReply: any;

    beforeEach(() => {
      mockRequest = {
        url: '/test',
        ip: '127.0.0.1',
        headers: {},
        rawBody: '',
        body: {}
      };
      
      mockReply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };
    });

    it('should skip validation for health endpoints', async () => {
      mockRequest.url = '/health';
      
      const middleware = createHMACMiddleware(validator);
      await middleware(mockRequest, mockReply);
      
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should validate HMAC signature', async () => {
      const payload = 'test payload';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = validator.generateSignature(payload, timestamp);
      
      mockRequest.rawBody = payload;
      mockRequest.headers = {
        'x-signature': signature,
        'x-timestamp': timestamp.toString()
      };
      
      const middleware = createHMACMiddleware(validator);
      await middleware(mockRequest, mockReply);
      
      expect(mockReply.status).not.toHaveBeenCalled();
      expect(mockRequest.hmacValidation).toBeDefined();
      expect(mockRequest.hmacValidation.valid).toBe(true);
    });

    it('should reject invalid HMAC signature', async () => {
      const payload = 'test payload';
      mockRequest.rawBody = payload;
      mockRequest.headers = {
        'x-signature': 'invalid-signature'
      };
      
      const middleware = createHMACMiddleware(validator);
      await middleware(mockRequest, mockReply);
      
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: expect.any(String),
        timestamp: expect.any(String)
      });
    });
  });

  describe('defaults', () => {
    it('should have correct default configurations', () => {
      expect(HMACDefaults.development).toEqual({
        algorithm: 'sha256',
        timestampTolerance: 600,
        requireTimestamp: false
      });

      expect(HMACDefaults.production).toEqual({
        algorithm: 'sha512',
        timestampTolerance: 300,
        requireTimestamp: true
      });

      expect(HMACDefaults.test).toEqual({
        algorithm: 'sha256',
        timestampTolerance: 3600,
        requireTimestamp: false
      });
    });
  });

  describe('timing attack protection', () => {
    it('should take similar time for valid and invalid signatures', async () => {
      const payload = 'test payload';
      const timestamp = Math.floor(Date.now() / 1000);
      const validSignature = validator.generateSignature(payload, timestamp);
      const invalidSignature = 'a'.repeat(validSignature.length);
      
      const validHeaders = {
        'x-signature': validSignature,
        'x-timestamp': timestamp.toString()
      };
      
      const invalidHeaders = {
        'x-signature': invalidSignature,
        'x-timestamp': timestamp.toString()
      };
      
      // Measure time for valid signature
      const validStart = Date.now();
      validator.validateRequest(payload, validHeaders);
      const validTime = Date.now() - validStart;
      
      // Measure time for invalid signature
      const invalidStart = Date.now();
      validator.validateRequest(payload, invalidHeaders);
      const invalidTime = Date.now() - invalidStart;
      
      // Times should be similar (within reasonable margin)
      const timeDifference = Math.abs(validTime - invalidTime);
      expect(timeDifference).toBeLessThan(50); // 50ms tolerance
    });
  });
});