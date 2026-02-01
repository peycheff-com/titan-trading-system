/**
 * Service Discovery for Titan Trading System
 *
 * Provides automatic service registration, discovery, and health monitoring
 * for distributed deployment scenarios with dynamic scaling.
 *
 * Requirements: 10.1 - Service discovery and registration
 */

import { EventEmitter } from 'eventemitter3';
import { createHash } from 'crypto';

// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
};

/**
 * Service instance information
 */
export interface ServiceInstance {
  id: string;
  name: string;
  version: string;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'ws' | 'wss';
  tags: string[];
  metadata: Record<string, any>;
  endpoints: {
    health: string;
    metrics: string;
    api?: string;
    websocket?: string;
  };
  registeredAt: number;
  lastHeartbeat: number;
  status: 'starting' | 'healthy' | 'unhealthy' | 'stopping' | 'stopped';
}

/**
 * Service discovery configuration
 */
export interface ServiceDiscoveryConfig {
  heartbeatInterval: number; // milliseconds
  heartbeatTimeout: number; // milliseconds
  serviceTimeout: number; // milliseconds - when to consider service dead
  enableAutoCleanup: boolean;
  cleanupInterval: number; // milliseconds
  enableLoadBalancing: boolean;
  enableServiceMesh: boolean;
  meshConfig: {
    enableTLS: boolean;
    enableTracing: boolean;
    enableMetrics: boolean;
    retryPolicy: {
      maxRetries: number;
      backoffMultiplier: number;
      maxBackoffMs: number;
    };
  };
}

/**
 * Service query filters
 */
export interface ServiceQuery {
  name?: string;
  version?: string;
  tags?: string[];
  status?: ServiceInstance['status'][];
  metadata?: Record<string, any>;
}

/**
 * Service event types
 */
export interface ServiceEvent {
  type: 'registered' | 'deregistered' | 'health_changed' | 'updated';
  service: ServiceInstance;
  timestamp: number;
}

/**
 * Service mesh configuration
 */
export interface ServiceMeshConfig {
  enableSidecarProxy: boolean;
  enableCircuitBreaker: boolean;
  enableRetries: boolean;
  enableLoadBalancing: boolean;
  enableTracing: boolean;
  enableMetrics: boolean;
  tlsConfig?: {
    enabled: boolean;
    certPath: string;
    keyPath: string;
    caPath: string;
  };
}

/**
 * Circuit breaker for service calls
 */
class ServiceCircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 60000,
  ) {}

  /**
   * Check if request should be allowed
   */
  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        // eslint-disable-next-line functional/immutable-data
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    // HALF_OPEN state - allow one request to test
    return true;
  }

  /**
   * Record successful request
   */
  recordSuccess(): void {
    // eslint-disable-next-line functional/immutable-data
    this.failures = 0;
    // eslint-disable-next-line functional/immutable-data
    this.state = 'CLOSED';
  }

  /**
   * Record failed request
   */
  recordFailure(): void {
    // eslint-disable-next-line functional/immutable-data
    this.failures++;
    // eslint-disable-next-line functional/immutable-data
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      // eslint-disable-next-line functional/immutable-data
      this.state = 'OPEN';
    }
  }

  getState(): string {
    return this.state;
  }
}

/**
 * Service registry for managing service instances
 */
class ServiceRegistry extends EventEmitter {
  private services = new Map<string, ServiceInstance>();
  private servicesByName = new Map<string, Set<string>>();
  private heartbeatTimers = new Map<string, NodeJS.Timeout>();

  constructor(private config: ServiceDiscoveryConfig) {
    super();
  }

