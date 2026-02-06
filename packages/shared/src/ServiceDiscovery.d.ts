/**
 * Service Discovery for Titan Trading System
 *
 * Provides automatic service registration, discovery, and health monitoring
 * for distributed deployment scenarios with dynamic scaling.
 *
 * Requirements: 10.1 - Service discovery and registration
 */
import { EventEmitter } from 'eventemitter3';
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
    heartbeatInterval: number;
    heartbeatTimeout: number;
    serviceTimeout: number;
    enableAutoCleanup: boolean;
    cleanupInterval: number;
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
 * Service Discovery Manager
 */
export declare class ServiceDiscovery extends EventEmitter {
    private config;
    private registry;
    private circuitBreakers;
    private cleanupTimer;
    constructor(config: ServiceDiscoveryConfig);
    /**
     * Start service discovery
     */
    start(): void;
    /**
     * Stop service discovery
     */
    stop(): void;
    /**
     * Register current service instance
     */
    registerSelf(service: Omit<ServiceInstance, 'id' | 'registeredAt' | 'lastHeartbeat' | 'status'>): ServiceInstance;
    /**
     * Register external service
     */
    register(service: Omit<ServiceInstance, 'id' | 'registeredAt' | 'lastHeartbeat' | 'status'>): ServiceInstance;
    /**
     * Deregister service
     */
    deregister(serviceId: string): boolean;
    /**
     * Send heartbeat for service
     */
    heartbeat(serviceId: string): boolean;
    /**
     * Update service information
     */
    updateService(serviceId: string, updates: Partial<Pick<ServiceInstance, 'metadata' | 'tags' | 'status'>>): boolean;
    /**
     * Discover services by name
     */
    discoverServices(serviceName: string, options?: {
        includeUnhealthy?: boolean;
        tags?: string[];
        version?: string;
    }): ServiceInstance[];
    /**
     * Get service endpoint URL
     */
    getServiceEndpoint(serviceName: string, endpoint?: 'api' | 'websocket' | 'health' | 'metrics'): string | null;
    /**
     * Make service call with circuit breaker
     */
    callService<T>(serviceName: string, endpoint: string, options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: any;
        timeout?: number;
    }): Promise<T>;
    /**
     * Select service with load balancing
     */
    private selectServiceWithLoadBalancing;
    /**
     * Get or create circuit breaker for service
     */
    private getCircuitBreaker;
    /**
     * Make HTTP request (simplified implementation)
     */
    private makeHttpRequest;
    /**
     * Get all services
     */
    getAllServices(): ServiceInstance[];
    /**
     * Get service by ID
     */
    getService(serviceId: string): ServiceInstance | null;
    /**
     * Get discovery statistics
     */
    getStats(): {
        totalServices: number;
        healthyServices: number;
        unhealthyServices: number;
        servicesByName: Record<string, number>;
        circuitBreakerStates: Record<string, string>;
    };
    /**
     * Update configuration
     */
    updateConfig(config: Partial<ServiceDiscoveryConfig>): void;
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Default service discovery configuration
 */
export declare const DEFAULT_SERVICE_DISCOVERY_CONFIG: ServiceDiscoveryConfig;
/**
 * Get or create the global Service Discovery instance
 */
export declare function getServiceDiscovery(config?: ServiceDiscoveryConfig): ServiceDiscovery;
/**
 * Reset the global Service Discovery instance (for testing)
 */
export declare function resetServiceDiscovery(): void;
//# sourceMappingURL=ServiceDiscovery.d.ts.map