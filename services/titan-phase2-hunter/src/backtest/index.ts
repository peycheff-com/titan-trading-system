/**
 * Backtest Module Exports
 * 
 * Exports all backtesting components for Titan Phase 2 - The Hunter
 */

export { 
  BacktestEngine,
  type BacktestConfig,
  type BacktestResults,
  type BacktestTrade,
  type BacktestMetrics,
  type SlippageModel,
  type FeeModel,
  type EquityPoint,
  type DrawdownPoint,
  type LosingPeriod,
  type MarketConditionAnalysis
} from './BacktestEngine';

export {
  ForwardTestMode,
  type ForwardTestConfig as ForwardTestModeConfig,
  type ForwardTestResults,
  type ForwardTestMetrics,
  type PaperTrade,
  type BacktestComparison
} from './ForwardTestMode';