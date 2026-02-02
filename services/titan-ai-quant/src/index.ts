/**
 * Titan AI Quant - Entry Point
 *
 * Closed-loop parameter optimization engine using Gemini 3.0 Flash.
 * Analyzes trade logs, generates optimization proposals, and validates
 * through backtesting before presenting to the user for approval.
 */

export { GeminiClient } from "./ai/GeminiClient.js";
export { RateLimiter } from "./ai/RateLimiter.js";
export { Journal } from "./ai/Journal.js";
export { StrategicMemory } from "./ai/StrategicMemory.js";
export { TitanAnalyst } from "./ai/TitanAnalyst.js";
export { Guardrails, PARAMETER_BOUNDS } from "./ai/Guardrails.js";
export {
  type ApprovalResult,
  ApprovalWorkflow,
  type ApprovalWorkflowOptions,
  type RejectionResult,
} from "./ai/ApprovalWorkflow.js";
export {
  type ABTestConfig,
  type ABTestResult,
  type PerformanceFeedback,
  RealTimeOptimizer,
  type RealTimeOptimizerConfig,
} from "./ai/RealTimeOptimizer.js";
export {
  type CorrelationAnalysis,
  type MarketRegime,
  PredictiveAnalytics,
  type PredictiveAnalyticsConfig,
  type RiskAdjustment,
  type StrategyPrediction,
  type VolatilityPrediction,
} from "./ai/PredictiveAnalytics.js";
export {
  type AdaptiveRiskConfig,
  type AIIntegrationStatus,
  EnhancedAIIntegration,
  type EnhancedAIIntegrationConfig,
  type StrategySelection,
} from "./ai/EnhancedAIIntegration.js";
export {
  Backtester,
  type BacktestOptions,
  type BacktestWarning,
  type ExtendedBacktestResult,
} from "./simulation/Backtester.js";
export { LatencyModel } from "./simulation/LatencyModel.js";
export { NightlyOptimize } from "./cron/NightlyOptimize.js";

// Error handling utilities
export {
  type BackoffConfig,
  calculateBackoffDelay,
  classifyError,
  ErrorCode,
  ErrorLogger,
  type ErrorLoggerConfig,
  getErrorLogger,
  getUserFriendlyMessage,
  isRetryableError,
  logError,
  TitanError,
  withErrorLogging,
  withFallback,
  withRetry,
} from "./utils/ErrorHandler.js";

// Re-export types
export * from "./types/index.js";
