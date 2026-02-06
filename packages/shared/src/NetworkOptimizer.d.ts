/**
 * Network Optimizer for Titan Trading System
 *
 * Provides network optimization strategies including co-location simulation,
 * latency monitoring, and connection optimization for high-frequency trading.
 *
 * Requirements: 10.1 - Co-location and network optimization strategies
 */
import { EventEmitter } from 'eventemitter3';
/**
 * Network endpoint configuration
 */
export interface NetworkEndpoint {
    id: string;
    name: string;
    host: string;
    port: number;
    protocol: 'TCP' | 'UDP' | 'WebSocket' | 'HTTP' | 'HTTPS';
    location: {
        datacenter: string;
        region: string;
        country: string;
        coordinates?: {
            lat: number;
            lon: number;
        };
    };
    isCoLocated: boolean;
    isDedicated: boolean;
    bandwidth: number;
    priority: number;
}
/**
 * Latency measurement
 */
export interface LatencyMeasurement {
    endpointId: string;
    timestamp: number;
    latencyMicros: number;
    jitterMicros: number;
    packetLoss: number;
    bandwidth: number;
    measurementType: 'PING' | 'TCP_CONNECT' | 'APPLICATION' | 'MARKET_DATA';
}
/**
 * Network path optimization
 */
export interface NetworkPath {
    id: string;
    source: string;
    destination: string;
    hops: NetworkHop[];
    totalLatencyMicros: number;
    reliability: number;
    cost: number;
    isOptimal: boolean;
}
/**
 * Network hop information
 */
export interface NetworkHop {
    id: string;
    host: string;
    latencyMicros: number;
    packetLoss: number;
    isBottleneck: boolean;
}
/**
 * Co-location configuration
 */
export interface CoLocationConfig {
    enabled: boolean;
    datacenter: string;
    rack?: string;
    crossConnect: boolean;
    dedicatedLines: boolean;
    redundancy: 'NONE' | 'DUAL' | 'TRIPLE';
    latencyTarget: number;
    bandwidthTarget: number;
}
/**
 * Network optimization configuration
 */
export interface NetworkOptimizerConfig {
    enableLatencyMonitoring: boolean;
    enablePathOptimization: boolean;
    enableCoLocationSim: boolean;
    enableBandwidthOptimization: boolean;
    measurementInterval: number;
    latencyThreshold: number;
    jitterThreshold: number;
    packetLossThreshold: number;
    pathOptimizationInterval: number;
    enableFailover: boolean;
    failoverLatencyThreshold: number;
    enableLoadBalancing: boolean;
    tcpOptimizations: {
        enableNagle: boolean;
        enableTcpNoDelay: boolean;
        socketBufferSize: number;
        keepAliveInterval: number;
    };
}
/**
 * Network performance metrics
 */
export interface NetworkMetrics {
    totalMeasurements: number;
    averageLatencyMicros: number;
    p50LatencyMicros: number;
    p95LatencyMicros: number;
    p99LatencyMicros: number;
    maxLatencyMicros: number;
    averageJitterMicros: number;
    averagePacketLoss: number;
    totalBandwidth: number;
    pathOptimizations: number;
    failovers: number;
    lastOptimizationTime: number;
}
/**
 * Network Optimizer
 */
export declare class NetworkOptimizer extends EventEmitter {
    private config;
    private endpoints;
    private latencyMonitor;
    private pathOptimizer;
    private coLocationConfig;
    private metrics;
    private isRunning;
    constructor(config?: Partial<NetworkOptimizerConfig>);
    /**
     * Start network optimization
     */
    start(): void;
    /**
     * Stop network optimization
     */
    stop(): void;
    /**
     * Add network endpoint
     */
    addEndpoint(endpoint: NetworkEndpoint): void;
    /**
     * Remove network endpoint
     */
    removeEndpoint(endpointId: string): boolean;
    /**
     * Configure co-location settings
     */
    configureCoLocation(config: CoLocationConfig): void;
    /**
     * Optimize TCP connection settings
     */
    optimizeTCPSettings(endpointId: string): void;
    /**
     * Get optimal endpoint for connection
     */
    getOptimalEndpoint(criteria?: {
        maxLatency?: number;
        minBandwidth?: number;
        requireCoLocation?: boolean;
        preferredRegion?: string;
    }): NetworkEndpoint | null;
    /**
     * Setup event listeners
     */
    private setupEventListeners;
    /**
     * Update performance metrics
     */
    private updateMetrics;
    /**
     * Trigger failover for problematic endpoint
     */
    private triggerFailover;
    /**
     * Get network performance metrics
     */
    getMetrics(): NetworkMetrics;
    /**
     * Get endpoint statistics
     */
    getEndpointStats(): Record<string, {
        averageLatency: number;
        measurements: number;
        isOptimal: boolean;
    }>;
    /**
     * Get network topology
     */
    getNetworkTopology(): {
        endpoints: NetworkEndpoint[];
        paths: NetworkPath[];
        coLocationConfig: CoLocationConfig | null;
    };
    /**
     * Update configuration
     */
    updateConfig(config: Partial<NetworkOptimizerConfig>): void;
    /**
     * Shutdown and cleanup
     */
    shutdown(): void;
}
/**
 * Default network optimizer configuration
 */
export declare const DEFAULT_NETWORK_OPTIMIZER_CONFIG: NetworkOptimizerConfig;
/**
 * Get or create the global Network Optimizer instance
 */
export declare function getNetworkOptimizer(config?: Partial<NetworkOptimizerConfig>): NetworkOptimizer;
/**
 * Reset the global Network Optimizer instance (for testing)
 */
export declare function resetNetworkOptimizer(): void;
//# sourceMappingURL=NetworkOptimizer.d.ts.map