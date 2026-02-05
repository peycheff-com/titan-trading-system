/**
 * Shared Infrastructure Components for Titan Trading System
 *
 * This module exports all shared infrastructure components that can be used
 * across different Titan services for centralized management.
 */

import { loadSecretsFromFiles } from "./config/loadSecrets.js";

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
} from "./WebSocketManager.js";

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
} from "./TelemetryService.js";

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
} from "./ConfigManager.js";

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
} from "./config/ConfigSchema.js";

// Secrets (Docker secrets / Vault file mounts)
export {
  loadSecretsFromFiles,
  type LoadSecretsOptions,
} from "./config/loadSecrets.js";

// Hierarchical Configuration Loading
export {
  type ConfigHierarchyOptions,
  type ConfigLoadResult,
  type ConfigSource,
  createConfigLoader,
  HierarchicalConfigLoader,
} from "./config/HierarchicalConfigLoader.js";

// Configuration Encryption
export {
  ConfigEncryption,
  type DecryptionResult,
  type EncryptedData,
  type EncryptionResult,
  getConfigEncryption,
  resetConfigEncryption,
} from "./config/ConfigEncryption.js";

// Hot-Reload Configuration Management
export {
  type ChangeValidationResult,
  createHotReloadConfigManager,
  HotReloadConfigManager,
  type HotReloadEvent,
  type HotReloadOptions,
} from "./config/HotReloadConfigManager.js";

// Configuration Version History
export {
  type ConfigVersion,
  ConfigVersionHistory,
  getConfigVersionHistory,
  resetConfigVersionHistory,
  type RollbackResult,
  type VersionComparison,
  type VersionHistoryMetadata,
} from "./config/ConfigVersionHistory.js";

// Resource Optimization
export {
  type BenchmarkResult,
  type CPUStats,
  getResourceOptimizer,
  type MemoryStats,
  resetResourceOptimizer,
  ResourceOptimizer,
  type ResourceThresholds,
} from "./ResourceOptimizer.js";

// Performance Monitoring
export {
  getPerformanceMonitor,
  type PerformanceAlert,
  type PerformanceMetrics,
  PerformanceMonitor,
  type PerformanceMonitorConfig,
  resetPerformanceMonitor,
  type ScalingRecommendation,
} from "./PerformanceMonitor.js";

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
} from "./LoadBalancer.js";

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
} from "./ServiceDiscovery.js";

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
} from "./DistributedStateManager.js";

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
} from "./NetworkOptimizer.js";

// Messaging
export {
  getNatsClient,
  NatsClient,
  type NatsConfig,
  TitanSubject,
} from "./messaging/NatsClient.js";

export { SignalClient } from "./messaging/SignalClient.js";

export { ExecutionClient } from "./messaging/ExecutionClient.js";

// Policy Handshake (P0 Brain-Execution Verification)
export {
  POLICY_HASH_REQUEST_SUBJECT,
  type PolicyHandshakeResult,
  type PolicyHashResponse,
  requestExecutionPolicyHash,
  verifyExecutionPolicyHash,
} from "./messaging/PolicyHandshake.js";

// Power Law Configuration (Jan 2026 Audit Consolidation)
export {
  isPowerLawSymbol,
  POWER_LAW_FALLBACK_SYMBOL,
  POWER_LAW_SYMBOL_WHITELIST,
  type PowerLawSymbol,
} from "./config/powerlaw_symbols.js";

export {
  isStandardSubject,
  POWER_LAW_SUBJECTS,
  SUBJECT_MIGRATION_MAP,
} from "./messaging/powerlaw_subjects.js";

export { TITAN_SUBJECTS } from "./messaging/titan_subjects.js";
export { TITAN_STREAMS } from "./messaging/titan_streams.js";

// Specialized NATS configurations for venue telemetry and market data
export {
  getAllKvBucketNames,
  getAllStreamNames,
  getStreamForSubject,
  JsDiscardPolicy,
  JsRetentionPolicy,
  JsStorageType,
  TITAN_CONSUMERS,
  TITAN_KV_BUCKETS,
  TITAN_STREAMS as TITAN_VENUE_STREAMS,
  type TitanConsumerConfig,
  type TitanKvConfig,
  type TitanStreamConfig,
} from "./messaging/nats-streams.js";

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
} from "./logger/Logger.js";

export {
  LogEntry as SharedLogEntry,
  Logger,
  LoggerConfig,
  PerformanceTimer,
  TradeLogEntry,
};

// Risk and Truth Types
export { RiskState } from "./types/RiskState.js";
export * from "./types/budget.js";
export * from "./types/truth.js";
export * from "./schemas/market-trade.js";
export * from "./schemas/orderbook.js";
export * from "./schemas/venue-status.js";
export * from "./schemas/venue-config.js";
export * from "./types/Phase.js";

export const SharedLogLevel = LogLevel;
export type SharedLogLevel = LogLevel;

// Time Utilities
export * from "./utils/time/Clock.js";

// Governance
export * from "./governance/types.js";
export * from "./governance/crypto.js";
export {
  DefaultRiskPolicyV1,
  getCanonicalRiskPolicy,
  RiskPolicySchemaV1,
  type RiskPolicyV1,
} from "./schemas/RiskPolicy.js";

