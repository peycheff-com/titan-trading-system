import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TitanBrain } from '../../engine/TitanBrain.js';
import { HealthManager } from '../../health/HealthManager.js';
import { ServiceDiscovery } from '../../services/ServiceDiscovery.js';

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
    server.get('/health', this.handleHealth.bind(this));
    server.get('/status', this.handleStatus.bind(this));
    server.get('/services', this.handleServicesStatus.bind(this));
    server.get('/services/:serviceName/health', this.handleServiceHealth.bind(this));
  }

  /**
   * Handle GET /health - Simple Load Balancer Check
   */
  async handleHealth(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    // Quick check: Are we initialized? Dependencies connected?
    const healthStatus = await this.healthManager.checkHealth();

    if (healthStatus.status === 'unhealthy') {
      reply.status(503).send({ status: 'unhealthy' });
    } else {
      reply.status(200).send({ status: healthStatus.status });
    }
  }

  /**
   * Handle GET /status - Detailed Operator View
   */
  async handleStatus(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const healthStatus = await this.healthManager.checkHealth();
      const cbStatus = this.brain.getCircuitBreakerStatus();

      // Determine Mode based on Status + Dependencies
      // eslint-disable-next-line functional/no-let
      let mode = 'NORMAL';
      const actions: string[] = [];
      const unsafe_actions: string[] = [];

      if (healthStatus.status === 'unhealthy') {
        mode = 'EMERGENCY';
        // eslint-disable-next-line functional/immutable-data
        actions.push('Check Critical Infrastructure (Postgres/NATS)');
        // eslint-disable-next-line functional/immutable-data
        unsafe_actions.push('Do Not Restart without Checking Logs');
      } else if (healthStatus.status === 'degraded') {
        mode = 'CAUTIOUS';
        // eslint-disable-next-line functional/immutable-data
        actions.push('Monitor Logs for Degraded Component');
      }

      if (cbStatus.active) {
        if (mode !== 'EMERGENCY') mode = 'DEFENSIVE';
        // eslint-disable-next-line functional/immutable-data
        actions.push(`Circuit Breaker Active: ${cbStatus.reason}`);
        // eslint-disable-next-line functional/immutable-data
        actions.push('Use Manual Override to Reset if Safe');
      }

      reply.status(200).send({
        mode,
        reasons: healthStatus.status === 'healthy' ? [] : ['System Degraded/Unhealthy'],
        actions,
        unsafe_actions,
        components: healthStatus.components,
        details: {
          timestamp: healthStatus.timestamp,
          uptime: healthStatus.uptime,
          version: healthStatus.version,
          equity: this.brain.getEquity(),
          circuitBreaker: cbStatus,
        },
      });
    } catch (error) {
      reply.status(500).send({
        mode: 'EMERGENCY',
        reasons: ['Internal Health Check Failure'],
        actions: ['Investigate Brain Logs'],
        unsafe_actions: [],
      });
    }
  }

  /**
   * Handle GET /services - List all discovered services and their status
   */
  async handleServicesStatus(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const services = this.serviceDiscovery.getAllServices();
    reply.send(services);
  }

  /**
   * Handle GET /services/:serviceName/health - Proxy health check to a specific service
   */
  async handleServiceHealth(
    request: FastifyRequest<{ Params: { serviceName: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    const { serviceName } = request.params;
    const service = this.serviceDiscovery.getService(serviceName);

    if (!service) {
      reply.status(404).send({ error: `Service '${serviceName}' not found` });
      return;
    }

    try {
      const health = await this.serviceDiscovery.checkServiceHealth(serviceName);
      reply.send(health);
    } catch (error: any) {
      reply.status(502).send({
        error: `Failed to check health for service '${serviceName}'`,
        message: error.message,
      });
    }
  }
}