  /**
   * Register a service instance
   */
  register(
    service: Omit<ServiceInstance, 'id' | 'registeredAt' | 'lastHeartbeat' | 'status'>,
  ): ServiceInstance {
    const serviceId = this.generateServiceId(service);

    const instance: ServiceInstance = {
      ...service,
      id: serviceId,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      status: 'starting',
    };

    // eslint-disable-next-line functional/immutable-data
    this.services.set(serviceId, instance);

    // Add to name index
    if (!this.servicesByName.has(service.name)) {
      // eslint-disable-next-line functional/immutable-data
      this.servicesByName.set(service.name, new Set());
    }
    // eslint-disable-next-line functional/immutable-data
    this.servicesByName.get(service.name)!.add(serviceId);

    // Start heartbeat monitoring
    this.startHeartbeatMonitoring(serviceId);

    console.log(colors.green(`📝 Registered service: ${service.name} (${serviceId})`));

    const event: ServiceEvent = {
      type: 'registered',
      service: instance,
      timestamp: Date.now(),
    };

    this.emit('serviceRegistered', event);

    return instance;
  }

  /**
   * Deregister a service instance
   */
  deregister(serviceId: string): boolean {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    // Stop heartbeat monitoring
    this.stopHeartbeatMonitoring(serviceId);

    // Remove from registry
    // eslint-disable-next-line functional/immutable-data
    this.services.delete(serviceId);

    // Remove from name index
    const nameSet = this.servicesByName.get(service.name);
    if (nameSet) {
      // eslint-disable-next-line functional/immutable-data
      nameSet.delete(serviceId);
      if (nameSet.size === 0) {
        // eslint-disable-next-line functional/immutable-data
        this.servicesByName.delete(service.name);
      }
    }

    console.log(colors.yellow(`📝 Deregistered service: ${service.name} (${serviceId})`));

    const event: ServiceEvent = {
      type: 'deregistered',
      service,
      timestamp: Date.now(),
    };

    this.emit('serviceDeregistered', event);

    return true;
  }

  /**
   * Update service heartbeat
   */
  heartbeat(serviceId: string): boolean {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    // eslint-disable-next-line functional/immutable-data
    service.lastHeartbeat = Date.now();

    // Update status to healthy if it was starting
    if (service.status === 'starting') {
      // eslint-disable-next-line functional/immutable-data
      service.status = 'healthy';

      const event: ServiceEvent = {
        type: 'health_changed',
        service,
        timestamp: Date.now(),
      };

      this.emit('serviceHealthChanged', event);
    }

    return true;
  }

  /**
   * Update service metadata
   */
  updateService(
    serviceId: string,
    updates: Partial<Pick<ServiceInstance, 'metadata' | 'tags' | 'status'>>,
  ): boolean {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    // eslint-disable-next-line functional/immutable-data
    Object.assign(service, updates);

    const event: ServiceEvent = {
      type: 'updated',
      service,
      timestamp: Date.now(),
    };

    this.emit('serviceUpdated', event);

    return true;
  }

  /**
   * Find services by query
   */
  findServices(query: ServiceQuery = {}): ServiceInstance[] {
    // eslint-disable-next-line functional/no-let
    let results = Array.from(this.services.values());

    // Filter by name
    if (query.name) {
      const serviceIds = this.servicesByName.get(query.name);
      if (!serviceIds) {
        return [];
      }
      results = results.filter((service) => serviceIds.has(service.id));
    }

    // Filter by version
    if (query.version) {
      results = results.filter((service) => service.version === query.version);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter((service) => query.tags!.every((tag) => service.tags.includes(tag)));
    }

    // Filter by status
    if (query.status && query.status.length > 0) {
      results = results.filter((service) => query.status!.includes(service.status));
    }

    // Filter by metadata
    if (query.metadata) {
      results = results.filter((service) => {
        return Object.entries(query.metadata!).every(
          ([key, value]) => service.metadata[key] === value,
        );
      });
    }

    return results;
  }

  /**
   * Get service by ID
   */
  getService(serviceId: string): ServiceInstance | null {
    return this.services.get(serviceId) || null;
  }

  /**
   * Get all services
   */
  getAllServices(): ServiceInstance[] {
    return Array.from(this.services.values());
  }

  /**
   * Get healthy services by name
   */
  getHealthyServices(serviceName: string): ServiceInstance[] {
    return this.findServices({
      name: serviceName,
      status: ['healthy'],
    });
  }

