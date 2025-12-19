/**
 * Shared Infrastructure Components for Titan Trading System
 *
 * This module exports all shared infrastructure components that can be used
 * across different Titan services for centralized management.
 */
export { WebSocketManager, getWebSocketManager, resetWebSocketManager, type WebSocketConfig, type WebSocketMessage, type SubscriptionCallback, type ConnectionStatus } from './WebSocketManager';
export { ExecutionService, getExecutionService, resetExecutionService, type OrderParams, type OrderResult, type OrderStatus, type ExchangeConfig } from './ExecutionService';
export { TelemetryService, getTelemetryService, resetTelemetryService, type LogLevel, type LogEntry, type SignalData, type ExecutionData, type MetricData, type TelemetryConfig } from './TelemetryService';
export { ConfigManager, type ConfigLevel, type BrainConfig, type PhaseConfig, type ServiceConfig, type ValidationResult } from './ConfigManager';
export { ResourceOptimizer, getResourceOptimizer, resetResourceOptimizer, type MemoryStats, type CPUStats, type ResourceThresholds, type BenchmarkResult } from './ResourceOptimizer';
export { PerformanceMonitor, getPerformanceMonitor, resetPerformanceMonitor, type PerformanceMetrics, type PerformanceAlert, type ScalingRecommendation, type PerformanceMonitorConfig } from './PerformanceMonitor';
export { LoadBalancer, DEFAULT_LOAD_BALANCER_CONFIG, type BackendServer, type ServerHealth, type LoadBalancingAlgorithm, type LoadBalancerConfig, type RoutingInfo, type LoadBalancingMetrics } from './LoadBalancer';
export { ServiceDiscovery, getServiceDiscovery, resetServiceDiscovery, DEFAULT_SERVICE_DISCOVERY_CONFIG, type ServiceInstance, type ServiceDiscoveryConfig, type ServiceQuery, type ServiceEvent } from './ServiceDiscovery';
export { DistributedStateManager, getDistributedStateManager, resetDistributedStateManager, DEFAULT_DISTRIBUTED_STATE_CONFIG, type StateEntry, type StateOperation, type ConflictResolutionStrategy, type ConsistencyLevel, type DistributedStateConfig, type NodeInfo } from './DistributedStateManager';
//# sourceMappingURL=index.d.ts.map