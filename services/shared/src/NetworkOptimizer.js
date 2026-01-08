"use strict";
/**
 * Network Optimizer for Titan Trading System
 *
 * Provides network optimization strategies including co-location simulation,
 * latency monitoring, and connection optimization for high-frequency trading.
 *
 * Requirements: 10.1 - Co-location and network optimization strategies
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_NETWORK_OPTIMIZER_CONFIG = exports.NetworkOptimizer = void 0;
exports.getNetworkOptimizer = getNetworkOptimizer;
exports.resetNetworkOptimizer = resetNetworkOptimizer;
const eventemitter3_1 = require("eventemitter3");
const perf_hooks_1 = require("perf_hooks");
// Simple color logging utility
const colors = {
    blue: (text) => `\x1b[34m${text}\x1b[0m`,
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    magenta: (text) => `\x1b[35m${text}\x1b[0m`,
    gray: (text) => `\x1b[90m${text}\x1b[0m`,
};
/**
 * Latency monitor for continuous measurement
 */
class LatencyMonitor extends eventemitter3_1.EventEmitter {
    endpoints;
    config;
    measurements = new Map();
    monitoringTimer = null;
    constructor(endpoints, config) {
        super();
        this.endpoints = endpoints;
        this.config = config;
    }
    /**
     * Start latency monitoring
     */
    start() {
        if (this.monitoringTimer) {
            return;
        }
        this.monitoringTimer = setInterval(() => {
            this.measureAllEndpoints();
        }, this.config.measurementInterval);
        console.log(colors.green(`📡 Latency monitoring started (${this.config.measurementInterval}ms interval)`));
    }
    /**
     * Stop latency monitoring
     */
    stop() {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }
    }
    /**
     * Measure latency to all endpoints
     */
    async measureAllEndpoints() {
        const promises = Array.from(this.endpoints.values()).map(endpoint => this.measureEndpoint(endpoint));
        await Promise.allSettled(promises);
    }
    /**
     * Measure latency to specific endpoint
     */
    async measureEndpoint(endpoint) {
        const startTime = perf_hooks_1.performance.now();
        try {
            // Simulate network measurement
            const baseLatency = endpoint.isCoLocated ? 50 : 500; // Microseconds
            const jitter = Math.random() * 100; // Random jitter
            const packetLoss = Math.random() * 0.1; // Up to 0.1% packet loss
            const measurement = {
                endpointId: endpoint.id,
                timestamp: Date.now(),
                latencyMicros: baseLatency + jitter,
                jitterMicros: jitter,
                packetLoss,
                bandwidth: endpoint.bandwidth * (1 - packetLoss / 100),
                measurementType: 'APPLICATION'
            };
            // Store measurement
            if (!this.measurements.has(endpoint.id)) {
                this.measurements.set(endpoint.id, []);
            }
            const endpointMeasurements = this.measurements.get(endpoint.id);
            endpointMeasurements.push(measurement);
            // Keep only last 1000 measurements
            if (endpointMeasurements.length > 1000) {
                endpointMeasurements.splice(0, endpointMeasurements.length - 1000);
            }
            // Check thresholds
            this.checkThresholds(measurement);
            this.emit('measurement', measurement);
        }
        catch (error) {
            console.error(colors.red(`❌ Failed to measure endpoint ${endpoint.id}:`), error);
        }
    }
    /**
     * Check measurement against thresholds
     */
    checkThresholds(measurement) {
        if (measurement.latencyMicros > this.config.latencyThreshold) {
            this.emit('latencyAlert', {
                endpointId: measurement.endpointId,
                latency: measurement.latencyMicros,
                threshold: this.config.latencyThreshold,
                severity: 'HIGH'
            });
        }
        if (measurement.jitterMicros > this.config.jitterThreshold) {
            this.emit('jitterAlert', {
                endpointId: measurement.endpointId,
                jitter: measurement.jitterMicros,
                threshold: this.config.jitterThreshold,
                severity: 'MEDIUM'
            });
        }
        if (measurement.packetLoss > this.config.packetLossThreshold) {
            this.emit('packetLossAlert', {
                endpointId: measurement.endpointId,
                packetLoss: measurement.packetLoss,
                threshold: this.config.packetLossThreshold,
                severity: 'HIGH'
            });
        }
    }
    /**
     * Get measurements for endpoint
     */
    getMeasurements(endpointId, count = 100) {
        const measurements = this.measurements.get(endpointId) || [];
        return measurements.slice(-count);
    }
    /**
     * Get average latency for endpoint
     */
    getAverageLatency(endpointId, windowMs = 60000) {
        const measurements = this.measurements.get(endpointId) || [];
        const cutoff = Date.now() - windowMs;
        const recentMeasurements = measurements.filter(m => m.timestamp > cutoff);
        if (recentMeasurements.length === 0)
            return 0;
        const sum = recentMeasurements.reduce((acc, m) => acc + m.latencyMicros, 0);
        return sum / recentMeasurements.length;
    }
}
/**
 * Path optimizer for finding optimal network routes
 */
