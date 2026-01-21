import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TitanBrain } from "../../engine/TitanBrain.js";
import { DashboardService } from "../DashboardService.js";

export class DashboardController {
    constructor(
        private readonly brain: TitanBrain,
        private readonly dashboardService: DashboardService,
    ) {}

    /**
     * Register routes for this controller
     */
    registerRoutes(server: FastifyInstance): void {
        server.get("/dashboard", this.handleDashboard.bind(this));
        server.get(
            "/dashboard/extended",
            this.handleExtendedDashboard.bind(this),
        );
        server.get("/dashboard/export", this.handleDashboardExport.bind(this));
        server.get(
            "/dashboard/export/extended",
            this.handleExtendedDashboardExport.bind(this),
        );
        server.get(
            "/phases/approval-rates",
            this.handleApprovalRates.bind(this),
        );
        server.get("/phases/status", this.handlePhasesStatus.bind(this));
        server.get("/decisions", this.handleRecentDecisions.bind(this));
        server.get("/treasury", this.handleTreasuryStatus.bind(this));
        server.get("/allocation", this.handleAllocation.bind(this));
        server.get("/breaker", this.handleBreakerStatus.bind(this));
    }

    /**
     * Handle GET /dashboard - Dashboard data endpoint
     */
    async handleDashboard(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const dashboardData = await this.brain.getDashboardData();
            reply.send(dashboardData);
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle GET /dashboard/extended - Extended dashboard data endpoint
     */
    async handleExtendedDashboard(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const extendedData = await this.dashboardService.getDashboardData();
            reply.send(extendedData);
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle GET /dashboard/export - Export dashboard data as JSON
     */
    async handleDashboardExport(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const jsonData = await this.brain.exportDashboardJSON();
            reply
                .header("Content-Type", "application/json")
                .header(
                    "Content-Disposition",
                    `attachment; filename="titan-brain-dashboard-${Date.now()}.json"`,
                )
                .send(jsonData);
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle GET /dashboard/export/extended - Export extended dashboard data as JSON
     */
    async handleExtendedDashboardExport(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const jsonData = await this.dashboardService.exportDashboardJSON();
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            reply
                .header("Content-Type", "application/json")
                .header(
                    "Content-Disposition",
                    `attachment; filename="titan-brain-extended-dashboard-${timestamp}.json"`,
                )
                .send(jsonData);
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle GET /phases/approval-rates - Phase approval rates
     */
    async handleApprovalRates(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const rates = this.brain.getAllApprovalRates();
            reply.send({
                approvalRates: rates,
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
     * Handle GET /decisions - Recent decisions
     */
    async handleRecentDecisions(
        request: FastifyRequest<{ Querystring: { limit?: string } }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const limit = parseInt(request.query.limit ?? "20", 10);
            const decisions = this.brain.getRecentDecisions(
                Math.min(limit, 100),
            );
            reply.send({
                decisions,
                count: decisions.length,
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
     * Handle GET /treasury - Treasury status
     */
    async handleTreasuryStatus(
        _request: FastifyRequest,
        reply: FastifyReply,
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
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle GET /allocation - Current allocation vector
     */
    async handleAllocation(
        _request: FastifyRequest,
        reply: FastifyReply,
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
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle GET /breaker - Circuit breaker status
     */
    async handleBreakerStatus(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const status = this.brain.getCircuitBreakerStatus();
            reply.send(status);
        } catch (error) {
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle GET /phases/status - Get status of all phases
     */
    async handlePhasesStatus(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const approvalRates = this.brain.getAllApprovalRates();
            const allocation = this.brain.getAllocation();
            const equity = this.brain.getEquity();

            reply.send({
                phases: {
                    phase1: {
                        name: "Scavenger",
                        allocation: allocation.w1,
                        equity: equity * allocation.w1,
                        approvalRate: approvalRates.phase1,
                        status: allocation.w1 > 0 ? "active" : "inactive",
                    },
                    phase2: {
                        name: "Hunter",
                        allocation: allocation.w2,
                        equity: equity * allocation.w2,
                        approvalRate: approvalRates.phase2,
                        status: allocation.w2 > 0 ? "active" : "inactive",
                    },
                    phase3: {
                        name: "Sentinel",
                        allocation: allocation.w3,
                        equity: equity * allocation.w3,
                        approvalRate: approvalRates.phase3,
                        status: allocation.w3 > 0 ? "active" : "inactive",
                    },
                },
                totalEquity: equity,
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
     * Handle POST /phases/register - Register a phase webhook URL
     */
    async handlePhaseRegister(
        request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        // Basic implementation as in WebhookServer
        // NOTE: Requires imports for Schema if strictly typed, but for now delegating
        reply.status(501).send({ error: "Not implemented in controller yet" });
    }
}
