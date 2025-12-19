/**
 * WebhookServer - Fastify server for Titan Brain
 * Handles signal reception, health checks, and dashboard data
 * 
 * Requirements: 7.4, 7.5, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  IntentSignal,
  BrainDecision,
  ServerConfig,
  PhaseId,
  AllocationVector,
} from '../types/index.js';
import { TitanBrain } from '../engine/TitanBrain.js';
import { SignalQueue } from './SignalQueue';
import { DashboardService } from './DashboardService.js';
import { getMetrics } from '../monitoring/PrometheusMetrics.js';
import { InputValidator, SecurityAuditLogger } from '../security/InputValidator.js';

/**
 * Signal request body schema
 */
interface SignalRequestBody {
  signalId: string;
  phaseId: PhaseId;
  symbol: string;
  side: 'BUY' | 'SELL';
  requestedSize: number;
  timestamp?: number;
  leverage?: number;
}

/**
 * Manual override request body schema
 */
interface OverrideRequestBody {
  operatorId: string;
  password: string;
  allocation: {
    w1: number;
    w2: number;
    w3: number;
  };
  reason: string;
  durationHours?: number;
}

/**
 * Override deactivation request body schema
 */
interface DeactivateOverrideRequestBody {
  operatorId: string;
  password: string;
}

/**
 * Create operator request body schema
 */
