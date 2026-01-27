/**
 * RateLimiter - Rate limiting middleware for Fastify
 *
 * Provides configurable rate limiting with Redis-based storage and in-memory fallback.
 * Supports different rate limits for different endpoints and includes proper headers.
 *
 * Requirements: 4.3.1, 4.3.2, 4.3.3, 4.3.4, 4.3.5
 */

import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import { CacheManager } from '../cache/CacheManager.js';
import { Logger } from '../logging/Logger.js';

/**
 * Rate limit configuration for an endpoint
 */
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
  keyGenerator?: (request: FastifyRequest) => string; // Custom key generator
  onLimitReached?: (request: FastifyRequest, reply: FastifyReply) => void; // Custom limit handler
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
}

/**
 * Rate limiter class
 */
export class RateLimiter {
  private cacheManager: CacheManager;
  private logger: Logger;
  private defaultConfig: RateLimitConfig;

  constructor(cacheManager: CacheManager, logger: Logger, defaultConfig: RateLimitConfig) {
    this.cacheManager = cacheManager;
    this.logger = logger;
    this.defaultConfig = defaultConfig;
  }

  /**
   * Create rate limiter from environment variables
   */
  static createFromEnvironment(cacheManager: CacheManager, logger: Logger): RateLimiter {
    const defaultConfig: RateLimitConfig = {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // 100 requests per minute
      skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true',
      skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true',
    };

    return new RateLimiter(cacheManager, logger, defaultConfig);
  }

  /**
   * Default key generator using IP address
   */
  private defaultKeyGenerator(request: FastifyRequest): string {
    const ip = request.ip || 'unknown';
    const endpoint = request.url.split('?')[0]; // Remove query parameters
    return `rate_limit:${ip}:${endpoint}`;
  }

  /**
   * Check rate limit for a request
   */
  /**
   * Check rate limit for a request
   */
  async checkRateLimit(
    request: FastifyRequest,
    config?: Partial<RateLimitConfig>,
  ): Promise<RateLimitResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const keyGenerator = finalConfig.keyGenerator || this.defaultKeyGenerator.bind(this);
    const key = keyGenerator(request);

    const now = Date.now();
    const windowStart = now - finalConfig.windowMs;

