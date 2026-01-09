/**
 * Logger Adapter
 * Bridges Pino (Fastify) logger with our custom logger interface
 */

/**
 * Create a logger adapter that bridges Pino and custom logger interfaces
 * @param {Object} logger - Pino logger instance
 * @returns {Object} Logger adapter
 */
export function createLoggerAdapter(logger) {
  const createMethod = (level) => (data, message) => {
    if (typeof data === 'object' && message) {
      logger[level](data, message);
    } else {
      logger[level](data);
    }
  };

  return {
    info: createMethod('info'),
    warn: createMethod('warn'),
    error: createMethod('error'),
    debug: createMethod('debug'),
  };
}
