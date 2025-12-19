/**
 * Network Optimizer for Titan Trading System
 * 
 * Provides network optimization strategies including co-location simulation,
 * latency monitoring, and connection optimization for high-frequency trading.
 * 
 * Requirements: 10.1 - Co-location and network optimization strategies
 */

import { EventEmitter } from 'eventemitter3';
import { performance } from 'perf_hooks';

// Simple color logging utility
const colors = {
  blue: (text: string) => `\x1b[34m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  magenta: (text: string) => `\x1b[35m${text}\x1b[0m`,
  gray: (text: string) => `\x1b[90m${text}\x1b[0m`,
};

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
    coordinates?: { lat: number; lon: number };
  };
  isCoLocated: boolean;
  isDedicated: boolean;
  bandwidth: number; // Mbps
  priority: number; // 1-10, higher is better
}

/**
 * Latency measurement
 */
export interface LatencyMeasurement {
  endpointId: string;
  timestamp: number;
  latencyMicros: number;
  jitterMicros: number;
  packetLoss: number; // Percentage
  bandwidth: number; // Mbps
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
  reliability: number; // 0-100
  cost: number; // Relative cost
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
  latencyTarget: number; // Microseconds
  bandwidthTarget: number; // Mbps
}

/**
 * Network optimization configuration
 */
export interface NetworkOptimizerConfig {
  enableLatencyMonitoring: boolean;
  enablePathOptimization: boolean;
  enableCoLocationSim: boolean;
  enableBandwidthOptimization: boolean;
  measurementInterval: number; // milliseconds
  latencyThreshold: number; // microseconds
  jitterThreshold: number; // microseconds
  packetLossThreshold: number; // percentage
  pathOptimizationInterval: number; // milliseconds
  enableFailover: boolean;
  failoverLatencyThreshold: number; // microseconds
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
 * Latency monitor for continuous measurement
 */
class LatencyMonitor extends EventEmitter {
  private measurements = new Map<string, LatencyMeasurement[]>();
  private monitoringTimer: NodeJS.Timeout | null = null;
  
  constructor(
    private endpoints: Map<string, NetworkEndpoint>,
    private config: NetworkOptimizerConfig
  ) {
    super();
  }
  
  /**
   * Start latency monitoring
   */
  start(): void {
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
  stop(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }
  
  /**
   * Measure latency to all endpoints
   */
  private async measureAllEndpoints(): Promise<void> {
    const promises = Array.from(this.endpoints.values()).map(endpoint => 
      this.measureEndpoint(endpoint)
    );
    
    await Promise.allSettled(promises);
  }
  
  /**
   * Measure latency to specific endpoint
   */
  private async measureEndpoint(endpoint: NetworkEndpoint): Promise<void> {
    const startTime = performance.now();
    
    try {
      // Simulate network measurement
      const baseLatency = endpoint.isCoLocated ? 50 : 500; // Microseconds
      const jitter = Math.random() * 100; // Random jitter
      const packetLoss = Math.random() * 0.1; // Up to 0.1% packet loss
      
      const measurement: LatencyMeasurement = {
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
      
      const endpointMeasurements = this.measurements.get(endpoint.id)!;
      endpointMeasurements.push(measurement);
      
      // Keep only last 1000 measurements
      if (endpointMeasurements.length > 1000) {
        endpointMeasurements.splice(0, endpointMeasurements.length - 1000);
      }
      
      // Check thresholds
      this.checkThresholds(measurement);
      
      this.emit('measurement', measurement);
      
    } catch (error) {
      console.error(colors.red(`❌ Failed to measure endpoint ${endpoint.id}:`), error);
    }
  }
  
  /**
   * Check measurement against thresholds
   */
  private checkThresholds(measurement: LatencyMeasurement): void {
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
  getMeasurements(endpointId: string, count: number = 100): LatencyMeasurement[] {
    const measurements = this.measurements.get(endpointId) || [];
    return measurements.slice(-count);
  }
  
  /**
   * Get average latency for endpoint
   */
  getAverageLatency(endpointId: string, windowMs: number = 60000): number {
    const measurements = this.measurements.get(endpointId) || [];
    const cutoff = Date.now() - windowMs;
    
    const recentMeasurements = measurements.filter(m => m.timestamp > cutoff);
    if (recentMeasurements.length === 0) return 0;
    
    const sum = recentMeasurements.reduce((acc, m) => acc + m.latencyMicros, 0);
    return sum / recentMeasurements.length;
  }
}

/**
 * Path optimizer for finding optimal network routes
 */
class PathOptimizer {
  private paths = new Map<string, NetworkPath>();
  private optimizationTimer: NodeJS.Timeout | null = null;
  
  constructor(
    private endpoints: Map<string, NetworkEndpoint>,
    private config: NetworkOptimizerConfig
  ) {}
  
  /**
   * Start path optimization
   */
  start(): void {
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
  stop(): void {
    if (this.optimizationTimer) {
      clearInterval(this.optimizationTimer);
      this.optimizationTimer = null;
    }
  }
  
  /**
   * Optimize all network paths
   */
  private optimizePaths(): void {
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
  private calculateOptimalPath(source: NetworkEndpoint, destination: NetworkEndpoint): NetworkPath {
    // Simplified path calculation
    const distance = this.calculateDistance(source, destination);
    const baseLatency = distance * 5; // 5 microseconds per km (simplified)
    
    // Add co-location bonus
    let latencyMultiplier = 1;
    if (source.isCoLocated && destination.isCoLocated) {
      latencyMultiplier = 0.1; // 90% latency reduction for co-located
    } else if (source.isCoLocated || destination.isCoLocated) {
      latencyMultiplier = 0.5; // 50% latency reduction for one co-located
    }
    
    const hops: NetworkHop[] = [
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
  private calculateDistance(source: NetworkEndpoint, destination: NetworkEndpoint): number {
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
  getOptimalPath(sourceId: string, destinationId: string): NetworkPath | null {
    return this.paths.get(`${sourceId}-${destinationId}`) || 
           this.paths.get(`${destinationId}-${sourceId}`) || 
           null;
  }
  
  /**
   * Get all paths
   */
  getAllPaths(): NetworkPath[] {
    return Array.from(this.paths.values());
  }
}

/**
 * Network Optimizer
 */
export class NetworkOptimizer extends EventEmitter {
  private config: NetworkOptimizerConfig;
  private endpoints = new Map<string, NetworkEndpoint>();
  private latencyMonitor: LatencyMonitor;
  private pathOptimizer: PathOptimizer;
  private coLocationConfig: CoLocationConfig | null = null;
  private metrics: NetworkMetrics;
  private isRunning = false;
  
  constructor(config: Partial<NetworkOptimizerConfig> = {}) {
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
  start(): void {
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
  stop(): void {
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
  addEndpoint(endpoint: NetworkEndpoint): void {
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
  removeEndpoint(endpointId: string): boolean {
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
  configureCoLocation(config: CoLocationConfig): void {
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
  optimizeTCPSettings(endpointId: string): void {
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
  getOptimalEndpoint(criteria: {
    maxLatency?: number;
    minBandwidth?: number;
    requireCoLocation?: boolean;
    preferredRegion?: string;
  } = {}): NetworkEndpoint | null {
    let candidates = Array.from(this.endpoints.values());
    
    // Apply filters
    if (criteria.requireCoLocation) {
      candidates = candidates.filter(ep => ep.isCoLocated);
    }
    
    if (criteria.minBandwidth) {
      candidates = candidates.filter(ep => ep.bandwidth >= criteria.minBandwidth!);
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
  private setupEventListeners(): void {
    this.latencyMonitor.on('measurement', (measurement: LatencyMeasurement) => {
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
  private updateMetrics(measurement: LatencyMeasurement): void {
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
  private triggerFailover(endpointId: string): void {
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
  getMetrics(): NetworkMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get endpoint statistics
   */
  getEndpointStats(): Record<string, {
    averageLatency: number;
    measurements: number;
    isOptimal: boolean;
  }> {
    const stats: Record<string, any> = {};
    
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
  getNetworkTopology(): {
    endpoints: NetworkEndpoint[];
    paths: NetworkPath[];
    coLocationConfig: CoLocationConfig | null;
  } {
    return {
      endpoints: Array.from(this.endpoints.values()),
      paths: this.pathOptimizer.getAllPaths(),
      coLocationConfig: this.coLocationConfig
    };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<NetworkOptimizerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log(colors.blue('⚙️ Network optimizer configuration updated'));
  }
  
  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    console.log(colors.blue('🛑 Shutting down Network Optimizer...'));
    this.stop();
    this.endpoints.clear();
    this.removeAllListeners();
  }
}

/**
 * Default network optimizer configuration
 */
export const DEFAULT_NETWORK_OPTIMIZER_CONFIG: NetworkOptimizerConfig = {
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
let networkOptimizerInstance: NetworkOptimizer | null = null;

/**
 * Get or create the global Network Optimizer instance
 */
export function getNetworkOptimizer(config?: Partial<NetworkOptimizerConfig>): NetworkOptimizer {
  if (!networkOptimizerInstance) {
    networkOptimizerInstance = new NetworkOptimizer(config);
  }
  return networkOptimizerInstance;
}

/**
 * Reset the global Network Optimizer instance (for testing)
 */
export function resetNetworkOptimizer(): void {
  if (networkOptimizerInstance) {
    networkOptimizerInstance.shutdown();
  }
  networkOptimizerInstance = null;
}