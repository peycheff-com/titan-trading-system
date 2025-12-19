/**
 * Shared Infrastructure Components for Titan Trading System
 * 
 * This module exports all shared infrastructure components that can be used
 * across different Titan services for centralized management.
 */

// WebSocket Management
export {
  WebSocketManager,
  getWebSocketManager,
  resetWebSocketManager,
  type WebSocketConfig,
  type WebSocketMessage,
  type SubscriptionCallback,
  type ConnectionStatus
} from './WebSocketManager';

// Execution Service
export {
  ExecutionService,
  getExecutionService,
  resetExecutionService,
  type OrderParams,
  type OrderResult,
  type OrderStatus,
  type ExchangeConfig
} from './ExecutionService';

// Telemetry Service
export {
  TelemetryService,
  getTelemetryService,
  resetTelemetryService,
  type LogLevel,
  type LogEntry,
  type SignalData,
  type ExecutionData,
  type MetricData,
  type TelemetryConfig
} from './TelemetryService';

// Configuration Management
export {
  ConfigManager,
  getConfigManager,
  resetConfigManager,
  type ConfigLevel,
  type BrainConfig,
  type PhaseConfig,
  type ServiceConfig,
  type ConfigChangeEvent
} from './ConfigManager';

// Configuration Schema and Validation
export {
  ConfigValidator,
  type Environment,
  type ValidationResult,
  type ExchangeConfig as SchemaExchangeConfig,
  type InfrastructureConfig,
  type DeploymentConfig
} from './config/ConfigSchema';

// Hierarchical Configuration Loading
export {
  HierarchicalConfigLoader,
  createConfigLoader,
  type ConfigLoadResult,
  type ConfigHierarchyOptions,
  type ConfigSource
} from './config/HierarchicalConfigLoader';

// Configuration Encryption
export {
  ConfigEncryption,
  getConfigEncryption,
  resetConfigEncryption,
  type EncryptedData,
  type EncryptionResult,
  type DecryptionResult
} from './config/ConfigEncryption';

// Hot-Reload Configuration Management
export {
  HotReloadConfigManager,
  createHotReloadConfigManager,
  type HotReloadEvent,
  type ChangeValidationResult,
  type HotReloadOptions
} from './config/HotReloadConfigManager';

// Configuration Version History
export {
  ConfigVersionHistory,
  getConfigVersionHistory,
  resetConfigVersionHistory,
  type ConfigVersion,
  type VersionHistoryMetadata,
  type VersionComparison,
  type RollbackResult
} from './config/ConfigVersionHistory';

// Resource Optimization
export {
  ResourceOptimizer,
  getResourceOptimizer,
  resetResourceOptimizer,
  type MemoryStats,
  type CPUStats,
  type ResourceThresholds,
  type BenchmarkResult
} from './ResourceOptimizer';

// Performance Monitoring
export {
  PerformanceMonitor,
  getPerformanceMonitor,
  resetPerformanceMonitor,
  type PerformanceMetrics,
  type PerformanceAlert,
  type ScalingRecommendation,
  type PerformanceMonitorConfig
} from './PerformanceMonitor';

// Load Balancing
export {
  LoadBalancer,
  DEFAULT_LOAD_BALANCER_CONFIG,
  type BackendServer,
  type ServerHealth,
  type LoadBalancingAlgorithm,
  type LoadBalancerConfig,
  type RoutingInfo,
  type LoadBalancingMetrics
} from './LoadBalancer';

// Service Discovery
export {
  ServiceDiscovery,
  getServiceDiscovery,
  resetServiceDiscovery,
  DEFAULT_SERVICE_DISCOVERY_CONFIG,
  type ServiceInstance,
  type ServiceDiscoveryConfig,
  type ServiceQuery,
  type ServiceEvent
} from './ServiceDiscovery';

// Distributed State Management
export {
  DistributedStateManager,
  getDistributedStateManager,
  resetDistributedStateManager,
  DEFAULT_DISTRIBUTED_STATE_CONFIG,
  type StateEntry,
  type StateOperation,
  type ConflictResolutionStrategy,
  type ConsistencyLevel,
  type DistributedStateConfig,
  type NodeInfo
} from './DistributedStateManager';

// High-Frequency Trading
export {
  HighFrequencyProcessor,
  getHighFrequencyProcessor,
  resetHighFrequencyProcessor,
  DEFAULT_HF_PROCESSOR_CONFIG,
  type HFSignal,
  type ProcessingStage,
  type HFProcessorConfig,
  type HFTMetrics
} from './HighFrequencyProcessor';

// Advanced Order Routing
export {
  AdvancedOrderRouter,
  getAdvancedOrderRouter,
  resetAdvancedOrderRouter,
  DEFAULT_ORDER_ROUTER_CONFIG,
  type TradingVenue,
  type RoutingRequest,
  type RoutingDecision,
  type RouteAllocation,
  type MarketData,
  type ExecutionAlgorithm,
  type OrderRouterConfig
} from './AdvancedOrderRouter';

// Network Optimization
export {
  NetworkOptimizer,
  getNetworkOptimizer,
  resetNetworkOptimizer,
  DEFAULT_NETWORK_OPTIMIZER_CONFIG,
  type NetworkEndpoint,
  type LatencyMeasurement,
  type NetworkPath,
  type CoLocationConfig,
  type NetworkOptimizerConfig,
  type NetworkMetrics
} from './NetworkOptimizer';