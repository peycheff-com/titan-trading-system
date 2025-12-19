import { CONSTANTS } from '../utils/constants.js';

/**
 * Handles graceful shutdown with timeout and proper cleanup order
 */
export class GracefulShutdownService {
  constructor({ container, loggerAdapter, fastify }) {
    this.container = container;
    this.logger = loggerAdapter;
    this.fastify = fastify;
    this.shutdownTimeout = null;
    this.isShuttingDown = false;
  }

  /**
   * Register signal handlers for graceful shutdown
   */
  registerHandlers() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, () => this.shutdown(signal));
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      this.logger.error({ error }, 'Uncaught exception, shutting down');
      this.shutdown('UNCAUGHT_EXCEPTION');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error({ reason, promise }, 'Unhandled promise rejection, shutting down');
      this.shutdown('UNHANDLED_REJECTION');
    });

    this.logger.info('Graceful shutdown handlers registered');
  }

  /**
   * Perform graceful shutdown
   * @param {string} signal - Signal that triggered shutdown
   */
  async shutdown(signal) {
    if (this.isShuttingDown) {
      this.logger.warn(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }

    this.isShuttingDown = true;
    this.logger.info(`Received ${signal}, shutting down gracefully...`);

    // Set shutdown timeout
    this.shutdownTimeout = setTimeout(() => {
      this.logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, CONSTANTS.GRACEFUL_SHUTDOWN_TIMEOUT_MS);

    try {
      await this.#performShutdown();
      
      clearTimeout(this.shutdownTimeout);
      this.logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      clearTimeout(this.shutdownTimeout);
      this.logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  }

  /**
   * Perform shutdown steps in proper order
   */
  async #performShutdown() {
    const shutdownSteps = [
      { name: 'metrics', fn: () => this.#stopMetrics() },
      { name: 'httpRedirect', fn: () => this.#closeHttpRedirectServer() },
      { name: 'websocket', fn: () => this.#closeWebSocket() },
      { name: 'database', fn: () => this.#closeDatabase() },
      { name: 'replayGuard', fn: () => this.#closeReplayGuard() },
      { name: 'brokerGateway', fn: () => this.#closeBrokerGateway() },
      { name: 'fastify', fn: () => this.#closeFastify() },
    ];

    for (const step of shutdownSteps) {
      try {
        this.logger.debug(`Shutting down ${step.name}...`);
        await step.fn();
        this.logger.debug(`${step.name} shutdown completed`);
      } catch (error) {
        this.logger.warn({ 
          component: step.name, 
          error: error.message 
        }, `Error shutting down ${step.name}`);
      }
    }
  }

  /**
   * Stop metrics updates
   */
  async #stopMetrics() {
    try {
      const metricsService = this.container.get('metricsService');
      if (metricsService && typeof metricsService.stop === 'function') {
        metricsService.stop();
      }
    } catch (error) {
      // Metrics service might not be registered
      this.logger.debug('Metrics service not found or already stopped');
    }
  }

  /**
   * Close HTTP redirect server
   */
  async #closeHttpRedirectServer() {
    if (this.fastify.httpRedirectServer) {
      return new Promise((resolve) => {
        this.fastify.httpRedirectServer.close(() => {
          this.logger.info('HTTP redirect server closed');
          resolve();
        });
      });
    }
  }

  /**
   * Close WebSocket connections
   */
  async #closeWebSocket() {
    try {
      const wsStatus = this.container.get('wsStatus');
      if (wsStatus && typeof wsStatus.close === 'function') {
        wsStatus.close();
        this.logger.info('WebSocket connections closed');
      }
    } catch (error) {
      this.logger.debug('WebSocket status not found or already closed');
    }
  }

  /**
   * Close database connections
   */
  async #closeDatabase() {
    try {
      const databaseManager = this.container.get('databaseManager');
      if (databaseManager && typeof databaseManager.close === 'function') {
        await databaseManager.close();
        this.logger.info('Database connections closed');
      }
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Error closing database');
    }
  }

  /**
   * Close replay guard (Redis connections)
   */
  async #closeReplayGuard() {
    try {
      const replayGuard = this.container.get('replayGuard');
      if (replayGuard && typeof replayGuard.close === 'function') {
        await replayGuard.close();
        this.logger.info('Replay guard closed');
      }
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Error closing replay guard');
    }
  }

  /**
   * Close broker gateway
   */
  async #closeBrokerGateway() {
    try {
      const brokerGateway = this.container.get('brokerGateway');
      if (brokerGateway && typeof brokerGateway.close === 'function') {
        await brokerGateway.close();
        this.logger.info('Broker gateway closed');
      }
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Error closing broker gateway');
    }
  }

  /**
   * Close Fastify server
   */
  async #closeFastify() {
    try {
      await this.fastify.close();
      this.logger.info('Fastify server closed');
    } catch (error) {
      this.logger.warn({ error: error.message }, 'Error closing Fastify server');
    }
  }

  /**
   * Force shutdown (for emergency situations)
   */
  forceShutdown() {
    this.logger.warn('Force shutdown initiated');
    if (this.shutdownTimeout) {
      clearTimeout(this.shutdownTimeout);
    }
    process.exit(1);
  }
}