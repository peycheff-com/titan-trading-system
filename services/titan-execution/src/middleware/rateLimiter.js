/**
 * Rate Limiting Middleware for Titan Execution Service
 * 
 * Protects API endpoints from abuse by limiting requests per IP address.
 * 
 * Requirements: 10.1-10.2
 * 
 * Property 30: Rate Limit Enforcement
 * For any IP address, requests should not exceed 100 per minute
 * 
 * USAGE:
 * 1. Register global rate limiting once in server-production.js:
 *    await registerGlobalRateLimiting(fastify, { logger: fastify.log });
 * 
 * 2. Apply route-specific rate limiting:
 *    fastify.post('/webhook', { config: { rateLimit: strictRateLimitConfig } }, handler);
 */

import fastifyRateLimit from '@fastify/rate-limit';

/**
 * Register global rate limiting plugin with Fastify
 * This should be called ONCE during server initialization
 * 
 * @param {FastifyInstance} fastify - Fastify instance
 * @param {Object} options - Rate limiting options
 * @returns {Promise<void>}
 */
export async function registerGlobalRateLimiting(fastify, options = {}) {
  const {
    max = 100,
    timeWindow = '1 minute',
    redis = null,
    allowList = ['127.0.0.1', '::1'],
    logger = console
  } = options;

  try {
    await fastify.register(fastifyRateLimit, {
      global: true, // Apply to all routes by default
      max,
      timeWindow,
      cache: 10000,
      allowList,
      redis,
      skipOnError: true,
      
      keyGenerator: (request) => {
        return request.ip || request.headers['x-forwarded-for'] || 'unknown';
      },
      
      errorResponseBuilder: (request, context) => {
        const ip = request.ip || 'unknown';
        logger.warn(`⚠️  Rate limit exceeded for IP: ${ip}`);
        logger.warn(`   Path: ${request.url}`);
        logger.warn(`   Method: ${request.method}`);
        logger.warn(`   Limit: ${context.max}, Remaining: ${context.remaining}`);
        
        return {
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests from this IP, please try again later',
          statusCode: 429,
          retryAfter: context.after,
          limit: context.max,
          remaining: context.remaining,
          timestamp: new Date().toISOString()
        };
      },
      
      addHeaders: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
        'retry-after': true
      }
    });

    logger.info('✅ Global rate limiting registered (100 req/min per IP)');
  } catch (error) {
    logger.error('❌ Failed to register rate limiting:', error.message);
    throw error;
  }
}

/**
 * Strict rate limit configuration for sensitive endpoints
 * Use this in route options: { config: { rateLimit: strictRateLimitConfig } }
 * 
 * @param {Object} options - Configuration options
 * @returns {Object} Rate limit configuration
 */
export function createStrictRateLimitConfig(options = {}) {
  const {
    max = 10,
    timeWindow = '1 minute',
    logger = console
  } = options;

  return {
    max,
    timeWindow,
    keyGenerator: (request) => {
      return request.ip || request.headers['x-forwarded-for'] || 'unknown';
    },
    errorResponseBuilder: (request, context) => {
      const ip = request.ip || 'unknown';
      logger.error(`🚨 Strict rate limit exceeded for IP: ${ip}`);
      logger.error(`   Path: ${request.url}`);
      logger.error(`   Method: ${request.method}`);
      
      // Log to security audit log
      logSecurityEvent({
        type: 'RATE_LIMIT_EXCEEDED',
        severity: 'HIGH',
        ip,
        path: request.url,
        method: request.method,
        timestamp: new Date().toISOString()
      });
      
      return {
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests to sensitive endpoint, please try again later',
        statusCode: 429,
        retryAfter: context.after,
        limit: context.max,
        remaining: context.remaining,
        timestamp: new Date().toISOString()
      };
    }
  };
}

/**
 * Webhook rate limit configuration
 * Use this in route options: { config: { rateLimit: webhookRateLimitConfig } }
 * 
 * @param {Object} options - Configuration options
 * @returns {Object} Rate limit configuration
 */
export function createWebhookRateLimitConfig(options = {}) {
  const {
    max = 100,
    timeWindow = '1 minute',
    logger = console
  } = options;

  return {
    max,
    timeWindow,
    keyGenerator: (request) => {
      return request.ip || request.headers['x-forwarded-for'] || 'unknown';
    },
    errorResponseBuilder: (request, context) => {
      const ip = request.ip || 'unknown';
      logger.warn(`⚠️  Webhook rate limit exceeded for IP: ${ip}`);
      
      return {
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many webhook requests from this IP',
        statusCode: 429,
        retryAfter: context.after,
        timestamp: new Date().toISOString()
      };
    }
  };
}

/**
 * Log security event to audit log
 * @param {Object} event - Security event details
 */
function logSecurityEvent(event) {
  // In production, this should write to a dedicated security audit log
  // For now, just log to console
  console.log(`[SECURITY AUDIT] ${JSON.stringify(event)}`);
  
  // TODO: Write to security audit log file or send to SIEM
}

/**
 * Get rate limit status for an IP address
 * @param {string} ip - IP address
 * @returns {Object} Rate limit status
 */
export function getRateLimitStatus(ip) {
  // This would query the rate limit store
  // For now, return a placeholder
  return {
    ip,
    remaining: 100,
    limit: 100,
    resetTime: Date.now() + 60000
  };
}