class PathOptimizer {
    endpoints;
    config;
    paths = new Map();
    optimizationTimer = null;
    constructor(endpoints, config) {
        this.endpoints = endpoints;
        this.config = config;
    }
    /**
     * Start path optimization
     */
    start() {
        if (this.optimizationTimer) {
            return;
        }
        this.optimizationTimer = setInterval(() => {
            this.optimizePaths();
        }, this.config.pathOptimizationInterval);
        console.log(colors.green(`🛣️ Path optimization started (${this.config.pathOptimizationInterval}ms interval)`));
    }
    /**
     * Stop path optimization
     */
    stop() {
        if (this.optimizationTimer) {
            clearInterval(this.optimizationTimer);
            this.optimizationTimer = null;
        }
    }
    /**
     * Optimize all network paths
     */
    optimizePaths() {
        const endpoints = Array.from(this.endpoints.values());
        // Create paths between all endpoint pairs
        for (let i = 0; i < endpoints.length; i++) {
            for (let j = i + 1; j < endpoints.length; j++) {
                const source = endpoints[i];
                const destination = endpoints[j];
                const pathId = `${source.id}-${destination.id}`;
                const path = this.calculateOptimalPath(source, destination);
                this.paths.set(pathId, path);
            }
        }
    }
    /**
     * Calculate optimal path between two endpoints
     */
    calculateOptimalPath(source, destination) {
        // Simplified path calculation
        const distance = this.calculateDistance(source, destination);
        const baseLatency = distance * 5; // 5 microseconds per km (simplified)
        // Add co-location bonus
        let latencyMultiplier = 1;
        if (source.isCoLocated && destination.isCoLocated) {
            latencyMultiplier = 0.1; // 90% latency reduction for co-located
        }
        else if (source.isCoLocated || destination.isCoLocated) {
            latencyMultiplier = 0.5; // 50% latency reduction for one co-located
        }
        const hops = [
            {
                id: `hop-${source.id}`,
                host: source.host,
                latencyMicros: baseLatency * latencyMultiplier * 0.3,
                packetLoss: 0.01,
                isBottleneck: false
            },
            {
                id: `hop-${destination.id}`,
                host: destination.host,
                latencyMicros: baseLatency * latencyMultiplier * 0.7,
                packetLoss: 0.01,
                isBottleneck: false
            }
        ];
        const totalLatency = hops.reduce((sum, hop) => sum + hop.latencyMicros, 0);
        return {
            id: `${source.id}-${destination.id}`,
            source: source.id,
            destination: destination.id,
            hops,
            totalLatencyMicros: totalLatency,
            reliability: 99.9 - (hops.length * 0.1),
            cost: distance * 0.01,
            isOptimal: totalLatency < 1000 // Consider optimal if under 1ms
        };
    }
    /**
     * Calculate distance between endpoints (simplified)
     */
    calculateDistance(source, destination) {
        // Simplified distance calculation
        if (source.location.datacenter === destination.location.datacenter) {
            return 1; // Same datacenter
        }
        if (source.location.region === destination.location.region) {
            return 100; // Same region
        }
        return 1000; // Different regions
    }
    /**
     * Get optimal path between endpoints
     */
    getOptimalPath(sourceId, destinationId) {
        return this.paths.get(`${sourceId}-${destinationId}`) ||
            this.paths.get(`${destinationId}-${sourceId}`) ||
            null;
    }
    /**
     * Get all paths
     */
    getAllPaths() {
        return Array.from(this.paths.values());
    }
}
/**
 * Network Optimizer
 */