  /**
   * Generate unique service ID
   */
  private generateServiceId(
    service: Omit<ServiceInstance, 'id' | 'registeredAt' | 'lastHeartbeat' | 'status'>,
  ): string {
    const data = `${service.name}:${service.host}:${service.port}:${Date.now()}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Start heartbeat monitoring for a service
   */
  private startHeartbeatMonitoring(serviceId: string): void {
    const timer = setInterval(() => {
      this.checkServiceHealth(serviceId);
    }, this.config.heartbeatInterval);

    // eslint-disable-next-line functional/immutable-data
    this.heartbeatTimers.set(serviceId, timer);
  }

  /**
   * Stop heartbeat monitoring for a service
   */
  private stopHeartbeatMonitoring(serviceId: string): void {
    const timer = this.heartbeatTimers.get(serviceId);
    if (timer) {
      clearInterval(timer);
      // eslint-disable-next-line functional/immutable-data
      this.heartbeatTimers.delete(serviceId);
    }
  }

  /**
   * Check service health based on heartbeat
   */
  private checkServiceHealth(serviceId: string): void {
    const service = this.services.get(serviceId);
    if (!service) {
      return;
    }

    const timeSinceHeartbeat = Date.now() - service.lastHeartbeat;

    if (timeSinceHeartbeat > this.config.serviceTimeout) {
      // Service is considered dead
      if (service.status !== 'unhealthy') {
        // eslint-disable-next-line functional/immutable-data
        service.status = 'unhealthy';

        console.log(colors.red(`💔 Service ${service.name} (${serviceId}) is unhealthy`));

        const event: ServiceEvent = {
          type: 'health_changed',
          service,
          timestamp: Date.now(),
        };

        this.emit('serviceHealthChanged', event);

        // Auto-cleanup if enabled
        if (this.config.enableAutoCleanup) {
          setTimeout(() => {
            this.deregister(serviceId);
          }, this.config.cleanupInterval);
        }
      }
    }
  }

  /**
   * Cleanup dead services
   */
  cleanup(): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [serviceId, service] of this.services) {
      if (
        service.status === 'unhealthy' &&
        now - service.lastHeartbeat > this.config.serviceTimeout * 2
      ) {
        // eslint-disable-next-line functional/immutable-data
        toRemove.push(serviceId);
      }
    }

    toRemove.forEach((serviceId) => this.deregister(serviceId));

    if (toRemove.length > 0) {
      console.log(colors.blue(`🧹 Cleaned up ${toRemove.length} dead services`));
    }
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    servicesByName: Record<string, number>;
  } {
    const services = this.getAllServices();
    const healthy = services.filter((s) => s.status === 'healthy').length;
    const unhealthy = services.filter((s) => s.status === 'unhealthy').length;

    const servicesByName: Record<string, number> = {};
    for (const [name, serviceIds] of this.servicesByName) {
      // eslint-disable-next-line functional/immutable-data
      servicesByName[name] = serviceIds.size;
    }

    return {
      totalServices: services.length,
      healthyServices: healthy,
      unhealthyServices: unhealthy,
      servicesByName,
    };
  }
}

/**
 * Service Discovery Manager
 */
export class ServiceDiscovery extends EventEmitter {
  private registry: ServiceRegistry;
  private circuitBreakers = new Map<string, ServiceCircuitBreaker>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private config: ServiceDiscoveryConfig) {
    super();

    this.registry = new ServiceRegistry(config);

    // Forward registry events
    this.registry.on('serviceRegistered', (event) => this.emit('serviceRegistered', event));
    this.registry.on('serviceDeregistered', (event) => this.emit('serviceDeregistered', event));
    this.registry.on('serviceHealthChanged', (event) => this.emit('serviceHealthChanged', event));
    this.registry.on('serviceUpdated', (event) => this.emit('serviceUpdated', event));

    console.log(colors.blue('🔍 Service Discovery initialized'));
  }

  /**
   * Start service discovery
   */
  start(): void {
    if (this.config.enableAutoCleanup) {
      // eslint-disable-next-line functional/immutable-data
      this.cleanupTimer = setInterval(() => {
        this.registry.cleanup();
      }, this.config.cleanupInterval);
    }

    console.log(colors.green('🚀 Service Discovery started'));
  }

  /**
   * Stop service discovery
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      // eslint-disable-next-line functional/immutable-data
      this.cleanupTimer = null;
    }

    console.log(colors.yellow('🛑 Service Discovery stopped'));
  }

  /**
   * Register current service instance
   */
  registerSelf(
    service: Omit<ServiceInstance, 'id' | 'registeredAt' | 'lastHeartbeat' | 'status'>,
  ): ServiceInstance {
    const instance = this.registry.register(service);

    // Start automatic heartbeat
    setInterval(() => {
      this.heartbeat(instance.id);
    }, this.config.heartbeatInterval / 2); // Send heartbeat twice as often as check interval

    return instance;
  }

  /**
   * Register external service
   */
  register(
    service: Omit<ServiceInstance, 'id' | 'registeredAt' | 'lastHeartbeat' | 'status'>,
  ): ServiceInstance {
    return this.registry.register(service);
  }

  /**
   * Deregister service
   */
  deregister(serviceId: string): boolean {
    return this.registry.deregister(serviceId);
  }

  /**
   * Send heartbeat for service
   */
  heartbeat(serviceId: string): boolean {
    return this.registry.heartbeat(serviceId);
  }

  /**
   * Update service information
   */
  updateService(
    serviceId: string,
    updates: Partial<Pick<ServiceInstance, 'metadata' | 'tags' | 'status'>>,
  ): boolean {
    return this.registry.updateService(serviceId, updates);
  }

  /**
   * Discover services by name
   */
  discoverServices(
    serviceName: string,
    options: {
      includeUnhealthy?: boolean;
      tags?: string[];
      version?: string;
    } = {},
  ): ServiceInstance[] {
    const query: ServiceQuery = {
      name: serviceName,
      tags: options.tags,
      version: options.version,
    };

    if (!options.includeUnhealthy) {
      // eslint-disable-next-line functional/immutable-data
      query.status = ['healthy'];
    }

    return this.registry.findServices(query);
  }

  /**
   * Get service endpoint URL
   */
  getServiceEndpoint(
    serviceName: string,
    endpoint: 'api' | 'websocket' | 'health' | 'metrics' = 'api',
  ): string | null {
    const services = this.discoverServices(serviceName);
    if (services.length === 0) {
      return null;
    }

    // Use load balancing if enabled
    const service = this.config.enableLoadBalancing
      ? this.selectServiceWithLoadBalancing(services)
      : services[0];

    const baseUrl = `${service.protocol}://${service.host}:${service.port}`;

    switch (endpoint) {
      case 'api':
        return service.endpoints.api ? `${baseUrl}${service.endpoints.api}` : baseUrl;
      case 'websocket':
        return service.endpoints.websocket ? `${baseUrl}${service.endpoints.websocket}` : null;
      case 'health':
        return `${baseUrl}${service.endpoints.health}`;
      case 'metrics':
        return `${baseUrl}${service.endpoints.metrics}`;
      default:
        return baseUrl;
    }
  }

