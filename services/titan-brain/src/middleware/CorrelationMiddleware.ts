/**
 * CorrelationMiddleware - Request correlation ID middleware for Fastify
 *
 * Adds correlation IDs to all requests for distributed tracing and logging.
 * Supports both incoming correlation IDs and generates new ones when missing.
 *
 * Requirements: 4.1.2, 4.1.5
 */

import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import { Logger } from '../logging/Logger.js';

/**
 * Correlation ID configuration
 */
export interface CorrelationConfig {
  headerName: string;
  generateIfMissing: boolean;
  logRequests: boolean;
  logResponses: boolean;
  excludePaths: string[];
}

/**
 * Default correlation configuration
 */
export const DEFAULT_CORRELATION_CONFIG: CorrelationConfig = {
  headerName: 'x-correlation-id',
  generateIfMissing: true,
  logRequests: true,
  logResponses: true,
  excludePaths: ['/health', '/status', '/metrics'],
};

/**
 * Extended FastifyRequest with correlation ID
 */
export interface RequestWithCorrelation extends FastifyRequest {
  correlationId: string;
}

/**
 * Create correlation ID middleware for Fastify
 */
export function createCorrelationMiddleware(
  logger: Logger,
  config: Partial<CorrelationConfig> = {},
) {
  const finalConfig = { ...DEFAULT_CORRELATION_CONFIG, ...config };

  return function correlationMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void {
    const startTime = Date.now();

    // Skip excluded paths
    if (finalConfig.excludePaths.includes(request.url)) {
      done();
      return;
    }

    // Get or generate correlation ID
     
    let correlationId = request.headers[finalConfig.headerName.toLowerCase()] as string;

    if (!correlationId && finalConfig.generateIfMissing) {
      correlationId = Logger.generateCorrelationId();
    }

    if (!correlationId) {
      done();
      return;
    }

    // Add correlation ID to request
     
    (request as RequestWithCorrelation).correlationId = correlationId;

    // Add correlation ID to response headers
    reply.header(finalConfig.headerName, correlationId);

    // Log incoming request
    if (finalConfig.logRequests) {
      logger.logHttpRequest(
        request.method,
        request.url,
        0, // Status code not available yet
        0, // Duration not available yet
        correlationId,
        {
          userAgent: request.headers['user-agent'],
          contentType: request.headers['content-type'],
          contentLength: request.headers['content-length'],
          remoteAddress: request.ip,
          query: Object.keys(request.query || {}).length > 0 ? request.query : undefined,
        },
      );
    }

    // Add response logging hook - DISABLED due to Fastify type issues
    /*
    if (finalConfig.logResponses) {
      // reply.addHook is not valid on FastifyReply
      // This logic should be moved to a global onResponse hook if needed
    }
    */

    done();
  };
}

/**
 * Get correlation ID from request
 */
export function getCorrelationId(request: FastifyRequest): string | undefined {
  return (request as RequestWithCorrelation).correlationId;
}

/**
 * Correlation middleware plugin for Fastify
 */
export async function correlationPlugin(
  fastify: any,
  options: {
    logger: Logger;
    config?: Partial<CorrelationConfig>;
  },
): Promise<void> {
  const middleware = createCorrelationMiddleware(options.logger, options.config);

  fastify.addHook('preHandler', middleware);

  // Add helper to get correlation ID
  fastify.decorate('getCorrelationId', (request: FastifyRequest) => {
    return getCorrelationId(request);
  });
}

/**
 * Utility to create correlation-aware logger
 */
export interface CorrelationLogger {
  debug: (message: string, metadata?: Record<string, any>) => void;
  info: (message: string, metadata?: Record<string, any>) => void;
  warn: (message: string, metadata?: Record<string, any>) => void;
  error: (message: string, error?: Error, metadata?: Record<string, any>) => void;
  startTimer: (operation: string, metadata?: Record<string, any>) => string;
  endTimer: (timerId: string, additionalMetadata?: Record<string, any>) => number | null;
}

/**
 * Utility to create correlation-aware logger
 */
export function createCorrelationLogger(
  baseLogger: Logger,
  request: FastifyRequest,
): CorrelationLogger {
  const correlationId = getCorrelationId(request);

  return {
    debug: (message: string, metadata?: Record<string, any>) => {
      baseLogger.debug(message, correlationId, metadata);
    },
    info: (message: string, metadata?: Record<string, any>) => {
      baseLogger.info(message, correlationId, metadata);
    },
    warn: (message: string, metadata?: Record<string, any>) => {
      baseLogger.warn(message, correlationId, metadata);
    },
    error: (message: string, error?: Error, metadata?: Record<string, any>) => {
      baseLogger.error(message, error, correlationId, metadata);
    },
    startTimer: (operation: string, metadata?: Record<string, any>) => {
      return baseLogger.startTimer(operation, correlationId, metadata);
    },
    endTimer: (timerId: string, additionalMetadata?: Record<string, any>) => {
      return baseLogger.endTimer(timerId, additionalMetadata);
    },
  };
}