export {
  SystemState,
  SystemStateSchema,
  type SystemStatus,
} from "./schemas/SystemState.js";

export {
  type ExecutionReport,
  ExecutionReportSchema,
} from "./schemas/ExecutionReportSchema.js";

// Regulatory Compliance
export {
  DoraIncident,
  DoraIncidentClassification,
  DoraIncidentSchema,
  DoraIncidentStatus,
} from "./schemas/DoraIncident.js";

export * from "./ai/index.js";

export { type DliMessage, DliSchema } from "./schemas/dlq.js";

// Coordination
export {
  LeaderElector,
  type LeaderElectorConfig,
} from "./coordination/LeaderElector.js";

// Operator Actions
export {
  type OperatorAction,
  OperatorActionSchema,
  type OperatorActionType,
  OperatorActionTypeEnum,
} from "./schemas/OperatorAction.js";

// Canonical Fee Schedule
export {
  DEFAULT_FEE_SCHEDULE,
  type ExchangeFeeConfig,
  ExchangeFeeConfigSchema,
  type FeeSchedule,
  FeeScheduleSchema,
  type FeeTier,
  FeeTierSchema,
  getCanonicalFeeSchedule,
} from "./schemas/FeeSchedule.js";

// Canonical Power Law Metrics (Jan 2026)
export {
  type HealthStatus,
  HealthStatusSchema,
  type PowerLawMetricsLegacy,
  PowerLawMetricsSchemaV1,
  type PowerLawMetricsV1,
  type TailMethod,
  TailMethodSchema,
  upgradeToV1,
  type VolClusterState,
  VolClusterStateSchema,
} from "./schemas/PowerLawMetrics.js";

// Execution Constraints (Jan 2026)
export {
  type CancelOnBurst,
  CancelOnBurstSchema,
  type ConstraintLimits,
  ConstraintLimitsSchema,
  type ConstraintOrigin,
  ConstraintOriginSchema,
  type ConstraintProvenance,
  ConstraintProvenanceSchema,
  ExecutionConstraintsSchemaV1,
  type ExecutionConstraintsV1,
  type ExecutionProfile,
  ExecutionProfileSchema,
  getDefensiveConstraints,
  isConstraintValid,
  type PolicyMode,
  PolicyModeSchema,
  type RiskMode,
  RiskModeSchema,
  type SlicingProfile,
  SlicingProfileSchema,
  type TifProfile,
  TifProfileSchema,
  type TifType,
  TifTypeSchema,
} from "./schemas/ExecutionConstraints.js";

// Power Law Impact Events (Jan 2026)
export {
  createNoChangeImpact,
  type ImpactAction,
  ImpactActionSchema,
  PowerLawImpactSchemaV1,
  type PowerLawImpactV1,
} from "./schemas/PowerLawImpact.js";

// Observability
export { TITAN_SEMANTICS } from "./observability/SemanticConventions.js";
export {
  type ComponentHealth,
  type HealthCheckResult,
  HealthMonitor,
  type HealthStatus as MonitorHealthStatus,
} from "./observability/Health.js";
export {
  metrics,
  MetricsCollector,
  type MetricTag,
  type MetricValue,
} from "./observability/Metrics.js";

// Execution Quality
export {
  type ExecutionQualityEvent,
  ExecutionQualityEventSchema,
  type ExecutionQualityScore,
  ExecutionQualityScoreSchema,
  TITAN_QUALITY_TOPIC,
} from "./schemas/ExecutionQuality.js";

// Venue Types and Telemetry (Feb 2026)
export {
  ALL_VENUE_IDS,
  DEFAULT_STALE_THRESHOLD_MS,
  InstrumentType,
  VENUE_CAPABILITIES,
  type VenueCapabilities,
  VenueId,
  VenueRecommendedAction,
  VenueWsState,
} from "./types/venues.js";

export {
  calculateStaleness,
  deriveRecommendedAction,
  parseVenueStatusV1,
  safeParseVenueStatusV1,
  VENUE_STATUS_SUBJECT,
  type VenueStatusV1,
  VenueStatusV1Schema,
} from "./schemas/venue-status.js";

// Market Trade Schema (Feb 2026)
export {
  type MarketTradeV1,
  MarketTradeV1Schema,
  parseMarketTradeV1,
  safeParseMarketTradeV1,
  type TakerSide,
  TakerSideSchema,
} from "./schemas/market-trade.js";

// Symbol Normalization Utilities (Feb 2026)
export {
  denormalizeSymbol,
  type NormalizedSymbol,
  normalizeSymbol,
} from "./utils/symbol-normalization.js";

// Ops Console Schemas (Feb 2026)
export {
  OpsCommandSchemaV1,
  OpsCommandType,
  type OpsCommandV1,
} from "./schemas/ops-command.js";

export {
  OpsReceiptSchemaV1,
  OpsReceiptStatus,
  type OpsReceiptV1,
} from "./schemas/ops-receipt.js";

export {
  EvidencePackManifestSchemaV1,
  type EvidencePackManifestV1,
} from "./schemas/evidence-pack.js";

// Security (Feb 2026)
export {
  calculateOpsSignature,
  verifyOpsCommand,
} from "./security/ops-security.js";
