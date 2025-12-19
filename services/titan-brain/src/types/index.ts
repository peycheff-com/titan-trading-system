/**
 * Titan Brain Types - Barrel Export
 */

// Allocation types
export {
  EquityTier,
  AllocationVector,
  AllocationRecord,
  LeverageCaps,
  TransitionPoints,
  AllocationEngineConfig,
} from './allocation.js';

// Performance types
export {
  PhaseId,
  TradeRecord,
  PhasePerformance,
  PerformanceTrackerConfig,
  PerformanceRecord,
} from './performance.js';

// Risk types
export {
  IntentSignal,
  Position,
  RiskMetrics,
  RiskDecision,
  RiskSnapshot,
  RiskGuardianConfig,
} from './risk.js';

// Capital types
export {
  SweepDecision,
  SweepResult,
  TreasuryStatus,
  TreasuryOperation,
  CapitalFlowConfig,
} from './capital.js';

// Breaker types
export {
  BreakerType,
  BreakerStatus,
  BreakerEvent,
  CircuitBreakerConfig,
  BreakerCheckInput,
} from './breaker.js';

// Brain types
export {
  BrainDecision,
  DecisionRecord,
  DashboardData,
  HealthStatus,
  QueuedSignal,
  BrainConfig,
} from './brain.js';

// Config types
export {
  DatabaseConfig,
  RedisConfig,
  ServerConfig,
  HmacConfig,
  NotificationConfig,
  TitanBrainConfig,
  EnvConfig,
} from './config.js';
