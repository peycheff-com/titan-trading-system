/**
 * AI Module Exports
 */

export { GeminiClient } from './GeminiClient.js';
export { RateLimiter } from './RateLimiter.js';
export { Journal } from './Journal.js';
export { StrategicMemory } from './StrategicMemory.js';
export { TitanAnalyst } from './TitanAnalyst.js';
export { Guardrails, PARAMETER_BOUNDS } from './Guardrails.js';
export {
  type ApprovalResult,
  ApprovalWorkflow,
  type ApprovalWorkflowOptions,
  type RejectionResult,
} from './ApprovalWorkflow.js';
export {
  OptimizationWorkflow,
  type WorkflowConfig,
  type WorkflowResult,
} from './OptimizationWorkflow.js';
export {
  type ABTestConfig,
  type ABTestResult,
  type PerformanceFeedback,
  RealTimeOptimizer,
  type RealTimeOptimizerConfig,
} from './RealTimeOptimizer.js';
export {
  type CorrelationAnalysis,
  type MarketRegime,
  PredictiveAnalytics,
  type PredictiveAnalyticsConfig,
  type RiskAdjustment,
  type StrategyPrediction,
  type VolatilityPrediction,
} from './PredictiveAnalytics.js';
export {
  type AdaptiveRiskConfig,
  type AIIntegrationStatus,
  EnhancedAIIntegration,
  type EnhancedAIIntegrationConfig,
  type StrategySelection,
} from './EnhancedAIIntegration.js';
