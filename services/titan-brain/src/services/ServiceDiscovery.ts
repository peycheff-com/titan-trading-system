/**
 * Service Discovery for Production Deployment
 *
 * Manages service URLs and connectivity validation for deployed services.
 * Handles service URL resolution, health checking, and failover logic.
 *
 * Requirements: 2.2.1, 2.2.2, 2.2.3, 2.2.4
 */

import { ServiceClient, ServiceClientConfig } from './ServiceClient.js';
import { Logger } from '../logging/Logger.js';

export interface ServiceEndpoint {
  /** Service name */
  name: string;
  /** Service URL */
  url: string;
  /** Service health check path */
  healthPath: string;
  /** Service priority (lower = higher priority) */
  priority: number;
  /** Whether service is required for system operation */
  required: boolean;
  /** Service client configuration */
  clientConfig?: Partial<ServiceClientConfig>;
}

export interface ServiceStatus {
  /** Service name */
  name: string;
  /** Service URL */
  url: string;
  /** Whether service is healthy */
  healthy: boolean;
  /** Last health check timestamp */
  lastCheck: number;
  /** Health check response time in ms */
  responseTime: number | null;
  /** Error message if unhealthy */
  error: string | null;
  /** Number of consecutive failures */
  consecutiveFailures: number;
}

export interface ServiceDiscoveryConfig {
  /** Health check interval in ms */
  healthCheckInterval: number;
  /** Health check timeout in ms */
  healthCheckTimeout: number;
  /** Maximum consecutive failures before marking unhealthy */
  maxConsecutiveFailures: number;
  /** Enable automatic health checking */
  enableHealthChecking: boolean;
  /** Enable service failover */
  enableFailover: boolean;
}

export class ServiceDiscovery {
  private readonly services = new Map<string, ServiceEndpoint>();
  private readonly serviceClients = new Map<string, ServiceClient>();
  private readonly serviceStatus = new Map<string, ServiceStatus>();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly logger: Logger;

  constructor(
    private readonly config: ServiceDiscoveryConfig,
    logger?: Logger,
  ) {
    this.logger = logger ?? Logger.getInstance('service-discovery');
  }

  /**
   * Register a service endpoint
   */
  registerService(endpoint: ServiceEndpoint): void {
    // eslint-disable-next-line functional/immutable-data
    this.services.set(endpoint.name, endpoint);

    // Create service client with proper configuration
    const clientConfig: Partial<ServiceClientConfig> = {
      baseUrl: endpoint.url,
      defaultTimeout: this.config.healthCheckTimeout,
      ...endpoint.clientConfig,
    };

    const client = new ServiceClient(clientConfig, this.logger);
    // eslint-disable-next-line functional/immutable-data
    this.serviceClients.set(endpoint.name, client);

    // Initialize service status
    // eslint-disable-next-line functional/immutable-data
    this.serviceStatus.set(endpoint.name, {
      name: endpoint.name,
      url: endpoint.url,
      healthy: false,
      lastCheck: 0,
      responseTime: null,
      error: null,
      consecutiveFailures: 0,
    });

    this.logger.info('Service registered', undefined, {
      service: endpoint.name,
      url: endpoint.url,
      required: endpoint.required,
      priority: endpoint.priority,
    });
  }

  /**
   * Register multiple services from environment variables
   */
  registerServicesFromEnvironment(): void {
    const services = this.parseServicesFromEnvironment();

    for (const service of services) {
      this.registerService(service);
    }

    this.logger.info('Services registered from environment', undefined, {
      count: services.length,
      services: services.map((s) => s.name),
    });
  }

