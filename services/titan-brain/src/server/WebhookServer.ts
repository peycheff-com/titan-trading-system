/**
 * WebhookServer - Fastify server for Titan Brain
 * Handles signal reception, health checks, and dashboard data
 *
 * Requirements: 7.4, 7.5, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyRawBody from 'fastify-raw-body';
import { ServerConfig } from '../types/index.js';
import { TitanBrain } from '../engine/TitanBrain.js';
import { ISignalQueue } from './ISignalQueue.js';
import { DashboardService } from './DashboardService.js';
import {
  ConfigHealthComponent,
  DatabaseHealthComponent,
  HealthManager,
  MemoryHealthComponent,
  RedisHealthComponent,
} from '../health/HealthManager.js';
import { DynamicConfigService } from '../services/config/DynamicConfigService.js';
import { ServiceDiscovery, ServiceDiscoveryDefaults } from '../services/ServiceDiscovery.js';
import { Logger } from '../logging/Logger.js';
import { MetricsCollector } from '../metrics/MetricsCollector.js';
import { MetricsMiddleware } from '../middleware/MetricsMiddleware.js';
import { CacheManager } from '../cache/CacheManager.js';
import { correlationPlugin, getCorrelationId } from '../middleware/CorrelationMiddleware.js';
import { rateLimiterPlugin } from '../middleware/RateLimiter.js';
import { AuthMiddleware } from '../security/AuthMiddleware.js';
import { HMACValidator } from '../security/HMACValidator.js';

// Controllers
import { HealthController } from './controllers/HealthController.js';
import { DashboardController } from './controllers/DashboardController.js';
import { SignalController } from './controllers/SignalController.js';
import { AdminController } from './controllers/AdminController.js';
import { LedgerController } from './controllers/LedgerController.js';
import { AuditController } from './controllers/AuditController.js';
import { LedgerRepository } from '../db/repositories/LedgerRepository.js';

import { CanaryMonitor } from '../services/canary/CanaryMonitor.js';
import { SafetySessionManager } from '../services/SafetySessionManager.js';
import { SafetyController } from './controllers/SafetyController.js';

/**
 * HMAC verification options
 */
interface HmacOptions {
  enabled: boolean;
  secret: string;
  headerName: string;
  algorithm: string;
}

/**
 * WebhookServer configuration
 */
export interface WebhookServerConfig extends ServerConfig {
  hmac: HmacOptions;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  /** Skip binding a network listener (useful for tests with app.inject). */
  skipListen?: boolean;
}

/**
 * Default HMAC configuration
 */
const DEFAULT_HMAC_OPTIONS: HmacOptions = {
  enabled: false,
  secret: '',
  headerName: 'x-signature',
  algorithm: 'sha256',
};

/**
 * WebhookServer handles HTTP endpoints for the Brain
 */
export class WebhookServer {
  private readonly config: WebhookServerConfig;
  private readonly brain: TitanBrain;
  private readonly signalQueue: ISignalQueue | null;
  private readonly dashboardService: DashboardService;
  private readonly healthManager: HealthManager;
  private readonly serviceDiscovery: ServiceDiscovery;
  private hmacValidator: HMACValidator | null;
  private readonly logger: Logger;
  private readonly cacheManager: CacheManager | null;
  private readonly metricsCollector: MetricsCollector | null;
  private readonly metricsMiddleware: MetricsMiddleware | null;
  private readonly authMiddleware: AuthMiddleware;
  private server: FastifyInstance | null = null;
  private hmacOptions: HmacOptions;
  private readonly configService: DynamicConfigService;

  // Controllers
  private readonly healthController: HealthController;
  private readonly dashboardController: DashboardController;
  private readonly signalController: SignalController;
  private readonly adminController: AdminController;
  private readonly ledgerController: LedgerController;
  private readonly auditController: AuditController;

  private readonly canaryMonitor: CanaryMonitor;
  private readonly safetySessionManager: SafetySessionManager;
  private readonly safetyController: SafetyController;

