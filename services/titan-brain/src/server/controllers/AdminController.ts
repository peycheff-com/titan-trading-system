import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TitanBrain } from '../../engine/TitanBrain.js';
import { Logger } from '../../logging/Logger.js';
import {
  CreateOperatorRequestBody,
  CreateOperatorSchema,
  DeactivateOverrideRequestBody,
  DeactivateOverrideSchema,
  LoginRequestBody,
  LoginSchema,
  ManualTradeRequestBody,
  ManualTradeSchema,
  OverrideRequestBody,
  OverrideRequestSchema,
} from '../../schemas/apiSchemas.js';
import { AllocationVector, RiskGuardianConfig } from '../../types/index.js';
import { AuthMiddleware } from '../../security/AuthMiddleware.js';

export class AdminController {
  constructor(
    private readonly brain: TitanBrain,
    private readonly logger: Logger,
    private readonly auth: AuthMiddleware,
  ) {}

  /**
   * Register routes for this controller
   */
  registerRoutes(server: FastifyInstance): void {
    // Public / Login
    server.post<{ Body: LoginRequestBody }>('/auth/login', this.handleLogin.bind(this));

    // Protected Routes (Admin)
    const adminGuard = {
      preHandler: [this.auth.verifyToken.bind(this.auth), this.auth.requireRole('admin')],
    };
    const operatorGuard = {
      preHandler: [this.auth.verifyToken.bind(this.auth)],
    }; // Basic auth

    server.post<{ Body: import('../../schemas/apiSchemas.js').BreakerResetBody }>(
      '/breaker/reset',
      adminGuard,
      this.handleBreakerReset.bind(this),
    );

    // Emergency Halt
    server.post<{ Body: { operatorId: string; reason: string } }>(
      '/risk/halt',
      adminGuard,
      this.handleEmergencyHalt.bind(this),
    );

    // Overrides
    server.post<{ Body: OverrideRequestBody }>(
      '/admin/override',
      adminGuard,
      this.handleCreateOverride.bind(this),
    );
    server.delete<{ Body: DeactivateOverrideRequestBody }>(
      '/admin/override',
      adminGuard,
      this.handleDeactivateOverride.bind(this),
    );
    server.get('/admin/override', operatorGuard, this.handleGetOverride.bind(this)); // Read-only allowed for operators
    server.get<{ Querystring: { operatorId?: string; limit?: string } }>(
      '/admin/override/history',
      operatorGuard,
      this.handleOverrideHistory.bind(this),
    );

    // Admin actions
    server.post<{ Body: CreateOperatorRequestBody }>(
      '/admin/operator',
      adminGuard,
      this.handleCreateOperator.bind(this),
    );
    server.post<{ Body: ManualTradeRequestBody }>(
      '/trade/manual',
      adminGuard,
      this.handleManualTrade.bind(this),
    );
    server.delete<{ Body: { reason: string } }>(
      '/trade/cancel-all',
      adminGuard,
      this.handleCancelAllTrades.bind(this),
    );

    // Risk & Audit
    server.patch<{
      Body: Partial<import('../../types/index.js').RiskGuardianConfig>;
    }>('/risk/config', adminGuard, this.handleUpdateRiskConfig.bind(this));
    server.post<{ Body: { exchange?: string } }>(
      '/reconciliation/trigger',
      adminGuard,
      this.handleTriggerReconciliation.bind(this),
    );
    server.get<{ Querystring: { limit?: string; signalId?: string } }>(
      '/audit/decisions',
      operatorGuard,
      this.handleAuditDecisions.bind(this),
    );
    server.get('/risk/state', operatorGuard, this.handleRiskState.bind(this));
    server.get('/risk/regime-history', operatorGuard, this.handleRegimeHistory.bind(this));
    // Infrastructure / DR
    server.post<{ Body: { operatorId: string } }>(
      '/admin/infra/failover',
      adminGuard,
      this.handleFailover.bind(this),
    );
    server.post<{ Body: { operatorId: string; backupId: string } }>(
      '/admin/infra/restore',
      adminGuard,
      this.handleRestore.bind(this),
    );
    server.get('/admin/infra/status', operatorGuard, this.handleInfraStatus.bind(this));
  }