  /**
   * Parse service configurations from environment variables
   */
  private parseServicesFromEnvironment(): ServiceEndpoint[] {
    const services: ServiceEndpoint[] = [];

    // Parse Phase service URLs
    const serviceNames = ['PHASE1', 'PHASE2', 'PHASE3', 'SHARED'];

    for (const serviceName of serviceNames) {
      const urlKey = `${serviceName}_SERVICE_URL`;
      const url = process.env[urlKey];

      if (url) {
        const endpoint: ServiceEndpoint = {
          name: serviceName.toLowerCase(),
          url: url.endsWith('/') ? url.slice(0, -1) : url,
          healthPath: '/health',
          priority: this.getServicePriority(serviceName),
          required: this.isServiceRequired(serviceName),
          clientConfig: {
            defaultTimeout: this.config.healthCheckTimeout,
            retry: {
              maxRetries: 2,
              initialDelay: 1000,
              maxDelay: 5000,
              backoffMultiplier: 2,
              retryableStatusCodes: [408, 429, 500, 502, 503, 504],
              retryableErrors: ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'],
            },
          },
        };

        // eslint-disable-next-line functional/immutable-data
        services.push(endpoint);
      }
    }

    // Parse custom service URLs
    const customServices = process.env.CUSTOM_SERVICES;
    if (customServices) {
      try {
        const parsed = JSON.parse(customServices);
        for (const [name, config] of Object.entries(parsed)) {
          if (typeof config === 'object' && config !== null && 'url' in config) {
            const serviceConfig = config as any;
            const endpoint: ServiceEndpoint = {
              name,
              url: serviceConfig.url,
              healthPath: serviceConfig.healthPath || '/health',
              priority: serviceConfig.priority || 10,
              required: serviceConfig.required || false,
              clientConfig: {
                defaultTimeout: this.config.healthCheckTimeout,
                ...serviceConfig.clientConfig,
              },
            };

            // eslint-disable-next-line functional/immutable-data
            services.push(endpoint);
          }
        }
      } catch (error) {
        this.logger.warn('Failed to parse custom services configuration', undefined, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return services;
  }

  /**
   * Get service priority based on name
   */
  private getServicePriority(serviceName: string): number {
    const priorities: Record<string, number> = {
      SHARED: 1, // Highest priority
      PHASE1: 2,
      PHASE2: 3,
      PHASE3: 4,
    };

    return priorities[serviceName] || 10;
  }

  /**
   * Check if service is required for system operation
   */
  private isServiceRequired(serviceName: string): boolean {
    const requiredServices = ['SHARED'];
    return requiredServices.includes(serviceName);
  }

  /**
   * Get service client for a registered service
   */
  getServiceClient(serviceName: string): ServiceClient | null {
    return this.serviceClients.get(serviceName) || null;
  }

  /**
   * Get service endpoint information
   */
  getServiceEndpoint(serviceName: string): ServiceEndpoint | null {
    return this.services.get(serviceName) || null;
  }

  /**
   * Get service status
   */
  getServiceStatus(serviceName: string): ServiceStatus | null {
    return this.serviceStatus.get(serviceName) || null;
  }

  /**
   * Get all service statuses
   */
  getAllServiceStatuses(): ServiceStatus[] {
    return Array.from(this.serviceStatus.values());
  }

  /**
   * Get healthy services sorted by priority
   */
  getHealthyServices(): ServiceStatus[] {
    return Array.from(this.serviceStatus.values())
      .filter((status) => status.healthy)
      .sort((a, b) => {
        const serviceA = this.services.get(a.name);
        const serviceB = this.services.get(b.name);
        return (serviceA?.priority || 10) - (serviceB?.priority || 10);
      });
  }

  /**
   * Get unhealthy required services
   */
  getUnhealthyRequiredServices(): ServiceStatus[] {
    return Array.from(this.serviceStatus.values()).filter((status) => {
      const service = this.services.get(status.name);
      return service?.required && !status.healthy;
    });
  }

  /**
   * Start health checking for all registered services
   */
  startHealthChecking(): void {
    if (!this.config.enableHealthChecking) {
      return;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Perform initial health check
    this.performHealthChecks();

    // Schedule periodic health checks
    // eslint-disable-next-line functional/immutable-data
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);

    this.logger.info('Health checking started', undefined, {
      interval: this.config.healthCheckInterval,
      services: Array.from(this.services.keys()),
    });
  }

  /**
   * Stop health checking
   */
  stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      // eslint-disable-next-line functional/immutable-data
      this.healthCheckInterval = null;
    }

    this.logger.info('Health checking stopped');
  }

  /**
   * Perform health checks for all registered services
   */
  private async performHealthChecks(): Promise<void> {
    const promises = Array.from(this.services.keys()).map((serviceName) =>
      this.checkServiceHealth(serviceName),
    );

    await Promise.allSettled(promises);
  }

  /**
   * Check health of a specific service
   */
  async checkServiceHealth(serviceName: string): Promise<boolean> {
    const client = this.serviceClients.get(serviceName);
    const service = this.services.get(serviceName);
    const status = this.serviceStatus.get(serviceName);

    if (!client || !service || !status) {
      return false;
    }

    const startTime = Date.now();

    try {
      // Make health check request
      await client.get(service.healthPath, {
        timeout: this.config.healthCheckTimeout,
      });

      const responseTime = Date.now() - startTime;

      // Update status - healthy
      // eslint-disable-next-line functional/immutable-data
      status.healthy = true;
      // eslint-disable-next-line functional/immutable-data
      status.lastCheck = Date.now();
      // eslint-disable-next-line functional/immutable-data
      status.responseTime = responseTime;
      // eslint-disable-next-line functional/immutable-data
      status.error = null;
      // eslint-disable-next-line functional/immutable-data
      status.consecutiveFailures = 0;

      return true;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Update status - unhealthy
      // eslint-disable-next-line functional/immutable-data
      status.consecutiveFailures++;
      // eslint-disable-next-line functional/immutable-data
      status.healthy = status.consecutiveFailures < this.config.maxConsecutiveFailures;
      // eslint-disable-next-line functional/immutable-data
      status.lastCheck = Date.now();
      // eslint-disable-next-line functional/immutable-data
      status.responseTime = responseTime;
      // eslint-disable-next-line functional/immutable-data
      status.error = error instanceof Error ? error.message : String(error);

      if (status.consecutiveFailures >= this.config.maxConsecutiveFailures) {
        this.logger.warn('Service marked as unhealthy', undefined, {
          service: serviceName,
          consecutiveFailures: status.consecutiveFailures,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      return false;
    }
  }

  /**
   * Validate all required services are healthy
   */
  async validateRequiredServices(): Promise<boolean> {
    const requiredServices = Array.from(this.services.values()).filter(
      (service) => service.required,
    );

    if (requiredServices.length === 0) {
      return true;
    }

    const healthChecks = requiredServices.map((service) => this.checkServiceHealth(service.name));

    const results = await Promise.allSettled(healthChecks);
    const allHealthy = results.every(
      (result) => result.status === 'fulfilled' && result.value === true,
    );

    if (!allHealthy) {
      const unhealthyServices = requiredServices
        .filter((_, index) => {
          const result = results[index];
          return result.status === 'rejected' || !result.value;
        })
        .map((service) => service.name);

      this.logger.error('Required services are unhealthy', undefined, undefined, {
        unhealthyServices,
      });
    }

    return allHealthy;
  }

  /**
   * Get service discovery health status
   */
  getHealthStatus(): {
    healthy: boolean;
    totalServices: number;
    healthyServices: number;
    requiredServicesHealthy: boolean;
    services: ServiceStatus[];
  } {
    const services = this.getAllServiceStatuses();
    const healthyServices = services.filter((s) => s.healthy);
    const requiredServicesHealthy = this.getUnhealthyRequiredServices().length === 0;

    return {
      healthy: requiredServicesHealthy,
      totalServices: services.length,
      healthyServices: healthyServices.length,
      requiredServicesHealthy,
      services,
    };
  }

  /**
   * Shutdown service discovery
   */
  shutdown(): void {
    this.stopHealthChecking();
    // eslint-disable-next-line functional/immutable-data
    this.services.clear();
    // eslint-disable-next-line functional/immutable-data
    this.serviceClients.clear();
    // eslint-disable-next-line functional/immutable-data
    this.serviceStatus.clear();

    this.logger.info('Service discovery shutdown complete');
  }
  /**
   * Alias for getAllServiceStatuses (compatibility)
   */
  getAllServices(): ServiceStatus[] {
    return this.getAllServiceStatuses();
  }

  /**
   * Alias for getServiceStatus (compatibility)
   */
  getService(serviceName: string): ServiceStatus | null {
    return this.getServiceStatus(serviceName);
  }
}

/**
 * Default service discovery configuration
 */
export const ServiceDiscoveryDefaults: ServiceDiscoveryConfig = {
  healthCheckInterval: 30000, // 30 seconds
  healthCheckTimeout: 5000, // 5 seconds
  maxConsecutiveFailures: 3,
  enableHealthChecking: true,
  enableFailover: true,
};
