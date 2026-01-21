/**
 * Shared Infrastructure Components for Titan Trading System
 *
 * This module exports all shared infrastructure components that can be used
 * across different Titan services for centralized management.
 */

import { loadSecretsFromFiles } from "./config/loadSecrets";

// Ensure *_FILE secrets are promoted to env early in service startup.
loadSecretsFromFiles();

// WebSocket Management
export {
  type ConnectionStatus,
  getWebSocketManager,
  resetWebSocketManager,
  type SubscriptionCallback,
  type WebSocketConfig,
  WebSocketManager,
  type WebSocketMessage,
} from "./WebSocketManager";

// Execution Service
export {
  type ExchangeConfig,
  ExecutionService,
  getExecutionService,
  type OrderParams,
  type OrderResult,
  type OrderStatus,
  resetExecutionService,
} from "./ExecutionService";

// Telemetry Service
export {
  type ExecutionData,
  getTelemetryService,
  type LogEntry,
  type LogLevel,
  type MetricData,
  resetTelemetryService,
  type SignalData,
  type TelemetryConfig,
  TelemetryService,
} from "./TelemetryService";

// Configuration Management
export {
  type BrainConfig,
  type ConfigChangeEvent,
  type ConfigLevel,
  ConfigManager,
  getConfigManager,
  type PhaseConfig,
  resetConfigManager,
  type ServiceConfig,
} from "./ConfigManager";

// Configuration Schema and Validation
export {
  BrainConfigSchema,
  ConfigValidator,
  type DeploymentConfig,
  type Environment,
  type ExchangeConfig as SchemaExchangeConfig,
  type InfrastructureConfig,
  PhaseConfigBaseSchema,
  PhaseConfigSchema,
  type ValidationResult,
} from "./config/ConfigSchema";

// Secrets (Docker secrets / Vault file mounts)
export {
  loadSecretsFromFiles,
  type LoadSecretsOptions,
} from "./config/loadSecrets";

// Hierarchical Configuration Loading
export {
  type ConfigHierarchyOptions,
  type ConfigLoadResult,
  type ConfigSource,
  createConfigLoader,
  HierarchicalConfigLoader,
} from "./config/HierarchicalConfigLoader";

// Configuration Encryption
export {
  ConfigEncryption,
  type DecryptionResult,
  type EncryptedData,
  type EncryptionResult,
  getConfigEncryption,
  resetConfigEncryption,
} from "./config/ConfigEncryption";

// Hot-Reload Configuration Management
export {
  type ChangeValidationResult,
  createHotReloadConfigManager,
  HotReloadConfigManager,
  type HotReloadEvent,
  type HotReloadOptions,
} from "./config/HotReloadConfigManager";

// Configuration Version History
export {
  type ConfigVersion,
  ConfigVersionHistory,
  getConfigVersionHistory,
  resetConfigVersionHistory,
  type RollbackResult,
  type VersionComparison,
  type VersionHistoryMetadata,
} from "./config/ConfigVersionHistory";

// Resource Optimization
export {
  type BenchmarkResult,
  type CPUStats,
  getResourceOptimizer,
  type MemoryStats,
  resetResourceOptimizer,
  ResourceOptimizer,
  type ResourceThresholds,
} from "./ResourceOptimizer";

// Performance Monitoring
export {
  getPerformanceMonitor,
  type PerformanceAlert,
  type PerformanceMetrics,
  PerformanceMonitor,
  type PerformanceMonitorConfig,
  resetPerformanceMonitor,
  type ScalingRecommendation,
} from "./PerformanceMonitor";

// Load Balancing
export {
  type BackendServer,
  DEFAULT_LOAD_BALANCER_CONFIG,
  LoadBalancer,
  type LoadBalancerConfig,
  type LoadBalancingAlgorithm,
  type LoadBalancingMetrics,
  type RoutingInfo,
  type ServerHealth,
} from "./LoadBalancer";

// Service Discovery
export {
  DEFAULT_SERVICE_DISCOVERY_CONFIG,
  getServiceDiscovery,
  resetServiceDiscovery,
  ServiceDiscovery,
  type ServiceDiscoveryConfig,
  type ServiceEvent,
  type ServiceInstance,
  type ServiceQuery,
} from "./ServiceDiscovery";

// Distributed State Management
export {
  type ConflictResolutionStrategy,
  type ConsistencyLevel,
  DEFAULT_DISTRIBUTED_STATE_CONFIG,
  type DistributedStateConfig,
  DistributedStateManager,
  getDistributedStateManager,
  type NodeInfo,
  resetDistributedStateManager,
  type StateEntry,
  type StateOperation,
} from "./DistributedStateManager";

// High-Frequency Trading
export {
  DEFAULT_HF_PROCESSOR_CONFIG,
  getHighFrequencyProcessor,
  type HFProcessorConfig,
  type HFSignal,
  type HFTMetrics,
  HighFrequencyProcessor,
  type ProcessingStage,
  resetHighFrequencyProcessor,
} from "./HighFrequencyProcessor";

// Advanced Order Routing
export {
  AdvancedOrderRouter,
  DEFAULT_ORDER_ROUTER_CONFIG,
  type ExecutionAlgorithm,
  getAdvancedOrderRouter,
  type MarketData,
  type OrderRouterConfig,
  resetAdvancedOrderRouter,
  type RouteAllocation,
  type RoutingDecision,
  type RoutingRequest,
  type TradingVenue,
} from "./AdvancedOrderRouter";

// Network Optimization
export {
  type CoLocationConfig,
  DEFAULT_NETWORK_OPTIMIZER_CONFIG,
  getNetworkOptimizer,
  type LatencyMeasurement,
  type NetworkEndpoint,
  type NetworkMetrics,
  NetworkOptimizer,
  type NetworkOptimizerConfig,
  type NetworkPath,
  resetNetworkOptimizer,
} from "./NetworkOptimizer";

// Messaging
export {
  getNatsClient,
  NatsClient,
  type NatsConfig,
  TitanSubject,
} from "./messaging/NatsClient.js";

export { ExecutionClient } from "./messaging/ExecutionClient.js";

// Intent schema (NATS contract)
export {
  createIntentMessage,
  // New Envelope Exports
  type IntentMessage,
  IntentPayloadSchemaV1,
  type IntentPayloadV1,
  IntentSchemaV1,
  IntentStatusEnum,
  IntentTypeEnum,
  validateIntentPayload,
} from "./schemas/intentSchema.js";

// Canonical Envelopes
export {
  createEnvelope,
  type Envelope,
  EnvelopeSchema,
} from "./schemas/envelope.js";

export {
  type BaseCommand,
  BaseCommandSchema,
  type BaseEvent,
} from "./schemas/base.js";

// IPC (Fast Path Communication)
export {
  type AbortResponse,
  type ConfirmResponse,
  ConnectionState,
  FastPathClient,
  type FillReport,
  type IntentSignal,
  type IPCClientConfig,
  type IPCMetrics,
  type PrepareResponse,
  RegimeState,
  type SignalSource,
} from "./ipc/index.js";

// Logger
import {
  LogEntry,
  Logger,
  LoggerConfig,
  LogLevel,
  PerformanceTimer,
  TradeLogEntry,
} from "./logger/Logger";

export {
  LogEntry as SharedLogEntry,
  Logger,
  LoggerConfig,
  PerformanceTimer,
  TradeLogEntry,
};

export { RiskState } from "./types/RiskState";
export * from "./types/budget";
export * from "./types/Phase";

export const SharedLogLevel = LogLevel;
export type SharedLogLevel = LogLevel;

// Time Utilities
export * from "./utils/time/Clock";
