/**
 * Load Balancer for Titan Trading System
 *
 * Provides intelligent load balancing for WebSocket and REST API endpoints
 * with health checking, failover, and automatic scaling capabilities.
 *
 * Requirements: 10.1 - Horizontal scaling with load balancing
 */
import { EventEmitter } from "eventemitter3";
/**
 * Backend server configuration
 */
export interface BackendServer {
    id: string;
    host: string;
    port: number;
    protocol: "http" | "https" | "ws" | "wss";
    weight: number;
    maxConnections: number;
    healthCheckPath?: string;
    tags: string[];
}
/**
 * Server health status
 */
export interface ServerHealth {
    serverId: string;
    isHealthy: boolean;
    responseTime: number;
    lastCheck: number;
    consecutiveFailures: number;
    currentConnections: number;
    cpuUsage?: number;
    memoryUsage?: number;
}
/**
 * Load balancing algorithms
 */
export type LoadBalancingAlgorithm = "round_robin" | "weighted_round_robin" | "least_connections" | "least_response_time" | "ip_hash" | "resource_based";
/**
 * Load balancer configuration
 */
export interface LoadBalancerConfig {
    algorithm: LoadBalancingAlgorithm;
    healthCheckInterval: number;
    healthCheckTimeout: number;
    maxFailures: number;
    retryInterval: number;
    connectionTimeout: number;
    enableStickySessions: boolean;
    sessionTimeout: number;
    enableMetrics: boolean;
    autoScaling: {
        enabled: boolean;
        minServers: number;
        maxServers: number;
        scaleUpThreshold: number;
        scaleDownThreshold: number;
        cooldownPeriod: number;
    };
}
/**
 * Request routing information
 */
export interface RoutingInfo {
    clientId: string;
    path: string;
    method: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body?: unknown;
}
/**
 * Load balancing metrics
 */
export interface LoadBalancingMetrics {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    requestsPerSecond: number;
    activeConnections: number;
    serverMetrics: Record<string, {
        requests: number;
        responseTime: number;
        connections: number;
        healthScore: number;
    }>;
}
/**
 * Load Balancer
 */
export declare class LoadBalancer extends EventEmitter {
    private config;
    private servers;
    private healthChecker;
    private sessionManager;
    private roundRobinIndex;
    private metrics;
    private metricsTimer;
    private sessionCleanupTimer;
    constructor(config: LoadBalancerConfig);
    /**
     * Add backend server
     */
    addServer(server: BackendServer): void;
    /**
     * Remove backend server
     */
    removeServer(serverId: string): void;
    /**
     * Start load balancer
     */
    start(): void;
    /**
     * Stop load balancer
     */
    stop(): void;
    /**
     * Select server for request
     */
    selectServer(routingInfo: RoutingInfo): BackendServer | null;
    /**
     * Round robin selection
     */
    private selectRoundRobin;
    /**
     * Weighted round robin selection
     */
    private selectWeightedRoundRobin;
    /**
     * Least connections selection
     */
    private selectLeastConnections;
    /**
     * Least response time selection
     */
    private selectLeastResponseTime;
    /**
     * IP hash selection (for session affinity)
     */
    private selectIpHash;
    /**
     * Resource-based selection (CPU/Memory aware)
     */
    private selectResourceBased;
    /**
     * Simple hash function for IP hashing
     */
    private simpleHash;
    /**
     * Extract session ID from request
     */
    private extractSessionId;
    /**
     * Record request metrics
     */
    recordRequest(serverId: string, responseTime: number, success: boolean): void;
    /**
     * Update connection count
     */
    updateConnectionCount(serverId: string, delta: number): void;
    /**
     * Start metrics collection
     */
    private startMetricsCollection;
    /**
     * Get current metrics
     */
    getMetrics(): LoadBalancingMetrics;
    /**
     * Get server list
     */
    getServers(): BackendServer[];
    /**
     * Get healthy servers
     */
    getHealthyServers(): BackendServer[];
    /**
     * Get server health status
     */
    getServerHealth(serverId: string): ServerHealth | null;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<LoadBalancerConfig>): void;
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Default load balancer configuration
 */
export declare const DEFAULT_LOAD_BALANCER_CONFIG: LoadBalancerConfig;
//# sourceMappingURL=LoadBalancer.d.ts.map