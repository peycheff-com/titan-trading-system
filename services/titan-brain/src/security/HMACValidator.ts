/* eslint-disable functional/immutable-data, functional/no-let -- Stateful runtime: mutations architecturally required */
/**
 * HMACValidator - HMAC signature verification for webhook security
 *
 * Provides HMAC signature verification with timestamp validation
 * to prevent replay attacks and ensure webhook authenticity.
 *
 * Requirements: 2.3.1, 2.3.2, 2.3.3, 2.3.4
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { Logger } from '../logging/Logger.js';

/**
 * HMAC validation configuration
 */
export interface HMACConfig {
  secret: string;
  algorithm: 'sha256' | 'sha512';
  headerName: string;
  timestampHeaderName: string;
  timestampTolerance: number; // seconds
  requireTimestamp: boolean;
}

/**
 * HMAC validation result
 */
export interface HMACValidationResult {
  valid: boolean;
  error?: string;
  timestamp?: number;
  age?: number;
}

/**
 * Default HMAC configuration
 */
const DEFAULT_HMAC_CONFIG: HMACConfig = {
  secret: '',
  algorithm: 'sha256',
  headerName: 'x-signature',
  timestampHeaderName: 'x-timestamp',
  timestampTolerance: 300, // 5 minutes
  requireTimestamp: true,
};

/**
 * HMAC validator for webhook security
 */
export class HMACValidator {
  private config: HMACConfig;
  private logger: Logger;

  constructor(config: Partial<HMACConfig>, logger?: Logger) {
    this.config = { ...DEFAULT_HMAC_CONFIG, ...config };
    this.logger = logger ?? Logger.getInstance('hmac-validator');

    if (!this.config.secret) {
      throw new Error('HMAC secret is required');
    }

    this.logger.info('HMAC validator initialized', undefined, {
      algorithm: this.config.algorithm,
      headerName: this.config.headerName,
      timestampHeaderName: this.config.timestampHeaderName,
      timestampTolerance: this.config.timestampTolerance,
      requireTimestamp: this.config.requireTimestamp,
    });
  }

  /**
   * Create HMAC validator from environment variables
   */
  static fromEnvironment(logger?: Logger): HMACValidator {
    const secret = process.env.HMAC_SECRET;

    // In test env, allow fallback
    if (!secret && process.env.NODE_ENV !== 'test') {
      throw new Error('HMAC_SECRET environment variable is required');
    }

    const effectiveSecret = secret || 'test-secret-123';

    const config: Partial<HMACConfig> = {
      secret: effectiveSecret,
      algorithm: (process.env.HMAC_ALGORITHM as 'sha256' | 'sha512') || 'sha256',
      headerName: process.env.HMAC_HEADER_NAME || 'x-signature',
      timestampHeaderName: process.env.HMAC_TIMESTAMP_HEADER || 'x-timestamp',
      timestampTolerance: parseInt(process.env.HMAC_TIMESTAMP_TOLERANCE || '300'),
      requireTimestamp: process.env.HMAC_REQUIRE_TIMESTAMP !== 'false',
    };

    return new HMACValidator(config, logger);
  }

  /**
   * Generate HMAC signature for a payload
   */
  generateSignature(payload: string, timestamp?: number): string {
    let data = payload;

    // Include timestamp in signature if provided
    if (timestamp !== undefined) {
      data = `${timestamp}.${payload}`;
    }

    return createHmac(this.config.algorithm, this.config.secret).update(data, 'utf8').digest('hex');
  }

  /**
   * Validate HMAC signature from request headers
   */
  validateRequest(
    payload: string,
    headers: Record<string, string | string[] | undefined>,
  ): HMACValidationResult {
    try {
      // Get signature from headers
      const signature = this.getHeaderValue(headers, this.config.headerName);
      if (!signature) {
        return {
          valid: false,
          error: `Missing ${this.config.headerName} header`,
        };
      }

      // Get timestamp from headers if required

      let timestamp: number | undefined;

      let age: number | undefined;

      if (this.config.requireTimestamp) {
        const timestampStr = this.getHeaderValue(headers, this.config.timestampHeaderName);
        if (!timestampStr) {
          return {
            valid: false,
            error: `Missing ${this.config.timestampHeaderName} header`,
          };
        }

        timestamp = parseInt(timestampStr, 10);
        if (isNaN(timestamp)) {
          return {
            valid: false,
            error: 'Invalid timestamp format',
          };
        }

        // Check timestamp age
        const now = Math.floor(Date.now() / 1000);
        age = now - timestamp;

        if (Math.abs(age) > this.config.timestampTolerance) {
          return {
            valid: false,
            error: `Timestamp too old or too far in future (age: ${age}s, tolerance: ${this.config.timestampTolerance}s)`,
            timestamp,
            age,
          };
        }
      }

      // Validate signature format
      if (!this.isValidSignatureFormat(signature)) {
        // Add constant-time delay to prevent timing attacks
        this.constantTimeDelay();
        return {
          valid: false,
          error: 'Invalid signature format',
          timestamp,
          age,
        };
      }

      // Generate expected signature
      const expectedSignature = this.generateSignature(payload, timestamp);

      // Perform timing-safe comparison
      const isValid = this.timingSafeCompare(signature, expectedSignature);

      if (!isValid) {
        this.logger.warn('HMAC signature validation failed', undefined, {
          expectedLength: expectedSignature.length,
          actualLength: signature.length,
          timestamp,
          age,
        });
      }

      return {
        valid: isValid,
        error: isValid ? undefined : 'Invalid signature',
        timestamp,
        age,
      };
    } catch (error) {
      this.logger.error(
        'HMAC validation error',
        error instanceof Error ? error : new Error(String(error)),
      );

      return {
        valid: false,
        error: 'HMAC validation failed due to internal error',
      };
    }
  }