  /**
   * Handle POST /auth/login
   */
  async handleLogin(
    request: FastifyRequest<{ Body: LoginRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const parseResult = LoginSchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400).send({ error: 'Invalid login request' });
        return;
      }

      const { operatorId, password } = parseResult.data;

      // Verify credentials via Brain (which checks against DB/Config)
      const isValid = await this.brain.verifyOperatorCredentials(operatorId, password);
      if (!isValid) {
        reply.status(401).send({ error: 'Invalid credentials' });
        return;
      }

      // Get operator roles (Assuming brain returns simple bool now, we might default to 'admin' for now or fetch roles)
      // TODO: Enhance verifyOperatorCredentials to return Operator object with roles
      const roles = ['admin']; // detailed implementation pending in Brain

      const token = this.auth.generateToken(operatorId, roles);

      reply.send({
        success: true,
        token,
        operatorId,
        roles,
      });
    } catch (error) {
      reply.status(500).send({ error: 'Login failed' });
    }
  }

  /**
   * Handle POST /breaker/reset - Reset circuit breaker
   */
  async handleBreakerReset(
    request: FastifyRequest<{ Body: { operatorId: string } }>,
    reply: FastifyReply,
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
   * Handle POST /risk/halt - Logic Emergency Halt
   */
  async handleEmergencyHalt(
    request: FastifyRequest<{ Body: { operatorId: string; reason: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { operatorId, reason } = request.body;
      if (!operatorId || !reason) {
        reply.status(400).send({ error: 'operatorId and reason required' });
        return;
      }

      await this.brain.triggerEmergencyHalt(operatorId, reason);

      reply.send({
        success: true,
        message: 'EMERGENCY HALT TRIGGERED',
        timestamp: Date.now(),
      });
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle POST /admin/override - Create manual allocation override
   */
  async handleCreateOverride(
    request: FastifyRequest<{ Body: OverrideRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const parseResult = OverrideRequestSchema.safeParse(request.body);

      if (!parseResult.success) {
        reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
          timestamp: Date.now(),
        });
        return;
      }

      const body = parseResult.data;

      const allocation: AllocationVector = {
        w1: body.allocation.w1,
        w2: body.allocation.w2,
        w3: body.allocation.w3,
        timestamp: Date.now(),
      };

      const success = await this.brain.createManualOverride(
        body.operatorId,
        body.password,
        allocation,
        body.reason,
        body.durationHours,
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
  async handleDeactivateOverride(
    request: FastifyRequest<{ Body: DeactivateOverrideRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const parseResult = DeactivateOverrideSchema.safeParse(request.body);

      if (!parseResult.success) {
        reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
          timestamp: Date.now(),
        });
        return;
      }

      const body = parseResult.data;

      const success = await this.brain.deactivateManualOverride(body.operatorId);

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
  async handleGetOverride(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
  async handleOverrideHistory(
    request: FastifyRequest<{ Querystring: { operatorId?: string; limit?: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const operatorId = request.query.operatorId;
      const limit = parseInt(request.query.limit ?? '50', 10);

      const history = await this.brain.getManualOverrideHistory(operatorId, Math.min(limit, 100));

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
  async handleCreateOperator(
    request: FastifyRequest<{ Body: CreateOperatorRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const parseResult = CreateOperatorSchema.safeParse(request.body);

      if (!parseResult.success) {
        reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
          timestamp: Date.now(),
        });
        return;
      }

      const body = parseResult.data;

      const success = await this.brain.createOperator(
        body.operatorId,
        body.password,
        body.permissions,
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
   * Handle POST /trade/manual - Execute manual trade
   */
  async handleManualTrade(
    request: FastifyRequest<{ Body: ManualTradeRequestBody }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const parseResult = ManualTradeSchema.safeParse(request.body);

      if (!parseResult.success) {
        reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`),
        });
        return;
      }

      const body = parseResult.data;
      const signalId = await this.brain.getManualTradeService().executeManualTrade(body);

      reply.send({
        success: true,
        signalId,
        message: 'Manual trade signal forwarded to execution',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Failed to process manual trade', error as Error);
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle DELETE /trade/cancel-all - Emergency close all positions
   */
  async handleCancelAllTrades(
    _request: FastifyRequest<{ Body: { reason: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      await this.brain.getManualTradeService().cancelAllTrades();
      reply.send({
        success: true,
        message: 'Emergency close triggered',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Failed to execute emergency close', error as Error);
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle PATCH /risk/config - Update risk configuration
   */
  async handleUpdateRiskConfig(
    request: FastifyRequest<{ Body: Partial<RiskGuardianConfig> }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const config = request.body;
      if (!config || Object.keys(config).length === 0) {
        reply.status(400).send({ error: 'No configuration provided' });
        return;
      }

      // Update RiskGuardian config in Brain and broadcast
      await this.brain.updateRiskConfig(config);

      reply.send({
        success: true,
        message: 'Risk configuration updated and broadcast',
        config,
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
   * Handle POST /reconciliation/trigger - Manually trigger reconciliation
   */
  async handleTriggerReconciliation(
    request: FastifyRequest<{ Body: { exchange?: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const service = this.brain.getReconciliationService();
    if (!service) {
      reply.status(503).send({
        error: 'Reconciliation Service not available',
      });
      return;
    }

    const { exchange } = request.body || {};
    try {
      if (exchange) {
        const report = await service.reconcile(exchange);
        reply.send(report);
      } else {
        const reports = await service.reconcileAll();
        reply.send({ reports });
      }
    } catch (error) {
      this.logger.error('Manual reconciliation failed', error as Error);
      reply.status(500).send({
        error: 'Reconciliation failed',
        details: String(error),
      });
    }
  }

  /**
   * Handle GET /audit/decisions
   */
  async handleAuditDecisions(
    request: FastifyRequest<{ Querystring: { limit?: string; signalId?: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    // Requires implementation in Brain to fetch from EventStore strictly for audit
    // For now assuming 501 or basic implementation
    reply.status(501).send({ error: 'Not implemented' });
  }

  /**
   * Handle GET /risk/state
   */
  async handleRiskState(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Placeholder
    reply.send({ state: 'unknown' });
  }

  /**
   * Handle GET /risk/regime-history
   */
  async handleRegimeHistory(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Placeholder
    reply.send({ history: [] });
  }

  /**
   * Handle POST /admin/infra/failover - Trigger system failover
   */
  async handleFailover(
    request: FastifyRequest<{ Body: { operatorId: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { operatorId } = request.body;
      if (!operatorId) {
        reply.status(400).send({ error: 'operatorId is required' });
        return;
      }

      await this.brain.triggerFailover(operatorId);

      reply.send({
        success: true,
        message: 'Failover sequence initiated',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Failover trigger failed', error as Error);
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle POST /admin/infra/restore - Trigger system restore
   */
  async handleRestore(
    request: FastifyRequest<{
      Body: { operatorId: string; backupId: string };
    }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { operatorId, backupId } = request.body;
      if (!operatorId || !backupId) {
        reply.status(400).send({
          error: 'operatorId and backupId are required',
        });
        return;
      }

      await this.brain.triggerRestore(backupId, operatorId);

      reply.send({
        success: true,
        message: 'Restore sequence initiated',
        timestamp: Date.now(),
      });
    } catch (error) {
      this.logger.error('Restore trigger failed', error as Error);
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle GET /admin/infra/status - Get infrastructure health and backup status
   */
  async handleInfraStatus(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const status = this.brain.getInfraStatus();
      reply.send(status);
    } catch (error) {
      reply.status(500).send({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
