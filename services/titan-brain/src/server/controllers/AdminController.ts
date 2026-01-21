import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TitanBrain } from "../../engine/TitanBrain.js";
import { Logger } from "../../logging/Logger.js";
import {
    CreateOperatorRequestBody,
    CreateOperatorSchema,
    DeactivateOverrideRequestBody,
    DeactivateOverrideSchema,
    ManualTradeRequestBody,
    ManualTradeSchema,
    OverrideRequestBody,
    OverrideRequestSchema,
} from "../../schemas/apiSchemas.js";
import { AllocationVector, RiskGuardianConfig } from "../../types/index.js";

export class AdminController {
    constructor(
        private readonly brain: TitanBrain,
        private readonly logger: Logger,
    ) {}

    /**
     * Register routes for this controller
     */
    registerRoutes(server: FastifyInstance): void {
        server.post("/breaker/reset", this.handleBreakerReset.bind(this));

        // Overrides
        server.post("/admin/override", this.handleCreateOverride.bind(this));
        server.delete(
            "/admin/override",
            this.handleDeactivateOverride.bind(this),
        );
        server.get("/admin/override", this.handleGetOverride.bind(this));
        server.get(
            "/admin/override/history",
            this.handleOverrideHistory.bind(this),
        );

        // Admin actions
        server.post("/admin/operator", this.handleCreateOperator.bind(this));
        server.post("/trade/manual", this.handleManualTrade.bind(this));
        server.delete(
            "/trade/cancel-all",
            this.handleCancelAllTrades.bind(this),
        );

        // Risk & Audit
        server.patch("/risk/config", this.handleUpdateRiskConfig.bind(this));
        server.post(
            "/reconciliation/trigger",
            this.handleTriggerReconciliation.bind(this),
        );
        server.get("/audit/decisions", this.handleAuditDecisions.bind(this));
        server.get("/risk/state", this.handleRiskState.bind(this));
        server.get("/risk/regime-history", this.handleRegimeHistory.bind(this));
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

            if (!operatorId || typeof operatorId !== "string") {
                reply.status(400).send({
                    error: "operatorId is required",
                    timestamp: Date.now(),
                });
                return;
            }

            await this.brain.resetCircuitBreaker(operatorId);

            reply.send({
                success: true,
                message: "Circuit breaker reset",
                operatorId,
                timestamp: Date.now(),
            });
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
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
                    error: "Validation failed",
                    details: parseResult.error.issues.map((e) =>
                        `${e.path.join(".")}: ${e.message}`
                    ),
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
                    message: "Manual override created successfully",
                    allocation,
                    operatorId: body.operatorId,
                    reason: body.reason,
                    timestamp: Date.now(),
                });
            } else {
                reply.status(401).send({
                    error:
                        "Failed to create override - authentication failed or override already active",
                    timestamp: Date.now(),
                });
            }
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
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
            const parseResult = DeactivateOverrideSchema.safeParse(
                request.body,
            );

            if (!parseResult.success) {
                reply.status(400).send({
                    error: "Validation failed",
                    details: parseResult.error.issues.map((e) =>
                        `${e.path.join(".")}: ${e.message}`
                    ),
                    timestamp: Date.now(),
                });
                return;
            }

            const body = parseResult.data;

            const success = await this.brain.deactivateManualOverride(
                body.operatorId,
                body.password,
            );

            if (success) {
                reply.send({
                    success: true,
                    message: "Manual override deactivated successfully",
                    operatorId: body.operatorId,
                    timestamp: Date.now(),
                });
            } else {
                reply.status(401).send({
                    error:
                        "Failed to deactivate override - authentication failed or no active override",
                    timestamp: Date.now(),
                });
            }
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle GET /admin/override - Get current manual override status
     */
    async handleGetOverride(
        _request: FastifyRequest,
        reply: FastifyReply,
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
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle GET /admin/override/history - Get manual override history
     */
    async handleOverrideHistory(
        request: FastifyRequest<
            { Querystring: { operatorId?: string; limit?: string } }
        >,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const operatorId = request.query.operatorId;
            const limit = parseInt(request.query.limit ?? "50", 10);

            const history = await this.brain.getManualOverrideHistory(
                operatorId,
                Math.min(limit, 100),
            );

            reply.send({
                history,
                count: history.length,
                timestamp: Date.now(),
            });
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
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
                    error: "Validation failed",
                    details: parseResult.error.issues.map((e) =>
                        `${e.path.join(".")}: ${e.message}`
                    ),
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
                    message: "Operator created successfully",
                    operatorId: body.operatorId,
                    permissions: body.permissions,
                    timestamp: Date.now(),
                });
            } else {
                reply.status(400).send({
                    error:
                        "Failed to create operator - operator may already exist",
                    timestamp: Date.now(),
                });
            }
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
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
                    error: "Validation failed",
                    details: parseResult.error.issues.map((e) =>
                        `${e.path.join(".")}: ${e.message}`
                    ),
                });
                return;
            }

            const body = parseResult.data;
            const signalId = await this.brain.getManualTradeService()
                .executeManualTrade(body);

            reply.send({
                success: true,
                signalId,
                message: "Manual trade signal forwarded to execution",
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error("Failed to process manual trade", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
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
                message: "Emergency close triggered",
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error(
                "Failed to execute emergency close",
                error as Error,
            );
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
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
                reply.status(400).send({ error: "No configuration provided" });
                return;
            }

            // TODO: Implement updateRiskConfig in Brain/RiskGuardian
            // this.brain.getRiskGuardian().updateConfig(config);
            // For now, partial implementation placeholder
            reply.status(501).send({
                error: "Dynamic risk config update not yet implemented",
            });
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
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
                error: "Reconciliation Service not available",
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
            this.logger.error("Manual reconciliation failed", error as Error);
            reply.status(500).send({
                error: "Reconciliation failed",
                details: String(error),
            });
        }
    }

    /**
     * Handle GET /audit/decisions
     */
    async handleAuditDecisions(
        request: FastifyRequest<
            { Querystring: { limit?: string; signalId?: string } }
        >,
        reply: FastifyReply,
    ): Promise<void> {
        // Requires implementation in Brain to fetch from EventStore strictly for audit
        // For now assuming 501 or basic implementation
        reply.status(501).send({ error: "Not implemented" });
    }

    /**
     * Handle GET /risk/state
     */
    async handleRiskState(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        // Placeholder
        reply.send({ state: "unknown" });
    }

    /**
     * Handle GET /risk/regime-history
     */
    async handleRegimeHistory(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        // Placeholder
        reply.send({ history: [] });
    }
}
