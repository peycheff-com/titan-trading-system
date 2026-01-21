/**
 * Titan Brain Types - Barrel Export
 */

// Allocation types
export {
  AllocationEngineConfig,
  AllocationRecord,
  AllocationVector,
  EquityTier,
  LeverageCaps,
  TransitionPoints,
} from './allocation.js';

// Performance types
export {
  ExecutionReport,
  PerformanceRecord,
  PerformanceTrackerConfig,
  PhaseId,
  PhasePerformance,
  TradeRecord,
} from './performance.js';

// Risk types
export {
  IntentSignal,
  Position,
  PowerLawMetrics,
  RiskDecision,
  RiskGuardianConfig,
  RiskGuardianState,
  RiskMetrics,
  RiskSnapshot,
} from './risk.js';

// Capital types
export {
  CapitalFlowConfig,
  SweepDecision,
  SweepResult,
  TreasuryOperation,
  TreasuryStatus,
} from './capital.js';

// Breaker types
export {
  BreakerAction,
  BreakerCheckInput,
  BreakerEvent,
  BreakerStatus,
  BreakerType,
  CircuitBreakerConfig,
} from './breaker.js';

// Brain types
export {
  ActiveInferenceConfig,
  BrainConfig,
  BrainDecision,
  DashboardData,
  DecisionRecord,
  HealthStatus,
  QueuedSignal,
} from './brain.js';

// Market types
export { MarketSignal, SignalType } from './market.js';

// Execution types
// Execution types
export {
  ExchangeBalance,
  ExecutionEngineClient,
  ExecutionEngineConfig,
  ExecutionPosition,
  FillConfirmation,
} from './execution.js';

// Reconciliation types
// Reconciliation types
export {
  DriftEvent,
  MismatchDetail,
  MismatchSeverity,
  ReconciliationReport,
  ReconciliationRun,
  ReconciliationStats,
  ReconciliationType,
  TruthConfidence,
} from './reconciliation.js';

// Config types
export {
  DatabaseConfig,
  EnvConfig,
  HmacConfig,
  NotificationConfig,
  ReconciliationConfig,
  RedisConfig,
  ServerConfig,
  TitanBrainConfig,
} from './config.js';
