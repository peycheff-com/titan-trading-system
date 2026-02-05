/**
 * ConfigController - REST API for configuration management
 *
 * Endpoints:
 * - GET /config/catalog - Get all config items with schemas
 * - GET /config/effective - Get effective values with provenance
 * - POST /config/override - Create/update override (tighten-only enforced)
 * - DELETE /config/override - Rollback override
 * - GET /config/receipts - Get audit trail
 */
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Logger } from "../../logging/Logger.js";
import { ConfigRegistry } from "../../services/config/ConfigRegistry.js";
import { AuthMiddleware } from "../../security/AuthMiddleware.js";

// Request body types
interface OverrideBody {
    key: string;
    value: unknown;
    reason: string;
    expiresInHours?: number;
}

interface RollbackBody {
    key: string;
}

export class ConfigController {
    private readonly registry: ConfigRegistry;
    private readonly logger: Logger;
    private readonly auth: AuthMiddleware;

    constructor(registry: ConfigRegistry, auth: AuthMiddleware) {
        this.registry = registry;
        this.auth = auth;
        this.logger = Logger.getInstance("config-controller");
    }

    /**
     * Register routes for this controller
     */
    registerRoutes(server: FastifyInstance): void {
        const operatorGuard = {
            preHandler: [this.auth.verifyToken.bind(this.auth)],
        };

        const adminGuard = {
            preHandler: [
                this.auth.verifyToken.bind(this.auth),
                this.auth.requireRole("admin"),
            ],
        };

        // Read-only endpoints (operator access)
        server.get(
            "/config/catalog",
            operatorGuard,
            this.handleGetCatalog.bind(this),
        );
        server.get<{ Querystring: { key?: string } }>(
            "/config/effective",
            operatorGuard,
            this.handleGetEffective.bind(this),
        );
        server.get<{ Querystring: { limit?: string } }>(
            "/config/receipts",
            operatorGuard,
            this.handleGetReceipts.bind(this),
        );
        server.get(
            "/config/overrides",
            operatorGuard,
            this.handleGetOverrides.bind(this),
        );

        // SSE stream for real-time updates
        server.get(
            "/config/stream",
            operatorGuard,
            this.handleStream.bind(this),
        );

        // Write endpoints (admin access)
        server.post<{ Body: OverrideBody }>(
            "/config/override",
            adminGuard,
            this.handleCreateOverride.bind(this),
        );
        server.delete<{ Body: RollbackBody }>(
            "/config/override",
            adminGuard,
            this.handleRollbackOverride.bind(this),
        );
    }

