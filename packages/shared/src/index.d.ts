/**
 * Shared Infrastructure Components for Titan Trading System
 *
 * This module exports all shared infrastructure components that can be used
 * across different Titan services for centralized management.
 */
export { type ConnectionStatus, getWebSocketManager, resetWebSocketManager, type SubscriptionCallback, type WebSocketConfig, WebSocketManager, type WebSocketMessage, } from './WebSocketManager.js';
export { type ExecutionData, getTelemetryService, type LogEntry, type LogLevel, type MetricData, resetTelemetryService, type SignalData, type TelemetryConfig, TelemetryService, } from './TelemetryService.js';
export { type BrainConfig, type ConfigChangeEvent, type ConfigLevel, ConfigManager, getConfigManager, type PhaseConfig, resetConfigManager, type ServiceConfig, } from './ConfigManager.js';
export { BrainConfigSchema, ConfigValidator, type DeploymentConfig, type Environment, type ExchangeConfig as SchemaExchangeConfig, type InfrastructureConfig, PhaseConfigBaseSchema, PhaseConfigSchema, type ValidationResult, } from './config/ConfigSchema.js';
export { loadSecretsFromFiles, type LoadSecretsOptions } from './config/loadSecrets.js';
export { type ConfigHierarchyOptions, type ConfigLoadResult, type ConfigSource, createConfigLoader, HierarchicalConfigLoader, } from './config/HierarchicalConfigLoader.js';
export { ConfigEncryption, type DecryptionResult, type EncryptedData, type EncryptionResult, getConfigEncryption, resetConfigEncryption, } from './config/ConfigEncryption.js';
export { type ChangeValidationResult, createHotReloadConfigManager, HotReloadConfigManager, type HotReloadEvent, type HotReloadOptions, } from './config/HotReloadConfigManager.js';
export { type ConfigVersion, ConfigVersionHistory, getConfigVersionHistory, resetConfigVersionHistory, type RollbackResult, type VersionComparison, type VersionHistoryMetadata, } from './config/ConfigVersionHistory.js';
export { type BenchmarkResult, type CPUStats, getResourceOptimizer, type MemoryStats, resetResourceOptimizer, ResourceOptimizer, type ResourceThresholds, } from './ResourceOptimizer.js';
export { getPerformanceMonitor, type PerformanceAlert, type PerformanceMetrics, PerformanceMonitor, type PerformanceMonitorConfig, resetPerformanceMonitor, type ScalingRecommendation, } from './PerformanceMonitor.js';
export { type BackendServer, DEFAULT_LOAD_BALANCER_CONFIG, LoadBalancer, type LoadBalancerConfig, type LoadBalancingAlgorithm, type LoadBalancingMetrics, type RoutingInfo, type ServerHealth, } from './LoadBalancer.js';
export { DEFAULT_SERVICE_DISCOVERY_CONFIG, getServiceDiscovery, resetServiceDiscovery, ServiceDiscovery, type ServiceDiscoveryConfig, type ServiceEvent, type ServiceInstance, type ServiceQuery, } from './ServiceDiscovery.js';
export { type ConflictResolutionStrategy, type ConsistencyLevel, DEFAULT_DISTRIBUTED_STATE_CONFIG, type DistributedStateConfig, DistributedStateManager, getDistributedStateManager, type NodeInfo, resetDistributedStateManager, type StateEntry, type StateOperation, } from './DistributedStateManager.js';
export { type CoLocationConfig, DEFAULT_NETWORK_OPTIMIZER_CONFIG, getNetworkOptimizer, type LatencyMeasurement, type NetworkEndpoint, type NetworkMetrics, NetworkOptimizer, type NetworkOptimizerConfig, type NetworkPath, resetNetworkOptimizer, } from './NetworkOptimizer.js';
export { getNatsClient, NatsClient, type NatsConfig, TitanSubject, } from './messaging/NatsClient.js';
export { SignalClient } from './messaging/SignalClient.js';
export { ExecutionClient } from './messaging/ExecutionClient.js';
export { POLICY_HASH_REQUEST_SUBJECT, type PolicyHandshakeResult, type PolicyHashResponse, requestExecutionPolicyHash, verifyExecutionPolicyHash, } from './messaging/PolicyHandshake.js';
export { isPowerLawSymbol, POWER_LAW_FALLBACK_SYMBOL, POWER_LAW_SYMBOL_WHITELIST, type PowerLawSymbol, } from './config/powerlaw_symbols.js';
export { isStandardSubject, POWER_LAW_SUBJECTS, SUBJECT_MIGRATION_MAP, } from './messaging/powerlaw_subjects.js';
export { TITAN_SUBJECTS } from './messaging/titan_subjects.js';
export { TITAN_STREAMS } from './messaging/titan_streams.js';
export { getAllKvBucketNames, getAllStreamNames, getStreamForSubject, JsDiscardPolicy, JsRetentionPolicy, JsStorageType, TITAN_CONSUMERS, TITAN_KV_BUCKETS, TITAN_STREAMS as TITAN_VENUE_STREAMS, type TitanConsumerConfig, type TitanKvConfig, type TitanStreamConfig, } from './messaging/nats-streams.js';
export { createIntentMessage, type IntentMessage, IntentPayloadSchemaV1, type IntentPayloadV1, IntentStatusEnum, IntentTypeEnum, validateIntentPayload, } from './schemas/intentSchema.js';
export { createEnvelope, type Envelope, EnvelopeSchema } from './schemas/envelope.js';
export { type BaseCommand, BaseCommandSchema, type BaseEvent } from './schemas/base.js';
export { type AbortResponse, type ConfirmResponse, ConnectionState, FastPathClient, type FillReport, type IntentSignal, type IPCClientConfig, type IPCMetrics, type PrepareResponse, RegimeState, type SignalSource, } from './ipc/index.js';
import { LogEntry, Logger, LoggerConfig, LogLevel, PerformanceTimer, TradeLogEntry } from './logger/Logger.js';
export { LogEntry as SharedLogEntry, Logger, LoggerConfig, PerformanceTimer, TradeLogEntry };
export { RiskState } from './types/RiskState.js';
export * from './types/budget.js';
export * from './types/truth.js';
export * from './schemas/market-trade.js';
export * from './schemas/orderbook.js';
export * from './schemas/venue-status.js';
export * from './schemas/venue-config.js';
export * from './types/Phase.js';
export declare const SharedLogLevel: typeof LogLevel;
export type SharedLogLevel = LogLevel;
export * from './utils/time/Clock.js';
export * from './governance/types.js';
export * from './governance/crypto.js';
export { DefaultRiskPolicyV1, getCanonicalRiskPolicy, RiskPolicySchemaV1, type RiskPolicyV1, } from './schemas/RiskPolicy.js';
export { SystemState, SystemStateSchema, type SystemStatus } from './schemas/SystemState.js';
export { type ExecutionReport, ExecutionReportSchema } from './schemas/ExecutionReportSchema.js';
export { DoraIncident, DoraIncidentClassification, DoraIncidentSchema, DoraIncidentStatus, } from './schemas/DoraIncident.js';
export * from './ai/index.js';
export { type DliMessage, DliSchema } from './schemas/dlq.js';
export { LeaderElector, type LeaderElectorConfig } from './coordination/LeaderElector.js';
export { type OperatorAction, OperatorActionSchema, type OperatorActionType, OperatorActionTypeEnum, } from './schemas/OperatorAction.js';
export { DEFAULT_FEE_SCHEDULE, type ExchangeFeeConfig, ExchangeFeeConfigSchema, type FeeSchedule, FeeScheduleSchema, type FeeTier, FeeTierSchema, getCanonicalFeeSchedule, } from './schemas/FeeSchedule.js';
export { type HealthStatus, HealthStatusSchema, type PowerLawMetricsLegacy, PowerLawMetricsSchemaV1, type PowerLawMetricsV1, type TailMethod, TailMethodSchema, upgradeToV1, type VolClusterState, VolClusterStateSchema, } from './schemas/PowerLawMetrics.js';
export { type CancelOnBurst, CancelOnBurstSchema, type ConstraintLimits, ConstraintLimitsSchema, type ConstraintOrigin, ConstraintOriginSchema, type ConstraintProvenance, ConstraintProvenanceSchema, ExecutionConstraintsSchemaV1, type ExecutionConstraintsV1, type ExecutionProfile, ExecutionProfileSchema, getDefensiveConstraints, isConstraintValid, type PolicyMode, PolicyModeSchema, type RiskMode, RiskModeSchema, type SlicingProfile, SlicingProfileSchema, type TifProfile, TifProfileSchema, type TifType, TifTypeSchema, } from './schemas/ExecutionConstraints.js';
export { createNoChangeImpact, type ImpactAction, ImpactActionSchema, PowerLawImpactSchemaV1, type PowerLawImpactV1, } from './schemas/PowerLawImpact.js';
export { TITAN_SEMANTICS } from './observability/SemanticConventions.js';
export { type ComponentHealth, type HealthCheckResult, HealthMonitor, type HealthStatus as MonitorHealthStatus, } from './observability/Health.js';
export { metrics, MetricsCollector, type MetricTag, type MetricValue, } from './observability/Metrics.js';
export { type ExecutionQualityEvent, ExecutionQualityEventSchema, type ExecutionQualityScore, ExecutionQualityScoreSchema, TITAN_QUALITY_TOPIC, } from './schemas/ExecutionQuality.js';
export { ALL_VENUE_IDS, DEFAULT_STALE_THRESHOLD_MS, InstrumentType, VENUE_CAPABILITIES, type VenueCapabilities, VenueId, VenueRecommendedAction, VenueWsState, } from './types/venues.js';
export { calculateStaleness, deriveRecommendedAction, parseVenueStatusV1, safeParseVenueStatusV1, VENUE_STATUS_SUBJECT, type VenueStatusV1, VenueStatusV1Schema, } from './schemas/venue-status.js';
export { type MarketTradeV1, MarketTradeV1Schema, parseMarketTradeV1, safeParseMarketTradeV1, type TakerSide, TakerSideSchema, } from './schemas/market-trade.js';
export { denormalizeSymbol, type NormalizedSymbol, normalizeSymbol, } from './utils/symbol-normalization.js';
export { OpsCommandSchemaV1, OpsCommandType, type OpsCommandV1 } from './schemas/ops-command.js';
export { OpsReceiptSchemaV1, OpsReceiptStatus, type OpsReceiptV1 } from './schemas/ops-receipt.js';
export { EvidencePackManifestSchemaV1, type EvidencePackManifestV1, } from './schemas/evidence-pack.js';
export { calculateOpsSignature, verifyOpsCommand } from './security/ops-security.js';
//# sourceMappingURL=index.d.ts.map