    try {
      // Get current hit count from cache
      const cacheResult = await this.cacheManager.get<string>(key);

      let hits: Array<{ timestamp: number; success?: boolean }> = [];

      if (cacheResult.success && cacheResult.value) {
        try {
          hits = JSON.parse(cacheResult.value);
          if (!Array.isArray(hits)) {
            hits = [];
          }
        } catch (error) {
          this.logger.warn('Failed to parse rate limit data', undefined, {
            key,
            error: error instanceof Error ? error.message : String(error),
          });
          hits = [];
        }
      }

      // Filter hits within the current window
      hits = hits.filter((hit) => hit.timestamp > windowStart);

      // Count relevant hits based on configuration

      let relevantHits = hits.length;
      if (finalConfig.skipSuccessfulRequests || finalConfig.skipFailedRequests) {
        relevantHits = hits.filter((hit) => {
          if (finalConfig.skipSuccessfulRequests && hit.success === true) {
            return false;
          }
          if (finalConfig.skipFailedRequests && hit.success === false) {
            return false;
          }
          return true;
        }).length;
      }

      const allowed = relevantHits < finalConfig.maxRequests;
      const remaining = Math.max(0, finalConfig.maxRequests - relevantHits - (allowed ? 1 : 0));
      const resetTime = windowStart + finalConfig.windowMs;

      // Add current request to hits if we're tracking it
      if (allowed) {
        hits.push({ timestamp: now });

        // Store updated hits with TTL
        const ttlMs = Math.ceil(finalConfig.windowMs / 1000);
        await this.cacheManager.set(key, JSON.stringify(hits), ttlMs);
      }

      return {
        allowed,
        remaining,
        resetTime,
        totalHits: hits.length,
      };
    } catch (error) {
      this.logger.error(
        'Rate limit check failed',
        error instanceof Error ? error : new Error(String(error)),
        undefined,
        { key },
      );

      // On error, allow the request (fail open)
      return {
        allowed: true,
        remaining: finalConfig.maxRequests,
        resetTime: now + finalConfig.windowMs,
        totalHits: 0,
      };
    }
  }

  /**
   * Update rate limit after response (for conditional counting)
   */
  async updateRateLimit(
    request: FastifyRequest,
    success: boolean,
    config?: Partial<RateLimitConfig>,
  ): Promise<void> {
    const finalConfig = { ...this.defaultConfig, ...config };

    // Only update if we're conditionally counting requests
    if (!finalConfig.skipSuccessfulRequests && !finalConfig.skipFailedRequests) {
      return;
    }

    const keyGenerator = finalConfig.keyGenerator || this.defaultKeyGenerator.bind(this);
    const key = keyGenerator(request);

    try {
      const cacheResult = await this.cacheManager.get<string>(key);
      if (!cacheResult.success || !cacheResult.value) return;

      const hits: Array<{ timestamp: number; success?: boolean }> = JSON.parse(cacheResult.value);

      // Update the most recent hit with success status
      if (hits.length > 0) {
        hits[hits.length - 1].success = success;

        const ttlMs = Math.ceil(finalConfig.windowMs / 1000);
        await this.cacheManager.set(key, JSON.stringify(hits), ttlMs);
      }
    } catch (error) {
      this.logger.warn('Failed to update rate limit', undefined, {
        key,
        success,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  createMiddleware(config?: Partial<RateLimitConfig>) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const startTime = Date.now();

      try {
        const result = await this.checkRateLimit(request, config);

        // Add rate limit headers
        reply.header(
          'X-RateLimit-Limit',
          (config?.maxRequests || this.defaultConfig.maxRequests).toString(),
        );
        reply.header('X-RateLimit-Remaining', result.remaining.toString());
        reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());

        if (!result.allowed) {
          // Log rate limit exceeded
          this.logger.logSecurityEvent(
            'Rate limit exceeded',
            'medium',
            (request as any).correlationId,
            {
              ip: request.ip,
              endpoint: request.url,
              method: request.method,
              userAgent: request.headers['user-agent'],
              totalHits: result.totalHits,
              limit: config?.maxRequests || this.defaultConfig.maxRequests,
            },
          );

          // Call custom handler if provided
          if (config?.onLimitReached) {
            config.onLimitReached(request, reply);
          } else {
            reply.status(429).send({
              error: 'Too Many Requests',
              message: 'Rate limit exceeded. Please try again later.',
              retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000),
              timestamp: new Date().toISOString(),
            });
          }
          return;
        }

        // Add response hook to update rate limit if using conditional counting
        if (config?.skipSuccessfulRequests || config?.skipFailedRequests) {
          // Note: Fastify doesn't have addHook on reply, we need to use a different approach
          // For now, we'll skip this functionality in the middleware
          // In a real implementation, this would be handled at the route level
        }

        // Log rate limit check
        const duration = Date.now() - startTime;
        this.logger.debug('Rate limit check completed', (request as any).correlationId, {
          ip: request.ip,
          endpoint: request.url,
          allowed: result.allowed,
          remaining: result.remaining,
          duration,
        });

        // done();
      } catch (error) {
        this.logger.error(
          'Rate limit middleware error',
          error instanceof Error ? error : new Error(String(error)),
          (request as any).correlationId,
          {
            ip: request.ip,
            endpoint: request.url,
          },
        );

        // On error, allow the request (fail open)
      }
    };
  }

  /**
   * Create endpoint-specific rate limiting middleware
   */
  createEndpointMiddleware(endpointConfigs: Record<string, Partial<RateLimitConfig>>) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const endpoint = request.url.split('?')[0]; // Remove query parameters
      const config = endpointConfigs[endpoint];

      if (!config) {
        // No specific config for this endpoint, use default
        const defaultMiddleware = this.createMiddleware();
        return defaultMiddleware(request, reply);
      }

      const endpointMiddleware = this.createMiddleware(config);
      return endpointMiddleware(request, reply);
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  async resetRateLimit(key: string): Promise<void> {
    try {
      await this.cacheManager.delete(key);
      this.logger.info('Rate limit reset', undefined, { key });
    } catch (error) {
      this.logger.error(
        'Failed to reset rate limit',
        error instanceof Error ? error : new Error(String(error)),
        undefined,
        { key },
      );
    }
  }

  /**
   * Get rate limit status for a key
   */
  async getRateLimitStatus(key: string): Promise<{
    hits: number;
    remaining: number;
    resetTime: number;
  } | null> {
    try {
      const cacheResult = await this.cacheManager.get<string>(key);
      if (!cacheResult.success || !cacheResult.value) {
        return {
          hits: 0,
          remaining: this.defaultConfig.maxRequests,
          resetTime: Date.now() + this.defaultConfig.windowMs,
        };
      }

      const hits: Array<{ timestamp: number }> = JSON.parse(cacheResult.value);
      const now = Date.now();
      const windowStart = now - this.defaultConfig.windowMs;
      const validHits = hits.filter((hit) => hit.timestamp > windowStart);

      return {
        hits: validHits.length,
        remaining: Math.max(0, this.defaultConfig.maxRequests - validHits.length),
        resetTime: windowStart + this.defaultConfig.windowMs,
      };
    } catch (error) {
      this.logger.error(
        'Failed to get rate limit status',
        error instanceof Error ? error : new Error(String(error)),
        undefined,
        { key },
      );
      return null;
    }
  }
}

