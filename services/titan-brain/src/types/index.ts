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
} from "./allocation.js";

// Performance types
export {
  ExecutionReport,
  PerformanceRecord,
  PerformanceTrackerConfig,
  PhaseId,
  PhasePerformance,
  TradeRecord,
} from "./performance.js";

// Risk types
export {
  IntentSignal,
  Position,
  RiskDecision,
  RiskGuardianConfig,
  RiskMetrics,
  RiskSnapshot,
} from "./risk.js";

// Capital types
export {
  CapitalFlowConfig,
  SweepDecision,
  SweepResult,
  TreasuryOperation,
  TreasuryStatus,
} from "./capital.js";

// Breaker types
export {
  BreakerCheckInput,
  BreakerEvent,
  BreakerStatus,
  BreakerType,
  CircuitBreakerConfig,
} from "./breaker.js";

// Brain types
export {
  BrainConfig,
  BrainDecision,
  DashboardData,
  DecisionRecord,
  HealthStatus,
  QueuedSignal,
} from "./brain.js";

// Config types
export {
  DatabaseConfig,
  EnvConfig,
  HmacConfig,
  NotificationConfig,
  RedisConfig,
  ServerConfig,
  TitanBrainConfig,
} from "./config.js";