class NetworkOptimizer extends eventemitter3_1.EventEmitter {
    config;
    endpoints = new Map();
    latencyMonitor;
    pathOptimizer;
    coLocationConfig = null;
    metrics;
    isRunning = false;
    constructor(config = {}) {
        super();
        this.config = {
            enableLatencyMonitoring: true,
            enablePathOptimization: true,
            enableCoLocationSim: true,
            enableBandwidthOptimization: true,
            measurementInterval: 1000, // 1 second
            latencyThreshold: 1000, // 1ms
            jitterThreshold: 100, // 100 microseconds
            packetLossThreshold: 0.1, // 0.1%
            pathOptimizationInterval: 60000, // 1 minute
            enableFailover: true,
            failoverLatencyThreshold: 5000, // 5ms
            enableLoadBalancing: true,
            tcpOptimizations: {
                enableNagle: false,
                enableTcpNoDelay: true,
                socketBufferSize: 65536,
                keepAliveInterval: 30000
            },
            ...config
        };
        this.latencyMonitor = new LatencyMonitor(this.endpoints, this.config);
        this.pathOptimizer = new PathOptimizer(this.endpoints, this.config);
        this.metrics = {
            totalMeasurements: 0,
            averageLatencyMicros: 0,
            p50LatencyMicros: 0,
            p95LatencyMicros: 0,
            p99LatencyMicros: 0,
            maxLatencyMicros: 0,
            averageJitterMicros: 0,
            averagePacketLoss: 0,
            totalBandwidth: 0,
            pathOptimizations: 0,
            failovers: 0,
            lastOptimizationTime: 0
        };
        // Set up event listeners
        this.setupEventListeners();
        console.log(colors.blue('🌐 Network Optimizer initialized'));
    }
    /**
     * Start network optimization
     */
    start() {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        if (this.config.enableLatencyMonitoring) {
            this.latencyMonitor.start();
        }
        if (this.config.enablePathOptimization) {
            this.pathOptimizer.start();
        }
        console.log(colors.green('🚀 Network Optimizer started'));
    }
    /**
     * Stop network optimization
     */
    stop() {
        if (!this.isRunning) {
            return;
        }
        this.isRunning = false;
        this.latencyMonitor.stop();
        this.pathOptimizer.stop();
        console.log(colors.yellow('🛑 Network Optimizer stopped'));
    }
    /**
     * Add network endpoint
     */
    addEndpoint(endpoint) {
        this.endpoints.set(endpoint.id, endpoint);
        // Update total bandwidth
        this.metrics.totalBandwidth += endpoint.bandwidth;
        console.log(colors.green(`➕ Added endpoint: ${endpoint.name} (${endpoint.host}:${endpoint.port})`));
        if (endpoint.isCoLocated) {
            console.log(colors.cyan(`🏢 Co-located endpoint: ${endpoint.name} in ${endpoint.location.datacenter}`));
        }
    }
    /**
     * Remove network endpoint
     */
    removeEndpoint(endpointId) {
        const endpoint = this.endpoints.get(endpointId);
        if (!endpoint) {
            return false;
        }
        this.endpoints.delete(endpointId);
        this.metrics.totalBandwidth -= endpoint.bandwidth;
        console.log(colors.yellow(`➖ Removed endpoint: ${endpointId}`));
        return true;
    }
    /**
     * Configure co-location settings
     */
    configureCoLocation(config) {
        this.coLocationConfig = config;
        if (config.enabled) {
            console.log(colors.cyan(`🏢 Co-location configured: ${config.datacenter} (target: ${config.latencyTarget}μs)`));
            // Apply co-location optimizations to existing endpoints
            for (const endpoint of this.endpoints.values()) {
                if (endpoint.location.datacenter === config.datacenter) {
                    endpoint.isCoLocated = true;
                    console.log(colors.cyan(`🔧 Enabled co-location for ${endpoint.name}`));
                }
            }
        }
    }
    /**
     * Optimize TCP connection settings
     */
    optimizeTCPSettings(endpointId) {
        const endpoint = this.endpoints.get(endpointId);
        if (!endpoint) {
            return;
        }
        const { tcpOptimizations } = this.config;
        console.log(colors.cyan(`🔧 Optimizing TCP settings for ${endpoint.name}:`));
        console.log(colors.gray(`  - Nagle Algorithm: ${tcpOptimizations.enableNagle ? 'Enabled' : 'Disabled'}`));
        console.log(colors.gray(`  - TCP_NODELAY: ${tcpOptimizations.enableTcpNoDelay ? 'Enabled' : 'Disabled'}`));
        console.log(colors.gray(`  - Socket Buffer: ${tcpOptimizations.socketBufferSize} bytes`));
        console.log(colors.gray(`  - Keep-Alive: ${tcpOptimizations.keepAliveInterval}ms`));
        // In a real implementation, these would be applied to actual socket connections
    }
    /**
     * Get optimal endpoint for connection
     */
    getOptimalEndpoint(criteria = {}) {
        let candidates = Array.from(this.endpoints.values());
        // Apply filters
        if (criteria.requireCoLocation) {
            candidates = candidates.filter(ep => ep.isCoLocated);
        }
        if (criteria.minBandwidth) {
            candidates = candidates.filter(ep => ep.bandwidth >= criteria.minBandwidth);
        }
        if (criteria.preferredRegion) {
            const preferred = candidates.filter(ep => ep.location.region === criteria.preferredRegion);
            if (preferred.length > 0) {
                candidates = preferred;
            }
        }
        if (candidates.length === 0) {
            return null;
        }
        // Sort by priority and latency
        candidates.sort((a, b) => {
            const latencyA = this.latencyMonitor.getAverageLatency(a.id);
            const latencyB = this.latencyMonitor.getAverageLatency(b.id);
            // First by priority, then by latency
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            return latencyA - latencyB;
        });
        const optimal = candidates[0];
        // Check latency criteria
        if (criteria.maxLatency) {
            const avgLatency = this.latencyMonitor.getAverageLatency(optimal.id);
            if (avgLatency > criteria.maxLatency) {
                return null;
            }
        }
        return optimal;
    }
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.latencyMonitor.on('measurement', (measurement) => {
            this.updateMetrics(measurement);
        });
        this.latencyMonitor.on('latencyAlert', (alert) => {
            console.warn(colors.yellow(`⚠️ High latency alert: ${alert.endpointId} (${alert.latency.toFixed(2)}μs > ${alert.threshold}μs)`));
            if (this.config.enableFailover && alert.latency > this.config.failoverLatencyThreshold) {
                this.triggerFailover(alert.endpointId);
            }
            this.emit('latencyAlert', alert);
        });
        this.latencyMonitor.on('packetLossAlert', (alert) => {
            console.warn(colors.red(`⚠️ Packet loss alert: ${alert.endpointId} (${alert.packetLoss.toFixed(2)}% > ${alert.threshold}%)`));
            this.emit('packetLossAlert', alert);
        });
    }
    /**
     * Update performance metrics
     */
    updateMetrics(measurement) {
        this.metrics.totalMeasurements++;
        // Update averages (simple moving average)
        this.metrics.averageLatencyMicros = (this.metrics.averageLatencyMicros + measurement.latencyMicros) / 2;
        this.metrics.averageJitterMicros = (this.metrics.averageJitterMicros + measurement.jitterMicros) / 2;
        this.metrics.averagePacketLoss = (this.metrics.averagePacketLoss + measurement.packetLoss) / 2;
        // Update max latency
        this.metrics.maxLatencyMicros = Math.max(this.metrics.maxLatencyMicros, measurement.latencyMicros);
        // Calculate percentiles (simplified - would need proper implementation)
        this.metrics.p50LatencyMicros = this.metrics.averageLatencyMicros * 0.9;
        this.metrics.p95LatencyMicros = this.metrics.averageLatencyMicros * 1.5;
        this.metrics.p99LatencyMicros = this.metrics.averageLatencyMicros * 2.0;
    }
    /**
     * Trigger failover for problematic endpoint
     */
    triggerFailover(endpointId) {
        const endpoint = this.endpoints.get(endpointId);
        if (!endpoint) {
            return;
        }
        // Find alternative endpoint
        const alternative = this.getOptimalEndpoint({
            preferredRegion: endpoint.location.region,
            requireCoLocation: endpoint.isCoLocated
        });
        if (alternative && alternative.id !== endpointId) {
            console.log(colors.magenta(`🔄 Triggering failover: ${endpointId} → ${alternative.id}`));
            this.metrics.failovers++;
            this.emit('failover', {
                fromEndpoint: endpointId,
                toEndpoint: alternative.id,
                reason: 'High latency detected',
                timestamp: Date.now()
            });
        }
    }
    /**
     * Get network performance metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Get endpoint statistics
     */
    getEndpointStats() {
        const stats = {};
        for (const endpoint of this.endpoints.values()) {
            const avgLatency = this.latencyMonitor.getAverageLatency(endpoint.id);
            const measurements = this.latencyMonitor.getMeasurements(endpoint.id, 100);
            stats[endpoint.id] = {
                averageLatency: avgLatency,
                measurements: measurements.length,
                isOptimal: avgLatency < this.config.latencyThreshold
            };
        }
        return stats;
    }
    /**
     * Get network topology
     */
    getNetworkTopology() {
        return {
            endpoints: Array.from(this.endpoints.values()),
            paths: this.pathOptimizer.getAllPaths(),
            coLocationConfig: this.coLocationConfig
        };
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        console.log(colors.blue('⚙️ Network optimizer configuration updated'));
    }
    /**
     * Shutdown and cleanup
     */
    shutdown() {
        console.log(colors.blue('🛑 Shutting down Network Optimizer...'));
        this.stop();
        this.endpoints.clear();
        this.removeAllListeners();
    }
}
exports.NetworkOptimizer = NetworkOptimizer;
/**
 * Default network optimizer configuration
 */
