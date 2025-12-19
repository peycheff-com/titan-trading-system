/**
 * config-validation.integration.test.js
 * 
 * Integration tests for environment validation on startup
 * Tests the complete validation flow including process exit behavior
 * 
 * Requirements: 96.1-96.10
 * Task: 126. Integration test: Environment validation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Helper to run validation in a separate process
 * This allows us to test process.exit() behavior
 * 
 * @param {object} env - Environment variables to set
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
 */
function runValidationProcess(env = {}) {
  return new Promise((resolve) => {
    // Create a test script that imports and runs validateConfig
    const testScript = `
      import { validateConfig } from './ConfigSchema.js';
      try {
        validateConfig();
        process.exit(0);
      } catch (error) {
        // validateConfig already calls process.exit(1)
        // This catch is just for safety
        process.exit(1);
      }
    `;

    const child = spawn('node', ['--input-type=module', '--eval', testScript], {
      cwd: __dirname,
      env: {
        ...process.env,
        ...env,
        NODE_ENV: 'test',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (exitCode) => {
      resolve({
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

describe('Environment Validation Integration Tests', () => {
  describe('Requirement 96.2: Missing MAX_RISK_PCT', () => {
    it('should exit with code 1 when MAX_RISK_PCT is missing', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
        // MAX_RISK_PCT intentionally missing
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.2: Log specific missing variables with clear error messages
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('MAX_RISK_PCT');
      expect(result.stderr).toContain('required');
    }, 10000);
  });

  describe('Requirement 96.5: Invalid PHASE_1_RISK_PCT', () => {
    it('should exit with code 1 when PHASE_1_RISK_PCT is 0.6 (above maximum)', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.6', // Above maximum of 0.50
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.3: Log validation errors with expected vs actual values
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('PHASE_1_RISK_PCT');
      expect(result.stderr).toContain('0.5'); // Maximum value
    }, 10000);

    it('should exit with code 1 when PHASE_1_RISK_PCT is invalid (non-numeric)', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: 'invalid', // Non-numeric value
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.7: Log type validation error for non-numeric values
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('PHASE_1_RISK_PCT');
      expect(result.stderr).toContain('number');
    }, 10000);
  });

  describe('Requirement 96.6: Missing BROKER_API_KEY', () => {
    it('should exit with code 1 when BROKER_API_KEY is missing', async () => {
      const result = await runValidationProcess({
        // BROKER_API_KEY intentionally missing
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.6: Exit with error for missing critical security credentials
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('BROKER_API_KEY');
      expect(result.stderr).toContain('required');
    }, 10000);

    it('should exit with code 1 when BROKER_API_SECRET is missing', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        // BROKER_API_SECRET intentionally missing
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.6: Exit with error for missing critical security credentials
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('BROKER_API_SECRET');
      expect(result.stderr).toContain('required');
    }, 10000);

    it('should exit with code 1 when HMAC_SECRET is missing', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        // HMAC_SECRET intentionally missing
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.6: Exit with error for missing critical security credentials
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('HMAC_SECRET');
      expect(result.stderr).toContain('required');
    }, 10000);

    it('should exit with code 1 when HMAC_SECRET is too short', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'short_secret', // Less than 32 characters
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.6: Exit with error for invalid HMAC_SECRET
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('HMAC_SECRET');
      expect(result.stderr).toContain('32'); // Minimum length
    }, 10000);
  });

  describe('Requirement 96.9: Valid Configuration', () => {
    it('should pass validation and log success with valid config', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.9: Log success message
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Environment validation passed');
      expect(result.stdout).toContain('all required config present');

      // Requirement 96.9: Log sanitized config summary (no secrets)
      expect(result.stdout).toContain('Validation Summary');
      expect(result.stdout).toContain('Configuration (secrets masked)');

      // Verify secrets are masked
      expect(result.stdout).not.toContain('test_secret_1234567890abcdef');
      expect(result.stdout).toContain('***MASKED***');
    }, 10000);

    it('should apply defaults for optional fields', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
        // Optional fields not provided - should use defaults
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Environment validation passed');

      // Verify defaults are applied
      expect(result.stdout).toContain('MAKER_FEE_PCT');
      expect(result.stdout).toContain('0.0002'); // Default maker fee
      expect(result.stdout).toContain('TAKER_FEE_PCT');
      expect(result.stdout).toContain('0.0006'); // Default taker fee
      expect(result.stdout).toContain('RATE_LIMIT_PER_SEC');
      expect(result.stdout).toContain('12'); // Default rate limit
    }, 10000);
  });

  describe('Requirement 96.7: Type Validation', () => {
    it('should exit with code 1 when MAX_RISK_PCT is non-numeric', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: 'not_a_number', // Invalid type
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.7: Log type validation error
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('MAX_RISK_PCT');
      expect(result.stderr).toContain('number');
    }, 10000);

    it('should exit with code 1 when RATE_LIMIT_PER_SEC is non-numeric', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
        RATE_LIMIT_PER_SEC: 'invalid', // Invalid type
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.7: Log type validation error
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('RATE_LIMIT_PER_SEC');
    }, 10000);

    it('should exit with code 1 when MAKER_FEE_PCT is non-numeric', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
        MAKER_FEE_PCT: 'abc', // Invalid type
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.7: Log type validation error
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('MAKER_FEE_PCT');
    }, 10000);
  });

  describe('Requirement 96.4: MAX_RISK_PCT Range Validation', () => {
    it('should exit with code 1 when MAX_RISK_PCT is below 0.01', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.005', // Below minimum
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.4: Error message specifies required range
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('MAX_RISK_PCT');
      expect(result.stderr).toContain('0.01'); // Minimum value
    }, 10000);

    it('should exit with code 1 when MAX_RISK_PCT is above 0.20', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.25', // Above maximum
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.4: Error message specifies required range
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('MAX_RISK_PCT');
      expect(result.stderr).toContain('0.2'); // Maximum value
    }, 10000);

    it('should pass validation when MAX_RISK_PCT is at minimum boundary (0.01)', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.01', // At minimum
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Environment validation passed');
    }, 10000);

    it('should pass validation when MAX_RISK_PCT is at maximum boundary (0.20)', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.20', // At maximum
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Environment validation passed');
    }, 10000);
  });

  describe('Requirement 96.5: PHASE Risk PCT Range Validation', () => {
    it('should exit with code 1 when PHASE_2_RISK_PCT is below 0.01', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.005', // Below minimum
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.5: Error message specifies required range (0.01-0.50)
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('PHASE_2_RISK_PCT');
      expect(result.stderr).toContain('0.01'); // Minimum value
    }, 10000);

    it('should exit with code 1 when PHASE_2_RISK_PCT is above 0.50', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.60', // Above maximum
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.5: Error message specifies required range (0.01-0.50)
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('PHASE_2_RISK_PCT');
      expect(result.stderr).toContain('0.5'); // Maximum value
    }, 10000);

    it('should pass validation when PHASE_1_RISK_PCT is at boundary (0.50)', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.50', // At maximum
        PHASE_2_RISK_PCT: '0.05',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Environment validation passed');
    }, 10000);
  });

  describe('Edge Cases and Multiple Errors', () => {
    it('should report multiple validation errors at once', async () => {
      const result = await runValidationProcess({
        // Multiple missing/invalid fields
        BROKER_API_KEY: 'test_key_1234567890abcdef',
        // BROKER_API_SECRET missing
        HMAC_SECRET: 'short', // Too short
        MAX_RISK_PCT: '0.25', // Above maximum
        PHASE_1_RISK_PCT: 'invalid', // Non-numeric
        // PHASE_2_RISK_PCT missing
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Should report all errors
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('BROKER_API_SECRET');
      expect(result.stderr).toContain('HMAC_SECRET');
      expect(result.stderr).toContain('MAX_RISK_PCT');
      expect(result.stderr).toContain('PHASE_1_RISK_PCT');
      expect(result.stderr).toContain('PHASE_2_RISK_PCT');
    }, 10000);

    it('should handle empty string values as missing', async () => {
      const result = await runValidationProcess({
        BROKER_API_KEY: '', // Empty string
        BROKER_API_SECRET: 'test_secret_1234567890abcdef',
        HMAC_SECRET: 'test_hmac_secret_at_least_32_characters_long_for_security',
        MAX_RISK_PCT: '0.02',
        PHASE_1_RISK_PCT: '0.10',
        PHASE_2_RISK_PCT: '0.05',
      });

      // Requirement 96.10: Exit with code 1 on validation failure
      expect(result.exitCode).toBe(1);

      // Requirement 96.2: Treat empty strings as missing
      expect(result.stderr).toContain('Environment validation failed');
      expect(result.stderr).toContain('BROKER_API_KEY');
    }, 10000);
  });
});