  /**
   * Make service call with circuit breaker
   */
  async callService<T>(
    serviceName: string,
    endpoint: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
      timeout?: number;
    } = {},
  ): Promise<T> {
    const serviceUrl = this.getServiceEndpoint(serviceName, 'api');
    if (!serviceUrl) {
      throw new Error(`Service ${serviceName} not found`);
    }

    const fullUrl = `${serviceUrl}${endpoint}`;
    const circuitBreaker = this.getCircuitBreaker(serviceName);

    if (!circuitBreaker.canExecute()) {
      throw new Error(`Circuit breaker is OPEN for service ${serviceName}`);
    }

    try {
      // Simulate HTTP request (in real implementation, use fetch or axios)
      const response = await this.makeHttpRequest(fullUrl, options);

      circuitBreaker.recordSuccess();
      return response as T;
    } catch (error) {
      circuitBreaker.recordFailure();
      throw error;
    }
  }

  /**
   * Select service with load balancing
   */
  private selectServiceWithLoadBalancing(services: ServiceInstance[]): ServiceInstance {
    // Simple round-robin for now
    const index = Math.floor(Math.random() * services.length);
    return services[index];
  }

  /**
   * Get or create circuit breaker for service
   */
  private getCircuitBreaker(serviceName: string): ServiceCircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      // eslint-disable-next-line functional/immutable-data
      this.circuitBreakers.set(serviceName, new ServiceCircuitBreaker());
    }
    return this.circuitBreakers.get(serviceName)!;
  }

  /**
   * Make HTTP request (simplified implementation)
   */
  private async makeHttpRequest(url: string, options: any): Promise<any> {
    // This is a simplified implementation
    // In a real scenario, you would use fetch, axios, or similar
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.1) {
          // 90% success rate
          resolve({ success: true, data: {} });
        } else {
          reject(new Error('Request failed'));
        }
      }, 100);
    });
  }

  /**
   * Get all services
   */
  getAllServices(): ServiceInstance[] {
    return this.registry.getAllServices();
  }

  /**
   * Get service by ID
   */
  getService(serviceId: string): ServiceInstance | null {
    return this.registry.getService(serviceId);
  }

  /**
   * Get discovery statistics
   */
  getStats(): {
    totalServices: number;
    healthyServices: number;
    unhealthyServices: number;
    servicesByName: Record<string, number>;
    circuitBreakerStates: Record<string, string>;
  } {
    const registryStats = this.registry.getStats();

    const circuitBreakerStates: Record<string, string> = {};
    for (const [serviceName, cb] of this.circuitBreakers) {
      // eslint-disable-next-line functional/immutable-data
      circuitBreakerStates[serviceName] = cb.getState();
    }

    return {
      ...registryStats,
      circuitBreakerStates,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ServiceDiscoveryConfig>): void {
    // eslint-disable-next-line functional/immutable-data
    this.config = { ...this.config, ...config };
    console.log(colors.blue('⚙️ Service discovery configuration updated'));
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down Service Discovery...'));
    this.stop();
    // eslint-disable-next-line functional/immutable-data
    this.circuitBreakers.clear();
    this.removeAllListeners();
  }
}

