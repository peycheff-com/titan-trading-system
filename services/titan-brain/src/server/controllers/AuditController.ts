import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TitanBrain } from "../../engine/TitanBrain.js";
import { Logger } from "../../logging/Logger.js";

interface AuditQuery {
    limit?: string;
    type?: string;
}

export class AuditController {
    constructor(
        private readonly brain: TitanBrain,
        private readonly logger: Logger,
    ) {}

    registerRoutes(server: FastifyInstance): void {
        server.get<{ Querystring: AuditQuery }>("/audit/logs", {
            handler: this.getLogs.bind(this),
            schema: {
                querystring: {
                    type: "object",
                    properties: {
                        limit: { type: "number" },
                        type: { type: "string" },
                    },
                },
            },
        });
    }

    private async getLogs(
        request: FastifyRequest<{ Querystring: AuditQuery }>,
        reply: FastifyReply,
    ): Promise<void> {
        const store = this.brain.getEventStore();

        if (!store) {
            reply.status(503).send({
                error: "Audit Store unavailable",
                message: "EventStore is not initialized on this node",
            });
            return;
        }

        try {
            const limit = request.query.limit
                ? parseInt(request.query.limit)
                : 50;
            const type = request.query.type;

            const events = await store.getRecentEvents(limit, type);

            reply.send({
                data: events,
                meta: {
                    limit,
                    count: events.length,
                },
            });
        } catch (error) {
            this.logger.error("Failed to fetch audit logs", error as Error);
            reply.status(500).send({
                error: "Internal Server Error",
                message: "Failed to retrieve audit logs",
            });
        }
    }
}