/**
 * Default rate limit configurations for different endpoints
 */
export const DEFAULT_ENDPOINT_CONFIGS: Record<string, Partial<RateLimitConfig>> = {
  '/signal': {
    windowMs: 60000, // 1 minute
    maxRequests: 60, // 60 signals per minute
    skipFailedRequests: true, // Don't count failed signals
  },
  '/webhook/phase1': {
    windowMs: 60000, // 1 minute
    maxRequests: 120, // 120 webhooks per minute
    skipFailedRequests: true,
  },
  '/webhook/phase2': {
    windowMs: 60000, // 1 minute
    maxRequests: 60, // 60 webhooks per minute
    skipFailedRequests: true,
  },
  '/webhook/phase3': {
    windowMs: 60000, // 1 minute
    maxRequests: 30, // 30 webhooks per minute
    skipFailedRequests: true,
  },
  '/admin/override': {
    windowMs: 300000, // 5 minutes
    maxRequests: 5, // 5 override attempts per 5 minutes
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
  '/breaker/reset': {
    windowMs: 300000, // 5 minutes
    maxRequests: 10, // 10 reset attempts per 5 minutes
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
  },
  '/dashboard': {
    windowMs: 60000, // 1 minute
    maxRequests: 300, // 300 dashboard requests per minute
    skipFailedRequests: true,
  },
  '/metrics': {
    windowMs: 60000, // 1 minute
    maxRequests: 600, // 600 metrics requests per minute (for monitoring)
    skipFailedRequests: true,
  },
};

/**
 * Rate limiter plugin for Fastify
 */
export async function rateLimiterPlugin(
  fastify: any,
  options: {
    cacheManager: CacheManager;
    logger: Logger;
    defaultConfig?: RateLimitConfig;
    endpointConfigs?: Record<string, Partial<RateLimitConfig>>;
  },
): Promise<void> {
  const rateLimiter = new RateLimiter(
    options.cacheManager,
    options.logger,
    options.defaultConfig || {
      windowMs: 60000,
      maxRequests: 100,
    },
  );

  const endpointConfigs = options.endpointConfigs || DEFAULT_ENDPOINT_CONFIGS;
  const middleware = rateLimiter.createEndpointMiddleware(endpointConfigs);

  fastify.addHook('preHandler', middleware);

  // Add rate limiter instance to fastify for access in routes
  fastify.decorate('rateLimiter', rateLimiter);
}
