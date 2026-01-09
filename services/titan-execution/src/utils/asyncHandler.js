/**
 * Async Handler Wrapper
 * Provides consistent error handling for async route handlers
 */

import { ResponseFactory } from './responseFactory.js';

/**
 * Wrap an async route handler with error handling
 * @param {Function} handler - Async route handler
 * @param {Object} logger - Logger instance
 * @returns {Function} Wrapped handler
 */
export function asyncHandler(handler, logger) {
  return async (request, reply) => {
    try {
      return await handler(request, reply);
    } catch (error) {
      logger.error({
        error: error.message,
        stack: error.stack,
        path: request.url,
        method: request.method,
      }, 'Unhandled error in route handler');
      
      return reply.code(500).send(ResponseFactory.error(error));
    }
  };
}