  constructor(
    config: WebhookServerConfig,
    brain: TitanBrain,
    signalQueue?: ISignalQueue,
    dashboardService?: DashboardService,
    serviceDiscovery?: ServiceDiscovery,
    logger?: Logger,
    cacheManager?: CacheManager,
    metricsCollector?: MetricsCollector,
  ) {
    this.config = config;
    this.brain = brain;
    this.signalQueue = signalQueue ?? null;
    this.dashboardService = dashboardService ?? new DashboardService(brain);

    // Initialize health manager with proper configuration
    this.healthManager = new HealthManager({
      checkInterval: 30000,
      componentTimeout: 5000,
      cacheHealthResults: true,
      cacheTtl: 10000,
    });

    this.hmacOptions = { ...DEFAULT_HMAC_OPTIONS, ...config.hmac };
    this.logger = logger ?? Logger.getInstance('webhook-server');
    this.cacheManager = cacheManager ?? null;
    this.metricsCollector = metricsCollector ?? null;

    // Initialize metrics middleware if metrics collector is available
    this.metricsMiddleware = this.metricsCollector
      ? MetricsMiddleware.createFromEnvironment(this.metricsCollector, this.logger)
      : null;

    // Initialize service discovery
    this.serviceDiscovery = serviceDiscovery ?? new ServiceDiscovery(ServiceDiscoveryDefaults);

    // Initialize Auth Middleware
    this.authMiddleware = new AuthMiddleware(this.logger);

    // Initialize HMAC validator if enabled
    this.hmacValidator = this.buildHmacValidator();

    // Initialize Config Service
    this.configService = new DynamicConfigService();
    // Start config service (optimistic, don't await in constructor)
    this.configService.start().catch((err) => {
      this.logger.error('Failed to start config service', err);
    });

    // Initialize Controllers
    this.healthController = new HealthController(
      this.brain,
      this.healthManager,
      this.serviceDiscovery,
    );
    this.dashboardController = new DashboardController(this.brain, this.dashboardService);
    this.signalController = new SignalController(
      this.brain,
      this.signalQueue,
      this.logger,
      this.configService,
    );
    this.adminController = new AdminController(this.brain, this.logger, this.authMiddleware);
    this.auditController = new AuditController(this.brain, this.logger);

    // Initialize Ledger Repository & Controller
    const dbManager = this.brain.getDatabaseManager();
    if (!dbManager) {
      throw new Error('DatabaseManager not initialized');
    }
    const ledgerRepo = new LedgerRepository(dbManager);
    this.ledgerController = new LedgerController(ledgerRepo, this.logger);

    // Initialize Canary Monitor
    this.canaryMonitor = new CanaryMonitor(
      this.configService,
      ledgerRepo,
      this.metricsCollector || undefined, // Optional
    );
    this.canaryMonitor.startMonitoring(60000); // Check every minute

    // Initialize Safety System
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.safetySessionManager = new SafetySessionManager(redisUrl);
    this.safetyController = new SafetyController(this.safetySessionManager);
  }

