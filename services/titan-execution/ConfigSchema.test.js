/**
 * ConfigSchema.test.js
 * 
 * Tests for environment schema validation
 * 
 * Requirements: 96.1-96.10
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConfigSchema } from './ConfigSchema.js';

describe('ConfigSchema', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Required Fields', () => {
    it('should validate when all required fields are present', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32), // 32 characters minimum
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject when BROKER_API_KEY is missing', () => {
      const config = {
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject when BROKER_API_SECRET is missing', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject when HMAC_SECRET is too short', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'short', // Less than 32 characters
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject when MAX_RISK_PCT is missing', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('Risk Parameter Validation', () => {
    it('should reject MAX_RISK_PCT below 0.01', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.005, // Below minimum
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject MAX_RISK_PCT above 0.20', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.25, // Above maximum
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject PHASE_1_RISK_PCT below 0.01', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.005, // Below minimum
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject PHASE_1_RISK_PCT above 0.50', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.60, // Above maximum
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject PHASE_2_RISK_PCT below 0.01', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.005, // Below minimum
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject PHASE_2_RISK_PCT above 0.50', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.60, // Above maximum
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('Optional Fields with Defaults', () => {
    it('should apply default for MAKER_FEE_PCT', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.parse(config);
      expect(result.MAKER_FEE_PCT).toBe(0.0002);
    });

    it('should apply default for TAKER_FEE_PCT', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.parse(config);
      expect(result.TAKER_FEE_PCT).toBe(0.0006);
    });

    it('should apply default for RATE_LIMIT_PER_SEC', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.parse(config);
      expect(result.RATE_LIMIT_PER_SEC).toBe(12);
    });

    it('should apply default for DATABASE_TYPE', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.parse(config);
      expect(result.DATABASE_TYPE).toBe('sqlite');
    });

    it('should apply default for REDIS_REQUIRED', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
      };

      const result = ConfigSchema.parse(config);
      expect(result.REDIS_REQUIRED).toBe(false);
    });
  });

  describe('Numeric Validation', () => {
    it('should reject RATE_LIMIT_PER_SEC below 1', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
        RATE_LIMIT_PER_SEC: 0,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject RATE_LIMIT_PER_SEC above 50', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
        RATE_LIMIT_PER_SEC: 100,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject negative MAKER_FEE_PCT', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
        MAKER_FEE_PCT: -0.001,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject MAKER_FEE_PCT above 0.01', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
        MAKER_FEE_PCT: 0.02,
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('Enum Validation', () => {
    it('should accept valid DATABASE_TYPE values', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
        DATABASE_TYPE: 'postgres',
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid DATABASE_TYPE values', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
        DATABASE_TYPE: 'mysql',
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should accept valid LOG_LEVEL values', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
        LOG_LEVEL: 'debug',
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid LOG_LEVEL values', () => {
      const config = {
        BROKER_API_KEY: 'test_api_key',
        BROKER_API_SECRET: 'test_api_secret',
        HMAC_SECRET: 'a'.repeat(32),
        MAX_RISK_PCT: 0.02,
        PHASE_1_RISK_PCT: 0.10,
        PHASE_2_RISK_PCT: 0.05,
        LOG_LEVEL: 'verbose',
      };

      const result = ConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });
});
