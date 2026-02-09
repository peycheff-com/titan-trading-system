/**
 * Browser-safe entry point for @titan/shared
 * Exports ONLY modules that do not depend on Node.js built-ins (fs, crypto, net, etc.)
 */

// WebSocket Management (Assumes native WebSocket in browser or isomorphic ws)
export {
    type ConnectionStatus,
    getWebSocketManager,
    resetWebSocketManager,
    type SubscriptionCallback,
    type WebSocketConfig,
    WebSocketManager,
    type WebSocketMessage,
  } from './WebSocketManager.js';
  
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
  } from './config/ConfigSchema.js';
  
  // Resource Optimization (uses perf_hooks, v8, os - NOT BROWSER SAFE)
  /*
  export {
    type BenchmarkResult,
    type CPUStats,
    getResourceOptimizer,
    type MemoryStats,
    resetResourceOptimizer,
    ResourceOptimizer,
    type ResourceThresholds,
  } from './ResourceOptimizer.js';
  */

  // Performance Monitoring (uses perf_hooks? Check if safe, assuming unsafe for now)
  /*
  export {
    getPerformanceMonitor,
    type PerformanceAlert,
    type PerformanceMetrics,
    PerformanceMonitor,
    type PerformanceMonitorConfig,
    resetPerformanceMonitor,
    type ScalingRecommendation,
  } from './PerformanceMonitor.js';
  */

  // Load Balancing (uses http, https, url - NOT BROWSER SAFE)
  /*
  export {
    type BackendServer,
    DEFAULT_LOAD_BALANCER_CONFIG,
    LoadBalancer,
    type LoadBalancerConfig,
    type LoadBalancingAlgorithm,
    type LoadBalancingMetrics,
    type RoutingInfo,
    type ServerHealth,
  } from './LoadBalancer.js';
  */
  
  // Service Discovery (uses crypto - NOT BROWSER SAFE)
  /*
  export {
    DEFAULT_SERVICE_DISCOVERY_CONFIG,
    getServiceDiscovery,
    resetServiceDiscovery,
    ServiceDiscovery,
    type ServiceDiscoveryConfig,
    type ServiceEvent,
    type ServiceInstance,
    type ServiceQuery,
  } from './ServiceDiscovery.js';
  */
  
  // Distributed State Management (uses crypto - NOT BROWSER SAFE)
  /*
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
  } from './DistributedStateManager.js';
  */

  // Network Optimization (uses perf_hooks - NOT BROWSER SAFE)
  /*
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
  } from './NetworkOptimizer.js';
  */
  
  // Power Law Configuration
  export {
    isPowerLawSymbol,
    POWER_LAW_FALLBACK_SYMBOL,
    POWER_LAW_SYMBOL_WHITELIST,
    type PowerLawSymbol,
  } from './config/powerlaw_symbols.js';
  
  export {
    isStandardSubject,
    POWER_LAW_SUBJECTS,
    SUBJECT_MIGRATION_MAP,
  } from './messaging/powerlaw_subjects.js';
  
  export { TITAN_SUBJECTS } from './messaging/titan_subjects.js';
  export { TITAN_STREAMS } from './messaging/titan_streams.js';
  
  // Specialized NATS configurations
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
  } from './messaging/nats-streams.js';
  
  // Intent schema (Browser Safe)
  export {
    createIntentMessage,
    type IntentMessage,
    IntentPayloadSchemaV1,
    type IntentPayloadV1,
    IntentStatusEnum,
    IntentTypeEnum,
    validateIntentPayload,
  } from './schemas/intentSchema.js';
  
  // Canonical Envelopes
  export { createEnvelope, type Envelope, EnvelopeSchema } from './schemas/envelope.js';
  
  export { type BaseCommand, BaseCommandSchema, type BaseEvent } from './schemas/base.js';
  
  // Risk and Truth Types
  export { RiskState } from './types/RiskState.js';
  export * from './types/budget.js';
  export * from './types/truth.js';
  export * from './schemas/market-trade.js';
  export * from './schemas/orderbook.js';
  export * from './schemas/venue-status.js';
  export * from './schemas/venue-config.js';
  export * from './types/Phase.js';
  
  // Constants
  export const SharedLogLevel = {
      DEBUG: 'debug',
      INFO: 'info',
      WARN: 'warn',
      ERROR: 'error'
  } as const;
  export type SharedLogLevel = typeof SharedLogLevel[keyof typeof SharedLogLevel];
  
  // Time Utilities
  export * from './utils/time/Clock.js';
  
  // Governance
  export * from './governance/types.js';
  // Check crypto.ts - if it uses node crypto, exclude it or polyfill
  // export * from './governance/crypto.js'; // Excluded for safety

  // Risk Policy (uses crypto/json - unsafe unless verified)
  /*
  export {
    DefaultRiskPolicyV1,
    getCanonicalRiskPolicy,
    RiskPolicySchemaV1,
    type RiskPolicyV1,
  } from './schemas/RiskPolicy.js';
  */
  
  export { SystemState, SystemStateSchema, type SystemStatus } from './schemas/SystemState.js';
  
  export { type ExecutionReport, ExecutionReportSchema } from './schemas/ExecutionReportSchema.js';
  
  // Regulatory Compliance
  export {
    DoraIncident,
    DoraIncidentClassification,
    DoraIncidentSchema,
    DoraIncidentStatus,
  } from './schemas/DoraIncident.js';
  
  // AI (Check if safe)
  // export * from './ai/index.js'; // Excluded to be safe, likely unused in console for now

  // Notification Types
  export * from './types/notification.js';
  
  export { type DliMessage, DliSchema } from './schemas/dlq.js';
  
  // Coordination (LeaderElector might use NATS which is Node-heavy? Check deps)
  // export { LeaderElector, type LeaderElectorConfig } from './coordination/LeaderElector.js';
  
  // Operator Actions
  export {
    type OperatorAction,
    OperatorActionSchema,
    type OperatorActionType,
    OperatorActionTypeEnum,
  } from './schemas/OperatorAction.js';
  
  // Operator Intent (Browser Safe Types via operatorIntentTypes)
  export {
    buildPermissionMatrix,
    DANGER_LEVEL,
    DEFAULT_TTL,
    IntentReceiptSchema,
    type IntentReceipt,
    isTerminalStatus,
    MAX_TTL,
    type OperatorIntentRecord,
    OperatorIntentSchemaV1,
    OperatorIntentStatusEnum,
    type OperatorIntentStatus,
    type OperatorIntentSummary,
    OperatorIntentTypeEnum,
    type OperatorIntentType,
    type OperatorIntentV1,
    type OperatorRole,
    type OperatorState,
    type PermissionMatrix,
    type PhaseStatus,
    REQUIRES_APPROVAL,
    ROLE_ALLOWED_INTENTS,
    TERMINAL_STATUSES,
    validateOperatorIntent,
   // Note: verifyIntentSignature and calculateIntentSignature are EXCLUDED as they require Node crypto
  } from './schemas/operatorIntentTypes.js';
  
  // Canonical Fee Schedule (uses crypto - unsafe)
  /*
  export {
    DEFAULT_FEE_SCHEDULE,
    type ExchangeFeeConfig,
    ExchangeFeeConfigSchema,
    type FeeSchedule,
    FeeScheduleSchema,
    type FeeTier,
    FeeTierSchema,
    getCanonicalFeeSchedule,
  } from './schemas/FeeSchedule.js';
  */
  
  // Canonical Power Law Metrics
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
  } from './schemas/PowerLawMetrics.js';
  
  // Execution Constraints
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
  } from './schemas/ExecutionConstraints.js';
  
  // Power Law Impact Events
  export {
    createNoChangeImpact,
    type ImpactAction,
    ImpactActionSchema,
    PowerLawImpactSchemaV1,
    type PowerLawImpactV1,
  } from './schemas/PowerLawImpact.js';
  
  // Observability
  export { TITAN_SEMANTICS } from './observability/SemanticConventions.js';
  /*
  export {
    type ComponentHealth,
    type HealthCheckResult,
    HealthMonitor,
    type HealthStatus as MonitorHealthStatus,
  } from './observability/Health.js';
  export {
    metrics,
    MetricsCollector,
    type MetricTag,
    type MetricValue,
  } from './observability/Metrics.js';
  */ // Metrics usually use Node stuff? Check. Assuming unsafe.
  
  // Execution Quality
  export {
    type ExecutionQualityEvent,
    ExecutionQualityEventSchema,
    type ExecutionQualityScore,
    ExecutionQualityScoreSchema,
    TITAN_QUALITY_TOPIC,
  } from './schemas/ExecutionQuality.js';
  
  // Venue Types and Telemetry
  export {
    ALL_VENUE_IDS,
    DEFAULT_STALE_THRESHOLD_MS,
    InstrumentType,
    VENUE_CAPABILITIES,
    type VenueCapabilities,
    VenueId,
    VenueRecommendedAction,
    VenueWsState,
  } from './types/venues.js';
  
  export {
    calculateStaleness,
    deriveRecommendedAction,
    parseVenueStatusV1,
    safeParseVenueStatusV1,
    VENUE_STATUS_SUBJECT,
    type VenueStatusV1,
    VenueStatusV1Schema,
  } from './schemas/venue-status.js';
  
  // Market Trade Schema
  export {
    type MarketTradeV1,
    MarketTradeV1Schema,
    parseMarketTradeV1,
    safeParseMarketTradeV1,
    type TakerSide,
    TakerSideSchema,
  } from './schemas/market-trade.js';
  
  // Symbol Normalization Utilities
  export {
    denormalizeSymbol,
    type NormalizedSymbol,
    normalizeSymbol,
  } from './utils/symbol-normalization.js';
  
  // Ops Console Schemas
  export { OpsCommandSchemaV1, OpsCommandType, type OpsCommandV1 } from './schemas/ops-command.js';
  
  export { OpsReceiptSchemaV1, OpsReceiptStatus, type OpsReceiptV1 } from './schemas/ops-receipt.js';
  
  export {
    EvidencePackManifestSchemaV1,
    type EvidencePackManifestV1,
  } from './schemas/evidence-pack.js'; 