  /**
   * Get header value (case-insensitive)
   */
  private getHeaderValue(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    // Try exact match first

    let value = headers[name];

    // Try case-insensitive match
    if (value === undefined) {
      const lowerName = name.toLowerCase();
      for (const [key, val] of Object.entries(headers)) {
        if (key.toLowerCase() === lowerName) {
          value = val;
          break;
        }
      }
    }

    // Handle array values (take first)
    if (Array.isArray(value)) {
      value = value[0];
    }

    return value;
  }

  /**
   * Validate signature format (should be hex)
   */
  private isValidSignatureFormat(signature: string): boolean {
    return /^[a-fA-F0-9]+$/.test(signature);
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  private timingSafeCompare(signature: string, expectedSignature: string): boolean {
    // Ensure both signatures are the same length to prevent length-based timing attacks
    if (signature.length !== expectedSignature.length) {
      this.constantTimeDelay();
      return false;
    }

    try {
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');

      return timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (error) {
      // Log security event without exposing details
      this.logger.warn('HMAC signature buffer conversion failed');
      this.constantTimeDelay();
      return false;
    }
  }

  /**
   * Add constant-time delay to prevent timing attacks
   */
  private constantTimeDelay(): void {
    // Perform a dummy HMAC calculation to maintain constant time
    const dummyData = 'dummy_data_for_timing_consistency';
    createHmac(this.config.algorithm, this.config.secret).update(dummyData).digest('hex');
  }

  /**
   * Create HMAC headers for outgoing requests
   */
  createHeaders(payload: string, includeTimestamp: boolean = true): Record<string, string> {
    const headers: Record<string, string> = {};

    let timestamp: number | undefined;
    if (includeTimestamp) {
      timestamp = Math.floor(Date.now() / 1000);

      headers[this.config.timestampHeaderName] = timestamp.toString();
    }

    const signature = this.generateSignature(payload, timestamp);

    headers[this.config.headerName] = signature;

    return headers;
  }

  /**
   * Get HMAC configuration (without secret)
   */
  getConfig(): Omit<HMACConfig, 'secret'> {
    const { secret, ...config } = this.config;
    return config;
  }

  /**
   * Check if HMAC validation is enabled
   */
  isEnabled(): boolean {
    return !!this.config.secret;
  }

  /**
   * Update HMAC secret (for key rotation)
   */
  updateSecret(newSecret: string): void {
    if (!newSecret) {
      throw new Error('HMAC secret cannot be empty');
    }

    this.config.secret = newSecret;
    this.logger.info('HMAC secret updated');
  }

  /**
   * Test HMAC validation with known payload and signature
   */
  test(payload: string, expectedSignature: string, timestamp?: number): boolean {
    const actualSignature = this.generateSignature(payload, timestamp);
    return this.timingSafeCompare(expectedSignature, actualSignature);
  }
}

/**
 * Create HMAC middleware for Fastify
 */
export function createHMACMiddleware(validator: HMACValidator, logger?: Logger) {
  const middlewareLogger = logger ?? Logger.getInstance('hmac-middleware');

  return async (request: any, reply: any) => {
    // Skip HMAC validation for health checks and metrics
    if (request.url === '/health' || request.url === '/status' || request.url === '/metrics') {
      return;
    }

    const body = request.rawBody || request.body || '';
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);

    const result = validator.validateRequest(bodyString, request.headers);

    if (!result.valid) {
      middlewareLogger.warn('HMAC validation failed', undefined, {
        ip: request.ip,
        endpoint: request.url,
        error: result.error,
        userAgent: request.headers['user-agent'],
        timestamp: result.timestamp,
        age: result.age,
      });

      reply.status(401).send({
        error: 'Unauthorized',
        message: result.error,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Add validation result to request for logging

    request.hmacValidation = result;

    middlewareLogger.debug('HMAC validation successful', undefined, {
      ip: request.ip,
      endpoint: request.url,
      timestamp: result.timestamp,
      age: result.age,
    });
  };
}

/**
 * HMAC configuration defaults for different environments
 */
export const HMACDefaults = {
  development: {
    algorithm: 'sha256' as const,
    timestampTolerance: 600, // 10 minutes (more lenient for development)
    requireTimestamp: false,
  },

  production: {
    algorithm: 'sha512' as const,
    timestampTolerance: 300, // 5 minutes
    requireTimestamp: true,
  },

  test: {
    algorithm: 'sha256' as const,
    timestampTolerance: 3600, // 1 hour (very lenient for tests)
    requireTimestamp: false,
  },
} as const;
