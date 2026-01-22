/**
 * IdempotencyMiddleware - Enforce request idempotency
 *
 * Ensures that requests with the same Idempotency-Key are not processed concurrently
 * or duplicated within a validity window.
 *
 * Requirements: Deployment Surface Expansion - Phase 3
 */

import { FastifyReply, FastifyRequest } from 'fastify';
import { Logger } from '../logging/Logger.js';
import { CacheManager } from '../cache/CacheManager.js';

export interface IdempotencyConfig {
  headerName: string;
  ttlSeconds: number;
  enforceOnMethods: string[];
}

export const DEFAULT_IDEMPOTENCY_CONFIG: IdempotencyConfig = {
  headerName: 'idempotency-key',
  ttlSeconds: 60, // 1 minute default lock
  enforceOnMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
};

export function createIdempotencyMiddleware(
  cacheManager: CacheManager,
  logger: Logger,
  config: Partial<IdempotencyConfig> = {},
) {
  const finalConfig = { ...DEFAULT_IDEMPOTENCY_CONFIG, ...config };

  return async function idempotencyMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Skip if method not enforced
    if (!finalConfig.enforceOnMethods.includes(request.method)) {
      return;
    }

    const key = request.headers[finalConfig.headerName.toLowerCase()] as string;

    // specific check: Only enforce if key is present (or optionally enforce presence)
    // The requirement is "enforce idempotency keys for every command that can be retried".
    if (!key) {
      return;
    }

    const cacheKey = `idempotency:${key}`;

    try {
      const existing = await cacheManager.get(cacheKey);

      if (existing) {
        logger.warn('Idempotency conflict for key', key, {
          ip: request.ip,
          method: request.method,
          url: request.url,
        });

        reply.status(409).send({
          error: 'Conflict',
          message: 'Request with this Idempotency-Key is already in progress or recently processed',
          idempotencyKey: key,
        });
        return;
      }

      // Set lock
      await cacheManager.set(cacheKey, 'processing', finalConfig.ttlSeconds);
    } catch (error) {
      logger.error('Failed to check idempotency', error as Error);
      // Fail closed for safety.
      reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Idempotency check failed',
      });
    }
  };
}