    /**
     * GET /config/catalog - Get all config items with schemas
     */
    async handleGetCatalog(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const catalog = this.registry.getCatalog();

            // Group by category for easier consumption
            const grouped: Record<string, typeof catalog> = {};
            for (const item of catalog) {
                if (!grouped[item.category]) {
                    grouped[item.category] = [];
                }
                grouped[item.category].push(item);
            }

            reply.send({
                items: catalog,
                grouped,
                count: catalog.length,
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error("Failed to get catalog", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * GET /config/effective - Get effective values with provenance
     */
    async handleGetEffective(
        request: FastifyRequest<{ Querystring: { key?: string } }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { key } = request.query;

            if (key) {
                const effective = this.registry.getEffective(key);
                if (!effective) {
                    reply.status(404).send({
                        error: `Config key not found: ${key}`,
                        timestamp: Date.now(),
                    });
                    return;
                }
                reply.send({
                    config: effective,
                    timestamp: Date.now(),
                });
            } else {
                const allEffective = this.registry.getAllEffective();
                reply.send({
                    configs: allEffective,
                    count: allEffective.length,
                    timestamp: Date.now(),
                });
            }
        } catch (error) {
            this.logger.error("Failed to get effective config", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * POST /config/override - Create/update override (tighten-only enforced)
     */
    async handleCreateOverride(
        request: FastifyRequest<{ Body: OverrideBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { key, value, reason, expiresInHours } = request.body;

            if (!key || value === undefined || !reason) {
                reply.status(400).send({
                    error: "Missing required fields: key, value, reason",
                    timestamp: Date.now(),
                });
                return;
            }

            // Get operator ID from auth token
            const operatorId = (request as any).user?.sub || "unknown";

            const result = await this.registry.createOverride(
                key,
                value,
                operatorId,
                reason,
                expiresInHours,
            );

            if (result.success) {
                this.logger.info("Override created via API", undefined, {
                    key,
                    operatorId,
                    expiresInHours,
                });

                reply.send({
                    success: true,
                    receipt: result.receipt,
                    message: `Override created for ${key}`,
                    timestamp: Date.now(),
                });
            } else {
                reply.status(400).send({
                    success: false,
                    error: result.error,
                    timestamp: Date.now(),
                });
            }
        } catch (error) {
            this.logger.error("Failed to create override", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * DELETE /config/override - Rollback override
     */
    async handleRollbackOverride(
        request: FastifyRequest<{ Body: RollbackBody }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { key } = request.body;

            if (!key) {
                reply.status(400).send({
                    error: "Missing required field: key",
                    timestamp: Date.now(),
                });
                return;
            }

            const operatorId = (request as any).user?.sub || "unknown";

            const result = await this.registry.rollbackOverride(
                key,
                operatorId,
            );

            if (result.success) {
                this.logger.info("Override rolled back via API", undefined, {
                    key,
                    operatorId,
                });

                reply.send({
                    success: true,
                    receipt: result.receipt,
                    message: `Override rolled back for ${key}`,
                    timestamp: Date.now(),
                });
            } else {
                reply.status(400).send({
                    success: false,
                    error: result.error,
                    timestamp: Date.now(),
                });
            }
        } catch (error) {
            this.logger.error("Failed to rollback override", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * GET /config/receipts - Get audit trail
     */
    async handleGetReceipts(
        request: FastifyRequest<{ Querystring: { limit?: string } }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const limit = parseInt(request.query.limit || "50", 10);
            const receipts = this.registry.getReceipts(Math.min(limit, 100));

            reply.send({
                receipts,
                count: receipts.length,
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error("Failed to get receipts", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * GET /config/overrides - Get active overrides
     */
    async handleGetOverrides(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const overrides = this.registry.getActiveOverrides();

            reply.send({
                overrides,
                count: overrides.length,
                timestamp: Date.now(),
            });
        } catch (error) {
            this.logger.error("Failed to get overrides", error as Error);
            reply.status(500).send({
                error: error instanceof Error ? error.message : "Unknown error",
                timestamp: Date.now(),
            });
        }
    }

    /**
     * GET /config/stream - SSE stream for real-time config updates
     */
    async handleStream(
        request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        // Set SSE headers
        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
        });

        // Send initial state
        const initialData = {
            type: "init",
            overrides: this.registry.getActiveOverrides(),
            receipts: this.registry.getReceipts(10),
            timestamp: Date.now(),
        };
        reply.raw.write(`data: ${JSON.stringify(initialData)}\n\n`);

        // Heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
            reply.raw.write(
                `data: ${
                    JSON.stringify({ type: "heartbeat", timestamp: Date.now() })
                }\n\n`,
            );
        }, 30000);

        // Poll for changes every 5 seconds (simpler than full event system)
        let lastOverrideCount = this.registry.getActiveOverrides().length;
        let lastReceiptCount = this.registry.getReceipts(100).length;

        const pollInterval = setInterval(() => {
            const currentOverrides = this.registry.getActiveOverrides();
            const currentReceipts = this.registry.getReceipts(100);

            if (
                currentOverrides.length !== lastOverrideCount ||
                currentReceipts.length !== lastReceiptCount
            ) {
                const updateData = {
                    type: "update",
                    overrides: currentOverrides,
                    receipts: this.registry.getReceipts(10),
                    timestamp: Date.now(),
                };
                reply.raw.write(`data: ${JSON.stringify(updateData)}\n\n`);
                lastOverrideCount = currentOverrides.length;
                lastReceiptCount = currentReceipts.length;
            }
        }, 5000);

        // Cleanup on disconnect
        request.raw.on("close", () => {
            clearInterval(heartbeatInterval);
            clearInterval(pollInterval);
            this.logger.info("Config SSE stream closed", undefined, {});
        });
    }
}