exports.DEFAULT_NETWORK_OPTIMIZER_CONFIG = {
    enableLatencyMonitoring: true,
    enablePathOptimization: true,
    enableCoLocationSim: true,
    enableBandwidthOptimization: true,
    measurementInterval: 1000, // 1 second
    latencyThreshold: 1000, // 1ms
    jitterThreshold: 100, // 100 microseconds
    packetLossThreshold: 0.1, // 0.1%
    pathOptimizationInterval: 60000, // 1 minute
    enableFailover: true,
    failoverLatencyThreshold: 5000, // 5ms
    enableLoadBalancing: true,
    tcpOptimizations: {
        enableNagle: false,
        enableTcpNoDelay: true,
        socketBufferSize: 65536,
        keepAliveInterval: 30000
    }
};
/**
 * Singleton Network Optimizer instance
 */
let networkOptimizerInstance = null;
/**
 * Get or create the global Network Optimizer instance
 */
function getNetworkOptimizer(config) {
    if (!networkOptimizerInstance) {
        networkOptimizerInstance = new NetworkOptimizer(config);
    }
    return networkOptimizerInstance;
}
/**
 * Reset the global Network Optimizer instance (for testing)
 */
function resetNetworkOptimizer() {
    if (networkOptimizerInstance) {
        networkOptimizerInstance.shutdown();
    }
    networkOptimizerInstance = null;
}
//# sourceMappingURL=NetworkOptimizer.js.map