interface CreateOperatorRequestBody {
  operatorId: string;
  password: string;
  permissions: string[];
}

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
  private readonly signalQueue: SignalQueue | null;
  private readonly dashboardService: DashboardService;
  private server: FastifyInstance | null = null;
  private hmacOptions: HmacOptions;

  constructor(
    config: WebhookServerConfig,
    brain: TitanBrain,
    signalQueue?: SignalQueue,
    dashboardService?: DashboardService
  ) {
    this.config = config;
    this.brain = brain;
    this.signalQueue = signalQueue ?? null;
    this.dashboardService = dashboardService ?? new DashboardService(brain);
    this.hmacOptions = { ...DEFAULT_HMAC_OPTIONS, ...config.hmac };
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
      methods: ['GET', 'POST'],
    });

    // Register routes
    this.registerRoutes();

    // Start listening
    await this.server.listen({
      host: this.config.host,
      port: this.config.port,
    });

    console.log(`🚀 Webhook server listening on ${this.config.host}:${this.config.port}`);
  }

  /**
   * Stop the webhook server
   */
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close();
      this.server = null;
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
   * Register all routes
   */
  private registerRoutes(): void {
    if (!this.server) return;

    // Health check endpoint
    this.server.get('/status', this.handleStatus.bind(this));

    // Dashboard data endpoint
    this.server.get('/dashboard', this.handleDashboard.bind(this));

    // Enhanced dashboard data endpoint
    this.server.get('/dashboard/extended', this.handleExtendedDashboard.bind(this));

    // Signal endpoint
    this.server.post('/signal', this.handleSignal.bind(this));

    // Export dashboard JSON
    this.server.get('/dashboard/export', this.handleDashboardExport.bind(this));

    // Export extended dashboard JSON
    this.server.get('/dashboard/export/extended', this.handleExtendedDashboardExport.bind(this));

    // Circuit breaker status
    this.server.get('/breaker', this.handleBreakerStatus.bind(this));

    // Circuit breaker reset (requires operator ID)
    this.server.post('/breaker/reset', this.handleBreakerReset.bind(this));

    // Phase approval rates
    this.server.get('/phases/approval-rates', this.handleApprovalRates.bind(this));

    // Recent decisions
    this.server.get('/decisions', this.handleRecentDecisions.bind(this));

    // Treasury status
    this.server.get('/treasury', this.handleTreasuryStatus.bind(this));

    // Allocation vector
    this.server.get('/allocation', this.handleAllocation.bind(this));

    // Manual override endpoints
    this.server.post('/admin/override', this.handleCreateOverride.bind(this));
    this.server.delete('/admin/override', this.handleDeactivateOverride.bind(this));
    this.server.get('/admin/override', this.handleGetOverride.bind(this));
    this.server.get('/admin/override/history', this.handleOverrideHistory.bind(this));
    this.server.post('/admin/operator', this.handleCreateOperator.bind(this));

    // Phase-specific webhook endpoints
    // Requirements: 7.4, 7.6 - Set up webhooks from Phase services
    this.server.post('/webhook/phase1', this.handlePhaseSignal.bind(this, 'phase1'));
    this.server.post('/webhook/phase2', this.handlePhaseSignal.bind(this, 'phase2'));
    this.server.post('/webhook/phase3', this.handlePhaseSignal.bind(this, 'phase3'));
    this.server.post('/webhook/scavenger', this.handlePhaseSignal.bind(this, 'phase1'));
    this.server.post('/webhook/hunter', this.handlePhaseSignal.bind(this, 'phase2'));
    this.server.post('/webhook/sentinel', this.handlePhaseSignal.bind(this, 'phase3'));

    // Phase notification endpoints (for phases to register/update)
    this.server.post('/phases/register', this.handlePhaseRegister.bind(this));
    this.server.get('/phases/status', this.handlePhasesStatus.bind(this));

    // Prometheus metrics endpoint
    this.server.get('/metrics', this.handleMetrics.bind(this));
  }

  /**
   * Handle GET /status - Health check endpoint
   * Requirement 10.2: Display current NAV with real-time updates
   */
  private async handleStatus(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const health = await this.brain.getHealthStatus();
      const statusCode = health.healthy ? 200 : 503;

      reply.status(statusCode).send({
        status: health.healthy ? 'healthy' : 'unhealthy',
        timestamp: Date.now(),
        components: health.components,
        errors: health.errors,
        equity: this.brain.getEquity(),
        circuitBreaker: this.brain.getCircuitBreakerStatus().active ? 'active' : 'inactive',
      });
    } catch (error) {
      reply.status(500).send({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /dashboard - Dashboard data endpoint
   * Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
   */
  private async handleDashboard(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const dashboardData = await this.brain.getDashboardData();
      reply.send(dashboardData);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle POST /signal - Signal reception endpoint
   * Requirements: 7.4, 7.5
   */
  private async handleSignal(
    request: FastifyRequest<{ Body: SignalRequestBody }>,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Verify HMAC signature if enabled
      if (this.hmacOptions.enabled) {
        const isValid = this.verifyHmacSignature(request);
        if (!isValid) {
          reply.status(401).send({
            error: 'Invalid signature',
            timestamp: Date.now(),
          });
          return;
        }
      }

      // Validate and sanitize request body
      const validationResult = InputValidator.validateSignalRequest(request.body);
      if (!validationResult.isValid) {
        // Log security audit event
        const clientIp = request.ip || 'unknown';
        SecurityAuditLogger.logValidationFailure(
          clientIp,
          '/signal',
          validationResult.errors,
          request.body
        );
        
        reply.status(400).send({
          error: 'Validation failed',
          details: validationResult.errors,
          timestamp: Date.now(),
        });
        return;
      }

      const body = validationResult.sanitizedValue as SignalRequestBody;

      // Create intent signal
      const signal: IntentSignal = {
        signalId: body.signalId,
        phaseId: body.phaseId,
        symbol: body.symbol,
        side: body.side,
        requestedSize: body.requestedSize,
        timestamp: body.timestamp ?? Date.now(),
        leverage: body.leverage,
      };

      let decision: BrainDecision;

      // Use signal queue if available, otherwise process directly
      if (this.signalQueue) {
        // Check idempotency
        const isDuplicate = await this.signalQueue.isDuplicate(signal.signalId);
        if (isDuplicate) {
          reply.status(409).send({
            error: 'Duplicate signal ID',
            signalId: signal.signalId,
            timestamp: Date.now(),
          });
          return;
        }

        // Enqueue signal
        await this.signalQueue.enqueue(signal);

        // Process from queue
        const processedSignal = await this.signalQueue.dequeue();
        if (processedSignal) {
          decision = await this.brain.processSignal(processedSignal);
          await this.signalQueue.markProcessed(processedSignal.signalId);
        } else {
          // Should not happen, but handle gracefully
          decision = await this.brain.processSignal(signal);
        }
      } else {
        // Process directly
        decision = await this.brain.processSignal(signal);
      }

      const processingTime = Date.now() - startTime;

      reply.send({
        ...decision,
        processingTime,
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /dashboard/extended - Extended dashboard data endpoint
   * Uses DashboardService for comprehensive data aggregation
   */
  private async handleExtendedDashboard(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const extendedData = await this.dashboardService.getDashboardData();
      reply.send(extendedData);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /dashboard/export - Export dashboard data as JSON
   * Requirement 10.8: Support exporting dashboard data to JSON
   */
  private async handleDashboardExport(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const jsonData = await this.brain.exportDashboardJSON();
      reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="titan-brain-dashboard-${Date.now()}.json"`)
        .send(jsonData);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /dashboard/export/extended - Export extended dashboard data as JSON
   * Requirement 10.8: Create export endpoint for dashboard data with metadata
   */
  private async handleExtendedDashboardExport(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const jsonData = await this.dashboardService.exportDashboardJSON();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="titan-brain-extended-dashboard-${timestamp}.json"`)
        .send(jsonData);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /breaker - Circuit breaker status
   */
  private async handleBreakerStatus(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const status = this.brain.getCircuitBreakerStatus();
      reply.send(status);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle POST /breaker/reset - Reset circuit breaker
   * Requirement 5.8: Require operator ID for reset
   */
  private async handleBreakerReset(
    request: FastifyRequest<{ Body: { operatorId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { operatorId } = request.body;

      if (!operatorId || typeof operatorId !== 'string') {
        reply.status(400).send({
          error: 'operatorId is required',
          timestamp: Date.now(),
        });
        return;
      }

      await this.brain.resetCircuitBreaker(operatorId);

      reply.send({
        success: true,
        message: 'Circuit breaker reset',
        operatorId,
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /phases/approval-rates - Phase approval rates
   * Requirement 7.7: Track signal approval rate per phase
   */
  private async handleApprovalRates(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const rates = this.brain.getAllApprovalRates();
      reply.send({
        approvalRates: rates,
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /decisions - Recent decisions
   * Requirement 10.6: Display recent allocation decisions with reasoning
   */
  private async handleRecentDecisions(
    request: FastifyRequest<{ Querystring: { limit?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const limit = parseInt(request.query.limit ?? '20', 10);
      const decisions = this.brain.getRecentDecisions(Math.min(limit, 100));
      reply.send({
        decisions,
        count: decisions.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /treasury - Treasury status
   * Requirement 10.5: Display next sweep trigger level and total swept amount
   */
  private async handleTreasuryStatus(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const treasury = await this.brain.getTreasuryStatus();
      const nextSweepLevel = this.brain.getNextSweepTriggerLevel();
      const totalSwept = this.brain.getTotalSwept();
      const highWatermark = this.brain.getHighWatermark();

      reply.send({
        ...treasury,
        nextSweepTriggerLevel: nextSweepLevel,
        totalSwept,
        highWatermark,
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /allocation - Current allocation vector
   * Requirement 10.2: Display the Allocation Vector
   */
  private async handleAllocation(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const allocation = this.brain.getAllocation();
      const equity = this.brain.getEquity();

      reply.send({
        allocation,
        equity,
        phaseEquity: {
          phase1: equity * allocation.w1,
          phase2: equity * allocation.w2,
          phase3: equity * allocation.w3,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Verify HMAC signature on request with enhanced timing attack protection
   */
  private verifyHmacSignature(request: FastifyRequest): boolean {
    const signature = request.headers[this.hmacOptions.headerName.toLowerCase()];
    
    if (!signature || typeof signature !== 'string') {
      // Add constant-time delay to prevent timing attacks
      this.constantTimeDelay();
      return false;
    }

    // Validate signature format (should be hex)
    if (!/^[a-fA-F0-9]+$/.test(signature)) {
      this.constantTimeDelay();
      return false;
    }

    const body = JSON.stringify(request.body);
    const expectedSignature = createHmac(this.hmacOptions.algorithm, this.hmacOptions.secret)
      .update(body)
      .digest('hex');

    // Ensure both signatures are the same length to prevent length-based timing attacks
    if (signature.length !== expectedSignature.length) {
      this.constantTimeDelay();
      return false;
    }

    // Use timing-safe comparison to prevent timing attacks
    try {
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      
      return timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch (error) {
      // Log security event without exposing details
      console.warn('HMAC signature verification failed due to buffer conversion error');
      this.constantTimeDelay();
      return false;
    }
  }

  /**
   * Add constant-time delay to prevent timing attacks
   * This ensures failed validations take the same time as successful ones
   */
  private constantTimeDelay(): void {
    // Perform a dummy HMAC calculation to maintain constant time
    const dummyData = 'dummy_data_for_timing_consistency';
    createHmac(this.hmacOptions.algorithm, this.hmacOptions.secret)
      .update(dummyData)
      .digest('hex');
  }

  /**
   * Validate signal request body
   */
  private validateSignalBody(body: SignalRequestBody): string | null {
    if (!body.signalId || typeof body.signalId !== 'string') {
      return 'signalId is required and must be a string';
    }

    if (!body.phaseId || !['phase1', 'phase2', 'phase3'].includes(body.phaseId)) {
      return 'phaseId must be one of: phase1, phase2, phase3';
    }

    if (!body.symbol || typeof body.symbol !== 'string') {
      return 'symbol is required and must be a string';
    }

    if (!body.side || !['BUY', 'SELL'].includes(body.side)) {
      return 'side must be one of: BUY, SELL';
    }

    if (typeof body.requestedSize !== 'number' || body.requestedSize <= 0) {
      return 'requestedSize must be a positive number';
    }

    return null;
  }

  /**
   * Handle POST /admin/override - Create manual allocation override
   * Requirement 9.7: Create admin endpoint for allocation override
   */
  private async handleCreateOverride(
    request: FastifyRequest<{ Body: OverrideRequestBody }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const body = request.body;

      // Validate request body
      const validationError = this.validateOverrideBody(body);
      if (validationError) {
        reply.status(400).send({
          error: validationError,
          timestamp: Date.now(),
        });
        return;
      }

      // Create allocation vector
      const allocation: AllocationVector = {
        w1: body.allocation.w1,
        w2: body.allocation.w2,
        w3: body.allocation.w3,
        timestamp: Date.now(),
      };

      // Create override
      const success = await this.brain.createManualOverride(
        body.operatorId,
        body.password,
        allocation,
        body.reason,
        body.durationHours
      );

      if (success) {
        reply.send({
          success: true,
          message: 'Manual override created successfully',
          allocation,
          operatorId: body.operatorId,
          reason: body.reason,
          timestamp: Date.now(),
        });
      } else {
        reply.status(401).send({
          error: 'Failed to create override - authentication failed or override already active',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle DELETE /admin/override - Deactivate manual allocation override
   */
  private async handleDeactivateOverride(
    request: FastifyRequest<{ Body: DeactivateOverrideRequestBody }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const body = request.body;

      if (!body.operatorId || !body.password) {
        reply.status(400).send({
          error: 'operatorId and password are required',
          timestamp: Date.now(),
        });
        return;
      }

      const success = await this.brain.deactivateManualOverride(
        body.operatorId,
        body.password
      );

      if (success) {
        reply.send({
          success: true,
          message: 'Manual override deactivated successfully',
          operatorId: body.operatorId,
          timestamp: Date.now(),
        });
      } else {
        reply.status(401).send({
          error: 'Failed to deactivate override - authentication failed or no active override',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /admin/override - Get current manual override status
   */
  private async handleGetOverride(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const override = this.brain.getCurrentManualOverride();
      const warningBannerActive = this.brain.isWarningBannerActive();

      reply.send({
        override,
        warningBannerActive,
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /admin/override/history - Get manual override history
   */
  private async handleOverrideHistory(
    request: FastifyRequest<{ Querystring: { operatorId?: string; limit?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const operatorId = request.query.operatorId;
      const limit = parseInt(request.query.limit ?? '50', 10);

      const history = await this.brain.getManualOverrideHistory(
        operatorId,
        Math.min(limit, 100)
      );

      reply.send({
        history,
        count: history.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle POST /admin/operator - Create new operator account
   */
  private async handleCreateOperator(
    request: FastifyRequest<{ Body: CreateOperatorRequestBody }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const body = request.body;

      // Validate request body
      if (!body.operatorId || !body.password || !Array.isArray(body.permissions)) {
        reply.status(400).send({
          error: 'operatorId, password, and permissions array are required',
          timestamp: Date.now(),
        });
        return;
      }

      const success = await this.brain.createOperator(
        body.operatorId,
        body.password,
        body.permissions
      );

      if (success) {
        reply.send({
          success: true,
          message: 'Operator created successfully',
          operatorId: body.operatorId,
          permissions: body.permissions,
          timestamp: Date.now(),
        });
      } else {
        reply.status(400).send({
          error: 'Failed to create operator - operator may already exist',
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Validate override request body
   */
  private validateOverrideBody(body: OverrideRequestBody): string | null {
    if (!body.operatorId || typeof body.operatorId !== 'string') {
      return 'operatorId is required and must be a string';
    }

    if (!body.password || typeof body.password !== 'string') {
      return 'password is required and must be a string';
    }

    if (!body.allocation || typeof body.allocation !== 'object') {
      return 'allocation is required and must be an object';
    }

    if (typeof body.allocation.w1 !== 'number' || 
        typeof body.allocation.w2 !== 'number' || 
        typeof body.allocation.w3 !== 'number') {
      return 'allocation.w1, allocation.w2, and allocation.w3 must be numbers';
    }

    // Validate allocation weights sum to 1.0
    const sum = body.allocation.w1 + body.allocation.w2 + body.allocation.w3;
    if (Math.abs(sum - 1.0) > 0.001) {
      return `allocation weights must sum to 1.0, got ${sum.toFixed(3)}`;
    }

    // Validate weights are non-negative
    if (body.allocation.w1 < 0 || body.allocation.w2 < 0 || body.allocation.w3 < 0) {
      return 'allocation weights must be non-negative';
    }

    if (!body.reason || typeof body.reason !== 'string') {
      return 'reason is required and must be a string';
    }

    if (body.durationHours !== undefined && 
        (typeof body.durationHours !== 'number' || body.durationHours <= 0)) {
      return 'durationHours must be a positive number if provided';
    }

    return null;
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
  }

  /**
   * Disable HMAC verification
   */
  disableHmac(): void {
    this.hmacOptions.enabled = false;
  }

  /**
   * Handle POST /webhook/phase{1,2,3} - Phase-specific signal endpoint
   * Requirements: 7.4 - Set up webhooks from Phase services
   */
  private async handlePhaseSignal(
    phaseId: PhaseId,
    request: FastifyRequest<{ Body: RawPhaseSignalBody }>,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Verify HMAC signature if enabled
      if (this.hmacOptions.enabled) {
        const isValid = this.verifyHmacSignature(request);
        if (!isValid) {
          reply.status(401).send({
            error: 'Invalid signature',
            timestamp: Date.now(),
          });
          return;
        }
      }

      const body = request.body;

      // Validate required fields
      if (!body.signal_id) {
        reply.status(400).send({
          error: 'signal_id is required',
          timestamp: Date.now(),
        });
        return;
      }

      if (!body.symbol) {
        reply.status(400).send({
          error: 'symbol is required',
          timestamp: Date.now(),
        });
        return;
      }

      if (!body.direction || !['LONG', 'SHORT'].includes(body.direction)) {
        reply.status(400).send({
          error: 'direction must be LONG or SHORT',
          timestamp: Date.now(),
        });
        return;
      }

      // Transform raw phase signal to IntentSignal
      const signal: IntentSignal = {
        signalId: body.signal_id,
        phaseId,
        symbol: body.symbol,
        side: body.direction === 'LONG' ? 'BUY' : 'SELL',
        requestedSize: body.size || 0,
        timestamp: body.timestamp || Date.now(),
        leverage: body.leverage,
      };

      let decision: BrainDecision;

      // Use signal queue if available, otherwise process directly
      if (this.signalQueue) {
        // Check idempotency
        const isDuplicate = await this.signalQueue.isDuplicate(signal.signalId);
        if (isDuplicate) {
          reply.status(409).send({
            error: 'Duplicate signal ID',
            signalId: signal.signalId,
            timestamp: Date.now(),
          });
          return;
        }

        // Enqueue signal
        await this.signalQueue.enqueue(signal);

        // Process from queue
        const processedSignal = await this.signalQueue.dequeue();
        if (processedSignal) {
          decision = await this.brain.processSignal(processedSignal);
          await this.signalQueue.markProcessed(processedSignal.signalId);
        } else {
          decision = await this.brain.processSignal(signal);
        }
      } else {
        decision = await this.brain.processSignal(signal);
      }

      const processingTime = Date.now() - startTime;

      reply.send({
        ...decision,
        processingTime,
        source: phaseId,
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle POST /phases/register - Register a phase webhook URL
   * Requirements: 7.6 - Implement phase notification endpoints
   */
  private async handlePhaseRegister(
    request: FastifyRequest<{ Body: PhaseRegisterBody }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const body = request.body;

      if (!body.phaseId || !['phase1', 'phase2', 'phase3'].includes(body.phaseId)) {
        reply.status(400).send({
          error: 'phaseId must be one of: phase1, phase2, phase3',
          timestamp: Date.now(),
        });
        return;
      }

      if (!body.webhookUrl) {
        reply.status(400).send({
          error: 'webhookUrl is required',
          timestamp: Date.now(),
        });
        return;
      }

      // Store the webhook URL (in a real implementation, this would be persisted)
      console.log(`📝 Phase ${body.phaseId} registered webhook: ${body.webhookUrl}`);

      reply.send({
        success: true,
        message: `Phase ${body.phaseId} webhook registered`,
        phaseId: body.phaseId,
        webhookUrl: body.webhookUrl,
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /phases/status - Get status of all phases
   * Requirements: 7.6 - Implement phase notification endpoints
   */
  private async handlePhasesStatus(ync handlePhasesStatus(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const approvalRates = this.brain.getAllApprovalRates();
      const allocation = this.brain.getAllocation();
      const equity = this.brain.getEquity();

      reply.send({
        phases: {
          phase1: {
            name: 'Scavenger',
            allocation: allocation.w1,
            equity: equity * allocation.w1,
            approvalRate: approvalRates.phase1,
            status: allocation.w1 > 0 ? 'active' : 'inactive',
          },
          phase2: {
            name: 'Hunter',
            allocation: allocation.w2,
            equity: equity * allocation.w2,
            approvalRate: approvalRates.phase2,
            status: allocation.w2 > 0 ? 'active' : 'inactive',
          },
          phase3: {
            name: 'Sentinel',
            allocation: allocation.w3,
            equity: equity * allocation.w3,
            approvalRate: approvalRates.phase3,
            status: allocation.w3 > 0 ? 'active' : 'inactive',
          },
        },
        totalEquity: equity,
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle GET /metrics - Prometheus metrics endpoint
   * Requirements: 6.5 - Prometheus metrics integration
   */
  private async handleMetrics(
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const metrics = getMetrics();
      const metricsText = metrics.export();
      
      reply
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(metricsText);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Raw phase signal body from Phase services
 */
interface RawPhaseSignalBody {
  signal_id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  size?: number;
  entry_price?: number;
  stop_loss?: number;
  take_profit?: number[];
  leverage?: number;
  confidence?: number;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Phase registration body
 */
interface PhaseRegisterBody {
  phaseId: PhaseId;
  webhookUrl: string;
}
