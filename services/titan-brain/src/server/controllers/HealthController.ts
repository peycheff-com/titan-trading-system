import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TitanBrain } from "../../engine/TitanBrain.js";
import { HealthManager } from "../../health/HealthManager.js";
import { ServiceDiscovery } from "../../services/ServiceDiscovery.js";

export class HealthController {
    constructor(
        private readonly brain: TitanBrain,
        private readonly healthManager: HealthManager,
        private readonly serviceDiscovery: ServiceDiscovery,
    ) {}

    /**
     * Register routes for this controller
     */
    registerRoutes(server: FastifyInstance): void {
        server.get("/status", this.handleStatus.bind(this));
        server.get("/health", this.handleStatus.bind(this));
        server.get("/services", this.handleServicesStatus.bind(this));
        server.get(
            "/services/:serviceName/health",
            this.handleServiceHealth.bind(this),
        );
    }

    /**
     * Handle GET /status and /health - Enhanced health check endpoint
     */
    async handleStatus(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const healthStatus = await this.healthManager.checkHealth();

            // Determine HTTP status code based on health
            let statusCode = 200;
            if (healthStatus.status === "unhealthy") {
                statusCode = 503; // Service Unavailable
            } else if (healthStatus.status === "degraded") {
                statusCode = 200; // OK but degraded
            }

            reply.status(statusCode).send({
                status: healthStatus.status,
                timestamp: healthStatus.timestamp,
                uptime: healthStatus.uptime,
                duration: healthStatus.duration,
                version: healthStatus.version,
                components: healthStatus.components,
                // Legacy fields for backward compatibility
                healthy: healthStatus.status === "healthy",
                equity: this.brain.getEquity(), // Accessing Brain for legacy field compatibility
                circuitBreaker: this.brain.getCircuitBreakerStatus().active
                    ? "active"
                    : "inactive",
            });
        } catch (error) {
            reply.status(500).send({
                status: "error",
                timestamp: new Date().toISOString(),
                error: error instanceof Error ? error.message : "Unknown error",
                healthy: false,
            });
        }
    }

    /**
     * Handle GET /services - Service discovery status
     */
    async handleServicesStatus(
        _request: FastifyRequest,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const healthStatus = this.serviceDiscovery.getHealthStatus();

            reply.send({
                status: "success",
                data: {
                    healthy: healthStatus.healthy,
                    totalServices: healthStatus.totalServices,
                    healthyServices: healthStatus.healthyServices,
                    requiredServicesHealthy:
                        healthStatus.requiredServicesHealthy,
                    services: healthStatus.services.map((service) => ({
                        name: service.name,
                        url: service.url,
                        healthy: service.healthy,
                        lastCheck: service.lastCheck,
                        responseTime: service.responseTime,
                        error: service.error,
                        consecutiveFailures: service.consecutiveFailures,
                    })),
                },
                timestamp: Date.now(),
            });
        } catch (error) {
            reply.status(500).send({
                error: "Failed to get services status",
                message: error instanceof Error ? error.message : String(error),
                timestamp: Date.now(),
            });
        }
    }

    /**
     * Handle GET /services/:serviceName/health - Individual service health check
     */
    async handleServiceHealth(
        request: FastifyRequest<{ Params: { serviceName: string } }>,
        reply: FastifyReply,
    ): Promise<void> {
        try {
            const { serviceName } = request.params;
            const isHealthy = await this.serviceDiscovery.checkServiceHealth(
                serviceName,
            );
            const status = this.serviceDiscovery.getServiceStatus(serviceName);

            if (!status) {
                reply.status(404).send({
                    error: "Service not found",
                    serviceName,
                    timestamp: Date.now(),
                });
                return;
            }

            reply.send({
                status: "success",
                data: {
                    serviceName: status.name,
                    url: status.url,
                    healthy: status.healthy,
                    lastCheck: status.lastCheck,
                    responseTime: status.responseTime,
                    error: status.error,
                    consecutiveFailures: status.consecutiveFailures,
                    justChecked: isHealthy,
                },
                timestamp: Date.now(),
            });
        } catch (error) {
            reply.status(500).send({
                error: "Failed to check service health",
                message: error instanceof Error ? error.message : String(error),
                timestamp: Date.now(),
            });
        }
    }
}
