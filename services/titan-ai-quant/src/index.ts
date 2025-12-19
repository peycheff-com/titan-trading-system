/**
 * Titan AI Quant - Entry Point
 * 
 * Closed-loop parameter optimization engine using Gemini 1.5 Flash.
 * Analyzes trade logs, generates optimization proposals, and validates
 * through backtesting before presenting to the user for approval.
 */

export { GeminiClient } from './ai/GeminiClient.js';
export { RateLimiter } from './ai/RateLimiter.js';
export { Journal } from './ai/Journal.js';
export { StrategicMemory } from './ai/StrategicMemory.js';
export { TitanAnalyst } from './ai/TitanAnalyst.js';
export { Guardrails, PARAMETER_BOUNDS } from './ai/Guardrails.js';
export { ApprovalWorkflow, type ApprovalWorkflowOptions, type ApprovalResult, type RejectionResult } from './ai/ApprovalWorkflow.js';
export { RealTimeOptimizer, type RealTimeOptimizerConfig, type PerformanceFeedback, type ABTestConfig, type ABTestResult } from './ai/RealTimeOptimizer.js';
export { PredictiveAnalytics, type PredictiveAnalyticsConfig, type MarketRegime, type VolatilityPrediction, type CorrelationAnalysis, type StrategyPrediction, type RiskAdjustment } from './ai/PredictiveAnalytics.js';
export { EnhancedAIIntegration, type EnhancedAIIntegrationConfig, type StrategySelection, type AdaptiveRiskConfig, type AIIntegrationStatus } from './ai/EnhancedAIIntegration.js';
export { Backtester, type BacktestOptions, type BacktestWarning, type ExtendedBacktestResult } from './simulation/Backtester.js';
export { LatencyModel } from './simulation/LatencyModel.js';
export { NightlyOptimize } from './cron/NightlyOptimize.js';

// Console UI components
export { AIAdvisor, type AIAdvisorProps } from './console/AIAdvisor.js';
export { ProposalCard, type ProposalCardProps } from './console/ProposalCard.js';
export { TrapMonitorWithAI, type TrapMonitorWithAIProps } from './console/TrapMonitorWithAI.js';
export { ChatInterface, type ChatInterfaceProps, type ChatMessage, type ChatCommand, parseCommand, extractSymbolFromOptimizeCommand } from './console/ChatInterface.js';
export { EnhancedAIConsole } from './console/EnhancedAIConsole.js';

// Error handling utilities
export {
  TitanError,
  ErrorCode,
  ErrorLogger,
  getUserFriendlyMessage,
  calculateBackoffDelay,
  withRetry,
  isRetryableError,
  classifyError,
  getErrorLogger,
  logError,
  withErrorLogging,
  withFallback,
  type BackoffConfig,
  type ErrorLoggerConfig,
} from './utils/ErrorHandler.js';

// Re-export types
export * from './types/index.js';