/**
 * Default service discovery configuration
 */
export const DEFAULT_SERVICE_DISCOVERY_CONFIG: ServiceDiscoveryConfig = {
  heartbeatInterval: 30000, // 30 seconds
  heartbeatTimeout: 5000, // 5 seconds
  serviceTimeout: 90000, // 90 seconds
  enableAutoCleanup: true,
  cleanupInterval: 300000, // 5 minutes
  enableLoadBalancing: true,
  enableServiceMesh: false,
  meshConfig: {
    enableTLS: false,
    enableTracing: false,
    enableMetrics: true,
    retryPolicy: {
      maxRetries: 3,
      backoffMultiplier: 2,
      maxBackoffMs: 30000,
    },
  },
};

/**
 * Singleton Service Discovery instance
 */
// eslint-disable-next-line functional/no-let
let serviceDiscoveryInstance: ServiceDiscovery | null = null;

/**
 * Get or create the global Service Discovery instance
 */
export function getServiceDiscovery(config?: ServiceDiscoveryConfig): ServiceDiscovery {
  if (!serviceDiscoveryInstance) {
    serviceDiscoveryInstance = new ServiceDiscovery(config || DEFAULT_SERVICE_DISCOVERY_CONFIG);
  }
  return serviceDiscoveryInstance;
}

/**
 * Reset the global Service Discovery instance (for testing)
 */
export function resetServiceDiscovery(): void {
  if (serviceDiscoveryInstance) {
    serviceDiscoveryInstance.shutdown();
  }
  serviceDiscoveryInstance = null;
}
