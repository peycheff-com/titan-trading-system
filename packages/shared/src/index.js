/**
 * Shared Infrastructure Components for Titan Trading System
 *
 * This module exports all shared infrastructure components that can be used
 * across different Titan services for centralized management.
 */
import { loadSecretsFromFiles } from './config/loadSecrets.js';
// Ensure *_FILE secrets are promoted to env early in service startup.
loadSecretsFromFiles();
// WebSocket Management
export { getWebSocketManager, resetWebSocketManager, WebSocketManager, } from './WebSocketManager.js';
// Telemetry Service
export { getTelemetryService, resetTelemetryService, TelemetryService, } from './TelemetryService.js';
// Configuration Management
export { ConfigManager, getConfigManager, resetConfigManager, } from './ConfigManager.js';
// Configuration Schema and Validation
export { BrainConfigSchema, ConfigValidator, PhaseConfigBaseSchema, PhaseConfigSchema, } from './config/ConfigSchema.js';
// Secrets (Docker secrets / Vault file mounts)
export { loadSecretsFromFiles } from './config/loadSecrets.js';
// Hierarchical Configuration Loading
export { createConfigLoader, HierarchicalConfigLoader, } from './config/HierarchicalConfigLoader.js';
// Configuration Encryption
export { ConfigEncryption, getConfigEncryption, resetConfigEncryption, } from './config/ConfigEncryption.js';
// Hot-Reload Configuration Management
export { createHotReloadConfigManager, HotReloadConfigManager, } from './config/HotReloadConfigManager.js';
// Configuration Version History
export { ConfigVersionHistory, getConfigVersionHistory, resetConfigVersionHistory, } from './config/ConfigVersionHistory.js';
// Resource Optimization
export { getResourceOptimizer, resetResourceOptimizer, ResourceOptimizer, } from './ResourceOptimizer.js';
// Performance Monitoring
export { getPerformanceMonitor, PerformanceMonitor, resetPerformanceMonitor, } from './PerformanceMonitor.js';
// Load Balancing
export { DEFAULT_LOAD_BALANCER_CONFIG, LoadBalancer, } from './LoadBalancer.js';
// Service Discovery
export { DEFAULT_SERVICE_DISCOVERY_CONFIG, getServiceDiscovery, resetServiceDiscovery, ServiceDiscovery, } from './ServiceDiscovery.js';
// Distributed State Management
export { DEFAULT_DISTRIBUTED_STATE_CONFIG, DistributedStateManager, getDistributedStateManager, resetDistributedStateManager, } from './DistributedStateManager.js';
// Network Optimization
export { DEFAULT_NETWORK_OPTIMIZER_CONFIG, getNetworkOptimizer, NetworkOptimizer, resetNetworkOptimizer, } from './NetworkOptimizer.js';
// Messaging
export { getNatsClient, NatsClient, TitanSubject, } from './messaging/NatsClient.js';
export { SignalClient } from './messaging/SignalClient.js';
export { ExecutionClient } from './messaging/ExecutionClient.js';
// Policy Handshake (P0 Brain-Execution Verification)
export { POLICY_HASH_REQUEST_SUBJECT, requestExecutionPolicyHash, verifyExecutionPolicyHash, } from './messaging/PolicyHandshake.js';
// Power Law Configuration (Jan 2026 Audit Consolidation)
export { isPowerLawSymbol, POWER_LAW_FALLBACK_SYMBOL, POWER_LAW_SYMBOL_WHITELIST, } from './config/powerlaw_symbols.js';
export { isStandardSubject, POWER_LAW_SUBJECTS, SUBJECT_MIGRATION_MAP, } from './messaging/powerlaw_subjects.js';
export { TITAN_SUBJECTS } from './messaging/titan_subjects.js';
export { TITAN_STREAMS } from './messaging/titan_streams.js';
// Specialized NATS configurations for venue telemetry and market data
export { getAllKvBucketNames, getAllStreamNames, getStreamForSubject, JsDiscardPolicy, JsRetentionPolicy, JsStorageType, TITAN_CONSUMERS, TITAN_KV_BUCKETS, TITAN_STREAMS as TITAN_VENUE_STREAMS, } from './messaging/nats-streams.js';
// Intent schema (NATS contract)
export { createIntentMessage, IntentPayloadSchemaV1, IntentStatusEnum, IntentTypeEnum, validateIntentPayload, } from './schemas/intentSchema.js';
// Canonical Envelopes
export { createEnvelope, EnvelopeSchema } from './schemas/envelope.js';
export { BaseCommandSchema } from './schemas/base.js';
// IPC (Fast Path Communication)
export { ConnectionState, FastPathClient, RegimeState, } from './ipc/index.js';
// Logger
import { Logger, LogLevel, } from './logger/Logger.js';
export { Logger };
// Risk and Truth Types
export { RiskState } from './types/RiskState.js';
export * from './types/budget.js';
export * from './types/truth.js';
export * from './schemas/market-trade.js';
export * from './schemas/orderbook.js';
export * from './schemas/venue-status.js';
export * from './schemas/venue-config.js';
export * from './types/Phase.js';
export const SharedLogLevel = LogLevel;
// Time Utilities
export * from './utils/time/Clock.js';
// Governance
export * from './governance/types.js';
export * from './governance/crypto.js';
export { DefaultRiskPolicyV1, getCanonicalRiskPolicy, RiskPolicySchemaV1, } from './schemas/RiskPolicy.js';
export { SystemState, SystemStateSchema } from './schemas/SystemState.js';
export { ExecutionReportSchema } from './schemas/ExecutionReportSchema.js';
// Regulatory Compliance
export { DoraIncidentClassification, DoraIncidentSchema, DoraIncidentStatus, } from './schemas/DoraIncident.js';
export * from './ai/index.js';
export { DliSchema } from './schemas/dlq.js';
// Coordination
export { LeaderElector } from './coordination/LeaderElector.js';
// Operator Actions
export { OperatorActionSchema, OperatorActionTypeEnum, } from './schemas/OperatorAction.js';
// Canonical Fee Schedule
export { DEFAULT_FEE_SCHEDULE, ExchangeFeeConfigSchema, FeeScheduleSchema, FeeTierSchema, getCanonicalFeeSchedule, } from './schemas/FeeSchedule.js';
// Canonical Power Law Metrics (Jan 2026)
export { HealthStatusSchema, PowerLawMetricsSchemaV1, TailMethodSchema, upgradeToV1, VolClusterStateSchema, } from './schemas/PowerLawMetrics.js';
// Execution Constraints (Jan 2026)
export { CancelOnBurstSchema, ConstraintLimitsSchema, ConstraintOriginSchema, ConstraintProvenanceSchema, ExecutionConstraintsSchemaV1, ExecutionProfileSchema, getDefensiveConstraints, isConstraintValid, PolicyModeSchema, RiskModeSchema, SlicingProfileSchema, TifProfileSchema, TifTypeSchema, } from './schemas/ExecutionConstraints.js';
// Power Law Impact Events (Jan 2026)
export { createNoChangeImpact, ImpactActionSchema, PowerLawImpactSchemaV1, } from './schemas/PowerLawImpact.js';
// Observability
export { TITAN_SEMANTICS } from './observability/SemanticConventions.js';
export { HealthMonitor, } from './observability/Health.js';
export { metrics, MetricsCollector, } from './observability/Metrics.js';
// Execution Quality
export { ExecutionQualityEventSchema, ExecutionQualityScoreSchema, TITAN_QUALITY_TOPIC, } from './schemas/ExecutionQuality.js';
// Venue Types and Telemetry (Feb 2026)
export { ALL_VENUE_IDS, DEFAULT_STALE_THRESHOLD_MS, InstrumentType, VENUE_CAPABILITIES, VenueId, VenueRecommendedAction, VenueWsState, } from './types/venues.js';
export { calculateStaleness, deriveRecommendedAction, parseVenueStatusV1, safeParseVenueStatusV1, VENUE_STATUS_SUBJECT, VenueStatusV1Schema, } from './schemas/venue-status.js';
// Market Trade Schema (Feb 2026)
export { MarketTradeV1Schema, parseMarketTradeV1, safeParseMarketTradeV1, TakerSideSchema, } from './schemas/market-trade.js';
// Symbol Normalization Utilities (Feb 2026)
export { denormalizeSymbol, normalizeSymbol, } from './utils/symbol-normalization.js';
// Ops Console Schemas (Feb 2026)
export { OpsCommandSchemaV1, OpsCommandType } from './schemas/ops-command.js';
export { OpsReceiptSchemaV1, OpsReceiptStatus } from './schemas/ops-receipt.js';
export { EvidencePackManifestSchemaV1, } from './schemas/evidence-pack.js';
// Security (Feb 2026)
export { calculateOpsSignature, verifyOpsCommand } from './security/ops-security.js';
//# sourceMappingURL=index.js.map