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
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
};
/**
 * Circuit breaker for service calls
 */
class ServiceCircuitBreaker {
    failureThreshold;
    recoveryTimeout;
    failures = 0;
    lastFailureTime = 0;
    state = 'CLOSED';
    constructor(failureThreshold = 5, recoveryTimeout = 60000) {
        this.failureThreshold = failureThreshold;
        this.recoveryTimeout = recoveryTimeout;
    }
    /**
     * Check if request should be allowed
     */
    canExecute() {
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
    recordSuccess() {
        // eslint-disable-next-line functional/immutable-data
        this.failures = 0;
        // eslint-disable-next-line functional/immutable-data
        this.state = 'CLOSED';
    }
    /**
     * Record failed request
     */
    recordFailure() {
        // eslint-disable-next-line functional/immutable-data
        this.failures++;
        // eslint-disable-next-line functional/immutable-data
        this.lastFailureTime = Date.now();
        if (this.failures >= this.failureThreshold) {
            // eslint-disable-next-line functional/immutable-data
            this.state = 'OPEN';
        }
    }
    getState() {
        return this.state;
    }
}
/**
 * Service registry for managing service instances
 */
class ServiceRegistry extends EventEmitter {
    config;
    services = new Map();
    servicesByName = new Map();
    heartbeatTimers = new Map();
    constructor(config) {
        super();
        this.config = config;
    }
    /**
     * Register a service instance
     */
    register(service) {
        const serviceId = this.generateServiceId(service);
        const instance = {
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
        this.servicesByName.get(service.name).add(serviceId);
        // Start heartbeat monitoring
        this.startHeartbeatMonitoring(serviceId);
        console.log(colors.green(`📝 Registered service: ${service.name} (${serviceId})`));
        const event = {
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
    deregister(serviceId) {
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
        const event = {
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
    heartbeat(serviceId) {
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
            const event = {
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
    updateService(serviceId, updates) {
        const service = this.services.get(serviceId);
        if (!service) {
            return false;
        }
        // eslint-disable-next-line functional/immutable-data
        Object.assign(service, updates);
        const event = {
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
    findServices(query = {}) {
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
            results = results.filter((service) => query.tags.every((tag) => service.tags.includes(tag)));
        }
        // Filter by status
        if (query.status && query.status.length > 0) {
            results = results.filter((service) => query.status.includes(service.status));
        }
        // Filter by metadata
        if (query.metadata) {
            results = results.filter((service) => {
                return Object.entries(query.metadata).every(([key, value]) => service.metadata[key] === value);
            });
        }
        return results;
    }
    /**
     * Get service by ID
     */
    getService(serviceId) {
        return this.services.get(serviceId) || null;
    }
    /**
     * Get all services
     */
    getAllServices() {
        return Array.from(this.services.values());
    }
    /**
     * Get healthy services by name
     */
    getHealthyServices(serviceName) {
        return this.findServices({
            name: serviceName,
            status: ['healthy'],
        });
    }
    /**
     * Generate unique service ID
     */
    generateServiceId(service) {
        const data = `${service.name}:${service.host}:${service.port}:${Date.now()}`;
        return createHash('sha256').update(data).digest('hex').substring(0, 16);
    }
    /**
     * Start heartbeat monitoring for a service
     */
    startHeartbeatMonitoring(serviceId) {
        const timer = setInterval(() => {
            this.checkServiceHealth(serviceId);
        }, this.config.heartbeatInterval);
        // eslint-disable-next-line functional/immutable-data
        this.heartbeatTimers.set(serviceId, timer);
    }
    /**
     * Stop heartbeat monitoring for a service
     */
    stopHeartbeatMonitoring(serviceId) {
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
    checkServiceHealth(serviceId) {
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
                const event = {
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
    cleanup() {
        const now = Date.now();
        const toRemove = [];
        for (const [serviceId, service] of this.services) {
            if (service.status === 'unhealthy' &&
                now - service.lastHeartbeat > this.config.serviceTimeout * 2) {
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
    getStats() {
        const services = this.getAllServices();
        const healthy = services.filter((s) => s.status === 'healthy').length;
        const unhealthy = services.filter((s) => s.status === 'unhealthy').length;
        const servicesByName = {};
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
    config;
    registry;
    circuitBreakers = new Map();
    cleanupTimer = null;
    constructor(config) {
        super();
        this.config = config;
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
    start() {
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
    stop() {
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
    registerSelf(service) {
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
    register(service) {
        return this.registry.register(service);
    }
    /**
     * Deregister service
     */
    deregister(serviceId) {
        return this.registry.deregister(serviceId);
    }
    /**
     * Send heartbeat for service
     */
    heartbeat(serviceId) {
        return this.registry.heartbeat(serviceId);
    }
    /**
     * Update service information
     */
    updateService(serviceId, updates) {
        return this.registry.updateService(serviceId, updates);
    }
    /**
     * Discover services by name
     */
    discoverServices(serviceName, options = {}) {
        const query = {
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
    getServiceEndpoint(serviceName, endpoint = 'api') {
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
    async callService(serviceName, endpoint, options = {}) {
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
            return response;
        }
        catch (error) {
            circuitBreaker.recordFailure();
            throw error;
        }
    }
    /**
     * Select service with load balancing
     */
    selectServiceWithLoadBalancing(services) {
        // Simple round-robin for now
        const index = Math.floor(Math.random() * services.length);
        return services[index];
    }
    /**
     * Get or create circuit breaker for service
     */
    getCircuitBreaker(serviceName) {
        if (!this.circuitBreakers.has(serviceName)) {
            // eslint-disable-next-line functional/immutable-data
            this.circuitBreakers.set(serviceName, new ServiceCircuitBreaker());
        }
        return this.circuitBreakers.get(serviceName);
    }
    /**
     * Make HTTP request (simplified implementation)
     */
    async makeHttpRequest(url, options) {
        // This is a simplified implementation
        // In a real scenario, you would use fetch, axios, or similar
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (Math.random() > 0.1) {
                    // 90% success rate
                    resolve({ success: true, data: {} });
                }
                else {
                    reject(new Error('Request failed'));
                }
            }, 100);
        });
    }
    /**
     * Get all services
     */
    getAllServices() {
        return this.registry.getAllServices();
    }
    /**
     * Get service by ID
     */
    getService(serviceId) {
        return this.registry.getService(serviceId);
    }
    /**
     * Get discovery statistics
     */
    getStats() {
        const registryStats = this.registry.getStats();
        const circuitBreakerStates = {};
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
    updateConfig(config) {
        // eslint-disable-next-line functional/immutable-data
        this.config = { ...this.config, ...config };
        console.log(colors.blue('⚙️ Service discovery configuration updated'));
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
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
export const DEFAULT_SERVICE_DISCOVERY_CONFIG = {
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
let serviceDiscoveryInstance = null;
/**
 * Get or create the global Service Discovery instance
 */
export function getServiceDiscovery(config) {
    if (!serviceDiscoveryInstance) {
        serviceDiscoveryInstance = new ServiceDiscovery(config || DEFAULT_SERVICE_DISCOVERY_CONFIG);
    }
    return serviceDiscoveryInstance;
}
/**
 * Reset the global Service Discovery instance (for testing)
 */
export function resetServiceDiscovery() {
    if (serviceDiscoveryInstance) {
        serviceDiscoveryInstance.shutdown();
    }
    serviceDiscoveryInstance = null;
}
//# sourceMappingURL=ServiceDiscovery.js.map