  private buildHmacValidator(): HMACValidator | null {
    if (!this.hmacOptions.enabled) {
      return null;
    }

    try {
      if (this.hmacOptions.secret) {
        const timestampHeaderName = process.env.HMAC_TIMESTAMP_HEADER || 'x-timestamp';
        const timestampTolerance = parseInt(process.env.HMAC_TIMESTAMP_TOLERANCE || '300');
        const requireTimestamp = process.env.HMAC_REQUIRE_TIMESTAMP !== 'false';
        const algorithm = this.hmacOptions.algorithm === 'sha512' ? 'sha512' : 'sha256';

        return new HMACValidator(
          {
            secret: this.hmacOptions.secret,
            algorithm,
            headerName: this.hmacOptions.headerName,
            timestampHeaderName,
            timestampTolerance,
            requireTimestamp,
          },
          this.logger,
        );
      }

      return HMACValidator.fromEnvironment(this.logger);
    } catch (error) {
      this.logger.error(
        'Failed to initialize HMAC validator',
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  }

  /**
   * Initialize health components
   */
  private initializeHealthComponents(): void {
    // Register database health component
    const databaseComponent = new DatabaseHealthComponent(this.brain.getDatabaseManager());
    this.healthManager.registerComponent(databaseComponent);

    // Register configuration health component
    const configComponent = new ConfigHealthComponent(this.config);
    this.healthManager.registerComponent(configComponent);

    // Register memory health component
    const memoryComponent = new MemoryHealthComponent();
    this.healthManager.registerComponent(memoryComponent);

    // Register Redis health component if cache manager is available
    if (this.cacheManager) {
      const redisComponent = new RedisHealthComponent(this.cacheManager);
      this.healthManager.registerComponent(redisComponent);
    }

    // Start periodic health checks
    this.healthManager.startPeriodicChecks();
  }

  /**
   * Start the webhook server
   */
  async start(): Promise<void> {
    this.server = Fastify({
      logger: {
        level: this.config.logLevel,
      },
    });

    // Register CORS
    await this.server.register(cors, {
      origin: this.config.corsOrigins,
      methods: ['GET', 'POST', 'DELETE', 'PATCH'],
    });

    // Register raw body parser for HMAC validation
    await this.server.register(fastifyRawBody, {
      field: 'rawBody',
      global: true,
      encoding: 'utf8',
      runFirst: true,
    });

    // Register correlation ID middleware
    await this.server.register(correlationPlugin, {
      logger: this.logger,
      config: {
        headerName: 'x-correlation-id',
        generateIfMissing: true,
        logRequests: true,
        logResponses: true,
        excludePaths: ['/health', '/status', '/metrics'],
      },
    });

    // Register metrics middleware if metrics collector is available
    if (this.metricsMiddleware) {
      this.server.addHook('onRequest', this.metricsMiddleware.getRequestStartHook());
      this.server.addHook('onResponse', this.metricsMiddleware.getResponseHook());
      this.server.addHook('onError', this.metricsMiddleware.getErrorHook());

      this.logger.info('Metrics collection middleware enabled');
    } else {
      this.logger.warn('Metrics collection disabled - no metrics collector available');
    }

    // Register rate limiting middleware if cache manager is available
    if (this.cacheManager) {
      await this.server.register(rateLimiterPlugin, {
        cacheManager: this.cacheManager,
        logger: this.logger,
        defaultConfig: {
          windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
          maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
        },
      });

      this.logger.info('Rate limiting enabled with cache-based storage');
    } else {
      this.logger.warn('Rate limiting disabled - no cache manager available');
    }

    // Register Idempotency Middleware if cache manager is available
    if (this.cacheManager) {
      const { createIdempotencyMiddleware } =
        await import('../middleware/IdempotencyMiddleware.js');
      const idempotencyMiddleware = createIdempotencyMiddleware(this.cacheManager, this.logger);

      // Fastify preHandler hook for idempotency
      this.server.addHook('preHandler', idempotencyMiddleware);
      this.logger.info('Idempotency middleware enabled');
    }

    // Register HMAC middleware if enabled
    this.server.addHook('preHandler', async (request, reply) => {
      if (!this.hmacOptions.enabled) {
        return;
      }

      // Skip HMAC validation for health checks and metrics
      if (request.url === '/health' || request.url === '/status' || request.url === '/metrics') {
        return;
      }

      if (!this.hmacValidator) {
        this.hmacValidator = this.buildHmacValidator();
      }

      if (!this.hmacValidator) {
        reply.status(500).send({
          error: 'HMAC configuration error',
          message: 'HMAC validation enabled but no secret configured',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const correlationId = getCorrelationId(request);
      const rawBody = (request as any).rawBody ?? request.body ?? '';
      const body = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
      const result = this.hmacValidator.validateRequest(body, request.headers);

      if (!result.valid) {
        this.logger.logSecurityEvent('HMAC validation failed', 'high', correlationId, {
          ip: request.ip,
          endpoint: request.url,
          error: result.error,
          userAgent: request.headers['user-agent'],
        });

        reply.status(401).send({
          error: 'Unauthorized',
          message: result.error,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Add validation result to request for logging

      (request as any).hmacValidation = result;

      this.logger.debug('HMAC validation successful', correlationId, {
        ip: request.ip,
        endpoint: request.url,
      });
    });

    // Initialize service discovery
    this.serviceDiscovery.registerServicesFromEnvironment();
    this.serviceDiscovery.startHealthChecking();

    // Initialize health components
    this.initializeHealthComponents();

    // Register routes
    this.registerRoutes();

    if (this.config.skipListen) {
      await this.server.ready();
      this.logger.info('Webhook server initialized (listen skipped)', undefined, {
        host: this.config.host,
        port: this.config.port,
        hmacEnabled: !!this.hmacValidator,
        rateLimitingEnabled: !!this.cacheManager,
        servicesRegistered: this.serviceDiscovery.getAllServiceStatuses().length,
      });
      return;
    }

    // Start listening
    await this.server.listen({
      host: this.config.host,
      port: this.config.port,
    });

    this.logger.info(`Webhook server started`, undefined, {
      host: this.config.host,
      port: this.config.port,
      hmacEnabled: !!this.hmacValidator,
      rateLimitingEnabled: !!this.cacheManager,
      servicesRegistered: this.serviceDiscovery.getAllServiceStatuses().length,
    });

    console.log(`🚀 Webhook server listening on ${this.config.host}:${this.config.port}`);
    console.log(`🔐 HMAC validation: ${this.hmacValidator ? 'enabled' : 'disabled'}`);
    console.log(`⚡ Rate limiting: ${this.cacheManager ? 'enabled' : 'disabled'}`);
    console.log(
      `🔍 Service discovery: ${this.serviceDiscovery.getAllServiceStatuses().length} services registered`,
    );
  }

  /**
   * Stop the webhook server
   */
  async stop(): Promise<void> {
    // Stop service discovery
    this.serviceDiscovery.stopHealthChecking();

    // Stop health manager
    this.healthManager.shutdown();

    if (this.server) {
      await this.server.close();

      this.server = null;
      this.logger.info('Webhook server stopped');
      this.canaryMonitor.stopMonitoring();
      console.log('🛑 Webhook server stopped');
    }
  }

  /**
   * Get the Fastify instance (for testing)
   */
  getServer(): FastifyInstance | null {
    return this.server;
  }

  /**
   * Register all routes by delegating to controllers
   */
  private registerRoutes(): void {
    if (!this.server) return;

    // Register Controller Routes
    this.healthController.registerRoutes(this.server);
    this.dashboardController.registerRoutes(this.server);
    this.signalController.registerRoutes(this.server);
    this.adminController.registerRoutes(this.server);
    this.auditController.registerRoutes(this.server);

    this.ledgerController.registerRoutes(this.server);
    this.safetyController.registerRoutes(this.server);

    // Metrics (Inline as it requires metricsCollector from this class, or could move to controller if passed)
    // Keeping inline for now as it's simple
    this.server.get('/metrics', this.handleMetrics.bind(this));
  }

  /**
   * Handle GET /metrics - Prometheus metrics endpoint
   * Requirements: 6.5 - Prometheus metrics integration
   */
  private async handleMetrics(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      let metricsText = '';

      if (this.metricsCollector) {
        // Use new MetricsCollector
        metricsText = this.metricsCollector.getPrometheusMetrics();
      } else {
        // Fallback to legacy
        // We need to import getMetrics if we want to support legacy fallback
        // But for cleanliness let's assume MetricsCollector is primary
        metricsText = '# Legacy metrics not available in refactored server';
      }

      reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8').send(metricsText);
    } catch (error) {
      this.logger.error('Failed to generate metrics', error as Error);
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  markStartupComplete(): void {
    this.healthManager.emit('startup:complete');
  }

  /**
   * Enable HMAC verification
   */
  enableHmac(secret: string, options?: Partial<HmacOptions>): void {
    this.hmacOptions = {
      ...this.hmacOptions,
      ...options,
      enabled: true,
      secret,
    };

    this.hmacValidator = this.buildHmacValidator();
  }

  /**
   * Disable HMAC verification
   */
  disableHmac(): void {
    this.hmacOptions.enabled = false;

    this.hmacValidator = null;
  }
}
